import {
  BadRequestException,
  Body,
  ConflictException,
  Controller,
  Get,
  NotFoundException,
  Param,
  Post,
  Put,
  Query,
  Req,
} from '@nestjs/common';
import { z } from 'zod';
import { AuthRequest, Roles } from './auth';
import { parse } from './validation';
import {
  componentSchema,
  componentsSchema,
  dateInZone,
  dateSchema,
  monthEnd,
  monthSchema,
} from './workforce-domain';
import { WorkforceService } from './workforce.service';
@Controller('payroll')
export class PayrollController {
  constructor(private readonly w: WorkforceService) {}
  @Roles('SUPER_ADMIN', 'ADMIN', 'HR') @Get('salaries') async salaries(
    @Query('month') raw: string,
  ) {
    const month = parse(monthSchema, raw);
    return (
      await this.w.db.query(
        `SELECT e.id,u.name,e.employee_number::text AS "employeeNumber",e.joining_date::text AS "joiningDate",e.end_date::text AS "endDate",
      s.effective_month AS "effectiveMonth",s.currency,s.components FROM employees e JOIN users u ON u.id=e.id LEFT JOIN LATERAL (
      SELECT * FROM salary_structures WHERE employee_id=e.id AND effective_month<=$1 ORDER BY effective_month DESC LIMIT 1) s ON true ORDER BY e.employee_number`,
        [month],
      )
    ).rows;
  }
  @Roles('SUPER_ADMIN', 'ADMIN', 'HR') @Put('salaries/:id') async salary(
    @Req() req: AuthRequest,
    @Param('id') raw: string,
    @Body() body: unknown,
  ) {
    const id = parse(z.uuid(), raw),
      input = parse(
        z
          .object({
            effectiveMonth: monthSchema,
            components: componentsSchema,
            endDate: dateSchema.nullable(),
          })
          .strict(),
        body,
      );
    return this.w.write(async (c) => {
      const e = (
        await c.query('SELECT joining_date::text,end_date::text FROM employees WHERE id=$1', [id])
      ).rows[0];
      if (!e) throw new NotFoundException();
      if (input.endDate && input.endDate < e.joining_date)
        throw new BadRequestException('Last employment date must be on or after joining date');
      if (
        (
          await c.query("SELECT month FROM payroll_runs WHERE status='FINALIZED' AND month >= $1", [
            input.effectiveMonth,
          ])
        ).rowCount
      )
        throw new ConflictException('Choose an effective month after finalized payroll');
      if (e.end_date !== input.endDate) {
        const earliest = [e.end_date, input.endDate].filter(Boolean).sort()[0];
        if (
          earliest &&
          (
            await c.query(
              "SELECT month FROM payroll_runs WHERE status='FINALIZED' AND month >= $1",
              [earliest.slice(0, 7)],
            )
          ).rowCount
        )
          throw new ConflictException('Employment end date affects finalized payroll');
      }
      const policy = await this.w.policy(c);
      await c.query(
        'INSERT INTO salary_structures VALUES($1,$2,$3,$4) ON CONFLICT(employee_id,effective_month) DO UPDATE SET currency=$3,components=$4',
        [id, input.effectiveMonth, policy.currency, JSON.stringify(input.components)],
      );
      await c.query('UPDATE employees SET end_date=$2 WHERE id=$1', [id, input.endDate]);
      await this.w.audit(c, req.user.id, 'salary.updated', id, {
        effectiveMonth: input.effectiveMonth,
        currency: policy.currency,
      });
      return { ok: true };
    });
  }
  @Roles('SUPER_ADMIN', 'ADMIN', 'HR') @Put(':month/adjustments/:id') async adjustments(
    @Req() req: AuthRequest,
    @Param('month') rawMonth: string,
    @Param('id') rawId: string,
    @Body() body: unknown,
  ) {
    const month = parse(monthSchema, rawMonth),
      id = parse(z.uuid(), rawId),
      input = parse(
        z
          .object({
            components: z.array(componentSchema).max(20),
            reason: z.string().trim().min(3).max(500),
          })
          .strict(),
        body,
      );
    return this.w.write(async (c) => {
      await this.w.unlocked(c, `${month}-01`, monthEnd(month));
      if (!(await c.query('SELECT id FROM employees WHERE id=$1', [id])).rowCount)
        throw new NotFoundException();
      await c.query(
        'INSERT INTO payroll_adjustments VALUES($1,$2,$3,$4) ON CONFLICT(employee_id,month) DO UPDATE SET components=$3,reason=$4',
        [id, month, JSON.stringify(input.components), input.reason],
      );
      await this.w.audit(c, req.user.id, 'payroll.adjusted', id, { month, reason: input.reason });
      return { ok: true };
    });
  }
  @Get('payslips') async payslips(@Req() req: AuthRequest) {
    return (
      await this.w.db.query(
        `SELECT month,snapshot->'policy'->>'currency' AS currency,p.row->>'netMinor' AS "netMinor",finalized_at AS "finalizedAt"
      FROM payroll_runs CROSS JOIN LATERAL jsonb_array_elements(snapshot->'rows') AS p(row)
      WHERE status='FINALIZED' AND p.row->>'id'=$1 ORDER BY month DESC`,
        [req.user.id],
      )
    ).rows;
  }
  @Get('payslips/:month/:id') async payslip(
    @Req() req: AuthRequest,
    @Param('month') rawMonth: string,
    @Param('id') rawId: string,
  ) {
    const month = parse(monthSchema, rawMonth),
      id = parse(z.uuid(), rawId);
    if (req.user.role === 'EMPLOYEE' && id !== req.user.id) throw new NotFoundException();
    const run = (
      await this.w.db.query(
        "SELECT snapshot,finalized_at FROM payroll_runs WHERE month=$1 AND status='FINALIZED'",
        [month],
      )
    ).rows[0];
    const row = run?.snapshot.rows.find((r: { id: string }) => r.id === id);
    if (!row) throw new NotFoundException('Published payslip not found');
    return {
      month,
      company: run.snapshot.company,
      policy: run.snapshot.policy,
      row,
      finalizedAt: run.finalized_at,
    };
  }
  @Roles('SUPER_ADMIN', 'ADMIN', 'HR') @Get(':month') async roster(@Param('month') raw: string) {
    const month = parse(monthSchema, raw);
    return (
      (
        await this.w.db.query(
          'SELECT month,status,snapshot,digest,updated_at AS "updatedAt",finalized_at AS "finalizedAt" FROM payroll_runs WHERE month=$1',
          [month],
        )
      ).rows[0] ?? null
    );
  }
  @Roles('SUPER_ADMIN', 'ADMIN', 'HR') @Post(':month/generate') async generate(
    @Req() req: AuthRequest,
    @Param('month') raw: string,
  ) {
    const month = parse(monthSchema, raw);
    return this.w.write(async (c) => {
      await this.w.unlocked(c, `${month}-01`);
      const { snapshot, digest } = await this.w.payroll(c, month);
      await c.query(
        "INSERT INTO payroll_runs(month,status,snapshot,digest) VALUES($1,'DRAFT',$2,$3) ON CONFLICT(month) DO UPDATE SET snapshot=$2,digest=$3,updated_at=now()",
        [month, JSON.stringify(snapshot), digest],
      );
      await this.w.audit(c, req.user.id, 'payroll.generated', month);
      return { ok: true };
    });
  }
  @Roles('SUPER_ADMIN', 'ADMIN') @Post(':month/finalize') async finalize(
    @Req() req: AuthRequest,
    @Param('month') raw: string,
    @Body() body: unknown,
  ) {
    const month = parse(monthSchema, raw),
      input = parse(z.object({ digest: z.string().length(64) }).strict(), body);
    return this.w.write(async (c) => {
      await this.w.unlocked(c, `${month}-01`);
      if (monthEnd(month) >= dateInZone(new Date(), (await this.w.company(c)).timezone))
        throw new BadRequestException('Finalize after the month has ended');
      const run = (await c.query('SELECT digest FROM payroll_runs WHERE month=$1', [month]))
        .rows[0];
      if (!run) throw new NotFoundException('Generate and review a draft first');
      const current = await this.w.payroll(c, month);
      if (run.digest !== input.digest || current.digest !== run.digest)
        throw new ConflictException(
          'Source records changed. Regenerate and review the draft before finalizing.',
        );
      if (!current.snapshot.rows.length || current.snapshot.rows.some((r) => r.issues.length))
        throw new ConflictException('Resolve all roster issues before finalizing');
      await c.query(
        "UPDATE payroll_runs SET status='FINALIZED',finalized_by=$2,finalized_at=now(),updated_at=now() WHERE month=$1",
        [month, req.user.id],
      );
      await this.w.audit(c, req.user.id, 'payroll.finalized', month);
      return { ok: true };
    });
  }
}
