import type { ChatMessage } from './protocol';

// Tiny typed client for the server's REST API, shared by web and mobile.

export interface AuthUser {
  id: string;
  name: string;
  email: string;
  /** false for accounts created with face sign-in only (they can add a backup password). */
  hasPassword?: boolean;
  createdAt: string;
}

/** A device that can sign in with face unlock. */
export interface FaceCredential {
  id: string;
  /** "passkey": a browser passkey (WebAuthn). "device": the mobile app on a phone. */
  kind: 'passkey' | 'device';
  name: string;
  /** Synced through iCloud Keychain / Google Password Manager, so it works on your other devices too. */
  synced: boolean;
  createdAt: string;
  lastUsedAt: string | null;
}

export interface CallRecord {
  id: string;
  roomId: string;
  startedAt: string;
  endedAt: string;
  durationSec: number;
  /** Names of the people you were with. */
  with: string[];
}

export interface ChatSummary {
  roomId: string;
  lastActiveAt: string;
  lastMessage: { userId: string; name: string; text: string; ts: number } | null;
  /** Who is in the call right now. */
  inCall: { userId: string; name: string }[];
}

/** WebAuthn options as JSON (binary fields are base64url strings). */
export type PasskeyOptionsJSON = { publicKey: Record<string, any> };

export interface AuthResponse {
  user: AuthUser;
  token: string;
  expiresAt: string;
}

export interface RoomInfo {
  roomId: string;
  participants: number;
  /** Names of the people in the call now. */
  people?: string[];
  maxPeers: number;
  full: boolean;
}

/** Error from the API, with per-field messages when the server sent them. */
export class ApiError extends Error {
  status: number;
  code?: string;
  fields: Record<string, string>;
  retryAfterSec?: number;
  constructor(status: number, body: any) {
    super(body?.error ?? (status === 0 ? 'Could not reach the server. Check your connection.' : `Request failed (${status})`));
    this.status = status;
    this.code = body?.code;
    this.fields = body?.fields ?? {};
    this.retryAfterSec = body?.retryAfterSec;
  }
}

export interface ApiClient {
  register(input: { name: string; email: string; password: string }): Promise<AuthResponse>;
  login(input: { email: string; password: string }): Promise<AuthResponse>;
  me(): Promise<{ user: AuthUser }>;
  /** Change name and/or email (email needs currentPassword). Returns a fresh token. */
  updateProfile(input: { name?: string; email?: string; currentPassword?: string }): Promise<AuthResponse>;
  /** Change password (or set a first one: no currentPassword). Returns a fresh token; other devices are signed out on a change. */
  changePassword(input: { currentPassword?: string; newPassword: string }): Promise<AuthResponse>;

  // Face sign-in on the web (passkeys). Pass the browser's credential, serialized to JSON.
  /** New account ({ name, email }) or, when signed in, add this device to your account. */
  passkeyRegisterOptions(input?: { name: string; email: string }): Promise<PasskeyOptionsJSON>;
  passkeyRegisterVerify(credential: unknown, deviceName?: string): Promise<AuthResponse & { credentials?: FaceCredential[] }>;
  passkeyLoginOptions(): Promise<PasskeyOptionsJSON>;
  passkeyLoginVerify(credential: unknown): Promise<AuthResponse>;
  // Face sign-in in the mobile app (a key kept behind Face ID / face unlock).
  deviceRegister(input: { name?: string; email?: string; deviceName: string }): Promise<Partial<AuthResponse> & { device: { id: string; secret: string } }>;
  deviceLogin(input: { deviceId: string; secret: string }): Promise<AuthResponse>;
  credentials(): Promise<{ credentials: FaceCredential[] }>;
  removeCredential(id: string): Promise<{ credentials: FaceCredential[] }>;

  /** Your recent calls, newest first. */
  calls(): Promise<{ calls: CallRecord[] }>;
  /** Rooms you've been in, latest activity first. */
  chats(): Promise<{ chats: ChatSummary[] }>;
  /** Send to a room's chat without joining the call; people in the call see it live. */
  sendRoomMessage(roomId: string, text: string): Promise<{ message: ChatMessage }>;
  roomInfo(roomId: string): Promise<RoomInfo>;
  /** Saved chat, newest page first in time order; pass `before` (a message ts) for older pages. */
  roomMessages(roomId: string, opts?: { before?: number; limit?: number }): Promise<{ messages: ChatMessage[]; hasMore: boolean }>;
}

/**
 * @param baseUrl "" for same-origin (web), or "http://192.168.1.10:3001" (mobile)
 * @param getToken returns the current JWT, if signed in
 * @param onUnauthorized called when the server says the token is no longer valid
 */
export function createApi(baseUrl: string, getToken: () => string | null, onUnauthorized?: () => void): ApiClient {
  async function request<T>(method: string, path: string, body?: unknown): Promise<T> {
    const token = getToken();
    let res: Response;
    try {
      res = await fetch(`${baseUrl}${path}`, {
        method,
        headers: {
          Accept: 'application/json',
          ...(body ? { 'Content-Type': 'application/json' } : {}),
          ...(token ? { Authorization: `Bearer ${token}` } : {}),
        },
        body: body ? JSON.stringify(body) : undefined,
      });
    } catch {
      throw new ApiError(0, null);
    }
    const data = await res.json().catch(() => null);
    if (!res.ok) {
      // Only an authenticated call failing with 401 means "your session ended".
      if (res.status === 401 && token && !/^\/api\/auth\/(login|passkey|device)/.test(path)) onUnauthorized?.();
      throw new ApiError(res.status, data);
    }
    return data as T;
  }

  return {
    register: (input) => request('POST', '/api/auth/register', input),
    login: (input) => request('POST', '/api/auth/login', input),
    me: () => request('GET', '/api/auth/me'),
    updateProfile: (input) => request('PATCH', '/api/auth/me', input),
    changePassword: (input) => request('POST', '/api/auth/password', input),
    passkeyRegisterOptions: (input) => request('POST', '/api/auth/passkey/register/options', input ?? {}),
    passkeyRegisterVerify: (credential, deviceName) => request('POST', '/api/auth/passkey/register/verify', { credential, deviceName }),
    passkeyLoginOptions: () => request('POST', '/api/auth/passkey/login/options', {}),
    passkeyLoginVerify: (credential) => request('POST', '/api/auth/passkey/login/verify', { credential }),
    deviceRegister: (input) => request('POST', '/api/auth/device/register', input),
    deviceLogin: (input) => request('POST', '/api/auth/device/login', input),
    credentials: () => request('GET', '/api/auth/credentials'),
    removeCredential: (id) => request('DELETE', `/api/auth/credentials/${encodeURIComponent(id)}`),
    calls: () => request('GET', '/api/calls'),
    chats: () => request('GET', '/api/chats'),
    sendRoomMessage: (roomId, text) => request('POST', `/api/rooms/${encodeURIComponent(roomId)}/messages`, { text }),
    roomInfo: (roomId) => request('GET', `/api/rooms/${encodeURIComponent(roomId)}`),
    roomMessages: (roomId, opts = {}) => {
      const q = new URLSearchParams();
      if (opts.before !== undefined) q.set('before', String(opts.before));
      if (opts.limit !== undefined) q.set('limit', String(opts.limit));
      const qs = q.toString();
      return request('GET', `/api/rooms/${encodeURIComponent(roomId)}/messages${qs ? `?${qs}` : ''}`);
    },
  };
}

/** 0–4 score with a label, for the sign-up strength meter. */
export function passwordStrength(pw: string): { score: 0 | 1 | 2 | 3 | 4; label: string } {
  if (!pw) return { score: 0, label: '' };
  let score = 0;
  if (pw.length >= 8) score++;
  if (pw.length >= 12) score++;
  if (/[a-z]/.test(pw) && /[A-Z]/.test(pw)) score++;
  if (/\d/.test(pw) && /[^a-zA-Z0-9]/.test(pw)) score++;
  if (!/[a-zA-Z]/.test(pw) || !/\d/.test(pw)) score = Math.min(score, 1);
  const s = Math.max(1, Math.min(4, score)) as 1 | 2 | 3 | 4;
  return { score: s, label: ['', 'Weak', 'Okay', 'Strong', 'Excellent'][s] };
}
