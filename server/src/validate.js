// Input validation for every message a client can send.
// Anything that doesn't match returns null and is rejected with "bad-request".

const ROOM_ID = /^[a-zA-Z0-9_-]{1,64}$/;
const MAX_CHAT = 1000;
const MAX_SDP = 32 * 1024;

const isObj = (v) => v !== null && typeof v === 'object' && !Array.isArray(v);
const isBool = (v) => typeof v === 'boolean';

export function parseMedia(m) {
  if (!isObj(m) || !isBool(m.audio) || !isBool(m.video)) return null;
  return { audio: m.audio, video: m.video, screen: isBool(m.screen) ? m.screen : false };
}

function parseSignalData(d) {
  if (!isObj(d)) return null;
  if (isObj(d.sdp)) {
    const { type, sdp } = d.sdp;
    if (type !== 'offer' && type !== 'answer') return null;
    if (typeof sdp !== 'string' || sdp.length > MAX_SDP) return null;
    return { sdp: { type, sdp } };
  }
  if (isObj(d.candidate)) {
    const { candidate, sdpMid, sdpMLineIndex } = d.candidate;
    if (typeof candidate !== 'string' || candidate.length > 2048) return null;
    return {
      candidate: {
        candidate,
        sdpMid: typeof sdpMid === 'string' ? sdpMid : null,
        sdpMLineIndex: Number.isInteger(sdpMLineIndex) ? sdpMLineIndex : null,
      },
    };
  }
  return null;
}

/** Returns a clean, typed message or null if invalid. */
export function parseClientMessage(raw) {
  let msg;
  try {
    msg = JSON.parse(raw);
  } catch {
    return null;
  }
  if (!isObj(msg) || typeof msg.type !== 'string') return null;

  switch (msg.type) {
    case 'join': {
      if (typeof msg.roomId !== 'string' || !ROOM_ID.test(msg.roomId)) return null;
      // Who you are comes from the signed token, never from what the client claims.
      if (typeof msg.token !== 'string' || !msg.token || msg.token.length > 4096) return null;
      const media = parseMedia(msg.media) ?? { audio: false, video: false, screen: false };
      return { type: 'join', roomId: msg.roomId.toLowerCase(), token: msg.token, media };
    }
    case 'signal': {
      if (typeof msg.to !== 'string' || msg.to.length > 64) return null;
      const data = parseSignalData(msg.data);
      return data ? { type: 'signal', to: msg.to, data } : null;
    }
    case 'chat': {
      if (typeof msg.text !== 'string') return null;
      const text = msg.text.trim().slice(0, MAX_CHAT);
      return text ? { type: 'chat', text } : null;
    }
    case 'media-state': {
      const media = parseMedia(msg.media);
      return media ? { type: 'media-state', media } : null;
    }
    case 'leave':
      return { type: 'leave' };
    default:
      return null;
  }
}
