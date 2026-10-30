# =========================================================================
# DHUSHYANDH AI API — Production Multi-Stage Dockerfile
# Runtime: Node.js 22 LTS Alpine
# Security: Non-root user (node), dumb-init PID 1 supervisor, zero devDependencies
# =========================================================================

# Stage 1: Dependency resolution
FROM node:22-alpine AS dependencies
WORKDIR /app

COPY package*.json ./
RUN npm ci --omit=dev --ignore-scripts && npm cache clean --force

# Stage 2: Minimal Production Runtime
FROM node:22-alpine AS runner
WORKDIR /app

ENV NODE_ENV=production
ENV PORT=5000

# Install dumb-init for proper Linux signal forwarding (SIGTERM / SIGINT)
RUN apk add --no-cache dumb-init

# Copy production dependencies from build stage
COPY --from=dependencies --chown=node:node /app/node_modules ./node_modules
COPY --chown=node:node package*.json ./
COPY --chown=node:node src/ ./src/
COPY --chown=node:node assets/ ./assets/

# Execute as non-root user (uid 1000)
USER node

EXPOSE 5000

# Native Node.js HTTP healthcheck
HEALTHCHECK --interval=30s --timeout=10s --start-period=15s --retries=3 \
  CMD node -e "fetch('http://localhost:5000/api/health').then(r => process.exit(r.ok ? 0 : 1)).catch(() => process.exit(1));"

ENTRYPOINT ["dumb-init", "--"]
CMD ["node", "src/server.js"]
