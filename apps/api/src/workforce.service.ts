import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { PoolClient } from 'pg';
import { createHash } from 'node:crypto';
import { DatabaseService } from './database.service';
import {
  Policy,
  defaultPolicy,
  datesBetween,
  monthEnd,
  workingDay,
  attendanceCredit,
  calculatePay,
} from './workforce-domain';

@Injectable()
export class WorkforceService {
  constructor(readonly db: DatabaseService) {}
  async write<T>(work: (c: PoolClient) => Promise<T>) {
    return this.db.transaction(async (c) => {
      await c.query('SELECT pg_advisory_xact_lock(427010)');
      return work(c);
    });
  }
  async policy(c: Pick<DatabaseService, 'query'> = this.db) {
    return ((await c.query('SELECT data FROM workforce_policy WHERE id=1')).rows[0]?.data ??
      defaultPolicy) as Policy;
  }
  async company(c: Pick<DatabaseService, 'query'> = this.db) {
    return (await c.query('SELECT name,address,city,state,timezone FROM company WHERE id=1'))
      .rows[0];
  }
  async employee(c: PoolClient, id: string, day: string) {
    const e = (
      await c.query('SELECT joining_date::text,end_date::text,status FROM employees WHERE id=$1', [
        id,
      ])
    ).rows[0];
    if (!e) throw new NotFoundException('Employee not found');
    if (day < e.joining_date || (e.end_date && day > e.end_date))
      throw new BadRequestException('Date falls outside employment dates');
    return e;
  }
  async unlocked(c: PoolClient, start: string, end = start) {
    if (
      (
        await c.query(
          "SELECT month FROM payroll_runs WHERE status='FINALIZED' AND month BETWEEN $1 AND $2",
          [start.slice(0, 7), end.slice(0, 7)],
        )
      ).rowCount
    )
      throw new ConflictException(
        'This period has finalized payroll. Its source records are locked.',
      );
  }
  async audit(c: PoolClient, actor: string, action: string, target: string, details: object = {}) {
    await c.query('INSERT INTO audit_log(actor_id,action,target_id,details) VALUES($1,$2,$3,$4)', [
      actor,
      action,
      target,
      JSON.stringify(details),
    ]);
  }
  async workingDates(c: PoolClient, start: string, end: string) {
    const policy = await this.policy(c);
    const holidays = new Set<string>(
      (
        await c.query('SELECT day::text FROM holidays WHERE day BETWEEN $1 AND $2', [start, end])
      ).rows.map((r) => r.day),
    );
    return datesBetween(start, end).filter((d) => workingDay(d, policy, holidays));
  }
  async payroll(c: PoolClient, month: string) {
    const policy = await this.policy(c);
    const company = await this.company(c);
    const end = monthEnd(month);
    const days = datesBetween(`${month}-01`, end);
    const holidays = new Set<string>(
      (
        await c.query('SELECT day::text FROM holidays WHERE day BETWEEN $1 AND $2', [days[0], end])
      ).rows.map((r) => r.day),
    );
    const divisor =
      policy.payrollDivisor === 'CALENDAR_DAYS'
        ? days.length
        : days.filter((d) => workingDay(d, policy, holidays)).length;
    const employees = (
      await c.query(
        `SELECT e.id,u.name,u.email,e.employee_number::text AS "employeeNumber",e.department,e.designation,
      e.joining_date::text AS "joiningDate",e.end_date::text AS "endDate",s.currency,s.components
      FROM employees e JOIN users u ON u.id=e.id LEFT JOIN LATERAL (
        SELECT currency,components FROM salary_structures WHERE employee_id=e.id AND effective_month <= $1 ORDER BY effective_month DESC LIMIT 1
      ) s ON true WHERE e.joining_date <= $2::date AND (e.end_date IS NULL OR e.end_date >= $3::date) ORDER BY e.employee_number`,
        [month, end, days[0]],
      )
    ).rows;
    const attendance = (
      await c.query(
        'SELECT employee_id,day::text,check_out,EXTRACT(EPOCH FROM(check_out-check_in))/60 AS minutes FROM attendance WHERE day BETWEEN $1 AND $2',
        [days[0], end],
      )
    ).rows;
    const leave = (
      await c.query(
        "SELECT employee_id,days,paid FROM leave_requests WHERE status='APPROVED' AND start_date <= $2 AND end_date >= $1",
        [days[0], end],
      )
    ).rows;
    const pending = (
      await c.query(
        `SELECT employee_id FROM leave_requests WHERE status='PENDING' AND start_date <= $2 AND end_date >= $1
      UNION SELECT employee_id FROM attendance_corrections WHERE status='PENDING' AND day BETWEEN $1 AND $2`,
        [days[0], end],
      )
    ).rows;
    const attendanceMap = new Map(attendance.map((a) => [`${a.employee_id}:${a.day}`, a]));
    const leaveMap = new Map<string, boolean>();
    for (const l of leave) for (const d of l.days) leaveMap.set(`${l.employee_id}:${d}`, l.paid);
    const pendingIds = new Set(pending.map((r) => r.employee_id));
    const adjustments = new Map(
      (
        await c.query(
          'SELECT employee_id,components,reason FROM payroll_adjustments WHERE month=$1',
          [month],
        )
      ).rows.map((r) => [r.employee_id, r]),
    );
    const rows = employees.map((e) => {
      const issues: string[] = [];
      if (!e.components) issues.push('No salary structure');
      if (e.currency && e.currency !== policy.currency)
        issues.push('Salary currency differs from payroll currency');
      if (pendingIds.has(e.id)) issues.push('Pending leave or attendance correction');
      let paidDays = 0,
        eligibleDays = 0,
        presentDays = 0,
        paidLeaveDays = 0,
        unpaidLeaveDays = 0;
      for (const d of days) {
        if (d < e.joiningDate || (e.endDate && d > e.endDate)) continue;
        const work = workingDay(d, policy, holidays);
        if (!work && policy.payrollDivisor === 'WORKING_DAYS') continue;
        eligibleDays++;
        if (!work) {
          paidDays++;
          continue;
        }
        const key = `${e.id}:${d}`;
        const a = attendanceMap.get(key);
        if (a && !a.check_out) issues.push(`Missing check-out on ${d}`);
        if (leaveMap.has(key)) {
          if (leaveMap.get(key)) {
            paidLeaveDays++;
            paidDays++;
          } else unpaidLeaveDays++;
        } else if (a?.check_out) {
          const credit = attendanceCredit(Number(a.minutes), policy);
          presentDays += credit;
          paidDays += credit;
        } else if (policy.missingAttendance === 'PAID') paidDays++;
      }
      const adjustment = adjustments.get(e.id);
      const pay = calculatePay(
        [...(e.components ?? []), ...(adjustment?.components ?? [])],
        paidDays,
        divisor,
      );
      if (pay.netMinor < 0) issues.push('Deductions exceed earnings');
      return {
        id: e.id,
        name: e.name,
        email: e.email,
        employeeNumber: e.employeeNumber,
        department: e.department,
        adjustmentComponents: adjustment?.components ?? [],
        adjustmentReason: adjustment?.reason ?? '',
        designation: e.designation,
        joiningDate: e.joiningDate,
        endDate: e.endDate,
        divisor,
        eligibleDays,
        paidDays,
        unpaidDays: eligibleDays - paidDays,
        presentDays,
        paidLeaveDays,
        unpaidLeaveDays,
        ...pay,
        issues,
      };
    });
    if (!divisor)
      throw new BadRequestException('The month has no payable days under this work calendar');
    const snapshot = {
      month,
      company,
      policy,
      rows,
      totals: {
        earningsMinor: rows.reduce((s, r) => s + r.earningsMinor, 0),
        deductionsMinor: rows.reduce((s, r) => s + r.deductionsMinor, 0),
        netMinor: rows.reduce((s, r) => s + r.netMinor, 0),
      },
    };
    const digest = createHash('sha256').update(JSON.stringify(snapshot)).digest('hex');
    return { snapshot, digest };
  }
}
