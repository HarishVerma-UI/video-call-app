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

/* ────────────── v2: additional comprehensive tests ────────────── */

test('profile: update preserves fields when resent', async () => {
  const u = await registerUser(t.base, 'Pres Erve');
  await api(t.base, 'PUT', '/api/profile', { headline: 'Dev', skills: ['JS'] }, u.token);
  // PUT replaces, so resend all fields along with new ones
  await api(t.base, 'PUT', '/api/profile', { headline: 'Dev', skills: ['JS'], location: 'NYC' }, u.token);
  const me = await api(t.base, 'GET', '/api/profile/me', null, u.token);
  assert.equal(me.body.profile.headline, 'Dev');
  assert.equal(me.body.profile.location, 'NYC');
  assert.deepEqual(me.body.profile.skills, ['JS']);
});

test('profile: search by name and role', async () => {
  const a = await registerUser(t.base, 'Sari Mentor');
  await api(t.base, 'PUT', '/api/profile', { mentor: true, skills: ['Python'] }, a.token);
  const b = await registerUser(t.base, 'Sari Mentee');
  await api(t.base, 'PUT', '/api/profile', { mentee: true }, b.token);

  // search excludes the caller, so b searches and should find a
  const byName = await api(t.base, 'GET', '/api/people?q=Sari', null, b.token);
  assert.ok(byName.body.people.length >= 1);
  assert.ok(byName.body.people.some((p) => p.userId === a.user.id));

  const mentors = await api(t.base, 'GET', '/api/people?role=mentor', null, b.token);
  assert.ok(mentors.body.people.some((p) => p.userId === a.user.id));
  assert.ok(!mentors.body.people.some((p) => p.userId === b.user.id));
});

test('connections: decline removes pending request', async () => {
  const a = await registerUser(t.base, 'Dec A');
  const b = await registerUser(t.base, 'Dec B');
  await api(t.base, 'PUT', '/api/profile', {}, a.token);
  await api(t.base, 'PUT', '/api/profile', {}, b.token);
  await api(t.base, 'POST', `/api/connections/${b.user.id}/request`, {}, a.token);

  const dec = await api(t.base, 'POST', `/api/connections/${a.user.id}/decline`, {}, b.token);
  assert.equal(dec.status, 200);

  const reqs = await api(t.base, 'GET', '/api/connections/requests', null, b.token);
  assert.ok(!reqs.body.requests.some((p) => p.userId === a.user.id));

  // A's view should show no connection
  const view = await api(t.base, 'GET', `/api/profile/${b.user.id}`, null, a.token);
  assert.equal(view.body.profile.connection, 'none');
});

test('connections: remove existing connection', async () => {
  const a = await registerUser(t.base, 'Rem A');
  const b = await registerUser(t.base, 'Rem B');
  await api(t.base, 'PUT', '/api/profile', {}, a.token);
  await api(t.base, 'PUT', '/api/profile', {}, b.token);
  await api(t.base, 'POST', `/api/connections/${b.user.id}/request`, {}, a.token);
  await api(t.base, 'POST', `/api/connections/${a.user.id}/accept`, {}, b.token);

  const rem = await api(t.base, 'DELETE', `/api/connections/${b.user.id}`, null, a.token);
  assert.equal(rem.status, 200);

  const list = await api(t.base, 'GET', '/api/connections', null, a.token);
  assert.ok(!list.body.connections.some((p) => p.userId === b.user.id));
});

test('connections: duplicate request is idempotent', async () => {
  const a = await registerUser(t.base, 'Dup A');
  const b = await registerUser(t.base, 'Dup B');
  await api(t.base, 'PUT', '/api/profile', {}, a.token);
  await api(t.base, 'PUT', '/api/profile', {}, b.token);
  await api(t.base, 'POST', `/api/connections/${b.user.id}/request`, {}, a.token);
  const r2 = await api(t.base, 'POST', `/api/connections/${b.user.id}/request`, {}, a.token);
  assert.equal(r2.body.status, 'pending_outgoing');
});

test('posts: like toggle (unlike)', async () => {
  const a = await registerUser(t.base, 'LikeT A');
  await api(t.base, 'PUT', '/api/profile', {}, a.token);
  const made = await api(t.base, 'POST', '/api/posts', { text: 'Toggle test' }, a.token);
  const id = made.body.post.id;

  let r = await api(t.base, 'POST', `/api/posts/${id}/like`, {}, a.token);
  assert.equal(r.body.post.likedByMe, true);
  assert.equal(r.body.post.likeCount, 1);

  r = await api(t.base, 'POST', `/api/posts/${id}/like`, {}, a.token);
  assert.equal(r.body.post.likedByMe, false);
  assert.equal(r.body.post.likeCount, 0);
});

test('posts: delete own post', async () => {
  const a = await registerUser(t.base, 'Del Post');
  await api(t.base, 'PUT', '/api/profile', {}, a.token);
  const made = await api(t.base, 'POST', '/api/posts', { text: 'Will delete' }, a.token);
  const id = made.body.post.id;

  const del = await api(t.base, 'DELETE', `/api/posts/${id}`, null, a.token);
  assert.equal(del.status, 200);

  const feed = await api(t.base, 'GET', '/api/feed', null, a.token);
  assert.ok(!feed.body.posts.some((p) => p.id === id));
});

test('posts: cannot delete another user post', async () => {
  const a = await registerUser(t.base, 'OwnerP');
  const b = await registerUser(t.base, 'OtherP');
  await api(t.base, 'PUT', '/api/profile', {}, a.token);
  await api(t.base, 'PUT', '/api/profile', {}, b.token);
  await api(t.base, 'POST', `/api/connections/${b.user.id}/request`, {}, a.token);
  await api(t.base, 'POST', `/api/connections/${a.user.id}/accept`, {}, b.token);

  const made = await api(t.base, 'POST', '/api/posts', { text: 'No delete for you' }, a.token);
  const del = await api(t.base, 'DELETE', `/api/posts/${made.body.post.id}`, null, b.token);
  assert.equal(del.status, 403);
});

test('posts: own posts appear in own feed', async () => {
  const a = await registerUser(t.base, 'OwnFeed');
  await api(t.base, 'PUT', '/api/profile', {}, a.token);
  await api(t.base, 'POST', '/api/posts', { text: 'My own post' }, a.token);
  const feed = await api(t.base, 'GET', '/api/feed', null, a.token);
  assert.ok(feed.body.posts.some((p) => p.text === 'My own post'));
});

test('dm: conversations list both sides', async () => {
  const a = await registerUser(t.base, 'Conv A');
  const b = await registerUser(t.base, 'Conv B');
  await api(t.base, 'PUT', '/api/profile', {}, a.token);
  await api(t.base, 'PUT', '/api/profile', {}, b.token);
  await api(t.base, 'POST', `/api/connections/${b.user.id}/request`, {}, a.token);
  await api(t.base, 'POST', `/api/connections/${a.user.id}/accept`, {}, b.token);

  await api(t.base, 'POST', `/api/dm/${b.user.id}`, { text: 'Hey there' }, a.token);
  await api(t.base, 'POST', `/api/dm/${a.user.id}`, { text: 'Hey back' }, b.token);

  const aConvs = await api(t.base, 'GET', '/api/dm', null, a.token);
  assert.ok(aConvs.body.conversations.some((c) => c.other === b.user.id));

  const bConvs = await api(t.base, 'GET', '/api/dm', null, b.token);
  assert.ok(bConvs.body.conversations.some((c) => c.other === a.user.id));
});

test('dm: empty message rejected', async () => {
  const a = await registerUser(t.base, 'EmptyDM A');
  const b = await registerUser(t.base, 'EmptyDM B');
  await api(t.base, 'PUT', '/api/profile', {}, a.token);
  await api(t.base, 'PUT', '/api/profile', {}, b.token);
  await api(t.base, 'POST', `/api/connections/${b.user.id}/request`, {}, a.token);
  await api(t.base, 'POST', `/api/connections/${a.user.id}/accept`, {}, b.token);

  const r = await api(t.base, 'POST', `/api/dm/${b.user.id}`, { text: '' }, a.token);
  assert.equal(r.status, 400);
});

test('auth required: social endpoints reject unauthenticated requests', async () => {
  const me = await api(t.base, 'GET', '/api/profile/me', null, null);
  assert.equal(me.status, 401);

  const feed = await api(t.base, 'GET', '/api/feed', null, null);
  assert.equal(feed.status, 401);

  const people = await api(t.base, 'GET', '/api/people', null, null);
  assert.equal(people.status, 401);
});

test('feed: before param filters older posts', async () => {
  const a = await registerUser(t.base, 'Pager A');
  await api(t.base, 'PUT', '/api/profile', {}, a.token);
  await api(t.base, 'POST', '/api/posts', { text: 'Post one' }, a.token);
  // small delay so timestamp differs
  await new Promise((r) => setTimeout(r, 50));
  const second = await api(t.base, 'POST', '/api/posts', { text: 'Post two' }, a.token);
  const ts = new Date(second.body.post.createdAt).getTime();

  const older = await api(t.base, 'GET', `/api/feed?before=${ts}`, null, a.token);
  assert.ok(older.body.posts.every((p) => p.text !== 'Post two'), 'before filter excludes newer post');
});
