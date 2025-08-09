# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

RIXA (Runtime Intelligent eXecution Adapter) is an MCP Debug Adapter that bridges AI clients with VSCode's Debug Adapter Protocol (DAP). It translates MCP commands to DAP requests and relays DAP events back to AI clients for intelligent debugging workflows.

## Development Commands

### Core Development
- `npm run dev` - Start development server with hot reload using tsx watch
- `npm run build` - Compile TypeScript to JavaScript (outputs to dist/)
- `npm run start` - Run production build from dist/

### Testing
- `npm test` - Run all tests with Vitest
- `npm run test:watch` - Run tests in watch mode
- `npm run test:coverage` - Run tests with coverage reports

### Code Quality
- `npm run lint` - Run ESLint on TypeScript files
- `npm run lint:fix` - Run ESLint with automatic fixes
- `npm run format` - Format code with Prettier
- `npm run format:check` - Check code formatting without making changes
- `npm run typecheck` - Run TypeScript type checking without emitting files

### Utilities
- `npm run clean` - Remove dist directory
- `npm run prepare` - Automatically runs build (used by npm hooks)

## Architecture

RIXA follows a modular TypeScript architecture with strict type safety and comprehensive error handling:

### Core Modules
- **`src/core/`** - Core application logic (currently empty - TODO implementation)
- **`src/mcp/`** - MCP (Model Context Protocol) server implementation (TODO)
- **`src/dap/`** - DAP (Debug Adapter Protocol) client implementation (TODO)
- **`src/resources/`** - MCP resources for file system and debugging state (TODO)

### Type System
- **`src/types/config.ts`** - Zod schemas for all configuration validation
- **`src/types/common.ts`** - Shared types, error definitions, and correlation context

### Utilities
- **`src/utils/config.ts`** - Environment-based configuration loading with validation
- **`src/utils/logger.ts`** - Winston-based structured logging with correlation support
- **`src/utils/correlation.ts`** - Request/session ID generation and context management

### Configuration
Configuration is entirely environment-driven with comprehensive validation:

**Environment Variables:**
- `RIXA_PORT` - Server port (default: 3000)
- `RIXA_HOST` - Server host (default: localhost)
- `RIXA_AUTH_ENABLED` - Enable authentication (default: true)
- `RIXA_AUTH_TOKENS` - Comma-separated auth tokens
- `RIXA_FS_READ_ONLY` - Filesystem read-only mode (default: true)
- `RIXA_FS_ALLOWED_PATHS` - Comma-separated allowed filesystem paths
- `RIXA_LOG_LEVEL` - Logging level: error|warn|info|debug (default: info)
- `RIXA_DAP_DEFAULT_ADAPTER` - Default debug adapter (default: node)

## Development Patterns

### Error Handling
All errors use the custom `RixaError` class with structured error information:
- Typed error categories via `ErrorType` enum
- Correlation context (requestId, sessionId) for tracing
- Structured details for debugging
- JSON serialization support

### Logging
Structured logging with correlation context:
- Use `getLogger()` for global logger or `logger.child(context)` for contextual logging
- All log entries include correlation IDs for request tracing
- Winston-based with JSON format for production, simple format for development

### Type Safety
Strict TypeScript configuration with comprehensive type checking:
- All inputs validated with Zod schemas
- Path aliases configured for clean imports (`@/types/*`, `@/core/*`, etc.)
- Exact optional property types and unchecked indexed access prevention

### Testing Strategy
Vitest-based testing with comprehensive coverage:
- Unit tests for utilities and type validation
- Test files follow `*.test.ts` pattern
- Coverage excludes types and test files
- Global test environment with Node.js context

## Current Development Status

**Phase 0: Project Scaffolding** ✅ Complete
- TypeScript/Node.js setup with strict configuration
- Structured logging and configuration system  
- Development tooling (ESLint, Prettier, Vitest)

**Phase 1: Protocol Foundations** 🔄 In Progress
- MCP and DAP schema definitions (TODO)
- DAP client core implementation (TODO)
- MCP WebSocket server baseline (TODO)

The core/mcp/dap/resources directories are currently empty placeholders for upcoming implementation phases.

## Key Architectural Decisions

1. **Environment-First Configuration**: All configuration through environment variables with comprehensive Zod validation
2. **Correlation-Driven Logging**: Every request/operation tracked with UUID correlation context
3. **Protocol Agnostic Design**: Clean separation between MCP server logic and DAP client implementation
4. **Type-Safe Error Handling**: Custom error class with structured information and JSON serialization
5. **ESM Modules**: Modern ES modules with explicit `.js` extensions in imports for Node.js compatibility