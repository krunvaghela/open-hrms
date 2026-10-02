import { spawnSync } from 'node:child_process';
import { randomBytes } from 'node:crypto';

const project = `open-hrms-e2e-${randomBytes(4).toString('hex')}`;
const screenshots = process.argv.includes('--screenshots');
const env = {
  ...process.env,
  // Test credentials are generated per run and never reuse the installation's secrets.
  POSTGRES_PASSWORD: randomBytes(32).toString('hex'),
  APP_DB_PASSWORD: randomBytes(32).toString('hex'),
  APP_ENCRYPTION_KEY: randomBytes(32).toString('hex'),
  API_PORT: '4100',
  WEB_PORT: '3100',
  APP_ORIGIN: 'http://localhost:3100',
  E2E_BASE_URL: 'http://localhost:3100',
  ALLOW_E2E_SETUP: '1',
  CAPTURE_DOCS_SCREENSHOTS: screenshots ? '1' : '0',
};
const args = ['compose', '-p', project, '-f', 'compose.yaml', '-f', 'compose.test.yaml'];
function run(command, args) {
  const result = spawnSync(command, args, { stdio: 'inherit', env });
  if (result.error) throw result.error;
  return result.status ?? 1;
}
let code = 1;
try {
  console.log('Starting isolated browser-test stack. Your main workspace is not modified.');
  if (run('docker', [...args, 'up', '--no-build', '-d', '--wait']) !== 0)
    throw new Error('Test stack failed to start');
  code = run('npx', [
    'playwright',
    'test',
    screenshots ? 'tests/product-screenshots.spec.ts' : 'tests/workspace.spec.ts',
  ]);
  if (code !== 0) run('docker', [...args, 'logs', '--tail', '50', 'api', 'web']);
} finally {
  // Only this run's uniquely named test project and test data are removed.
  const cleanup = run('docker', [...args, 'down', '-v']);
  if (cleanup !== 0) code = 1;
}
process.exitCode = code;
