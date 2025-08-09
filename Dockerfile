# syntax=docker/dockerfile:1.6

# -------- Base image and common args --------
ARG NODE_VERSION=18-alpine

# -------- Dependencies (production) layer --------
FROM node:${NODE_VERSION} AS deps
WORKDIR /app
ENV NODE_ENV=production
COPY package.json package-lock.json ./
RUN --mount=type=cache,target=/root/.npm \
    npm ci --omit=dev

# -------- Build layer (dev deps) --------
FROM node:${NODE_VERSION} AS builder
WORKDIR /app
ENV NODE_ENV=development
COPY package.json package-lock.json ./
RUN --mount=type=cache,target=/root/.npm \
    npm ci
COPY tsconfig.json vitest.config.ts ./
COPY src ./src
RUN npm run build

# -------- Runtime layer --------
FROM node:${NODE_VERSION} AS runner
WORKDIR /app
ENV NODE_ENV=production \
    RIXA_PORT=3000 \
    RIXA_HOST=0.0.0.0

# Create non-root user (node user already exists in official image)
USER node

# Copy production node_modules and built assets
COPY --from=deps /app/node_modules ./node_modules
COPY --chown=node:node package.json ./
COPY --from=builder --chown=node:node /app/dist ./dist

EXPOSE 3000

# Default command
CMD ["node", "dist/index.js"]

