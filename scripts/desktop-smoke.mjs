import { _electron as electron } from '@playwright/test';
import { mkdtemp, rm, mkdir } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
const require = createRequire(import.meta.url);
const data = await mkdtemp(path.join(os.tmpdir(), 'hrms-desktop-test-'));
let app;
try {
  app = await electron.launch({
    args: [path.resolve('desktop/main.cjs'), `--user-data-dir=${data}`],
    executablePath: require('../desktop/node_modules/electron'),
  });
  const page = await app.firstWindow();
  await page.getByRole('button', { name: 'Pair this computer' }).waitFor();
  assert.equal(await page.evaluate(() => typeof window.require), 'undefined');
  assert.equal(await page.evaluate(() => typeof window.process), 'undefined');
  assert.equal((await page.evaluate(() => window.hrms.state())).value.running, false);
  const invalid = await page.evaluate(() =>
    window.hrms.pair('http://unsafe.example.test', 'a'.repeat(64)),
  );
  assert.equal(invalid.ok, false);
  assert.match(invalid.error, /HTTPS/);
  const start = await page.evaluate(() => window.hrms.start('', true));
  assert.equal(start.ok, false);
  await mkdir('test-results', { recursive: true });
  await page.screenshot({ path: 'test-results/desktop-tracker.png' });
  console.log(
    'PASS desktop launch, sandbox, pairing screen, insecure-origin rejection, and unpaired tracking rejection. No screen capture started.',
  );
} finally {
  if (app) await app.close();
  await rm(data, { recursive: true, force: true });
}
