// Face sign-in routes.
//
// Web (passkeys / WebAuthn) — the browser shows the device's own face prompt:
//   POST /api/auth/passkey/register/options  { name, email }  new account, or with Bearer: add to your account
//   POST /api/auth/passkey/register/verify   { credential, deviceName? }
//   POST /api/auth/passkey/login/options     {}
//   POST /api/auth/passkey/login/verify      { credential }
//
// Mobile app — a random key kept in the phone's keychain, readable only after Face ID /
// face unlock / fingerprint succeeds on the phone:
//   POST /api/auth/device/register  { name, email, deviceName }  new account, or with Bearer: add
//   POST /api/auth/device/login     { deviceId, secret }
//
// Both:
//   GET    /api/auth/credentials        list your face sign-in devices
//   DELETE /api/auth/credentials/:id    remove one

import { createHash, randomBytes, timingSafeEqual } from 'node:crypto';
import { HttpError, bearerToken, clientIp, readJson, sendJson } from '../http.js';
import { DuplicateEmailError } from '../db/userStore.js';
import { publicCredential } from '../db/credentialStore.js';
import { WebAuthnError, b64url, challengeOf, createChallengeStore, newChallenge, verifyAuthentication, verifyRegistration } from './webauthn.js';
import { createRateLimiter } from './rateLimit.js';

const FACE_FAILED = 'We couldn’t verify that face sign-in. Try again, or use your email and password.';
const sha256 = (s) => createHash('sha256').update(s).digest();
const cleanDeviceName = (v, fallback) => (typeof v === 'string' && v.trim() ? v.trim().replace(/\s+/g, ' ').slice(0, 60) : fallback);

/** Rough device label from the browser's user agent, e.g. "Chrome on Windows". */
function deviceFromUa(ua = '') {
  const os = /iPhone|iPad/.test(ua) ? 'iPhone' : /Android/.test(ua) ? 'Android' : /Mac OS X/.test(ua) ? 'Mac' : /Windows/.test(ua) ? 'Windows' : /Linux/.test(ua) ? 'Linux' : 'this device';
  const browser = /Edg\//.test(ua) ? 'Edge' : /Chrome\//.test(ua) ? 'Chrome' : /Firefox\//.test(ua) ? 'Firefox' : /Safari\//.test(ua) ? 'Safari' : 'Browser';
  return `${browser} on ${os}`;
}

/**
 * @param {{ store, credentials, issue, requireUser, validateNewAccount, trustProxy, allowedOrigins: string[],
 *   webauthn: { rpId?: string, rpName?: string, origins?: string[] }, limits?: { perIp?: number, newAccounts?: number }, log?: Function }} ctx
 */
export function createFaceAuth(ctx) {
  const challenges = createChallengeStore();
  const byIp = createRateLimiter({ limit: ctx.limits?.perIp ?? 60, windowMs: 15 * 60_000 });
  const newAccountsByIp = createRateLimiter({ limit: ctx.limits?.newAccounts ?? 20, windowMs: 60 * 60_000 });
  const rpName = ctx.webauthn?.rpName ?? 'Huddle';

  const limit = (req, limiter = byIp) => {
    const r = limiter.hit(clientIp(req, ctx.trustProxy));
    if (!r.ok) throw new HttpError(429, 'Too many attempts. Please wait a few minutes and try again.', { retryAfterSec: r.retryAfterSec });
  };

  /**
   * Which site the passkey is for. Configured (WEBAUTHN_RP_ID + WEBAUTHN_ORIGINS) in production;
   * in development it follows the page's own origin if that origin is allowed.
   */
  function relyingParty(req) {
    const origin = req.headers.origin;
    if (ctx.webauthn?.rpId) {
      const origins = ctx.webauthn.origins?.length ? ctx.webauthn.origins : [`https://${ctx.webauthn.rpId}`];
      return { rpId: ctx.webauthn.rpId, origins };
    }
    if (typeof origin !== 'string') throw new HttpError(400, 'Face sign-in needs a browser origin.');
    const allowed = ctx.allowedOrigins.includes('*') || ctx.allowedOrigins.includes(origin);
    if (!allowed) throw new HttpError(403, 'This site is not allowed to use face sign-in.');
    return { rpId: new URL(origin).hostname, origins: [origin] };
  }

  const optionalUser = async (req) => (bearerToken(req) ? ctx.requireUser(req) : null);

  async function hasOtherWayIn(user, exceptId) {
    if (user.passwordHash) return true;
    return (await ctx.credentials.listByUser(user.id)).some((c) => c.id !== exceptId);
  }

  // ---------------- passkeys ----------------
  async function registerOptions(req, res) {
    const body = await readJson(req);
    const user = await optionalUser(req);
    const rp = relyingParty(req);
    let flow;
    if (user) {
      limit(req);
      flow = { purpose: 'add', userId: user.id, name: user.name, email: user.email };
    } else {
      limit(req, newAccountsByIp);
      const { name, email, errors } = ctx.validateNewAccount(body);
      if (Object.keys(errors).length) throw new HttpError(400, 'Please fix the highlighted fields.', { fields: errors });
      if (await ctx.store.findByEmail(email))
        throw new HttpError(409, 'An account with this email already exists.', { fields: { email: 'Already registered — try signing in.' } });
      flow = { purpose: 'new', name, email };
    }
    const challenge = newChallenge();
    const userHandle = b64url(randomBytes(16));
    challenges.put(challenge, { ...flow, ...rp, userHandle, ceremony: 'create' });
    const existing = user ? (await ctx.credentials.listByUser(user.id)).filter((c) => c.kind === 'passkey') : [];
    sendJson(res, 200, {
      publicKey: {
        challenge,
        rp: { name: rpName, id: rp.rpId },
        user: { id: userHandle, name: flow.email, displayName: flow.name },
        pubKeyCredParams: [
          { type: 'public-key', alg: -7 },
          { type: 'public-key', alg: -8 },
          { type: 'public-key', alg: -257 },
        ],
        timeout: 120_000,
        attestation: 'none',
        authenticatorSelection: { residentKey: 'required', requireResidentKey: true, userVerification: 'required' },
        excludeCredentials: existing.map((c) => ({ type: 'public-key', id: c.id, transports: c.transports ?? [] })),
      },
    });
  }

  async function registerVerify(req, res) {
    const body = await readJson(req, 64 * 1024);
    const flow = challenges.take(challengeOf(body.credential));
    if (!flow || flow.ceremony !== 'create') throw new HttpError(400, 'This face sign-in request expired. Please try again.', { code: 'expired' });

    let verified;
    try {
      verified = verifyRegistration(body.credential, { challenge: challengeOf(body.credential), origins: flow.origins, rpId: flow.rpId });
    } catch (err) {
      if (err instanceof WebAuthnError) {
        ctx.log?.(`face   register rejected: ${err.message}`);
        throw new HttpError(400, 'We couldn’t set up face sign-in on this device. Please try again.', { code: 'webauthn-failed' });
      }
      throw err;
    }

    let user;
    if (flow.purpose === 'add') {
      user = await ctx.requireUser(req);
      if (user.id !== flow.userId) throw new HttpError(403, 'Signed in as someone else.');
    } else {
      try {
        user = await ctx.store.create({ name: flow.name, email: flow.email, passwordHash: null });
      } catch (err) {
        if (err instanceof DuplicateEmailError)
          throw new HttpError(409, 'An account with this email already exists.', { fields: { email: 'Already registered — try signing in.' } });
        throw err;
      }
    }

    try {
      await ctx.credentials.add({
        id: verified.credentialId,
        userId: user.id,
        kind: 'passkey',
        name: cleanDeviceName(body.deviceName, deviceFromUa(req.headers['user-agent'])),
        publicKey: verified.publicKey,
        alg: verified.alg,
        signCount: verified.signCount,
        userHandle: flow.userHandle,
        transports: verified.transports,
        synced: verified.synced,
      });
    } catch (err) {
      if (err?.code === 'duplicate') throw new HttpError(409, 'This device is already set up for face sign-in.');
      throw err;
    }
    ctx.log?.(`face   passkey ${flow.purpose === 'new' ? 'account created' : 'added'} ${user.email}`);
    if (flow.purpose === 'new') sendJson(res, 201, ctx.issue(user));
    else sendJson(res, 200, { credentials: (await ctx.credentials.listByUser(user.id)).map(publicCredential) });
  }

  async function loginOptions(req, res) {
    limit(req);
    const rp = relyingParty(req);
    const challenge = newChallenge();
    challenges.put(challenge, { ...rp, ceremony: 'get' });
    // No allowCredentials: the device offers whichever Huddle passkeys it has (no email needed).
    sendJson(res, 200, { publicKey: { challenge, rpId: rp.rpId, timeout: 120_000, userVerification: 'required', allowCredentials: [] } });
  }

  async function loginVerify(req, res) {
    limit(req);
    const body = await readJson(req, 64 * 1024);
    const challenge = challengeOf(body.credential);
    const flow = challenges.take(challenge);
    if (!flow || flow.ceremony !== 'get') throw new HttpError(400, 'This face sign-in request expired. Please try again.', { code: 'expired' });

    const cred = typeof body.credential?.id === 'string' ? await ctx.credentials.findById(body.credential.id) : null;
    if (!cred || cred.kind !== 'passkey')
      throw new HttpError(401, 'This device’s face sign-in isn’t linked to an account here. Sign in with your password, then turn on face sign-in.', { code: 'unknown-credential' });
    let signCount;
    try {
      ({ signCount } = verifyAuthentication(body.credential, { challenge, origins: flow.origins, rpId: flow.rpId }, cred));
    } catch (err) {
      if (err instanceof WebAuthnError) {
        ctx.log?.(`face   login rejected: ${err.message}`);
        throw new HttpError(401, FACE_FAILED, { code: 'webauthn-failed' });
      }
      throw err;
    }
    const user = await ctx.store.findById(cred.userId);
    if (!user) throw new HttpError(401, FACE_FAILED, { code: 'webauthn-failed' });
    await ctx.credentials.touch(cred.id, { signCount });
    await ctx.store.recordLogin(user.id);
    ctx.log?.(`face   login ${user.email}`);
    sendJson(res, 200, ctx.issue(user));
  }

  // ---------------- mobile app keys ----------------
  async function deviceRegister(req, res) {
    const body = await readJson(req);
    let user = await optionalUser(req);
    const isNew = !user;
    if (isNew) {
      limit(req, newAccountsByIp);
      const { name, email, errors } = ctx.validateNewAccount(body);
      if (Object.keys(errors).length) throw new HttpError(400, 'Please fix the highlighted fields.', { fields: errors });
      try {
        user = await ctx.store.create({ name, email, passwordHash: null });
      } catch (err) {
        if (err instanceof DuplicateEmailError)
          throw new HttpError(409, 'An account with this email already exists.', { fields: { email: 'Already registered — try signing in.' } });
        throw err;
      }
    } else limit(req);

    const id = `dev_${b64url(randomBytes(18))}`;
    const secret = b64url(randomBytes(32));
    await ctx.credentials.add({
      id,
      userId: user.id,
      kind: 'device',
      name: cleanDeviceName(body.deviceName, 'Phone'),
      secretHash: sha256(secret).toString('base64'),
    });
    ctx.log?.(`face   device ${isNew ? 'account created' : 'added'} ${user.email}`);
    const device = { id, secret };
    sendJson(res, isNew ? 201 : 200, isNew ? { ...ctx.issue(user), device } : { device });
  }

  async function deviceLogin(req, res) {
    limit(req);
    const body = await readJson(req);
    const cred = typeof body.deviceId === 'string' ? await ctx.credentials.findById(body.deviceId) : null;
    const given = typeof body.secret === 'string' ? sha256(body.secret) : sha256('');
    const stored = cred?.kind === 'device' ? Buffer.from(cred.secretHash, 'base64') : sha256(randomBytes(8));
    if (!cred || cred.kind !== 'device' || !timingSafeEqual(given, stored))
      throw new HttpError(401, 'Face sign-in on this phone was turned off. Sign in with your password.', { code: 'unknown-credential' });
    const user = await ctx.store.findById(cred.userId);
    if (!user) throw new HttpError(401, FACE_FAILED, { code: 'unknown-credential' });
    await ctx.credentials.touch(cred.id);
    await ctx.store.recordLogin(user.id);
    sendJson(res, 200, ctx.issue(user));
  }

  // ---------------- manage ----------------
  async function list(req, res) {
    const user = await ctx.requireUser(req);
    sendJson(res, 200, { credentials: (await ctx.credentials.listByUser(user.id)).map(publicCredential) });
  }

  async function remove(req, res, id) {
    const user = await ctx.requireUser(req);
    if (!(await hasOtherWayIn(user, id)))
      throw new HttpError(409, 'This is your only way to sign in. Set a password first, then remove it.', { code: 'last-credential' });
    if (!(await ctx.credentials.remove(user.id, id))) throw new HttpError(404, 'Not found');
    ctx.log?.(`face   removed a device for ${user.email}`);
    sendJson(res, 200, { credentials: (await ctx.credentials.listByUser(user.id)).map(publicCredential) });
  }

  async function handle(req, res, pathname) {
    const route = `${req.method} ${pathname}`;
    if (route === 'POST /api/auth/passkey/register/options') await registerOptions(req, res);
    else if (route === 'POST /api/auth/passkey/register/verify') await registerVerify(req, res);
    else if (route === 'POST /api/auth/passkey/login/options') await loginOptions(req, res);
    else if (route === 'POST /api/auth/passkey/login/verify') await loginVerify(req, res);
    else if (route === 'POST /api/auth/device/register') await deviceRegister(req, res);
    else if (route === 'POST /api/auth/device/login') await deviceLogin(req, res);
    else if (route === 'GET /api/auth/credentials') await list(req, res);
    else {
      const m = pathname.match(/^\/api\/auth\/credentials\/([A-Za-z0-9_-]{1,1400})$/);
      if (m && req.method === 'DELETE') await remove(req, res, m[1]);
      else return false;
    }
    return true;
  }

  return {
    handle,
    close() {
      challenges.close();
      byIp.close();
      newAccountsByIp.close();
    },
  };
}
