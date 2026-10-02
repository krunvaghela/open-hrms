import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { randomBytes } from 'node:crypto';
import { existsSync } from 'node:fs';

const root = new URL('../', import.meta.url);
const envFile = new URL('../.env', import.meta.url);
if (existsSync(envFile)) process.loadEnvFile(envFile);
const base = `http://127.0.0.1:${process.env.API_PORT ?? '4000'}`;
const table = `_infrastructure_test_${randomBytes(8).toString('hex')}`;

function compose(...args) {
  return execFileSync('docker', ['compose', ...args], {
    cwd: root,
    encoding: 'utf8',
    timeout: 60000,
    stdio: ['ignore', 'pipe', 'inherit'],
  });
}

function query(sql) {
  const code = `const { Client } = require('pg');
    (async () => {
      const db = new Client();
      await db.connect();
      try { console.log(JSON.stringify((await db.query(${JSON.stringify(sql)})).rows)); }
      finally { await db.end(); }
    })().catch(() => process.exit(1));`;
  return JSON.parse(compose('exec', '-T', 'api', 'node', '-e', code));
}

async function health(path, status, body) {
  const response = await fetch(`${base}/api/health/${path}`, {
    signal: AbortSignal.timeout(6000),
  });
  assert.equal(response.status, status);
  assert.deepEqual(await response.json(), body);
}

console.log('This test briefly stops and recreates this project’s database container.');
try {
  const [role] = query(
    'SELECT rolsuper, rolcreaterole, rolcreatedb FROM pg_roles WHERE rolname = current_user',
  );
  assert.deepEqual(role, { rolsuper: false, rolcreaterole: false, rolcreatedb: false });
  query(`CREATE TABLE ${table} (value text NOT NULL)`);
  query(`INSERT INTO ${table} VALUES ('persistent')`);
  console.log('PASS application role can write without administrative privileges');

  compose('stop', 'postgres');
  await health('ready', 503, { status: 'unavailable', database: 'down' });
  await health('live', 200, { status: 'ok' });
  console.log('PASS readiness detects database outage while liveness remains available');

  compose('up', '-d', '--force-recreate', '--wait', 'postgres');
  await health('ready', 200, { status: 'ok', database: 'up' });
  assert.deepEqual(query(`SELECT value FROM ${table}`), [{ value: 'persistent' }]);
  console.log('PASS data survives container replacement and API reconnects');
} finally {
  compose('up', '-d', '--wait', 'postgres');
  query(`DROP TABLE IF EXISTS ${table}`);
}
