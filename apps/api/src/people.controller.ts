import {
  BadRequestException,
  Body,
  ConflictException,
  Controller,
  ForbiddenException,
  Get,
  NotFoundException,
  Param,
  Patch,
  Post,
  Req,
} from '@nestjs/common';
import { randomUUID } from 'node:crypto';
import { z } from 'zod';
import { AuthRequest, Roles } from './auth';
import { DatabaseService } from './database.service';
import { hashPassword } from './security';
import { email, employeeFields, parse, password, role } from './validation';

const employeeSelect = `SELECT u.id,u.name,u.email,u.role,u.active AS "accountActive",
  e.employee_number AS "employeeNumber",e.department,e.designation,e.phone,
  e.employment_type AS "employmentType",e.status,to_char(e.joining_date,'YYYY-MM-DD') AS "joiningDate",
  e.manager_id AS "managerId",manager.name AS "managerName"
  FROM users u JOIN employees e ON e.id=u.id LEFT JOIN users manager ON manager.id=e.manager_id`;

@Controller()
export class PeopleController {
  constructor(private readonly db: DatabaseService) {}

  @Get('employees')
  async list(@Req() request: AuthRequest) {
    const own = request.user.role === 'EMPLOYEE';
    return (
      await this.db.query(
        `${employeeSelect} ${own ? 'WHERE u.id=$1' : ''} ORDER BY e.employee_number`,
        own ? [request.user.id] : [],
      )
    ).rows;
  }

  @Roles('SUPER_ADMIN', 'ADMIN', 'HR')
  @Post('employees')
  async create(@Req() request: AuthRequest, @Body() body: unknown) {
    const input = parse(
      z.object({ ...employeeFields, email, password, role: role.default('EMPLOYEE') }).strict(),
      body,
    );
    const allowed =
      request.user.role === 'SUPER_ADMIN'
        ? ['SUPER_ADMIN', 'ADMIN', 'HR', 'EMPLOYEE']
        : request.user.role === 'ADMIN'
          ? ['HR', 'EMPLOYEE']
          : ['EMPLOYEE'];
    if (!allowed.includes(input.role)) throw new ForbiddenException('You cannot assign this role');
    const id = randomUUID();
    const hashed = await hashPassword(input.password);
    try {
      await this.db.transaction(async (client) => {
        await client.query('SELECT pg_advisory_xact_lock(427010)');
        if (
          input.managerId &&
          !(await client.query('SELECT id FROM employees WHERE id=$1', [input.managerId])).rowCount
        )
          throw new BadRequestException('Reporting manager does not exist');
        await client.query(
          'INSERT INTO users (id,name,email,password_hash,role,must_change_password) VALUES ($1,$2,$3,$4,$5,true)',
          [id, input.name, input.email, hashed, input.role],
        );
        await client.query(
          'INSERT INTO employees (id,department,designation,phone,employment_type,status,joining_date,manager_id) VALUES ($1,$2,$3,$4,$5,$6,$7,$8)',
          [
            id,
            input.department,
            input.designation,
            input.phone,
            input.employmentType,
            input.status,
            input.joiningDate,
            input.managerId,
          ],
        );
        await client.query(
          "INSERT INTO audit_log (actor_id,action,target_id,details) VALUES ($1,'employee.created',$2,$3)",
          [request.user.id, id, JSON.stringify({ name: input.name, role: input.role })],
        );
      });
    } catch (error) {
      if ((error as { code?: string }).code === '23505')
        throw new ConflictException('An account with this email already exists');
      throw error;
    }
    return (await this.db.query(`${employeeSelect} WHERE u.id=$1`, [id])).rows[0];
  }

  @Roles('SUPER_ADMIN', 'ADMIN', 'HR')
  @Patch('employees/:id')
  async update(@Req() request: AuthRequest, @Param('id') rawId: string, @Body() body: unknown) {
    const id = parse(z.uuid(), rawId);
    const input = parse(z.object(employeeFields).strict(), body);
    await this.db.transaction(async (client) => {
      await client.query('SELECT pg_advisory_xact_lock(427010)');
      await client.query('SELECT pg_advisory_xact_lock(427003)');
      if (!(await client.query('SELECT id FROM employees WHERE id=$1', [id])).rowCount)
        throw new NotFoundException('Employee not found');
      const dates = (
        await client.query('SELECT joining_date::text,end_date::text FROM employees WHERE id=$1', [
          id,
        ])
      ).rows[0];
      if (dates.end_date && input.joiningDate > dates.end_date)
        throw new BadRequestException('Joining date exceeds the last employment date');
      if (dates.joining_date !== input.joiningDate) {
        const earliest = [dates.joining_date, input.joiningDate].sort()[0];
        if (
          (
            await client.query(
              "SELECT month FROM payroll_runs WHERE status='FINALIZED' AND month >= $1",
              [earliest.slice(0, 7)],
            )
          ).rowCount
        )
          throw new ConflictException('Joining date affects finalized payroll');
      }
      if (input.managerId) {
        const chain = await client.query(
          `WITH RECURSIVE managers AS (
          SELECT id,manager_id FROM employees WHERE id=$1
          UNION SELECT e.id,e.manager_id FROM employees e JOIN managers m ON e.id=m.manager_id
        ) SELECT id FROM managers`,
          [input.managerId],
        );
        if (!chain.rowCount || chain.rows.some((row) => row.id === id))
          throw new BadRequestException(
            'Choose a manager without a circular reporting relationship',
          );
      }
      await client.query('UPDATE users SET name=$1 WHERE id=$2', [input.name, id]);
      await client.query(
        'UPDATE employees SET department=$1,designation=$2,phone=$3,employment_type=$4,status=$5,joining_date=$6,manager_id=$7 WHERE id=$8',
        [
          input.department,
          input.designation,
          input.phone,
          input.employmentType,
          input.status,
          input.joiningDate,
          input.managerId,
          id,
        ],
      );
      await client.query(
        "INSERT INTO audit_log (actor_id,action,target_id,details) VALUES ($1,'employee.updated',$2,$3)",
        [request.user.id, id, JSON.stringify({ name: input.name })],
      );
    });
    return { ok: true };
  }

  @Roles('SUPER_ADMIN')
  @Patch('users/:id/access')
  async access(@Req() request: AuthRequest, @Param('id') rawId: string, @Body() body: unknown) {
    const id = parse(z.uuid(), rawId);
    const input = parse(z.object({ role, active: z.boolean() }).strict(), body);
    await this.db.transaction(async (client) => {
      await client.query('SELECT pg_advisory_xact_lock(427010)');
      await client.query('SELECT pg_advisory_xact_lock(427004)');
      const current = (await client.query('SELECT role,active FROM users WHERE id=$1', [id]))
        .rows[0];
      if (!current) throw new NotFoundException('Account not found');
      if (
        current.role === 'SUPER_ADMIN' &&
        current.active &&
        (input.role !== 'SUPER_ADMIN' || !input.active)
      ) {
        const count = (
          await client.query(
            "SELECT count(*)::int AS n FROM users WHERE role='SUPER_ADMIN' AND active=true",
          )
        ).rows[0].n;
        if (count <= 1)
          throw new ConflictException('The last active Super Admin cannot be demoted or disabled');
      }
      await client.query('UPDATE users SET role=$1,active=$2 WHERE id=$3', [
        input.role,
        input.active,
        id,
      ]);
      await client.query('DELETE FROM sessions WHERE user_id=$1', [id]);
      await client.query('DELETE FROM tracker_devices WHERE employee_id=$1', [id]);
      await client.query(
        "INSERT INTO audit_log (actor_id,action,target_id,details) VALUES ($1,'access.updated',$2,$3)",
        [request.user.id, id, JSON.stringify(input)],
      );
    });
    return { ok: true };
  }

  @Roles('SUPER_ADMIN', 'ADMIN', 'HR')
  @Get('activity')
  async activity() {
    return (
      await this.db
        .query(`SELECT a.id,a.action,a.details,a.created_at AS "createdAt",u.name AS "actorName"
      FROM audit_log a LEFT JOIN users u ON u.id=a.actor_id ORDER BY a.id DESC LIMIT 8`)
    ).rows;
  }
}
