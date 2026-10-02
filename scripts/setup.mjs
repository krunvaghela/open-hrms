import { randomBytes } from 'node:crypto';
import { readFileSync, writeFileSync, appendFileSync } from 'node:fs';

const target = new URL('../.env', import.meta.url);
const template = readFileSync(new URL('../.env.example', import.meta.url), 'utf8');
const content = template
  .replace(/^POSTGRES_PASSWORD=$/m, `POSTGRES_PASSWORD=${randomBytes(32).toString('hex')}`)
  .replace(/^APP_DB_PASSWORD=$/m, `APP_DB_PASSWORD=${randomBytes(32).toString('hex')}`)
  .replace(/^APP_ENCRYPTION_KEY=$/m, `APP_ENCRYPTION_KEY=${randomBytes(32).toString('hex')}`);

try {
  writeFileSync(target, content, { flag: 'wx', mode: 0o600 });
  console.log(
    'Created .env with unique database passwords. Start with docker compose up --build -d --wait.',
  );
} catch (error) {
  if (error.code !== 'EEXIST') throw error;
  const current = readFileSync(target, 'utf8');
  const additions = [];
  if (!/^APP_ENCRYPTION_KEY=/m.test(current))
    additions.push(`APP_ENCRYPTION_KEY=${randomBytes(32).toString('hex')}`);
  if (!/^WEB_PORT=/m.test(current)) additions.push('WEB_PORT=3000');
  if (!/^APP_ORIGIN=/m.test(current)) additions.push('APP_ORIGIN=http://127.0.0.1:3000');
  if (additions.length) appendFileSync(target, `\n${additions.join('\n')}\n`);
  console.log(
    'Existing configuration preserved; any missing web infrastructure settings were added.',
  );
}
