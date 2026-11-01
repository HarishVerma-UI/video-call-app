// Starts the Huddle server on port 3210 with in-memory stores.
// Used by Playwright's webServer config and can also be run standalone.

import { createApp } from '../server/src/app.js';
import { createMemoryUserStore } from '../server/src/db/userStore.js';
import { createMemoryMessageStore } from '../server/src/db/messageStore.js';
import { createMemoryActivityStore } from '../server/src/db/activityStore.js';
import { createMemorySocialStores } from '../server/src/db/socialStore.js';

const PORT = Number(process.env.E2E_PORT) || 3210;

const store = createMemoryUserStore();
const messages = createMemoryMessageStore();
const activity = createMemoryActivityStore();
const social = createMemorySocialStores();

const config = {
  port: PORT,
  host: '127.0.0.1',
  maxPeersPerRoom: 4,
  webDist: new URL('../web/dist', import.meta.url).pathname,
  allowedOrigins: ['*'],
  trustProxy: false,
  heartbeatMs: 60_000,
  maxPayloadBytes: 64 * 1024,
  jwtSecret: 'e2e-test-secret-0123456789-abcdefghijklmnopqrstuvwxyz',
  jwtExpiresInSec: 3600,
  registerRateLimit: 500,
};

const app = createApp(config, {
  store,
  messages,
  activity,
  social,
  log: (...args) => console.log('[server]', ...args),
});

const addr = await app.listen(PORT, '127.0.0.1');
console.log(`E2E server listening on http://127.0.0.1:${addr.port}`);

process.on('SIGTERM', () => app.close().then(() => process.exit(0)));
process.on('SIGINT', () => app.close().then(() => process.exit(0)));
