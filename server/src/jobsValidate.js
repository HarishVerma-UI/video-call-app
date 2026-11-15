// Shared job input validation, used by both the super-admin console and the
// recruiter dashboard so the two agree on what a valid job looks like.
import { HttpError } from './http.js';

const str = (v, max) => (typeof v === 'string' ? v.trim().slice(0, max) : '');
const num = (v) => (v === null || v === undefined || v === '' ? null : Number.isFinite(Number(v)) ? Number(v) : null);
const list40 = (v, max) => (Array.isArray(v) ? v.slice(0, 40).map((x) => str(x, max)).filter(Boolean) : []);

export const JOB_CATS = ['tech', 'non-tech'];
export const JOB_TYPES = ['full-time', 'part-time', 'contract', 'internship'];
export const JOB_EXPS = ['entry', 'mid', 'senior', 'lead'];
export const APPLICATION_STATUSES = ['applied', 'shortlisted', 'rejected'];

export function jobPatchFrom(body, { partial }) {
  const patch = {};
  if (!partial || body.title !== undefined) patch.title = str(body.title, 160);
  if (!partial || body.company !== undefined) patch.company = str(body.company, 160);
  if (!partial || body.category !== undefined) patch.category = JOB_CATS.includes(body.category) ? body.category : 'tech';
  if (!partial || body.country !== undefined) patch.country = str(body.country, 80);
  if (!partial || body.type !== undefined) patch.type = JOB_TYPES.includes(body.type) ? body.type : 'full-time';
  if (!partial || body.experience !== undefined) patch.experience = JOB_EXPS.includes(body.experience) ? body.experience : 'mid';
  if (!partial || body.salaryMin !== undefined) patch.salaryMin = num(body.salaryMin);
  if (!partial || body.salaryMax !== undefined) patch.salaryMax = num(body.salaryMax);
  if (!partial || body.salaryCurrency !== undefined) patch.salaryCurrency = str(body.salaryCurrency, 8) || 'USD';
  if (!partial || body.remote !== undefined) patch.remote = body.remote === true;
  if (!partial || body.description !== undefined) patch.description = str(body.description, 8000);
  if (!partial || body.requirements !== undefined) patch.requirements = list40(body.requirements, 200);
  if (!partial || body.skills !== undefined) patch.skills = list40(body.skills, 60);
  if (!partial || body.active !== undefined) patch.active = body.active !== false;
  if (!partial || body.applyUrl !== undefined) {
    const u = str(body.applyUrl, 500);
    if (u && !/^https?:\/\//i.test(u)) throw new HttpError(400, 'Please fix the highlighted fields.', { fields: { applyUrl: 'Link must start with http:// or https://' } });
    patch.applyUrl = u;
  }
  if (!partial || body.source !== undefined) patch.source = str(body.source, 80);
  return patch;
}
