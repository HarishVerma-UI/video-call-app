#!/usr/bin/env bash
# Deploy the latest code from GitHub. Data, settings and certificates are kept.
set -euo pipefail
cd "$(dirname "$0")"
git -C .. pull --ff-only
docker compose up -d --build
docker image prune -f >/dev/null
sleep 5
docker compose ps
