import { createApi, type ApiClient, type AuthResponse, type AuthUser } from '@vca/shared';
import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { API_BASE } from '../config';

const KEY = 'huddle:session';

interface Session {
  token: string;
  user: AuthUser;
  expiresAt: string;
}

type Status = 'checking' | 'signed-in' | 'signed-out';

interface AuthValue {
  status: Status;
  user: AuthUser | null;
  token: string | null;
  api: ApiClient;
  login: (email: string, password: string) => Promise<void>;
  register: (name: string, email: string, password: string) => Promise<void>;
  logout: (reason?: string) => void;
  /** Message to show on the sign-in page (e.g. "session expired"). */
  notice: string | null;
}

const Ctx = createContext<AuthValue | null>(null);

function load(): Session | null {
  try {
    const s = JSON.parse(localStorage.getItem(KEY) ?? 'null') as Session | null;
    if (!s?.token || !s.user) return null;
    if (new Date(s.expiresAt).getTime() < Date.now()) return null;
    return s;
  } catch {
    return null;
  }
}
function save(s: Session | null) {
  try {
    if (s) localStorage.setItem(KEY, JSON.stringify(s));
    else localStorage.removeItem(KEY);
  } catch {
    /* storage disabled — session lasts for this tab only */
  }
}

export function AuthProvider({ children }: { children: ReactNode }) {
  const [session, setSession] = useState<Session | null>(load);
  const [status, setStatus] = useState<Status>(() => (load() ? 'checking' : 'signed-out'));
  const [notice, setNotice] = useState<string | null>(null);
  const tokenRef = useRef<string | null>(session?.token ?? null);
  tokenRef.current = session?.token ?? null;

  const logout = useCallback((reason?: string) => {
    save(null);
    setSession(null);
    setStatus('signed-out');
    setNotice(reason ?? null);
  }, []);

  const api = useMemo(
    () => createApi(API_BASE, () => tokenRef.current, () => logout('Your session expired. Please sign in again.')),
    [logout],
  );

  // Confirm a stored token is still valid (and refresh the user's details).
  useEffect(() => {
    if (status !== 'checking') return;
    let cancelled = false;
    api
      .me()
      .then(({ user }) => {
        if (cancelled) return;
        setSession((s) => {
          const next = s ? { ...s, user } : s;
          save(next);
          return next;
        });
        setStatus('signed-in');
      })
      .catch((err) => {
        if (cancelled) return;
        // Offline? Trust the unexpired stored session; the call itself will re-check.
        if (err?.status === 0 && session) setStatus('signed-in');
        else logout();
      });
    return () => {
      cancelled = true;
    };
  }, [status, api, logout, session]);

  // Sign out everywhere when another tab signs out.
  useEffect(() => {
    const onStorage = (e: StorageEvent) => {
      if (e.key !== KEY) return;
      const s = load();
      setSession(s);
      setStatus(s ? 'signed-in' : 'signed-out');
    };
    window.addEventListener('storage', onStorage);
    return () => window.removeEventListener('storage', onStorage);
  }, []);

  const accept = useCallback((r: AuthResponse) => {
    const s = { token: r.token, user: r.user, expiresAt: r.expiresAt };
    save(s);
    tokenRef.current = s.token;
    setSession(s);
    setNotice(null);
    setStatus('signed-in');
  }, []);

  const value: AuthValue = {
    status,
    user: status === 'signed-in' ? session?.user ?? null : null,
    token: status === 'signed-in' ? session?.token ?? null : null,
    api,
    notice,
    logout,
    login: async (email, password) => accept(await api.login({ email, password })),
    register: async (name, email, password) => accept(await api.register({ name, email, password })),
  };

  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

export function useAuth(): AuthValue {
  const v = useContext(Ctx);
  if (!v) throw new Error('useAuth must be used inside <AuthProvider>');
  return v;
}
