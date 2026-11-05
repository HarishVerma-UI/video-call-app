# Huddle production image: the Node server serving the API, WebSocket and the built web app.
#   docker build -t huddle .
# Used by deploy/docker-compose.yml.

# ---------- 1. build the web app ----------
FROM node:22-alpine AS web
WORKDIR /src
# Only the workspaces the web build needs (the mobile app is built separately with Expo).
COPY package.json ./
COPY shared/package.json shared/
COPY web/package.json web/
RUN node -e "const f='package.json',p=require('./'+f);p.workspaces=['shared','web'];require('fs').writeFileSync(f,JSON.stringify(p,null,2))" \
 && npm install --no-audit --no-fund
COPY shared shared
COPY web web
RUN npm exec -w @vca/web -- vite build

# ---------- 2. server dependencies ----------
FROM node:22-alpine AS server-deps
WORKDIR /app/server
COPY server/package.json ./
RUN npm install --omit=dev --no-audit --no-fund

# ---------- 3. runtime ----------
FROM node:22-alpine
ENV NODE_ENV=production \
    PORT=3001 \
    HOST=0.0.0.0 \
    WEB_DIST=/app/web/dist
WORKDIR /app
# su-exec lets the entrypoint fix the bind-mounted uploads dir as root, then
# drop to the unprivileged "node" user to run the server.
RUN apk add --no-cache su-exec
COPY --from=server-deps /app/server/node_modules server/node_modules
COPY server/package.json server/package.json
COPY server/src server/src
COPY --from=web /src/web/dist web/dist
COPY deploy/docker-entrypoint.sh /usr/local/bin/docker-entrypoint.sh
RUN mkdir -p /app/uploads && chown node:node /app/uploads && chmod +x /usr/local/bin/docker-entrypoint.sh
# NOTE: we intentionally do NOT `USER node` here — the entrypoint starts as
# root to chown the mounted uploads volume, then execs the server as node.
EXPOSE 3001
HEALTHCHECK --interval=30s --timeout=5s --start-period=20s --retries=3 \
  CMD node -e "fetch('http://127.0.0.1:3001/health').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"
ENTRYPOINT ["/usr/local/bin/docker-entrypoint.sh"]
CMD ["node", "server/src/index.js"]
