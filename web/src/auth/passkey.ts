// Browser side of face sign-in. The browser hands the actual face check to the
// device (Face ID, Windows Hello, Android face unlock, or fingerprint / PIN);
// we only see a signed "yes, it's them" — never the face.

const toBuf = (s: string) => {
  const b64 = s.replace(/-/g, '+').replace(/_/g, '/') + '==='.slice((s.length + 3) % 4);
  return Uint8Array.from(atob(b64), (c) => c.charCodeAt(0)).buffer;
};
const toB64url = (buf: ArrayBuffer | null) => {
  if (!buf) return null;
  let s = '';
  for (const b of new Uint8Array(buf)) s += String.fromCharCode(b);
  return btoa(s).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
};

/** True when this browser can do passkeys at all. */
export const passkeysSupported = () => typeof window !== 'undefined' && !!window.PublicKeyCredential && !!navigator.credentials;

/** True when this device has a built-in face / fingerprint unlock (vs. only a phone or security key). */
export async function hasBuiltInUnlock(): Promise<boolean> {
  try {
    return passkeysSupported() && (await PublicKeyCredential.isUserVerifyingPlatformAuthenticatorAvailable());
  } catch {
    return false;
  }
}

export class PasskeyCancelled extends Error {
  constructor() {
    super('Face sign-in was cancelled.');
  }
}

/** Browser errors → one friendly message. */
function explain(err: unknown): never {
  const name = (err as DOMException)?.name;
  if (name === 'NotAllowedError' || name === 'AbortError') throw new PasskeyCancelled();
  if (name === 'InvalidStateError') throw new Error('This device is already set up for face sign-in on this account.');
  if (name === 'SecurityError') throw new Error('Face sign-in needs a secure page (HTTPS, or localhost while developing).');
  if (name === 'NotSupportedError') throw new Error('This device can’t do face sign-in. Use your email and password.');
  throw new Error('Face sign-in didn’t work on this device. Use your email and password instead.');
}

export async function createPasskey(options: { publicKey: Record<string, any> }) {
  const pk = options.publicKey;
  let cred: PublicKeyCredential;
  try {
    cred = (await navigator.credentials.create({
      publicKey: {
        ...pk,
        challenge: toBuf(pk.challenge),
        user: { ...pk.user, id: toBuf(pk.user.id) },
        excludeCredentials: (pk.excludeCredentials ?? []).map((c: any) => ({ ...c, id: toBuf(c.id) })),
      } as PublicKeyCredentialCreationOptions,
    })) as PublicKeyCredential;
  } catch (err) {
    explain(err);
  }
  const res = cred.response as AuthenticatorAttestationResponse;
  return {
    id: cred.id,
    rawId: toB64url(cred.rawId),
    type: cred.type,
    response: {
      clientDataJSON: toB64url(res.clientDataJSON),
      attestationObject: toB64url(res.attestationObject),
      transports: res.getTransports?.() ?? [],
    },
  };
}

export async function getPasskey(options: { publicKey: Record<string, any> }, signal?: AbortSignal) {
  const pk = options.publicKey;
  let cred: PublicKeyCredential;
  try {
    cred = (await navigator.credentials.get({
      signal,
      publicKey: {
        ...pk,
        challenge: toBuf(pk.challenge),
        allowCredentials: (pk.allowCredentials ?? []).map((c: any) => ({ ...c, id: toBuf(c.id) })),
      } as PublicKeyCredentialRequestOptions,
    })) as PublicKeyCredential;
  } catch (err) {
    explain(err);
  }
  const res = cred.response as AuthenticatorAssertionResponse;
  return {
    id: cred.id,
    rawId: toB64url(cred.rawId),
    type: cred.type,
    response: {
      clientDataJSON: toB64url(res.clientDataJSON),
      authenticatorData: toB64url(res.authenticatorData),
      signature: toB64url(res.signature),
      userHandle: toB64url(res.userHandle),
    },
  };
}

/** What to call the face unlock on this device, for button labels. */
export function unlockName(): string {
  const ua = navigator.userAgent;
  if (/iPhone|iPad/.test(ua)) return 'Face ID';
  if (/Mac OS X/.test(ua)) return 'Touch ID';
  if (/Windows/.test(ua)) return 'Windows Hello';
  if (/Android/.test(ua)) return 'face unlock';
  return 'face unlock';
}
