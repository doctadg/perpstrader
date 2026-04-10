# ---- Build stage ----
FROM node:20-slim AS builder

# Install build dependencies for native modules (better-sqlite3, sharp, sqlite3)
RUN apt-get update && apt-get install -y --no-install-recommends \
    python3 \
    make \
    g++ \
    && rm -rf /var/lib/apt/lists/*

WORKDIR /app

# Install dependencies first (layer caching)
COPY package.json package-lock.json ./
RUN npm ci

# Build TypeScript
COPY tsconfig.json ./
COPY src/ ./src/
COPY shared/ ./shared/
RUN npm run build

# ---- Runtime stage ----
FROM node:20-slim

# Runtime deps for native modules
RUN apt-get update && apt-get install -y --no-install-recommends \
    python3 \
    wget \
    && rm -rf /var/lib/apt/lists/*

WORKDIR /app

# Copy node_modules from builder (includes native binaries compiled for this arch)
COPY --from=builder /app/node_modules ./node_modules

# Copy built output
COPY --from=builder /app/bin ./bin

# Copy runtime files as root, then chown to node user
COPY package.json ./
COPY config/ ./config/
COPY dashboard/ ./dashboard/
COPY data/setup.sh ./data/setup.sh
COPY database/ ./database/
COPY migrations/ ./migrations/
COPY .env.example ./
COPY .env.enhanced.example ./

# Create data directory and set ownership for non-root user
RUN mkdir -p /app/data && chown -R node:node /app

# Run as non-root user
USER node

# Environment defaults
ENV NODE_ENV=production \
    DASHBOARD_PORT=3001 \
    LOG_LEVEL=info \
    REDIS_URL=redis://redis:6380 \
    CHROMA_HOST=chromadb \
    CHROMA_PORT=8001

EXPOSE 3001

HEALTHCHECK --interval=30s --timeout=10s --start-period=30s --retries=3 \
    CMD node -e "const http = require('http'); const req = http.get('http://localhost:3001/api/health', (res) => { process.exit(res.statusCode === 200 ? 0 : 1); }); req.on('error', () => process.exit(1));"

CMD ["node", "bin/dashboard-server.js"]
