// HTTP layer: health check, a tiny REST API, and static hosting of the built web app.

import fs from 'node:fs';
import http from 'node:http';
import path from 'node:path';
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

function json(res, status, body) {
  res.writeHead(status, {
    'Content-Type': 'application/json; charset=utf-8',
    'Access-Control-Allow-Origin': '*',
    'Cache-Control': 'no-store',
  });
  res.end(JSON.stringify(body));
}

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

/** Create (but don't start) the HTTP + WebSocket server. */
export function createApp(config, log = () => {}) {
  const startedAt = Date.now();
  let signaling;

  const server = http.createServer((req, res) => {
    const url = new URL(req.url ?? '/', 'http://localhost');

    if (req.method === 'OPTIONS') {
      res.writeHead(204, {
        'Access-Control-Allow-Origin': '*',
        'Access-Control-Allow-Methods': 'GET, OPTIONS',
      });
      res.end();
      return;
    }
    if (url.pathname === '/health') {
      json(res, 200, { ok: true, uptimeSec: Math.round((Date.now() - startedAt) / 1000), ...signaling.stats() });
      return;
    }
    const roomMatch = url.pathname.match(/^\/api\/rooms\/([a-zA-Z0-9_-]{1,64})$/);
    if (roomMatch) {
      const size = signaling.roomSize(roomMatch[1].toLowerCase());
      json(res, 200, { roomId: roomMatch[1].toLowerCase(), participants: size, maxPeers: config.maxPeersPerRoom, full: size >= config.maxPeersPerRoom });
      return;
    }
    if (req.method !== 'GET' && req.method !== 'HEAD') {
      json(res, 405, { error: 'Method not allowed' });
      return;
    }
    serveStatic(res, config.webDist, decodeURIComponent(url.pathname === '/' ? '/index.html' : url.pathname));
  });

  signaling = attachSignaling(server, { ...config, log });

  return {
    server,
    listen: (port = config.port, host = config.host) =>
      new Promise((resolve) => server.listen(port, host, () => resolve(server.address()))),
    close: () =>
      new Promise((resolve) => {
        signaling.close();
        server.close(() => resolve());
      }),
  };
}
