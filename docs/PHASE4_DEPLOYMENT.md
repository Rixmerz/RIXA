# Phase 4 - Production Readiness

This document describes how to build, run, and operate RIXA in production.

## Build Artifacts

- TypeScript compiled to dist/
- Docker image (multi-stage):
  - node:18-alpine base
  - Non-root user (node)
  - Port 3000

## Docker

Build locally:

```bash
docker build -t rixmerz/rixa:latest .
```

Run with environment:

```bash
docker run --rm -p 3000:3000 \
  -e RIXA_AUTH_ENABLED=true \
  -e RIXA_AUTH_TOKENS=my-token \
  -e RIXA_FS_ALLOWED_PATHS=/workspace \
  -e RIXA_LOG_LEVEL=info \
  rixmerz/rixa:latest
```

Production tips:
- Use a real token and rotate periodically
- Mount only required volumes for filesystem access
- Keep logs in JSON for ingestion

## Environment Variables

See .env.example. Key settings:
- RIXA_PORT (default 3000)
- RIXA_HOST (default 0.0.0.0 in Docker)
- RIXA_AUTH_ENABLED (default true)
- RIXA_AUTH_TOKENS (comma-separated)
- RIXA_FS_ALLOWED_PATHS (comma-separated)
- RIXA_LOG_LEVEL, RIXA_LOG_FORMAT

## Health and Metrics

Endpoints exposed on the same HTTP server:
- GET /health -> { status, checks, serverInfo }
- GET /metrics -> { uptime, memory, request counters }

## Security

- Token-based auth is enabled by default; clients must authenticate via MCP initialize
- Filesystem access is sandboxed by allowed paths and patterns
- Logs do not include secrets; ensure log stores are access-controlled

## Observability & Operations

- Structured logs (Winston) with requestId correlation
- Rate limiter metrics integrated with health monitor
- Error stats available via tools: debug/getErrorStats, debug/resetErrorStats

## CI

GitHub Actions CI runs typecheck, lint, unit tests, and build for Node 18.x

## Running without Docker

```bash
npm ci
cp .env.example .env
npm run build
npm start
```

