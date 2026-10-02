import { z } from 'zod';

export const monthSchema = z.string().regex(/^20\d{2}-(0[1-9]|1[0-2])$/);
export const dateSchema = z.iso.date().refine((d) => d >= '2000-01-01' && d <= '2099-12-31');
export const policySchema = z
  .object({
    currency: z
      .string()
      .refine((s) => Intl.supportedValuesOf('currency').includes(s), 'Choose an ISO currency code'),
    workDays: z
      .array(z.number().int().min(0).max(6))
      .min(1)
      .max(7)
      .refine((v) => new Set(v).size === v.length),
    fullDayMinutes: z.number().int().min(1).max(1440),
    halfDayMinutes: z.number().int().min(1).max(1440),
    payrollDivisor: z.enum(['WORKING_DAYS', 'CALENDAR_DAYS']),
    missingAttendance: z.enum(['UNPAID', 'PAID']),
    trackingEnabled: z.boolean(),
    screenshotsEnabled: z.boolean(),
    screenshotIntervalMinutes: z.number().int().min(5).max(60),
    retentionDays: z.number().int().min(1).max(30),
  })
  .strict()
  .refine(
    (p) => p.halfDayMinutes <= p.fullDayMinutes,
    'Half-day threshold must not exceed full-day threshold',
  );
export type Policy = z.infer<typeof policySchema>;
export const defaultPolicy: Policy = {
  currency: 'USD',
  workDays: [1, 2, 3, 4, 5],
  fullDayMinutes: 480,
  halfDayMinutes: 240,
  payrollDivisor: 'WORKING_DAYS',
  missingAttendance: 'UNPAID',
  trackingEnabled: false,
  screenshotsEnabled: false,
  screenshotIntervalMinutes: 10,
  retentionDays: 7,
};
export const componentSchema = z
  .object({
    name: z.string().trim().min(1).max(60),
    kind: z.enum(['EARNING', 'DEDUCTION']),
    amountMinor: z.number().int().min(0).max(1_000_000_000),
    prorate: z.boolean(),
  })
  .strict();
export const componentsSchema = z
  .array(componentSchema)
  .min(1)
  .max(30)
  .refine((v) => v.some((c) => c.kind === 'EARNING'), 'Add at least one earning')
  .refine(
    (v) => new Set(v.map((c) => c.name.toLowerCase())).size === v.length,
    'Component names must be unique',
  );
export type Component = z.infer<typeof componentSchema>;
export function dateInZone(value: Date, timezone: string) {
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: timezone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(value);
}
export function datesBetween(start: string, end: string): string[] {
  const days: string[] = [];
  for (let t = Date.parse(`${start}T00:00:00Z`); t <= Date.parse(`${end}T00:00:00Z`); t += 86400000)
    days.push(new Date(t).toISOString().slice(0, 10));
  return days;
}
export function monthEnd(month: string) {
  return new Date(Date.UTC(Number(month.slice(0, 4)), Number(month.slice(5, 7)), 0))
    .toISOString()
    .slice(0, 10);
}
export function workingDay(date: string, policy: Policy, holidays: Set<string>) {
  return policy.workDays.includes(new Date(`${date}T12:00:00Z`).getUTCDay()) && !holidays.has(date);
}
export function attendanceCredit(minutes: number, policy: Policy) {
  return minutes >= policy.fullDayMinutes ? 1 : minutes >= policy.halfDayMinutes ? 0.5 : 0;
}
export function calculatePay(components: Component[], paidDays: number, divisor: number) {
  const ratio = divisor ? Math.min(1, Math.max(0, paidDays / divisor)) : 0;
  const lines = components.map((c) => ({
    ...c,
    payableMinor: c.prorate ? Math.round(c.amountMinor * ratio) : c.amountMinor,
  }));
  const earningsMinor = lines
    .filter((c) => c.kind === 'EARNING')
    .reduce((s, c) => s + c.payableMinor, 0);
  const deductionsMinor = lines
    .filter((c) => c.kind === 'DEDUCTION')
    .reduce((s, c) => s + c.payableMinor, 0);
  return { lines, earningsMinor, deductionsMinor, netMinor: earningsMinor - deductionsMinor };
}
