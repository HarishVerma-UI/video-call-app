import { createApi, type ApiClient, type AuthResponse, type AuthUser } from '@vca/shared';
import * as SecureStore from 'expo-secure-store';
import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { API_BASE } from './config';

// The JWT lives in the OS keychain (iOS) / Keystore-backed storage (Android),
// not in plain AsyncStorage.
const KEY = 'huddle.session';

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
  notice: string | null;
  /** `beforeEnter` runs after the server accepts, before switching screens (for the exit animation). */
  login: (email: string, password: string, beforeEnter?: () => Promise<void>) => Promise<void>;
  register: (name: string, email: string, password: string, beforeEnter?: () => Promise<void>) => Promise<void>;
  logout: (reason?: string) => Promise<void>;
}

const Ctx = createContext<AuthValue | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [session, setSession] = useState<Session | null>(null);
  const [status, setStatus] = useState<Status>('checking');
  const [notice, setNotice] = useState<string | null>(null);
  const tokenRef = useRef<string | null>(null);
  tokenRef.current = session?.token ?? null;

  const logout = useCallback(async (reason?: string) => {
    await SecureStore.deleteItemAsync(KEY).catch(() => {});
    setSession(null);
    setStatus('signed-out');
    setNotice(reason ?? null);
  }, []);

  const api = useMemo(
    () => createApi(API_BASE, () => tokenRef.current, () => void logout('Your session expired. Please sign in again.')),
    [logout],
  );

  // On launch: restore the saved session and confirm it with the server.
  useEffect(() => {
    (async () => {
      let saved: Session | null = null;
      try {
        saved = JSON.parse((await SecureStore.getItemAsync(KEY)) ?? 'null');
      } catch {
        saved = null;
      }
      if (!saved?.token || new Date(saved.expiresAt).getTime() < Date.now()) {
        setStatus('signed-out');
        return;
      }
      tokenRef.current = saved.token;
      setSession(saved);
      try {
        const { user } = await api.me();
        const next = { ...saved, user };
        setSession(next);
        await SecureStore.setItemAsync(KEY, JSON.stringify(next));
        setStatus('signed-in');
      } catch (err: any) {
        // Offline: keep the unexpired session; the server re-checks on join.
        if (err?.status === 0) setStatus('signed-in');
        else await logout();
      }
    })();
  }, [api, logout]);

  const accept = useCallback(async (r: AuthResponse) => {
    const s = { token: r.token, user: r.user, expiresAt: r.expiresAt };
    await SecureStore.setItemAsync(KEY, JSON.stringify(s));
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
      await accept(r);
    },
    register: async (name, email, password, beforeEnter) => {
      const r = await api.register({ name, email, password });
      await beforeEnter?.();
      await accept(r);
    },
  };
  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

export function useAuth(): AuthValue {
  const v = useContext(Ctx);
  if (!v) throw new Error('useAuth must be used inside <AuthProvider>');
  return v;
}
