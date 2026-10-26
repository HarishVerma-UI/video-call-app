# video-call-app

A video calling app built from scratch on **WebRTC**, developed in steps.

**Target:** web + Android + iOS, small group calls (~10–20 people).
**Approach:** own signaling server, own TURN, open-source SFU for groups — no paid calling vendor.

## Current status — ✅ Step 1: 1-to-1 web call

A working peer-to-peer video call between two browsers, with your own
**zero-dependency** Node signaling server.

```
video-call-app/
├── server/        # signaling server (swaps WebRTC connection info between peers)
│   ├── server.js
│   └── package.json
└── web/           # browser client (camera/mic + call UI)
    └── index.html
```

### Run it
```bash
node server/server.js
```
Open **http://localhost:3000** in **two browser tabs**, type the same room name
(e.g. `test123`) in both, and click **Join**. You'll call yourself — real WebRTC
video flowing directly between the tabs. No `npm install` needed.

> `localhost` is a secure context, so camera/mic work without HTTPS. Testing
> across two *different* machines/networks will need HTTPS **and** a TURN server
> — that's Step 2.

### How it works
1. Both browsers capture camera/mic with `getUserMedia`.
2. They connect to the signaling server over WebSocket and join a room.
3. The 2nd person to join creates an **SDP offer**; the 1st replies with an **answer**.
4. They exchange **ICE candidates** (possible network paths).
5. Once a path is agreed, audio/video flows **peer-to-peer** — the server never sees it.

## Roadmap
- [x] **Step 1** — 1-to-1 web call (signaling + WebRTC)
- [ ] **Step 2** — TURN server (coturn) + HTTPS, so calls work across real networks
- [ ] **Step 3** — SFU (Mediasoup) + rooms → group calls (~10–20)
- [ ] **Step 4** — mobile clients (web + Android + iOS)
- [ ] **Step 5** — polish: auth, reconnection, screen share
