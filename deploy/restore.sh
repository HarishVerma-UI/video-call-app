#!/usr/bin/env bash
# Restore the database from a backup:  sudo ./restore.sh backups/huddle-2026-10-28.archive.gz
# This REPLACES the current data with the backup.
set -euo pipefail
cd "$(dirname "$0")"
file="${1:?Usage: ./restore.sh backups/huddle-YYYY-MM-DD.archive.gz}"
set -a; . ./.env; set +a
read -rp "Replace the current database with $file? Type yes: " ok
[ "$ok" = "yes" ] || exit 1
docker compose exec -T mongo mongorestore --uri="mongodb://$MONGO_USER:$MONGO_PASSWORD@localhost:27017/?authSource=admin" \
  --archive --gzip --drop --nsInclude='huddle.*' < "$file"
echo "Restored."
