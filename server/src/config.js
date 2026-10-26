import path from 'node:path';
import { fileURLToPath } from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url));

export const config = {
  port: Number(process.env.PORT ?? 3001),
  host: process.env.HOST ?? '0.0.0.0',
  /** Max people per room. Mesh calls get heavy past ~6; an SFU lifts this later. */
  maxPeersPerRoom: Number(process.env.MAX_PEERS ?? 6),
  /** Built web app to serve in production (`npm run build -w web`). */
  webDist: process.env.WEB_DIST ?? path.resolve(here, '../../web/dist'),
  /** Comma-separated list of allowed browser origins for the WebSocket, or "*". */
  allowedOrigins: (process.env.ALLOWED_ORIGINS ?? '*').split(',').map((s) => s.trim()),
  heartbeatMs: Number(process.env.HEARTBEAT_MS ?? 30000),
  maxPayloadBytes: 64 * 1024,
};
