import assert from 'node:assert/strict';
import { existsSync } from 'node:fs';

const envFile = new URL('../.env', import.meta.url);
if (existsSync(envFile)) process.loadEnvFile(envFile);
const base = process.env.API_BASE_URL ?? `http://127.0.0.1:${process.env.API_PORT ?? '4000'}`;

for (const [path, expected] of [
  ['/api/health/live', { status: 'ok' }],
  ['/api/health/ready', { status: 'ok', database: 'up' }],
]) {
  const response = await fetch(`${base}${path}`, { signal: AbortSignal.timeout(5000) });
  assert.equal(response.status, 200, `${path} should return HTTP 200`);
  assert.deepEqual(await response.json(), expected);
  console.log(`PASS ${path}`);
}
