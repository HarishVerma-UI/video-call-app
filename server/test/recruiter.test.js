// Recruiter dashboard: job ownership, applicant review, and scoping so a
// recruiter only ever sees their own pipeline.
import assert from 'node:assert/strict';
import { after, before, test } from 'node:test';
import { api, completeProfile, registerUser, startTestApp } from './helpers.js';

let t;
let rec1;
let rec2;
let admin;
before(async () => {
  t = await startTestApp();
  rec1 = await registerUser(t.base, 'Recruiter One');
  rec2 = await registerUser(t.base, 'Recruiter Two');
  admin = await registerUser(t.base, 'Super Admin');
  await t.store.setRole(rec1.user.id, 'recruiter');
  await t.store.setRole(rec2.user.id, 'recruiter');
  await t.store.setRole(admin.user.id, 'super_admin');
});
after(() => t.app.close());

const makeJob = (tok, over = {}) =>
  api(t.base, 'POST', '/api/recruiter/jobs', { title: 'Angular Lead', company: 'Acme', skills: ['Angular'], ...over }, tok);

test('members cannot reach recruiter endpoints', async () => {
  const m = await registerUser(t.base, 'Plain Member');
  assert.equal((await api(t.base, 'GET', '/api/recruiter/dashboard', null, m.token)).status, 403);
  assert.equal((await makeJob(m.token)).status, 403);
});

test('a recruiter posts a job they own', async () => {
  const res = await makeJob(rec1.token, { title: 'Senior React Dev' });
  assert.equal(res.status, 201);
  assert.equal(res.body.job.postedBy, rec1.user.id);
  assert.equal(res.body.job.postedByName, 'Recruiter One');
});

test('recruiters only see their own jobs', async () => {
  await makeJob(rec1.token, { title: 'Rec1 Exclusive' });
  await makeJob(rec2.token, { title: 'Rec2 Exclusive' });
  const r1 = await api(t.base, 'GET', '/api/recruiter/jobs', null, rec1.token);
  const r2 = await api(t.base, 'GET', '/api/recruiter/jobs', null, rec2.token);
  assert.ok(r1.body.jobs.some((j) => j.title === 'Rec1 Exclusive'));
  assert.ok(!r1.body.jobs.some((j) => j.title === 'Rec2 Exclusive'));
  assert.ok(r2.body.jobs.some((j) => j.title === 'Rec2 Exclusive'));
  assert.ok(!r2.body.jobs.some((j) => j.title === 'Rec1 Exclusive'));
});

test('a recruiter cannot edit, delete or view applicants of another recruiter’s job', async () => {
  const created = await makeJob(rec1.token, { title: 'Guarded Role' });
  const id = created.body.job.id;
  assert.equal((await api(t.base, 'PATCH', `/api/recruiter/jobs/${id}`, { title: 'Hacked' }, rec2.token)).status, 404);
  assert.equal((await api(t.base, 'DELETE', `/api/recruiter/jobs/${id}`, null, rec2.token)).status, 404);
  assert.equal((await api(t.base, 'GET', `/api/recruiter/jobs/${id}/applicants`, null, rec2.token)).status, 404);
});

test('a super-admin can manage any recruiter’s job', async () => {
  const created = await makeJob(rec1.token, { title: 'Admin Editable' });
  const id = created.body.job.id;
  const res = await api(t.base, 'PATCH', `/api/recruiter/jobs/${id}`, { title: 'Edited by admin' }, admin.token);
  assert.equal(res.status, 200);
  assert.equal(res.body.job.title, 'Edited by admin');
});

test('dashboard funnel reflects real applications; recruiter reviews applicants', async () => {
  const created = await makeJob(rec1.token, { title: 'Funnel Role', skills: ['React'] });
  const jobId = created.body.job.id;
  const seeker = await registerUser(t.base, 'Job Seeker');
  await completeProfile(t.base, seeker.token);
  await api(t.base, 'POST', `/api/jobs/${jobId}/apply`, { note: 'keen' }, seeker.token);

  const applicants = await api(t.base, 'GET', `/api/recruiter/jobs/${jobId}/applicants`, null, rec1.token);
  assert.equal(applicants.status, 200);
  assert.equal(applicants.body.applicants.length, 1);
  assert.equal(applicants.body.applicants[0].profile.name, 'Job Seeker');
  const appId = applicants.body.applicants[0].id;

  const upd = await api(t.base, 'PATCH', `/api/recruiter/applications/${appId}`, { status: 'shortlisted' }, rec1.token);
  assert.equal(upd.status, 200);
  assert.equal(upd.body.application.status, 'shortlisted');

  const dash = await api(t.base, 'GET', '/api/recruiter/dashboard', null, rec1.token);
  assert.ok(dash.body.jobCount >= 1);
  assert.ok(dash.body.funnel.total >= 1);
  assert.equal(dash.body.funnel.shortlisted, 1);
  assert.ok(dash.body.recentApplicants.length >= 1);

  // rec2 cannot change the status of an application to rec1's job
  assert.equal((await api(t.base, 'PATCH', `/api/recruiter/applications/${appId}`, { status: 'rejected' }, rec2.token)).status, 403);
});

test('all-applicants aggregates across my jobs, scoped, searchable and status-filterable', async () => {
  const r = await registerUser(t.base, 'Aggregator Rec');
  await t.store.setRole(r.user.id, 'recruiter');
  const jobA = (await makeJob(r.token, { title: 'Agg Role A' })).body.job.id;
  const jobB = (await makeJob(r.token, { title: 'Agg Role B' })).body.job.id;
  const alice = await registerUser(t.base, 'Alice Aggcandidate');
  const bob = await registerUser(t.base, 'Bob Aggcandidate');
  await completeProfile(t.base, alice.token);
  await completeProfile(t.base, bob.token);
  await api(t.base, 'POST', `/api/jobs/${jobA}/apply`, { note: 'a' }, alice.token);
  await api(t.base, 'POST', `/api/jobs/${jobB}/apply`, { note: 'b' }, bob.token);

  // Both applicants, each enriched with the job they applied to.
  const all = await api(t.base, 'GET', '/api/recruiter/applicants', null, r.token);
  assert.equal(all.status, 200);
  assert.equal(all.body.total, 2);
  assert.ok(all.body.applicants.every((a) => a.job && a.job.title.startsWith('Agg Role')));

  // Another recruiter sees none of these.
  const other = await api(t.base, 'GET', '/api/recruiter/applicants', null, rec1.token);
  assert.ok(!other.body.applicants.some((a) => a.userName.includes('Aggcandidate')));

  // Search narrows by candidate name.
  const search = await api(t.base, 'GET', '/api/recruiter/applicants?search=Alice', null, r.token);
  assert.equal(search.body.total, 1);
  assert.equal(search.body.applicants[0].userName, 'Alice Aggcandidate');

  // Status filter: shortlist Bob, then filter.
  const bobApp = all.body.applicants.find((a) => a.userName === 'Bob Aggcandidate');
  await api(t.base, 'PATCH', `/api/recruiter/applications/${bobApp.id}`, { status: 'shortlisted' }, r.token);
  const filtered = await api(t.base, 'GET', '/api/recruiter/applicants?status=shortlisted', null, r.token);
  assert.equal(filtered.body.total, 1);
  assert.equal(filtered.body.applicants[0].userName, 'Bob Aggcandidate');
});

test('people directory lists all members for staff, read-only, searchable and role-filterable', async () => {
  const seeker = await registerUser(t.base, 'Directory Candidate');
  // A plain member cannot reach the directory.
  const m = await registerUser(t.base, 'Nosy Member');
  assert.equal((await api(t.base, 'GET', '/api/recruiter/users', null, m.token)).status, 403);

  // A recruiter sees every member (not just their own applicants) with profile fields.
  const list = await api(t.base, 'GET', '/api/recruiter/users', null, rec1.token);
  assert.equal(list.status, 200);
  assert.ok(list.body.total >= 1);
  assert.ok(list.body.users.some((u) => u.name === 'Directory Candidate'));
  assert.ok(list.body.users.every((u) => 'profile' in u));

  // Search narrows by name.
  const search = await api(t.base, 'GET', '/api/recruiter/users?search=Directory%20Candidate', null, rec1.token);
  assert.ok(search.body.users.every((u) => u.name.includes('Directory')));

  // Role filter returns only recruiters.
  const recs = await api(t.base, 'GET', '/api/recruiter/users?role=recruiter', null, rec1.token);
  assert.ok(recs.body.users.length >= 1);
  assert.ok(recs.body.users.every((u) => u.role === 'recruiter'));

  // View-only: there is no recruiter route to delete a user.
  assert.equal((await api(t.base, 'DELETE', `/api/recruiter/users/${seeker.user.id}`, null, rec1.token)).status, 404);
});
