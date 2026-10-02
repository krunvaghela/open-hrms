import { auditScreens } from './screen-audit';
import { checkWorkforce } from './workforce-checks';
import { test, expect, type APIRequestContext } from '@playwright/test';
const headers = { 'X-HRMS-Request': '1' };
const owner = { email: 'owner@example.test', password: 'Owner initial passphrase 123' };
const temporary = 'Temporary passphrase 123';
const employeePassword = 'Employee personal passphrase 123';
const person = (name: string, email: string, role = 'EMPLOYEE') => ({
  name,
  email,
  password: temporary,
  role,
  joiningDate: '2026-10-01',
  department: 'Engineering',
  designation: 'Software Engineer',
});

test('setup, employee management, sessions, settings, responsive UI, and server authorization', async ({
  page,
  browser,
}) => {
  test.skip(
    process.env.ALLOW_E2E_SETUP !== '1',
    'Use npm run test:e2e to provision an isolated database.',
  );
  const state = await page.request.get('/api/auth/setup');
  expect(await state.json()).toEqual({ configured: false });
  const firstPage = await page.goto('/');
  expect(firstPage?.headers()['x-frame-options']).toBe('DENY');
  expect(firstPage?.headers()['x-content-type-options']).toBe('nosniff');
  expect(firstPage?.headers()['referrer-policy']).toBe('same-origin');
  await expect(page).toHaveURL(/\/setup$/);
  await page.screenshot({ path: 'test-results/setup-desktop.png', fullPage: true });
  await page.setViewportSize({ width: 375, height: 812 });
  await expect(page.getByRole('heading', { name: 'Make room for your team.' })).toBeVisible();
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(
    true,
  );
  await page.screenshot({ path: 'test-results/setup-mobile.png', fullPage: true });
  await page.setViewportSize({ width: 1440, height: 1100 });
  await page.getByLabel('Company name', { exact: true }).fill('Ayelite Technologies');
  await page.getByLabel('State / region').fill('Gujarat');
  await page.getByLabel('City', { exact: true }).fill('Ahmedabad');
  await page.getByRole('button', { name: 'Continue', exact: true }).click();
  await page.getByLabel('Your full name').fill('Krunal Patel');
  await page.getByLabel('Work email', { exact: true }).fill(owner.email);
  await page.getByLabel('Password', { exact: true }).fill(owner.password);
  await page.getByRole('button', { name: 'Create workspace' }).click();
  await expect(page.getByRole('heading', { name: 'Your people, at a glance.' })).toBeVisible();
  const cookies = await page.context().cookies();
  const sessionCookie = cookies.find((c) => c.name === 'hrms_session');
  expect(sessionCookie?.httpOnly).toBe(true);
  expect(sessionCookie?.sameSite).toBe('Lax');
  expect(
    (
      await page.request.post('/api/auth/setup', {
        headers,
        data: { company: { name: 'Overwrite' }, name: 'Bad Actor', ...owner },
      })
    ).status(),
  ).toBe(409);
  expect(
    (
      await page.request.post('/api/employees', {
        data: person('Blocked Account', 'blocked@example.test'),
      })
    ).status(),
  ).toBe(403);
  expect(
    (
      await page.request.post('/api/employees', {
        headers: { ...headers, Origin: 'https://external.invalid' },
        data: person('Blocked Account', 'blocked@example.test'),
      })
    ).status(),
  ).toBe(403);

  await page.getByRole('button', { name: 'Add employee', exact: true }).first().click();
  const dialog = page.getByRole('dialog');
  await dialog.getByLabel('Full name').fill('Priya Sharma');
  await dialog.getByLabel('Work email', { exact: true }).fill('priya@example.test');
  await dialog.getByLabel('Department', { exact: true }).fill('Engineering');
  await dialog.getByLabel('Designation').fill('Software Engineer');
  await dialog.getByLabel('Joining date').fill('2026-10-01');
  await dialog.getByLabel('Temporary password').fill(temporary);
  await dialog.getByRole('button', { name: 'Add employee', exact: true }).click();
  await expect(dialog).not.toBeVisible();

  const create = async (name: string, email: string, role: string) => {
    const result = await page.request.post('/api/employees', {
      headers,
      data: person(name, email, role),
    });
    expect(result.status()).toBe(201);
    return result.json();
  };
  const admin = await create('Arjun Mehta', 'arjun@example.test', 'ADMIN');
  const hr = await create('Riya Desai', 'riya@example.test', 'HR');
  const engineering = await create('Dev Shah', 'dev@example.test', 'EMPLOYEE');
  await page.goto('/employees');
  await expect(page.getByRole('heading', { name: 'Employee directory.' })).toBeVisible();
  await expect(page.getByRole('cell', { name: 'Priya Sharma priya@example.test' })).toBeVisible();
  await page.getByRole('button', { name: 'Edit Priya Sharma' }).click();
  await dialog.getByLabel('Designation').fill('Senior Software Engineer');
  await dialog.getByLabel('Reporting manager').selectOption(admin.id);
  await dialog.getByRole('button', { name: 'Save changes' }).click();
  await expect(dialog).not.toBeVisible();
  await page.reload();
  await expect(page.getByText('Senior Software Engineer', { exact: true })).toBeVisible();
  await page.getByLabel('Search employees', { exact: true }).fill('Priya');
  await expect(page.getByText('Showing 1 of 5 employees')).toBeVisible();
  const [download] = await Promise.all([
    page.waitForEvent('download'),
    page.getByRole('button', { name: 'Export directory' }).click(),
  ]);
  expect(download.suggestedFilename()).toBe('employees.csv');
  await page.getByLabel('Search employees', { exact: true }).fill('');
  await page.getByRole('button', { name: 'Filters', exact: true }).click();
  await page.getByLabel('Department', { exact: true }).selectOption('Engineering');
  await expect(page.getByText('Showing 4 of 5 employees')).toBeVisible();
  await page.getByRole('button', { name: 'Reset filters' }).click();
  await page.screenshot({ path: 'test-results/employees-desktop.png', fullPage: true });

  await page.goto('/settings');
  await page.getByLabel('City', { exact: true }).fill('Surat');
  await page.getByRole('button', { name: 'Save changes' }).click();
  await expect(page.getByText('Company details saved.')).toBeVisible();
  await page.reload();
  await expect(page.getByLabel('City', { exact: true })).toHaveValue('Surat');
  await page.getByRole('button', { name: 'Email provider', exact: true }).click();
  await page.getByLabel('SMTP host').fill('127.0.0.1');
  await page.getByLabel('Port', { exact: true }).fill('65534');
  await page.getByLabel('Username', { exact: true }).fill('smtp-user');
  await page.getByLabel('SMTP password', { exact: true }).fill('test-provider-secret');
  await page.getByLabel('Sender email').fill('hr@example.test');
  await page.getByRole('button', { name: 'Save changes' }).click();
  await expect(
    page.getByText('Email settings saved. You can now send a test email.'),
  ).toBeVisible();
  const settings = await (await page.request.get('/api/settings/email')).json();
  expect(settings.hasPassword).toBe(true);
  expect(JSON.stringify(settings)).not.toContain('test-provider-secret');
  // Deliberately unreachable loopback provider: verify useful failure without sending mail externally.
  await page.getByRole('button', { name: 'Send test email' }).click();
  await expect(
    page.getByRole('alert').filter({ hasText: 'Could not send the test email' }),
  ).toBeVisible();

  const ownerId = (await (await page.request.get('/api/auth/me')).json()).user.id;
  expect(
    (
      await page.request.patch(`/api/users/${ownerId}/access`, {
        headers,
        data: { role: 'EMPLOYEE', active: true },
      })
    ).status(),
  ).toBe(409);
  const anonymous = await browser.newContext();
  const anonymousRequest = anonymous.request;
  expect((await anonymousRequest.get(`${process.env.E2E_BASE_URL}/api/employees`)).status()).toBe(
    401,
  );
  const employee = await browser.newContext({ baseURL: process.env.E2E_BASE_URL });
  const employeePage = await employee.newPage();
  await employeePage.goto('/login');
  await employeePage.getByLabel('Work email', { exact: true }).fill('priya@example.test');
  await employeePage.getByLabel('Password', { exact: true }).fill(temporary);
  await employeePage.getByRole('button', { name: 'Sign in', exact: true }).click();
  await expect(
    employeePage.getByRole('heading', { name: 'Make this account yours.' }),
  ).toBeVisible();
  expect((await employee.request.get('/api/employees')).status()).toBe(403);
  await employeePage.getByLabel('Current password', { exact: true }).fill(temporary);
  await employeePage.getByLabel('New password', { exact: true }).fill(employeePassword);
  await employeePage.getByRole('button', { name: 'Save password & continue' }).click();
  await expect(
    employeePage.getByRole('heading', { name: 'Your people, at a glance.' }),
  ).toBeVisible();
  const records = await (await employee.request.get('/api/employees')).json();
  expect(records).toHaveLength(1);
  expect(records[0].email).toBe('priya@example.test');
  expect(
    (
      await employee.request.post('/api/employees', {
        headers,
        data: person('Unauthorized', 'unauthorized@example.test'),
      })
    ).status(),
  ).toBe(403);
  expect(
    (
      await employee.request.patch(`/api/employees/${admin.id}`, {
        headers,
        data: { name: 'Tampered' },
      })
    ).status(),
  ).toBe(403);
  expect((await employee.request.get('/api/settings/email')).status()).toBe(403);
  expect(
    (
      await employee.request.patch(`/api/users/${records[0].id}/access`, {
        headers,
        data: { role: 'SUPER_ADMIN', active: true },
      })
    ).status(),
  ).toBe(403);
  await employeePage.goto('/settings');
  await expect(
    employeePage.getByRole('heading', { name: 'This space is for your Super Admin.' }),
  ).toBeVisible();
  const oldToken = (await employee.cookies()).find((c) => c.name === 'hrms_session')!.value;
  await employee.request.post('/api/auth/logout', { headers });
  expect(
    (
      await anonymousRequest.get(`${process.env.E2E_BASE_URL}/api/auth/me`, {
        headers: { Cookie: `hrms_session=${oldToken}` },
      })
    ).status(),
  ).toBe(401);
  const login = await employee.request.post('/api/auth/login', {
    headers,
    data: { email: 'priya@example.test', password: employeePassword },
  });
  expect(login.status()).toBe(201);
  await page.request.patch(`/api/users/${records[0].id}/access`, {
    headers,
    data: { role: 'EMPLOYEE', active: false },
  });
  expect((await employee.request.get('/api/auth/me')).status()).toBe(401);
  expect(
    (
      await employee.request.post('/api/auth/login', {
        headers,
        data: { email: 'priya@example.test', password: employeePassword },
      })
    ).status(),
  ).toBe(401);
  await page.request.patch(`/api/users/${records[0].id}/access`, {
    headers,
    data: { role: 'EMPLOYEE', active: true },
  });

  for (const user of [admin, hr]) {
    const context = await browser.newContext({ baseURL: process.env.E2E_BASE_URL });
    await context.request.post('/api/auth/login', {
      headers,
      data: { email: user.email, password: temporary },
    });
    expect(
      (
        await context.request.post('/api/auth/password', {
          headers,
          data: { currentPassword: temporary, newPassword: 'Personal account passphrase 123' },
        })
      ).status(),
    ).toBe(201);
    expect(
      (
        await context.request.post('/api/employees', {
          headers,
          data: person('Escalated Account', `escalated-${user.role}@example.test`, 'SUPER_ADMIN'),
        })
      ).status(),
    ).toBe(403);
    expect(
      (
        await context.request.patch(`/api/users/${user.id}/access`, {
          headers,
          data: { role: 'SUPER_ADMIN', active: true },
        })
      ).status(),
    ).toBe(403);
    expect((await context.request.get('/api/employees')).status()).toBe(200);
    await context.close();
  }
  await page.goto('/');
  await expect(page.getByRole('heading', { name: 'Your people, at a glance.' })).toBeVisible();
  await page.screenshot({ path: 'test-results/dashboard-desktop.png', fullPage: true });
  for (const width of [375, 768, 1024]) {
    await page.setViewportSize({ width, height: 900 });
    expect(
      await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth),
    ).toBe(true);
    if (width === 375) {
      await page.getByRole('button', { name: 'Open navigation' }).click();
      await page.getByRole('link', { name: 'Employees', exact: false }).first().click();
      await expect(page.getByRole('heading', { name: 'Employee directory.' })).toBeVisible();
      expect(
        await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth),
      ).toBe(true);
      await page.screenshot({ path: 'test-results/employees-mobile.png', fullPage: true });
      await page.goto('/');
    }
  }
  await checkWorkforce(page, browser);
  await auditScreens(page, browser);
  await anonymous.close();
  await employee.close();
});
