# Huddle: group video meetings with chat (React · React Native · Node.js · MongoDB)

Private group video meetings for up to 10 people, on **web, Android and iOS**,
built from scratch on **WebRTC**. The app is laid out like **Microsoft Teams**
(a left app rail with Meet, Chat, Calls and Profile), with a camera-lens twist.
You **sign in with your email and password**, or with **Google or GitHub**, and
an **admin dashboard** lets an administrator see everyone who has registered and
manage accounts. No paid video vendor is involved: the Node.js server only
introduces people to each other, and audio and video flow directly between devices.

> **▶ Live demo: [harish007.duckdns.org](https://harish007.duckdns.org)**
> Create an account and start a meeting. It's best with two
> devices — open it on your phone too (on mobile data) and join the same code.

![Huddle demo: start a meeting, screen share and chat](docs/screenshots/demo.gif)

*A quick tour — start a meeting, share your screen and chat, all in one place.*

| Meet (dark) | Meet (light) |
|---|---|
| ![Meet](docs/screenshots/meet.png) | ![Meet light](docs/screenshots/meet-light.png) |

| In a meeting, with chat | Screen share |
|---|---|
| ![Meeting](docs/screenshots/meeting.png) | ![Share](docs/screenshots/meeting-share.png) |

| Chat tab | Calls tab | Profile | Phone |
|---|---|---|---|
| ![Chat](docs/screenshots/chat-tab.png) | ![Calls](docs/screenshots/calls-tab.png) | ![Profile](docs/screenshots/profile-face.png) | ![Phone](docs/screenshots/phone-chat.png) |

*(Screenshots come from automated tests that use Chrome's fake camera, so the videos show green test patterns.)*

## Put it online

**[DEPLOY.md](./DEPLOY.md)**: rent a small server, get a free DuckDNS address, run one
script. You get HTTPS, MongoDB, a TURN relay for calls on any network, and nightly
backups. The website can be added to a phone's home screen like an app.

The live instance above runs this exact stack on an **AWS Lightsail** (Ubuntu)
server, with HTTPS at [harish007.duckdns.org](https://harish007.duckdns.org).

## Accounts, sign-in and the admin dashboard

- **Email and password.** Passwords are hashed with **scrypt** and never stored
  in the clear; sessions are **JWTs** (7 days by default). Sign-up checks the
  email format and password strength, and failed logins are rate-limited.
- **Google and GitHub (optional).** Set the matching client id and secret in the
  server environment and the sign-in page shows "Continue with Google / GitHub".
  The server runs the OAuth 2.0 authorization-code flow itself (no third-party
  library, `server/src/auth/oauth.js`); a social account is matched to an existing
  one by its verified email. Register the callback
  `https://<your-domain>/api/auth/oauth/<provider>/callback` with each provider.
  With no credentials set, the buttons simply don't appear.
- **Admin dashboard.** An account with the **admin** role gets an **Admin** tab
  that lists everyone who has registered, with full create / edit / delete and
  the ability to change a user's role. On first start the server seeds an admin
  account from `ADMIN_EMAIL` / `ADMIN_PASSWORD` (default **admin / admin** — change
  the password before going live). Admins can't delete themselves or drop their
  own admin role, so you can't lock yourself out.

## Growing into a professional network (round one)

Huddle is being extended from a video-call app into a **professional network where job
seekers find mentors and guidance**. Round one adds the following — the **server and tests
are complete**; the web UI is in progress:

- **Professional profiles & CV** — photo, headline, bio, location, skills, experience,
  education, mobile, and a CV upload. A **partial profile** (photo, name, headline, skills)
  is visible to anyone; private details (mobile, CV, full experience) unlock only after a
  connection is **accepted**.
- **Connections** — request, accept or decline; connections unlock full profiles and messaging.
- **Posts & feed** — post text and a photo, like and comment; your home feed shows posts from
  you and your connections.
- **Direct messages** — 1:1 chat between connected users.
- **Mentorship** — "request guidance" from a mentor, then chat and start a **live video call**
  (reusing the existing WebRTC calls).

### Design

- **Media on S3.** Photos, CVs and post images upload straight from the browser to **Amazon S3**
  via short-lived **presigned URLs**, so large files never pass through the Node server. The
  bucket stays fully private: reads use short-lived presigned GET links, and a CV is only
  readable by accepted connections.
- **Partial visibility is enforced on the server** — every profile response is shaped by the
  viewer's connection state, so private fields are never sent to strangers.
- **Reuse over rebuild.** The mentorship session is the existing WebRTC call; direct messages
  extend the chat system; accounts, roles and the admin dashboard carry over unchanged.
- **Data** lives in MongoDB collections: `profiles`, `connections`, `posts`, `dms`.

The full plan, phases and open decisions live in the product-requirements doc.

## Design: Teams, with a lens

- **Layout like Teams:** title bar with a room search, a left **app rail**
  (Meet, Chat, Calls, Profile), a list pane, and the main stage. On phones the
  rail becomes a bottom tab bar.
- **Meetings like Teams:** a top bar with Chat, People, Camera, Mic, Share and a
  red **Leave** button; chat and people open as side panels.
- **The creative part:** a calm **indigo** for actions and a warm **amber
  "spark"** for anything live or selected (the active rail marker, the
  speaking ring around a video tile, the "You joined" line). The six-blade
  **camera aperture** is the logo; it closes over your preview when your
  camera is off.
- **Dark and light mode:** follows your device until you pick one with the
  half-amber, half-indigo toggle. Headings use TeX Gyre Adventor; body text
  uses Segoe UI (like Teams) or the system font.

## Features

**Accounts**
- Sign in with **email and password**, or with **Google or GitHub** (optional social login)
- **Admin dashboard** (admin role): see everyone who has registered, and create, edit, delete or re-role accounts
- A social account can add a password in Profile, so it can also sign in by email
- Accounts in **MongoDB** with **scrypt**-hashed passwords; **JWT** sessions (7 days by default)
- Rate limiting, identical errors for "wrong password" and "no such account", invite links that survive sign-in
- **Profile**: change your name, email and password (changing the password signs out your other devices)

**Meet**
- Pre-join stage with camera preview and camera/mic switches, shows who is already in the meeting
- "Start a meeting now", join with a code, **Happening now** (your rooms with people in them), recent rooms
- Group meetings up to 10 people, speaking indicator, mute / camera-off shown to everyone
- Screen sharing (desktop web) with a spotlight layout, People panel with the invite link
- Recovers on its own: automatic reconnect, ICE restart, audio-only fallback

**Chat**
- Every room has a chat saved for 30 days. Read it and reply **from the Chat tab without joining the meeting**; people in the meeting see your message live
- In the meeting: "You joined" marker, load earlier messages, day dividers, unread badge

**Calls**
- Your call history: room, who was there, when, how long, and **Call again**

## Project layout

```
video-call-app/
├── shared/   @vca/shared  — protocol, CallClient (WebRTC engine) and API client, used by web AND mobile
├── server/   @vca/server  — Node.js: auth (JWT), MongoDB users, rooms, WebSocket signaling, chat
├── web/      @vca/web     — React 19 + Vite + TypeScript
├── mobile/   @vca/mobile  — React Native (Expo dev build) + react-native-webrtc
├── docker-compose.yml     — local MongoDB for development
├── Dockerfile             — production image (web build + Node server)
├── deploy/                — production stack: Caddy (HTTPS), MongoDB, coturn, backups, setup.sh
└── docs/                  — screenshots
```

See **[ARCHITECTURE.md](./ARCHITECTURE.md)** for diagrams of the system, the sign-in flow and the call flow.

## Quick start (web)

Requires **Node.js 20+**. For MongoDB, use Docker or a free MongoDB Atlas cluster.

```bash
npm install
npm run db            # starts MongoDB in Docker on localhost:27017
```

Create `server/.env` (copy `server/.env.example`) and set:

```bash
MONGODB_URI=mongodb://localhost:27017
JWT_SECRET=<paste output of: node -e "console.log(require('crypto').randomBytes(48).toString('base64url'))">
```

Then:

```bash
npm run dev
```

- Web app: **http://localhost:5173**. Create an account with your email and password, then start a meeting.
- Server: **http://localhost:3001** (`/health` shows whether MongoDB is connected).

Open a second browser (or a private window), create another account, and join
the same room code.

> **No MongoDB yet?** Leave `MONGODB_URI` empty and the dev server runs with a
> temporary in-memory store. It prints a warning, and accounts disappear when
> the server restarts. Production refuses to start without MongoDB and a real
> `JWT_SECRET`.

> **Camera from another device:** browsers only allow camera/mic on `https://`
> or `localhost`. Use the mobile app, or put the site behind HTTPS (Step 2).

### Production

```bash
npm run build                         # builds web/dist
NODE_ENV=production MONGODB_URI=... JWT_SECRET=... npm start
```

The Node server serves the web app, the API and the WebSocket on one port.

## Mobile app (Android & iOS)

WebRTC needs native code, so this runs as an **Expo development build**. It
won't work in the Expo Go app.

```bash
npm install
cd mobile
npx expo install --fix         # align native package versions with your Expo SDK
cp .env.example .env           # set EXPO_PUBLIC_SIGNALING_URL to your computer's LAN IP
npx expo run:android           # or: npx expo run:ios   (needs Android Studio / Xcode)
```

Face sign-in in the app uses the phone's own Face ID / face unlock / fingerprint
(`expo-local-authentication` + `expo-secure-store`); turn it on when you create
an account, or later in Profile.

Keep `npm run dev:server` running on your computer. Phone and computer must be
on the same Wi-Fi, and the server prints the address to use. Use a **real
device**: emulators/simulators have no real camera. No Android Studio or Xcode?
Build in the cloud: `npx eas build --profile development --platform android`.

## API

| Method | Path | Auth | Body → Response |
|---|---|---|---|
| POST | `/api/auth/register` | — | `{ name, email, password }` → `201 { user, token, expiresAt }` |
| POST | `/api/auth/login` | — | `{ email, password }` → `200 { user, token, expiresAt }` |
| GET | `/api/auth/me` | Bearer | → `{ user }` |
| PATCH | `/api/auth/me` | Bearer | `{ name?, email?, currentPassword? }` → `{ user, token, expiresAt }` (email change needs `currentPassword`) |
| POST | `/api/auth/password` | Bearer | `{ currentPassword, newPassword }` → `{ user, token, expiresAt }`; older tokens stop working. Social-login accounts with no password yet send just `newPassword` to add one |
| GET | `/api/auth/providers` | — | → `{ providers: { google, github } }` (which social buttons to show) |
| GET | `/api/auth/oauth/:provider/start` | — | Redirects to Google/GitHub to sign in (`provider` = `google` or `github`) |
| GET | `/api/auth/oauth/:provider/callback` | — | Provider returns here; redirects to the app with a token in the URL hash |
| GET | `/api/admin/users` | Bearer (admin) | → `{ users, total }` |
| POST | `/api/admin/users` | Bearer (admin) | `{ name, email, password, role? }` → `201 { user }` |
| PATCH | `/api/admin/users/:id` | Bearer (admin) | `{ name?, email?, role?, password? }` → `{ user }` |
| DELETE | `/api/admin/users/:id` | Bearer (admin) | → `{ ok, id }` (you can't delete yourself) |
| GET | `/api/rooms/:id` | Bearer | → `{ roomId, participants, people, maxPeers, full }` |
| POST | `/api/rooms/:id/messages` | Bearer | `{ text }` → `201 { message }`; also sent live to people in the meeting |
| GET | `/api/chats` | Bearer | → `{ chats }`: your rooms, last message, who's in the meeting now |
| GET | `/api/calls` | Bearer | → `{ calls }`: room, with whom, start, end, duration |
| GET | `/api/rooms/:id/messages?before=<ts>&limit=50` | Bearer | → `{ messages, hasMore }` (oldest first; for "Load earlier") |
| GET | `/health` | — | → `{ ok, db, store, rooms, participants }` |
| WS | `/ws` | token in `join` | signaling, see ARCHITECTURE.md |

Errors are `{ error, code?, fields? }`. `fields` holds per-field messages for
forms (e.g. `{ email: "Already registered…" }`).

### Professional network API (round one)

All require a Bearer token. Profile responses are shaped by the viewer's connection state.

| Method | Path | Body → Response |
|---|---|---|
| GET | `/api/profile/me` | → `{ profile }` (your full profile) |
| PUT | `/api/profile` | profile fields → `{ profile }` |
| GET | `/api/profile/:userId` | → `{ profile, posts }` (partial unless connected) |
| GET | `/api/people?q=&role=` | → `{ people }` (search; `role` = `mentor`/`mentee`) |
| POST | `/api/media/upload-url` | `{ kind, contentType }` → `{ uploadUrl, key }` (S3 presigned; `kind` = `photo`/`cv`/`post`) |
| POST | `/api/connections/:userId/request` | → `{ status }` |
| POST | `/api/connections/:userId/accept` | → `{ status }` |
| POST | `/api/connections/:userId/decline` | → `{ status }` |
| GET | `/api/connections` | → `{ connections }` |
| GET | `/api/connections/requests` | → `{ requests }` (incoming) |
| POST | `/api/posts` | `{ text, imageKey? }` → `201 { post }` |
| GET | `/api/feed?before=<ts>` | → `{ posts }` (you + your connections) |
| POST | `/api/posts/:id/like` | → `{ post }` (toggles) |
| POST | `/api/posts/:id/comments` | `{ text }` → `{ post }` |
| DELETE | `/api/posts/:id` | → `{ ok }` (author or admin) |
| GET | `/api/dm` | → `{ conversations }` |
| GET | `/api/dm/:userId` | → `{ messages }` (connections only) |
| POST | `/api/dm/:userId` | `{ text }` → `201 { message }` (connections only) |

## Scripts

| Command | What it does |
|---|---|
| `npm run dev` | server + web with hot reload |
| `npm run db` | start MongoDB in Docker |
| `npm run dev:server` / `dev:web` / `dev:mobile` | one at a time |
| `npm test` | server tests (auth, admin + social providers, JWT, passwords, MongoDB stores, signaling, chat, calls) |
| `npm run build` | production web build |
| `npm start` | production server (serves `web/dist`) |

## Configuration

| Where | Variable | Default |
|---|---|---|
| server | `MONGODB_URI`, `MONGODB_DB` | in-memory in dev (required in prod), `huddle` |
| server | `JWT_SECRET`, `JWT_EXPIRES_IN` | dev-only secret (required in prod), `7d` |
| server | `ADMIN_EMAIL`, `ADMIN_PASSWORD`, `ADMIN_NAME` | `admin`, `admin`, `Administrator` — the seeded admin account (change the password before going live) |
| server | `APP_URL`, `GOOGLE_CLIENT_ID`/`_SECRET`, `GITHUB_CLIENT_ID`/`_SECRET` | social login: public base URL for OAuth callbacks, and each provider's credentials (unset → that button is hidden) |
| server | `AWS_REGION`, `S3_BUCKET`, `AWS_ACCESS_KEY_ID`, `AWS_SECRET_ACCESS_KEY` | S3 for photo/CV/post uploads (unset → uploads disabled, rest of the app works) |
| server | `TURN_URLS`, `TURN_SECRET`, `TURN_TTL_SEC`, `STUN_URLS` | no TURN, `12h` credentials, Google STUN (set by `deploy/` automatically) |
| server | `CHAT_RETENTION_DAYS` | `30` (MongoDB deletes older messages on its own) |
| server | `PORT`, `HOST`, `MAX_PEERS`, `ALLOWED_ORIGINS`, `TRUST_PROXY`, `WEB_DIST` | `3001`, `0.0.0.0`, `10`, `*`, `false`, `../web/dist` |
| web | `VITE_API_URL`, `VITE_SIGNALING_URL`, `VITE_ICE_SERVERS` | same origin, same host `/ws`, Google STUN |
| mobile | `EXPO_PUBLIC_SIGNALING_URL`, `EXPO_PUBLIC_ICE_SERVERS` | — (set your LAN IP), Google STUN |

Each folder has a `.env.example`.

## What's tested

- **Server (49 tests):**
  - **Accounts & admin:** register / sign-in validation, duplicate emails, new accounts defaulting to the `user` role, the social-providers endpoint, and the admin API — list, create, update and delete users, role changes, and the guards that stop an admin from deleting or demoting themselves.
  - JWT tampering, expiry, wrong key or audience, and `alg: none`; salted password hashes; sign-up/sign-in validation, duplicate emails, rate limits.
  - Meetings: a token is required, names can't be spoofed, room cap, relay, chat, mute state.
  - Profile changes; saved chat (history, paging, retention); Chat and Calls tabs (last message, who's in the meeting, sending from outside a meeting reaches people inside, call history with names).
  - TURN credentials (coturn REST scheme, expiry, sent on join) and production config checks.
  - MongoDB stores (users, chat, calls) against fake collections. Set `MONGODB_URI` to run against a real database.
- **Web, end to end in Chromium:** register and sign in with email and password, then a two-person meeting (pre-join shows who's there, unread badge, People panel), the Chat tab (live marker, a message from the tab reaches the meeting), the Calls tab, the dark/light toggle, and the phone layout (bottom tabs, no sideways scrolling).
- **3-person meeting (3 checks):** everyone sees everyone, chat, screen-share spotlight.
- **CI on GitHub** (`.github/workflows/ci.yml`): server tests, web typecheck and build, and the production Docker image built and started on every push.
- **Mobile:** written against `react-native-webrtc`, `expo-secure-store` and `expo-local-authentication`, and syntax-checked. It still needs a first run on a real phone (Face ID needs a device, not a simulator).

## Roadmap

- [x] Step 1: 1-to-1 web call
- [x] Full app: React web + React Native mobile + Node server, group calls, chat, screen share
- [x] **Accounts**: MongoDB + JWT, sign-in / sign-up on web and mobile
- [x] **Step 2**: deployment with HTTPS, TURN (coturn) with short-lived credentials, MongoDB backups ([DEPLOY.md](./DEPLOY.md))
- [x] Profile editing and saved call chat (web + mobile)
- [x] **Email + password and social login** (Google / GitHub), an **admin dashboard** with user management, and a Teams-style layout with Chat and Calls tabs
- [ ] Forgot-password email, refresh tokens, direct messages
- [ ] **Step 3**: SFU (mediasoup) for bigger rooms (10–20+)
