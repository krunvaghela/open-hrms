import { expect, type Page, type Browser } from '@playwright/test';
import { randomUUID } from 'node:crypto';
const headers = { 'X-HRMS-Request': '1' };
export async function auditScreens(ownerPage: Page, browser: Browser) {
  const email = `audit-${randomUUID()}@example.test`,
    password = 'Screen audit temporary password 123';
  const created = await ownerPage.request.post('/api/employees', {
    headers,
    data: {
      name: 'Screen Audit Admin',
      email,
      password,
      role: 'SUPER_ADMIN',
      joiningDate: '2025-01-01',
    },
  });
  expect(created.status()).toBe(201);
  const context = await browser.newContext({ baseURL: process.env.E2E_BASE_URL });
  await context.request.post('/api/auth/login', { headers, data: { email, password } });
  await context.request.post('/api/auth/password', {
    headers,
    data: { currentPassword: password, newPassword: 'Screen audit personal password 123' },
  });
  const page = await context.newPage(),
    errors: string[] = [];
  page.on('pageerror', (e) => errors.push(e.message));
  page.on('response', (r) => {
    if (r.url().includes('/api/') && r.status() >= 400) errors.push(`${r.status()} ${r.url()}`);
  });
  async function layout(label: string) {
    expect(
      await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1),
      `${label}: page width`,
    ).toBe(true);
    await expect(page.locator('h1')).toBeVisible();
    expect(errors, `${label}: runtime/API errors`).toEqual([]);
  }
  async function modal(label: string) {
    const d = page.getByRole('dialog');
    await expect(d).toBeVisible();
    expect(
      await d.evaluate((el) => el.contains(document.activeElement)),
      `${label}: keyboard focus`,
    ).toBe(true);
    const metrics = await d.evaluate((el) => {
      const b = el.getBoundingClientRect(),
        body = el.querySelector('.dialog-body')!,
        style = getComputedStyle(body);
      return {
        left: b.left,
        right: b.right,
        top: b.top,
        bottom: b.bottom,
        width: innerWidth,
        height: innerHeight,
        padding: parseFloat(style.paddingLeft),
        overflow: body.scrollWidth > body.clientWidth + 1,
      };
    });
    expect(metrics.padding, `${label}: inset padding`).toBeGreaterThanOrEqual(20);
    expect(metrics.left).toBeGreaterThanOrEqual(0);
    expect(metrics.top).toBeGreaterThanOrEqual(0);
    expect(metrics.right).toBeLessThanOrEqual(metrics.width);
    expect(metrics.bottom).toBeLessThanOrEqual(metrics.height);
    expect(metrics.overflow, `${label}: dialog overflow`).toBe(false);
    const last = d.locator('button').last();
    await last.scrollIntoViewIfNeeded();
    await expect(last).toBeInViewport();
    await d.locator('.dialog-body').evaluate((el) => (el.scrollTop = 0));
    await page.screenshot({
      path: `test-results/audit-${label}.png`,
      fullPage: false,
      animations: 'disabled',
    });
    await page.keyboard.press('Escape');
    await expect(d).not.toBeVisible();
  }
  const routes = [
    '/',
    '/employees',
    '/access',
    '/attendance',
    '/leave',
    '/payroll',
    '/salaries',
    '/payslips',
    '/policies',
    '/tracking',
    '/settings',
    '/account',
  ];
  for (const width of [1440, 375]) {
    await page.setViewportSize({ width, height: 900 });
    for (const route of routes) {
      await page.goto(route);
      await layout(`${route}-${width}`);
      await page.screenshot({
        path: `test-results/audit-${route.slice(1) || 'overview'}-${width}.png`,
        fullPage: true,
      });
      if (route === '/employees') {
        await page.getByRole('button', { name: 'Add employee', exact: true }).first().click();
        await modal(`employee-create-${width}`);
        await page.getByRole('button', { name: 'Edit Priya Sharma', exact: true }).click();
        await modal(`employee-edit-${width}`);
      }
      if (route === '/access') {
        await page.getByRole('button', { name: 'Manage access' }).first().click();
        await modal(`account-access-${width}`);
      }
      if (route === '/attendance') {
        await page.getByRole('button', { name: 'Request correction' }).click();
        await modal(`attendance-correction-${width}`);
      }
      if (route === '/leave') {
        await page.getByRole('button', { name: 'Request leave', exact: true }).click();
        await modal(`request-leave-${width}`);
      }
      if (route === '/salaries') {
        await page.getByRole('button', { name: 'Set salary' }).first().click();
        await page.getByRole('button', { name: 'Add component', exact: true }).click();
        await page.getByRole('button', { name: 'Add component', exact: true }).click();
        await modal(`salary-structure-${width}`);
      }
      if (route === '/policies') {
        await page.getByRole('button', { name: 'Add leave type' }).click();
        await modal(`leave-policy-${width}`);
      }
      if (route === '/payroll') {
        await page.getByLabel('Payroll month').fill('');
        await expect(page.getByRole('button', { name: 'Generate salary roster' })).toBeDisabled();
        await expect(page.getByText('Select a payroll month to continue.')).toBeVisible();
        await page.getByLabel('Payroll month').fill('2026-10');
        const generate = page.getByRole('button', {
          name: /Generate salary roster|Recalculate draft/,
        });
        await generate.click();
        await expect(
          page.getByText('Draft calculated. Review every row before finalizing.'),
        ).toBeVisible();
        await page.getByRole('button', { name: 'Monthly adjustments' }).first().click();
        await page.getByRole('button', { name: 'Add component', exact: true }).click();
        await modal(`monthly-adjustment-${width}`);
        await page.getByRole('button', { name: 'Finalize payroll', exact: true }).click();
        await modal(`finalize-payroll-${width}`);
        await page.getByLabel('Payroll month').fill('2025-02');
        await page.getByRole('button', { name: 'View payslip' }).first().click();
        await modal(`published-payslip-${width}`);
      }
      if (route === '/settings') {
        await page.getByRole('button', { name: 'Email provider', exact: true }).click();
        await expect(page.getByLabel('SMTP host')).toBeVisible();
        await layout(`email-settings-${width}`);
        await page.screenshot({
          path: `test-results/audit-email-settings-${width}.png`,
          fullPage: true,
        });
      }
    }
    if (width === 375) await page.getByRole('button', { name: 'Open navigation' }).click();
    await page.getByRole('button', { name: 'Help & support' }).click();
    await modal(`help-${width}`);
    if (width === 375) await page.getByRole('button', { name: 'Close menu' }).click();
  }
  // An empty leave setup should explain what is needed, rather than open a dead-end form.
  const types = await (await page.request.get('/api/workforce/leave-types')).json();
  for (const t of types) {
    const { id, ...data } = t;
    await page.request.put(`/api/workforce/leave-types/${id}`, {
      headers,
      data: { ...data, active: false },
    });
  }
  await page.goto('/leave');
  await expect(page.getByRole('button', { name: 'Request leave', exact: true })).toBeDisabled();
  await expect(
    page.getByRole('heading', { name: 'Leave policies are not configured yet' }),
  ).toBeVisible();
  await expect(page.getByRole('link', { name: 'Configure leave policies' })).toBeVisible();
  expect(errors).toEqual([]);
  await context.close();
}
