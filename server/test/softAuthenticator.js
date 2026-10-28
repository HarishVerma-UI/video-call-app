// A software passkey authenticator for tests: does what a phone's secure chip
// does after a successful face scan (create a P-256 key, sign challenges).
import { createHash, generateKeyPairSync, randomBytes, sign } from 'node:crypto';

const sha256 = (d) => createHash('sha256').update(d).digest();
const b64u = (b) => Buffer.from(b).toString('base64url');

// Tiny CBOR encoder (just what attestation objects need).
function head(major, n) {
  if (n < 24) return Buffer.from([(major << 5) | n]);
  if (n < 256) return Buffer.from([(major << 5) | 24, n]);
  if (n < 65536) {
    const b = Buffer.alloc(3);
    b[0] = (major << 5) | 25;
    b.writeUInt16BE(n, 1);
    return b;
  }
  const b = Buffer.alloc(5);
  b[0] = (major << 5) | 26;
  b.writeUInt32BE(n, 1);
  return b;
}
export function cbor(v) {
  if (typeof v === 'number') return v >= 0 ? head(0, v) : head(1, -1 - v);
  if (Buffer.isBuffer(v)) return Buffer.concat([head(2, v.length), v]);
  if (typeof v === 'string') {
    const b = Buffer.from(v, 'utf8');
    return Buffer.concat([head(3, b.length), b]);
  }
  if (Array.isArray(v)) return Buffer.concat([head(4, v.length), ...v.map(cbor)]);
  if (v instanceof Map) return Buffer.concat([head(5, v.size), ...[...v].flatMap(([k, x]) => [cbor(k), cbor(x)])]);
  if (v && typeof v === 'object') return cbor(new Map(Object.entries(v)));
  throw new Error('cannot encode');
}

export function softAuthenticator({ origin = 'http://localhost:5173' } = {}) {
  const creds = new Map(); // id -> { privateKey, rpId, userHandle, counter }
  const flagsByte = ({ up = true, uv = true, at = false }) => (up ? 0x01 : 0) | (uv ? 0x04 : 0) | (at ? 0x40 : 0);

  return {
    origin,
    creds,
    /** navigator.credentials.create() */
    create(publicKey, { uv = true, origin: o = origin, rpId: forceRp } = {}) {
      const { privateKey, publicKey: pub } = generateKeyPairSync('ec', { namedCurve: 'P-256' });
      const jwk = pub.export({ format: 'jwk' });
      const id = randomBytes(32);
      const rpId = forceRp ?? publicKey.rp.id;
      creds.set(b64u(id), { privateKey, rpId, userHandle: publicKey.user.id, counter: 0 });
      const cose = new Map([
        [1, 2],
        [3, -7],
        [-1, 1],
        [-2, Buffer.from(jwk.x, 'base64url')],
        [-3, Buffer.from(jwk.y, 'base64url')],
      ]);
      const idLen = Buffer.alloc(2);
      idLen.writeUInt16BE(id.length);
      const authData = Buffer.concat([sha256(rpId), Buffer.from([flagsByte({ uv, at: true })]), Buffer.alloc(4), Buffer.alloc(16), idLen, id, cbor(cose)]);
      const clientData = Buffer.from(JSON.stringify({ type: 'webauthn.create', challenge: publicKey.challenge, origin: o, crossOrigin: false }));
      return {
        id: b64u(id),
        rawId: b64u(id),
        type: 'public-key',
        response: {
          clientDataJSON: b64u(clientData),
          attestationObject: b64u(cbor({ fmt: 'none', attStmt: new Map(), authData })),
          transports: ['internal', 'hybrid'],
        },
      };
    },
    /** navigator.credentials.get() — uses the first (or given) stored passkey. */
    get(publicKey, { uv = true, id, origin: o = origin, counter } = {}) {
      const [credId, c] = id ? [id, creds.get(id)] : [...creds][0];
      c.counter = counter ?? c.counter + 1;
      const count = Buffer.alloc(4);
      count.writeUInt32BE(c.counter);
      const authData = Buffer.concat([sha256(publicKey.rpId), Buffer.from([flagsByte({ uv })]), count]);
      const clientData = Buffer.from(JSON.stringify({ type: 'webauthn.get', challenge: publicKey.challenge, origin: o, crossOrigin: false }));
      const signature = sign('sha256', Buffer.concat([authData, sha256(clientData)]), { key: c.privateKey, dsaEncoding: 'der' });
      return {
        id: credId,
        rawId: credId,
        type: 'public-key',
        response: {
          clientDataJSON: b64u(clientData),
          authenticatorData: b64u(authData),
          signature: b64u(signature),
          userHandle: c.userHandle,
        },
      };
    },
  };
}
