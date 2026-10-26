// Tiny typed client for the server's REST API, shared by web and mobile.

export interface AuthUser {
  id: string;
  name: string;
  email: string;
  createdAt: string;
}

export interface AuthResponse {
  user: AuthUser;
  token: string;
  expiresAt: string;
}

export interface RoomInfo {
  roomId: string;
  participants: number;
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
  roomInfo(roomId: string): Promise<RoomInfo>;
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
      if (res.status === 401 && token && !path.startsWith('/api/auth/login')) onUnauthorized?.();
      throw new ApiError(res.status, data);
    }
    return data as T;
  }

  return {
    register: (input) => request('POST', '/api/auth/register', input),
    login: (input) => request('POST', '/api/auth/login', input),
    me: () => request('GET', '/api/auth/me'),
    roomInfo: (roomId) => request('GET', `/api/rooms/${encodeURIComponent(roomId)}`),
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
