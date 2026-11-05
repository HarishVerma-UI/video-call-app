#!/bin/sh
set -e

# /app/uploads is a bind-mounted volume (./data/uploads on the host), created
# owned by root — so the unprivileged "node" user the server runs as can't
# write to it (EACCES on mkdir). We start as root, make sure the directory
# exists and is owned by node, then drop privileges to run the server.
mkdir -p /app/uploads
chown -R node:node /app/uploads 2>/dev/null || true

exec su-exec node "$@"
