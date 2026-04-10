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
    && rm -rf /var/lib/apt/lists/*

WORKDIR /app

# Copy node_modules from builder (includes native binaries compiled for this arch)
COPY --from=builder /app/node_modules ./node_modules

# Copy built output
COPY --from=builder /app/bin ./bin

# Copy runtime files
COPY package.json ./
COPY config/ ./config/
COPY dashboard/ ./dashboard/
COPY data/setup.sh ./data/setup.sh
COPY database/ ./database/
COPY migrations/ ./migrations/

# Create data directory for SQLite databases
RUN mkdir -p /app/data

# Environment defaults
ENV NODE_ENV=production \
    DASHBOARD_PORT=3001 \
    LOG_LEVEL=info \
    REDIS_URL=redis://redis:6380 \
    CHROMA_HOST=chromadb \
    CHROMA_PORT=8001

EXPOSE 3001

CMD ["node", "bin/dashboard-server.js"]
