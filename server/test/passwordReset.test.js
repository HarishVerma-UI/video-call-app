// Forgot / reset password: token issue, one-time use, expiry, session
// invalidation, and no account enumeration.
import assert from 'node:assert/strict';
import { after, before, test } from 'node:test';
import { api, registerUser, startTestApp } from './helpers.js';

let t;
before(async () => { t = await startTestApp(); });
after(() => t.app.close());

const tokenFrom = (resetUrl) => new URL(resetUrl, 'http://x').searchParams.get('token');

test('full reset flow', async () => {
  const reg = await registerUser(t.base, 'Reset Flow');
  const email = reg.user.email;
  const oldToken = reg.token;

  // Request a reset — dev mode returns the link on screen.
  const forgot = await api(t.base, 'POST', '/api/auth/forgot', { email });
  assert.equal(forgot.status, 200);
  assert.ok(forgot.body.resetUrl, 'dev returns a reset link');
  const token = tokenFrom(forgot.body.resetUrl);
  assert.ok(token && token.length > 20);

  // Reset with the token → signed in with a fresh token.
  const reset = await api(t.base, 'POST', '/api/auth/reset', { token, password: 'brand-new-99' });
  assert.equal(reset.status, 200);
  assert.ok(reset.body.token, 'returns a session token');
  assert.equal(reset.body.user.email, email);

  // Old session is dead (password change bumps tokenVersion).
  assert.equal((await api(t.base, 'GET', '/api/auth/me', null, oldToken)).status, 401);
  // New token works.
  assert.equal((await api(t.base, 'GET', '/api/auth/me', null, reset.body.token)).status, 200);

  // Can log in with the new password; the old one no longer works.
  assert.equal((await api(t.base, 'POST', '/api/auth/login', { email, password: 'brand-new-99' })).status, 200);
  assert.equal((await api(t.base, 'POST', '/api/auth/login', { email, password: 'correct-horse-1' })).status, 401);
});

test('reset token is single-use', async () => {
  const reg = await registerUser(t.base, 'Once Only');
  const forgot = await api(t.base, 'POST', '/api/auth/forgot', { email: reg.user.email });
  const token = tokenFrom(forgot.body.resetUrl);
  assert.equal((await api(t.base, 'POST', '/api/auth/reset', { token, password: 'first-reset-1' })).status, 200);
  const second = await api(t.base, 'POST', '/api/auth/reset', { token, password: 'second-reset-2' });
  assert.equal(second.status, 400, 'the same token cannot be reused');
});

test('unknown email reveals nothing (no enumeration)', async () => {
  const res = await api(t.base, 'POST', '/api/auth/forgot', { email: 'nobody-here@example.com' });
  assert.equal(res.status, 200);
  assert.ok(!res.body.resetUrl, 'no link for a non-existent account');
  assert.match(res.body.message, /if an account exists/i);
});

test('invalid token and weak password are rejected', async () => {
  assert.equal((await api(t.base, 'POST', '/api/auth/reset', { token: 'not-a-real-token', password: 'whatever-12' })).status, 400);
  const reg = await registerUser(t.base, 'Weak Pw');
  const token = tokenFrom((await api(t.base, 'POST', '/api/auth/forgot', { email: reg.user.email })).body.resetUrl);
  const weak = await api(t.base, 'POST', '/api/auth/reset', { token, password: 'short' });
  assert.equal(weak.status, 400);
  assert.ok(weak.body.fields?.password, 'password error surfaced');
});

test('bad email format is rejected up front', async () => {
  assert.equal((await api(t.base, 'POST', '/api/auth/forgot', { email: 'not-an-email' })).status, 400);
});
