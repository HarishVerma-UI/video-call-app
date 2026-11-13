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
  /** OAuth provider when the account was created via social login, else null. */
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

export interface Ad {
  id: string;
  title: string;
  body: string;
  imageKey?: string | null;
  imageUrl: string | null;
  linkUrl: string;
  active: boolean;
  createdAt: string | null;
}

export interface Notification {
  id: string;
  kind: 'like' | 'comment' | 'call';
  actorId: string;
  actorName: string;
  postId: string | null;
  /** For a 'call' notification: the room to join. */
  roomId?: string | null;
  text: string;
  read: boolean;
  ts: number;
}

export interface DmMessage {
  id: string;
  from: string;
  fromName: string;
  to: string;
  text: string;
  /** Present on a call message: the room to join. */
  roomId?: string | null;
  ts: number;
}
export interface Conversation {
  other: string;
  profile: Profile;
  last: DmMessage;
}

// --- jobs & careers ---
export type JobCategory = 'tech' | 'non-tech';
export type JobType = 'full-time' | 'part-time' | 'contract' | 'internship';
export type JobExperience = 'entry' | 'mid' | 'senior' | 'lead';
export type ApplicationStatus = 'applied' | 'shortlisted' | 'rejected';

export interface Job {
  id: string;
  title: string;
  company: string;
  category: JobCategory;
  country: string;
  type: JobType;
  experience: JobExperience;
  salaryMin: number | null;
  salaryMax: number | null;
  salaryCurrency: string;
  remote: boolean;
  description: string;
  requirements: string[];
  skills: string[];
  active: boolean;
  createdAt: string | null;
  /** 0–100 fit for the signed-in viewer, from skill overlap (list/detail only). */
  matchScore?: number;
  /** Which of the viewer's skills matched this job. */
  matchedSkills?: string[];
  /** Whether the signed-in viewer has already applied. */
  appliedByMe?: boolean;
  /** How many people applied (admin views only). */
  applicantCount?: number;
}

export interface JobApplication {
  id: string;
  jobId: string;
  userId: string;
  userName: string;
  note: string;
  status: ApplicationStatus;
  createdAt: string | null;
  /** The job, included in "my applications". */
  job?: Job;
  /** The applicant's profile, included in the admin applicants list. */
  profile?: Profile;
}

/** Fields an admin supplies to create or edit a job. */
export interface JobInput {
  title: string;
  company: string;
  category?: JobCategory;
  country?: string;
  type?: JobType;
  experience?: JobExperience;
  salaryMin?: number | null;
  salaryMax?: number | null;
  salaryCurrency?: string;
  remote?: boolean;
  description?: string;
  requirements?: string[];
  skills?: string[];
  active?: boolean;
}

/** Filters for the jobs board. */
export interface JobFilters {
  q?: string;
  category?: JobCategory | '';
  country?: string;
  type?: JobType | '';
  experience?: JobExperience | '';
  remote?: boolean;
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

  // --- ads (admin manages; everyone sees active ones in the feed) ---
  ads(): Promise<{ ads: Ad[] }>;
  /** Community stats shown on the home feed. */
  stats(): Promise<{ totalUsers: number; online: number }>;
  /** Your recent like/comment notifications, with the unread count. */
  notifications(): Promise<{ notifications: Notification[]; unread: number }>;
  markNotificationsRead(): Promise<{ ok: boolean }>;
  adminListAds(): Promise<{ ads: Ad[] }>;
  adminCreateAd(input: { title: string; body?: string; linkUrl?: string; imageKey?: string | null; active?: boolean }): Promise<{ ad: Ad }>;
  adminUpdateAd(id: string, patch: { title?: string; body?: string; linkUrl?: string; imageKey?: string | null; active?: boolean }): Promise<{ ad: Ad }>;
  adminDeleteAd(id: string): Promise<{ ok: boolean; id: string }>;

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
  editPost(id: string, text: string): Promise<{ post: Post }>;
  deleteComment(postId: string, commentId: string): Promise<{ post: Post }>;
  searchPosts(q: string, page?: number): Promise<{ posts: Post[] }>;
  dmThread(userId: string): Promise<{ messages: DmMessage[] }>;
  sendDm(userId: string, text: string): Promise<{ message: DmMessage }>;
  /** Start a call with a connection: posts a call message in the thread and notifies them. */
  startCall(userId: string, roomId: string): Promise<{ ok: boolean; message: DmMessage }>;
  conversations(): Promise<{ conversations: Conversation[] }>;

  // --- jobs & careers ---
  /** Browse active jobs, with a per-viewer match score. */
  jobs(filters?: JobFilters): Promise<{ jobs: Job[]; total: number }>;
  /** A single job's full details (with match score + whether you applied). */
  job(id: string): Promise<{ job: Job }>;
  /** Apply to a job with an optional cover note. */
  applyToJob(id: string, input?: { note?: string }): Promise<{ application: JobApplication }>;
  /** Jobs you've applied to, newest first, each with its status. */
  myApplications(): Promise<{ applications: JobApplication[] }>;

  // --- jobs admin (admin role only) ---
  adminListJobs(): Promise<{ jobs: Job[] }>;
  adminCreateJob(input: JobInput): Promise<{ job: Job }>;
  adminUpdateJob(id: string, patch: Partial<JobInput>): Promise<{ job: Job }>;
  adminDeleteJob(id: string): Promise<{ ok: boolean; id: string }>;
  adminJobApplicants(jobId: string): Promise<{ job: Job; applicants: JobApplication[] }>;
  adminSetApplicationStatus(id: string, status: ApplicationStatus): Promise<{ application: JobApplication }>;

  // --- server logs (admin only) ---
  logs(opts?: { since?: number; level?: string; q?: string; limit?: number }): Promise<{ logs: { id: number; ts: number; level: string; message: string }[] }>;
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
    ads: () => request('GET', '/api/ads'),
    stats: () => request('GET', '/api/stats'),
    notifications: () => request('GET', '/api/notifications'),
    markNotificationsRead: () => request('POST', '/api/notifications/read', {}),
    adminListAds: () => request('GET', '/api/admin/ads'),
    adminCreateAd: (input) => request('POST', '/api/admin/ads', input),
    adminUpdateAd: (id, patch) => request('PATCH', `/api/admin/ads/${encodeURIComponent(id)}`, patch),
    adminDeleteAd: (id) => request('DELETE', `/api/admin/ads/${encodeURIComponent(id)}`),
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
    editPost: (id, text) => request('PATCH', `/api/posts/${encodeURIComponent(id)}`, { text }),
    deleteComment: (postId, commentId) => request('DELETE', `/api/posts/${encodeURIComponent(postId)}/comments/${encodeURIComponent(commentId)}`),
    searchPosts: (q, page) => {
      const params = new URLSearchParams({ q });
      if (page !== undefined) params.set('page', String(page));
      return request('GET', `/api/posts/search?${params.toString()}`);
    },
    dmThread: (userId) => request('GET', `/api/dm/${encodeURIComponent(userId)}`),
    sendDm: (userId, text) => request('POST', `/api/dm/${encodeURIComponent(userId)}`, { text }),
    startCall: (userId, roomId) => request('POST', `/api/call/${encodeURIComponent(userId)}/invite`, { roomId }),
    conversations: () => request('GET', '/api/dm'),
    jobs: (filters = {}) => {
      const q = new URLSearchParams();
      if (filters.q) q.set('q', filters.q);
      if (filters.category) q.set('category', filters.category);
      if (filters.country) q.set('country', filters.country);
      if (filters.type) q.set('type', filters.type);
      if (filters.experience) q.set('experience', filters.experience);
      if (filters.remote) q.set('remote', '1');
      const qs = q.toString();
      return request('GET', `/api/jobs${qs ? `?${qs}` : ''}`);
    },
    job: (id) => request('GET', `/api/jobs/${encodeURIComponent(id)}`),
    applyToJob: (id, input = {}) => request('POST', `/api/jobs/${encodeURIComponent(id)}/apply`, input),
    myApplications: () => request('GET', '/api/applications'),
    adminListJobs: () => request('GET', '/api/admin/jobs'),
    adminCreateJob: (input) => request('POST', '/api/admin/jobs', input),
    adminUpdateJob: (id, patch) => request('PATCH', `/api/admin/jobs/${encodeURIComponent(id)}`, patch),
    adminDeleteJob: (id) => request('DELETE', `/api/admin/jobs/${encodeURIComponent(id)}`),
    adminJobApplicants: (jobId) => request('GET', `/api/admin/jobs/${encodeURIComponent(jobId)}/applicants`),
    adminSetApplicationStatus: (id, status) => request('PATCH', `/api/admin/applications/${encodeURIComponent(id)}`, { status }),
    logs: (opts = {}) => {
      const q = new URLSearchParams();
      if (opts.since !== undefined) q.set('since', String(opts.since));
      if (opts.level) q.set('level', opts.level);
      if (opts.q) q.set('q', opts.q);
      if (opts.limit !== undefined) q.set('limit', String(opts.limit));
      const qs = q.toString();
      return request('GET', `/api/logs${qs ? `?${qs}` : ''}`);
    },
  };
}

/**
 * How complete a professional profile is, 0–100. Used to gate job applications
 * (the backlog's "70% rule") and to show a completeness meter. Weighted so a
 * usefully-complete profile (headline, bio, location, a few skills, one role and
 * one school) reaches 100.
 */
export function profileCompletion(p: Partial<Profile> | null | undefined): number {
  if (!p) return 0;
  let score = 0;
  if ((p.headline ?? '').trim()) score += 15;
  if ((p.bio ?? '').trim()) score += 15;
  if ((p.location ?? '').trim()) score += 10;
  const skills = p.skills?.length ?? 0;
  score += Math.min(20, skills * 7); // 3+ skills → full 20
  if ((p.experience?.length ?? 0) > 0) score += 20;
  if ((p.education?.length ?? 0) > 0) score += 10;
  if (p.hasPhoto) score += 10;
  return Math.min(100, score);
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
