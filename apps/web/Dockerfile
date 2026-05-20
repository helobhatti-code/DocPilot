# --------- Builder ---------
FROM node:20-alpine AS builder

WORKDIR /app

# Both workspace package.json files are copied so npm ci can resolve the
# `apps/*` workspace glob declared in the root package.json.
COPY package.json package-lock.json tsconfig.base.json ./
COPY apps/web/package.json ./apps/web/
COPY apps/api/package.json ./apps/api/
RUN npm ci --include-workspace-root --workspace=apps/web

COPY apps/web ./apps/web
ARG VITE_API_URL=/api/v1
ENV VITE_API_URL=$VITE_API_URL
RUN npm run build --workspace=apps/web

# --------- Runtime (nginx) ---------
FROM nginx:1.27-alpine AS runtime

COPY --from=builder /app/apps/web/dist /usr/share/nginx/html
COPY apps/web/nginx.conf /etc/nginx/conf.d/default.conf

EXPOSE 80

HEALTHCHECK --interval=30s --timeout=5s --retries=3 \
  CMD wget -qO- http://localhost/ >/dev/null 2>&1 || exit 1

CMD ["nginx", "-g", "daemon off;"]
