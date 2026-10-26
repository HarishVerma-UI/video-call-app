// Signaling protocol shared by the server, web and mobile clients.
// Every message is one JSON object sent over the WebSocket at /ws.

export const MAX_NAME_LENGTH = 40;
export const MAX_ROOM_ID_LENGTH = 64;
export const MAX_CHAT_LENGTH = 1000;
export const ROOM_ID_PATTERN = /^[a-zA-Z0-9_-]{1,64}$/;

/** What a participant is currently sending. */
export interface MediaState {
  audio: boolean;
  video: boolean;
  screen: boolean;
}

/** A participant as described by the server. */
export interface PeerInfo {
  /** Connection id (one per device/tab). */
  id: string;
  /** Account id from the database. */
  userId: string;
  name: string;
  media: MediaState;
}

/** Opaque WebRTC payload relayed between two peers. */
export type SignalData =
  | { sdp: { type: 'offer' | 'answer'; sdp?: string } }
  | { candidate: { candidate: string; sdpMid?: string | null; sdpMLineIndex?: number | null } };

// ---- client → server -------------------------------------------------------
export type ClientMessage =
  | { type: 'join'; roomId: string; token: string; media: MediaState }
  | { type: 'signal'; to: string; data: SignalData }
  | { type: 'chat'; text: string }
  | { type: 'media-state'; media: MediaState }
  | { type: 'leave' };

// ---- server → client -------------------------------------------------------
export interface ChatMessage {
  id: string;
  from: string;
  name: string;
  text: string;
  ts: number;
}

export type ErrorCode = 'room-full' | 'bad-request' | 'not-joined' | 'already-joined' | 'unauthorized';

export type ServerMessage =
  | { type: 'welcome'; selfId: string; roomId: string; peers: PeerInfo[]; maxPeers: number }
  | { type: 'peer-joined'; peer: PeerInfo }
  | { type: 'peer-left'; id: string }
  | { type: 'signal'; from: string; data: SignalData }
  | { type: 'chat'; message: ChatMessage }
  | { type: 'media-state'; id: string; media: MediaState }
  | { type: 'error'; code: ErrorCode; message: string };
