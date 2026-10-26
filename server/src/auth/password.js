// Password hashing with scrypt (built into Node — no native module to compile).
// Stored format:  scrypt$N$r$p$<salt base64>$<hash base64>
// Parameters are stored with the hash, so they can be raised later without
// breaking existing accounts.

import { randomBytes, scrypt as scryptCb, timingSafeEqual } from 'node:crypto';
import { promisify } from 'node:util';

const scrypt = promisify(scryptCb);
const N = 16384; // CPU/memory cost
const R = 8;
const P = 1;
const KEYLEN = 64;

export async function hashPassword(password) {
  const salt = randomBytes(16);
  const hash = await scrypt(password.normalize('NFKC'), salt, KEYLEN, { N, r: R, p: P, maxmem: 64 * 1024 * 1024 });
  return `scrypt$${N}$${R}$${P}$${salt.toString('base64')}$${hash.toString('base64')}`;
}

export async function verifyPassword(password, stored) {
  if (typeof stored !== 'string') return false;
  const parts = stored.split('$');
  if (parts.length !== 6 || parts[0] !== 'scrypt') return false;
  const [, n, r, p, saltB64, hashB64] = parts;
  const expected = Buffer.from(hashB64, 'base64');
  const actual = await scrypt(password.normalize('NFKC'), Buffer.from(saltB64, 'base64'), expected.length, {
    N: Number(n),
    r: Number(r),
    p: Number(p),
    maxmem: 64 * 1024 * 1024,
  });
  return actual.length === expected.length && timingSafeEqual(actual, expected);
}

/** A hash to compare against when the email doesn't exist, so response time doesn't reveal it. */
let dummyHash = null;
export async function dummyVerify(password) {
  dummyHash ??= await hashPassword('not-a-real-password');
  await verifyPassword(password, dummyHash);
  return false;
}
