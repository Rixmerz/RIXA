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

## 🔗 MCP Integration

### Claude Desktop Setup (MCP via stdio)

Important: RIXA debe ejecutarse con `--stdio` en Claude Desktop.

RIXA integrates seamlessly with Claude Desktop and other MCP clients. Follow these steps to connect RIXA with Claude Desktop:

#### 📍 Configuration File Location

The Claude Desktop configuration file location varies by operating system:

- **macOS**: `~/Library/Application Support/Claude/claude_desktop_config.json`
- **Windows**: `%APPDATA%/Claude/claude_desktop_config.json`
- **Linux**: `~/.config/Claude/claude_desktop_config.json`

#### 🚀 Quick Setup

1. **Build RIXA**:
   ```bash
   cd /path/to/RIXA
   npm run build
   ```

2. **Create/Edit Claude Desktop Config**:
   ```bash
   # macOS
   mkdir -p ~/Library/Application\ Support/Claude
   nano ~/Library/Application\ Support/Claude/claude_desktop_config.json

   # Windows (PowerShell)
   New-Item -ItemType Directory -Force -Path "$env:APPDATA\Claude"
   notepad "$env:APPDATA\Claude\claude_desktop_config.json"

   # Linux
   mkdir -p ~/.config/Claude
   nano ~/.config/Claude/claude_desktop_config.json
   ```

3. **Add RIXA Configuration**:

   **Basic Configuration (Claude Code example that works out of the box)**:
   ```json
   {
     "mcpServers": {
       "rixa": {
         "command": "node",
         "args": ["/path/to/your/RIXA/dist/index.js", "--stdio"],
         "env": {
           "RIXA_AUTH_ENABLED": "false",
           "RIXA_FS_ALLOWED_PATHS": "/Users/juanpablodiaz/my_projects",
           "RIXA_LOG_LEVEL": "error",
           "RIXA_LOG_FILE": "/tmp/rixa.log"
         }
       }
     }
   }
   ```

   **Advanced Configuration** (for power users):
   ```json
   {
     "mcpServers": {
       "rixa": {
         "command": "node",
         "args": ["/path/to/your/RIXA/dist/index.js", "--stdio"],
         "env": {
           "RIXA_AUTH_ENABLED": "true",
           "RIXA_AUTH_TOKENS": "primary-token,backup-token",
           "RIXA_FS_ALLOWED_PATHS": "/Users/yourname/projects:/Users/yourname/workspace",
           "RIXA_FS_READ_ONLY": "false",
           "RIXA_FS_MAX_FILE_SIZE": "10485760",
           "RIXA_FS_EXCLUDE_PATTERNS": "node_modules/**,*.log,.git/**",
           "RIXA_RATE_LIMIT_ENABLED": "true",
           "RIXA_RATE_LIMIT_MAX_REQUESTS": "100",
           "RIXA_LOG_LEVEL": "info"
         }
       }
     }
   }
   ```

4. **Customize Configuration**:
   - Replace `/path/to/your/RIXA/dist/index.js` with your actual RIXA installation path
   - Replace `your-secure-token-here` with a strong, unique token
   - Update `RIXA_FS_ALLOWED_PATHS` with directories you want to debug
   - Adjust other settings as needed

5. **Restart Claude Desktop**

#### ✅ Verification

After setup, verify the integration is working:

1. **Open Claude Desktop**
2. **Ask Claude**: "What debugging tools do you have available?"
3. **Expected Response**: Claude should list RIXA's debugging tools (nombres compatibles con Claude):
   - `debug_createSession` - Create new debugging session
   - `debug_setBreakpoints` - Set breakpoints in code
   - `debug_continue` - Continue execution
   - `debug_stepOver` - Step over current line
   - `debug_getStackTrace` - Get current call stack
   - …y el resto (`debug_evaluate`, `debug_getThreads`, etc.)

#### 🔧 Troubleshooting

**Common Issues and Solutions:**

| Issue | Solution |
|-------|----------|
| "RIXA tools not available" | Check file paths in config, ensure RIXA is built (`npm run build`) |
| "Authentication failed" | Verify `RIXA_AUTH_TOKENS` matches your token |
| "Permission denied" | Check `RIXA_FS_ALLOWED_PATHS` includes your project directory |
| "Connection timeout" | Increase `RIXA_DAP_TIMEOUT` or check if port 3000 is available |
| "File not found errors" | Ensure paths use forward slashes, even on Windows |

**Debug Steps:**
1. **Check RIXA logs**: Look for startup errors in console or log file
2. **Test RIXA directly**: Run `npm start` and check `http://localhost:3000/health`
3. **Validate JSON**: Ensure configuration file has valid JSON syntax
4. **Check permissions**: Ensure Claude Desktop can access RIXA installation directory

**Configuration Templates:**
- See `claude_desktop_config.json` for full configuration template with comments
- See `examples/claude-desktop-basic.json` for minimal setup
- See `examples/claude-desktop-advanced.json` for production setup

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
