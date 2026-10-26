import react from '@vitejs/plugin-react';
import { defineConfig } from 'vite';

// In development the web app runs on :5173 and the Node server on :3001.
// These proxies make /ws and /api look same-origin, so no CORS or URL juggling.
const SERVER = process.env.VITE_DEV_SERVER ?? 'http://localhost:3001';

export default defineConfig({
  plugins: [react()],
  server: {
    host: true, // expose on your LAN so phones/other laptops can open it
    port: 5173,
    proxy: {
      '/ws': { target: SERVER.replace(/^http/, 'ws'), ws: true },
      '/api': SERVER,
      '/health': SERVER,
    },
  },
  build: {
    outDir: 'dist',
    sourcemap: true,
  },
});
