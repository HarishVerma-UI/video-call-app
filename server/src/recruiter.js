// Recruiter talent dashboard API. Staff (recruiter or super_admin) manage the
// jobs they posted and review their applicants. Everything is scoped to jobs
// the caller owns (job.postedBy === caller), so recruiters only ever see their
// own pipeline. The super-admin platform console (/api/admin/*) covers all jobs.
//
//   GET    /api/recruiter/dashboard             → funnel + my jobs + recent applicants
//   GET    /api/recruiter/jobs                  → my jobs (+ applicant counts)
//   POST   /api/recruiter/jobs                  → create a job I own
//   PATCH  /api/recruiter/jobs/:id              → edit my job
//   DELETE /api/recruiter/jobs/:id              → delete my job
//   GET    /api/recruiter/jobs/:id/applicants   → applicants for my job
//   PATCH  /api/recruiter/applications/:id      → set status on an applicant to my job

import { HttpError, readJson, sendJson } from './http.js';
import { publicApplication, publicJob, publicProfile } from './db/socialStore.js';
import { APPLICATION_STATUSES, jobPatchFrom } from './jobsValidate.js';
import { isStaff, isSuperAdmin } from './auth/roles.js';
import { recordAudit, actorOf } from './audit.js';

export function createRecruiter(opts) {
  const { requireUser, social, log } = opts;
  const jobsStore = () => social?.jobs;

  async function requireStaff(req) {
    const user = await requireUser(req);
    if (!isStaff(user.role)) throw new HttpError(403, 'Recruiters only.', { code: 'forbidden' });
    return user;
  }

  const owns = (user, job) => !!job && (job.postedBy === user.id || isSuperAdmin(user.role));
  const myJobs = (user) => (jobsStore() ? jobsStore().list({ postedBy: user.id }) : Promise.resolve([]));

  async function withProfiles(apps) {
    const profs = social.profiles ? await social.profiles.getMany(apps.map((a) => a.userId)) : [];
    const byId = new Map(profs.map((p) => [p.userId, p]));
    return apps.map((a) => ({ ...publicApplication(a), profile: byId.get(a.userId) ? publicProfile(byId.get(a.userId), { full: false }) : undefined }));
  }

  async function dashboard(req, res) {
    const user = await requireStaff(req);
    const empty = { jobCount: 0, funnel: { total: 0, applied: 0, shortlisted: 0, rejected: 0 }, jobs: [], recentApplicants: [] };
    if (!jobsStore()) return sendJson(res, 200, empty);
    const list = await myJobs(user);
    const ids = list.map((j) => j.id);
    const apps = ids.length ? await jobsStore().applicationsForJobIds(ids) : [];
    const funnel = { total: apps.length, applied: 0, shortlisted: 0, rejected: 0 };
    const perJob = new Map();
    for (const a of apps) {
      if (funnel[a.status] !== undefined) funnel[a.status]++;
      perJob.set(a.jobId, (perJob.get(a.jobId) ?? 0) + 1);
    }
    const jobById = new Map(list.map((j) => [j.id, j]));
    const recent = await withProfiles(apps.slice(0, 8));
    const recentApplicants = recent.map((a) => {
      const j = jobById.get(a.jobId);
      return { ...a, job: j ? { id: j.id, title: j.title, company: j.company } : undefined };
    });
    sendJson(res, 200, {
      jobCount: list.length,
      funnel,
      jobs: list.map((j) => ({ ...publicJob(j), applicantCount: perJob.get(j.id) ?? 0 })),
      recentApplicants,
    });
  }

  async function listMyJobs(req, res) {
    const user = await requireStaff(req);
    const list = await myJobs(user);
    const ids = new Set(list.map((j) => j.id));
    const counts = ids.size ? await jobsStore().applicantCounts() : {};
    sendJson(res, 200, { jobs: list.map((j) => ({ ...publicJob(j), applicantCount: counts[j.id] ?? 0 })) });
  }

  async function createMyJob(req, res) {
    const user = await requireStaff(req);
    if (!jobsStore()) throw new HttpError(503, 'Jobs are not available.');
    const patch = jobPatchFrom(await readJson(req), { partial: false });
    const fields = {};
    if (!patch.title) fields.title = 'A title is required.';
    if (!patch.company) fields.company = 'A company is required.';
    if (Object.keys(fields).length) throw new HttpError(400, 'Please fix the highlighted fields.', { fields });
    const job = await jobsStore().create({ ...patch, postedBy: user.id, postedByName: user.name });
    log?.(`recruiter ${user.id} created job ${job.id}`);
    sendJson(res, 201, { job: publicJob(job) });
  }

  async function updateMyJob(req, res, id) {
    const user = await requireStaff(req);
    const job = await jobsStore()?.byId(id);
    if (!owns(user, job)) throw new HttpError(404, 'Job not found.');
    const patch = jobPatchFrom(await readJson(req), { partial: true });
    if (patch.title !== undefined && !patch.title) throw new HttpError(400, 'Please fix the highlighted fields.', { fields: { title: 'A title is required.' } });
    if (patch.company !== undefined && !patch.company) throw new HttpError(400, 'Please fix the highlighted fields.', { fields: { company: 'A company is required.' } });
    const updated = await jobsStore().update(id, patch);
    sendJson(res, 200, { job: publicJob(updated) });
  }

  async function deleteMyJob(req, res, id) {
    const user = await requireStaff(req);
    const job = await jobsStore()?.byId(id);
    if (!owns(user, job)) throw new HttpError(404, 'Job not found.');
    await jobsStore().remove(id);
    log?.(`recruiter ${user.id} deleted job ${id}`);
    sendJson(res, 200, { ok: true, id });
  }

  async function jobApplicants(req, res, id) {
    const user = await requireStaff(req);
    const job = await jobsStore()?.byId(id);
    if (!owns(user, job)) throw new HttpError(404, 'Job not found.');
    const applicants = await withProfiles(await jobsStore().applicationsForJob(id));
    sendJson(res, 200, { job: publicJob(job), applicants });
  }

  async function setStatus(req, res, id) {
    const user = await requireStaff(req);
    const app = await jobsStore()?.applicationById(id);
    if (!app) throw new HttpError(404, 'Application not found.');
    const job = await jobsStore().byId(app.jobId);
    if (!owns(user, job)) throw new HttpError(403, 'Not your job.', { code: 'forbidden' });
    const { status } = await readJson(req);
    if (!APPLICATION_STATUSES.includes(status)) throw new HttpError(400, 'Invalid status.');
    const updated = await jobsStore().setApplicationStatus(id, status);
    const verb = status === 'shortlisted' ? 'shortlisted a candidate' : status === 'rejected' ? 'declined a candidate' : 'updated an application';
    recordAudit({ ...actorOf(user), action: verb, category: 'jobs', target: `${app.userName || 'candidate'} · ${job.title}` });
    sendJson(res, 200, { application: publicApplication(updated) });
  }

  async function handle(req, res, pathname) {
    if (!pathname.startsWith('/api/recruiter/')) return false;
    const m = req.method;
    let mm;
    if (pathname === '/api/recruiter/dashboard' && m === 'GET') return (await dashboard(req, res), true);
    if (pathname === '/api/recruiter/jobs' && m === 'GET') return (await listMyJobs(req, res), true);
    if (pathname === '/api/recruiter/jobs' && m === 'POST') return (await createMyJob(req, res), true);
    if ((mm = pathname.match(/^\/api\/recruiter\/jobs\/([^/]+)\/applicants$/)) && m === 'GET') return (await jobApplicants(req, res, decodeURIComponent(mm[1])), true);
    if ((mm = pathname.match(/^\/api\/recruiter\/jobs\/([^/]+)$/)) && m === 'PATCH') return (await updateMyJob(req, res, decodeURIComponent(mm[1])), true);
    if ((mm = pathname.match(/^\/api\/recruiter\/jobs\/([^/]+)$/)) && m === 'DELETE') return (await deleteMyJob(req, res, decodeURIComponent(mm[1])), true);
    if ((mm = pathname.match(/^\/api\/recruiter\/applications\/([^/]+)$/)) && m === 'PATCH') return (await setStatus(req, res, decodeURIComponent(mm[1])), true);
    return false;
  }

  return { handle };
}
