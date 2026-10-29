import type { ChatMessage } from './protocol';

// Tiny typed client for the server's REST API, shared by web and mobile.

export type UserRole = 'user' | 'admin';

export interface AuthUser {
  id: string;
  name: string;
  email: string;
  /** 'admin' can open the admin dashboard; everyone else is 'user'. */
  role?: UserRole;
  /** false for accounts created via social login only (they can add a password). */
  hasPassword?: boolean;
  /** 'google' | 'github' when the account was created via social login, else null. */
  provider?: string | null;
  createdAt: string;
  lastLoginAt?: string | null;
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

export interface AuthResponse {
  user: AuthUser;
  token: string;
  expiresAt: string;
}

/** Which social sign-in buttons the server has configured. */
export type Providers = Record<string, boolean>;

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
  /** Which social sign-in providers are configured on the server. */
  providers(): Promise<{ providers: Providers }>;

  // --- admin dashboard (admin role only) ---
  adminListUsers(): Promise<{ users: AuthUser[]; total: number }>;
  adminCreateUser(input: { name: string; email: string; password: string; role?: UserRole }): Promise<{ user: AuthUser }>;
  adminUpdateUser(id: string, patch: { name?: string; email?: string; role?: UserRole; password?: string }): Promise<{ user: AuthUser }>;
  adminDeleteUser(id: string): Promise<{ ok: boolean; id: string }>;

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
      if (res.status === 401 && token && !/^\/api\/auth\/login/.test(path)) onUnauthorized?.();
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
    providers: () => request('GET', '/api/auth/providers'),
    adminListUsers: () => request('GET', '/api/admin/users'),
    adminCreateUser: (input) => request('POST', '/api/admin/users', input),
    adminUpdateUser: (id, patch) => request('PATCH', `/api/admin/users/${encodeURIComponent(id)}`, patch),
    adminDeleteUser: (id) => request('DELETE', `/api/admin/users/${encodeURIComponent(id)}`),
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
