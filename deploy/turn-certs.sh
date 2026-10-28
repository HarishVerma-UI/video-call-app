#!/usr/bin/env bash
# Gives coturn a copy of Caddy's HTTPS certificate (for TURN over TLS on port 5349),
# then tells coturn to reload it. Run daily by cron (setup.sh installs it).
set -euo pipefail
cd "$(dirname "$0")"
set -a; . ./.env; set +a
src="$(find data/caddy/caddy/certificates -type d -name "$DOMAIN" 2>/dev/null | head -1)"
[ -n "$src" ] || { echo "No certificate for $DOMAIN yet."; exit 1; }
install -m 644 -o 65534 -g 65534 "$src/$DOMAIN.crt" data/turn-certs/turn.crt
install -m 600 -o 65534 -g 65534 "$src/$DOMAIN.key" data/turn-certs/turn.key
docker compose kill -s SIGUSR2 coturn >/dev/null 2>&1 || docker compose restart coturn
echo "TURN certificate updated."
