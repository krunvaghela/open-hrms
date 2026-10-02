import { expect, type Page, type Browser } from '@playwright/test';
import { randomUUID } from 'node:crypto';
const headers = { 'X-HRMS-Request': '1' };
export async function checkWorkforce(page: Page, browser: Browser) {
  const employees = await (await page.request.get('/api/employees')).json();
  const owner = employees.find((e: any) => e.role === 'SUPER_ADMIN'),
    person = employees.find((e: any) => e.email === 'priya@example.test');
  for (const e of [owner, person])
    expect(
      (
        await page.request.patch(`/api/employees/${e.id}`, {
          headers,
          data: {
            name: e.name,
            joiningDate: '2025-02-01',
            department: e.department,
            designation: e.designation,
          },
        })
      ).status(),
    ).toBe(200);
  const employee = await browser.newContext({ baseURL: process.env.E2E_BASE_URL });
  expect(
    (
      await employee.request.post('/api/auth/login', {
        headers,
        data: { email: person.email, password: 'Employee personal passphrase 123' },
      })
    ).status(),
  ).toBe(201);
  const worker = await employee.newPage();
  const hr = await browser.newContext({ baseURL: process.env.E2E_BASE_URL });
  await hr.request.post('/api/auth/login', {
    headers,
    data: { email: 'riya@example.test', password: 'Personal account passphrase 123' },
  });
  const getPolicy = await (await page.request.get('/api/workforce/policy')).json();
  const policy = {
    ...getPolicy.policy,
    currency: 'USD',
    missingAttendance: 'UNPAID',
    trackingEnabled: true,
    screenshotsEnabled: true,
  };
  expect(
    (await employee.request.put('/api/workforce/policy', { headers, data: policy })).status(),
  ).toBe(403);
  expect(
    (await page.request.put('/api/workforce/policy', { headers, data: policy })).status(),
  ).toBe(200);
  for (const e of [owner, person]) {
    const result = await page.request.put(`/api/payroll/salaries/${e.id}`, {
      headers,
      data: {
        effectiveMonth: '2025-02',
        endDate: null,
        components: [
          { name: 'Base salary', kind: 'EARNING', amountMinor: 200000, prorate: true },
          ...(e.id === person.id
            ? [{ name: 'Local tax', kind: 'DEDUCTION', amountMinor: 1000, prorate: false }]
            : []),
        ],
      },
    });
    expect(result.status(), await result.text()).toBe(200);
  }
  expect((await employee.request.get('/api/payroll/salaries?month=2025-02')).status()).toBe(403);
  // Calendar-day proration includes only days inside employment dates.
  await page.request.put('/api/workforce/policy', {
    headers,
    data: { ...policy, payrollDivisor: 'CALENDAR_DAYS', missingAttendance: 'PAID' },
  });
  await page.request.put(`/api/payroll/salaries/${owner.id}`, {
    headers,
    data: {
      effectiveMonth: '2025-02',
      endDate: '2025-02-20',
      components: [{ name: 'Base salary', kind: 'EARNING', amountMinor: 200000, prorate: true }],
    },
  });
  await page.request.post('/api/payroll/2025-02/generate', { headers });
  const partial = await (await page.request.get('/api/payroll/2025-02')).json();
  expect(partial.snapshot.rows.find((r: any) => r.id === owner.id)).toMatchObject({
    divisor: 28,
    eligibleDays: 20,
    paidDays: 20,
    netMinor: 142857,
  });
  await page.request.put(`/api/payroll/salaries/${owner.id}`, {
    headers,
    data: {
      effectiveMonth: '2025-02',
      endDate: null,
      components: [{ name: 'Base salary', kind: 'EARNING', amountMinor: 200000, prorate: true }],
    },
  });
  await page.request.put('/api/workforce/policy', { headers, data: policy });
  const paidId = randomUUID(),
    unpaidId = randomUUID();
  for (const [id, name, paid] of [
    [paidId, 'Annual leave', true],
    [unpaidId, 'Unpaid leave', false],
  ] as const)
    expect(
      (
        await page.request.put(`/api/workforce/leave-types/${id}`, {
          headers,
          data: { name, paid, annualDays: 2, active: true },
        })
      ).status(),
    ).toBe(200);
  const requestLeave = async (typeId: string, day: string) => {
    const r = await employee.request.post('/api/workforce/leave', {
      headers,
      data: { typeId, startDate: day, endDate: day, reason: 'Personal appointment' },
    });
    expect(r.status(), await r.text()).toBe(201);
    return (await r.json()).id;
  };
  const paid = await requestLeave(paidId, '2025-02-04');
  expect(
    (
      await employee.request.patch(`/api/workforce/leave/${paid}`, {
        headers,
        data: { status: 'APPROVED', note: 'Self approve' },
      })
    ).status(),
  ).toBe(403);
  expect(
    (
      await employee.request.post('/api/workforce/leave', {
        headers,
        data: {
          typeId: paidId,
          startDate: '2025-02-04',
          endDate: '2025-02-04',
          reason: 'Overlap attempt',
        },
      })
    ).status(),
  ).toBe(409);
  expect(
    (
      await employee.request.post('/api/workforce/leave', {
        headers,
        data: {
          typeId: paidId,
          startDate: '2025-02-10',
          endDate: '2025-02-12',
          reason: 'Over balance',
        },
      })
    ).status(),
  ).toBe(409);
  expect(
    (
      await employee.request.post('/api/workforce/leave', {
        headers,
        data: {
          typeId: paidId,
          startDate: '2025-02-08',
          endDate: '2025-02-09',
          reason: 'Weekend only',
        },
      })
    ).status(),
  ).toBe(400);
  await page.request.post('/api/payroll/2025-02/generate', { headers });
  let run = await (await page.request.get('/api/payroll/2025-02')).json();
  expect(run.snapshot.rows.find((r: any) => r.id === person.id).issues).toContain(
    'Pending leave or attendance correction',
  );
  expect(
    (
      await page.request.post('/api/payroll/2025-02/finalize', {
        headers,
        data: { digest: run.digest },
      })
    ).status(),
  ).toBe(409);
  expect(
    (
      await hr.request.patch(`/api/workforce/leave/${paid}`, {
        headers,
        data: { status: 'APPROVED', note: 'Approved by HR' },
      })
    ).status(),
  ).toBe(200);
  const unpaid = await requestLeave(unpaidId, '2025-02-05');
  await hr.request.patch(`/api/workforce/leave/${unpaid}`, {
    headers,
    data: { status: 'APPROVED', note: 'Approved by HR' },
  });
  // UTC shifts are within the same day in both the default browser timezone and Asia/Kolkata.
  for (const [day, hours] of [
    ['2025-02-03', 8],
    ['2025-02-06', 4],
  ] as const) {
    const r = await employee.request.post('/api/workforce/attendance/corrections', {
      headers,
      data: {
        day,
        checkIn: `${day}T08:00:00Z`,
        checkOut: `${day}T${String(8 + hours).padStart(2, '0')}:00:00Z`,
        reason: 'Forgot attendance entry',
      },
    });
    expect(r.status(), await r.text()).toBe(201);
    const id = (await r.json()).id;
    expect(
      (
        await employee.request.patch(`/api/workforce/attendance/corrections/${id}`, {
          headers,
          data: { status: 'APPROVED', note: 'Self approval' },
        })
      ).status(),
    ).toBe(403);
    expect(
      (
        await hr.request.patch(`/api/workforce/attendance/corrections/${id}`, {
          headers,
          data: { status: 'APPROVED', note: 'Verified work hours' },
        })
      ).status(),
    ).toBe(200);
  }
  const ownAttendance = await (
    await employee.request.get('/api/workforce/attendance?month=2025-02')
  ).json();
  expect(ownAttendance.rows).toHaveLength(2);
  expect(ownAttendance.rows.every((r: any) => r.employeeId === person.id)).toBe(true);
  await page.request.post('/api/payroll/2025-02/generate', { headers });
  run = await (await page.request.get('/api/payroll/2025-02')).json();
  let row = run.snapshot.rows.find((r: any) => r.id === person.id);
  expect(row).toMatchObject({
    divisor: 20,
    paidDays: 2.5,
    unpaidDays: 17.5,
    earningsMinor: 25000,
    deductionsMinor: 1000,
    netMinor: 24000,
    issues: [],
  });
  expect(
    (
      await page.request.put(`/api/payroll/2025-02/adjustments/${person.id}`, {
        headers,
        data: {
          components: [{ name: 'Bonus', kind: 'EARNING', amountMinor: 5000, prorate: false }],
          reason: 'Monthly delivery bonus',
        },
      })
    ).status(),
  ).toBe(200);
  expect(
    (
      await page.request.post('/api/payroll/2025-02/finalize', {
        headers,
        data: { digest: run.digest },
      })
    ).status(),
  ).toBe(409);
  await page.goto('/payroll');
  await page.getByLabel('Payroll month').fill('2025-02');
  await page.getByRole('button', { name: 'Recalculate draft' }).click();
  await expect(
    page.getByText('Draft calculated. Review every row before finalizing.'),
  ).toBeVisible();
  run = await (await page.request.get('/api/payroll/2025-02')).json();
  row = run.snapshot.rows.find((r: any) => r.id === person.id);
  expect(row.netMinor).toBe(29000);
  expect(
    (
      await hr.request.post('/api/payroll/2025-02/finalize', {
        headers,
        data: { digest: run.digest },
      })
    ).status(),
  ).toBe(403);
  const [sheet] = await Promise.all([
    page.waitForEvent('download'),
    page.getByRole('button', { name: 'Export salary sheet' }).click(),
  ]);
  expect(sheet.suggestedFilename()).toBe('salary-roster-2025-02.csv');
  await page.screenshot({ path: 'test-results/payroll-desktop.png', fullPage: true });
  await page.getByRole('button', { name: 'Finalize payroll' }).click();
  await page.getByRole('button', { name: 'Publish & lock payroll' }).click();
  await expect(
    page.getByText('Payroll finalized. Payslips are available to employees.'),
  ).toBeVisible();
  expect((await page.request.post('/api/payroll/2025-02/generate', { headers })).status()).toBe(
    409,
  );
  expect(
    (
      await employee.request.patch(`/api/workforce/leave/${paid}`, {
        headers,
        data: { status: 'CANCELLED', note: 'Cancel after payroll' },
      })
    ).status(),
  ).toBe(409);
  expect(
    (
      await page.request.put('/api/workforce/holidays/2025-02-03', {
        headers,
        data: { name: 'Retroactive holiday' },
      })
    ).status(),
  ).toBe(409);
  expect((await employee.request.get(`/api/payroll/payslips/2025-02/${owner.id}`)).status()).toBe(
    404,
  );
  expect(
    (await (await employee.request.get(`/api/payroll/payslips/2025-02/${person.id}`)).json()).row
      .netMinor,
  ).toBe(29000);
  await worker.goto('/payslips');
  await worker.getByRole('button', { name: 'View payslip' }).click();
  await expect(worker.getByRole('heading', { name: 'Net pay: $290.00' })).toBeVisible();
  const [slip] = await Promise.all([
    worker.waitForEvent('download'),
    worker.getByRole('button', { name: 'Download payslip', exact: true }).click(),
  ]);
  expect(slip.suggestedFilename()).toMatch(/^payslip-2025-02-EMP-.*\.html$/);
  await worker.getByRole('button', { name: 'Close dialog' }).click();
  // Policy changes cannot alter published payroll, including switching fractional currency units.
  await page.request.put('/api/workforce/policy', {
    headers,
    data: { ...policy, currency: 'JPY' },
  });
  expect(
    (await (await employee.request.get(`/api/payroll/payslips/2025-02/${person.id}`)).json()).policy
      .currency,
  ).toBe('USD');
  // Device pairing is single-use and tokens are scoped to ingestion, not HR or payroll APIs.
  expect(
    (await employee.request.post('/api/workforce/attendance/check-in', { headers })).status(),
  ).toBe(201);
  expect(
    (await employee.request.post('/api/workforce/attendance/check-in', { headers })).status(),
  ).toBe(409);
  const pair = await employee.request.post('/api/tracking/pair', {
    headers,
    data: { name: 'Test laptop' },
  });
  expect(pair.status()).toBe(201);
  const { code } = await pair.json();
  const device = await browser.newContext({ baseURL: process.env.E2E_BASE_URL });
  const redemption = await device.request.post('/api/tracking/redeem', { headers, data: { code } });
  expect(redemption.status()).toBe(201);
  const { token } = await redemption.json();
  const bearer = { ...headers, Authorization: `Bearer ${token}` };
  expect(
    (await device.request.post('/api/tracking/redeem', { headers, data: { code } })).status(),
  ).toBe(403);
  expect(
    (await device.request.get('/api/payroll/salaries?month=2025-02', { headers: bearer })).status(),
  ).toBe(401);
  expect(
    (await device.request.get('/api/tracking/device/config', { headers: bearer })).status(),
  ).toBe(200);
  const screenshot = await page.evaluate(() => {
    const c = document.createElement('canvas');
    c.width = 8;
    c.height = 8;
    return c.toDataURL('image/jpeg').split(',')[1];
  });
  const id = randomUUID();
  expect(
    (
      await device.request.post('/api/tracking/device/sample', {
        headers: bearer,
        data: { id, activeSeconds: 30, screenshot },
      })
    ).status(),
  ).toBe(201);
  expect(
    (
      await device.request.post('/api/tracking/device/sample', {
        headers: bearer,
        data: { id, activeSeconds: 30, screenshot },
      })
    ).status(),
  ).toBe(201);
  expect(
    (
      await device.request.post('/api/tracking/device/sample', {
        headers: bearer,
        data: { id: randomUUID(), activeSeconds: 30 },
      })
    ).status(),
  ).toBe(409);
  const image = await employee.request.get(`/api/tracking/screenshots/${id}`);
  expect(image.status()).toBe(200);
  expect(image.headers()['content-type']).toContain('image/jpeg');
  expect(
    (await device.request.get(`/api/tracking/screenshots/${id}`, { headers: bearer })).status(),
  ).toBe(401);
  await page.request.put('/api/workforce/policy', {
    headers,
    data: { ...policy, currency: 'JPY', screenshotsEnabled: false },
  });
  expect((await employee.request.get(`/api/tracking/screenshots/${id}`)).status()).toBe(404);
  const devices = await (await employee.request.get('/api/tracking/devices')).json();
  expect(
    (await employee.request.delete(`/api/tracking/devices/${devices[0].id}`, { headers })).status(),
  ).toBe(200);
  expect(
    (await device.request.get('/api/tracking/device/config', { headers: bearer })).status(),
  ).toBe(401);
  expect(
    (await employee.request.post('/api/workforce/attendance/check-out', { headers })).status(),
  ).toBe(201);
  expect(
    (await employee.request.post('/api/workforce/attendance/check-out', { headers })).status(),
  ).toBe(409);
  for (const route of [
    '/attendance',
    '/leave',
    '/policies',
    '/salaries',
    '/payroll',
    '/tracking',
  ]) {
    await page.setViewportSize({ width: 375, height: 900 });
    await page.goto(route);
    await expect(page.locator('h1')).toBeVisible();
    expect(
      await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth),
      route,
    ).toBe(true);
    await page.screenshot({ path: `test-results/${route.slice(1)}-mobile.png`, fullPage: true });
  }
  await page.getByRole('button', { name: 'Open navigation' }).click();
  await page.getByRole('button', { name: 'Log out', exact: true }).scrollIntoViewIfNeeded();
  await expect(page.getByRole('button', { name: 'Log out', exact: true })).toBeInViewport();
  await page.getByRole('button', { name: 'Close menu' }).click();
  await page.setViewportSize({ width: 1440, height: 1100 });
  await employee.close();
  await hr.close();
  await device.close();
}
