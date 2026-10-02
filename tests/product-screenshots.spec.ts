import { test, expect } from '@playwright/test';
import { randomBytes, randomUUID } from 'node:crypto';
import { mkdir } from 'node:fs/promises';

// This fixture only runs against the disposable stack created by docs:screenshots.
// Never point it at a company installation. Every identity and amount is fictional.
test('capture public product screenshots with fictional data', async ({ page }) => {
  test.skip(
    process.env.ALLOW_E2E_SETUP !== '1' || process.env.CAPTURE_DOCS_SCREENSHOTS !== '1',
    'Run npm run docs:screenshots to create an isolated demo workspace.',
  );
  const headers = { 'X-HRMS-Request': '1' };
  const password = randomBytes(24).toString('hex');
  const state = await page.request.get('/api/auth/setup');
  expect(await state.json()).toEqual({ configured: false });
  const setup = await page.request.post('/api/auth/setup', {
    headers,
    data: {
      company: { name: 'Northstar Labs · Demo', city: 'Remote', timezone: 'UTC' },
      name: 'Maya Chen',
      email: 'maya@example.test',
      password,
    },
  });
  expect(setup.status()).toBe(201);
  const members = [
    ['Arjun Mehta', 'Engineering', 'Engineering Lead', 'ADMIN'],
    ['Sofia Martinez', 'People Operations', 'People Partner', 'HR'],
    ['Noah Williams', 'Engineering', 'Software Engineer', 'EMPLOYEE'],
    ['Priya Sharma', 'Design', 'Product Designer', 'EMPLOYEE'],
    ['Oliver Lee', 'Engineering', 'QA Engineer', 'EMPLOYEE'],
    ['Aisha Khan', 'Product', 'Product Manager', 'EMPLOYEE'],
    ['Lucas Silva', 'Customer Success', 'Customer Success Lead', 'EMPLOYEE'],
  ];
  for (const [name, department, designation, role] of members) {
    const r = await page.request.post('/api/employees', {
      headers,
      data: {
        name,
        department,
        designation,
        role,
        email: `${name.toLowerCase().replaceAll(' ', '.')}@example.test`,
        password: randomBytes(24).toString('hex'),
        joiningDate: '2025-01-06',
      },
    });
    expect(r.status()).toBe(201);
  }
  const employees = await (await page.request.get('/api/employees')).json();
  const owner = employees.find((e: { role: string }) => e.role === 'SUPER_ADMIN');
  expect(
    (
      await page.request.patch(`/api/employees/${owner.id}`, {
        headers,
        data: {
          name: owner.name,
          joiningDate: '2025-01-06',
          department: 'Management',
          designation: 'Operations Director',
        },
      })
    ).status(),
  ).toBe(200);
  const { policy } = await (await page.request.get('/api/workforce/policy')).json();
  expect(
    (
      await page.request.put('/api/workforce/policy', {
        headers,
        data: { ...policy, currency: 'USD', missingAttendance: 'PAID' },
      })
    ).status(),
  ).toBe(200);
  for (const [name, paid, annualDays] of [
    ['Annual leave', true, 20],
    ['Sick leave', true, 10],
    ['Unpaid leave', false, 30],
  ] as const) {
    expect(
      (
        await page.request.put(`/api/workforce/leave-types/${randomUUID()}`, {
          headers,
          data: { name, paid, annualDays, active: true },
        })
      ).status(),
    ).toBe(200);
  }
  let index = 0;
  for (const employee of employees) {
    expect(
      (
        await page.request.put(`/api/payroll/salaries/${employee.id}`, {
          headers,
          data: {
            effectiveMonth: '2025-01',
            endDate: null,
            components: [
              {
                name: 'Base salary',
                kind: 'EARNING',
                amountMinor: 420000 + index++ * 25000,
                prorate: true,
              },
              {
                name: 'Remote work allowance',
                kind: 'EARNING',
                amountMinor: 15000,
                prorate: false,
              },
              {
                name: 'Benefits contribution',
                kind: 'DEDUCTION',
                amountMinor: 5000,
                prorate: false,
              },
            ],
          },
        })
      ).status(),
    ).toBe(200);
  }
  const leaveTypes = await (await page.request.get('/api/workforce/leave-types')).json();
  const leaveDate = new Date();
  leaveDate.setUTCDate(leaveDate.getUTCDate() + 3);
  for (const [typeName, reason, approve] of [
    ['Annual leave', 'Family time', true],
    ['Unpaid leave', 'Personal appointment', false],
  ] as const) {
    while ([0, 6].includes(leaveDate.getUTCDay())) leaveDate.setUTCDate(leaveDate.getUTCDate() + 1);
    const day = leaveDate.toISOString().slice(0, 10);
    const type = leaveTypes.find((t: { name: string }) => t.name === typeName);
    const request = await page.request.post('/api/workforce/leave', {
      headers,
      data: { typeId: type.id, startDate: day, endDate: day, reason },
    });
    expect(request.status()).toBe(201);
    const { id } = await request.json();
    if (approve)
      expect(
        (
          await page.request.patch(`/api/workforce/leave/${id}`, {
            headers,
            data: { status: 'APPROVED', note: 'Demo approval' },
          })
        ).status(),
      ).toBe(200);
    leaveDate.setUTCDate(leaveDate.getUTCDate() + 1);
  }
  const today = new Date();
  const month = new Date(Date.UTC(today.getUTCFullYear(), today.getUTCMonth() - 1, 1))
    .toISOString()
    .slice(0, 7);
  expect((await page.request.post(`/api/payroll/${month}/generate`, { headers })).status()).toBe(
    201,
  );
  expect(
    (await page.request.post('/api/workforce/attendance/check-in', { headers })).status(),
  ).toBe(201);
  await mkdir('docs/images', { recursive: true });
  await page.setViewportSize({ width: 1440, height: 1000 });
  await page.request.post('/api/auth/logout', { headers });
  await page.goto('/login');
  await expect(page.getByRole('button', { name: 'Sign in', exact: true })).toBeVisible();
  await page.screenshot({ path: 'docs/images/login.png', animations: 'disabled' });
  await page.getByLabel('Work email', { exact: true }).fill('maya@example.test');
  await page.getByLabel('Password', { exact: true }).fill(password);
  await page.getByRole('button', { name: 'Sign in', exact: true }).click();
  await expect(page.getByRole('heading', { name: 'Your people, at a glance.' })).toBeVisible();
  for (const [route, image] of [
    ['/', 'overview'],
    ['/employees', 'employees'],
    ['/payroll', 'salary-roster'],
    ['/leave', 'leave'],
  ] as const) {
    await page.goto(route);
    await expect(page.locator('h1')).toBeVisible();
    if (route === '/employees')
      await expect(page.getByText('Showing 8 of 8 employees')).toBeVisible();
    if (route === '/payroll') {
      await page.getByLabel('Payroll month').fill(month);
      await expect(page.getByRole('heading', { name: 'Monthly salary register' })).toBeVisible();
      await expect(page.getByRole('button', { name: 'Monthly adjustments' }).first()).toBeVisible();
    }
    if (route === '/leave')
      await expect(page.getByText('Annual leave · Paid', { exact: true })).toBeVisible();
    await page.evaluate(() => document.fonts.ready);
    await page.locator('h1').click();
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(
      true,
    );
    await page.screenshot({
      path: `docs/images/${image}.png`,
      animations: 'disabled',
      fullPage: true,
    });
  }
});
