import assert from 'node:assert/strict';
import { after, before, test } from 'node:test';
import WebSocket from 'ws';
import { createApp } from '../src/app.js';

const config = {
  port: 0,
  host: '127.0.0.1',
  maxPeersPerRoom: 3,
  webDist: '/nonexistent',
  allowedOrigins: ['*'],
  heartbeatMs: 60000,
  maxPayloadBytes: 64 * 1024,
};

let app;
let base;

before(async () => {
  app = createApp(config);
  const addr = await app.listen(0, '127.0.0.1');
  base = `127.0.0.1:${addr.port}`;
});
after(async () => {
  await app.close();
});

/** A test client that records every message and lets us wait for specific ones. */
function client() {
  const ws = new WebSocket(`ws://${base}/ws`);
  const inbox = [];
  const waiters = [];
  ws.on('message', (raw) => {
    const msg = JSON.parse(raw.toString());
    inbox.push(msg);
    for (const w of [...waiters]) {
      if (w.match(msg)) {
        waiters.splice(waiters.indexOf(w), 1);
        w.resolve(msg);
      }
    }
  });
  const opened = new Promise((r) => ws.once('open', r));
  return {
    ws,
    inbox,
    send: async (m) => {
      await opened;
      ws.send(typeof m === 'string' ? m : JSON.stringify(m));
    },
    next(type, pred = () => true, timeout = 2000) {
      const found = inbox.find((m) => m.type === type && pred(m));
      if (found) {
        inbox.splice(inbox.indexOf(found), 1);
        return Promise.resolve(found);
      }
      return new Promise((resolve, reject) => {
        const w = {
          match: (m) => m.type === type && pred(m),
          resolve: (m) => {
            clearTimeout(t);
            inbox.splice(inbox.indexOf(m), 1);
            resolve(m);
          },
        };
        const t = setTimeout(() => reject(new Error(`timed out waiting for ${type}`)), timeout);
        waiters.push(w);
      });
    },
    close: () => ws.close(),
  };
}

const media = { audio: true, video: true, screen: false };
const join = (c, roomId, name) => c.send({ type: 'join', roomId, name, media });

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

  const pj = await a.next('peer-joined');
  assert.equal(pj.peer.id, wb.selfId);
  assert.equal(pj.peer.name, 'Bala');
  a.close();
  b.close();
});

test('signals are delivered only to the addressed peer', async () => {
  const a = client();
  const b = client();
  const c = client();
  await join(a, 'room-2', 'A');
  const wa = await a.next('welcome');
  await join(b, 'room-2', 'B');
  const wb = await b.next('welcome');
  await join(c, 'room-2', 'C');
  await c.next('welcome');

  const offer = { sdp: { type: 'offer', sdp: 'v=0\r\nfake' } };
  await b.send({ type: 'signal', to: wa.selfId, data: offer });
  const got = await a.next('signal');
  assert.equal(got.from, wb.selfId);
  assert.deepEqual(got.data, offer);

  const cand = { candidate: { candidate: 'candidate:1 1 udp 1 1.2.3.4 5 typ host', sdpMid: '0', sdpMLineIndex: 0 } };
  await a.send({ type: 'signal', to: wb.selfId, data: cand });
  const gotCand = await b.next('signal');
  assert.deepEqual(gotCand.data, cand);

  await new Promise((r) => setTimeout(r, 100));
  assert.equal(c.inbox.filter((m) => m.type === 'signal').length, 0, 'C must not see A↔B signals');
  a.close();
  b.close();
  c.close();
});

test('room cap is enforced', async () => {
  const cs = [client(), client(), client(), client()];
  for (const [i, c] of cs.slice(0, 3).entries()) {
    await join(c, 'room-3', `P${i}`);
    await c.next('welcome');
  }
  await join(cs[3], 'room-3', 'P3');
  const err = await cs[3].next('error');
  assert.equal(err.code, 'room-full');
  cs.forEach((c) => c.close());
});

test('leaving notifies the others and frees the slot', async () => {
  const a = client();
  const b = client();
  await join(a, 'room-4', 'A');
  await a.next('welcome');
  await join(b, 'room-4', 'B');
  const wb = await b.next('welcome');
  await a.next('peer-joined');

  b.close();
  const left = await a.next('peer-left');
  assert.equal(left.id, wb.selfId);

  const res = await fetch(`http://${base}/api/rooms/room-4`).then((r) => r.json());
  assert.equal(res.participants, 1);
  a.close();
});

test('chat is broadcast to everyone including the sender', async () => {
  const a = client();
  const b = client();
  await join(a, 'room-5', 'A');
  await a.next('welcome');
  await join(b, 'room-5', 'B');
  await b.next('welcome');

  await a.send({ type: 'chat', text: '  hello there  ' });
  const ma = await a.next('chat');
  const mb = await b.next('chat');
  assert.equal(ma.message.text, 'hello there');
  assert.equal(mb.message.name, 'A');
  assert.equal(ma.message.id, mb.message.id);
  a.close();
  b.close();
});

test('media state changes reach the other peers', async () => {
  const a = client();
  const b = client();
  await join(a, 'room-6', 'A');
  const wa = await a.next('welcome');
  await join(b, 'room-6', 'B');
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
  await a.send({ type: 'join', roomId: '../../etc', name: 'x', media });
  assert.equal((await a.next('error')).code, 'bad-request');
  await a.send({ type: 'join', roomId: 'ok-room', name: '   ', media });
  assert.equal((await a.next('error')).code, 'bad-request');
  await a.send({ type: 'chat', text: 'hi' });
  assert.equal((await a.next('error')).code, 'not-joined');

  await join(a, 'ok-room', 'Fine');
  await a.next('welcome');
  await join(a, 'ok-room', 'Again');
  assert.equal((await a.next('error')).code, 'already-joined');
  a.close();
});

test('chat flood is throttled', async () => {
  const a = client();
  await join(a, 'room-7', 'A');
  await a.next('welcome');
  for (let i = 0; i < 12; i++) await a.send({ type: 'chat', text: `m${i}` });
  await new Promise((r) => setTimeout(r, 200));
  assert.equal(a.inbox.filter((m) => m.type === 'chat').length, 5);
  a.close();
});

test('health endpoint reports live counts', async () => {
  const res = await fetch(`http://${base}/health`).then((r) => r.json());
  assert.equal(res.ok, true);
  assert.equal(typeof res.rooms, 'number');
});
