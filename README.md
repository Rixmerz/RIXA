# RIXA - Runtime Intelligent eXecution Adapter

A Model Context Protocol (MCP) server that bridges AI clients with VSCode's Debug Adapter Protocol (DAP), enabling intelligent debugging workflows.

## Overview

RIXA translates MCP commands to DAP requests and relays DAP events back to AI clients, providing a seamless debugging experience for AI-assisted development.

## Architecture

```
+-----------------+           MCP           +----------------------+
|      AI (MCP)   | <---------------------> |  MCP Debug Adapter   |
+-----------------+                         +-----------+----------+
                                                      |
                                              DAP (Debug Adapter Protocol)
                                                      |
                                             +--------v---------+
                                             |  VSCode Debugger  |
                                             +-------------------+
```

## Features

- **Bi-directional Protocol Translation**: MCP ↔ DAP command and event mapping
- **Session Management**: Multiple concurrent debugging sessions with isolation
- **File System Resources**: Safe project tree and file access with configurable policies
- **Execution Control**: Run, pause, step-in, step-over, step-out operations
- **State Inspection**: Variables, call stack, scopes, and expression evaluation
- **Security**: Token-based authentication, filesystem sandboxing, input validation
- **Observability**: Structured logging, correlation IDs, metrics

## Quick Start

### Prerequisites

- Node.js 18+ 
- TypeScript
- A DAP-compatible debugger (e.g., Node.js debugger)

### Installation

```bash
# Clone the repository
git clone <repository-url>
cd rixa

# Install dependencies
npm install

# Copy environment configuration
cp .env.example .env

# Edit .env with your settings
```

### Development

```bash
# Start in development mode with hot reload
npm run dev

# Build the project
npm run build

# Run tests
npm test

# Run tests with coverage
npm run test:coverage

# Lint and format
npm run lint
npm run format
```

### Production

```bash
# Build and start
npm run build
npm start
```

## Configuration

Configuration is managed through environment variables. See `.env.example` for all available options.

### Key Configuration Areas

- **Server**: Port, host, CORS settings
- **Authentication**: Token-based auth, session timeouts
- **Filesystem**: Read-only mode, allowed paths, file size limits
- **DAP**: Default adapter, timeout settings
- **Logging**: Level, format, file output

## Development Status

🚧 **Phase 0: Project Scaffolding** - ✅ Complete
- TypeScript/Node.js setup with strict configuration
- Structured logging and configuration system
- Development tooling (ESLint, Prettier, Vitest)

🔄 **Phase 1: Protocol Foundations** - In Progress
- MCP and DAP schema definitions
- DAP client core implementation
- MCP WebSocket server baseline

📋 **Upcoming Phases**
- Session management and lifecycle
- Command and event mapping
- Filesystem resources
- Security hardening
- Integration testing

## Contributing

1. Follow the established TypeScript strict mode patterns
2. Add tests for new functionality
3. Use structured logging with correlation IDs
4. Validate all inputs with Zod schemas
5. Follow the existing error handling patterns

## License

MIT
