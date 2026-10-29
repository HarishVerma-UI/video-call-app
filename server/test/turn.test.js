import assert from 'node:assert/strict';
import { createHmac } from 'node:crypto';
import { after, before, test } from 'node:test';
import { checkConfig } from '../src/config.js';
import { iceServersFor } from '../src/turn.js';
import { media, registerUser, startTestApp, wsClient } from './helpers.js';

const SECRET = 'turn-secret-0123456789-abcdefghijklmnop';
const turnConfig = {
  stunUrls: ['stun:stun.l.google.com:19302'],
  turnUrls: ['turn:huddle.example.org:3478?transport=udp', 'turn:huddle.example.org:3478?transport=tcp'],
  turnSecret: SECRET,
  turnTtlSec: 3600,
};

test('TURN credentials follow the coturn REST scheme and expire', () => {
  const now = Date.UTC(2026, 9, 28, 12, 0, 0);
  const [stun, turn] = iceServersFor(turnConfig, 'user-1', now);
  assert.deepEqual(stun, { urls: turnConfig.stunUrls });
  assert.equal(turn.username, `${now / 1000 + 3600}:user-1`);
  assert.equal(turn.credential, createHmac('sha1', SECRET).update(turn.username).digest('base64'));
  assert.deepEqual(turn.urls, turnConfig.turnUrls);
  // Without TURN configured: STUN only.
  assert.deepEqual(iceServersFor({ ...turnConfig, turnUrls: [] }, 'u'), [{ urls: turnConfig.stunUrls }]);
});

test('production config insists on a strong TURN secret', () => {
  const base = { isProd: true, mongoUri: 'mongodb://x', jwtSecret: 'x'.repeat(40), turnUrls: ['turn:a:3478'], turnSecret: 'short' };
  const problems = checkConfig(base);
  assert.ok(problems.some((p) => p.includes('TURN_SECRET')));
  assert.deepEqual(checkConfig({ ...base, turnSecret: SECRET }), []);
});

let t;
before(async () => (t = await startTestApp({ config: turnConfig })));
after(() => t.app.close());

test('each person gets their own TURN credentials when they join', async () => {
  const u = await registerUser(t.base, 'Turn User');
  const c = wsClient(t.base);
  await c.send({ type: 'join', roomId: 'turn-room', token: u.token, media });
  const welcome = await c.next('welcome');
  const turn = welcome.iceServers.find((s) => s.username);
  assert.ok(turn.username.endsWith(`:${u.user.id}`));
  assert.ok(Number(turn.username.split(':')[0]) > Date.now() / 1000);
  c.close();
});
