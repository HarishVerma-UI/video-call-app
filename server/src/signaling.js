// WebSocket signaling: rooms, peer discovery, targeted relay, chat and media state.
//
// The server never touches audio/video. It only:
//   - keeps track of who is in which room,
//   - forwards WebRTC offers/answers/ICE candidates to ONE specific peer,
//   - broadcasts chat messages and mute/camera state to the room.

import { randomUUID } from 'node:crypto';
import { WebSocketServer } from 'ws';
import { parseClientMessage } from './validate.js';

const CHAT_BURST = 5; // messages
const CHAT_WINDOW_MS = 5000;

/**
 * @param {import('node:http').Server} httpServer
 * @param {{ maxPeersPerRoom: number, heartbeatMs: number, maxPayloadBytes: number, allowedOrigins: string[], log?: (...a: any[]) => void }} options
 */
export function attachSignaling(httpServer, options) {
  const log = options.log ?? (() => {});
  /** @type {Map<string, Map<string, Client>>} roomId -> (clientId -> client) */
  const rooms = new Map();

  const wss = new WebSocketServer({
    server: httpServer,
    path: '/ws',
    maxPayload: options.maxPayloadBytes,
    verifyClient: ({ origin }) => {
      if (options.allowedOrigins.includes('*')) return true;
      // Native mobile apps don't send an Origin header.
      return !origin || options.allowedOrigins.includes(origin);
    },
  });

  /**
   * @typedef {{ id: string, ws: import('ws').WebSocket, roomId: string | null, name: string,
   *   media: { audio: boolean, video: boolean, screen: boolean }, chatTimes: number[] }} Client
   */

  const send = (client, msg) => {
    if (client.ws.readyState === client.ws.OPEN) client.ws.send(JSON.stringify(msg));
  };
  const broadcast = (roomId, msg, exceptId) => {
    const room = rooms.get(roomId);
    if (!room) return;
    for (const c of room.values()) if (c.id !== exceptId) send(c, msg);
  };
  const peerInfo = (c) => ({ id: c.id, name: c.name, media: c.media });

  function leaveRoom(client) {
    const roomId = client.roomId;
    if (!roomId) return;
    const room = rooms.get(roomId);
    client.roomId = null;
    if (!room) return;
    room.delete(client.id);
    broadcast(roomId, { type: 'peer-left', id: client.id });
    if (room.size === 0) rooms.delete(roomId);
    log(`leave  room=${roomId} id=${client.id.slice(0, 8)} size=${room.size}`);
  }

  wss.on('connection', (ws) => {
    /** @type {Client} */
    const client = {
      id: randomUUID(),
      ws,
      roomId: null,
      name: '',
      media: { audio: false, video: false, screen: false },
      chatTimes: [],
    };

    ws.on('message', (raw) => {
      const msg = parseClientMessage(raw.toString());
      if (!msg) {
        send(client, { type: 'error', code: 'bad-request', message: 'Invalid message.' });
        return;
      }

      if (msg.type === 'join') {
        if (client.roomId) {
          send(client, { type: 'error', code: 'already-joined', message: 'Already in a room.' });
          return;
        }
        let room = rooms.get(msg.roomId);
        if (room && room.size >= options.maxPeersPerRoom) {
          send(client, {
            type: 'error',
            code: 'room-full',
            message: `This room is full (max ${options.maxPeersPerRoom} people).`,
          });
          return;
        }
        if (!room) {
          room = new Map();
          rooms.set(msg.roomId, room);
        }
        const existing = [...room.values()].map(peerInfo);
        client.roomId = msg.roomId;
        client.name = msg.name;
        client.media = msg.media;
        room.set(client.id, client);

        send(client, {
          type: 'welcome',
          selfId: client.id,
          roomId: msg.roomId,
          peers: existing,
          maxPeers: options.maxPeersPerRoom,
        });
        broadcast(msg.roomId, { type: 'peer-joined', peer: peerInfo(client) }, client.id);
        log(`join   room=${msg.roomId} id=${client.id.slice(0, 8)} name="${client.name}" size=${room.size}`);
        return;
      }

      if (!client.roomId) {
        send(client, { type: 'error', code: 'not-joined', message: 'Join a room first.' });
        return;
      }
      const room = rooms.get(client.roomId);

      switch (msg.type) {
        case 'signal': {
          const target = room?.get(msg.to);
          if (target) send(target, { type: 'signal', from: client.id, data: msg.data });
          return;
        }
        case 'chat': {
          const now = Date.now();
          client.chatTimes = client.chatTimes.filter((t) => now - t < CHAT_WINDOW_MS);
          if (client.chatTimes.length >= CHAT_BURST) return; // silently drop floods
          client.chatTimes.push(now);
          const message = { id: randomUUID(), from: client.id, name: client.name, text: msg.text, ts: now };
          broadcast(client.roomId, { type: 'chat', message }); // includes sender, as confirmation
          return;
        }
        case 'media-state': {
          client.media = msg.media;
          broadcast(client.roomId, { type: 'media-state', id: client.id, media: msg.media }, client.id);
          return;
        }
        case 'leave': {
          leaveRoom(client);
          return;
        }
      }
    });

    ws.on('close', () => leaveRoom(client));
    ws.on('error', () => leaveRoom(client));
  });

  // Drop connections that stopped answering pings (closed laptop, lost network…).
  const heartbeat = setInterval(() => {
    for (const ws of wss.clients) {
      const c = /** @type {any} */ (ws);
      if (c.__dead) continue;
      if (c.__alive === false) {
        c.__dead = true;
        ws.terminate();
        continue;
      }
      c.__alive = false;
      ws.ping();
    }
  }, options.heartbeatMs);
  wss.on('connection', (ws) => {
    const c = /** @type {any} */ (ws);
    c.__alive = true;
    ws.on('pong', () => (c.__alive = true));
  });
  wss.on('close', () => clearInterval(heartbeat));

  return {
    wss,
    stats: () => ({
      rooms: rooms.size,
      participants: [...rooms.values()].reduce((n, r) => n + r.size, 0),
    }),
    roomSize: (roomId) => rooms.get(roomId)?.size ?? 0,
    close: () => {
      clearInterval(heartbeat);
      for (const ws of wss.clients) ws.terminate();
      wss.close();
    },
  };
}
