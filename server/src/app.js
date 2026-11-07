// HTTP layer: health check, a tiny REST API, and static hosting of the built web app.

import fs from 'node:fs';
import http from 'node:http';
import path from 'node:path';
import { createAuth } from './auth/auth.js';
import { createAdmin } from './auth/admin.js';
import { createMemoryActivityStore } from './db/activityStore.js';
import { createMemoryMessageStore } from './db/messageStore.js';
import { createMemorySocialStores } from './db/socialStore.js';
import { createMedia } from './media.js';
import { createSocial } from './social.js';
import { HttpError, readJson, sendJson } from './http.js';
import { createRateLimiter } from './auth/rateLimit.js';
import { createLogStore } from './logStore.js';
import { attachSignaling } from './signaling.js';

const MIME = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'application/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.ico': 'image/x-icon',
  '.webmanifest': 'application/manifest+json',
  '.otf': 'font/otf',
  '.woff2': 'font/woff2',
  '.map': 'application/json',
  '.txt': 'text/plain; charset=utf-8',
};

function serveStatic(res, webDist, urlPath) {
  const indexFile = path.join(webDist, 'index.html');
  let filePath = path.join(webDist, path.normalize(urlPath));
  if (!filePath.startsWith(webDist)) filePath = indexFile;

  fs.stat(filePath, (err, st) => {
    // Unknown paths (e.g. /r/swift-comet-482) fall back to the SPA.
    const target = !err && st.isFile() ? filePath : indexFile;
    fs.readFile(target, (err2, data) => {
      if (err2) {
        res.writeHead(404, { 'Content-Type': 'text/plain' });
        res.end('Web app not built. Run `npm run build` (or use `npm run dev` for development).');
        return;
      }
      const ext = path.extname(target).toLowerCase();
      const immutable = target.includes(`${path.sep}assets${path.sep}`);
      res.writeHead(200, {
        'Content-Type': MIME[ext] ?? 'application/octet-stream',
        'Cache-Control': immutable ? 'public, max-age=31536000, immutable' : 'no-cache',
      });
      res.end(data);
    });
  });
}

/**
 * Create (but don't start) the HTTP + WebSocket server.
 * @param {object} config see config.js
 * @param {{ store: object, messages?: object, activity?: object, log?: Function }} deps
 *   users, saved chat, call history (MongoDB or memory)
 */
export function createApp(
  config,
  {
    store,
    messages = createMemoryMessageStore(),
    activity = createMemoryActivityStore(),
    social = createMemorySocialStores(),
    log = () => {},
  },
) {
  const startedAt = Date.now();
  const logStore = createLogStore();
  log = logStore.wrapLog(log); // capture every log line for the /logs UI
  const chatPosts = createRateLimiter({ limit: 5, windowMs: 5000 });
  const onRegister = async (user) => {
    await social.profiles.upsert(user.id, { name: user.name });
    log(`social auto-profile created for ${user.id}`);
  };
  const auth = createAuth({
    store,
    allowedOrigins: config.allowedOrigins,
    oauth: config.oauth,
    appUrl: config.appUrl,
    jwtSecret: config.jwtSecret,
    jwtExpiresInSec: config.jwtExpiresInSec,
    trustProxy: config.trustProxy,
    registerRateLimit: config.registerRateLimit,
    onRegister,
    log,
  });
  const getStats = () => ({
    activeCalls: signaling ? signaling.stats() : { rooms: 0, participants: 0 },
    activeRooms: signaling ? signaling.activeRooms() : [],
    uptimeSec: Math.round((Date.now() - startedAt) / 1000),
  });
  const admin = createAdmin({ store, requireUser: auth.requireUser, log, getStats, onRegister, social });
  const media = createMedia(config.s3 ?? {}, log);
  let signaling;
  // Late-bound: signaling is created below, but social only calls notify at request time.
  const notify = (userId, payload) => signaling?.notifyUser(userId, payload) ?? 0;
  const socialApi = createSocial({ ...social, users: store, media, requireUser: auth.requireUser, notify, log });

  const cors = (req) => {
    const origin = req.headers.origin;
    if (!origin) return {};
    const allowed = config.allowedOrigins.includes('*') || config.allowedOrigins.includes(origin);
    return allowed ? { 'Access-Control-Allow-Origin': origin, Vary: 'Origin' } : {};
  };

  async function route(req, res) {
    const url = new URL(req.url ?? '/', 'http://localhost');
    const path = url.pathname;

    if (req.method === 'OPTIONS') {
      res.writeHead(204, {
        ...cors(req),
        'Access-Control-Allow-Methods': 'GET, POST, PATCH, DELETE, OPTIONS',
        'Access-Control-Allow-Headers': 'Authorization, Content-Type',
        'Access-Control-Max-Age': '600',
      });
      res.end();
      return;
    }
    if (path === '/health') {
      let db = 'ok';
      try {
        await store.ping();
      } catch {
        db = 'down';
      }
      sendJson(res, db === 'ok' ? 200 : 503, {
        ok: db === 'ok',
        db,
        store: store.kind,
        uptimeSec: Math.round((Date.now() - startedAt) / 1000),
        ...signaling.stats(),
      });
      return;
    }
    if (await auth.handle(req, res, path)) return;
    if (await admin.handle(req, res, path, url)) return;
    if (await media.handleLocal(req, res, url)) return;
    if (await socialApi.handle(req, res, path, url)) return;

    // Server logs (admin only): GET /api/logs?since=&level=&q=&limit=
    if (path === '/api/logs' && req.method === 'GET') {
      const user = await auth.requireUser(req);
      if (user.role !== 'admin') throw new HttpError(403, 'Admin access required.');
      const since = url.searchParams.has('since') ? Number(url.searchParams.get('since')) : undefined;
      const level = url.searchParams.get('level') || undefined;
      const q = url.searchParams.get('q') || undefined;
      const limit = Number(url.searchParams.get('limit') || 200) || 200;
      sendJson(res, 200, { logs: logStore.query({ since, level, q, limit }) });
      return;
    }

    // Community stats shown on the home feed (any signed-in user).
    if (path === '/api/stats' && req.method === 'GET') {
      await auth.requireUser(req);
      let totalUsers = 0;
      try {
        totalUsers = await store.count();
      } catch (err) {
        log('user count failed', err);
      }
      sendJson(res, 200, { totalUsers, online: signaling ? signaling.stats().participants : 0 });
      return;
    }

    // Calls tab: your recent calls, newest first.
    if (path === '/api/calls' && req.method === 'GET') {
      const user = await auth.requireUser(req);
      sendJson(res, 200, { calls: await activity.recentCalls(user.id, Number(url.searchParams.get('limit') ?? 30)) });
      return;
    }

    // Chat tab: rooms you've been in, with the last message and who's in the call now.
    if (path === '/api/chats' && req.method === 'GET') {
      const user = await auth.requireUser(req);
      const rooms = await activity.recentRooms(user.id, 40);
      const chats = await Promise.all(
        rooms.map(async (r) => {
          const { messages: last } = await messages.recent(r.roomId, { limit: 1 });
          const lastMessage = last[0] ? { userId: last[0].userId, name: last[0].name, text: last[0].text, ts: last[0].ts } : null;
          return { roomId: r.roomId, lastActiveAt: r.lastActiveAt, lastMessage, inCall: signaling.roomPeople(r.roomId) };
        }),
      );
      // Latest activity first: a new message moves a chat to the top.
      const at = (c) => Math.max(new Date(c.lastActiveAt).getTime(), c.lastMessage?.ts ?? 0);
      chats.sort((a, b) => at(b) - at(a));
      sendJson(res, 200, { chats });
      return;
    }

    // Saved chat, page by page: GET /api/rooms/:id/messages?before=<ms>&limit=<n>
    // Send from the Chat tab (outside a call): POST /api/rooms/:id/messages { text }
    const msgMatch = path.match(/^\/api\/rooms\/([a-zA-Z0-9_-]{1,64})\/messages$/);
    if (msgMatch && req.method === 'POST') {
      const user = await auth.requireUser(req);
      const roomId = msgMatch[1].toLowerCase();
      const body = await readJson(req);
      const text = typeof body.text === 'string' ? body.text.trim().slice(0, 1000) : '';
      if (!text) throw new HttpError(400, 'Write a message first.');
      const limited = chatPosts.hit(user.id);
      if (!limited.ok) throw new HttpError(429, 'You’re sending messages too fast.', { retryAfterSec: limited.retryAfterSec });
      const saved = await messages.add({ roomId, userId: user.id, name: user.name, text });
      signaling.broadcastChat(roomId, saved);
      await activity.touchRoom(user.id, roomId);
      sendJson(res, 201, { message: { id: saved.id, userId: saved.userId, from: '', name: saved.name, text: saved.text, ts: saved.ts } });
      return;
    }
    if (msgMatch && req.method === 'GET') {
      await auth.requireUser(req);
      const before = url.searchParams.has('before') ? Number(url.searchParams.get('before')) : undefined;
      if (before !== undefined && !Number.isFinite(before)) throw new HttpError(400, 'Invalid "before".');
      const limit = Number(url.searchParams.get('limit') ?? 50) || 50;
      sendJson(res, 200, await messages.recent(msgMatch[1].toLowerCase(), { before, limit }));
      return;
    }

    const roomMatch = path.match(/^\/api\/rooms\/([a-zA-Z0-9_-]{1,64})$/);
    if (roomMatch && req.method === 'GET') {
      await auth.requireUser(req);
      const roomId = roomMatch[1].toLowerCase();
      const size = signaling.roomSize(roomId);
      sendJson(res, 200, {
        roomId,
        participants: size,
        people: signaling.roomPeople(roomId).map((p) => p.name),
        maxPeers: config.maxPeersPerRoom,
        full: size >= config.maxPeersPerRoom,
      });
      return;
    }
    if (path.startsWith('/api/')) throw new HttpError(404, 'Not found');
    if (req.method !== 'GET' && req.method !== 'HEAD') throw new HttpError(405, 'Method not allowed');
    serveStatic(res, config.webDist, decodeURIComponent(path === '/' ? '/index.html' : path));
  }

  const server = http.createServer((req, res) => {
    // Security headers on every response
    res.setHeader('X-Content-Type-Options', 'nosniff');
    res.setHeader('X-Frame-Options', 'DENY');
    res.setHeader('X-XSS-Protection', '0');
    res.setHeader('Referrer-Policy', 'strict-origin-when-cross-origin');
    for (const [k, v] of Object.entries(cors(req))) res.setHeader(k, v);
    route(req, res).catch((err) => {
      if (res.headersSent) return res.end();
      if (err instanceof HttpError) {
        const { closeConnection, ...extra } = err.extra;
        const headers = {
          ...(extra.retryAfterSec ? { 'Retry-After': String(extra.retryAfterSec) } : {}),
          ...(closeConnection ? { Connection: 'close' } : {}),
        };
        sendJson(res, err.status, { error: err.message, ...extra }, headers);
      } else {
        log('unhandled error', err);
        sendJson(res, 500, { error: 'Something went wrong on our side.' });
      }
    });
  });

  signaling = attachSignaling(server, { ...config, log, userFromToken: auth.userFromToken, messages, activity });

  return {
    server,
    listen: (port = config.port, host = config.host) =>
      new Promise((resolve) => server.listen(port, host, () => resolve(server.address()))),
    close: () =>
      new Promise((resolve) => {
        signaling.close();
        auth.close();
        chatPosts.close();
        server.close(() => resolve());
      }),
  };
}
