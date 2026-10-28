import { createApi, type ApiClient, type AuthResponse, type AuthUser } from '@vca/shared';
import * as SecureStore from 'expo-secure-store';
import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { API_BASE } from './config';
import { ApiError } from '@vca/shared';
import { clearFaceKey, confirmFace, deviceName, faceMeta, faceSupport, saveFaceKey, unlockFaceKey, type FaceMeta } from './faceUnlock';

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
  /** Change name/email; keeps you signed in with the fresh token. */
  updateProfile: (input: { name?: string; email?: string; currentPassword?: string }) => Promise<AuthUser>;
  /** Change password (null = add a first one); this phone stays signed in, other devices are signed out. */
  changePassword: (currentPassword: string | null, newPassword: string) => Promise<void>;
  /** Face sign-in on this phone: who it's set up for, and what the phone calls it. */
  face: { available: boolean; label: string; meta: FaceMeta | null };
  loginWithFace: (beforeEnter?: () => Promise<void>) => Promise<void>;
  /** New account protected by face unlock, no password. */
  registerWithFace: (name: string, email: string, beforeEnter?: () => Promise<void>) => Promise<void>;
  /** Turn face sign-in on/off for this phone (signed in). */
  enableFace: () => Promise<void>;
  disableFace: () => Promise<void>;
  refreshUser: () => Promise<void>;
}

const Ctx = createContext<AuthValue | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [session, setSession] = useState<Session | null>(null);
  const [status, setStatus] = useState<Status>('checking');
  const [notice, setNotice] = useState<string | null>(null);
  const [face, setFace] = useState<AuthValue['face']>({ available: false, label: 'face unlock', meta: null });
  const tokenRef = useRef<string | null>(null);
  const reloadFace = useCallback(async () => {
    const [support, meta] = await Promise.all([faceSupport(), faceMeta()]);
    setFace({ ...support, meta });
  }, []);
  useEffect(() => {
    void reloadFace();
  }, [reloadFace]);
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
    updateProfile: async (input) => {
      const r = await api.updateProfile(input);
      await accept(r);
      return r.user;
    },
    changePassword: async (currentPassword, newPassword) => {
      await accept(await api.changePassword(currentPassword === null ? { newPassword } : { currentPassword, newPassword }));
    },
    face,
    loginWithFace: async (beforeEnter) => {
      const key = await unlockFaceKey(face.label);
      let r;
      try {
        r = await api.deviceLogin({ deviceId: key.id, secret: key.secret });
      } catch (err) {
        if (err instanceof ApiError && err.status === 401) {
          await clearFaceKey();
          await reloadFace();
        }
        throw err;
      }
      await beforeEnter?.();
      await accept(r);
    },
    registerWithFace: async (name, email, beforeEnter) => {
      await confirmFace(`Use ${face.label} to protect your Huddle account`);
      const r = await api.deviceRegister({ name, email, deviceName: deviceName() });
      await saveFaceKey(r.device, { userId: r.user!.id, name: r.user!.name, email: r.user!.email }, face.label);
      await reloadFace();
      await beforeEnter?.();
      await accept(r as AuthResponse);
    },
    enableFace: async () => {
      const u = session?.user;
      if (!u) return;
      await confirmFace(`Turn on ${face.label} sign-in`);
      const r = await api.deviceRegister({ deviceName: deviceName() });
      await saveFaceKey(r.device, { userId: u.id, name: u.name, email: u.email }, face.label);
      await reloadFace();
    },
    disableFace: async () => {
      const meta = face.meta;
      // Only remove it from the server if it belongs to the account signed in here.
      if (meta && meta.userId === session?.user.id) await api.removeCredential(meta.deviceId);
      await clearFaceKey();
      await reloadFace();
    },
    refreshUser: async () => {
      const { user } = await api.me();
      setSession((s) => {
        const next = s ? { ...s, user } : s;
        if (next) void SecureStore.setItemAsync(KEY, JSON.stringify(next));
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
