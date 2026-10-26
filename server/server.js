// Step 1 — Signaling server + static web server for a 1-to-1 WebRTC video call.
// ZERO dependencies: just `node server/server.js`. Works on Node 16+.
//
// What it does:
//   1. Serves the web client in /web.
//   2. Runs a WebSocket "signaling" channel. WebRTC peers can't find each other
//      on their own — they need a middleman to swap connection details
//      (SDP offers/answers) and network candidates (ICE). This server is that
//      middleman. It never sees your audio/video; media flows peer-to-peer.
//
// Rooms are capped at 2 people in Step 1 (mesh). Group calls come later with an SFU.

const http = require('http');
const crypto = require('crypto');
const fs = require('fs');
const path = require('path');

const PORT = process.env.PORT || 3000;
const PUBLIC_DIR = path.join(__dirname, '..', 'web');

const MIME = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'application/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.ico': 'image/x-icon',
};

// --- Static file server -----------------------------------------------------
const server = http.createServer((req, res) => {
  let urlPath = decodeURIComponent(req.url.split('?')[0]);
  if (urlPath === '/') urlPath = '/index.html';

  const filePath = path.join(PUBLIC_DIR, path.normalize(urlPath));
  if (!filePath.startsWith(PUBLIC_DIR)) {
    res.writeHead(403);
    res.end('Forbidden');
    return;
  }

  fs.readFile(filePath, (err, data) => {
    if (err) {
      res.writeHead(404);
      res.end('Not found');
      return;
    }
    const ext = path.extname(filePath).toLowerCase();
    res.writeHead(200, { 'Content-Type': MIME[ext] || 'application/octet-stream' });
    res.end(data);
  });
});

// --- Minimal WebSocket layer (RFC 6455) -------------------------------------
// Enough to send/receive text frames and reply to ping/close. No frameworks.
const WS_GUID = '258EAFA5-E914-47DA-95CA-C5AB0DC85B11';

class WSConn {
  constructor(socket) {
    this.socket = socket;
    this.buffer = Buffer.alloc(0);
    this.frags = [];          // fragmented message pieces
    this.onmessage = null;
    this.onclose = null;
    this.closed = false;

    socket.on('data', (chunk) => {
      this.buffer = Buffer.concat([this.buffer, chunk]);
      this._parse();
    });
    socket.on('close', () => this._fireClose());
    socket.on('error', () => this._fireClose());
  }

  _fireClose() {
    if (this.closed) return;
    this.closed = true;
    if (this.onclose) this.onclose();
  }

  _parse() {
    while (true) {
      const buf = this.buffer;
      if (buf.length < 2) return;

      const fin = (buf[0] & 0x80) !== 0;
      const opcode = buf[0] & 0x0f;
      const masked = (buf[1] & 0x80) !== 0;
      let len = buf[1] & 0x7f;
      let offset = 2;

      if (len === 126) {
        if (buf.length < offset + 2) return;
        len = buf.readUInt16BE(offset);
        offset += 2;
      } else if (len === 127) {
        if (buf.length < offset + 8) return;
        // Our payloads are small; high 32 bits are effectively always 0.
        len = Number(buf.readBigUInt64BE(offset));
        offset += 8;
      }

      let mask;
      if (masked) {
        if (buf.length < offset + 4) return;
        mask = buf.slice(offset, offset + 4);
        offset += 4;
      }

      if (buf.length < offset + len) return; // wait for the rest of the frame

      let payload = buf.slice(offset, offset + len);
      if (masked) {
        const out = Buffer.allocUnsafe(len);
        for (let i = 0; i < len; i++) out[i] = payload[i] ^ mask[i & 3];
        payload = out;
      }

      this.buffer = buf.slice(offset + len);

      if (opcode === 0x8) { // close
        this._sendFrame(Buffer.alloc(0), 0x8);
        this.socket.end();
        this._fireClose();
        return;
      }
      if (opcode === 0x9) { // ping -> pong
        this._sendFrame(payload, 0xa);
        continue;
      }
      if (opcode === 0xa) continue; // pong, ignore

      // text (0x1) / binary (0x2) / continuation (0x0)
      this.frags.push(payload);
      if (fin) {
        const full = Buffer.concat(this.frags).toString('utf8');
        this.frags = [];
        if (this.onmessage) this.onmessage(full);
      }
    }
  }

  _sendFrame(payload, opcode) {
    const len = payload.length;
    let header;
    if (len < 126) {
      header = Buffer.from([0x80 | opcode, len]);
    } else if (len < 65536) {
      header = Buffer.alloc(4);
      header[0] = 0x80 | opcode;
      header[1] = 126;
      header.writeUInt16BE(len, 2);
    } else {
      header = Buffer.alloc(10);
      header[0] = 0x80 | opcode;
      header[1] = 127;
      header.writeBigUInt64BE(BigInt(len), 2);
    }
    try { this.socket.write(Buffer.concat([header, payload])); } catch { /* socket gone */ }
  }

  send(text) {
    if (this.closed) return;
    this._sendFrame(Buffer.from(text, 'utf8'), 0x1);
  }
}

server.on('upgrade', (req, socket) => {
  const key = req.headers['sec-websocket-key'];
  if (!key) { socket.destroy(); return; }
  const accept = crypto.createHash('sha1').update(key + WS_GUID).digest('base64');
  socket.write(
    'HTTP/1.1 101 Switching Protocols\r\n' +
    'Upgrade: websocket\r\n' +
    'Connection: Upgrade\r\n' +
    `Sec-WebSocket-Accept: ${accept}\r\n\r\n`
  );
  handleConnection(new WSConn(socket));
});

// --- Signaling logic --------------------------------------------------------
// roomId -> Set<WSConn>
const rooms = new Map();

function send(conn, msg) { conn.send(JSON.stringify(msg)); }

function handleConnection(conn) {
  conn.roomId = null;

  conn.onmessage = (raw) => {
    let msg;
    try { msg = JSON.parse(raw); } catch { return; }

    if (msg.type === 'join') {
      const roomId = String(msg.room || 'default');
      let room = rooms.get(roomId);
      if (!room) { room = new Set(); rooms.set(roomId, room); }

      if (room.size >= 2) { send(conn, { type: 'room-full' }); return; }

      const isInitiator = room.size === 1; // 2nd arrival makes the offer
      room.add(conn);
      conn.roomId = roomId;

      send(conn, { type: 'joined', initiator: isInitiator });
      for (const peer of room) if (peer !== conn) send(peer, { type: 'peer-joined' });

      console.log(`join room="${roomId}" size=${room.size} initiator=${isInitiator}`);
      return;
    }

    if (msg.type === 'signal') {
      const room = rooms.get(conn.roomId);
      if (!room) return;
      for (const peer of room) if (peer !== conn) send(peer, { type: 'signal', data: msg.data });
      return;
    }
  };

  conn.onclose = () => {
    const room = rooms.get(conn.roomId);
    if (!room) return;
    room.delete(conn);
    for (const peer of room) send(peer, { type: 'peer-left' });
    if (room.size === 0) rooms.delete(conn.roomId);
    console.log(`leave room="${conn.roomId}"`);
  };
}

server.listen(PORT, () => {
  console.log(`\n  Video call (Step 1) running:`);
  console.log(`  →  http://localhost:${PORT}\n`);
  console.log(`  Open that URL in TWO browser tabs, join the same room, and call yourself.\n`);
});
