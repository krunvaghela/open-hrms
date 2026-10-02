import {
  BadRequestException,
  Body,
  ConflictException,
  Controller,
  Delete,
  ForbiddenException,
  Get,
  NotFoundException,
  Param,
  Patch,
  Post,
  Put,
  Query,
  Req,
} from '@nestjs/common';
import { randomUUID } from 'node:crypto';
import { z } from 'zod';
import { AuthRequest, Roles } from './auth';
import { parse } from './validation';
import { WorkforceService } from './workforce.service';
import { dateInZone, dateSchema, monthSchema, policySchema } from './workforce-domain';
const reviewers = ['SUPER_ADMIN', 'ADMIN', 'HR'] as const;
const reason = z.string().trim().min(3).max(500);
const review = z
  .object({ status: z.enum(['APPROVED', 'REJECTED']), note: z.string().trim().min(3).max(500) })
  .strict();
const leaveType = z
  .object({
    name: z.string().trim().min(2).max(60),
    paid: z.boolean(),
    annualDays: z.number().int().min(0).max(366),
    active: z.boolean(),
  })
  .strict();
function canReview(req: AuthRequest, employeeId: string) {
  if (req.user.id === employeeId && req.user.role !== 'SUPER_ADMIN')
    throw new ForbiddenException('Another reviewer must approve your request');
}
@Controller('workforce')
export class WorkforceController {
  constructor(private readonly w: WorkforceService) {}
  @Get('policy') async policy() {
    return { policy: await this.w.policy(), company: await this.w.company() };
  }
  @Roles('SUPER_ADMIN', 'ADMIN') @Put('policy') async savePolicy(
    @Req() req: AuthRequest,
    @Body() body: unknown,
  ) {
    const input = parse(policySchema, body);
    return this.w.write(async (c) => {
      await c.query(
        'INSERT INTO workforce_policy VALUES(1,$1) ON CONFLICT(id) DO UPDATE SET data=$1',
        [JSON.stringify(input)],
      );
      if (!input.screenshotsEnabled)
        await c.query('UPDATE tracker_samples SET screenshot=NULL WHERE screenshot IS NOT NULL');
      await this.w.audit(c, req.user.id, 'policy.updated', 'workforce', input);
      return { ok: true };
    });
  }
  @Get('holidays') async holidays(@Query('year') raw: string) {
    const year = parse(z.string().regex(/^20\d{2}$/), raw);
    return (
      await this.w.db.query(
        'SELECT day::text,name FROM holidays WHERE EXTRACT(YEAR FROM day)=$1 ORDER BY day',
        [year],
      )
    ).rows;
  }
  @Roles('SUPER_ADMIN', 'ADMIN') @Put('holidays/:day') async holiday(
    @Req() req: AuthRequest,
    @Param('day') raw: string,
    @Body() body: unknown,
  ) {
    const day = parse(dateSchema, raw),
      input = parse(z.object({ name: z.string().trim().min(2).max(100) }).strict(), body);
    return this.w.write(async (c) => {
      await this.w.unlocked(c, day);
      await c.query('INSERT INTO holidays VALUES($1,$2) ON CONFLICT(day) DO UPDATE SET name=$2', [
        day,
        input.name,
      ]);
      await this.w.audit(c, req.user.id, 'holiday.updated', day);
      return { ok: true };
    });
  }
  @Roles('SUPER_ADMIN', 'ADMIN') @Delete('holidays/:day') async removeHoliday(
    @Req() req: AuthRequest,
    @Param('day') raw: string,
  ) {
    const day = parse(dateSchema, raw);
    return this.w.write(async (c) => {
      await this.w.unlocked(c, day);
      await c.query('DELETE FROM holidays WHERE day=$1', [day]);
      await this.w.audit(c, req.user.id, 'holiday.deleted', day);
      return { ok: true };
    });
  }
  @Get('attendance') async attendance(@Req() req: AuthRequest, @Query('month') raw: string) {
    const month = parse(monthSchema, raw),
      own = req.user.role === 'EMPLOYEE' ? req.user.id : null;
    const rows = (
      await this.w.db.query(
        `SELECT a.employee_id AS "employeeId",u.name,a.day::text,a.check_in AS "checkIn",a.check_out AS "checkOut",a.source,
      round(EXTRACT(EPOCH FROM(a.check_out-a.check_in))/60)::int AS minutes FROM attendance a JOIN users u ON u.id=a.employee_id
      WHERE to_char(a.day,'YYYY-MM')=$1 AND ($2::uuid IS NULL OR a.employee_id=$2) ORDER BY a.day DESC,u.name`,
        [month, own],
      )
    ).rows;
    const corrections = (
      await this.w.db.query(
        `SELECT r.id,r.employee_id AS "employeeId",u.name,r.day::text,r.check_in AS "checkIn",r.check_out AS "checkOut",r.reason,r.status,r.review_note AS "reviewNote"
      FROM attendance_corrections r JOIN users u ON u.id=r.employee_id WHERE to_char(day,'YYYY-MM')=$1 AND ($2::uuid IS NULL OR employee_id=$2) ORDER BY r.created_at DESC`,
        [month, own],
      )
    ).rows;
    const today = dateInZone(new Date(), (await this.w.company()).timezone);
    const current =
      (
        await this.w.db.query(
          'SELECT day::text,check_in AS "checkIn",check_out AS "checkOut" FROM attendance WHERE employee_id=$1 AND (day=$2 OR check_out IS NULL) ORDER BY day LIMIT 1',
          [req.user.id, today],
        )
      ).rows[0] ?? null;
    return { rows, corrections, today, current };
  }
  @Post('attendance/check-in') async checkIn(@Req() req: AuthRequest) {
    return this.w.write(async (c) => {
      const now = new Date(),
        day = dateInZone(now, (await this.w.company(c)).timezone);
      const e = await this.w.employee(c, req.user.id, day);
      if (e.status === 'Inactive') throw new ForbiddenException('Your employment is inactive');
      await this.w.unlocked(c, day);
      if (
        (
          await c.query(
            'SELECT day FROM attendance WHERE employee_id=$1 AND (day=$2 OR check_out IS NULL)',
            [req.user.id, day],
          )
        ).rowCount
      )
        throw new ConflictException('You have already checked in. Request a correction if needed.');
      await c.query('INSERT INTO attendance(employee_id,day,check_in) VALUES($1,$2,$3)', [
        req.user.id,
        day,
        now,
      ]);
      await this.w.audit(c, req.user.id, 'attendance.checked_in', day);
      return { ok: true };
    });
  }
  @Post('attendance/check-out') async checkOut(@Req() req: AuthRequest) {
    return this.w.write(async (c) => {
      const row = (
        await c.query(
          'SELECT day::text,check_in FROM attendance WHERE employee_id=$1 AND check_out IS NULL',
          [req.user.id],
        )
      ).rows[0];
      if (!row) throw new ConflictException('No open check-in');
      await this.w.unlocked(c, row.day);
      if (Date.now() - new Date(row.check_in).getTime() > 86400000)
        throw new BadRequestException(
          'This check-in is older than 24 hours. Request an attendance correction.',
        );
      await c.query('UPDATE attendance SET check_out=now() WHERE employee_id=$1 AND day=$2', [
        req.user.id,
        row.day,
      ]);
      await this.w.audit(c, req.user.id, 'attendance.checked_out', row.day);
      return { ok: true };
    });
  }
  @Post('attendance/corrections') async correction(@Req() req: AuthRequest, @Body() body: unknown) {
    const input = parse(
      z
        .object({
          day: dateSchema,
          checkIn: z.iso.datetime({ offset: true }),
          checkOut: z.iso.datetime({ offset: true }),
          reason,
        })
        .strict(),
      body,
    );
    return this.w.write(async (c) => {
      await this.w.unlocked(c, input.day);
      await this.w.employee(c, req.user.id, input.day);
      const start = new Date(input.checkIn),
        end = new Date(input.checkOut),
        company = await this.w.company(c);
      if (
        dateInZone(start, company.timezone) !== input.day ||
        end <= start ||
        end.getTime() - start.getTime() > 86400000 ||
        end.getTime() > Date.now()
      )
        throw new BadRequestException(
          'Use a completed shift of up to 24 hours starting on the selected company-local date',
        );
      if (
        (
          await c.query(
            "SELECT id FROM attendance_corrections WHERE employee_id=$1 AND day=$2 AND status='PENDING'",
            [req.user.id, input.day],
          )
        ).rowCount
      )
        throw new ConflictException('A correction is already pending for this day');
      const id = randomUUID();
      await c.query(
        'INSERT INTO attendance_corrections(id,employee_id,day,check_in,check_out,reason) VALUES($1,$2,$3,$4,$5,$6)',
        [id, req.user.id, input.day, start, end, input.reason],
      );
      await this.w.audit(c, req.user.id, 'attendance.correction_requested', id);
      return { id };
    });
  }
  @Roles(...reviewers) @Patch('attendance/corrections/:id') async reviewCorrection(
    @Req() req: AuthRequest,
    @Param('id') raw: string,
    @Body() body: unknown,
  ) {
    const id = parse(z.uuid(), raw),
      input = parse(review, body);
    return this.w.write(async (c) => {
      const r = (await c.query('SELECT *,day::text FROM attendance_corrections WHERE id=$1', [id]))
        .rows[0];
      if (!r) throw new NotFoundException();
      canReview(req, r.employee_id);
      if (r.status !== 'PENDING')
        throw new ConflictException('This request has already been reviewed');
      await this.w.unlocked(c, r.day);
      if (input.status === 'APPROVED') {
        await this.w.employee(c, r.employee_id, r.day);
        if (
          (
            await c.query(
              'SELECT day FROM attendance WHERE employee_id=$1 AND day<>$2 AND (check_out IS NULL OR (check_in<$4 AND check_out>$3))',
              [r.employee_id, r.day, r.check_in, r.check_out],
            )
          ).rowCount
        )
          throw new ConflictException('Resolve the overlapping or open shift first');
        await c.query(
          `INSERT INTO attendance(employee_id,day,check_in,check_out,source) VALUES($1,$2,$3,$4,'CORRECTION') ON CONFLICT(employee_id,day) DO UPDATE SET check_in=$3,check_out=$4,source='CORRECTION'`,
          [r.employee_id, r.day, r.check_in, r.check_out],
        );
      }
      await c.query(
        'UPDATE attendance_corrections SET status=$2,reviewed_by=$3,review_note=$4 WHERE id=$1',
        [id, input.status, req.user.id, input.note],
      );
      await this.w.audit(c, req.user.id, 'attendance.correction_reviewed', id, {
        ...input,
        selfReview: req.user.id === r.employee_id,
      });
      return { ok: true };
    });
  }
  @Get('leave-types') async leaveTypes() {
    return (
      await this.w.db.query(
        'SELECT id,name,paid,annual_days AS "annualDays",active FROM leave_types ORDER BY name',
      )
    ).rows;
  }
  @Roles('SUPER_ADMIN', 'ADMIN') @Put('leave-types/:id') async saveLeaveType(
    @Req() req: AuthRequest,
    @Param('id') raw: string,
    @Body() body: unknown,
  ) {
    const id = parse(z.uuid(), raw),
      input = parse(leaveType, body);
    return this.w.write(async (c) => {
      if (
        (
          await c.query('SELECT id FROM leave_types WHERE lower(name)=lower($1) AND id<>$2', [
            input.name,
            id,
          ])
        ).rowCount
      )
        throw new ConflictException('Leave type name already exists');
      await c.query(
        'INSERT INTO leave_types VALUES($1,$2,$3,$4,$5) ON CONFLICT(id) DO UPDATE SET name=$2,paid=$3,annual_days=$4,active=$5',
        [id, input.name, input.paid, input.annualDays, input.active],
      );
      await this.w.audit(c, req.user.id, 'leave_type.updated', id, input);
      return { ok: true };
    });
  }
  @Get('leave') async leave(@Req() req: AuthRequest, @Query('year') raw: string) {
    const year = parse(z.string().regex(/^20\d{2}$/), raw),
      own = req.user.role === 'EMPLOYEE' ? req.user.id : null;
    const rows = (
      await this.w.db.query(
        `SELECT r.id,r.employee_id AS "employeeId",u.name,t.name AS "typeName",r.type_id AS "typeId",r.start_date::text AS "startDate",r.end_date::text AS "endDate",r.days,r.paid,r.reason,r.status,r.review_note AS "reviewNote"
      FROM leave_requests r JOIN users u ON u.id=r.employee_id JOIN leave_types t ON t.id=r.type_id WHERE EXTRACT(YEAR FROM start_date)=$1 AND ($2::uuid IS NULL OR employee_id=$2) ORDER BY r.created_at DESC`,
        [year, own],
      )
    ).rows;
    const balances = (
      await this.w.db.query(
        `SELECT t.id,t.name,t.paid,t.active,t.annual_days AS allowance,
      COALESCE(sum(jsonb_array_length(r.days)) FILTER(WHERE r.status='APPROVED'),0)::int AS used,
      COALESCE(sum(jsonb_array_length(r.days)) FILTER(WHERE r.status='PENDING'),0)::int AS pending
      FROM leave_types t LEFT JOIN leave_requests r ON r.type_id=t.id AND r.employee_id=$1 AND EXTRACT(YEAR FROM r.start_date)=$2 GROUP BY t.id ORDER BY t.name`,
        [req.user.id, year],
      )
    ).rows;
    return { rows, balances };
  }
  @Post('leave') async requestLeave(@Req() req: AuthRequest, @Body() body: unknown) {
    const input = parse(
      z.object({ typeId: z.uuid(), startDate: dateSchema, endDate: dateSchema, reason }).strict(),
      body,
    );
    if (
      input.endDate < input.startDate ||
      input.startDate.slice(0, 4) !== input.endDate.slice(0, 4)
    )
      throw new BadRequestException('Use a date range within one calendar year');
    return this.w.write(async (c) => {
      await this.w.unlocked(c, input.startDate, input.endDate);
      await this.w.employee(c, req.user.id, input.startDate);
      await this.w.employee(c, req.user.id, input.endDate);
      const type = (
        await c.query('SELECT * FROM leave_types WHERE id=$1 AND active=true', [input.typeId])
      ).rows[0];
      if (!type) throw new BadRequestException('Choose an active leave type');
      if (
        (
          await c.query(
            "SELECT id FROM leave_requests WHERE employee_id=$1 AND status IN ('PENDING','APPROVED') AND start_date<=$3 AND end_date>=$2",
            [req.user.id, input.startDate, input.endDate],
          )
        ).rowCount
      )
        throw new ConflictException('This date range overlaps an existing leave request');
      const days = await this.w.workingDates(c, input.startDate, input.endDate);
      if (!days.length) throw new BadRequestException('This range has no working days');
      const used = (
        await c.query(
          "SELECT COALESCE(sum(jsonb_array_length(days)),0)::int AS n FROM leave_requests WHERE employee_id=$1 AND type_id=$2 AND EXTRACT(YEAR FROM start_date)=$3 AND status IN ('PENDING','APPROVED')",
          [req.user.id, input.typeId, input.startDate.slice(0, 4)],
        )
      ).rows[0].n;
      if (used + days.length > type.annual_days)
        throw new ConflictException('Insufficient leave balance (pending requests reserve days)');
      const id = randomUUID();
      await c.query(
        'INSERT INTO leave_requests(id,employee_id,type_id,start_date,end_date,days,paid,reason) VALUES($1,$2,$3,$4,$5,$6,$7,$8)',
        [
          id,
          req.user.id,
          input.typeId,
          input.startDate,
          input.endDate,
          JSON.stringify(days),
          type.paid,
          input.reason,
        ],
      );
      await this.w.audit(c, req.user.id, 'leave.requested', id);
      return { id };
    });
  }
  @Patch('leave/:id') async reviewLeave(
    @Req() req: AuthRequest,
    @Param('id') raw: string,
    @Body() body: unknown,
  ) {
    const id = parse(z.uuid(), raw),
      input = parse(
        z
          .object({
            status: z.enum(['APPROVED', 'REJECTED', 'CANCELLED']),
            note: z.string().trim().min(3).max(500),
          })
          .strict(),
        body,
      );
    return this.w.write(async (c) => {
      const r = (
        await c.query('SELECT *,start_date::text,end_date::text FROM leave_requests WHERE id=$1', [
          id,
        ])
      ).rows[0];
      if (!r) throw new NotFoundException();
      if (input.status === 'CANCELLED') {
        if (r.employee_id !== req.user.id)
          throw new ForbiddenException('Only the requester may cancel');
        if (!['PENDING', 'APPROVED'].includes(r.status))
          throw new ConflictException('This request is already closed');
      } else {
        if (req.user.role === 'EMPLOYEE') throw new ForbiddenException();
        canReview(req, r.employee_id);
        if (r.status !== 'PENDING')
          throw new ConflictException('This request has already been reviewed');
      }
      await this.w.unlocked(c, r.start_date, r.end_date);
      await c.query(
        'UPDATE leave_requests SET status=$2,reviewed_by=$3,review_note=$4 WHERE id=$1',
        [id, input.status, req.user.id, input.note],
      );
      await this.w.audit(c, req.user.id, 'leave.reviewed', id, {
        ...input,
        selfReview: req.user.id === r.employee_id,
      });
      return { ok: true };
    });
  }
}
