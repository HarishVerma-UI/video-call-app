// Minimal, strict JSON Web Tokens (HS256) using only node:crypto.
//
// Why not a library? We only need one algorithm, and pinning it here removes the
// classic JWT pitfalls by construction:
//   - the header's "alg" must be exactly HS256 ("none" and RS/HS confusion are impossible),
//   - signatures are compared in constant time,
//   - exp / nbf / iss / aud are always checked.
// If you later need RS256 or key rotation, swap this file for `jose`.

import { createHmac, timingSafeEqual } from 'node:crypto';

const HEADER = base64url(JSON.stringify({ alg: 'HS256', typ: 'JWT' }));

function base64url(input) {
  return Buffer.from(input).toString('base64url');
}

function sign(data, secret) {
  return createHmac('sha256', secret).update(data).digest('base64url');
}

export class TokenError extends Error {
  constructor(reason) {
    super(`Invalid token: ${reason}`);
    this.reason = reason;
  }
}

/**
 * @param {Record<string, unknown>} claims e.g. { sub: userId, name }
 * @param {{ secret: string, expiresInSec: number, issuer: string, audience: string, now?: number }} opts
 */
export function signToken(claims, opts) {
  if (!opts.secret || opts.secret.length < 32) throw new Error('JWT secret must be at least 32 characters');
  const iat = Math.floor((opts.now ?? Date.now()) / 1000);
  const payload = base64url(
    JSON.stringify({ ...claims, iat, exp: iat + opts.expiresInSec, iss: opts.issuer, aud: opts.audience }),
  );
  const body = `${HEADER}.${payload}`;
  return `${body}.${sign(body, opts.secret)}`;
}

/**
 * Returns the payload or throws TokenError.
 * @param {string} token
 * @param {{ secret: string, issuer: string, audience: string, now?: number, clockToleranceSec?: number }} opts
 */
export function verifyToken(token, opts) {
  if (typeof token !== 'string' || token.length > 4096) throw new TokenError('malformed');
  const parts = token.split('.');
  if (parts.length !== 3) throw new TokenError('malformed');
  const [header, payload, signature] = parts;

  if (header !== HEADER) {
    // Re-check by decoding so key order differences from other issuers still fail loudly.
    let h;
    try {
      h = JSON.parse(Buffer.from(header, 'base64url').toString('utf8'));
    } catch {
      throw new TokenError('malformed');
    }
    if (h?.alg !== 'HS256') throw new TokenError('unsupported algorithm');
  }

  const expected = Buffer.from(sign(`${header}.${payload}`, opts.secret));
  const actual = Buffer.from(signature);
  if (expected.length !== actual.length || !timingSafeEqual(expected, actual)) throw new TokenError('bad signature');

  let claims;
  try {
    claims = JSON.parse(Buffer.from(payload, 'base64url').toString('utf8'));
  } catch {
    throw new TokenError('malformed');
  }
  if (!claims || typeof claims !== 'object') throw new TokenError('malformed');

  const now = Math.floor((opts.now ?? Date.now()) / 1000);
  const skew = opts.clockToleranceSec ?? 30;
  if (typeof claims.exp !== 'number' || now > claims.exp + skew) throw new TokenError('expired');
  if (typeof claims.nbf === 'number' && now + skew < claims.nbf) throw new TokenError('not yet valid');
  if (claims.iss !== opts.issuer) throw new TokenError('wrong issuer');
  if (claims.aud !== opts.audience) throw new TokenError('wrong audience');
  if (typeof claims.sub !== 'string' || !claims.sub) throw new TokenError('missing subject');
  return claims;
}
