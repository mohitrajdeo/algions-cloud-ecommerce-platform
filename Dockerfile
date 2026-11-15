# ==========================================
# Multi-Stage Secure Dockerfile
# Base: node:20-alpine (Minimal CVE footprint)
# User: Non-root (node, UID 1000)
# ==========================================

# Stage 1: Dependency Builder
FROM node:20-alpine AS dependencies
WORKDIR /usr/src/app

COPY package*.json ./
RUN npm ci --only=production --ignore-scripts

# Stage 2: Production Minimal Runtime
FROM node:20-alpine AS runtime
WORKDIR /usr/src/app

# Security: Install dumb-init to properly handle PID 1 signal forwarding
RUN apk add --no-cache dumb-init curl

ENV NODE_ENV=production
ENV PORT=8080

COPY package*.json ./
COPY --from=dependencies /usr/src/app/node_modules ./node_modules
COPY src ./src

# Principle of Least Privilege: switch to non-root user
USER node

# Observability Healthcheck Probe
HEALTHCHECK --interval=15s --timeout=3s --start-period=5s --retries=3 \
  CMD curl -f http://localhost:8080/healthz || exit 1

EXPOSE 8080

ENTRYPOINT ["dumb-init", "--"]
CMD ["node", "src/server.js"]
