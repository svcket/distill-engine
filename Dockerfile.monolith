# Multi-stage production Dockerfile for Distill Engine (Next.js + Python Harvester)

# Stage 1: Build Next.js
FROM node:20-slim AS builder
WORKDIR /app
ENV NEXT_TELEMETRY_DISABLED=1

# Install OpenSSL for Prisma
RUN apt-get update && apt-get install -y openssl && rm -rf /var/lib/apt/lists/*

COPY web/package*.json ./web/
WORKDIR /app/web
RUN npm ci

COPY web/ ./
COPY prisma/ /app/prisma/

# Generate Prisma Client
RUN npx prisma generate

# Build Next.js app
RUN npm run build

# Stage 2: Production Runner
FROM node:20-slim AS runner
WORKDIR /app
ENV NODE_ENV=production
ENV NEXT_TELEMETRY_DISABLED=1

# Install Python 3, pip, and FFmpeg for the Harvester
RUN apt-get update && apt-get install -y \
    python3 \
    python3-pip \
    python3-venv \
    ffmpeg \
    openssl \
    ca-certificates \
    && rm -rf /var/lib/apt/lists/*

# Setup Python environment
ENV VIRTUAL_ENV=/app/venv
RUN python3 -m venv $VIRTUAL_ENV
ENV PATH="$VIRTUAL_ENV/bin:$PATH"

# Install Python Harvester dependencies
COPY execution/requirements.txt ./execution/
RUN pip install --no-cache-dir -r ./execution/requirements.txt

# Copy Next.js Build
COPY --from=builder /app/web/public ./web/public
COPY --from=builder /app/web/.next ./web/.next
COPY --from=builder /app/web/node_modules ./web/node_modules
COPY --from=builder /app/web/package.json ./web/package.json
COPY --from=builder /app/web/next.config.ts ./web/

# Copy Harvester and Persistence assets
COPY execution/ ./execution/
COPY prisma/ ./prisma/

# Create results directory for persistence
RUN mkdir -p /app/execution/.tmp/results \
    && mkdir -p /app/execution/.tmp/monitoring \
    && chmod -R 777 /app/execution/.tmp

# Expose Next.js port
EXPOSE 3000

ENV PORT=3000
ENV HOSTNAME="0.0.0.0"

# Launch command
WORKDIR /app/web
CMD ["npm", "start"]
