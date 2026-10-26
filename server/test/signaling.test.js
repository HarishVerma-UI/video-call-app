import assert from 'node:assert/strict';
import { after, before, test } from 'node:test';
import { api, media, registerUser, startTestApp, wsClient } from './helpers.js';

let t;
const people = {};

before(async () => {
  t = await startTestApp();
  for (const n of ['Asha', 'Bala', 'Chen', 'Dev']) people[n] = await registerUser(t.base, n);
});
after(async () => {
  await t.app.close();
});

const client = () => wsClient(t.base);
const join = (c, roomId, who) => c.send({ type: 'join', roomId, token: people[who].token, media });

test('first joiner gets an empty peer list; later joiners see everyone', async () => {
  const a = client();
  const b = client();
  await join(a, 'room-1', 'Asha');
  const wa = await a.next('welcome');
  assert.equal(wa.roomId, 'room-1');
  assert.deepEqual(wa.peers, []);
  assert.equal(wa.maxPeers, 3);

  await join(b, 'room-1', 'Bala');
  const wb = await b.next('welcome');
  assert.equal(wb.peers.length, 1);
  assert.equal(wb.peers[0].name, 'Asha');
  assert.equal(wb.peers[0].id, wa.selfId);
  assert.equal(wb.peers[0].userId, people.Asha.user.id);

  const pj = await a.next('peer-joined');
  assert.equal(pj.peer.id, wb.selfId);
  assert.equal(pj.peer.name, 'Bala');
  a.close();
  b.close();
});

test('joining requires a valid token, and the name comes from the account', async () => {
  const a = client();
  await a.send({ type: 'join', roomId: 'secure', media });
  assert.equal((await a.next('error')).code, 'bad-request', 'missing token');
  await a.send({ type: 'join', roomId: 'secure', token: 'not.a.jwt', media });
  assert.equal((await a.next('error')).code, 'unauthorized');
  const tampered = people.Asha.token.slice(0, -2) + (people.Asha.token.endsWith('A') ? 'BB' : 'AA');
  await a.send({ type: 'join', roomId: 'secure', token: tampered, media });
  assert.equal((await a.next('error')).code, 'unauthorized');

  // A client can't pretend to be someone else by sending a name.
  await a.send({ type: 'join', roomId: 'secure', token: people.Chen.token, name: 'Mallory', media });
  const w = await a.next('welcome');
  const b = client();
  await join(b, 'secure', 'Dev');
  const wb = await b.next('welcome');
  assert.equal(wb.peers[0].name, 'Chen');
  assert.equal(w.roomId, 'secure');
  a.close();
  b.close();
});

test('signals are delivered only to the addressed peer', async () => {
  const a = client();
  const b = client();
  const c = client();
  await join(a, 'room-2', 'Asha');
  const wa = await a.next('welcome');
  await join(b, 'room-2', 'Bala');
  const wb = await b.next('welcome');
  await join(c, 'room-2', 'Chen');
  await c.next('welcome');

  const offer = { sdp: { type: 'offer', sdp: 'v=0\r\nfake' } };
  await b.send({ type: 'signal', to: wa.selfId, data: offer });
  const got = await a.next('signal');
  assert.equal(got.from, wb.selfId);
  assert.deepEqual(got.data, offer);

  const cand = { candidate: { candidate: 'candidate:1 1 udp 1 1.2.3.4 5 typ host', sdpMid: '0', sdpMLineIndex: 0 } };
  await a.send({ type: 'signal', to: wb.selfId, data: cand });
  assert.deepEqual((await b.next('signal')).data, cand);

  await new Promise((r) => setTimeout(r, 100));
  assert.equal(c.inbox.filter((m) => m.type === 'signal').length, 0, 'C must not see A↔B signals');
  [a, b, c].forEach((x) => x.close());
});

test('room cap is enforced', async () => {
  const cs = [client(), client(), client(), client()];
  const who = ['Asha', 'Bala', 'Chen', 'Dev'];
  for (let i = 0; i < 3; i++) {
    await join(cs[i], 'room-3', who[i]);
    await cs[i].next('welcome');
  }
  await join(cs[3], 'room-3', 'Dev');
  assert.equal((await cs[3].next('error')).code, 'room-full');
  cs.forEach((c) => c.close());
});

test('leaving notifies the others and frees the slot', async () => {
  const a = client();
  const b = client();
  await join(a, 'room-4', 'Asha');
  await a.next('welcome');
  await join(b, 'room-4', 'Bala');
  const wb = await b.next('welcome');
  await a.next('peer-joined');

  b.close();
  assert.equal((await a.next('peer-left')).id, wb.selfId);

  const res = await api(t.base, 'GET', '/api/rooms/room-4', null, people.Asha.token);
  assert.equal(res.body.participants, 1);
  a.close();
});

test('room lookup requires sign-in', async () => {
  const res = await api(t.base, 'GET', '/api/rooms/room-4');
  assert.equal(res.status, 401);
});

test('chat is broadcast to everyone including the sender', async () => {
  const a = client();
  const b = client();
  await join(a, 'room-5', 'Asha');
  await a.next('welcome');
  await join(b, 'room-5', 'Bala');
  await b.next('welcome');

  await a.send({ type: 'chat', text: '  hello there  ' });
  const ma = await a.next('chat');
  const mb = await b.next('chat');
  assert.equal(ma.message.text, 'hello there');
  assert.equal(mb.message.name, 'Asha');
  assert.equal(ma.message.id, mb.message.id);
  a.close();
  b.close();
});

test('media state changes reach the other peers', async () => {
  const a = client();
  const b = client();
  await join(a, 'room-6', 'Asha');
  const wa = await a.next('welcome');
  await join(b, 'room-6', 'Bala');
  await b.next('welcome');

  await a.send({ type: 'media-state', media: { audio: false, video: true, screen: true } });
  const ms = await b.next('media-state');
  assert.equal(ms.id, wa.selfId);
  assert.deepEqual(ms.media, { audio: false, video: true, screen: true });
  a.close();
  b.close();
});

test('invalid input is rejected without crashing the server', async () => {
  const a = client();
  await a.send('not json');
  assert.equal((await a.next('error')).code, 'bad-request');
  await a.send({ type: 'join', roomId: '../../etc', token: people.Asha.token, media });
  assert.equal((await a.next('error')).code, 'bad-request');
  await a.send({ type: 'chat', text: 'hi' });
  assert.equal((await a.next('error')).code, 'not-joined');

  await join(a, 'ok-room', 'Asha');
  await a.next('welcome');
  await join(a, 'ok-room', 'Asha');
  assert.equal((await a.next('error')).code, 'already-joined');
  a.close();
});

test('chat flood is throttled', async () => {
  const a = client();
  await join(a, 'room-7', 'Asha');
  await a.next('welcome');
  for (let i = 0; i < 12; i++) await a.send({ type: 'chat', text: `m${i}` });
  await new Promise((r) => setTimeout(r, 200));
  assert.equal(a.inbox.filter((m) => m.type === 'chat').length, 5);
  a.close();
});

test('health endpoint reports store and live counts', async () => {
  const res = await api(t.base, 'GET', '/health');
  assert.equal(res.body.ok, true);
  assert.equal(res.body.store, 'memory');
  assert.equal(typeof res.body.rooms, 'number');
});
