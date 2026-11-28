// Admin dashboard API: list, create, update and delete user accounts.
// Every route requires a signed-in user whose role is "admin".
//
//   GET    /api/admin/users?page=1&limit=50&search=… → paged { users, total, page, limit }
//   POST   /api/admin/users        → create { name, email, password, role? }
//   PATCH  /api/admin/users/:id     → update { name?, email?, role?, password? }
//   DELETE /api/admin/users/:id     → remove

import { HttpError, readJson, sendJson } from '../http.js';
import { DuplicateEmailError, publicUser } from '../db/userStore.js';
import { directoryProfile, publicApplication, publicJob, publicPost, publicProfile } from '../db/socialStore.js';
import { hashPassword } from './password.js';
import { isSuperAdmin, isValidRole, normalizeRole } from './roles.js';
import { APPLICATION_STATUSES, JOB_CATS, jobPatchFrom } from '../jobsValidate.js';
import { recordAudit, actorOf } from '../audit.js';

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
const roleOk = (r) => isValidRole(r);

/**
 * @param {{ store: any, requireUser: (req)=>Promise<any>, log?: Function, getStats?: ()=>object, social?: object }} opts
 */
export function createAdmin(opts) {
  async function requireAdmin(req) {
    const user = await opts.requireUser(req);
    if (!isSuperAdmin(user.role)) throw new HttpError(403, 'Super-admins only.', { code: 'forbidden' });
    return user;
  }

  async function listUsers(req, res, url) {
    await requireAdmin(req);
    const page = Math.max(1, Number(url?.searchParams?.get('page')) || 1);
    const limit = Math.min(100, Math.max(1, Number(url?.searchParams?.get('limit')) || 50));
    const search = (url?.searchParams?.get('search') ?? '').trim().slice(0, 100);
    const roleRaw = url?.searchParams?.get('role') ?? '';
    const role = ['member', 'recruiter', 'super_admin'].includes(roleRaw) ? roleRaw : '';
    const skip = (page - 1) * limit;
    const [paged, total] = await Promise.all([
      opts.store.list({ limit, skip, search, role }),
      opts.store.count({ search, role }),
    ]);
    const profiles = opts.social?.profiles ? await opts.social.profiles.getMany(paged.map((user) => user.id)) : [];
    const profileById = new Map(profiles.map((profile) => [profile.userId, profile]));
    const users = await Promise.all(paged.map(async (user) => ({
      ...publicUser(user),
      profile: await directoryProfile(profileById.get(user.id), opts.media),
    })));
    sendJson(res, 200, { users, total, page, limit });
  }

  async function createUser(req, res) {
    const admin = await requireAdmin(req);
    const body = await readJson(req);
    const name = cleanName(body?.name);
    const email = cleanEmail(body?.email);
    const password = typeof body?.password === 'string' ? body.password : '';
    const role = body?.role ?? 'member';

    const fields = {};
    const ne = nameError(name);
    const ee = emailError(email);
    const pe = passwordError(password);
    if (ne) fields.name = ne;
    if (ee) fields.email = ee;
    if (pe) fields.password = pe;
    if (!roleOk(role)) fields.role = 'Role must be member, recruiter, or super_admin.';
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
    recordAudit({ ...actorOf(admin), action: 'created a user', category: 'admin', target: `${user.name} · ${normalizeRole(user.role)}` });
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
      if (!roleOk(body.role)) fields.role = 'Role must be member, recruiter, or super_admin.';
      else if (target.id === admin.id && normalizeRole(body.role) !== 'super_admin') fields.role = 'You can’t remove your own super-admin access.';
      else patch.role = body.role;
    }
    if (body.password !== undefined && body.password !== '') {
      const e = passwordError(body.password);
      if (e) fields.password = e;
      else patch.passwordHash = await hashPassword(body.password);
    }
    if (body.recruiterApplicationStatus !== undefined) {
      if (!['approved', 'rejected'].includes(body.recruiterApplicationStatus)) {
        fields.recruiterApplicationStatus = 'Choose approved or rejected.';
      } else if (target.recruiterApplication?.status !== 'pending') {
        throw new HttpError(409, 'This recruiter application is no longer pending.');
      } else {
        patch.recruiterApplication = {
          ...target.recruiterApplication,
          status: body.recruiterApplicationStatus,
          reviewedAt: new Date().toISOString(),
          reviewedBy: admin.id,
        };
        if (body.recruiterApplicationStatus === 'approved') patch.role = 'recruiter';
      }
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
    recordAudit({ ...actorOf(admin), action: patch.role ? 'changed a user role' : 'updated a user', category: 'admin', target: `${updated.name}${patch.role ? ' → ' + normalizeRole(updated.role) : ''}` });
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
    recordAudit({ ...actorOf(admin), action: 'deleted a user', category: 'admin', target: target.name || target.email || id });
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
  async function listJobs(req, res, url) {
    await requireAdmin(req);
    const { page, limit, search, status, category } = pageParams(url);
    if (!opts.social?.jobs) return sendJson(res, 200, { jobs: [], total: 0, page, limit });
    const [all, counts] = await Promise.all([opts.social.jobs.list({ activeOnly: false }), opts.social.jobs.applicantCounts()]);
    const q = search.toLowerCase();
    let jobs = all;
    if (q) jobs = jobs.filter((j) => (j.title || '').toLowerCase().includes(q) || (j.company || '').toLowerCase().includes(q));
    if (status === 'live') jobs = jobs.filter((j) => j.active !== false);
    else if (status === 'closed') jobs = jobs.filter((j) => j.active === false);
    if (category && JOB_CATS.includes(category)) jobs = jobs.filter((j) => (j.category || 'tech') === category);
    const total = jobs.length;
    const skip = (page - 1) * limit;
    const paged = jobs.slice(skip, skip + limit);
    sendJson(res, 200, { jobs: paged.map((j) => ({ ...publicJob(j), applicantCount: counts[j.id] ?? 0 })), total, page, limit });
  }

  async function createJob(req, res) {
    const admin = await requireAdmin(req);
    if (!opts.social?.jobs) throw new HttpError(503, 'Jobs are not available.');
    const patch = jobPatchFrom(await readJson(req), { partial: false });
    const fields = {};
    if (!patch.title) fields.title = 'A title is required.';
    if (!patch.company) fields.company = 'A company is required.';
    if (Object.keys(fields).length) throw new HttpError(400, 'Please fix the highlighted fields.', { fields });
    const job = await opts.social.jobs.create({ ...patch, postedBy: admin.id, postedByName: admin.name });
    opts.log?.(`admin  created job ${job.id}`);
    recordAudit({ ...actorOf(admin), action: 'posted a job', category: 'jobs', target: `${job.title} · ${job.company}` });
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
    const admin = await requireAdmin(req);
    if (!opts.social?.jobs) throw new HttpError(503, 'Jobs are not available.');
    const body = await readJson(req, 4 * 1024 * 1024);
    const incoming = Array.isArray(body.jobs) ? body.jobs : [];
    if (!incoming.length) throw new HttpError(400, 'No jobs to import.');
    if (incoming.length > 500) throw new HttpError(400, 'Import at most 500 jobs at a time.');
    // Dedupe by default; pass dedupe:false to insert a curated batch verbatim
    // (e.g. a spreadsheet where several roles share one careers URL).
    const dedupe = body.dedupe !== false;
    const existing = dedupe ? await opts.social.jobs.list({ activeOnly: false }) : [];
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
      if (dedupe && ((urlKey && seenUrl.has(urlKey)) || seenKey.has(key))) { skipped++; continue; }
      await opts.social.jobs.create(patch);
      if (urlKey) seenUrl.add(urlKey);
      seenKey.add(key);
      created++;
    }
    opts.log?.(`admin  imported ${created} jobs (${skipped} skipped)`);
    recordAudit({ ...actorOf(admin), action: 'imported jobs', category: 'jobs', target: `${created} added, ${skipped} skipped` });
    sendJson(res, 201, { created, skipped });
  }

  async function deleteJob(req, res, id) {
    const admin = await requireAdmin(req);
    if (!opts.social?.jobs) throw new HttpError(503, 'Jobs are not available.');
    const ok = await opts.social.jobs.remove(id);
    if (!ok) throw new HttpError(404, 'Job not found.');
    opts.log?.(`admin  deleted job ${id}`);
    recordAudit({ ...actorOf(admin), action: 'removed a job', category: 'jobs', target: typeof ok === 'object' && ok ? `${ok.title} · ${ok.company}` : id });
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
    if (!APPLICATION_STATUSES.includes(status)) throw new HttpError(400, 'Invalid status.');
    const app = await opts.social.jobs.setApplicationStatus(id, status);
    if (!app) throw new HttpError(404, 'Application not found.');
    opts.log?.(`admin  set application ${id} → ${status}`);
    sendJson(res, 200, { application: publicApplication(app) });
  }

  async function statsHandler(req, res) {
    await requireAdmin(req);
    const [users, total] = await Promise.all([opts.store.list({ limit: 500 }), opts.store.count()]);
    const byRole = { member: 0, recruiter: 0, super_admin: 0 };
    for (const u of users) byRole[normalizeRole(u.role)]++;
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
    // 12-month cumulative user growth (from signup timestamps).
    const months = [];
    for (let i = 11; i >= 0; i--) {
      const d = new Date(now);
      d.setMonth(d.getMonth() - i, 1);
      months.push({ key: d.getFullYear() * 12 + d.getMonth(), label: d.toLocaleDateString('en', { month: 'short' }), total: 0 });
    }
    for (const u of users) {
      const t = new Date(u.createdAt).getTime();
      if (!t) continue;
      const k = new Date(t); const mk = k.getFullYear() * 12 + k.getMonth();
      for (const m of months) if (m.key >= mk) m.total++;
    }
    const userGrowth = months.map((m) => ({ label: m.label, total: m.total }));

    const extra = typeof opts.getStats === 'function' ? opts.getStats() : { activeCalls: { rooms: 0, participants: 0 }, activeRooms: [], uptimeSec: 0 };

    // Platform (jobs & applications) metrics for the super-admin console.
    const platform = { jobsTotal: 0, jobsActive: 0, jobsByCategory: Object.fromEntries(JOB_CATS.map((c) => [c, 0])), applicationsTotal: 0, applicationsByStatus: { applied: 0, shortlisted: 0, rejected: 0 } };
    const jobsStore = opts.social?.jobs;
    if (jobsStore) {
      const jobs = await jobsStore.list({ activeOnly: false });
      platform.jobsTotal = jobs.length;
      for (const j of jobs) {
        if (j.active !== false) platform.jobsActive++;
        { const c = JOB_CATS.includes(j.category) ? j.category : 'tech'; platform.jobsByCategory[c]++; }
      }
      const ids = jobs.map((j) => j.id);
      const apps = ids.length ? await jobsStore.applicationsForJobIds(ids) : [];
      platform.applicationsTotal = apps.length;
      for (const a of apps) if (platform.applicationsByStatus[a.status] !== undefined) platform.applicationsByStatus[a.status]++;
    }

    sendJson(res, 200, { totalUsers: total, byRole, recentSignups, recentLogins, dailyActivity, userGrowth, ...platform, ...extra });
  }

  async function auditHandler(req, res, url) {
    await requireAdmin(req);
    const auditStore = opts.social?.audit;
    const { page, limit } = pageParams(url, 50, 200);
    const category = url?.searchParams?.get('category') || undefined;
    if (!auditStore) { sendJson(res, 200, { events: [], total: 0, page, limit }); return; }
    const [events, count] = await Promise.all([
      auditStore.list({ page, limit, category }),
      auditStore.count ? auditStore.count({ category }) : Promise.resolve(0),
    ]);
    sendJson(res, 200, { events, total: count, page, limit });
  }

  // Bulk delete users (skips self), returns how many were removed.
  async function bulkDeleteUsers(req, res) {
    const admin = await requireAdmin(req);
    const body = await readJson(req);
    const ids = Array.isArray(body?.ids) ? body.ids.filter((x) => typeof x === 'string' && x !== admin.id) : [];
    let deleted = 0;
    for (const id of ids) {
      const target = await opts.store.findById(id);
      if (!target) continue;
      await opts.store.remove(id);
      deleted++;
      if (opts.social) {
        const { profiles, connections, posts, dms, jobs } = opts.social;
        await Promise.all([
          profiles?.remove?.(id),
          connections?.removeByUser?.(id),
          posts?.removeByAuthor?.(id),
          dms?.removeByUser?.(id),
          jobs?.removeApplicationsByUser?.(id),
        ].filter(Boolean));
      }
    }
    recordAudit({ ...actorOf(admin), action: 'bulk-deleted users', category: 'admin', target: `${deleted} account${deleted !== 1 ? 's' : ''}` });
    sendJson(res, 200, { ok: true, deleted });
  }

  async function bulkDeleteJobs(req, res) {
    const admin = await requireAdmin(req);
    const body = await readJson(req);
    const jobsStore = opts.social?.jobs;
    const ids = Array.isArray(body?.ids) ? body.ids.filter((x) => typeof x === 'string') : [];
    let deleted = 0;
    if (jobsStore) for (const id of ids) { const ok = await jobsStore.remove(id); if (ok) deleted++; }
    recordAudit({ ...actorOf(admin), action: 'bulk-deleted jobs', category: 'admin', target: `${deleted} role${deleted !== 1 ? 's' : ''}` });
    sendJson(res, 200, { ok: true, deleted });
  }

  async function listRecruiters(req, res) {
    await requireAdmin(req);
    const users = await opts.store.list({ limit: 500 });
    const recruiters = users.filter((u) => ['recruiter', 'super_admin'].includes(normalizeRole(u.role)));
    const jobsStore = opts.social?.jobs;
    const counts = jobsStore ? await jobsStore.applicantCounts() : {};
    const allJobs = jobsStore ? await jobsStore.list({ activeOnly: false }) : [];
    const out = recruiters.map((u) => {
      const theirs = allJobs.filter((j) => j.postedBy === u.id);
      return {
        ...publicUser(u),
        jobCount: theirs.length,
        applicantCount: theirs.reduce((s, j) => s + (counts[j.id] ?? 0), 0),
      };
    });
    sendJson(res, 200, { recruiters: out });
  }

  async function listRecruiterApplications(req, res) {
    await requireAdmin(req);
    const users = await opts.store.list({ limit: 500 });
    const requests = users
      .filter((user) => user.recruiterApplication?.status === 'pending')
      .map((user) => publicUser(user));
    sendJson(res, 200, { requests });
  }

  // ---- global content lists for the admin console ----
  function qLimit(url, def = 50, max = 200) {
    const n = parseInt(url?.searchParams?.get('limit') ?? '', 10);
    return Number.isFinite(n) ? Math.min(max, Math.max(1, n)) : def;
  }
  function pageParams(url, def = 25, max = 100) {
    const p = parseInt(url?.searchParams?.get('page') ?? '', 10);
    return {
      page: Number.isFinite(p) ? Math.max(1, p) : 1,
      limit: qLimit(url, def, max),
      search: (url?.searchParams?.get('search') ?? '').trim().slice(0, 100),
      status: url?.searchParams?.get('status') || undefined,
      category: url?.searchParams?.get('category') || undefined,
    };
  }

  async function listPosts(req, res, url) {
    await requireAdmin(req);
    const store = opts.social?.posts;
    const { page, limit, search } = pageParams(url);
    if (!store?.listAll) { sendJson(res, 200, { posts: [], total: 0, page, limit }); return; }
    const { items, total } = await store.listAll({ page, limit, search });
    const posts = items.map((p) => ({
      ...publicPost(p),
      likeCount: (p.likes ?? []).length,
      commentCount: (p.comments ?? []).length,
    }));
    sendJson(res, 200, { posts, total, page, limit });
  }

  async function listComments(req, res, url) {
    await requireAdmin(req);
    const store = opts.social?.posts;
    const { page, limit, search } = pageParams(url);
    if (!store?.listComments) { sendJson(res, 200, { comments: [], total: 0, page, limit }); return; }
    const { items, total } = await store.listComments({ page, limit, search });
    sendJson(res, 200, { comments: items, total, page, limit });
  }

  async function listConnections(req, res, url) {
    await requireAdmin(req);
    const store = opts.social?.connections;
    const { page, limit, status } = pageParams(url);
    if (!store?.listAll) { sendJson(res, 200, { connections: [], total: 0, page, limit }); return; }
    const { items, total } = await store.listAll({ page, limit, status: status === 'pending' || status === 'accepted' ? status : undefined });
    // resolve display names for the (bounded) page
    const ids = [...new Set(items.flatMap((c) => c.users))];
    const names = {};
    await Promise.all(ids.map(async (id) => { const u = await opts.store.findById(id); names[id] = u?.name || u?.email || 'Unknown'; }));
    const connections = items.map((c) => ({
      pair: c.pair,
      from: { id: c.requester, name: names[c.requester] ?? 'Unknown' },
      to: { id: c.users.find((u) => u !== c.requester) ?? c.users[0], name: names[c.users.find((u) => u !== c.requester) ?? c.users[0]] ?? 'Unknown' },
      status: c.status,
      createdAt: c.createdAt,
      updatedAt: c.updatedAt,
    }));
    sendJson(res, 200, { connections, total, page, limit });
  }

  async function listApplications(req, res, url) {
    await requireAdmin(req);
    const store = opts.social?.jobs;
    const { page, limit, search, status } = pageParams(url);
    const st = ['applied', 'shortlisted', 'rejected'].includes(status) ? status : undefined;
    if (!store?.applicationsAll) { sendJson(res, 200, { applications: [], total: 0, page, limit }); return; }
    const { items, total } = await store.applicationsAll({ page, limit, search, status: st });
    const jobIds = [...new Set(items.map((a) => a.jobId))];
    const jobsById = {};
    await Promise.all(jobIds.map(async (id) => { jobsById[id] = await store.byId(id); }));
    const applications = items.map((a) => {
      const j = jobsById[a.jobId];
      return { ...publicApplication(a), jobTitle: j?.title ?? '-', company: j?.company ?? '', jobCategory: j?.category ?? '' };
    });
    sendJson(res, 200, { applications, total, page, limit });
  }

  async function bulkDeletePosts(req, res) {
    const admin = await requireAdmin(req);
    const store = opts.social?.posts;
    const body = await readJson(req);
    const ids = Array.isArray(body?.ids) ? body.ids.filter((x) => typeof x === 'string') : [];
    let deleted = 0;
    if (store) for (const id of ids) { const ok = await store.remove(id); if (ok) deleted++; }
    recordAudit({ ...actorOf(admin), action: 'removed posts', category: 'admin', target: `${deleted} post${deleted !== 1 ? 's' : ''}` });
    sendJson(res, 200, { ok: true, deleted });
  }

  async function deleteComment(req, res, postId, commentId) {
    const admin = await requireAdmin(req);
    const store = opts.social?.posts;
    if (!store) throw new HttpError(503, 'Posts are not available.');
    const updated = await store.removeComment(postId, commentId);
    if (!updated) throw new HttpError(404, 'Comment not found.');
    recordAudit({ ...actorOf(admin), action: 'removed a comment', category: 'admin', target: '' });
    sendJson(res, 200, { ok: true });
  }

  /** Returns true if the request was an admin route (and has been answered). */
  async function handle(req, res, pathname, url) {
    if (!pathname.startsWith('/api/admin/')) return false;
    if (pathname === '/api/admin/users' && req.method === 'GET') await listUsers(req, res, url);
    else if (pathname === '/api/admin/users' && req.method === 'POST') await createUser(req, res);
    else if (pathname === '/api/admin/users/bulk-delete' && req.method === 'POST') await bulkDeleteUsers(req, res);
    else if (pathname === '/api/admin/jobs/bulk-delete' && req.method === 'POST') await bulkDeleteJobs(req, res);
    else if (pathname === '/api/admin/audit' && req.method === 'GET') await auditHandler(req, res, url);
    else if (pathname === '/api/admin/stats' && req.method === 'GET') await statsHandler(req, res);
    else if (pathname === '/api/admin/recruiters' && req.method === 'GET') await listRecruiters(req, res);
    else if (pathname === '/api/admin/recruiter-applications' && req.method === 'GET') await listRecruiterApplications(req, res);
    else if (pathname === '/api/admin/ads' && req.method === 'GET') await listAds(req, res);
    else if (pathname === '/api/admin/ads' && req.method === 'POST') await createAd(req, res);
    else if (pathname === '/api/admin/jobs' && req.method === 'GET') await listJobs(req, res, url);
    else if (pathname === '/api/admin/jobs' && req.method === 'POST') await createJob(req, res);
    else if (pathname === '/api/admin/jobs/import' && req.method === 'POST') await importJobs(req, res);
    else if (pathname === '/api/admin/posts' && req.method === 'GET') await listPosts(req, res, url);
    else if (pathname === '/api/admin/posts/bulk-delete' && req.method === 'POST') await bulkDeletePosts(req, res);
    else if (pathname === '/api/admin/comments' && req.method === 'GET') await listComments(req, res, url);
    else if (pathname === '/api/admin/connections' && req.method === 'GET') await listConnections(req, res, url);
    else if (pathname === '/api/admin/applications' && req.method === 'GET') await listApplications(req, res, url);
    else {
      const adMatch = pathname.match(/^\/api\/admin\/ads\/([^/]+)$/);
      const commentMatch = pathname.match(/^\/api\/admin\/posts\/([^/]+)\/comments\/([^/]+)$/);
      const m = pathname.match(/^\/api\/admin\/users\/([^/]+)$/);
      const jobAppMatch = pathname.match(/^\/api\/admin\/jobs\/([^/]+)\/applicants$/);
      const jobMatch = pathname.match(/^\/api\/admin\/jobs\/([^/]+)$/);
      const appMatch = pathname.match(/^\/api\/admin\/applications\/([^/]+)$/);
      if (commentMatch && req.method === 'DELETE') await deleteComment(req, res, decodeURIComponent(commentMatch[1]), decodeURIComponent(commentMatch[2]));
      else if (adMatch && req.method === 'PATCH') await updateAd(req, res, decodeURIComponent(adMatch[1]));
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
