// Recruiter dashboard: job ownership, applicant review, and scoping so a
// recruiter only ever sees their own pipeline.
import assert from 'node:assert/strict';
import { after, before, test } from 'node:test';
import { api, registerUser, startTestApp } from './helpers.js';

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
