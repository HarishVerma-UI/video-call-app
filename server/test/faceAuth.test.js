// Face sign-in: passkeys (WebAuthn) for the web and Face-ID-locked device keys for the app.
import assert from 'node:assert/strict';
import { randomBytes } from 'node:crypto';
import { after, before, test } from 'node:test';
import { api, registerUser, startTestApp, wsClient, media } from './helpers.js';
import { softAuthenticator } from './softAuthenticator.js';
import { cborDecode } from '../src/auth/webauthn.js';

const ORIGIN = 'http://localhost:5173';
const H = { Origin: ORIGIN, 'User-Agent': 'Mozilla/5.0 (Windows NT 10.0) Chrome/130.0' };
let t;
before(async () => (t = await startTestApp({ config: { faceLimits: { perIp: 10_000, newAccounts: 10_000 } } })));
after(() => t.app.close());

const email = () => `face-${randomBytes(4).toString('hex')}@example.com`;
const call = (method, path, body, token, headers = H) => api(t.base, method, path, body, token, headers);

async function faceRegister(auth, name = 'Asha Face', e = email()) {
  const opts = await call('POST', '/api/auth/passkey/register/options', { name, email: e });
  assert.equal(opts.status, 200, JSON.stringify(opts.body));
  const credential = auth.create(opts.body.publicKey);
  return { res: await call('POST', '/api/auth/passkey/register/verify', { credential }), email: e, opts: opts.body.publicKey };
}
async function faceLogin(auth, getOpts = {}, headers = H) {
  const opts = await call('POST', '/api/auth/passkey/login/options', {}, null, headers);
  const credential = auth.get(opts.body.publicKey, getOpts);
  return { res: await call('POST', '/api/auth/passkey/login/verify', { credential }, null, headers), credential };
}

test('register with face: creates a password-free account and signs you in', async () => {
  const auth = softAuthenticator();
  const { res, opts } = await faceRegister(auth);
  assert.equal(opts.rp.id, 'localhost');
  assert.equal(opts.authenticatorSelection.userVerification, 'required');
  assert.equal(res.status, 201, JSON.stringify(res.body));
  assert.equal(res.body.user.hasPassword, false);
  const me = await call('GET', '/api/auth/me', null, res.body.token);
  assert.equal(me.body.user.name, 'Asha Face');
  const list = await call('GET', '/api/auth/credentials', null, res.body.token);
  assert.equal(list.body.credentials.length, 1);
  assert.equal(list.body.credentials[0].name, 'Chrome on Windows');
  assert.equal(list.body.credentials[0].kind, 'passkey');
});

test('sign in with face, without typing an email', async () => {
  const auth = softAuthenticator();
  const { res: reg } = await faceRegister(auth, 'Bala Face');
  const { res } = await faceLogin(auth);
  assert.equal(res.status, 200, JSON.stringify(res.body));
  assert.equal(res.body.user.id, reg.body.user.id);
});

test('a sign-in response can only be used once', async () => {
  const auth = softAuthenticator();
  await faceRegister(auth);
  const { credential } = await faceLogin(auth);
  const replay = await call('POST', '/api/auth/passkey/login/verify', { credential });
  assert.equal(replay.status, 400);
  assert.equal(replay.body.code, 'expired');
});

test('rejects: no face/PIN check, wrong site, forged signature, cloned key', async () => {
  const auth = softAuthenticator();
  await faceRegister(auth);

  assert.equal((await faceLogin(auth, { uv: false })).res.status, 401, 'user verification is required');

  assert.equal((await faceLogin(auth, { origin: 'https://evil.example' })).res.status, 401, 'origin must match');

  const opts = await call('POST', '/api/auth/passkey/login/options', {});
  const forged = auth.get(opts.body.publicKey);
  const sig = Buffer.from(forged.response.signature, 'base64url');
  sig[sig.length - 1] ^= 1;
  forged.response.signature = sig.toString('base64url');
  assert.equal((await call('POST', '/api/auth/passkey/login/verify', { credential: forged })).status, 401, 'signature');

  assert.equal((await faceLogin(auth, { counter: 50 })).res.status, 200);
  assert.equal((await faceLogin(auth, { counter: 10 })).res.status, 401, 'counter going backwards = cloned key');
});

test('registration is rejected without user verification or for another site', async () => {
  for (const variant of [{ uv: false }, { origin: 'https://evil.example' }, { rpId: 'evil.example' }]) {
    const auth = softAuthenticator();
    const opts = await call('POST', '/api/auth/passkey/register/options', { name: 'Nope', email: email() });
    const credential = auth.create(opts.body.publicKey, variant);
    const res = await call('POST', '/api/auth/passkey/register/verify', { credential });
    assert.equal(res.status, 400, JSON.stringify(variant));
    assert.equal(res.body.code, 'webauthn-failed');
  }
});

test('garbage input gives a clean 400, never a crash', async () => {
  const auth = softAuthenticator();
  for (let i = 0; i < 30; i++) {
    const opts = await call('POST', '/api/auth/passkey/register/options', { name: 'Fuzz', email: email() });
    const credential = auth.create(opts.body.publicKey);
    const att = Buffer.from(credential.response.attestationObject, 'base64url');
    const cut = att.subarray(0, Math.floor(Math.random() * att.length));
    credential.response.attestationObject = Buffer.concat([cut, randomBytes(i % 5)]).toString('base64url');
    const res = await call('POST', '/api/auth/passkey/register/verify', { credential });
    assert.equal(res.status, 400);
  }
  assert.throws(() => cborDecode(Buffer.from([0x5f])));
});

test('new-account options check the fields and duplicate emails', async () => {
  const bad = await call('POST', '/api/auth/passkey/register/options', { name: 'A', email: 'nope' });
  assert.equal(bad.status, 400);
  assert.ok(bad.body.fields.name && bad.body.fields.email);
  const u = await registerUser(t.base, 'Existing');
  const dup = await call('POST', '/api/auth/passkey/register/options', { name: 'Again', email: u.user.email.toUpperCase() });
  assert.equal(dup.status, 409);
});

test('face-only accounts: password sign-in fails the same way; a backup password can be added', async () => {
  const auth = softAuthenticator();
  const { res, email: e } = await faceRegister(auth);
  const pwLogin = await call('POST', '/api/auth/login', { email: e, password: 'anything-1' });
  assert.equal(pwLogin.status, 401);
  assert.equal(pwLogin.body.error, 'Email or password is incorrect.');

  // Can't remove the only way in.
  const [only] = (await call('GET', '/api/auth/credentials', null, res.body.token)).body.credentials;
  assert.equal((await call('DELETE', `/api/auth/credentials/${only.id}`, null, res.body.token)).status, 409);

  const set = await call('POST', '/api/auth/password', { newPassword: 'backup-pass-1' }, res.body.token);
  assert.equal(set.status, 200, JSON.stringify(set.body));
  assert.equal(set.body.user.hasPassword, true);
  // Adding a first password doesn't sign this or other devices out.
  assert.equal((await call('GET', '/api/auth/me', null, res.body.token)).status, 200);
  assert.equal((await call('POST', '/api/auth/login', { email: e, password: 'backup-pass-1' })).status, 200);
  assert.equal((await call('DELETE', `/api/auth/credentials/${only.id}`, null, res.body.token)).status, 200);
  assert.equal((await faceLogin(auth)).res.status, 401, 'removed passkey no longer works');
});

test('turn on face sign-in for an existing password account', async () => {
  const u = await registerUser(t.base, 'Chen Pw');
  const auth = softAuthenticator();
  const opts = await call('POST', '/api/auth/passkey/register/options', {}, u.token);
  assert.equal(opts.body.publicKey.user.name, u.user.email);
  const credential = auth.create(opts.body.publicKey);
  // Someone else can't finish your enrolment.
  const other = await registerUser(t.base, 'Other');
  assert.equal((await call('POST', '/api/auth/passkey/register/verify', { credential }, other.token)).status, 403);

  const opts2 = await call('POST', '/api/auth/passkey/register/options', {}, u.token);
  const added = await call('POST', '/api/auth/passkey/register/verify', { credential: auth.create(opts2.body.publicKey) }, u.token);
  assert.equal(added.status, 200, JSON.stringify(added.body));
  assert.equal(added.body.credentials.length, 1);
  const { res } = await faceLogin(auth, { id: added.body.credentials[0].id });
  assert.equal(res.body.user.id, u.user.id);
});

test('mobile app: register and sign in with a Face-ID-locked device key', async () => {
  const e = email();
  const reg = await call('POST', '/api/auth/device/register', { name: 'Dev Phone', email: e, deviceName: 'iPhone 15' }, null, {});
  assert.equal(reg.status, 201, JSON.stringify(reg.body));
  const { id, secret } = reg.body.device;
  assert.equal(reg.body.user.hasPassword, false);

  const ok = await call('POST', '/api/auth/device/login', { deviceId: id, secret }, null, {});
  assert.equal(ok.status, 200);
  assert.equal(ok.body.user.email, e);
  assert.equal((await call('POST', '/api/auth/device/login', { deviceId: id, secret: secret + 'x' }, null, {})).status, 401);
  assert.equal((await call('POST', '/api/auth/device/login', { deviceId: 'dev_nope', secret }, null, {})).status, 401);

  // Add a second phone from a signed-in session, then remove the first.
  const add = await call('POST', '/api/auth/device/register', { deviceName: 'Pixel 9' }, ok.body.token, {});
  assert.equal(add.status, 200);
  const list = (await call('GET', '/api/auth/credentials', null, ok.body.token)).body.credentials;
  assert.deepEqual(list.map((c) => c.name).sort(), ['Pixel 9', 'iPhone 15']);
  assert.equal((await call('DELETE', `/api/auth/credentials/${id}`, null, ok.body.token)).status, 200);
  assert.equal((await call('POST', '/api/auth/device/login', { deviceId: id, secret }, null, {})).status, 401);
  // Device secrets are never stored or listed.
  assert.ok(!JSON.stringify(list).includes('secret'));
});

test('Calls and Chat tabs: history, last message, and sending from outside a call', async () => {
  const a = await registerUser(t.base, 'Asha Calls');
  const b = await registerUser(t.base, 'Bala Calls');
  const room = `tabs-${randomBytes(3).toString('hex')}`;
  const ca = wsClient(t.base);
  const cb = wsClient(t.base);
  await ca.send({ type: 'join', roomId: room, token: a.token, media });
  await ca.next('welcome');
  await cb.send({ type: 'join', roomId: room, token: b.token, media });
  await cb.next('welcome');
  await ca.send({ type: 'chat', text: 'hello from the call' });
  await cb.next('chat');

  // Asha sends from the Chat tab; Bala, still in the call, gets it live.
  const post = await call('POST', `/api/rooms/${room}/messages`, { text: '  notes are in the doc  ' }, a.token);
  assert.equal(post.status, 201);
  const live = await cb.next('chat', (m) => m.message.text === 'notes are in the doc');
  assert.equal(live.message.userId, a.user.id);

  const chats = (await call('GET', '/api/chats', null, a.token)).body.chats;
  assert.equal(chats[0].roomId, room);
  assert.equal(chats[0].lastMessage.text, 'notes are in the doc');
  assert.deepEqual(chats[0].inCall.map((p) => p.name).sort(), ['Asha Calls', 'Bala Calls']);

  await ca.send({ type: 'leave' });
  await cb.next('peer-left');
  await new Promise((r) => setTimeout(r, 50));
  const calls = (await call('GET', '/api/calls', null, a.token)).body.calls;
  assert.equal(calls[0].roomId, room);
  assert.deepEqual(calls[0].with, ['Bala Calls']);
  assert.ok(calls[0].durationSec >= 0);
  assert.equal((await call('POST', `/api/rooms/${room}/messages`, { text: '   ' }, a.token)).status, 400);
  assert.equal((await call('GET', '/api/calls', null, null)).status, 401);
  ca.close();
  cb.close();
});
