import { Appearance } from 'react-native';
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

// Same identity as the web app: teal-blue, sunflower yellow, tomato red.
// The palette follows the phone's light/dark setting (read when the app starts).
const dark = {
  scheme: 'dark' as 'dark' | 'light',
  bg: '#0f2c3f',
  bg2: '#0b2232',
  surface: '#17405a',
  surface2: '#1f5170',
  border: 'rgba(253,246,227,0.11)',
  text: '#fdf6e3',
  muted: '#a9c4cf',
  accent: '#ffc93c',
  accentText: '#ffc93c',
  hot: '#f2542d',
  hotInk: '#0f2c3f',
  hotSoft: '#ffb4a2',
  cool: '#5ce1e6',
  amber: '#ffe08a',
  ink: '#0f2c3f',
  overlay: 'rgba(7,24,36,0.68)',
  onOverlay: '#fdf6e3',
  well: '#081c28',
  bladeA: '#215b7c',
  bladeB: '#163f58',
};
const light: typeof dark = {
  scheme: 'light',
  bg: '#f3f7f8',
  bg2: '#ffffff',
  surface: '#ffffff',
  surface2: '#e4edf0',
  border: 'rgba(15,44,63,0.12)',
  text: '#0f2c3f',
  muted: '#4d6876',
  accent: '#ffc93c',
  accentText: '#c2401c',
  hot: '#d9431f',
  hotInk: '#ffffff',
  hotSoft: '#b3321a',
  cool: '#08808a',
  amber: '#8a5a00',
  ink: '#0f2c3f',
  overlay: 'rgba(15,44,63,0.72)',
  onOverlay: '#ffffff',
  well: '#0f2c3f',
  bladeA: '#215b7c',
  bladeB: '#163f58',
};
const base = Appearance.getColorScheme() === 'light' ? light : dark;
export const theme = {
  ...base,
  // role aliases used across components
  peach: base.accent,
  coral: base.hot,
  mint: base.cool,
  violet: base.accent,
  cyan: base.cool,
  green: base.cool,
  red: base.hot,
};

/** TeX Gyre Adventor, bundled in assets/fonts and loaded in App.tsx. */
export const fonts = {
  regular: 'Adventor',
  bold: 'Adventor-Bold',
};
