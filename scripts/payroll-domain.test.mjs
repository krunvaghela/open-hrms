import test from 'node:test';
import assert from 'node:assert/strict';
import {
  calculatePay,
  datesBetween,
  monthEnd,
  workingDay,
  attendanceCredit,
  defaultPolicy,
  dateInZone,
} from '../apps/api/src/workforce-domain.ts';
test('payroll rounds each prorated component in integer minor units and preserves fixed deductions', () => {
  const result = calculatePay(
    [
      { name: 'Base', kind: 'EARNING', amountMinor: 200000, prorate: true },
      { name: 'Tax', kind: 'DEDUCTION', amountMinor: 1000, prorate: false },
    ],
    2.5,
    20,
  );
  assert.equal(result.earningsMinor, 25000);
  assert.equal(result.netMinor, 24000);
  assert.equal(
    calculatePay([{ name: 'Base', kind: 'EARNING', amountMinor: 100, prorate: true }], 1, 3)
      .netMinor,
    33,
  );
});
test('calendar dates and timezone boundaries are stable through leap years and DST', () => {
  assert.equal(monthEnd('2024-02'), '2024-02-29');
  assert.equal(monthEnd('2025-02'), '2025-02-28');
  assert.equal(datesBetween('2024-03-09', '2024-03-12').length, 4);
  assert.equal(dateInZone(new Date('2025-03-01T00:30:00Z'), 'America/Los_Angeles'), '2025-02-28');
  assert.equal(dateInZone(new Date('2025-02-28T18:45:00Z'), 'Asia/Kolkata'), '2025-03-01');
});
test('working calendar excludes holidays and attendance grants half days only at threshold', () => {
  const days = datesBetween('2025-02-01', '2025-02-28').filter((d) =>
    workingDay(d, defaultPolicy, new Set()),
  );
  assert.equal(days.length, 20);
  assert.equal(workingDay('2025-02-03', defaultPolicy, new Set(['2025-02-03'])), false);
  assert.equal(attendanceCredit(239, defaultPolicy), 0);
  assert.equal(attendanceCredit(240, defaultPolicy), 0.5);
  assert.equal(attendanceCredit(480, defaultPolicy), 1);
});
