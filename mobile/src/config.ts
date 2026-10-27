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

// "Kodachrome" film stock, the default palette shared with the web app
// (the web app also offers Cyanotype, Velvia and Darkroom).
export const theme = {
  bg: '#0f2c3f',
  bg2: '#0b2232',
  surface: '#17405a',
  surface2: '#1f5170',
  border: 'rgba(253,246,227,0.11)',
  text: '#fdf6e3',
  muted: '#a9c4cf',
  accent: '#ffc93c',
  hot: '#f2542d',
  cool: '#5ce1e6',
  amber: '#ffe08a',
  ink: '#0f2c3f',
  overlay: 'rgba(7,24,36,0.68)',
  bladeA: '#215b7c',
  bladeB: '#163f58',
  // role aliases used across components
  peach: '#ffc93c',
  coral: '#f2542d',
  mint: '#5ce1e6',
  violet: '#ffc93c',
  cyan: '#5ce1e6',
  green: '#5ce1e6',
  red: '#f2542d',
};

/** TeX Gyre Adventor, bundled in assets/fonts and loaded in App.tsx. */
export const fonts = {
  regular: 'Adventor',
  bold: 'Adventor-Bold',
};
