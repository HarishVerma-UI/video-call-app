// HTTP layer: health check, a tiny REST API, and static hosting of the built web app.

import fs from 'node:fs';
import http from 'node:http';
import path from 'node:path';
import { createAuth } from './auth/auth.js';
import { createMemoryMessageStore } from './db/messageStore.js';
import { HttpError, sendJson } from './http.js';
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
 * @param {{ store: object, messages?: object, log?: Function }} deps  user + chat stores (MongoDB or memory)
 */
export function createApp(config, { store, messages = createMemoryMessageStore(), log = () => {} }) {
  const startedAt = Date.now();
  const auth = createAuth({
    store,
    jwtSecret: config.jwtSecret,
    jwtExpiresInSec: config.jwtExpiresInSec,
    trustProxy: config.trustProxy,
    log,
  });
  let signaling;

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
        'Access-Control-Allow-Methods': 'GET, POST, PATCH, OPTIONS',
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

    // Saved chat, page by page: GET /api/rooms/:id/messages?before=<ms>&limit=<n>
    const msgMatch = path.match(/^\/api\/rooms\/([a-zA-Z0-9_-]{1,64})\/messages$/);
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
      sendJson(res, 200, { roomId, participants: size, maxPeers: config.maxPeersPerRoom, full: size >= config.maxPeersPerRoom });
      return;
    }
    if (path.startsWith('/api/')) throw new HttpError(404, 'Not found');
    if (req.method !== 'GET' && req.method !== 'HEAD') throw new HttpError(405, 'Method not allowed');
    serveStatic(res, config.webDist, decodeURIComponent(path === '/' ? '/index.html' : path));
  }

  const server = http.createServer((req, res) => {
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

  signaling = attachSignaling(server, { ...config, log, userFromToken: auth.userFromToken, messages });

  return {
    server,
    listen: (port = config.port, host = config.host) =>
      new Promise((resolve) => server.listen(port, host, () => resolve(server.address()))),
    close: () =>
      new Promise((resolve) => {
        signaling.close();
        auth.close();
        server.close(() => resolve());
      }),
  };
}
