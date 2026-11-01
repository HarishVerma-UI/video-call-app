#!/usr/bin/env bash
# One-time setup of Huddle on a fresh Ubuntu 22.04 / 24.04 server.
#
#   git clone https://github.com/HarishVerma-UI/video-call-app.git
#   cd video-call-app/deploy
#   sudo ./setup.sh
#
# It installs Docker, opens the firewall, writes deploy/.env with fresh random
# secrets (only the first time), starts everything, and waits for HTTPS.
set -euo pipefail
cd "$(dirname "$0")"

if [ "$(id -u)" -ne 0 ]; then echo "Run with sudo: sudo ./setup.sh"; exit 1; fi
say() { printf '\n\033[1;35m▸ %s\033[0m\n' "$*"; }

# ---------- 1. settings ----------
if [ ! -f .env ]; then
  say "First-time settings"
  read -rp "Your domain (e.g. huddle-harish.duckdns.org): " DOMAIN
  read -rp "Email for HTTPS certificate notices: " ACME_EMAIL
  PUBLIC_IP="$(curl -4fsS https://api.ipify.org || curl -4fsS https://ifconfig.me)"
  # On clouds that put the server behind NAT (AWS Lightsail/EC2, GCP), TURN needs "public/private".
  PRIVATE_IP="$(ip -4 route get 1.1.1.1 | awk '{for(i=1;i<=NF;i++) if($i=="src") print $(i+1)}')"
  EXTERNAL_IP="$PUBLIC_IP"
  [ -n "$PRIVATE_IP" ] && [ "$PRIVATE_IP" != "$PUBLIC_IP" ] && EXTERNAL_IP="$PUBLIC_IP/$PRIVATE_IP"
  rand() { openssl rand -base64 48 | tr -d '/+=\n' | cut -c1-"$1"; }
  umask 077
  cat > .env <<ENV
# Huddle production settings. Keep this file private; back it up somewhere safe.
DOMAIN=$DOMAIN
ACME_EMAIL=$ACME_EMAIL
PUBLIC_IP=$PUBLIC_IP
EXTERNAL_IP=$EXTERNAL_IP
JWT_SECRET=$(rand 64)
TURN_SECRET=$(rand 48)
MONGO_USER=huddle
MONGO_PASSWORD=$(rand 40)
MAX_PEERS=10
CHAT_RETENTION_DAYS=30
# Public URL, used to build social-login (OAuth) redirect URIs.
APP_URL=https://$DOMAIN
# Admin dashboard sign-in. Defaults to admin/admin — CHANGE ADMIN_PASSWORD after first login.
ADMIN_EMAIL=admin
ADMIN_PASSWORD=admin
# Social login (optional). Fill these in to show the Google / GitHub buttons,
# and register the callback https://$DOMAIN/api/auth/oauth/<provider>/callback with each provider.
# GOOGLE_CLIENT_ID=
# GOOGLE_CLIENT_SECRET=
# GITHUB_CLIENT_ID=
# GITHUB_CLIENT_SECRET=
ENV
  echo "Saved deploy/.env (secrets generated)."
fi
set -a; . ./.env; set +a

# The domain must point at this server before HTTPS can work.
RESOLVED="$(getent ahostsv4 "$DOMAIN" | awk 'NR==1{print $1}')"
if [ "$RESOLVED" != "$PUBLIC_IP" ]; then
  echo "⚠  $DOMAIN points to '${RESOLVED:-nothing}', but this server is $PUBLIC_IP."
  echo "   Set the DuckDNS / DNS record to $PUBLIC_IP, wait a minute, then run this again."
  exit 1
fi

# ---------- 2. Docker ----------
if ! command -v docker >/dev/null; then
  say "Installing Docker"
  curl -fsSL https://get.docker.com | sh
fi

# Small servers: add swap so the web build doesn't run out of memory.
if [ "$(free -m | awk '/Mem:/{print $2}')" -lt 2000 ] && ! swapon --show | grep -q /swapfile; then
  say "Adding 2 GB swap"
  fallocate -l 2G /swapfile && chmod 600 /swapfile && mkswap /swapfile && swapon /swapfile
  grep -q /swapfile /etc/fstab || echo '/swapfile none swap sw 0 0' >> /etc/fstab
fi

# ---------- 3. firewall ----------
if command -v ufw >/dev/null; then
  say "Opening ports: SSH, web (80/443), TURN (3478, 5349, relay 49160-49250)"
  ufw allow OpenSSH >/dev/null
  ufw allow 80/tcp >/dev/null; ufw allow 443/tcp >/dev/null; ufw allow 443/udp >/dev/null
  ufw allow 3478/tcp >/dev/null; ufw allow 3478/udp >/dev/null
  ufw allow 5349/tcp >/dev/null; ufw allow 5349/udp >/dev/null
  ufw allow 49160:49250/udp >/dev/null
  ufw --force enable >/dev/null
fi
# Oracle Cloud's Ubuntu images ship iptables rules that reject everything except SSH,
# and they sit in front of ufw. Allow our ports there too and save them.
if iptables -S INPUT 2>/dev/null | grep -q -- "-j REJECT"; then
  say "Opening the same ports in iptables (Oracle Cloud image)"
  for rule in "tcp 80" "tcp 443" "udp 443" "tcp 3478" "udp 3478" "tcp 5349" "udp 5349" "udp 49160:49250"; do
    set -- $rule
    pos="$(iptables -L INPUT --line-numbers -n | awk '$2=="REJECT"{print $1; exit}')"
    iptables -C INPUT -p "$1" --dport "$2" -j ACCEPT 2>/dev/null || iptables -I INPUT "${pos:-1}" -p "$1" --dport "$2" -j ACCEPT
  done
  command -v netfilter-persistent >/dev/null && netfilter-persistent save >/dev/null
fi
echo "Cloud firewall (Oracle security list / Lightsail / DigitalOcean panel): allow the same ports there too."

# ---------- 4. start ----------
mkdir -p data/mongo data/caddy data/caddy-config data/turn-certs backups
say "Building and starting (the first build takes a few minutes)"
docker compose up -d --build

say "Waiting for the HTTPS certificate"
for i in $(seq 1 60); do
  if curl -fsS "https://$DOMAIN/health" >/dev/null 2>&1; then break; fi
  sleep 5
done
curl -fsS "https://$DOMAIN/health" && echo

# ---------- 5. TURN over TLS + daily jobs ----------
./turn-certs.sh || echo "TURN certificate not ready yet; it will be copied by the daily job."
CRON=/etc/cron.d/huddle
cat > "$CRON" <<CRONTAB
# Copy the renewed HTTPS certificate to the TURN server every day.
17 4 * * * root $(pwd)/turn-certs.sh >/var/log/huddle-turn-certs.log 2>&1
CRONTAB
chmod 644 "$CRON"

say "Done! Open https://$DOMAIN"
echo "Logs:      cd $(pwd) && docker compose logs -f app"
echo "Update:    sudo $(pwd)/update.sh"
echo "Backups:   $(pwd)/backups (one per day, last 7 kept)"
