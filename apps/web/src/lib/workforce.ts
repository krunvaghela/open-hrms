export type Policy = {
  currency: string;
  workDays: number[];
  fullDayMinutes: number;
  halfDayMinutes: number;
  payrollDivisor: 'WORKING_DAYS' | 'CALENDAR_DAYS';
  missingAttendance: 'PAID' | 'UNPAID';
  trackingEnabled: boolean;
  screenshotsEnabled: boolean;
  screenshotIntervalMinutes: number;
  retentionDays: number;
};
export type Component = {
  name: string;
  kind: 'EARNING' | 'DEDUCTION';
  amountMinor: number;
  prorate: boolean;
};
export type Salary = {
  id: string;
  name: string;
  employeeNumber: string;
  joiningDate: string;
  endDate: string | null;
  effectiveMonth: string | null;
  currency: string | null;
  components: Component[] | null;
};
export type PayRow = {
  id: string;
  name: string;
  email: string;
  employeeNumber: string;
  department: string;
  designation: string;
  divisor: number;
  eligibleDays: number;
  paidDays: number;
  unpaidDays: number;
  presentDays: number;
  paidLeaveDays: number;
  unpaidLeaveDays: number;
  earningsMinor: number;
  deductionsMinor: number;
  netMinor: number;
  lines: (Component & { payableMinor: number })[];
  issues: string[];
  adjustmentReason: string;
};
export type Snapshot = {
  month: string;
  company: { name: string; address: string; city: string; state: string; timezone: string };
  policy: Policy;
  rows: PayRow[];
  totals: { earningsMinor: number; deductionsMinor: number; netMinor: number };
};
export type Run = {
  month: string;
  status: 'DRAFT' | 'FINALIZED';
  digest: string;
  snapshot: Snapshot;
  updatedAt: string;
  finalizedAt: string | null;
};
export function digits(currency: string) {
  return (
    new Intl.NumberFormat('en', { style: 'currency', currency }).resolvedOptions()
      .maximumFractionDigits ?? 2
  );
}
export function money(amount: number, currency: string) {
  return new Intl.NumberFormat(undefined, { style: 'currency', currency }).format(
    amount / 10 ** digits(currency),
  );
}
export function localDate(timezone: string) {
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: timezone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(new Date());
}
export function download(name: string, content: string, type = 'text/csv;charset=utf-8;') {
  const url = URL.createObjectURL(new Blob([content], { type }));
  const a = document.createElement('a');
  a.href = url;
  a.download = name;
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
export function csv(rows: (string | number)[][]) {
  return (
    '\ufeff' +
    rows
      .map((r) =>
        r
          .map(
            (v) =>
              '"' +
              String(v)
                .replace(/^[=+\-@\t\r]/, "'$&")
                .replaceAll('"', '""') +
              '"',
          )
          .join(','),
      )
      .join('\r\n')
  );
}
