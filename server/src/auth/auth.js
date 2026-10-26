// Accounts: register, log in, and "who am I", plus token checks used by the
// WebSocket. Tokens are JWTs (HS256) carrying the user id in `sub`.

import { HttpError, bearerToken, clientIp, readJson, sendJson } from '../http.js';
import { DuplicateEmailError, publicUser } from '../db/userStore.js';
import { TokenError, signToken, verifyToken } from './jwt.js';
import { dummyVerify, hashPassword, verifyPassword } from './password.js';
import { createRateLimiter } from './rateLimit.js';

const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;

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

/**
 * @param {{ store: any, jwtSecret: string, jwtExpiresInSec: number, trustProxy: boolean, log?: Function }} opts
 */
export function createAuth(opts) {
  const tokenOpts = { secret: opts.jwtSecret, issuer: 'huddle', audience: 'huddle-app' };
  const loginByIp = createRateLimiter({ limit: 50, windowMs: 15 * 60_000 });
  const loginByEmail = createRateLimiter({ limit: 10, windowMs: 15 * 60_000 });
  const registerByIp = createRateLimiter({ limit: 20, windowMs: 60 * 60_000 });

  const issue = (user) => {
    const token = signToken({ sub: user.id, name: user.name }, { ...tokenOpts, expiresInSec: opts.jwtExpiresInSec });
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
    // Look the user up so deleted accounts lose access immediately.
    return opts.store.findById(claims.sub);
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
    // Same message and similar timing whether the email exists or not.
    const ok = user ? await verifyPassword(password, user.passwordHash) : await dummyVerify(password);
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

  /** Returns true if the request was an auth route (and has been answered). */
  async function handle(req, res, pathname) {
    if (!pathname.startsWith('/api/auth/')) return false;
    const route = `${req.method} ${pathname}`;
    if (route === 'POST /api/auth/register') await register(req, res);
    else if (route === 'POST /api/auth/login') await login(req, res);
    else if (route === 'GET /api/auth/me') await me(req, res);
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
