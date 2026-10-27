import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url));

/**
 * Load server/.env if it exists. Real environment variables always win, so
 * production platforms that inject env vars are unaffected.
 */
function loadDotEnv(file) {
  let text;
  try {
    text = fs.readFileSync(file, 'utf8');
  } catch {
    return;
  }
  for (const raw of text.split(/\r?\n/)) {
    const line = raw.trim();
    if (!line || line.startsWith('#')) continue;
    const eq = line.indexOf('=');
    if (eq < 1) continue;
    const key = line.slice(0, eq).trim();
    let value = line.slice(eq + 1).trim();
    if ((value.startsWith('"') && value.endsWith('"')) || (value.startsWith("'") && value.endsWith("'"))) value = value.slice(1, -1);
    if (process.env[key] === undefined) process.env[key] = value;
  }
}
if (process.env.NODE_ENV !== 'test') loadDotEnv(path.resolve(here, '../.env'));

const isProd = process.env.NODE_ENV === 'production';

/** "7d", "12h", "30m" or plain seconds → seconds. */
function parseDuration(v, fallbackSec) {
  if (!v) return fallbackSec;
  const m = String(v).trim().match(/^(\d+)\s*([smhd]?)$/);
  if (!m) return fallbackSec;
  const n = Number(m[1]);
  return n * { '': 1, s: 1, m: 60, h: 3600, d: 86400 }[m[2]];
}

const DEV_SECRET = 'dev-only-insecure-secret-change-me-0123456789';

export const config = {
  isProd,
  port: Number(process.env.PORT ?? 3001),
  host: process.env.HOST ?? '0.0.0.0',
  /** Max people per room. Mesh calls get heavy past ~6; an SFU lifts this later. */
  maxPeersPerRoom: Number(process.env.MAX_PEERS ?? 6),
  /** Built web app to serve in production (`npm run build -w web`). */
  webDist: process.env.WEB_DIST ?? path.resolve(here, '../../web/dist'),
  /** Comma-separated list of allowed browser origins, or "*". */
  allowedOrigins: (process.env.ALLOWED_ORIGINS ?? '*').split(',').map((s) => s.trim()),
  /** Set when running behind a reverse proxy so rate limits see the real client IP. */
  trustProxy: process.env.TRUST_PROXY === 'true',
  heartbeatMs: Number(process.env.HEARTBEAT_MS ?? 30000),
  maxPayloadBytes: 64 * 1024,

  // --- database ---
  /** e.g. mongodb://localhost:27017 or a MongoDB Atlas mongodb+srv:// URI. */
  mongoUri: process.env.MONGODB_URI || '',
  mongoDb: process.env.MONGODB_DB ?? 'huddle',

  /** How long saved call chat is kept. */
  chatRetentionDays: Number(process.env.CHAT_RETENTION_DAYS ?? 30),
  /** Messages sent to someone when they join a room. */
  chatHistoryOnJoin: 50,

  // --- auth ---
  jwtSecret: process.env.JWT_SECRET || (isProd ? '' : DEV_SECRET),
  jwtExpiresInSec: parseDuration(process.env.JWT_EXPIRES_IN, 7 * 86400),
  usingDevSecret: !process.env.JWT_SECRET,
};

/** Fail fast on settings that would be unsafe in production. */
export function checkConfig(c = config) {
  const problems = [];
  if (c.isProd && !c.mongoUri) problems.push('MONGODB_URI is required in production.');
  if (!c.jwtSecret || c.jwtSecret.length < 32) problems.push('JWT_SECRET must be set to at least 32 random characters.');
  if (c.isProd && c.jwtSecret === DEV_SECRET) problems.push('JWT_SECRET must not be the development default.');
  return problems;
}
