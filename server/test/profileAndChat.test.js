import assert from 'node:assert/strict';
import { after, before, test } from 'node:test';
import { createMemoryMessageStore } from '../src/db/messageStore.js';
import { api, media, registerUser, startTestApp, wsClient } from './helpers.js';

let t;
before(async () => {
  t = await startTestApp({ config: { maxPeersPerRoom: 6 } });
});
after(async () => {
  await t.app.close();
});

const patchMe = (token, body) => api(t.base, 'PATCH', '/api/auth/me', body, token);
const changePw = (token, body) => api(t.base, 'POST', '/api/auth/password', body, token);

// ---- profile -------------------------------------------------------------------

test('profile: rename returns a fresh token and the new name everywhere', async () => {
  const a = await registerUser(t.base, 'Asha');
  const res = await patchMe(a.token, { name: '  Asha   Verma ' });
  assert.equal(res.status, 200);
  assert.equal(res.body.user.name, 'Asha Verma');
  assert.ok(res.body.token);
  const me = await api(t.base, 'GET', '/api/auth/me', null, res.body.token);
  assert.equal(me.body.user.name, 'Asha Verma');

  // The name shown in a call comes from the account, so it's updated too.
  const c = wsClient(t.base);
  await c.send({ type: 'join', roomId: 'renamed', token: res.body.token, media });
  const peer = wsClient(t.base);
  const b = await registerUser(t.base, 'Bala');
  await c.next('welcome');
  await peer.send({ type: 'join', roomId: 'renamed', token: b.token, media });
  assert.equal((await peer.next('welcome')).peers[0].name, 'Asha Verma');
  c.close();
  peer.close();
});

test('profile: validates name and email', async () => {
  const a = await registerUser(t.base, 'Chen');
  const res = await patchMe(a.token, { name: 'x', email: 'not-an-email' });
  assert.equal(res.status, 400);
  assert.ok(res.body.fields.name);
  assert.ok(res.body.fields.email);
});

test('profile: changing email needs the current password and a free address', async () => {
  const a = await registerUser(t.base, 'Dev');
  const other = await registerUser(t.base, 'Other');

  const noPw = await patchMe(a.token, { email: 'dev.new@example.com' });
  assert.equal(noPw.status, 400);
  assert.ok(noPw.body.fields.currentPassword);

  const wrongPw = await patchMe(a.token, { email: 'dev.new@example.com', currentPassword: 'nope-nope-1' });
  assert.equal(wrongPw.status, 403);

  const taken = await patchMe(a.token, { email: other.user.email.toUpperCase(), currentPassword: 'correct-horse-1' });
  assert.equal(taken.status, 409);
  assert.ok(taken.body.fields.email);

  const ok = await patchMe(a.token, { email: 'Dev.New@Example.com', currentPassword: 'correct-horse-1' });
  assert.equal(ok.status, 200);
  assert.equal(ok.body.user.email, 'dev.new@example.com');
  const login = await api(t.base, 'POST', '/api/auth/login', { email: 'dev.new@example.com', password: 'correct-horse-1' });
  assert.equal(login.status, 200, 'can sign in with the new email');
});

test('profile: requires sign-in', async () => {
  assert.equal((await patchMe(null, { name: 'Ghost' })).status, 401);
  assert.equal((await changePw(null, { currentPassword: 'a', newPassword: 'b' })).status, 401);
});

// ---- password -------------------------------------------------------------------

test('password change: needs the current password, then signs out other devices', async () => {
  const a = await registerUser(t.base, 'Meera');
  const otherDevice = (await api(t.base, 'POST', '/api/auth/login', { email: a.user.email, password: 'correct-horse-1' })).body.token;

  assert.equal((await changePw(a.token, { currentPassword: 'wrong-pass-1', newPassword: 'brand-new-2' })).status, 403);
  const weak = await changePw(a.token, { currentPassword: 'correct-horse-1', newPassword: 'short' });
  assert.equal(weak.status, 400);
  assert.ok(weak.body.fields.newPassword);
  const same = await changePw(a.token, { currentPassword: 'correct-horse-1', newPassword: 'correct-horse-1' });
  assert.equal(same.status, 400);

  const ok = await changePw(a.token, { currentPassword: 'correct-horse-1', newPassword: 'brand-new-2' });
  assert.equal(ok.status, 200);

  // This device carries on with the fresh token…
  assert.equal((await api(t.base, 'GET', '/api/auth/me', null, ok.body.token)).status, 200);
  // …but every older token (other devices, and this device's old one) stops working.
  assert.equal((await api(t.base, 'GET', '/api/auth/me', null, otherDevice)).status, 401);
  assert.equal((await api(t.base, 'GET', '/api/auth/me', null, a.token)).status, 401);
  const ws = wsClient(t.base);
  await ws.send({ type: 'join', roomId: 'pw-room', token: otherDevice, media });
  assert.equal((await ws.next('error')).code, 'unauthorized');
  ws.close();

  // Old password no longer signs in; the new one does.
  assert.equal((await api(t.base, 'POST', '/api/auth/login', { email: a.user.email, password: 'correct-horse-1' })).status, 401);
  assert.equal((await api(t.base, 'POST', '/api/auth/login', { email: a.user.email, password: 'brand-new-2' })).status, 200);
});

// ---- saved chat -------------------------------------------------------------------

test('chat: messages are saved and late joiners get the history', async () => {
  const a = await registerUser(t.base, 'Asha');
  const b = await registerUser(t.base, 'Bala');
  const ca = wsClient(t.base);
  await ca.send({ type: 'join', roomId: 'history-room', token: a.token, media });
  const wa = await ca.next('welcome');
  assert.deepEqual(wa.history, [], 'new room has no history');

  await ca.send({ type: 'chat', text: 'first' });
  const live = await ca.next('chat');
  assert.equal(live.message.userId, a.user.id, 'messages carry the account id');
  assert.equal(live.message.from, wa.selfId);
  await ca.send({ type: 'chat', text: 'second' });
  await ca.next('chat');
  ca.close();
  await new Promise((r) => setTimeout(r, 100));

  // Bala arrives after Asha has left: the conversation is still there.
  const cb = wsClient(t.base);
  await cb.send({ type: 'join', roomId: 'history-room', token: b.token, media });
  const wb = await cb.next('welcome');
  assert.deepEqual(wb.history.map((m) => m.text), ['first', 'second']);
  assert.equal(wb.history[0].name, 'Asha');
  assert.equal(wb.history[0].userId, a.user.id);
  assert.equal(wb.historyHasMore, false);
  cb.close();
});

test('chat: older messages load page by page and require sign-in', async () => {
  const a = await registerUser(t.base, 'Pager');
  // Seed straight into the store (sending 12 over the socket would trip the flood limit).
  for (let i = 0; i < 12; i++) await t.messages.add({ roomId: 'long-room', userId: a.user.id, name: 'Pager', text: `m${i}` });

  const p1 = await api(t.base, 'GET', '/api/rooms/long-room/messages?limit=5', null, a.token);
  assert.equal(p1.status, 200);
  assert.deepEqual(p1.body.messages.map((m) => m.text), ['m7', 'm8', 'm9', 'm10', 'm11']);
  assert.equal(p1.body.hasMore, true);
  const p2 = await api(t.base, 'GET', `/api/rooms/long-room/messages?limit=5&before=${p1.body.messages[0].ts}`, null, a.token);
  assert.deepEqual(p2.body.messages.map((m) => m.text), ['m2', 'm3', 'm4', 'm5', 'm6']);

  assert.equal((await api(t.base, 'GET', '/api/rooms/long-room/messages')).status, 401);
  assert.equal((await api(t.base, 'GET', '/api/rooms/long-room/messages?before=abc', null, a.token)).status, 400);
});

test('chat: messages saved in the same millisecond still page correctly', async () => {
  const store = createMemoryMessageStore();
  for (let i = 0; i < 6; i++) await store.add({ roomId: 'burst', userId: 'u', name: 'U', text: `b${i}` });
  const p1 = await store.recent('burst', { limit: 3 });
  const p2 = await store.recent('burst', { limit: 3, before: p1.messages[0].ts });
  assert.deepEqual([...p2.messages, ...p1.messages].map((m) => m.text), ['b0', 'b1', 'b2', 'b3', 'b4', 'b5']);
});
