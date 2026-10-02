import { spawnSync } from 'node:child_process';
import { randomBytes } from 'node:crypto';

const project = `open-hrms-e2e-${randomBytes(4).toString('hex')}`;
const env = {
  ...process.env,
  API_PORT: '4100',
  WEB_PORT: '3100',
  APP_ORIGIN: 'http://localhost:3100',
  E2E_BASE_URL: 'http://localhost:3100',
  ALLOW_E2E_SETUP: '1',
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
  code = run('npx', ['playwright', 'test']);
  if (code !== 0) run('docker', [...args, 'logs', '--tail', '50', 'api', 'web']);
} finally {
  // Only this run's uniquely named test project and test data are removed.
  const cleanup = run('docker', [...args, 'down', '-v']);
  if (cleanup !== 0) code = 1;
}
process.exitCode = code;
