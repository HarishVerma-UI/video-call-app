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

echo "⏳ Waiting for services..."
sleep 5
docker compose ps

# Check app health
if curl -fsS http://localhost:3001/health >/dev/null 2>&1; then
  echo "✅ Deploy successful — app is healthy"
else
  echo "❌ Health check failed — check logs with: docker compose logs app"
  exit 1
fi
