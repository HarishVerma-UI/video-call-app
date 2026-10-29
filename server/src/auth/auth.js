// Accounts: register, log in, and "who am I", plus token checks used by the
// WebSocket. Tokens are JWTs (HS256) carrying the user id in `sub`.

import { HttpError, bearerToken, clientIp, readJson, sendJson } from '../http.js';
import { DuplicateEmailError, publicUser } from '../db/userStore.js';
import { TokenError, signToken, verifyToken } from './jwt.js';
import { dummyVerify, hashPassword, verifyPassword } from './password.js';
import { createOAuth } from './oauth.js';
import { createRateLimiter } from './rateLimit.js';

const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;

const cleanName = (v) => (typeof v === 'string' ? v.trim().replace(/\s+/g, ' ') : '');
const cleanEmail = (v) => (typeof v === 'string' ? v.trim().toLowerCase() : '');
const nameError = (name) => (name.length < 2 || name.length > 40 ? 'Name must be 2–40 characters.' : null);
const emailError = (email) => (!EMAIL.test(email) || email.length > 254 ? 'Enter a valid email address.' : null);
function passwordError(password) {
  if (password.length < 8) return 'Use at least 8 characters.';
  if (password.length > 128) return 'Use at most 128 characters.';
  if (!/[a-zA-Z]/.test(password) || !/\d/.test(password)) return 'Include at least one letter and one number.';
  return null;
}

function validateRegistration(body) {
  const errors = {};
  const name = typeof body.name === 'string' ? body.name.trim().replace(/\s+/g, ' ') : '';
  const email = typeof body.email === 'string' ? body.email.trim().toLowerCase() : '';
  const password = typeof body.password === 'string' ? body.password : '';

  if (name.length < 2 || name.length > 40) errors.name = 'Name must be 2–40 characters.';
  if (!EMAIL.test(email) || email.length > 254) errors.email = 'Enter a valid email address.';
  if (password.length < 8) errors.password = 'Use at least 8 characters.';
  else if (password.length > 128) errors.password = 'Use at most 128 characters.';
  else if (!/[a-zA-Z]/.test(password) || !/\d/.test(password)) errors.password = 'Include at least one letter and one number.';

  return { name, email, password, errors };
}

function validateNewAccount(body) {
  const name = cleanName(body?.name);
  const email = cleanEmail(body?.email);
  const errors = {};
  const n = nameError(name);
  const e = emailError(email);
  if (n) errors.name = n;
  if (e) errors.email = e;
  return { name, email, errors };
}

/**
 * @param {{ store: any, oauth?: object, appUrl?: string, allowedOrigins?: string[], jwtSecret: string, jwtExpiresInSec: number, trustProxy: boolean, log?: Function }} opts
 */
export function createAuth(opts) {
  const tokenOpts = { secret: opts.jwtSecret, issuer: 'huddle', audience: 'huddle-app' };
  const loginByIp = createRateLimiter({ limit: 50, windowMs: 15 * 60_000 });
  const loginByEmail = createRateLimiter({ limit: 10, windowMs: 15 * 60_000 });
  const registerByIp = createRateLimiter({ limit: 20, windowMs: 60 * 60_000 });

  const issue = (user) => {
    const token = signToken(
      { sub: user.id, name: user.name, tv: user.tokenVersion ?? 0 },
      { ...tokenOpts, expiresInSec: opts.jwtExpiresInSec },
    );
    return {
      user: publicUser(user),
      token,
      expiresAt: new Date(Date.now() + opts.jwtExpiresInSec * 1000).toISOString(),
    };
  };

  /** Token → current user record, or null. Also used by the WebSocket join. */
  async function userFromToken(token) {
    if (!token) return null;
    let claims;
    try {
      claims = verifyToken(token, tokenOpts);
    } catch (err) {
      if (err instanceof TokenError) return null;
      throw err;
    }
    // Look the user up so deleted accounts lose access immediately, and so a
    // password change (which bumps tokenVersion) ends every older session.
    const user = await opts.store.findById(claims.sub);
    if (!user || (claims.tv ?? 0) !== (user.tokenVersion ?? 0)) return null;
    return user;
  }

  async function requireUser(req) {
    const user = await userFromToken(bearerToken(req));
    if (!user) throw new HttpError(401, 'Please sign in again.', { code: 'unauthorized' });
    return user;
  }

  async function register(req, res) {
    const ip = clientIp(req, opts.trustProxy);
    const limited = registerByIp.hit(ip);
    if (!limited.ok)
      throw new HttpError(429, 'Too many sign-ups from this network. Try again later.', { retryAfterSec: limited.retryAfterSec });

    const { name, email, password, errors } = validateRegistration(await readJson(req));
    if (Object.keys(errors).length) throw new HttpError(400, 'Please fix the highlighted fields.', { fields: errors });

    let user;
    try {
      user = await opts.store.create({ name, email, passwordHash: await hashPassword(password) });
    } catch (err) {
      if (err instanceof DuplicateEmailError)
        throw new HttpError(409, 'An account with this email already exists.', { fields: { email: 'Already registered — try signing in.' } });
      throw err;
    }
    opts.log?.(`auth   registered ${email}`);
    sendJson(res, 201, issue(user));
  }

  async function login(req, res) {
    const body = await readJson(req);
    const email = typeof body.email === 'string' ? body.email.trim().toLowerCase() : '';
    const password = typeof body.password === 'string' ? body.password : '';
    if (!email || !password) throw new HttpError(400, 'Enter your email and password.');

    const ip = clientIp(req, opts.trustProxy);
    const a = loginByIp.hit(ip);
    const b = loginByEmail.hit(email);
    if (!a.ok || !b.ok) {
      throw new HttpError(429, 'Too many attempts. Please wait a few minutes and try again.', {
        retryAfterSec: Math.max(a.retryAfterSec, b.retryAfterSec),
      });
    }

    const user = await opts.store.findByEmail(email);
    // Same message and similar timing whether the email exists, or has no password (face-only account).
    const ok = user?.passwordHash ? await verifyPassword(password, user.passwordHash) : await dummyVerify(password);
    if (!user || !ok) throw new HttpError(401, 'Email or password is incorrect.', { code: 'invalid-credentials' });

    loginByEmail.reset(email);
    await opts.store.recordLogin(user.id);
    opts.log?.(`auth   login ${email}`);
    sendJson(res, 200, issue(user));
  }

  async function me(req, res) {
    const user = await requireUser(req);
    sendJson(res, 200, { user: publicUser(user) });
  }

  /** PATCH /api/auth/me — change name and/or email. Email changes need the current password. */
  async function updateMe(req, res) {
    const user = await requireUser(req);
    const body = await readJson(req);
    const fields = {};
    const patch = {};
    if (body.name !== undefined) {
      const name = cleanName(body.name);
      const err = nameError(name);
      if (err) fields.name = err;
      else if (name !== user.name) patch.name = name;
    }
    if (body.email !== undefined) {
      const email = cleanEmail(body.email);
      const err = emailError(email);
      if (err) fields.email = err;
      else if (email !== user.email) patch.email = email;
    }
    if (Object.keys(fields).length) throw new HttpError(400, 'Please fix the highlighted fields.', { fields });

    // Accounts with a password confirm it to change email; face-only accounts are already
    // verified by the face sign-in that created this session.
    if (patch.email && user.passwordHash) {
      const current = typeof body.currentPassword === 'string' ? body.currentPassword : '';
      if (!current) throw new HttpError(400, 'Enter your current password to change your email.', { fields: { currentPassword: 'Required to change your email.' } });
      if (!(await verifyPassword(current, user.passwordHash)))
        throw new HttpError(403, 'Your current password is incorrect.', { fields: { currentPassword: 'That password is incorrect.' } });
    }
    if (!Object.keys(patch).length) {
      sendJson(res, 200, issue(user));
      return;
    }
    let updated;
    try {
      updated = await opts.store.updateProfile(user.id, patch);
    } catch (err) {
      if (err instanceof DuplicateEmailError)
        throw new HttpError(409, 'An account with this email already exists.', { fields: { email: 'Already used by another account.' } });
      throw err;
    }
    opts.log?.(`auth   profile updated ${updated.email}`);
    sendJson(res, 200, issue(updated));
  }

  /** POST /api/auth/password — change password; signs out every other session. */
  async function changePassword(req, res) {
    const user = await requireUser(req);
    const body = await readJson(req);
    const current = typeof body.currentPassword === 'string' ? body.currentPassword : '';
    const next = typeof body.newPassword === 'string' ? body.newPassword : '';

    const limited = loginByEmail.hit(`pw:${user.id}`);
    if (!limited.ok) throw new HttpError(429, 'Too many attempts. Please wait a few minutes and try again.', { retryAfterSec: limited.retryAfterSec });

    const err = passwordError(next);
    if (err) throw new HttpError(400, 'Please fix the highlighted fields.', { fields: { newPassword: err } });
    if (!user.passwordHash) {
      // Face-only account adding a backup password: nothing to confirm, and no need to sign out other devices.
      const updated = await opts.store.setPassword(user.id, await hashPassword(next), { revokeSessions: false });
      loginByEmail.reset(`pw:${user.id}`);
      opts.log?.(`auth   password set ${updated.email}`);
      sendJson(res, 200, issue(updated));
      return;
    }
    if (!(await verifyPassword(current, user.passwordHash)))
      throw new HttpError(403, 'Your current password is incorrect.', { fields: { currentPassword: 'That password is incorrect.' } });
    if (await verifyPassword(next, user.passwordHash))
      throw new HttpError(400, 'Choose a password you haven’t used here.', { fields: { newPassword: 'That’s your current password.' } });

    const updated = await opts.store.setPassword(user.id, await hashPassword(next));
    loginByEmail.reset(`pw:${user.id}`);
    opts.log?.(`auth   password changed ${updated.email}`);
    // A fresh token for this device; tokens on other devices no longer work.
    sendJson(res, 200, issue(updated));
  }

  const oauth = createOAuth({
    oauth: opts.oauth ?? {},
    appUrl: opts.appUrl ?? '',
    trustProxy: opts.trustProxy,
    jwtSecret: opts.jwtSecret,
    jwtExpiresInSec: opts.jwtExpiresInSec,
    store: opts.store,
    issue,
    log: opts.log,
  });

  /** Returns true if the request was an auth route (and has been answered). */
  async function handle(req, res, pathname) {
    if (!pathname.startsWith('/api/auth/')) return false;
    if (await oauth.handle(req, res, pathname)) return true;
    const route = `${req.method} ${pathname}`;
    if (route === 'POST /api/auth/register') await register(req, res);
    else if (route === 'POST /api/auth/login') await login(req, res);
    else if (route === 'GET /api/auth/me') await me(req, res);
    else if (route === 'PATCH /api/auth/me') await updateMe(req, res);
    else if (route === 'POST /api/auth/password') await changePassword(req, res);
    else if (route === 'GET /api/auth/providers') sendJson(res, 200, { providers: oauth.configuredProviders() });
    else throw new HttpError(404, 'Not found');
    return true;
  }

  return {
    handle,
    userFromToken,
    requireUser,
    close() {
      loginByIp.close();
      loginByEmail.close();
      registerByIp.close();
    },
  };
}
