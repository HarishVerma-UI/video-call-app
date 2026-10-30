// Social features over the memory stores: profiles, partial visibility,
// connections, posts/feed, and direct messages.
import assert from 'node:assert/strict';
import { after, before, test } from 'node:test';
import { api, registerUser, startTestApp } from './helpers.js';

let t;
before(async () => (t = await startTestApp()));
after(() => t.app.close());

test('profiles: save, self sees full, stranger sees partial', async () => {
  const a = await registerUser(t.base, 'Asha Verma');
  await api(t.base, 'PUT', '/api/profile', { headline: 'Frontend dev', mobile: '99999', skills: ['Angular'], mentor: true }, a.token);

  const mine = await api(t.base, 'GET', '/api/profile/me', null, a.token);
  assert.equal(mine.status, 200);
  assert.equal(mine.body.profile.headline, 'Frontend dev');
  assert.equal(mine.body.profile.mobile, '99999'); // self sees private field

  const b = await registerUser(t.base, 'Bala Krishnan');
  const seen = await api(t.base, 'GET', `/api/profile/${a.user.id}`, null, b.token);
  assert.equal(seen.status, 200);
  assert.equal(seen.body.profile.connection, 'none');
  assert.equal(seen.body.profile.headline, 'Frontend dev');
  assert.equal(seen.body.profile.mobile, undefined); // stranger does NOT see private field
});

test('connections: request, accept, and private fields unlock', async () => {
  const a = await registerUser(t.base, 'Conn A');
  const b = await registerUser(t.base, 'Conn B');
  await api(t.base, 'PUT', '/api/profile', { mobile: '12345' }, a.token);
  await api(t.base, 'PUT', '/api/profile', { mobile: '67890' }, b.token);

  let r = await api(t.base, 'POST', `/api/connections/${b.user.id}/request`, {}, a.token);
  assert.equal(r.body.status, 'pending_outgoing');

  const reqs = await api(t.base, 'GET', '/api/connections/requests', null, b.token);
  assert.ok(reqs.body.requests.some((p) => p.userId === a.user.id));

  r = await api(t.base, 'POST', `/api/connections/${a.user.id}/accept`, {}, b.token);
  assert.equal(r.body.status, 'connected');

  const list = await api(t.base, 'GET', '/api/connections', null, a.token);
  assert.ok(list.body.connections.some((p) => p.userId === b.user.id));

  // Now A sees B's private field
  const seen = await api(t.base, 'GET', `/api/profile/${b.user.id}`, null, a.token);
  assert.equal(seen.body.profile.connection, 'connected');
  assert.equal(seen.body.profile.mobile, '67890');
});

test('posts & feed: create, like, comment; connections see each other', async () => {
  const a = await registerUser(t.base, 'Poster A');
  const b = await registerUser(t.base, 'Reader B');
  await api(t.base, 'PUT', '/api/profile', {}, a.token);
  await api(t.base, 'PUT', '/api/profile', {}, b.token);
  await api(t.base, 'POST', `/api/connections/${b.user.id}/request`, {}, a.token);
  await api(t.base, 'POST', `/api/connections/${a.user.id}/accept`, {}, b.token);

  const made = await api(t.base, 'POST', '/api/posts', { text: 'Hello world' }, a.token);
  assert.equal(made.status, 201);
  const postId = made.body.post.id;

  const bFeed = await api(t.base, 'GET', '/api/feed', null, b.token);
  assert.ok(bFeed.body.posts.some((p) => p.id === postId), 'B sees A’s post');

  const liked = await api(t.base, 'POST', `/api/posts/${postId}/like`, {}, b.token);
  assert.equal(liked.body.post.likeCount, 1);
  assert.equal(liked.body.post.likedByMe, true);

  const commented = await api(t.base, 'POST', `/api/posts/${postId}/comments`, { text: 'Nice!' }, b.token);
  assert.equal(commented.body.post.comments.at(-1).text, 'Nice!');

  const empty = await api(t.base, 'POST', '/api/posts', { text: '' }, a.token);
  assert.equal(empty.status, 400);
});

test('direct messages: only between connections', async () => {
  const a = await registerUser(t.base, 'DM A');
  const b = await registerUser(t.base, 'DM B');
  const c = await registerUser(t.base, 'DM C');
  await api(t.base, 'PUT', '/api/profile', {}, a.token);
  await api(t.base, 'PUT', '/api/profile', {}, b.token);
  await api(t.base, 'POST', `/api/connections/${b.user.id}/request`, {}, a.token);
  await api(t.base, 'POST', `/api/connections/${a.user.id}/accept`, {}, b.token);

  const sent = await api(t.base, 'POST', `/api/dm/${b.user.id}`, { text: 'hi B' }, a.token);
  assert.equal(sent.status, 201);
  const thread = await api(t.base, 'GET', `/api/dm/${a.user.id}`, null, b.token);
  assert.ok(thread.body.messages.some((m) => m.text === 'hi B'));

  const blocked = await api(t.base, 'POST', `/api/dm/${c.user.id}`, { text: 'hi C' }, a.token);
  assert.equal(blocked.status, 403); // not connected
});

test('upload URL needs S3 configured (503 in tests)', async () => {
  const a = await registerUser(t.base, 'Up A');
  const res = await api(t.base, 'POST', '/api/media/upload-url', { kind: 'photo', contentType: 'image/png' }, a.token);
  assert.equal(res.status, 503);
});
