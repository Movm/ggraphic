# SPDX-License-Identifier: AGPL-3.0-only
# ggraphic Studio: API server plus (once it exists) the web app from apps/studio.
# Build from the repository root: docker build -f apps/studio-server/Dockerfile .

FROM node:22-alpine AS build
RUN corepack enable
WORKDIR /repo
COPY . .
RUN pnpm install --frozen-lockfile
RUN pnpm --filter @ggraphic/studio-server build \
 && pnpm --filter @ggraphic/studio-server deploy --prod --legacy /out
# The web app is optional until apps/studio lands; build it with its workspace dependencies.
RUN mkdir -p /web \
 && if [ -f apps/studio/package.json ]; then \
      pnpm --filter "./apps/studio..." -r --if-present run build \
      && cp -R apps/studio/dist/. /web/; \
    fi

FROM node:22-alpine
ENV NODE_ENV=production \
    HOST=0.0.0.0 \
    PORT=8080 \
    DATA_DIR=/data \
    STATIC_DIR=/app/web
WORKDIR /app
COPY --from=build /out ./
COPY --from=build /web ./web
RUN mkdir -p /data && chown node:node /data
USER node
EXPOSE 8080
HEALTHCHECK --interval=30s --timeout=5s --start-period=20s \
  CMD wget -qO- http://127.0.0.1:8080/healthz >/dev/null || exit 1
CMD ["node", "dist/server.js"]
