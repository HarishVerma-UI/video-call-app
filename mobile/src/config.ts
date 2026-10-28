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

// Same look as the web app: calm indigo for actions, a warm amber "spark" for
// what's live or selected. Follows the phone's light/dark setting.
const dark = {
  scheme: 'dark' as 'dark' | 'light',
  bg: '#13121a',
  bg2: '#1c1b25',
  chrome: '#0c0b11',
  surface: '#1c1b25',
  surface2: '#252430',
  border: '#2f2e3c',
  text: '#f3f2f8',
  muted: '#aaa8bf',
  faint: '#757389',
  /** Primary buttons (white text). */
  primary: '#5b5fc7',
  primaryText: '#9a9dff',
  primarySoft: 'rgba(154,157,255,0.15)',
  onPrimary: '#ffffff',
  /** The amber spark: brand mark, active tab, "live". Dark ink on top. */
  accent: '#ffb547',
  accentText: '#ffc76e',
  sparkSoft: 'rgba(255,181,71,0.14)',
  live: '#4cc38a',
  liveSoft: 'rgba(76,195,138,0.16)',
  hot: '#c4314b',
  hotInk: '#ffffff',
  hotSoft: '#ff8f93',
  cool: '#4cc38a',
  amber: '#ffc76e',
  ink: '#24233a',
  overlay: 'rgba(0,0,0,0.6)',
  onOverlay: '#ffffff',
  well: '#0d0c13',
  bubbleMine: '#34356b',
  bubble: '#262533',
  bladeA: '#4d51b9',
  bladeB: '#1f2050',
};
const light: typeof dark = {
  scheme: 'light',
  bg: '#f5f5f9',
  bg2: '#ffffff',
  chrome: '#ebebf2',
  surface: '#ffffff',
  surface2: '#f2f2f7',
  border: '#e1e1ea',
  text: '#1e1d2a',
  muted: '#5e5d72',
  faint: '#9493a6',
  primary: '#5b5fc7',
  primaryText: '#5054c0',
  primarySoft: '#ebebfc',
  onPrimary: '#ffffff',
  accent: '#f5a524',
  accentText: '#9a5b00',
  sparkSoft: '#fff3df',
  live: '#13834a',
  liveSoft: '#e3f5ea',
  hot: '#c4314b',
  hotInk: '#ffffff',
  hotSoft: '#c4314b',
  cool: '#13834a',
  amber: '#9a5b00',
  ink: '#24233a',
  overlay: 'rgba(0,0,0,0.6)',
  onOverlay: '#ffffff',
  well: '#1d1c27',
  bubbleMine: '#e3e3fb',
  bubble: '#ffffff',
  bladeA: '#7c80e6',
  bladeB: '#3d40a6',
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
