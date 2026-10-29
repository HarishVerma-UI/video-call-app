// Admin dashboard API: list, create, update and delete user accounts.
// Every route requires a signed-in user whose role is "admin".
//
//   GET    /api/admin/users        → { users: [...], total }
//   POST   /api/admin/users        → create { name, email, password, role? }
//   PATCH  /api/admin/users/:id     → update { name?, email?, role?, password? }
//   DELETE /api/admin/users/:id     → remove

import { HttpError, readJson, sendJson } from '../http.js';
import { DuplicateEmailError, publicUser } from '../db/userStore.js';
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
 * @param {{ store: any, requireUser: (req)=>Promise<any>, log?: Function }} opts
 */
export function createAdmin(opts) {
  async function requireAdmin(req) {
    const user = await opts.requireUser(req);
    if (user.role !== 'admin') throw new HttpError(403, 'Admins only.', { code: 'forbidden' });
    return user;
  }

  async function listUsers(req, res) {
    await requireAdmin(req);
    const [users, total] = await Promise.all([opts.store.list({ limit: 500 }), opts.store.count()]);
    sendJson(res, 200, { users: users.map(publicUser), total });
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
    opts.log?.(`admin  deleted ${target.email || target.id}`);
    sendJson(res, 200, { ok: true, id });
  }

  /** Returns true if the request was an admin route (and has been answered). */
  async function handle(req, res, pathname) {
    if (!pathname.startsWith('/api/admin/')) return false;
    if (pathname === '/api/admin/users' && req.method === 'GET') await listUsers(req, res);
    else if (pathname === '/api/admin/users' && req.method === 'POST') await createUser(req, res);
    else {
      const m = pathname.match(/^\/api\/admin\/users\/([^/]+)$/);
      if (m && req.method === 'PATCH') await updateUser(req, res, decodeURIComponent(m[1]));
      else if (m && req.method === 'DELETE') await deleteUser(req, res, decodeURIComponent(m[1]));
      else throw new HttpError(404, 'Not found');
    }
    return true;
  }

  return { handle, requireAdmin };
}
