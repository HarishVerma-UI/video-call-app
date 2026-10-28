import { createApi, type ApiClient, type AuthResponse, type AuthUser } from '@vca/shared';
import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { API_BASE } from '../config';
import { createPasskey, getPasskey } from './passkey';

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
  /** `beforeEnter` runs after the server accepts, before the app switches screens (for the exit animation). */
  login: (email: string, password: string, beforeEnter?: () => Promise<void>) => Promise<void>;
  register: (name: string, email: string, password: string, beforeEnter?: () => Promise<void>) => Promise<void>;
  logout: (reason?: string) => void;
  /** Change name/email; keeps you signed in with the fresh token. */
  updateProfile: (input: { name?: string; email?: string; currentPassword?: string }) => Promise<AuthUser>;
  /** Change password (currentPassword null = set a first one); this device stays signed in, other devices are signed out. */
  changePassword: (currentPassword: string | null, newPassword: string) => Promise<void>;
  /** Sign in with the device's face unlock (passkey). No email needed. */
  loginWithFace: (beforeEnter?: () => Promise<void>, onPrompt?: () => void) => Promise<void>;
  /** Create an account secured by face unlock (no password). */
  registerWithFace: (name: string, email: string, beforeEnter?: () => Promise<void>, onPrompt?: () => void) => Promise<void>;
  /** Turn on face sign-in for this device on the signed-in account. */
  addFaceToAccount: () => Promise<void>;
  /** Re-read the user (e.g. after removing devices). */
  refreshUser: () => Promise<void>;
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
    login: async (email, password, beforeEnter) => {
      const r = await api.login({ email, password });
      await beforeEnter?.();
      accept(r);
    },
    register: async (name, email, password, beforeEnter) => {
      const r = await api.register({ name, email, password });
      await beforeEnter?.();
      accept(r);
    },
    updateProfile: async (input) => {
      const r = await api.updateProfile(input);
      accept(r);
      return r.user;
    },
    changePassword: async (currentPassword, newPassword) => {
      accept(await api.changePassword(currentPassword === null ? { newPassword } : { currentPassword, newPassword }));
    },
    loginWithFace: async (beforeEnter, onPrompt) => {
      const options = await api.passkeyLoginOptions();
      onPrompt?.();
      const credential = await getPasskey(options);
      const r = await api.passkeyLoginVerify(credential);
      await beforeEnter?.();
      accept(r);
    },
    registerWithFace: async (name, email, beforeEnter, onPrompt) => {
      const options = await api.passkeyRegisterOptions({ name, email });
      onPrompt?.();
      const credential = await createPasskey(options);
      const r = await api.passkeyRegisterVerify(credential);
      await beforeEnter?.();
      accept(r);
    },
    addFaceToAccount: async () => {
      const options = await api.passkeyRegisterOptions();
      await api.passkeyRegisterVerify(await createPasskey(options));
    },
    refreshUser: async () => {
      const { user } = await api.me();
      setSession((s) => {
        const next = s ? { ...s, user } : s;
        save(next);
        return next;
      });
    },
  };

  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

export function useAuth(): AuthValue {
  const v = useContext(Ctx);
  if (!v) throw new Error('useAuth must be used inside <AuthProvider>');
  return v;
}
