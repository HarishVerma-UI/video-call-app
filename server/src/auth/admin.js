// Admin dashboard API: list, create, update and delete user accounts.
// Every route requires a signed-in user whose role is "admin".
//
//   GET    /api/admin/users        → { users: [...], total }
//   POST   /api/admin/users        → create { name, email, password, role? }
//   PATCH  /api/admin/users/:id     → update { name?, email?, role?, password? }
//   DELETE /api/admin/users/:id     → remove

import { HttpError, readJson, sendJson } from '../http.js';
import { DuplicateEmailError, publicUser } from '../db/userStore.js';
import { publicApplication, publicJob, publicProfile } from '../db/socialStore.js';
import { hashPassword } from './password.js';

const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;
const cleanName = (v) => (typeof v === 'string' ? v.trim().replace(/\s+/g, ' ') : '');
const cleanEmail = (v) => (typeof v === 'string' ? v.trim().toLowerCase() : '');

function nameError(name) {
  return name.length < 2 || name.length > 40 ? 'Name must be 2–40 characters.' : null;
}
function emailError(email) {
  return !EMAIL.test(email) || email.length > 254 ? 'Enter a valid email address.' : null;
}
function passwordError(pw) {
  if (pw.length < 8) return 'Use at least 8 characters.';
  if (pw.length > 128) return 'Use at most 128 characters.';
  if (!/[a-zA-Z]/.test(pw) || !/\d/.test(pw)) return 'Include at least one letter and one number.';
  return null;
}
const roleOk = (r) => r === 'user' || r === 'admin';

/**
 * @param {{ store: any, requireUser: (req)=>Promise<any>, log?: Function, getStats?: ()=>object, social?: object }} opts
 */
export function createAdmin(opts) {
  async function requireAdmin(req) {
    const user = await opts.requireUser(req);
    if (user.role !== 'admin') throw new HttpError(403, 'Admins only.', { code: 'forbidden' });
    return user;
  }

  async function listUsers(req, res, url) {
    await requireAdmin(req);
    const page = Math.max(1, Number(url?.searchParams?.get('page')) || 1);
    const limit = Math.min(100, Math.max(1, Number(url?.searchParams?.get('limit')) || 20));
    const skip = (page - 1) * limit;
    const [allUsers, total] = await Promise.all([opts.store.list({ limit: 500 }), opts.store.count()]);
    const paged = allUsers.slice(skip, skip + limit);
    sendJson(res, 200, { users: paged.map(publicUser), total, page, limit });
  }

  async function createUser(req, res) {
    await requireAdmin(req);
    const body = await readJson(req);
    const name = cleanName(body?.name);
    const email = cleanEmail(body?.email);
    const password = typeof body?.password === 'string' ? body.password : '';
    const role = body?.role ?? 'user';

    const fields = {};
    const ne = nameError(name);
    const ee = emailError(email);
    const pe = passwordError(password);
    if (ne) fields.name = ne;
    if (ee) fields.email = ee;
    if (pe) fields.password = pe;
    if (!roleOk(role)) fields.role = 'Role must be "user" or "admin".';
    if (Object.keys(fields).length) throw new HttpError(400, 'Please fix the highlighted fields.', { fields });

    let user;
    try {
      user = await opts.store.create({ name, email, passwordHash: await hashPassword(password), role });
    } catch (err) {
      if (err instanceof DuplicateEmailError)
        throw new HttpError(409, 'An account with this email already exists.', { fields: { email: 'Already registered.' } });
      throw err;
    }
    opts.log?.(`admin  created ${email} (${role})`);
    if (opts.onRegister) await opts.onRegister(user);
    sendJson(res, 201, { user: publicUser(user) });
  }

  async function updateUser(req, res, id) {
    const admin = await requireAdmin(req);
    const target = await opts.store.findById(id);
    if (!target) throw new HttpError(404, 'User not found.');
    const body = await readJson(req);

    const patch = {};
    const fields = {};
    if (body.name !== undefined) {
      const name = cleanName(body.name);
      const e = nameError(name);
      if (e) fields.name = e;
      else patch.name = name;
    }
    if (body.email !== undefined) {
      const email = cleanEmail(body.email);
      const e = emailError(email);
      if (e) fields.email = e;
      else patch.email = email;
    }
    if (body.role !== undefined) {
      if (!roleOk(body.role)) fields.role = 'Role must be "user" or "admin".';
      else if (target.id === admin.id && body.role !== 'admin') fields.role = 'You can’t remove your own admin access.';
      else patch.role = body.role;
    }
    if (body.password !== undefined && body.password !== '') {
      const e = passwordError(body.password);
      if (e) fields.password = e;
      else patch.passwordHash = await hashPassword(body.password);
    }
    if (Object.keys(fields).length) throw new HttpError(400, 'Please fix the highlighted fields.', { fields });
    if (!Object.keys(patch).length) {
      sendJson(res, 200, { user: publicUser(target) });
      return;
    }

    let updated;
    try {
      updated = await opts.store.adminUpdate(id, patch);
    } catch (err) {
      if (err instanceof DuplicateEmailError)
        throw new HttpError(409, 'An account with this email already exists.', { fields: { email: 'Already used by another account.' } });
      throw err;
    }
    opts.log?.(`admin  updated ${updated.email}`);
    sendJson(res, 200, { user: publicUser(updated) });
  }

  async function deleteUser(req, res, id) {
    const admin = await requireAdmin(req);
    if (id === admin.id) throw new HttpError(400, 'You can’t delete your own account while signed in.', { code: 'self-delete' });
    const target = await opts.store.findById(id);
    if (!target) throw new HttpError(404, 'User not found.');
    await opts.store.remove(id);
    // Cascade: remove social data for the deleted user
    if (opts.social) {
      const { profiles, connections, posts, dms, jobs } = opts.social;
      await Promise.all([
        profiles?.remove?.(id),
        connections?.removeByUser?.(id),
        posts?.removeByAuthor?.(id),
        dms?.removeByUser?.(id),
        jobs?.removeApplicationsByUser?.(id),
      ].filter(Boolean));
      opts.log?.(`admin  cascaded social data deletion for ${id}`);
    }
    opts.log?.(`admin  deleted ${target.email || target.id}`);
    sendJson(res, 200, { ok: true, id });
  }

  // --- Ads: admin-managed promos shown in the member feed ---
  const adStr = (v, max) => (typeof v === 'string' ? v.trim().slice(0, max) : '');
  function adPatchFrom(body, { partial }) {
    const patch = {};
    if (!partial || body.title !== undefined) patch.title = adStr(body.title, 120);
    if (!partial || body.body !== undefined) patch.body = adStr(body.body, 500);
    if (!partial || body.linkUrl !== undefined) patch.linkUrl = adStr(body.linkUrl, 500);
    if (!partial || body.imageKey !== undefined) patch.imageKey = typeof body.imageKey === 'string' ? body.imageKey.slice(0, 300) : null;
    if (!partial || body.active !== undefined) patch.active = body.active !== false;
    if (patch.linkUrl && !/^https?:\/\//i.test(patch.linkUrl)) {
      throw new HttpError(400, 'Please fix the highlighted fields.', { fields: { linkUrl: 'Link must start with http:// or https://' } });
    }
    return patch;
  }

  async function listAds(req, res) {
    await requireAdmin(req);
    if (!opts.social?.ads) return sendJson(res, 200, { ads: [] });
    const ads = await opts.social.ads.list({ activeOnly: false });
    sendJson(res, 200, { ads });
  }

  async function createAd(req, res) {
    await requireAdmin(req);
    if (!opts.social?.ads) throw new HttpError(503, 'Ads are not available.');
    const body = await readJson(req);
    const patch = adPatchFrom(body, { partial: false });
    if (!patch.title) throw new HttpError(400, 'Please fix the highlighted fields.', { fields: { title: 'A title is required.' } });
    const ad = await opts.social.ads.create(patch);
    opts.log?.(`admin  created ad ${ad.id}`);
    sendJson(res, 201, { ad });
  }

  async function updateAd(req, res, id) {
    await requireAdmin(req);
    if (!opts.social?.ads) throw new HttpError(503, 'Ads are not available.');
    const body = await readJson(req);
    const patch = adPatchFrom(body, { partial: true });
    if (patch.title !== undefined && !patch.title) throw new HttpError(400, 'Please fix the highlighted fields.', { fields: { title: 'A title is required.' } });
    const ad = await opts.social.ads.update(id, patch);
    if (!ad) throw new HttpError(404, 'Ad not found.');
    opts.log?.(`admin  updated ad ${id}`);
    sendJson(res, 200, { ad });
  }

  async function deleteAd(req, res, id) {
    await requireAdmin(req);
    if (!opts.social?.ads) throw new HttpError(503, 'Ads are not available.');
    const ok = await opts.social.ads.remove(id);
    if (!ok) throw new HttpError(404, 'Ad not found.');
    opts.log?.(`admin  deleted ad ${id}`);
    sendJson(res, 200, { ok: true, id });
  }

  // --- Jobs: admin-managed listings + applicant review ---
  const jobNum = (v) => (v === null || v === undefined || v === '' ? null : Number.isFinite(Number(v)) ? Number(v) : null);
  const JOB_CATS = ['tech', 'non-tech'];
  const JOB_TYPES = ['full-time', 'part-time', 'contract', 'internship'];
  const JOB_EXPS = ['entry', 'mid', 'senior', 'lead'];
  const STATUSES = ['applied', 'shortlisted', 'rejected'];
  const list40 = (v, max) => (Array.isArray(v) ? v.slice(0, 40).map((x) => adStr(x, max)).filter(Boolean) : []);

  function jobPatchFrom(body, { partial }) {
    const patch = {};
    if (!partial || body.title !== undefined) patch.title = adStr(body.title, 160);
    if (!partial || body.company !== undefined) patch.company = adStr(body.company, 160);
    if (!partial || body.category !== undefined) patch.category = JOB_CATS.includes(body.category) ? body.category : 'tech';
    if (!partial || body.country !== undefined) patch.country = adStr(body.country, 80);
    if (!partial || body.type !== undefined) patch.type = JOB_TYPES.includes(body.type) ? body.type : 'full-time';
    if (!partial || body.experience !== undefined) patch.experience = JOB_EXPS.includes(body.experience) ? body.experience : 'mid';
    if (!partial || body.salaryMin !== undefined) patch.salaryMin = jobNum(body.salaryMin);
    if (!partial || body.salaryMax !== undefined) patch.salaryMax = jobNum(body.salaryMax);
    if (!partial || body.salaryCurrency !== undefined) patch.salaryCurrency = adStr(body.salaryCurrency, 8) || 'USD';
    if (!partial || body.remote !== undefined) patch.remote = body.remote === true;
    if (!partial || body.description !== undefined) patch.description = adStr(body.description, 8000);
    if (!partial || body.requirements !== undefined) patch.requirements = list40(body.requirements, 200);
    if (!partial || body.skills !== undefined) patch.skills = list40(body.skills, 60);
    if (!partial || body.active !== undefined) patch.active = body.active !== false;
    if (!partial || body.applyUrl !== undefined) {
      const u = adStr(body.applyUrl, 500);
      if (u && !/^https?:\/\//i.test(u)) throw new HttpError(400, 'Please fix the highlighted fields.', { fields: { applyUrl: 'Link must start with http:// or https://' } });
      patch.applyUrl = u;
    }
    if (!partial || body.source !== undefined) patch.source = adStr(body.source, 80);
    return patch;
  }

  async function listJobs(req, res) {
    await requireAdmin(req);
    if (!opts.social?.jobs) return sendJson(res, 200, { jobs: [] });
    const [jobs, counts] = await Promise.all([opts.social.jobs.list({ activeOnly: false }), opts.social.jobs.applicantCounts()]);
    sendJson(res, 200, { jobs: jobs.map((j) => ({ ...publicJob(j), applicantCount: counts[j.id] ?? 0 })) });
  }

  async function createJob(req, res) {
    await requireAdmin(req);
    if (!opts.social?.jobs) throw new HttpError(503, 'Jobs are not available.');
    const patch = jobPatchFrom(await readJson(req), { partial: false });
    const fields = {};
    if (!patch.title) fields.title = 'A title is required.';
    if (!patch.company) fields.company = 'A company is required.';
    if (Object.keys(fields).length) throw new HttpError(400, 'Please fix the highlighted fields.', { fields });
    const job = await opts.social.jobs.create(patch);
    opts.log?.(`admin  created job ${job.id}`);
    sendJson(res, 201, { job: publicJob(job) });
  }

  async function updateJob(req, res, id) {
    await requireAdmin(req);
    if (!opts.social?.jobs) throw new HttpError(503, 'Jobs are not available.');
    const patch = jobPatchFrom(await readJson(req), { partial: true });
    if (patch.title !== undefined && !patch.title) throw new HttpError(400, 'Please fix the highlighted fields.', { fields: { title: 'A title is required.' } });
    if (patch.company !== undefined && !patch.company) throw new HttpError(400, 'Please fix the highlighted fields.', { fields: { company: 'A company is required.' } });
    const job = await opts.social.jobs.update(id, patch);
    if (!job) throw new HttpError(404, 'Job not found.');
    opts.log?.(`admin  updated job ${id}`);
    sendJson(res, 200, { job: publicJob(job) });
  }

  async function importJobs(req, res) {
    await requireAdmin(req);
    if (!opts.social?.jobs) throw new HttpError(503, 'Jobs are not available.');
    const body = await readJson(req, 4 * 1024 * 1024);
    const incoming = Array.isArray(body.jobs) ? body.jobs : [];
    if (!incoming.length) throw new HttpError(400, 'No jobs to import.');
    if (incoming.length > 500) throw new HttpError(400, 'Import at most 500 jobs at a time.');
    const existing = await opts.social.jobs.list({ activeOnly: false });
    const seenUrl = new Set(existing.map((j) => (j.applyUrl || '').toLowerCase()).filter(Boolean));
    const seenKey = new Set(existing.map((j) => `${(j.title || '').toLowerCase()}@@${(j.company || '').toLowerCase()}`));
    let created = 0;
    let skipped = 0;
    for (const raw of incoming) {
      let patch;
      try {
        patch = jobPatchFrom(raw, { partial: false });
      } catch {
        skipped++;
        continue;
      }
      if (!patch.title || !patch.company) { skipped++; continue; }
      const urlKey = (patch.applyUrl || '').toLowerCase();
      const key = `${patch.title.toLowerCase()}@@${patch.company.toLowerCase()}`;
      if ((urlKey && seenUrl.has(urlKey)) || seenKey.has(key)) { skipped++; continue; }
      await opts.social.jobs.create(patch);
      if (urlKey) seenUrl.add(urlKey);
      seenKey.add(key);
      created++;
    }
    opts.log?.(`admin  imported ${created} jobs (${skipped} skipped)`);
    sendJson(res, 201, { created, skipped });
  }

  async function deleteJob(req, res, id) {
    await requireAdmin(req);
    if (!opts.social?.jobs) throw new HttpError(503, 'Jobs are not available.');
    const ok = await opts.social.jobs.remove(id);
    if (!ok) throw new HttpError(404, 'Job not found.');
    opts.log?.(`admin  deleted job ${id}`);
    sendJson(res, 200, { ok: true, id });
  }

  async function jobApplicants(req, res, id) {
    await requireAdmin(req);
    if (!opts.social?.jobs) return sendJson(res, 200, { job: null, applicants: [] });
    const job = await opts.social.jobs.byId(id);
    if (!job) throw new HttpError(404, 'Job not found.');
    const apps = await opts.social.jobs.applicationsForJob(id);
    const profs = opts.social.profiles ? await opts.social.profiles.getMany(apps.map((a) => a.userId)) : [];
    const byId = new Map(profs.map((p) => [p.userId, p]));
    const applicants = apps.map((a) => ({
      ...publicApplication(a),
      profile: byId.get(a.userId) ? publicProfile(byId.get(a.userId), { full: false }) : undefined,
    }));
    sendJson(res, 200, { job: publicJob(job), applicants });
  }

  async function setApplicationStatus(req, res, id) {
    await requireAdmin(req);
    if (!opts.social?.jobs) throw new HttpError(503, 'Jobs are not available.');
    const { status } = await readJson(req);
    if (!STATUSES.includes(status)) throw new HttpError(400, 'Invalid status.');
    const app = await opts.social.jobs.setApplicationStatus(id, status);
    if (!app) throw new HttpError(404, 'Application not found.');
    opts.log?.(`admin  set application ${id} → ${status}`);
    sendJson(res, 200, { application: publicApplication(app) });
  }

  async function statsHandler(req, res) {
    await requireAdmin(req);
    const [users, total] = await Promise.all([opts.store.list({ limit: 500 }), opts.store.count()]);
    const byRole = { admin: 0, user: 0 };
    for (const u of users) byRole[u.role || 'user']++;
    const now = Date.now();
    const weekAgo = now - 7 * 24 * 60 * 60 * 1000;
    const recentSignups = users.filter((u) => new Date(u.createdAt).getTime() > weekAgo).length;
    const recentLogins = users.filter((u) => u.lastLoginAt && new Date(u.lastLoginAt).getTime() > weekAgo).length;
    const dailyActivity = Array.from({ length: 7 }, (_, i) => {
      const d = new Date(now - (6 - i) * 24 * 60 * 60 * 1000);
      const dayStart = new Date(d.getFullYear(), d.getMonth(), d.getDate()).getTime();
      const dayEnd = dayStart + 24 * 60 * 60 * 1000;
      const count = users.filter((u) => u.lastLoginAt && new Date(u.lastLoginAt).getTime() >= dayStart && new Date(u.lastLoginAt).getTime() < dayEnd).length;
      return { day: d.toLocaleDateString('en', { weekday: 'short' }), count };
    });
    const extra = typeof opts.getStats === 'function' ? opts.getStats() : { activeCalls: { rooms: 0, participants: 0 }, activeRooms: [], uptimeSec: 0 };
    sendJson(res, 200, { totalUsers: total, byRole, recentSignups, recentLogins, dailyActivity, ...extra });
  }

  /** Returns true if the request was an admin route (and has been answered). */
  async function handle(req, res, pathname, url) {
    if (!pathname.startsWith('/api/admin/')) return false;
    if (pathname === '/api/admin/users' && req.method === 'GET') await listUsers(req, res, url);
    else if (pathname === '/api/admin/users' && req.method === 'POST') await createUser(req, res);
    else if (pathname === '/api/admin/stats' && req.method === 'GET') await statsHandler(req, res);
    else if (pathname === '/api/admin/ads' && req.method === 'GET') await listAds(req, res);
    else if (pathname === '/api/admin/ads' && req.method === 'POST') await createAd(req, res);
    else if (pathname === '/api/admin/jobs' && req.method === 'GET') await listJobs(req, res);
    else if (pathname === '/api/admin/jobs' && req.method === 'POST') await createJob(req, res);
    else if (pathname === '/api/admin/jobs/import' && req.method === 'POST') await importJobs(req, res);
    else {
      const adMatch = pathname.match(/^\/api\/admin\/ads\/([^/]+)$/);
      const m = pathname.match(/^\/api\/admin\/users\/([^/]+)$/);
      const jobAppMatch = pathname.match(/^\/api\/admin\/jobs\/([^/]+)\/applicants$/);
      const jobMatch = pathname.match(/^\/api\/admin\/jobs\/([^/]+)$/);
      const appMatch = pathname.match(/^\/api\/admin\/applications\/([^/]+)$/);
      if (adMatch && req.method === 'PATCH') await updateAd(req, res, decodeURIComponent(adMatch[1]));
      else if (adMatch && req.method === 'DELETE') await deleteAd(req, res, decodeURIComponent(adMatch[1]));
      else if (jobAppMatch && req.method === 'GET') await jobApplicants(req, res, decodeURIComponent(jobAppMatch[1]));
      else if (jobMatch && req.method === 'PATCH') await updateJob(req, res, decodeURIComponent(jobMatch[1]));
      else if (jobMatch && req.method === 'DELETE') await deleteJob(req, res, decodeURIComponent(jobMatch[1]));
      else if (appMatch && req.method === 'PATCH') await setApplicationStatus(req, res, decodeURIComponent(appMatch[1]));
      else if (m && req.method === 'PATCH') await updateUser(req, res, decodeURIComponent(m[1]));
      else if (m && req.method === 'DELETE') await deleteUser(req, res, decodeURIComponent(m[1]));
      else throw new HttpError(404, 'Not found');
    }
    return true;
  }

  return { handle, requireAdmin };
}
