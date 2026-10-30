# Build on a workstation/CI and transfer the image; the runtime never runs Vite.
FROM node:22-bookworm-slim AS frontend
WORKDIR /build/frontend
COPY frontend/package*.json ./
RUN npm ci --no-audit --no-fund
COPY frontend/ ./
ENV SAKI_BUILD_PROFILE=light
RUN npm run build

FROM node:22-bookworm-slim AS dependencies
WORKDIR /app/backend
COPY backend/package*.json ./
RUN npm ci --omit=dev --omit=optional --no-audit --no-fund && npm cache clean --force

FROM node:22-bookworm-slim AS runtime
ENV NODE_ENV=production SAKI_PROFILE=light AGENT_HOST=0.0.0.0 PORT=5480 \
    SAKI_DATA_DIR=/app/data CHECKPOINT_STORE_DIR=/app/data/checkpoints \
    SAKI_MEMORY_WORKSPACE_DIR=/app/data/workspace-memory \
    QQBOT_AUTO_CONNECT=0 SAKI_TLS=0 NODE_OPTIONS=--max-old-space-size=384
WORKDIR /app
COPY --from=dependencies --chown=node:node /app/backend/node_modules ./backend/node_modules
COPY --chown=node:node backend/server.js ./backend/server.js
COPY --chown=node:node backend/services ./backend/services
COPY --chown=node:node data/global_config.example.json ./defaults/global_config.example.json
COPY --from=frontend --chown=node:node /build/frontend/dist ./frontend/dist
RUN mkdir -p /app/data && chown node:node /app/data
USER node
EXPOSE 5480
VOLUME ["/app/data"]
HEALTHCHECK --interval=30s --timeout=3s --start-period=20s --retries=3 \
    CMD node -e "require('http').get('http://127.0.0.1:5480/api/health',r=>process.exit(r.statusCode===200?0:1)).on('error',()=>process.exit(1))"
CMD ["node", "backend/server.js"]
