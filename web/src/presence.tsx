import { createContext, useCallback, useContext, useEffect, useRef, type ReactNode } from 'react';
import { useAuth } from './auth/AuthContext';
import { SIGNALING_URL } from './config';

/** A message pushed over the presence channel (notifications, call invites, …). */
export interface PresenceMessage {
  type: string;
  [key: string]: unknown;
}
type Handler = (msg: PresenceMessage) => void;

interface PresenceApi {
  /** Subscribe to a message type; returns an unsubscribe function. */
  subscribe: (type: string, fn: Handler) => () => void;
  /** Send a message to the server over the presence socket. */
  send: (msg: unknown) => void;
}

const Ctx = createContext<PresenceApi | null>(null);

/**
 * Keeps one persistent WebSocket open while signed in, so the user can receive
 * live notifications and call invites wherever they are in the app. Reconnects
 * with exponential backoff. Separate from the per-call CallClient connection.
 */
export function PresenceProvider({ children }: { children: ReactNode }) {
  const { token, status } = useAuth();
  const wsRef = useRef<WebSocket | null>(null);
  const handlers = useRef(new Map<string, Set<Handler>>());

  const emit = useCallback((msg: PresenceMessage) => {
    const set = handlers.current.get(msg.type);
    if (set) for (const fn of set) fn(msg);
  }, []);

  useEffect(() => {
    if (status !== 'signed-in' || !token) return;
    let closed = false;
    let retry = 0;
    let timer: ReturnType<typeof setTimeout> | undefined;

    const schedule = () => {
      if (closed) return;
      const delay = Math.min(1000 * 2 ** retry, 15000);
      retry++;
      timer = setTimeout(connect, delay + Math.random() * 500);
    };
    function connect() {
      if (closed) return;
      let ws: WebSocket;
      try {
        ws = new WebSocket(SIGNALING_URL);
      } catch {
        schedule();
        return;
      }
      wsRef.current = ws;
      ws.onopen = () => {
        retry = 0;
        ws.send(JSON.stringify({ type: 'hello', token }));
      };
      ws.onmessage = (e) => {
        try {
          emit(JSON.parse(e.data) as PresenceMessage);
        } catch {
          /* ignore malformed frames */
        }
      };
      ws.onclose = () => {
        if (wsRef.current === ws) wsRef.current = null;
        schedule();
      };
      ws.onerror = () => {
        try {
          ws.close();
        } catch {
          /* ignore */
        }
      };
    }
    connect();

    return () => {
      closed = true;
      if (timer) clearTimeout(timer);
      const ws = wsRef.current;
      wsRef.current = null;
      if (ws) {
        ws.onclose = null;
        try {
          ws.close();
        } catch {
          /* ignore */
        }
      }
    };
  }, [status, token, emit]);

  const subscribe = useCallback((type: string, fn: Handler) => {
    let set = handlers.current.get(type);
    if (!set) {
      set = new Set();
      handlers.current.set(type, set);
    }
    set.add(fn);
    return () => {
      set?.delete(fn);
    };
  }, []);

  const send = useCallback((msg: unknown) => {
    const ws = wsRef.current;
    if (ws && ws.readyState === WebSocket.OPEN) ws.send(JSON.stringify(msg));
  }, []);

  return <Ctx.Provider value={{ subscribe, send }}>{children}</Ctx.Provider>;
}

export function usePresence(): PresenceApi {
  const ctx = useContext(Ctx);
  if (!ctx) throw new Error('usePresence must be used within a PresenceProvider');
  return ctx;
}
