// Admin global content lists: posts, comments, connections, applications.
import assert from 'node:assert/strict';
import { after, before, test } from 'node:test';
import { api, completeProfile, registerUser, startTestApp } from './helpers.js';

let t, admin, alice, bob;
before(async () => {
  t = await startTestApp();
  admin = await registerUser(t.base, 'List Admin');
  await t.store.setRole(admin.user.id, 'super_admin');
  alice = await registerUser(t.base, 'Alice List');
  bob = await registerUser(t.base, 'Bob List');
});
after(() => t.app.close());

test('admin can list all posts with like/comment counts', async () => {
  const p = await api(t.base, 'POST', '/api/posts', { text: 'Hello from Alice' }, alice.token);
  assert.equal(p.status, 201);
  await api(t.base, 'POST', `/api/posts/${p.body.post.id}/comments`, { text: 'nice!' }, bob.token);

  const res = await api(t.base, 'GET', '/api/admin/posts', null, admin.token);
  assert.equal(res.status, 200);
  const row = res.body.posts.find((x) => x.id === p.body.post.id);
  assert.ok(row, 'the post appears in the admin list');
  assert.equal(row.commentCount, 1);
  assert.equal(typeof row.likeCount, 'number');
  assert.ok(res.body.total >= 1);
});

test('admin can list all comments with their post context', async () => {
  const res = await api(t.base, 'GET', '/api/admin/comments', null, admin.token);
  assert.equal(res.status, 200);
  assert.ok(Array.isArray(res.body.comments));
  const c = res.body.comments.find((x) => x.text === 'nice!');
  assert.ok(c, 'the comment is listed');
  assert.ok(c.postAuthor);
  assert.ok(c.postId);
});

test('admin can list all connections with resolved names', async () => {
  await api(t.base, 'POST', `/api/connections/${alice.user.id}/request`, {}, bob.token);
  await api(t.base, 'POST', `/api/connections/${bob.user.id}/accept`, {}, alice.token);

  const res = await api(t.base, 'GET', '/api/admin/connections', null, admin.token);
  assert.equal(res.status, 200);
  assert.ok(res.body.connections.length >= 1);
  const c = res.body.connections[0];
  assert.ok(c.from?.name && c.to?.name, 'both ends have names');
  assert.ok(['pending', 'accepted'].includes(c.status));
});

test('admin can list all applications with job titles', async () => {
  const job = await api(t.base, 'POST', '/api/admin/jobs', { title: 'Test Role', company: 'Acme' }, admin.token);
  assert.equal(job.status, 201);
  await completeProfile(t.base, alice.token);
  await api(t.base, 'POST', `/api/jobs/${job.body.job.id}/apply`, {}, alice.token);

  const res = await api(t.base, 'GET', '/api/admin/applications', null, admin.token);
  assert.equal(res.status, 200);
  const a = res.body.applications.find((x) => x.jobTitle === 'Test Role');
  assert.ok(a, 'the application is listed with its job title');
  assert.equal(a.company, 'Acme');
});

test('the content lists are forbidden to non-admins', async () => {
  for (const path of ['/api/admin/posts', '/api/admin/comments', '/api/admin/connections', '/api/admin/applications']) {
    const res = await api(t.base, 'GET', path, null, alice.token);
    assert.equal(res.status, 403, `${path} rejects members`);
  }
});

test('posts list paginates and searches', async () => {
  // create several posts with a unique marker
  const marker = `zz${Date.now()}`;
  for (let i = 0; i < 5; i++) await api(t.base, 'POST', '/api/posts', { text: `${marker} post ${i}` }, alice.token);
  // page 1 of 2
  const p1 = await api(t.base, 'GET', `/api/admin/posts?search=${marker}&page=1&limit=2`, null, admin.token);
  assert.equal(p1.status, 200);
  assert.equal(p1.body.posts.length, 2);
  assert.equal(p1.body.total, 5);
  assert.equal(p1.body.page, 1);
  const p3 = await api(t.base, 'GET', `/api/admin/posts?search=${marker}&page=3&limit=2`, null, admin.token);
  assert.equal(p3.body.posts.length, 1); // 5 total → last page has 1
});

test('users list filters by role', async () => {
  const rec = await registerUser(t.base, 'Rec Filter');
  await t.store.setRole(rec.user.id, 'recruiter');
  const res = await api(t.base, 'GET', '/api/admin/users?role=recruiter&limit=100', null, admin.token);
  assert.equal(res.status, 200);
  assert.ok(res.body.users.length >= 1);
  assert.ok(res.body.users.every((u) => u.role === 'recruiter'), 'only recruiters returned');
});

test('jobs list searches and filters by status', async () => {
  await api(t.base, 'POST', '/api/admin/jobs', { title: 'Unique Backend Role', company: 'Zeta' }, admin.token);
  const res = await api(t.base, 'GET', '/api/admin/jobs?search=Unique%20Backend&status=live', null, admin.token);
  assert.equal(res.status, 200);
  assert.ok(res.body.jobs.some((j) => j.title === 'Unique Backend Role'));
  assert.ok(res.body.jobs.every((j) => j.active !== false));
  assert.equal(typeof res.body.total, 'number');
});

test('admin can bulk-delete posts and delete a comment', async () => {
  const p1 = await api(t.base, 'POST', '/api/posts', { text: 'doomed one' }, alice.token);
  const p2 = await api(t.base, 'POST', '/api/posts', { text: 'doomed two' }, alice.token);
  const withComment = await api(t.base, 'POST', '/api/posts', { text: 'keep me' }, alice.token);
  const cm = await api(t.base, 'POST', `/api/posts/${withComment.body.post.id}/comments`, { text: 'remove this comment' }, bob.token);
  const commentId = cm.body.post.comments.at(-1).id;

  const del = await api(t.base, 'POST', '/api/admin/posts/bulk-delete', { ids: [p1.body.post.id, p2.body.post.id] }, admin.token);
  assert.equal(del.status, 200);
  assert.equal(del.body.deleted, 2);

  const cdel = await api(t.base, 'DELETE', `/api/admin/posts/${withComment.body.post.id}/comments/${commentId}`, null, admin.token);
  assert.equal(cdel.status, 200);
  assert.equal(cdel.body.ok, true);
});
