// Admin dashboard API and social-provider discovery.
import assert from 'node:assert/strict';
import { after, before, test } from 'node:test';
import { api, registerUser, startTestApp } from './helpers.js';

let t;
before(async () => (t = await startTestApp()));
after(() => t.app.close());

test('new accounts default to the "user" role', async () => {
  const u = await registerUser(t.base, 'Plain User');
  assert.equal(u.user.role, 'user');
});

test('providers endpoint reports which social logins are configured', async () => {
  const res = await api(t.base, 'GET', '/api/auth/providers');
  assert.equal(res.status, 200);
  assert.deepEqual(res.body.providers, { google: false, github: false });
});

test('admin routes reject non-admins', async () => {
  const u = await registerUser(t.base, 'Normal User');
  const res = await api(t.base, 'GET', '/api/admin/users', null, u.token);
  assert.equal(res.status, 403);
});

test('an admin can list, create, update and delete users', async () => {
  const admin = await registerUser(t.base, 'Admin User');
  await t.store.setRole(admin.user.id, 'admin'); // promote (seeding happens in index.js, not in tests)

  // list
  let res = await api(t.base, 'GET', '/api/admin/users', null, admin.token);
  assert.equal(res.status, 200);
  assert.ok(Array.isArray(res.body.users));
  assert.ok(typeof res.body.total === 'number');

  // create
  const email = `created-${Date.now()}@example.com`;
  res = await api(t.base, 'POST', '/api/admin/users', { name: 'Created Person', email, password: 'secret-123', role: 'user' }, admin.token);
  assert.equal(res.status, 201);
  const id = res.body.user.id;
  assert.equal(res.body.user.role, 'user');
  assert.equal(res.body.user.email, email);

  // the created user can sign in with the password the admin set
  res = await api(t.base, 'POST', '/api/auth/login', { email, password: 'secret-123' });
  assert.equal(res.status, 200);

  // update (rename + promote)
  res = await api(t.base, 'PATCH', `/api/admin/users/${id}`, { name: 'Renamed', role: 'admin' }, admin.token);
  assert.equal(res.status, 200);
  assert.equal(res.body.user.name, 'Renamed');
  assert.equal(res.body.user.role, 'admin');

  // admins can't strip their own admin role or delete themselves
  res = await api(t.base, 'PATCH', `/api/admin/users/${admin.user.id}`, { role: 'user' }, admin.token);
  assert.equal(res.status, 400);
  res = await api(t.base, 'DELETE', `/api/admin/users/${admin.user.id}`, null, admin.token);
  assert.equal(res.status, 400);

  // delete the created user
  res = await api(t.base, 'DELETE', `/api/admin/users/${id}`, null, admin.token);
  assert.equal(res.status, 200);
  // the deleted user can no longer sign in
  res = await api(t.base, 'POST', '/api/auth/login', { email, password: 'secret-123' });
  assert.equal(res.status, 401);
});

test('admin stats endpoint returns dashboard data', async () => {
  const admin = await registerUser(t.base, 'Stats Admin');
  await t.store.setRole(admin.user.id, 'admin');
  const res = await api(t.base, 'GET', '/api/admin/stats', null, admin.token);
  assert.equal(res.status, 200);
  assert.ok(typeof res.body.totalUsers === 'number');
  assert.ok(typeof res.body.byRole.admin === 'number');
  assert.ok(typeof res.body.byRole.user === 'number');
  assert.ok(Array.isArray(res.body.dailyActivity));
  assert.equal(res.body.dailyActivity.length, 7);
  assert.ok(typeof res.body.activeCalls.rooms === 'number');
  assert.ok(typeof res.body.activeCalls.participants === 'number');
  assert.ok(Array.isArray(res.body.activeRooms));
  assert.ok(typeof res.body.uptimeSec === 'number');
});

test('admin stats rejects non-admins', async () => {
  const u = await registerUser(t.base, 'Stats Normal');
  const res = await api(t.base, 'GET', '/api/admin/stats', null, u.token);
  assert.equal(res.status, 403);
});

test('duplicate email is rejected on admin create', async () => {
  const admin = await registerUser(t.base, 'Admin Two');
  await t.store.setRole(admin.user.id, 'admin');
  const email = `dupe-${Date.now()}@example.com`;
  let res = await api(t.base, 'POST', '/api/admin/users', { name: 'First', email, password: 'secret-123' }, admin.token);
  assert.equal(res.status, 201);
  res = await api(t.base, 'POST', '/api/admin/users', { name: 'Second', email, password: 'secret-123' }, admin.token);
  assert.equal(res.status, 409);
});
