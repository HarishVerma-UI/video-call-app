# Deploy Huddle

This puts Huddle online at a real HTTPS address, so anyone can use it from a
browser on any phone or computer, including face sign-in and calls across
different networks.

**What you'll end up with** (all on one small server, started by one script):

| Part | What it does |
|---|---|
| **Caddy** | HTTPS with a free Let's Encrypt certificate, renewed automatically |
| **App** | the Node.js server: website, API and the WebSocket for calls |
| **MongoDB** | accounts, chat, call history, face sign-in devices (password protected, not reachable from the internet) |
| **coturn** | TURN relay, so calls work on office Wi-Fi and mobile data, not only at home |
| **Backups** | a copy of the database every night, the last 7 kept |

**Cost:** a server for about ₹400–1,000 a month. The domain (DuckDNS),
HTTPS certificate and all the software are free.

**Time:** about 30 minutes the first time.

---

## 1. Rent a server

Any of these works. Pick a region close to your users (for India: Mumbai,
Bangalore or Singapore).

| Provider | Plan | About |
|---|---|---|
| [DigitalOcean](https://www.digitalocean.com) | Basic Droplet, 1 GB RAM (2 GB better) | $6–12 / month |
| [AWS Lightsail](https://aws.amazon.com/lightsail/) | 1 GB or 2 GB | $5–10 / month |
| [Hetzner](https://www.hetzner.com/cloud) | CX22 (4 GB) | ~€4 / month (no India region) |

Choose **Ubuntu 24.04** (or 22.04). Add your SSH key (or note the root
password). When it's created, copy its **public IPv4 address**, e.g. `203.0.113.10`.

> **Cloud firewall:** if your provider has its own firewall (Lightsail
> "Networking", DigitalOcean "Firewalls"), allow these inbound ports:
> TCP 22, 80, 443, 3478, 5349 · UDP 443, 3478, 5349, 49160–49250.
> The setup script opens the same ports on the server itself.

## 2. Get a free domain on DuckDNS

Face sign-in (passkeys) and the camera only work on a proper HTTPS address.

1. Go to **[duckdns.org](https://www.duckdns.org)** and sign in (Google or GitHub).
2. Type a name, e.g. `huddle-harish`, and click **add domain**.
3. In the **current ip** box, paste your server's IP and click **update ip**.

Your address is now `huddle-harish.duckdns.org`.

> **Pick the name carefully.** Face sign-in keys are tied to the domain. If you
> move to another domain later (say, one you buy), the app keeps working, but
> everyone has to sign in once with their password and turn face sign-in on
> again. People who only had face sign-in should add a backup password first.

## 3. Run the setup script

Connect to the server (Windows: PowerShell; Mac: Terminal):

```bash
ssh root@203.0.113.10          # your server's IP
```

Then:

```bash
apt-get update && apt-get install -y git
git clone https://github.com/HarishVerma-UI/video-call-app.git
cd video-call-app/deploy
sudo ./setup.sh
```

It asks two things:

- **Your domain:** `huddle-harish.duckdns.org`
- **Your email:** used by Let's Encrypt only for certificate warnings

Then it installs Docker, opens the firewall, generates all passwords and
secrets (saved in `deploy/.env`), builds the app and waits for HTTPS. The first
build takes about 3–5 minutes. At the end it prints:

```
▸ Done! Open https://huddle-harish.duckdns.org
```

> If it says the domain points somewhere else, the DuckDNS IP isn't set yet.
> Fix it in step 2, wait a minute and run `sudo ./setup.sh` again.

## 4. Check everything works

1. Open `https://huddle-harish.duckdns.org` on your computer and create an
   account with **face sign-in** (Windows Hello / Touch ID).
2. On your phone, open the same address on **mobile data** (Wi-Fi off) and
   create a second account. Android Chrome and iPhone Safari both offer face
   sign-in.
3. Start a meeting on one and join it with the code on the other. If you see
   and hear each other on mobile data, the TURN relay is working.
4. On the phone, use **Add to Home screen** (Chrome menu, or Safari's Share
   button). Huddle then opens full-screen with its own icon, like an app.

**Back up `deploy/.env`.** It holds the database password and the secrets.
Copy it somewhere private (a password manager is ideal). Without it, the
backups can't be restored on a new server.

---

## Everyday tasks

All commands run on the server, in `video-call-app/deploy`.

| Task | Command |
|---|---|
| Deploy your latest code from GitHub | `sudo ./update.sh` |
| See live logs | `docker compose logs -f app` |
| Is everything running? | `docker compose ps` |
| Health check | `curl https://huddle-harish.duckdns.org/health` |
| Restart everything | `docker compose restart` |
| Restore a backup | `sudo ./restore.sh backups/huddle-2026-10-28.archive.gz` |

Backups land in `deploy/backups/` every night. To keep a copy off the server,
download one now and then:

```bash
scp root@203.0.113.10:video-call-app/deploy/backups/huddle-*.archive.gz .
```

## Settings

Change them in `deploy/.env`, then run `docker compose up -d`.

| Setting | Default | Meaning |
|---|---|---|
| `MAX_PEERS` | `6` | people per meeting (more than 6 needs an SFU, see the roadmap) |
| `CHAT_RETENTION_DAYS` | `30` | how long room chat is kept |

## Moving to your own domain later

1. Buy a domain and add an **A record** pointing to the server's IP.
2. In `deploy/.env`, change `DOMAIN=` to the new name.
3. `docker compose up -d`, then `sudo ./turn-certs.sh` once the new certificate exists.

Remember that face sign-in has to be turned on again on the new domain (see step 2).

## When something's wrong

| Symptom | Likely cause |
|---|---|
| Browser says the site can't be reached | DuckDNS IP wrong, or ports 80/443 closed in the cloud firewall |
| "Not secure" / certificate error | Caddy couldn't get a certificate: check `docker compose logs caddy` (usually ports 80/443 blocked or DNS not pointing at the server) |
| Calls connect at home but not on mobile data | TURN ports blocked: open UDP 3478 and 49160–49250 in the cloud firewall; check `docker compose logs coturn` |
| "Face sign-in didn't work on this device" | the device has no face unlock / fingerprint / PIN set up, or you're not on the https address |
| App container keeps restarting | `docker compose logs app`; it refuses to start with a missing or weak secret, and says which |

## Native mobile apps (later)

The website already works on phones, including face sign-in and Add to Home
screen. When you want the native apps, build them against your server:

```bash
cd mobile
EXPO_PUBLIC_SIGNALING_URL=wss://huddle-harish.duckdns.org/ws npx eas build --platform android
```

The app gets TURN details from the server automatically.
