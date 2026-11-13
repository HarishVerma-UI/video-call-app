// Jobs board: admin-managed listings, match score from profile skills,
// applications, and applicant review.
import assert from 'node:assert/strict';
import { after, before, test } from 'node:test';
import { api, registerUser, startTestApp } from './helpers.js';

let t;
let admin;
before(async () => {
  t = await startTestApp();
  admin = await registerUser(t.base, 'Admin User');
  await t.store.setRole(admin.user.id, 'admin');
});
after(() => t.app.close());

async function makeJob(overrides = {}) {
  const res = await api(
    t.base,
    'POST',
    '/api/admin/jobs',
    {
      title: 'Senior Angular Developer',
      company: 'Huddle Labs',
      category: 'tech',
      country: 'India',
      type: 'full-time',
      experience: 'senior',
      salaryMin: 2000000,
      salaryMax: 3500000,
      salaryCurrency: 'INR',
      remote: true,
      description: 'Build the web app.',
      requirements: ['5+ years', 'TypeScript'],
      skills: ['Angular', 'TypeScript', 'RxJS'],
      ...overrides,
    },
    admin.token,
  );
  return res;
}

test('admin routes reject non-admins', async () => {
  const u = await registerUser(t.base, 'Nobody');
  assert.equal((await api(t.base, 'GET', '/api/admin/jobs', null, u.token)).status, 403);
  assert.equal((await api(t.base, 'POST', '/api/admin/jobs', { title: 'x', company: 'y' }, u.token)).status, 403);
});

test('admin creates a job; validation requires a title and company', async () => {
  const ok = await makeJob();
  assert.equal(ok.status, 201);
  assert.ok(ok.body.job.id);
  assert.equal(ok.body.job.category, 'tech');

  const bad = await api(t.base, 'POST', '/api/admin/jobs', { title: '', company: '' }, admin.token);
  assert.equal(bad.status, 400);
  assert.ok(bad.body.fields.title);
  assert.ok(bad.body.fields.company);
});

test('a member sees active jobs with a per-profile match score', async () => {
  await makeJob({ title: 'Match Role', skills: ['Angular', 'TypeScript', 'Go'] });
  const u = await registerUser(t.base, 'Skilled Member');
  await api(t.base, 'PUT', '/api/profile', { skills: ['Angular', 'TypeScript'] }, u.token);

  const res = await api(t.base, 'GET', '/api/jobs?q=Match Role', null, u.token);
  assert.equal(res.status, 200);
  const job = res.body.jobs.find((j) => j.title === 'Match Role');
  assert.ok(job, 'job is listed');
  assert.equal(job.matchScore, 67); // 2 of 3 skills
  assert.deepEqual(job.matchedSkills.sort(), ['Angular', 'TypeScript']);
  assert.equal(job.appliedByMe, false);
});

test('filters narrow the list by category', async () => {
  await makeJob({ title: 'Ops Lead', category: 'non-tech', skills: [] });
  const u = await registerUser(t.base, 'Filterer');
  const tech = await api(t.base, 'GET', '/api/jobs?category=tech', null, u.token);
  assert.ok(tech.body.jobs.every((j) => j.category === 'tech'));
  const nonTech = await api(t.base, 'GET', '/api/jobs?category=non-tech', null, u.token);
  assert.ok(nonTech.body.jobs.some((j) => j.title === 'Ops Lead'));
  assert.ok(nonTech.body.jobs.every((j) => j.category === 'non-tech'));
});

test('a member applies, sees it in My Applications, and re-applying is idempotent', async () => {
  const created = await makeJob({ title: 'Apply Here' });
  const jobId = created.body.job.id;
  const u = await registerUser(t.base, 'Applicant One');

  const applied = await api(t.base, 'POST', `/api/jobs/${jobId}/apply`, { note: 'Keen to join!' }, u.token);
  assert.equal(applied.status, 201);
  assert.equal(applied.body.application.status, 'applied');
  assert.equal(applied.body.application.note, 'Keen to join!');

  // re-applying does not create a duplicate
  await api(t.base, 'POST', `/api/jobs/${jobId}/apply`, { note: 'Updated note' }, u.token);

  const mine = await api(t.base, 'GET', '/api/applications', null, u.token);
  assert.equal(mine.status, 200);
  const rows = mine.body.applications.filter((a) => a.jobId === jobId);
  assert.equal(rows.length, 1);
  assert.equal(rows[0].job.title, 'Apply Here');

  // the single job now reports appliedByMe
  const one = await api(t.base, 'GET', `/api/jobs/${jobId}`, null, u.token);
  assert.equal(one.body.job.appliedByMe, true);
});

test('admin reviews applicants and updates status; counts reflect applications', async () => {
  const created = await makeJob({ title: 'Reviewed Role' });
  const jobId = created.body.job.id;
  const u = await registerUser(t.base, 'Candidate X');
  await api(t.base, 'PUT', '/api/profile', { headline: 'Angular lead' }, u.token);
  await api(t.base, 'POST', `/api/jobs/${jobId}/apply`, { note: 'hi' }, u.token);

  const adminJobs = await api(t.base, 'GET', '/api/admin/jobs', null, admin.token);
  const row = adminJobs.body.jobs.find((j) => j.id === jobId);
  assert.equal(row.applicantCount, 1);

  const applicants = await api(t.base, 'GET', `/api/admin/jobs/${jobId}/applicants`, null, admin.token);
  assert.equal(applicants.status, 200);
  assert.equal(applicants.body.applicants.length, 1);
  const appId = applicants.body.applicants[0].id;
  assert.equal(applicants.body.applicants[0].profile.name, 'Candidate X');

  const shortlisted = await api(t.base, 'PATCH', `/api/admin/applications/${appId}`, { status: 'shortlisted' }, admin.token);
  assert.equal(shortlisted.status, 200);
  assert.equal(shortlisted.body.application.status, 'shortlisted');

  const bad = await api(t.base, 'PATCH', `/api/admin/applications/${appId}`, { status: 'nonsense' }, admin.token);
  assert.equal(bad.status, 400);
});

test('an inactive job is hidden from members but visible to admin', async () => {
  const created = await makeJob({ title: 'Hidden Role', active: false });
  const jobId = created.body.job.id;
  const u = await registerUser(t.base, 'Seeker');
  assert.ok(!(await api(t.base, 'GET', '/api/jobs', null, u.token)).body.jobs.some((j) => j.id === jobId));
  assert.equal((await api(t.base, 'GET', `/api/jobs/${jobId}`, null, u.token)).status, 404);
  assert.ok((await api(t.base, 'GET', '/api/admin/jobs', null, admin.token)).body.jobs.some((j) => j.id === jobId));
});

test('admin can edit and delete a job', async () => {
  const created = await makeJob({ title: 'Temp Role' });
  const jobId = created.body.job.id;
  const upd = await api(t.base, 'PATCH', `/api/admin/jobs/${jobId}`, { title: 'Renamed Role', remote: false }, admin.token);
  assert.equal(upd.status, 200);
  assert.equal(upd.body.job.title, 'Renamed Role');
  assert.equal(upd.body.job.remote, false);

  const del = await api(t.base, 'DELETE', `/api/admin/jobs/${jobId}`, null, admin.token);
  assert.equal(del.status, 200);
  assert.equal((await api(t.base, 'GET', `/api/jobs/${jobId}`, null, admin.token)).status, 404);
});
