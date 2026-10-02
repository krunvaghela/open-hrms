import {
  createCipheriv,
  createDecipheriv,
  createHash,
  randomBytes,
  scrypt,
  timingSafeEqual,
} from 'node:crypto';

function derive(value: string, salt: string): Promise<Buffer> {
  return new Promise((resolve, reject) =>
    scrypt(value, salt, 64, { N: 131072, r: 8, p: 1, maxmem: 256 * 1024 * 1024 }, (error, key) =>
      error ? reject(error) : resolve(key),
    ),
  );
}
export async function hashPassword(value: string): Promise<string> {
  const salt = randomBytes(16).toString('hex');
  return `scrypt:${salt}:${(await derive(value, salt)).toString('hex')}`;
}
export async function verifyPassword(value: string, stored: string): Promise<boolean> {
  const [, salt, hash] = stored.split(':');
  const key = await derive(value, salt);
  const expected = Buffer.from(hash, 'hex');
  return key.length === expected.length && timingSafeEqual(key, expected);
}
export const tokenHash = (value: string) => createHash('sha256').update(value).digest('hex');
function encryptionKey(): Buffer {
  const value = process.env.APP_ENCRYPTION_KEY ?? '';
  if (!/^[a-f0-9]{64}$/i.test(value))
    throw new Error('APP_ENCRYPTION_KEY must be 32 random bytes encoded as hex');
  return Buffer.from(value, 'hex');
}
export function validateEncryptionKey(): void {
  encryptionKey();
}
export function encrypt(value: string): string {
  const iv = randomBytes(12);
  const cipher = createCipheriv('aes-256-gcm', encryptionKey(), iv);
  const ciphertext = Buffer.concat([cipher.update(value, 'utf8'), cipher.final()]);
  return [iv, cipher.getAuthTag(), ciphertext].map((value) => value.toString('base64')).join('.');
}
export function decrypt(value: string): string {
  const [iv, tag, ciphertext] = value.split('.').map((value) => Buffer.from(value, 'base64'));
  const decipher = createDecipheriv('aes-256-gcm', encryptionKey(), iv);
  decipher.setAuthTag(tag);
  return Buffer.concat([decipher.update(ciphertext), decipher.final()]).toString('utf8');
}
