# ManageX Backend Dockerfile
# Multi-stage build for production deployment

FROM node:20-alpine AS base
WORKDIR /app

# Install backend dependencies
COPY backend/package.json backend/package-lock.json ./
RUN npm ci --only=production

# Copy backend source
COPY backend/src ./src
COPY database ./database

# Create non-root user for runtime
RUN addgroup -S managex && adduser -S managex -G managex
USER managex

# Expose backend port
EXPOSE 4000

# Health check for orchestration
HEALTHCHECK --interval=30s --timeout=10s --start-period=5s --retries=3 \
  CMD wget --no-verbose --tries=1 --spider http://localhost:4000/api/v1/health || exit 1

CMD ["node", "src/index.js"]
