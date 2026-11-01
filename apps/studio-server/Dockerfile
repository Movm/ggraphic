# SPDX-License-Identifier: AGPL-3.0-only
# ggraphic Studio: API server plus (once it exists) the web app from apps/studio.
# Build from the repository root: docker build -f apps/studio-server/Dockerfile .
# Published as ghcr.io/movm/ggraphic-studio for linux/amd64 and linux/arm64 (studio-image.yml).

# The build stage runs on the machine's own platform, also for the other architecture: what it
# produces is JavaScript plus argon2, whose package carries prebuilt binaries for every platform
# and picks the right one at runtime. So a multi-platform build installs and builds once.
FROM --platform=$BUILDPLATFORM node:22-alpine AS build
RUN corepack enable
WORKDIR /repo
COPY . .
RUN pnpm install --frozen-lockfile
# Build the server together with the workspace packages it imports at runtime
# (@ggraphic/core); deploy then ships their dist/ via publishConfig.
RUN pnpm --filter "@ggraphic/studio-server..." -r run build \
 && pnpm --filter @ggraphic/studio-server deploy --prod --legacy /out
# The web app is optional until apps/studio lands; build it with its workspace dependencies.
RUN mkdir -p /web \
 && if [ -f apps/studio/package.json ]; then \
      pnpm --filter "./apps/studio..." -r --if-present run build \
      && cp -R apps/studio/dist/. /web/; \
    fi

FROM node:22-alpine
# Studio is AGPL-3.0: whoever runs it as a service offers its users the source, which is here.
LABEL org.opencontainers.image.title="ggraphic Studio" \
      org.opencontainers.image.description="The hostable ggraphic design app: API server and web app" \
      org.opencontainers.image.source="https://github.com/Movm/ggraphic" \
      org.opencontainers.image.url="https://github.com/Movm/ggraphic" \
      org.opencontainers.image.documentation="https://github.com/Movm/ggraphic/blob/main/docs/self-hosting.md" \
      org.opencontainers.image.licenses="AGPL-3.0-only"
ENV NODE_ENV=production \
    HOST=0.0.0.0 \
    PORT=8080 \
    DATA_DIR=/data \
    STATIC_DIR=/app/web
WORKDIR /app
COPY --from=build /out ./
COPY --from=build /web ./web
# The licence texts: AGPL-3.0 for Studio, MPL-2.0 for the packages it contains.
COPY --from=build /repo/LICENSES ./LICENSES
RUN mkdir -p /data && chown node:node /data
USER node
EXPOSE 8080
HEALTHCHECK --interval=30s --timeout=5s --start-period=20s \
  CMD wget -qO- http://127.0.0.1:8080/healthz >/dev/null || exit 1
CMD ["node", "dist/server.js"]
