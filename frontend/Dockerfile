# # ─── Stage 1: Build ───────────────────────────────────────────────────────────
# FROM node:20-bookworm-slim AS builder
# WORKDIR /app

# COPY package*.json ./

# RUN npm ci --include=optional && \
#     npm cache clean --force

# COPY . .

# ARG VITE_API_URL
# ARG VITE_APP_NAME=TaskFlow
# ARG VITE_APP_ENV=production

# ENV VITE_API_URL=${VITE_API_URL} \
#     VITE_APP_NAME=${VITE_APP_NAME} \
#     VITE_APP_ENV=${VITE_APP_ENV}

# RUN npm run build

# # ─── Stage 2: Production Nginx ────────────────────────────────────────────────
# FROM nginx:1.25-alpine AS production

# # Remove default config
# RUN rm /etc/nginx/conf.d/default.conf

# # Copy custom nginx config (listens on 8080 — no privileged port, no NET_BIND_SERVICE needed)
# COPY nginx.conf /etc/nginx/conf.d/default.conf

# # Copy built assets
# COPY --from=builder /app/dist /usr/share/nginx/html

# # Security: non-root nginx
# # Port 8080 does not require NET_BIND_SERVICE, so this runs on any cluster
# # with runAsNonRoot: true and a default seccomp profile.
# RUN addgroup -g 1001 -S nginx-app && \
#     adduser -u 1001 -S nginx-app -G nginx-app && \
#     chown -R nginx-app:nginx-app /usr/share/nginx/html && \
#     chown -R nginx-app:nginx-app /var/cache/nginx && \
#     chown -R nginx-app:nginx-app /var/log/nginx && \
#     touch /var/run/nginx.pid && \
#     chown -R nginx-app:nginx-app /var/run/nginx.pid && \
#     sed -i '/^user /d' /etc/nginx/nginx.conf

# USER nginx-app

# EXPOSE 8080

# # HEALTHCHECK --interval=30s --timeout=5s --start-period=10s --retries=3 \
# #   CMD wget --spider -q http://localhost:8080/ || exit 1

# HEALTHCHECK --interval=30s --timeout=5s --start-period=10s --retries=3 \
#   CMD wget --spider -q http://127.0.0.1:8080/health || exit 1

# CMD ["nginx", "-g", "daemon off;"]

# ─── Stage 1: Build ───────────────────────────────────────────────────────────
FROM node:20-bookworm-slim AS builder
WORKDIR /app

COPY package*.json ./

RUN npm ci --include=optional && \
    npm cache clean --force

COPY . .

ARG VITE_API_URL
ARG VITE_APP_NAME=TaskFlow
ARG VITE_APP_ENV=production

ENV VITE_API_URL=${VITE_API_URL} \
    VITE_APP_NAME=${VITE_APP_NAME} \
    VITE_APP_ENV=${VITE_APP_ENV}

RUN npm run build

# ─── Stage 2: Production Nginx ────────────────────────────────────────────────
FROM nginx:1.27-alpine AS production

# Security: patch all OS packages — nginx:1.25-alpine resolved to an EOL
# Alpine base (3.19, no longer receiving security updates), which is why
# Trivy flagged 93 findings including 3 CRITICAL / 17 HIGH baked into the
# base image itself. Bumping the tag + upgrading here keeps this current
# even as new patches land after this image is built.
RUN apk update && apk upgrade --no-cache

# Remove default config
RUN rm /etc/nginx/conf.d/default.conf

# Copy custom nginx config (listens on 8080 — no privileged port, no NET_BIND_SERVICE needed)
COPY nginx.conf /etc/nginx/conf.d/default.conf

# Copy built assets
COPY --from=builder /app/dist /usr/share/nginx/html

# Security: non-root nginx
# Port 8080 does not require NET_BIND_SERVICE, so this runs on any cluster
# with runAsNonRoot: true and a default seccomp profile.
RUN addgroup -g 1001 -S nginx-app && \
    adduser -u 1001 -S nginx-app -G nginx-app && \
    chown -R nginx-app:nginx-app /usr/share/nginx/html && \
    chown -R nginx-app:nginx-app /var/cache/nginx && \
    chown -R nginx-app:nginx-app /var/log/nginx && \
    touch /var/run/nginx.pid && \
    chown -R nginx-app:nginx-app /var/run/nginx.pid && \
    sed -i '/^user /d' /etc/nginx/nginx.conf

USER nginx-app

EXPOSE 8080

# HEALTHCHECK --interval=30s --timeout=5s --start-period=10s --retries=3 \
#   CMD wget --spider -q http://localhost:8080/ || exit 1

HEALTHCHECK --interval=30s --timeout=5s --start-period=10s --retries=3 \
  CMD wget --spider -q http://127.0.0.1:8080/health || exit 1

CMD ["nginx", "-g", "daemon off;"]
