import { DEFAULT_ICE_SERVERS } from '@vca/shared';

/**
 * Where the Node signaling server lives. A phone can't reach "localhost" on your
 * computer, so use your computer's LAN IP — the server prints it on startup:
 *
 *   EXPO_PUBLIC_SIGNALING_URL=ws://192.168.1.20:3001/ws npm run start -w mobile
 *
 * In production use wss:// (TLS).
 */
export const SIGNALING_URL: string = process.env.EXPO_PUBLIC_SIGNALING_URL ?? 'ws://192.168.1.10:3001/ws';

/** HTTP base of the same server (for room lookups). */
export const API_BASE = SIGNALING_URL.replace(/^ws/, 'http').replace(/\/ws$/, '');

export const ICE_SERVERS: RTCIceServer[] = (() => {
  const raw = process.env.EXPO_PUBLIC_ICE_SERVERS;
  if (!raw) return DEFAULT_ICE_SERVERS;
  try {
    return JSON.parse(raw);
  } catch {
    return DEFAULT_ICE_SERVERS;
  }
})();

// "Darkroom" palette, shared with the web app.
export const theme = {
  bg: '#1c1530',
  bg2: '#150f26',
  surface: '#2a2046',
  surface2: '#362a5a',
  border: 'rgba(246,239,231,0.10)',
  text: '#f6efe7',
  muted: '#b4a9c9',
  peach: '#ffb48f',
  coral: '#ff6a55',
  mint: '#8ee6c9',
  amber: '#ffd27a',
  ink: '#1c1530',
  // legacy names used by older components
  violet: '#ffb48f',
  cyan: '#8ee6c9',
  green: '#8ee6c9',
  red: '#ff6a55',
};

/** TeX Gyre Adventor, bundled in assets/fonts and loaded in App.tsx. */
export const fonts = {
  regular: 'Adventor',
  bold: 'Adventor-Bold',
};
