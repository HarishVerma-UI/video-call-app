#!/usr/bin/env bash
# Deploy the latest code from GitHub. Data, settings and certificates are kept.
set -euo pipefail
cd "$(dirname "$0")"

echo "⬇️  Fetching latest code..."
git -C .. fetch origin

# Try fast-forward first; if it fails (diverged), reset to remote
if ! git -C .. pull --ff-only 2>/dev/null; then
  echo "⚠️  Local branch diverged — resetting to origin/main"
  git -C .. reset --hard origin/main
fi

echo "🔨 Building and restarting..."
docker compose up -d --build
docker image prune -f >/dev/null

echo "⏳ Waiting for the app to become healthy..."
# The app port (3001) is only exposed inside the Docker network — Caddy is the
# public entry — so we can't curl it from the host. Instead we poll the app
# container's own Docker health status (its Dockerfile HEALTHCHECK hits
# 127.0.0.1:3001/health from inside the container).
cid="$(docker compose ps -q app || true)"
healthy=""
for _ in $(seq 1 30); do
  if [ -n "$cid" ]; then
    status="$(docker inspect -f '{{if .State.Health}}{{.State.Health.Status}}{{else}}{{.State.Status}}{{end}}' "$cid" 2>/dev/null || true)"
    # "healthy" (has a healthcheck) or "running" (image without one) both mean up.
    if [ "$status" = "healthy" ] || [ "$status" = "running" ]; then healthy=1; break; fi
    if [ "$status" = "unhealthy" ] || [ "$status" = "exited" ]; then break; fi
  fi
  sleep 3
done

docker compose ps

if [ -n "$healthy" ]; then
  echo "✅ Deploy successful — app is healthy"
else
  echo "❌ App did not become healthy in time — check logs with: docker compose logs app"
  exit 1
fi
