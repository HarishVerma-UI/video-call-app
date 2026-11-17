// Audit log, bulk delete, and the admin dashboard growth series.
import assert from 'node:assert/strict';
import { after, before, test } from 'node:test';
import { api, registerUser, startTestApp } from './helpers.js';

let t, admin;
before(async () => {
  t = await startTestApp();
  admin = await registerUser(t.base, 'Audit Admin');
  await t.store.setRole(admin.user.id, 'super_admin');
});
after(() => t.app.close());

test('audit log records registrations and is readable by super-admins', async () => {
  await registerUser(t.base, 'Audited Newcomer');
  const res = await api(t.base, 'GET', '/api/admin/audit', null, admin.token);
  assert.equal(res.status, 200);
  assert.ok(Array.isArray(res.body.events));
  assert.ok(res.body.events.length > 0);
  const reg = res.body.events.find((e) => e.action === 'registered');
  assert.ok(reg, 'a registration event is recorded');
  assert.equal(reg.category, 'auth');
  assert.ok(reg.actorName);
});

test('audit log is forbidden to non-super-admins', async () => {
  const member = await registerUser(t.base, 'Nosy Member');
  const res = await api(t.base, 'GET', '/api/admin/audit', null, member.token);
  assert.equal(res.status, 403);
});

test('admin actions are audited and filterable by category', async () => {
  const email = `audited-${Date.now()}@example.com`;
  await api(t.base, 'POST', '/api/admin/users', { name: 'Made By Admin', email, password: 'secret-123', role: 'member' }, admin.token);
  const res = await api(t.base, 'GET', '/api/admin/audit?category=admin', null, admin.token);
  assert.equal(res.status, 200);
  assert.ok(res.body.events.length > 0);
  assert.ok(res.body.events.every((e) => e.category === 'admin'));
  assert.ok(res.body.events.some((e) => e.action === 'created a user'));
});

test('bulk delete removes several users at once (and never the caller)', async () => {
  const a = await registerUser(t.base, 'Bulk A');
  const b = await registerUser(t.base, 'Bulk B');
  const res = await api(
    t.base,
    'POST',
    '/api/admin/users/bulk-delete',
    { ids: [a.user.id, b.user.id, admin.user.id] }, // includes the caller — must be skipped
    admin.token,
  );
  assert.equal(res.status, 200);
  assert.equal(res.body.deleted, 2);
  // the admin still exists
  const me = await api(t.base, 'GET', '/api/auth/me', null, admin.token);
  assert.equal(me.status, 200);
});

test('stats include a 12-month user-growth series', async () => {
  const res = await api(t.base, 'GET', '/api/admin/stats', null, admin.token);
  assert.equal(res.status, 200);
  assert.ok(Array.isArray(res.body.userGrowth));
  assert.equal(res.body.userGrowth.length, 12);
  for (const m of res.body.userGrowth) {
    assert.equal(typeof m.label, 'string');
    assert.equal(typeof m.total, 'number');
  }
  // cumulative: the series never decreases
  const totals = res.body.userGrowth.map((m) => m.total);
  for (let i = 1; i < totals.length; i++) assert.ok(totals[i] >= totals[i - 1]);
});
