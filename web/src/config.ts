import { DEFAULT_ICE_SERVERS } from '@vca/shared';

/** WebSocket URL of the signaling server. Defaults to the same host the page came from. */
export const SIGNALING_URL: string =
  import.meta.env.VITE_SIGNALING_URL ??
  `${location.protocol === 'https:' ? 'wss' : 'ws'}://${location.host}/ws`;

/** REST API base. Empty = same origin (Vite proxies /api to the server in development). */
export const API_BASE: string = import.meta.env.VITE_API_URL ?? '';

/** Optional JSON array of ICE servers (add your TURN server here in Step 2). */
export const ICE_SERVERS: RTCIceServer[] = (() => {
  const raw = import.meta.env.VITE_ICE_SERVERS;
  if (!raw) return DEFAULT_ICE_SERVERS;
  try {
    return JSON.parse(raw);
  } catch {
    console.warn('VITE_ICE_SERVERS is not valid JSON; using defaults');
    return DEFAULT_ICE_SERVERS;
  }
})();

export const roomUrl = (roomId: string) => `${location.origin}/r/${encodeURIComponent(roomId)}`;
