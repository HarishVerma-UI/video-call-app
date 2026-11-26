import type { ChatMessage } from './protocol';

// Tiny typed client for the server's REST API, shared by web and mobile.

export type UserRole = 'member' | 'recruiter' | 'super_admin';

/** Normalize any stored/legacy role string ('user'→member, 'admin'→super_admin). */
export function normalizeRole(role?: string | null): UserRole {
  if (role === 'super_admin' || role === 'admin') return 'super_admin';
  if (role === 'recruiter') return 'recruiter';
  return 'member';
}
export const isSuperAdmin = (role?: string | null): boolean => normalizeRole(role) === 'super_admin';
export const isRecruiter = (role?: string | null): boolean => normalizeRole(role) === 'recruiter';
/** Recruiters and super-admins — anyone with a back-office dashboard. */
export const isStaff = (role?: string | null): boolean => {
  const r = normalizeRole(role);
  return r === 'recruiter' || r === 'super_admin';
};
export const ROLE_LABEL: Record<UserRole, string> = { member: 'Member', recruiter: 'Recruiter', super_admin: 'Super Admin' };

export interface RecruiterApplication {
  status: 'pending' | 'approved' | 'rejected';
  company: string;
  website: string;
  reason: string;
  requestedAt: string;
  reviewedAt?: string;
  reviewedBy?: string;
}

export interface AuthUser {
  id: string;
  name: string;
  email: string;
  /** 'super_admin' opens the platform console, 'recruiter' the talent dashboard; others are 'member'. */
  role?: UserRole;
  /** false for accounts created via social login only (they can add a password). */
  hasPassword?: boolean;
  /** OAuth provider when the account was created via social login, else null. */
  provider?: string | null;
  recruiterApplication?: RecruiterApplication | null;
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
  // Public profile details are returned by getProfile; contact, salary, and CV fields
  // are present only when the viewer may see them (self or accepted connection).
  bio?: string;
  email?: string;
  experience?: Experience[];
  education?: Education[];
  mobile?: string;
  expectedSalary?: string;
  mutualConnections?: number;
  openToReferrals?: boolean;
  hasCv?: boolean;
  cvName?: string;
  cvUrl?: string | null;
}

/** Full candidate profile shown to staff in the people directory (read-only). */
export interface DirectoryProfile {
  headline: string;
  location: string;
  mobile: string;
  bio: string;
  expectedSalary: string;
  skills: string[];
  experience: Experience[];
  education: Education[];
  cvName: string;
  cvUrl: string | null;
}
export interface AdminUser extends AuthUser {
  profile?: DirectoryProfile | null;
}
/** A member as seen in the recruiter's read-only people directory. */
export interface DirectoryUser extends AuthUser {
  profile?: DirectoryProfile | null;
}

/** Best-effort fields parsed from an uploaded CV, for the member to review. */
export interface ParsedCv {
  name: string;
  email: string;
  phone: string;
  location: string;
  headline: string;
  /** The CV's Summary / Profile / About section — used as the profile bio. */
  summary: string;
  skills: string[];
  experience: Experience[];
  education: Education[];
  /** True when little usable text was found (e.g. a scanned/image PDF). */
  lowConfidence: boolean;
}

/** A CV being built in the AI chat (same shape the Resume page edits). */
export interface CvDraft {
  name: string; title: string; email: string; phone: string; location: string;
  summary: string; skills: string[]; experience: Experience[]; education: Education[];
}
export interface CvChatMessage { role: 'user' | 'assistant'; text: string }
/** A CV published at <app>/<number> (the CV's phone, digits only). */
export interface PublishedCv { slug: string; template: string; updatedAt: string }
export interface PublicCv { cv: CvDraft; template: string; updatedAt: string }
/** The AI CV builder's master prompt, as the admin console edits it. */
export interface CvPromptSettings {
  prompt: string; isDefault: boolean; updatedAt: string | null; updatedBy: string | null;
  defaultPrompt: string; fixedRules: string; maxChars: number;
}
export interface CvChatReply { reply: string; progress: number; suggestions: string[]; cv: CvDraft }

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
  /** External application URL. When set, "apply" opens this instead of the in-app flow. */
  applyUrl: string;
  /** Where the job came from, e.g. "Remotive" or "Posted by admin". */
  source: string;
  /** User id of the recruiter/admin who posted this job. */
  postedBy?: string;
  /** Display name of the poster. */
  postedByName?: string;
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
  applyUrl?: string;
  source?: string;
}

/** Applicant funnel + jobs summary for a recruiter's dashboard. */
export interface RecruiterDashboard {
  jobCount: number;
  funnel: { total: number; applied: number; shortlisted: number; rejected: number };
  jobs: Job[];
  recentApplicants: JobApplication[];
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
  byRole: { member: number; recruiter: number; super_admin: number };
  recentSignups: number;
  recentLogins: number;
  dailyActivity: { day: string; count: number }[];
  /** 12-month cumulative user growth for the admin dashboard. */
  userGrowth: { label: string; total: number }[];
  activeCalls: { rooms: number; participants: number };
  activeRooms: ActiveRoom[];
  uptimeSec: number;
  // Platform (jobs & applications) metrics.
  jobsTotal: number;
  jobsActive: number;
  jobsByCategory: { tech: number; 'non-tech': number };
  applicationsTotal: number;
  applicationsByStatus: { applied: number; shortlisted: number; rejected: number };
}

/** Admin console content-list rows. */
export interface AdminPost extends Post {
  likeCount: number;
  commentCount: number;
}
export interface AdminComment {
  id: string;
  userId: string;
  name: string;
  text: string;
  ts: number;
  postId: string;
  postAuthor: string;
  postExcerpt: string;
}
export interface AdminConnection {
  pair: string;
  from: { id: string; name: string };
  to: { id: string; name: string };
  status: 'pending' | 'accepted';
  createdAt: string;
  updatedAt: string;
}
export interface AdminApplication extends JobApplication {
  jobTitle: string;
  company: string;
  jobCategory: string;
}

/** One entry in the platform audit log. */
export type AuditCategory = 'auth' | 'content' | 'jobs' | 'admin' | 'system';
export interface AuditEvent {
  id: string;
  actorId: string | null;
  actorName: string;
  action: string;
  category: AuditCategory;
  target: string;
  meta: string;
  ts: number;
}

/** A recruiter in the super-admin directory, with their posting activity. */
export interface RecruiterSummary extends AuthUser {
  jobCount: number;
  applicantCount: number;
}

export interface ApiClient {
  register(input: {
    name: string;
    email: string;
    password: string;
    profile?: {
      headline?: string;
      location?: string;
      expectedSalary?: string;
      mobile?: string;
      skills?: string[];
      experience?: Experience[];
      education?: Education[];
    };
    applyAsRecruiter?: boolean;
    recruiterApplication?: { company: string; website?: string; reason: string };
  }): Promise<AuthResponse>;
  login(input: { email: string; password: string; mode?: 'user' | 'recruiter' }): Promise<AuthResponse>;
  me(): Promise<{ user: AuthUser }>;
  /** Change name and/or email (email needs currentPassword). Returns a fresh token. */
  updateProfile(input: { name?: string; email?: string; currentPassword?: string }): Promise<AuthResponse>;
  /** Change password (or set a first one: no currentPassword). Returns a fresh token; other devices are signed out on a change. */
  changePassword(input: { currentPassword?: string; newPassword: string }): Promise<AuthResponse>;
  /** Request a password reset. Always resolves the same way; `resetUrl` is only present in dev/demo without email. */
  forgotPassword(input: { email: string }): Promise<{ ok: boolean; message: string; resetUrl?: string }>;
  /** Finish a reset with the emailed token. Returns a fresh token (signs the member in). */
  resetPassword(input: { token: string; password: string }): Promise<AuthResponse>;
  /** Which social sign-in providers are configured on the server. */
  providers(): Promise<{ providers: Providers }>;

  // --- admin dashboard (admin role only) ---
  adminListUsers(input?: { page?: number; limit?: number; search?: string; role?: UserRole | '' }): Promise<{ users: AdminUser[]; total: number; page: number; limit: number }>;
  adminCreateUser(input: { name: string; email: string; password: string; role?: UserRole }): Promise<{ user: AuthUser }>;
  adminUpdateUser(id: string, patch: { name?: string; email?: string; role?: UserRole; password?: string; recruiterApplicationStatus?: 'approved' | 'rejected' }): Promise<{ user: AuthUser }>;
  adminDeleteUser(id: string): Promise<{ ok: boolean; id: string }>;
  adminStats(): Promise<AdminStats>;
  adminListRecruiters(): Promise<{ recruiters: RecruiterSummary[] }>;
  adminListRecruiterRequests(): Promise<{ requests: AuthUser[] }>;
  /** Paginated audit log (super-admin only). */
  adminAudit(opts?: { category?: AuditCategory; page?: number; limit?: number }): Promise<{ events: AuditEvent[]; total: number; page: number; limit: number }>;
  adminBulkDeleteUsers(ids: string[]): Promise<{ ok: boolean; deleted: number }>;
  adminBulkDeleteJobs(ids: string[]): Promise<{ ok: boolean; deleted: number }>;
  adminListPosts(opts?: { page?: number; limit?: number; search?: string }): Promise<{ posts: AdminPost[]; total: number; page: number; limit: number }>;
  adminListComments(opts?: { page?: number; limit?: number; search?: string }): Promise<{ comments: AdminComment[]; total: number; page: number; limit: number }>;
  adminListConnections(opts?: { page?: number; limit?: number; status?: 'pending' | 'accepted' | '' }): Promise<{ connections: AdminConnection[]; total: number; page: number; limit: number }>;
  adminListApplications(opts?: { page?: number; limit?: number; search?: string; status?: string }): Promise<{ applications: AdminApplication[]; total: number; page: number; limit: number }>;
  adminBulkDeletePosts(ids: string[]): Promise<{ ok: boolean; deleted: number }>;
  adminDeleteComment(postId: string, commentId: string): Promise<{ ok: boolean }>;

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
  /** Parse an uploaded CV file into profile fields for review (nothing is saved). */
  parseCv(file: Blob, contentType?: string): Promise<{ parsed: ParsedCv }>;
  /** AI CV builder chat (Gemini, server-side). */
  cvChatStatus(): Promise<{ configured: boolean }>;
  cvChat(input: { messages: CvChatMessage[]; cv: CvDraft }): Promise<CvChatReply>;
  /** Super-admin: the AI CV builder's master prompt. */
  adminCvPrompt(): Promise<CvPromptSettings>;
  adminSaveCvPrompt(prompt: string): Promise<CvPromptSettings>;
  adminResetCvPrompt(): Promise<CvPromptSettings>;
  /** Your public CV link, if published. */
  myPublicCv(): Promise<{ published: PublishedCv | null }>;
  /** Publish (or update) your CV at /<phone digits>. */
  publishCv(input: { cv: CvDraft; template: string }): Promise<{ published: PublishedCv }>;
  unpublishCv(): Promise<{ published: null }>;
  /** Anyone (no sign-in): the CV published at this number. */
  publicCv(slug: string): Promise<PublicCv>;
  /** A shared job, viewable without an account. */
  publicJob(id: string): Promise<{ job: Job }>;
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
  adminListJobs(opts?: { page?: number; limit?: number; search?: string; status?: string; category?: string }): Promise<{ jobs: Job[]; total: number; page: number; limit: number }>;
  adminCreateJob(input: JobInput): Promise<{ job: Job }>;
  adminUpdateJob(id: string, patch: Partial<JobInput>): Promise<{ job: Job }>;
  adminDeleteJob(id: string): Promise<{ ok: boolean; id: string }>;
  adminJobApplicants(jobId: string): Promise<{ job: Job; applicants: JobApplication[] }>;
  adminSetApplicationStatus(id: string, status: ApplicationStatus): Promise<{ application: JobApplication }>;
  /** Bulk-insert jobs (e.g. from the importer). Dedupes by default; pass { dedupe: false } to insert a curated batch verbatim. */
  adminImportJobs(jobs: JobInput[], opts?: { dedupe?: boolean }): Promise<{ created: number; skipped: number }>;

  // --- recruiter (recruiter or super_admin) — scoped to the caller's own jobs ---
  recruiterDashboard(): Promise<RecruiterDashboard>;
  recruiterJobs(): Promise<{ jobs: Job[] }>;
  recruiterCreateJob(input: JobInput): Promise<{ job: Job }>;
  recruiterUpdateJob(id: string, patch: Partial<JobInput>): Promise<{ job: Job }>;
  recruiterDeleteJob(id: string): Promise<{ ok: boolean; id: string }>;
  recruiterApplicants(jobId: string): Promise<{ job: Job; applicants: JobApplication[] }>;
  recruiterAllApplicants(params?: { page?: number; limit?: number; search?: string; status?: ApplicationStatus | '' }): Promise<{ applicants: JobApplication[]; total: number; page: number; limit: number }>;
  recruiterListUsers(params?: { page?: number; limit?: number; search?: string; role?: UserRole | '' }): Promise<{ users: DirectoryUser[]; total: number; page: number; limit: number }>;
  recruiterSetApplicationStatus(id: string, status: ApplicationStatus): Promise<{ application: JobApplication }>;

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
    forgotPassword: (input) => request('POST', '/api/auth/forgot', input),
    resetPassword: (input) => request('POST', '/api/auth/reset', input),
    providers: () => request('GET', '/api/auth/providers'),
    adminListUsers: ({ page = 1, limit = 50, search = '', role = '' } = {}) => {
      const params = new URLSearchParams({ page: String(page), limit: String(limit) });
      if (search.trim()) params.set('search', search.trim());
      if (role) params.set('role', role);
      return request('GET', `/api/admin/users?${params}`);
    },
    adminCreateUser: (input) => request('POST', '/api/admin/users', input),
    adminUpdateUser: (id, patch) => request('PATCH', `/api/admin/users/${encodeURIComponent(id)}`, patch),
    adminDeleteUser: (id) => request('DELETE', `/api/admin/users/${encodeURIComponent(id)}`),
    adminStats: () => request('GET', '/api/admin/stats'),
    adminListRecruiters: () => request('GET', '/api/admin/recruiters'),
    adminListRecruiterRequests: () => request('GET', '/api/admin/recruiter-applications'),
    adminAudit: ({ page = 1, limit = 50, category } = {}) => {
      const q = new URLSearchParams({ page: String(page), limit: String(limit) });
      if (category) q.set('category', category);
      return request('GET', `/api/admin/audit?${q}`);
    },
    adminBulkDeleteUsers: (ids) => request('POST', '/api/admin/users/bulk-delete', { ids }),
    adminBulkDeleteJobs: (ids) => request('POST', '/api/admin/jobs/bulk-delete', { ids }),
    adminListPosts: ({ page = 1, limit = 25, search = '' } = {}) => {
      const q = new URLSearchParams({ page: String(page), limit: String(limit) });
      if (search.trim()) q.set('search', search.trim());
      return request('GET', `/api/admin/posts?${q}`);
    },
    adminListComments: ({ page = 1, limit = 25, search = '' } = {}) => {
      const q = new URLSearchParams({ page: String(page), limit: String(limit) });
      if (search.trim()) q.set('search', search.trim());
      return request('GET', `/api/admin/comments?${q}`);
    },
    adminListConnections: ({ page = 1, limit = 25, status = '' } = {}) => {
      const q = new URLSearchParams({ page: String(page), limit: String(limit) });
      if (status) q.set('status', status);
      return request('GET', `/api/admin/connections?${q}`);
    },
    adminListApplications: ({ page = 1, limit = 25, search = '', status = '' } = {}) => {
      const q = new URLSearchParams({ page: String(page), limit: String(limit) });
      if (search.trim()) q.set('search', search.trim());
      if (status) q.set('status', status);
      return request('GET', `/api/admin/applications?${q}`);
    },
    adminBulkDeletePosts: (ids) => request('POST', '/api/admin/posts/bulk-delete', { ids }),
    adminDeleteComment: (postId, commentId) => request('DELETE', `/api/admin/posts/${encodeURIComponent(postId)}/comments/${encodeURIComponent(commentId)}`),
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
    parseCv: async (file, contentType) => {
      const token = getToken();
      let res: Response;
      try {
        res = await fetch(`${baseUrl}/api/profile/cv/parse`, {
          method: 'POST',
          headers: {
            Accept: 'application/json',
            'Content-Type': contentType || (file as { type?: string }).type || 'application/octet-stream',
            ...(token ? { Authorization: `Bearer ${token}` } : {}),
          },
          body: file,
        });
      } catch {
        throw new ApiError(0, null);
      }
      const data = await res.json().catch(() => null);
      if (!res.ok) {
        if (res.status === 401 && token) onUnauthorized?.();
        throw new ApiError(res.status, data);
      }
      return data as { parsed: ParsedCv };
    },
    getProfile: (userId) => request('GET', `/api/profile/${encodeURIComponent(userId)}`),
    searchPeople: (opts = {}) => {
      const q = new URLSearchParams();
      if (opts.q) q.set('q', opts.q);
      if (opts.role) q.set('role', opts.role);
      const qs = q.toString();
      return request('GET', `/api/people${qs ? `?${qs}` : ''}`);
    },
    uploadUrl: (input) => request('POST', '/api/media/upload-url', input),
    cvChatStatus: () => request('GET', '/api/career/cv-chat/status'),
    cvChat: (input) => request('POST', '/api/career/cv-chat', input),
    adminCvPrompt: () => request('GET', '/api/admin/ai/cv-prompt'),
    adminSaveCvPrompt: (prompt) => request('PUT', '/api/admin/ai/cv-prompt', { prompt }),
    adminResetCvPrompt: () => request('DELETE', '/api/admin/ai/cv-prompt'),
    myPublicCv: () => request('GET', '/api/career/public-cv'),
    publishCv: (input) => request('PUT', '/api/career/public-cv', input),
    unpublishCv: () => request('DELETE', '/api/career/public-cv'),
    publicCv: (slug) => request('GET', `/api/public/cv/${encodeURIComponent(slug)}`),
    publicJob: (id) => request('GET', `/api/public/jobs/${encodeURIComponent(id)}`),
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
    adminListJobs: ({ page = 1, limit = 25, search = '', status = '', category = '' } = {}) => {
      const q = new URLSearchParams({ page: String(page), limit: String(limit) });
      if (search.trim()) q.set('search', search.trim());
      if (status) q.set('status', status);
      if (category) q.set('category', category);
      return request('GET', `/api/admin/jobs?${q}`);
    },
    adminCreateJob: (input) => request('POST', '/api/admin/jobs', input),
    adminUpdateJob: (id, patch) => request('PATCH', `/api/admin/jobs/${encodeURIComponent(id)}`, patch),
    adminDeleteJob: (id) => request('DELETE', `/api/admin/jobs/${encodeURIComponent(id)}`),
    adminJobApplicants: (jobId) => request('GET', `/api/admin/jobs/${encodeURIComponent(jobId)}/applicants`),
    adminSetApplicationStatus: (id, status) => request('PATCH', `/api/admin/applications/${encodeURIComponent(id)}`, { status }),
    adminImportJobs: (jobs, opts) => request('POST', '/api/admin/jobs/import', { jobs, dedupe: opts?.dedupe }),
    recruiterDashboard: () => request('GET', '/api/recruiter/dashboard'),
    recruiterJobs: () => request('GET', '/api/recruiter/jobs'),
    recruiterCreateJob: (input) => request('POST', '/api/recruiter/jobs', input),
    recruiterUpdateJob: (id, patch) => request('PATCH', `/api/recruiter/jobs/${encodeURIComponent(id)}`, patch),
    recruiterDeleteJob: (id) => request('DELETE', `/api/recruiter/jobs/${encodeURIComponent(id)}`),
    recruiterApplicants: (jobId) => request('GET', `/api/recruiter/jobs/${encodeURIComponent(jobId)}/applicants`),
    recruiterAllApplicants: ({ page = 1, limit = 25, search = '', status = '' } = {}) => {
      const q = new URLSearchParams({ page: String(page), limit: String(limit) });
      if (search.trim()) q.set('search', search.trim());
      if (status) q.set('status', status);
      return request('GET', `/api/recruiter/applicants?${q}`);
    },
    recruiterListUsers: ({ page = 1, limit = 25, search = '', role = '' } = {}) => {
      const q = new URLSearchParams({ page: String(page), limit: String(limit) });
      if (search.trim()) q.set('search', search.trim());
      if (role) q.set('role', role);
      return request('GET', `/api/recruiter/users?${q}`);
    },
    recruiterSetApplicationStatus: (id, status) => request('PATCH', `/api/recruiter/applications/${encodeURIComponent(id)}`, { status }),
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
  const skills = new Set((p.skills ?? []).map((skill) => skill.trim().toLowerCase()).filter(Boolean)).size;
  score += Math.min(20, skills * 7); // 3+ skills → full 20
  if (p.experience?.some((item) => item.title.trim() || item.company.trim())) score += 20;
  if (p.education?.some((item) => item.school.trim() || item.degree.trim())) score += 10;
  if (p.hasCv) score += 10;
  return Math.min(100, score);
}

export function profileMissingItems(p: Partial<Profile> | null | undefined): string[] {
  if (!p) return ['Headline', 'Bio', 'Location', 'Skills', 'Experience', 'Education', 'CV / Resume'];
  return [
    ...(p.headline?.trim() ? [] : ['Headline']),
    ...(p.bio?.trim() ? [] : ['Bio']),
    ...(p.location?.trim() ? [] : ['Location']),
    ...(new Set((p.skills ?? []).map((skill) => skill.trim().toLowerCase()).filter(Boolean)).size >= 3 ? [] : ['Skills (add 3 or more)']),
    ...(p.experience?.some((item) => item.title.trim() || item.company.trim()) ? [] : ['Experience']),
    ...(p.education?.some((item) => item.school.trim() || item.degree.trim()) ? [] : ['Education']),
    ...(p.hasCv ? [] : ['CV / Resume']),
  ];
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
