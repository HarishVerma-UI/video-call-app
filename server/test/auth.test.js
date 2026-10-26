import assert from 'node:assert/strict';
import { after, before, test } from 'node:test';
import { TokenError, signToken, verifyToken } from '../src/auth/jwt.js';
import { hashPassword, verifyPassword } from '../src/auth/password.js';
import { api, startTestApp, TEST_SECRET } from './helpers.js';

let t;
before(async () => {
  t = await startTestApp();
});
after(async () => {
  await t.app.close();
});

const reg = (body) => api(t.base, 'POST', '/api/auth/register', body);
const login = (body) => api(t.base, 'POST', '/api/auth/login', body);

// ---- JWT ------------------------------------------------------------------
const opts = { secret: TEST_SECRET, issuer: 'huddle', audience: 'huddle-app' };

test('jwt: round-trips claims and rejects tampering, expiry and wrong keys', () => {
  const tok = signToken({ sub: 'u1', name: 'Asha' }, { ...opts, expiresInSec: 60 });
  const claims = verifyToken(tok, opts);
  assert.equal(claims.sub, 'u1');
  assert.equal(claims.name, 'Asha');

  const [h, p, s] = tok.split('.');
  const forged = Buffer.from(JSON.stringify({ ...claims, sub: 'admin' })).toString('base64url');
  assert.throws(() => verifyToken(`${h}.${forged}.${s}`, opts), TokenError);
  assert.throws(() => verifyToken(tok, { ...opts, secret: 'x'.repeat(40) }), /bad signature/);
  assert.throws(() => verifyToken(tok, { ...opts, audience: 'other' }), /audience/);
  assert.throws(() => verifyToken(tok, { ...opts, now: Date.now() + 3600_000 }), /expired/);
  assert.throws(() => verifyToken('a.b', opts), /malformed/);

  // The classic "alg: none" attack.
  const none = Buffer.from(JSON.stringify({ alg: 'none', typ: 'JWT' })).toString('base64url');
  assert.throws(() => verifyToken(`${none}.${p}.`, opts), TokenError);
});

test('jwt: refuses weak secrets', () => {
  assert.throws(() => signToken({ sub: 'x' }, { ...opts, secret: 'short', expiresInSec: 1 }), /32 characters/);
});

// ---- passwords --------------------------------------------------------------
test('password: hashes are salted and verify correctly', async () => {
  const h1 = await hashPassword('s3cret-pass');
  const h2 = await hashPassword('s3cret-pass');
  assert.notEqual(h1, h2, 'salted');
  assert.match(h1, /^scrypt\$16384\$8\$1\$/);
  assert.equal(await verifyPassword('s3cret-pass', h1), true);
  assert.equal(await verifyPassword('wrong-pass1', h1), false);
  assert.equal(await verifyPassword('s3cret-pass', 'garbage'), false);
});

// ---- routes -------------------------------------------------------------------
test('register: creates an account and returns a working token', async () => {
  const res = await reg({ name: '  Priya   Sharma ', email: 'Priya@Example.com', password: 'video-call-1' });
  assert.equal(res.status, 201);
  assert.equal(res.body.user.name, 'Priya Sharma');
  assert.equal(res.body.user.email, 'priya@example.com');
  assert.equal(res.body.user.passwordHash, undefined, 'hash must never leave the server');
  assert.ok(res.body.token.split('.').length === 3);

  const me = await api(t.base, 'GET', '/api/auth/me', null, res.body.token);
  assert.equal(me.status, 200);
  assert.equal(me.body.user.email, 'priya@example.com');

  const stored = await t.store.findByEmail('priya@example.com');
  assert.match(stored.passwordHash, /^scrypt\$/, 'stored hashed, not plain');
});

test('register: validates fields', async () => {
  const res = await reg({ name: 'A', email: 'nope', password: 'short' });
  assert.equal(res.status, 400);
  assert.ok(res.body.fields.name);
  assert.ok(res.body.fields.email);
  assert.ok(res.body.fields.password);

  const noDigit = await reg({ name: 'Arjun', email: 'arjun@example.com', password: 'onlyletters' });
  assert.equal(noDigit.status, 400);
  assert.match(noDigit.body.fields.password, /number/);
});

test('register: duplicate email (any case) is rejected', async () => {
  await reg({ name: 'Meera', email: 'meera@example.com', password: 'abcdefg1' });
  const dup = await reg({ name: 'Meera 2', email: 'MEERA@example.com', password: 'abcdefg1' });
  assert.equal(dup.status, 409);
  assert.ok(dup.body.fields.email);
});

test('login: right password works, wrong password and unknown email give the same error', async () => {
  await reg({ name: 'Rahul', email: 'rahul@example.com', password: 'rahul-pass-9' });
  const ok = await login({ email: 'RAHUL@example.com', password: 'rahul-pass-9' });
  assert.equal(ok.status, 200);
  assert.equal(ok.body.user.name, 'Rahul');
  assert.ok(ok.body.expiresAt);

  const wrong = await login({ email: 'rahul@example.com', password: 'nope-nope-1' });
  const unknown = await login({ email: 'ghost@example.com', password: 'nope-nope-1' });
  assert.equal(wrong.status, 401);
  assert.equal(unknown.status, 401);
  assert.equal(wrong.body.error, unknown.body.error, 'no account enumeration');

  const stored = await t.store.findByEmail('rahul@example.com');
  assert.ok(stored.lastLoginAt instanceof Date);
});

test('login: repeated failures are rate limited', async () => {
  await reg({ name: 'Sana', email: 'sana@example.com', password: 'sana-pass-1' });
  let last;
  for (let i = 0; i < 11; i++) last = await login({ email: 'sana@example.com', password: `wrong-${i}x` });
  assert.equal(last.status, 429);
  assert.ok(Number(last.headers.get('retry-after')) > 0);
  const evenCorrect = await login({ email: 'sana@example.com', password: 'sana-pass-1' });
  assert.equal(evenCorrect.status, 429, 'locked until the window passes');
});

test('me: rejects missing, malformed and forged tokens', async () => {
  assert.equal((await api(t.base, 'GET', '/api/auth/me')).status, 401);
  assert.equal((await api(t.base, 'GET', '/api/auth/me', null, 'garbage')).status, 401);
  const forged = signToken({ sub: 'someone' }, { ...opts, secret: 'z'.repeat(40), expiresInSec: 60 });
  assert.equal((await api(t.base, 'GET', '/api/auth/me', null, forged)).status, 401);
  // Valid signature but the user doesn't exist (e.g. deleted account).
  const ghost = signToken({ sub: 'deadbeefdeadbeefdeadbeef' }, { ...opts, expiresInSec: 60 });
  assert.equal((await api(t.base, 'GET', '/api/auth/me', null, ghost)).status, 401);
});

test('bad requests get clear errors, not crashes', async () => {
  const res = await fetch(`${t.http}/api/auth/login`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: '{oops' });
  assert.equal(res.status, 400);
  const wrongType = await fetch(`${t.http}/api/auth/login`, { method: 'POST', body: 'email=x' });
  assert.equal(wrongType.status, 415);
  const big = await fetch(`${t.http}/api/auth/register`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ name: 'x'.repeat(50000) }),
  });
  assert.equal(big.status, 413);
  assert.equal((await api(t.base, 'GET', '/api/nothing')).status, 404);
});
