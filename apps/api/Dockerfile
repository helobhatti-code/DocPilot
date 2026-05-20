# --------- Builder ---------
FROM node:20-alpine AS builder

# Build deps for sharp / native modules
RUN apk add --no-cache python3 make g++ libc6-compat

WORKDIR /app

# Workspace install — copy lockfile + manifests first for layer caching.
# Both workspace package.json files are copied so npm ci can resolve the
# `apps/*` workspace glob declared in the root package.json.
COPY package.json package-lock.json tsconfig.base.json ./
COPY apps/api/package.json ./apps/api/
COPY apps/web/package.json ./apps/web/
RUN npm ci --include-workspace-root --workspace=apps/api

# Copy source and build
COPY apps/api ./apps/api
RUN npm run prisma:generate --workspace=apps/api \
 && npm run build --workspace=apps/api

# Prune dev dependencies for a slim runtime layer.
RUN npm prune --omit=dev --workspace=apps/api

# --------- Runtime ---------
FROM node:20-alpine AS runtime

RUN apk add --no-cache tini libc6-compat curl
WORKDIR /app

ENV NODE_ENV=production \
    PORT=3000

# Pull only what's needed
COPY --from=builder /app/package.json /app/package-lock.json /app/tsconfig.base.json ./
COPY --from=builder /app/apps/api/package.json ./apps/api/
COPY --from=builder /app/apps/api/dist ./apps/api/dist
COPY --from=builder /app/apps/api/prisma ./apps/api/prisma
COPY --from=builder /app/node_modules ./node_modules
COPY --from=builder /app/apps/api/node_modules ./apps/api/node_modules

# Non-root user
RUN addgroup -S gpms && adduser -S gpms -G gpms \
 && mkdir -p /app/uploads && chown -R gpms:gpms /app
USER gpms

EXPOSE 3000

HEALTHCHECK --interval=30s --timeout=5s --retries=3 \
  CMD curl -fsS http://localhost:3000/api/v1/reference/airports || exit 1

ENTRYPOINT ["/sbin/tini", "--"]
CMD ["node", "apps/api/dist/src/main.js"]
