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

export const theme = {
  bg: '#0b0e14',
  bg2: '#111622',
  surface: '#161c29',
  surface2: '#1d2535',
  border: 'rgba(255,255,255,0.08)',
  text: '#eef1f6',
  muted: '#98a2b3',
  violet: '#8b5cf6',
  cyan: '#22d3ee',
  green: '#34d399',
  red: '#f43f5e',
  amber: '#fbbf24',
};
