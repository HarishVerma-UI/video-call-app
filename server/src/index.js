import os from 'node:os';
import { createApp } from './app.js';
import { checkConfig, config } from './config.js';
import { connectMongoUserStore, createMemoryUserStore } from './db/userStore.js';

const log = (...args) => console.log(new Date().toISOString().slice(11, 19), ...args);

const problems = checkConfig();
if (problems.length) {
  console.error(`\n  Cannot start:\n${problems.map((p) => `   • ${p}`).join('\n')}\n`);
  process.exit(1);
}

let store;
if (config.mongoUri) {
  try {
    store = await connectMongoUserStore(config.mongoUri, config.mongoDb, log);
  } catch (err) {
    console.error(`\n  Could not connect to MongoDB at ${config.mongoUri.replace(/\/\/[^@]*@/, '//***@')}`);
    console.error(`  ${err.message}\n  Is it running? Try:  docker compose up -d mongo\n`);
    process.exit(1);
  }
} else {
  store = createMemoryUserStore();
}

const app = createApp(config, { store, log });
await app.listen();

const lanIps = Object.values(os.networkInterfaces())
  .flat()
  .filter((i) => i && i.family === 'IPv4' && !i.internal)
  .map((i) => i.address);

console.log(`
  Huddle server running
  ─────────────────────
  Local:      http://localhost:${config.port}
  WebSocket:  ws://localhost:${config.port}/ws
${lanIps.map((ip) => `  Network:    http://${ip}:${config.port}   (phone: ws://${ip}:${config.port}/ws)`).join('\n')}
  Database:   ${store.kind === 'mongodb' ? `MongoDB (${config.mongoDb})` : 'IN-MEMORY — accounts are lost on restart. Set MONGODB_URI to persist.'}
  Max people per room: ${config.maxPeersPerRoom}
${config.usingDevSecret ? '  ⚠  Using the development JWT secret. Set JWT_SECRET before deploying.\n' : ''}`);

const shutdown = async () => {
  console.log('\nShutting down…');
  await app.close();
  await store.close();
  process.exit(0);
};
process.on('SIGINT', shutdown);
process.on('SIGTERM', shutdown);
