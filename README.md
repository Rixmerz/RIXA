<div align="center">
  <img src="rixa-logo.png" alt="RIXA Logo" width="200" height="200">

  # RIXA - Runtime Intelligent eXecution Adapter

  **🔗 Bridging AI and Debugging**

  A production-ready Model Context Protocol (MCP) server that seamlessly connects AI clients with VSCode's Debug Adapter Protocol (DAP), enabling intelligent debugging workflows with advanced error recovery and comprehensive tooling.

  [![CI](https://github.com/Rixmerz/RIXA/actions/workflows/ci.yml/badge.svg)](https://github.com/Rixmerz/RIXA/actions/workflows/ci.yml)
  [![TypeScript](https://img.shields.io/badge/TypeScript-5.9-blue.svg)](https://www.typescriptlang.org/)
  [![Node.js](https://img.shields.io/badge/Node.js-20+-green.svg)](https://nodejs.org/)
  [![Docker](https://img.shields.io/badge/Docker-Ready-blue.svg)](https://www.docker.com/)
  [![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](https://opensource.org/licenses/MIT)
</div>

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

## ✨ Features

### 🔧 **17 MCP Debugging Tools**
- **Session Management**: Create, configure, and manage debugging sessions
- **Execution Control**: Continue, pause, step-in, step-over, step-out, restart
- **Breakpoint Management**: Set, remove, and list breakpoints with conditions
- **State Inspection**: Stack traces, variables, scopes, and expression evaluation
- **Enhanced Tools**: Advanced stack traces, variable analysis, and debugging statistics

### 🛡️ **Advanced Error Handling**
- **4 Recovery Strategies**: Timeout retry, parameter correction, graceful degradation, session reconnection
- **Error Analytics**: Comprehensive error tracking and statistics
- **Auto-Recovery**: Intelligent error recovery with context preservation

### 🚦 **Production-Ready Infrastructure**
- **Health Monitoring**: `/health` and `/metrics` endpoints with detailed system status
- **Rate Limiting**: Configurable request throttling with per-connection tracking
- **Security**: Token-based authentication, filesystem sandboxing, input validation
- **Observability**: Structured logging with correlation IDs and request tracing

### 📁 **Secure Filesystem Access**
- **Resource Provider**: Safe project tree and file access with configurable policies
- **Read/Write Operations**: Controlled file operations with size limits and pattern exclusions
- **MIME Type Detection**: Automatic content type detection and encoding handling

## Quick Start

### Prerequisites

- Node.js 20+ (required for dependencies)
- TypeScript 5.9+
- A DAP-compatible debugger (e.g., Node.js debugger, Python debugger)

### Installation

```bash
# Clone the repository
git clone https://github.com/Rixmerz/RIXA.git
cd RIXA

# Install dependencies
npm ci

# Copy environment configuration
cp .env.example .env

# Edit .env with your settings (token, allowed paths, etc.)
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

# Or using Docker
docker build -t rixmerz/rixa:latest .
docker run --rm -p 3000:3000 \
  -e RIXA_AUTH_ENABLED=true \
  -e RIXA_AUTH_TOKENS=my-token \
  -e RIXA_FS_ALLOWED_PATHS=/workspace \
  -e RIXA_LOG_LEVEL=info \
  rixmerz/rixa:latest
```

## Configuration

Configuration is managed through environment variables. See `.env.example` for all available options.

### Key Configuration Areas

- **Server**: Port, host, CORS settings
- **Authentication**: Token-based auth, session timeouts
- **Filesystem**: Read-only mode, allowed paths, file size limits
- **DAP**: Default adapter, timeout settings
- **Logging**: Level, format, file output

## 🚀 Development Status

### ✅ **Phase 1-4: COMPLETE - Production Ready**

**🔧 Phase 1: Protocol Foundations** ✅
- Complete MCP ↔ DAP bridge implementation
- 17 debugging tools with comprehensive DAP mapping
- WebSocket server with session management

**🛡️ Phase 2: Advanced Features** ✅
- 4 intelligent error recovery strategies
- Enhanced debugging tools with analytics
- Comprehensive error tracking and statistics

**📊 Phase 3: Production Infrastructure** ✅
- Health monitoring with `/health` and `/metrics` endpoints
- Rate limiting with per-connection tracking
- Secure filesystem resource provider
- Structured logging with correlation IDs

**🐳 Phase 4: Deployment & CI/CD** ✅
- Docker containerization with multi-stage builds
- GitHub Actions CI/CD pipeline
- Comprehensive test suite (133 tests passing)
- Production deployment documentation

### 📈 **Current Metrics**
- **17** MCP debugging tools implemented
- **4** error recovery strategies active
- **133** unit tests passing (100% success rate)
- **Docker** ready for production deployment
- **CI/CD** pipeline with automated testing

## 🤝 Contributing

1. **Code Quality**: Follow TypeScript strict mode patterns and maintain 100% test coverage
2. **Testing**: Add comprehensive tests for new functionality using Vitest
3. **Logging**: Use structured logging with correlation IDs for traceability
4. **Validation**: Validate all inputs with Zod schemas for type safety
5. **Error Handling**: Follow established error recovery patterns and strategies
6. **Documentation**: Update relevant documentation and examples

## 📊 Project Statistics

- **Language**: TypeScript 5.9+ with strict mode
- **Runtime**: Node.js 20+ (production requirement)
- **Test Coverage**: 133 unit tests with 100% pass rate
- **Build System**: TypeScript compiler + tsc-alias for path resolution
- **CI/CD**: GitHub Actions with automated testing and linting
- **Container**: Multi-stage Docker build optimized for production

## 📄 License

MIT License - see [LICENSE](LICENSE) file for details.

---

<div align="center">
  <strong>Built with ❤️ for AI-powered debugging workflows</strong>
  <br>
  <sub>RIXA bridges the gap between AI intelligence and developer tools</sub>
</div>
