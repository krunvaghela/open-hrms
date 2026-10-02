import { _electron as electron, expect } from '@playwright/test';
import { createServer } from 'node:http';
import { mkdtemp, rm, mkdir } from 'node:fs/promises';
import { createRequire } from 'node:module';
import os from 'node:os';
import path from 'node:path';
import assert from 'node:assert/strict';
const require = createRequire(import.meta.url);
let config = {
  enabled: true,
  checkedIn: false,
  screenshotsEnabled: true,
  intervalMinutes: 10,
  retentionDays: 7,
};
let samples = 0;
const server = createServer((req, res) => {
  res.setHeader('Content-Type', 'application/json');
  if (req.url === '/api/tracking/redeem')
    res.end(JSON.stringify({ token: 'a'.repeat(64), name: 'Onboarding Tester' }));
  else if (req.url === '/api/tracking/device/config') res.end(JSON.stringify(config));
  else if (req.url === '/api/tracking/device/sample') {
    samples++;
    res.end('{}');
  } else {
    res.statusCode = 404;
    res.end('{}');
  }
});
await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
const origin = `http://127.0.0.1:${server.address().port}`;
const data = await mkdtemp(path.join(os.tmpdir(), 'hrms-onboarding-test-'));
let app;
try {
  app = await electron.launch({
    args: [path.resolve('desktop/main.cjs'), `--user-data-dir=${data}`],
    executablePath: require('../desktop/node_modules/electron'),
  });
  // Isolate system permission tests: never prompt for or capture the user's actual screen.
  await app.evaluate(({ systemPreferences, desktopCapturer }) => {
    systemPreferences.getMediaAccessStatus = () => 'denied';
    desktopCapturer.getSources = async () => [
      { id: 'mock-display', name: 'Test display', thumbnail: { isEmpty: () => false } },
    ];
  });
  const page = await app.firstWindow();
  await page.locator('#url').fill(origin);
  await page.locator('#code').fill('b'.repeat(64));
  await page.getByRole('button', { name: 'Pair this computer' }).click();
  await expect(page.locator('#company-status')).toHaveText('Enabled');
  await expect(page.locator('#attendance-status')).toHaveText('Not checked in');
  await expect(page.locator('#permission-status')).toHaveText('Blocked');
  await expect(page.getByRole('button', { name: 'Start tracking', exact: true })).toBeDisabled();
  await expect(page.getByRole('button', { name: 'Open Attendance', exact: true })).toBeVisible();
  const denied = await page.evaluate(() => window.hrms.start('mock-display', true));
  assert.match(denied.error, /not checked in/);
  config = { ...config, checkedIn: true };
  await page.getByRole('button', { name: 'Refresh setup checks' }).click();
  await expect(page.locator('#attendance-status')).toHaveText('Checked in');
  await page.getByRole('button', { name: 'Load / retry displays' }).click();
  await expect(page.getByRole('alert')).toContainText('Screen Recording is blocked');
  await app.evaluate(({ systemPreferences }) => {
    systemPreferences.getMediaAccessStatus = () => 'granted';
  });
  await page.getByRole('button', { name: 'Refresh setup checks' }).click();
  await expect(page.locator('#permission-status')).toHaveText('Allowed');
  await page.getByRole('button', { name: 'Load / retry displays' }).click();
  await page.getByLabel('Display to share').selectOption('mock-display');
  await page.locator('#consent').check();
  await expect(page.getByRole('button', { name: 'Start tracking', exact: true })).toBeEnabled();
  await mkdir('test-results', { recursive: true });
  await page.screenshot({ path: 'test-results/desktop-onboarding-ready.png', fullPage: true });
  await page.getByRole('button', { name: 'Start tracking', exact: true }).click();
  await expect(page.locator('#status')).toContainText('Tracking active');
  await page.getByRole('button', { name: 'Pause tracking' }).click();
  await expect(page.locator('#status')).toContainText('Tracking paused');
  config = { ...config, screenshotsEnabled: false };
  await app.evaluate(({ systemPreferences }) => {
    systemPreferences.getMediaAccessStatus = () => 'denied';
  });
  await page.getByRole('button', { name: 'Refresh setup checks' }).click();
  await expect(page.locator('#permission-status')).toHaveText('Not required');
  await expect(page.getByRole('button', { name: 'Start tracking', exact: true })).toBeEnabled();
  config = { ...config, enabled: false };
  await page.getByRole('button', { name: 'Refresh setup checks' }).click();
  await expect(page.locator('#company-status')).toHaveText('Disabled');
  await expect(page.getByRole('button', { name: 'Start tracking', exact: true })).toBeDisabled();
  assert.equal(samples, 0);
  console.log(
    'PASS onboarding: automatic checks, enabled-but-not-checked-in, denied/recovered permission, display selection, start/pause, and no-permission-needed mode. OS capture mocked; no actual screenshots or attendance changes.',
  );
} finally {
  if (app) await app.close();
  await new Promise((resolve) => server.close(resolve));
  await rm(data, { recursive: true, force: true });
}
