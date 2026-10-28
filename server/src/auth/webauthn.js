// Passkeys (WebAuthn) — "sign in with your face".
//
// The browser asks the device's own face unlock (Face ID, Windows Hello,
// Android face unlock — or fingerprint / device PIN) to create a key pair. The
// private key never leaves the device; the face never leaves the device either.
// We store only the public key and later check signatures made with it.
//
// This file verifies the two WebAuthn responses with node:crypto only:
//   verifyRegistration()   navigator.credentials.create() result
//   verifyAuthentication() navigator.credentials.get() result
// We ask for attestation "none" (we don't need to know the device maker), so
// attestation statements are not checked; everything else is.

import { createHash, createPublicKey, randomBytes, verify as cryptoVerify } from 'node:crypto';

export class WebAuthnError extends Error {}

export const b64url = (buf) => Buffer.from(buf).toString('base64url');
export const fromB64url = (s) => {
  if (typeof s !== 'string' || !/^[A-Za-z0-9_-]*={0,2}$/.test(s)) throw new WebAuthnError('Invalid base64url.');
  return Buffer.from(s, 'base64url');
};
const sha256 = (data) => createHash('sha256').update(data).digest();

// ---------------------------------------------------------------------------
// Minimal CBOR decoder (RFC 8949): enough for attestation objects and COSE keys.

/** @returns {[any, number]} value and the offset just after it */
export function cborDecode(buf, offset = 0, depth = 0) {
  if (depth > 16) throw new WebAuthnError('CBOR too deep.');
  if (offset >= buf.length) throw new WebAuthnError('CBOR truncated.');
  const first = buf[offset++];
  const major = first >> 5;
  const info = first & 0x1f;
  let len;
  if (info < 24) len = info;
  else if (info === 24) len = buf.readUInt8(offset), (offset += 1);
  else if (info === 25) len = buf.readUInt16BE(offset), (offset += 2);
  else if (info === 26) len = buf.readUInt32BE(offset), (offset += 4);
  else if (info === 27) {
    const big = buf.readBigUInt64BE(offset);
    offset += 8;
    if (big > BigInt(Number.MAX_SAFE_INTEGER)) throw new WebAuthnError('CBOR integer too large.');
    len = Number(big);
  } else throw new WebAuthnError('Indefinite-length CBOR is not supported.');

  const need = (n) => {
    if (offset + n > buf.length) throw new WebAuthnError('CBOR truncated.');
  };
  switch (major) {
    case 0:
      return [len, offset];
    case 1:
      return [-1 - len, offset];
    case 2:
      need(len);
      return [buf.subarray(offset, offset + len), offset + len];
    case 3:
      need(len);
      return [buf.subarray(offset, offset + len).toString('utf8'), offset + len];
    case 4: {
      if (len > 1024) throw new WebAuthnError('CBOR array too long.');
      const arr = [];
      for (let i = 0; i < len; i++) {
        let v;
        [v, offset] = cborDecode(buf, offset, depth + 1);
        arr.push(v);
      }
      return [arr, offset];
    }
    case 5: {
      if (len > 1024) throw new WebAuthnError('CBOR map too long.');
      const map = new Map();
      for (let i = 0; i < len; i++) {
        let k, v;
        [k, offset] = cborDecode(buf, offset, depth + 1);
        [v, offset] = cborDecode(buf, offset, depth + 1);
        map.set(k, v);
      }
      return [map, offset];
    }
    case 7:
      if (info === 20) return [false, offset];
      if (info === 21) return [true, offset];
      if (info === 22 || info === 23) return [null, offset];
      throw new WebAuthnError('Unsupported CBOR simple value.');
    default:
      throw new WebAuthnError('Unsupported CBOR type.');
  }
}

// ---------------------------------------------------------------------------
// COSE public key → JWK (so node:crypto can use it)

export const ALG = { ES256: -7, EdDSA: -8, RS256: -257 };

export function coseToJwk(cose) {
  if (!(cose instanceof Map)) throw new WebAuthnError('Bad public key.');
  const kty = cose.get(1);
  const alg = cose.get(3);
  if (kty === 2 && alg === ALG.ES256 && cose.get(-1) === 1) {
    const x = cose.get(-2);
    const y = cose.get(-3);
    if (x?.length !== 32 || y?.length !== 32) throw new WebAuthnError('Bad EC key.');
    return { alg, jwk: { kty: 'EC', crv: 'P-256', x: b64url(x), y: b64url(y) } };
  }
  if (kty === 1 && alg === ALG.EdDSA && cose.get(-1) === 6) {
    const x = cose.get(-2);
    if (x?.length !== 32) throw new WebAuthnError('Bad Ed25519 key.');
    return { alg, jwk: { kty: 'OKP', crv: 'Ed25519', x: b64url(x) } };
  }
  if (kty === 3 && alg === ALG.RS256) {
    const n = cose.get(-1);
    const e = cose.get(-2);
    if (!n || n.length < 256 || !e) throw new WebAuthnError('Bad RSA key.');
    return { alg, jwk: { kty: 'RSA', n: b64url(n), e: b64url(e) } };
  }
  throw new WebAuthnError('This device uses a key type we don’t support.');
}

function verifySignature(alg, jwk, data, signature) {
  const key = createPublicKey({ key: jwk, format: 'jwk' });
  if (alg === ALG.ES256) return cryptoVerify('sha256', data, { key, dsaEncoding: 'der' }, signature);
  if (alg === ALG.RS256) return cryptoVerify('sha256', data, key, signature);
  if (alg === ALG.EdDSA) return cryptoVerify(null, data, key, signature);
  return false;
}

// ---------------------------------------------------------------------------
// authenticatorData: rpIdHash(32) | flags(1) | signCount(4) | [attested credential] | [extensions]

const FLAG_UP = 0x01; // user present
const FLAG_UV = 0x04; // user verified (face / fingerprint / PIN)
const FLAG_BE = 0x08; // backup eligible (synced passkey)
const FLAG_BS = 0x10; // backed up
const FLAG_AT = 0x40; // attested credential data included

function parseAuthData(authData) {
  if (authData.length < 37) throw new WebAuthnError('Authenticator data too short.');
  const out = {
    rpIdHash: authData.subarray(0, 32),
    flags: authData[32],
    signCount: authData.readUInt32BE(33),
  };
  if (out.flags & FLAG_AT) {
    let o = 37;
    if (authData.length < o + 18) throw new WebAuthnError('Authenticator data truncated.');
    out.aaguid = authData.subarray(o, o + 16);
    o += 16;
    const idLen = authData.readUInt16BE(o);
    o += 2;
    if (idLen < 16 || idLen > 1023 || authData.length < o + idLen) throw new WebAuthnError('Bad credential id.');
    out.credentialId = authData.subarray(o, o + idLen);
    o += idLen;
    [out.cosePublicKey] = cborDecode(authData, o);
  }
  return out;
}

function checkClientData(clientDataJSON, { type, challenge, origins }) {
  let cd;
  try {
    cd = JSON.parse(fromB64url(clientDataJSON).toString('utf8'));
  } catch {
    throw new WebAuthnError('Invalid client data.');
  }
  if (cd.type !== type) throw new WebAuthnError('Wrong ceremony type.');
  if (cd.challenge !== challenge) throw new WebAuthnError('Challenge mismatch.');
  if (!origins.includes(cd.origin)) throw new WebAuthnError(`Unexpected origin ${cd.origin}.`);
  if (cd.crossOrigin === true) throw new WebAuthnError('Cross-origin requests are not allowed.');
  return cd;
}

function checkFlags(ad, rpId) {
  if (!sha256(rpId).equals(ad.rpIdHash)) throw new WebAuthnError('Passkey belongs to a different site.');
  if (!(ad.flags & FLAG_UP)) throw new WebAuthnError('User presence missing.');
  if (!(ad.flags & FLAG_UV)) throw new WebAuthnError('Face, fingerprint or PIN check was not done.');
}

export const newChallenge = () => b64url(randomBytes(32));

/** Malformed input surfaces as many kinds of error (RangeError, bad JWK…); report them all as WebAuthnError. */
function asWebAuthnError(fn) {
  try {
    return fn();
  } catch (err) {
    if (err instanceof WebAuthnError) throw err;
    throw new WebAuthnError(`Malformed response (${err?.message ?? err}).`);
  }
}

/**
 * @param {any} credential PublicKeyCredential as JSON: { id, rawId, type, response: { clientDataJSON, attestationObject, transports? } }
 * @param {{ challenge: string, origins: string[], rpId: string }} expected
 */
export function verifyRegistration(credential, expected) {
  return asWebAuthnError(() => verifyRegistrationUnsafe(credential, expected));
}
function verifyRegistrationUnsafe(credential, expected) {
  if (!credential || credential.type !== 'public-key' || typeof credential.response !== 'object')
    throw new WebAuthnError('Invalid credential.');
  const { clientDataJSON, attestationObject } = credential.response;
  checkClientData(clientDataJSON, { type: 'webauthn.create', ...expected });

  const [att] = cborDecode(fromB64url(attestationObject));
  if (!(att instanceof Map) || !Buffer.isBuffer(att.get('authData'))) throw new WebAuthnError('Invalid attestation.');
  const ad = parseAuthData(att.get('authData'));
  checkFlags(ad, expected.rpId);
  if (!ad.credentialId) throw new WebAuthnError('No credential in response.');
  if (b64url(ad.credentialId) !== credential.id) throw new WebAuthnError('Credential id mismatch.');
  const { alg, jwk } = coseToJwk(ad.cosePublicKey);
  createPublicKey({ key: jwk, format: 'jwk' }); // throws if the point isn't on the curve

  const transports = Array.isArray(credential.response.transports)
    ? credential.response.transports.filter((t) => typeof t === 'string').slice(0, 6)
    : [];
  return {
    credentialId: credential.id,
    publicKey: jwk,
    alg,
    signCount: ad.signCount,
    transports,
    backedUp: !!(ad.flags & FLAG_BS),
    synced: !!(ad.flags & FLAG_BE),
  };
}

/**
 * @param {any} credential { id, type, response: { clientDataJSON, authenticatorData, signature, userHandle? } }
 * @param {{ challenge: string, origins: string[], rpId: string }} expected
 * @param {{ publicKey: object, alg: number, signCount: number, userHandle: string }} stored
 * @returns {{ signCount: number }}
 */
export function verifyAuthentication(credential, expected, stored) {
  return asWebAuthnError(() => verifyAuthenticationUnsafe(credential, expected, stored));
}
function verifyAuthenticationUnsafe(credential, expected, stored) {
  if (!credential || credential.type !== 'public-key' || typeof credential.response !== 'object')
    throw new WebAuthnError('Invalid credential.');
  const { clientDataJSON, authenticatorData, signature, userHandle } = credential.response;
  checkClientData(clientDataJSON, { type: 'webauthn.get', ...expected });

  const authData = fromB64url(authenticatorData);
  const ad = parseAuthData(authData);
  checkFlags(ad, expected.rpId);
  if (userHandle && userHandle !== stored.userHandle) throw new WebAuthnError('Passkey belongs to another account.');

  const signed = Buffer.concat([authData, sha256(fromB64url(clientDataJSON))]);
  if (!verifySignature(stored.alg, stored.publicKey, signed, fromB64url(signature))) throw new WebAuthnError('Signature check failed.');

  // Counters only move forward; a counter that goes back suggests a cloned key.
  if (ad.signCount !== 0 || stored.signCount !== 0) {
    if (ad.signCount <= stored.signCount) throw new WebAuthnError('This passkey may have been copied.');
  }
  return { signCount: ad.signCount };
}

// ---------------------------------------------------------------------------
/** Single-use challenges that expire after a few minutes (kept in memory). */
export function createChallengeStore({ ttlMs = 5 * 60_000, max = 10_000 } = {}) {
  const items = new Map();
  const sweep = () => {
    const now = Date.now();
    for (const [k, v] of items) if (v.exp < now) items.delete(k);
  };
  const timer = setInterval(sweep, 60_000);
  timer.unref?.();
  return {
    put(challenge, data) {
      if (items.size >= max) sweep();
      if (items.size >= max) items.delete(items.keys().next().value);
      items.set(challenge, { ...data, exp: Date.now() + ttlMs });
    },
    /** Returns the data once, then forgets it. */
    take(challenge) {
      const v = typeof challenge === 'string' ? items.get(challenge) : undefined;
      if (!v) return null;
      items.delete(challenge);
      return v.exp >= Date.now() ? v : null;
    },
    close: () => clearInterval(timer),
  };
}

/** Pulls the challenge out of a response's clientDataJSON (to find what we issued). */
export function challengeOf(credential) {
  try {
    return JSON.parse(fromB64url(credential?.response?.clientDataJSON).toString('utf8')).challenge ?? null;
  } catch {
    return null;
  }
}
