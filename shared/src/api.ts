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
// --- professional network ---
export type ConnectionState = 'self' | 'connected' | 'pending_outgoing' | 'pending_incoming' | 'none';

export interface Experience {
  title: string;
  company: string;
  start: string;
  end: string;
  description: string;
}
export interface Education {
  school: string;
  degree: string;
  year: string;
}

export interface Profile {
  userId: string;
  name: string;
  headline: string;
  location: string;
  skills: string[];
  mentor: boolean;
  mentee: boolean;
  focusAreas: string[];
  hasPhoto: boolean;
  photoUrl: string | null;
  connection: ConnectionState;
  updatedAt: string | null;
  // private fields, present only when the viewer may see them (self or accepted connection)
  bio?: string;
  mobile?: string;
  experience?: Experience[];
  education?: Education[];
  hasCv?: boolean;
  cvName?: string;
  cvUrl?: string | null;
}

export interface PostComment {
  id: string;
  userId: string;
  name: string;
  text: string;
  ts: number;
}
export interface Post {
  id: string;
  authorId: string;
  authorName: string;
  authorPhotoUrl: string | null;
  text: string;
  imageUrl: string | null;
  likeCount: number;
  likedByMe: boolean;
  comments: PostComment[];
  createdAt: string | null;
}

export interface DmMessage {
  id: string;
  from: string;
  fromName: string;
  to: string;
  text: string;
  ts: number;
}
export interface Conversation {
  other: string;
  profile: Profile;
  last: DmMessage;
}

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

export interface ActiveRoom {
  roomId: string;
  participants: { userId: string; name: string }[];
}

export interface AdminStats {
  totalUsers: number;
  byRole: { admin: number; user: number };
  recentSignups: number;
  recentLogins: number;
  dailyActivity: { day: string; count: number }[];
  activeCalls: { rooms: number; participants: number };
  activeRooms: ActiveRoom[];
  uptimeSec: number;
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
  adminStats(): Promise<AdminStats>;

  /** Your recent calls, newest first. */
  calls(): Promise<{ calls: CallRecord[] }>;
  /** Rooms you've been in, latest activity first. */
  chats(): Promise<{ chats: ChatSummary[] }>;
  /** Send to a room's chat without joining the call; people in the call see it live. */
  sendRoomMessage(roomId: string, text: string): Promise<{ message: ChatMessage }>;
  roomInfo(roomId: string): Promise<RoomInfo>;
  /** Saved chat, newest page first in time order; pass `before` (a message ts) for older pages. */
  roomMessages(roomId: string, opts?: { before?: number; limit?: number }): Promise<{ messages: ChatMessage[]; hasMore: boolean }>;

  // --- professional network ---
  myProfile(): Promise<{ profile: Profile }>;
  saveProfile(input: Partial<Profile> & { photoKey?: string; cvKey?: string; cvName?: string }): Promise<{ profile: Profile }>;
  getProfile(userId: string): Promise<{ profile: Profile; posts: Post[] }>;
  searchPeople(opts?: { q?: string; role?: string }): Promise<{ people: Profile[] }>;
  uploadUrl(input: { kind: 'photo' | 'cv' | 'post'; contentType: string }): Promise<{ uploadUrl: string; key: string }>;
  requestConnect(userId: string): Promise<{ status: ConnectionState }>;
  acceptConnect(userId: string): Promise<{ status: ConnectionState }>;
  declineConnect(userId: string): Promise<{ status: ConnectionState }>;
  removeConnect(userId: string): Promise<{ status: ConnectionState }>;
  listConnections(): Promise<{ connections: Profile[] }>;
  listRequests(): Promise<{ requests: Profile[] }>;
  createPost(input: { text: string; imageKey?: string | null }): Promise<{ post: Post }>;
  getFeed(before?: number): Promise<{ posts: Post[] }>;
  likePost(id: string): Promise<{ post: Post }>;
  commentPost(id: string, text: string): Promise<{ post: Post }>;
  deletePost(id: string): Promise<{ ok: boolean }>;
  dmThread(userId: string): Promise<{ messages: DmMessage[] }>;
  sendDm(userId: string, text: string): Promise<{ message: DmMessage }>;
  conversations(): Promise<{ conversations: Conversation[] }>;
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
    adminStats: () => request('GET', '/api/admin/stats'),
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
    myProfile: () => request('GET', '/api/profile/me'),
    saveProfile: (input) => request('PUT', '/api/profile', input),
    getProfile: (userId) => request('GET', `/api/profile/${encodeURIComponent(userId)}`),
    searchPeople: (opts = {}) => {
      const q = new URLSearchParams();
      if (opts.q) q.set('q', opts.q);
      if (opts.role) q.set('role', opts.role);
      const qs = q.toString();
      return request('GET', `/api/people${qs ? `?${qs}` : ''}`);
    },
    uploadUrl: (input) => request('POST', '/api/media/upload-url', input),
    requestConnect: (userId) => request('POST', `/api/connections/${encodeURIComponent(userId)}/request`, {}),
    acceptConnect: (userId) => request('POST', `/api/connections/${encodeURIComponent(userId)}/accept`, {}),
    declineConnect: (userId) => request('POST', `/api/connections/${encodeURIComponent(userId)}/decline`, {}),
    removeConnect: (userId) => request('DELETE', `/api/connections/${encodeURIComponent(userId)}`),
    listConnections: () => request('GET', '/api/connections'),
    listRequests: () => request('GET', '/api/connections/requests'),
    createPost: (input) => request('POST', '/api/posts', input),
    getFeed: (before) => request('GET', `/api/feed${before ? `?before=${before}` : ''}`),
    likePost: (id) => request('POST', `/api/posts/${encodeURIComponent(id)}/like`, {}),
    commentPost: (id, text) => request('POST', `/api/posts/${encodeURIComponent(id)}/comments`, { text }),
    deletePost: (id) => request('DELETE', `/api/posts/${encodeURIComponent(id)}`),
    dmThread: (userId) => request('GET', `/api/dm/${encodeURIComponent(userId)}`),
    sendDm: (userId, text) => request('POST', `/api/dm/${encodeURIComponent(userId)}`, { text }),
    conversations: () => request('GET', '/api/dm'),
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
