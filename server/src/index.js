import os from 'node:os';
import { createApp } from './app.js';
import { config } from './config.js';

const log = (...args) => console.log(new Date().toISOString().slice(11, 19), ...args);
const app = createApp(config, log);

await app.listen();

const lanIps = Object.values(os.networkInterfaces())
  .flat()
  .filter((i) => i && i.family === 'IPv4' && !i.internal)
  .map((i) => i.address);

console.log(`
  Video call server running
  ─────────────────────────
  Local:      http://localhost:${config.port}
  WebSocket:  ws://localhost:${config.port}/ws
${lanIps.map((ip) => `  Network:    http://${ip}:${config.port}   (use ws://${ip}:${config.port}/ws on your phone)`).join('\n')}
  Max people per room: ${config.maxPeersPerRoom}
`);

const shutdown = async () => {
  console.log('\nShutting down…');
  await app.close();
  process.exit(0);
};
process.on('SIGINT', shutdown);
process.on('SIGTERM', shutdown);
