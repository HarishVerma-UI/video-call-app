import WebSocket from 'ws';
import { createApp } from '../src/app.js';
import { createMemoryUserStore } from '../src/db/userStore.js';

export const TEST_SECRET = 'test-secret-0123456789-abcdefghijklmnopqrstuvwxyz';

export async function startTestApp(overrides = {}) {
  const store = overrides.store ?? createMemoryUserStore();
  const config = {
    port: 0,
    host: '127.0.0.1',
    maxPeersPerRoom: 3,
    webDist: '/nonexistent',
    allowedOrigins: ['*'],
    trustProxy: false,
    heartbeatMs: 60000,
    maxPayloadBytes: 64 * 1024,
    jwtSecret: TEST_SECRET,
    jwtExpiresInSec: 3600,
    ...overrides.config,
  };
  const app = createApp(config, { store });
  const addr = await app.listen(0, '127.0.0.1');
  const base = `127.0.0.1:${addr.port}`;
  return { app, store, base, http: `http://${base}`, config };
}

export async function api(base, method, path, body, token) {
  const res = await fetch(`http://${base}${path}`, {
    method,
    headers: {
      ...(body ? { 'Content-Type': 'application/json' } : {}),
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
    },
    body: body ? JSON.stringify(body) : undefined,
  });
  return { status: res.status, body: await res.json().catch(() => null), headers: res.headers };
}

let counter = 0;
/** Create an account and return { token, user }. */
export async function registerUser(base, name = 'Test User') {
  counter++;
  const res = await api(base, 'POST', '/api/auth/register', {
    name,
    email: `user${counter}-${Date.now()}@example.com`,
    password: 'correct-horse-1',
  });
  if (res.status !== 201) throw new Error(`register failed: ${JSON.stringify(res.body)}`);
  return res.body;
}

/** A WebSocket test client that records messages and lets tests await specific ones. */
export function wsClient(base) {
  const ws = new WebSocket(`ws://${base}/ws`);
  const inbox = [];
  const waiters = [];
  ws.on('message', (raw) => {
    const msg = JSON.parse(raw.toString());
    inbox.push(msg);
    for (const w of [...waiters]) {
      if (w.match(msg)) {
        waiters.splice(waiters.indexOf(w), 1);
        w.resolve(msg);
      }
    }
  });
  const opened = new Promise((r) => ws.once('open', r));
  return {
    ws,
    inbox,
    send: async (m) => {
      await opened;
      ws.send(typeof m === 'string' ? m : JSON.stringify(m));
    },
    next(type, pred = () => true, timeout = 2000) {
      const found = inbox.find((m) => m.type === type && pred(m));
      if (found) {
        inbox.splice(inbox.indexOf(found), 1);
        return Promise.resolve(found);
      }
      return new Promise((resolve, reject) => {
        const t = setTimeout(() => reject(new Error(`timed out waiting for ${type}`)), timeout);
        waiters.push({
          match: (m) => m.type === type && pred(m),
          resolve: (m) => {
            clearTimeout(t);
            inbox.splice(inbox.indexOf(m), 1);
            resolve(m);
          },
        });
      });
    },
    close: () => ws.close(),
  };
}

export const media = { audio: true, video: true, screen: false };
