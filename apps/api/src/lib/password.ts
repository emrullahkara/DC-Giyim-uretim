import { randomBytes, scrypt as _scrypt, timingSafeEqual, createHash } from 'node:crypto';
import { promisify } from 'node:util';

const scrypt = promisify(_scrypt) as (pw: string, salt: Buffer, len: number, opts: object) => Promise<Buffer>;

// scrypt (N=2^15, r=8, p=1) — bellek-zor, yerel bağımlılık gerektirmez.
const PARAMS = { N: 32768, r: 8, p: 1, maxmem: 64 * 1024 * 1024 };
const KEYLEN = 64;

export async function hashPassword(password: string): Promise<string> {
  const salt = randomBytes(16);
  const key = await scrypt(password.normalize('NFKC'), salt, KEYLEN, PARAMS);
  return `scrypt$${PARAMS.N}$${PARAMS.r}$${PARAMS.p}$${salt.toString('base64')}$${key.toString('base64')}`;
}

export async function verifyPassword(password: string, stored: string): Promise<boolean> {
  const parts = stored.split('$');
  if (parts.length !== 6 || parts[0] !== 'scrypt') return false;
  const [, n, r, p, saltB64, keyB64] = parts;
  const salt = Buffer.from(saltB64, 'base64');
  const expected = Buffer.from(keyB64, 'base64');
  const key = await scrypt(password.normalize('NFKC'), salt, expected.length, {
    N: Number(n), r: Number(r), p: Number(p), maxmem: 64 * 1024 * 1024,
  });
  return key.length === expected.length && timingSafeEqual(key, expected);
}

// Zamanlama saldırısına karşı: kullanıcı yoksa da aynı sürede cevap ver.
let dummyHash: Promise<string> | null = null;
export function getDummyHash() {
  dummyHash ??= hashPassword(randomBytes(16).toString('hex'));
  return dummyHash;
}

export function newToken(): string {
  return randomBytes(32).toString('base64url');
}

export function sha256(value: string): string {
  return createHash('sha256').update(value).digest('hex');
}

const COMMON = ['123456', 'password', 'qwerty', 'sifre', 'şifre', 'parola', '111111', 'abc123', 'tekstil'];

// Şifre politikası: en az 10 karakter, harf + rakam, yaygın şifre içermez.
export function passwordProblem(pw: string, email?: string): string | null {
  if (pw.length < 10) return 'Şifre en az 10 karakter olmalı.';
  if (pw.length > 128) return 'Şifre en fazla 128 karakter olabilir.';
  if (!/[A-Za-zÇĞİÖŞÜçğıöşü]/.test(pw) || !/\d/.test(pw)) return 'Şifre hem harf hem rakam içermeli.';
  const lower = pw.toLocaleLowerCase('tr');
  if (COMMON.some((c) => lower.includes(c))) return 'Bu şifre çok kolay tahmin edilir.';
  if (email && lower.includes(email.split('@')[0].toLocaleLowerCase('tr'))) return 'Şifre e-posta adınızı içermemeli.';
  return null;
}
