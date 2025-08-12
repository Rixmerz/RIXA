<div align="center">
  <img src="rixa-logo.png" alt="RIXA Logo" width="200" height="200">

  # RIXA - Runtime Intelligent eXecution Adapter

  **🔗 Bridging AI and Debugging**

  A production-ready Model Context Protocol (MCP) server that seamlessly connects AI clients with VSCode's Debug Adapter Protocol (DAP), enabling intelligent debugging workflows with advanced error recovery and comprehensive tooling.

  [![CI](https://github.com/Rixmerz/RIXA/actions/workflows/ci.yml/badge.svg)](https://github.com/Rixmerz/RIXA/actions/workflows/ci.yml)
  [![TypeScript](https://img.shields.io/badge/TypeScript-5.9-blue.svg)](https://www.typescriptlang.org/)
  [![Node.js](https://img.shields.io/badge/Node.js-20+-green.svg)](https://nodejs.org/)
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

### 🔧 **27 MCP Debugging Tools**
- **Session Management**: Create, configure, and manage debugging sessions
- **Execution Control**: Continue, pause, step-in, step-over, step-out, restart
- **Breakpoint Management**: Set, remove, and list breakpoints with conditions
- **State Inspection**: Stack traces, variables, scopes, and expression evaluation
- **Enhanced Tools**: Advanced stack traces, variable analysis, and debugging statistics
- **Diagnostics**: Environment validation, adapter testing, health checks, and setup wizards

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

# Build the project
npm run build
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

# Lint code
npm run lint
```

### Production

```bash
# Build and start
npm run build
npm start
```

## Configuration

RIXA is primarily used as an MCP server for Claude Desktop integration. See the MCP Integration section below for setup.

## 🚀 Development Status

### ✅ **Phase 1-4: COMPLETE - Production Ready**

**🔧 Phase 1: Protocol Foundations** ✅
- Complete MCP ↔ DAP bridge implementation
- 27 debugging tools with comprehensive DAP mapping
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

**🐳 Phase 4: Testing & Quality** ✅
- GitHub Actions CI/CD pipeline
- Comprehensive test suite (133 tests passing)
- Production-ready MCP integration

### 📈 **Current Metrics**
- **27** MCP debugging tools implemented
- **4** error recovery strategies active
- **133** unit tests passing (100% success rate)
- **MCP** ready for Claude Desktop integration
- **CI/CD** pipeline with automated testing

## 🔗 MCP Integration

### Claude Desktop Setup (Simple!)

RIXA works with Claude Desktop via MCP stdio. Setup is just: build + configure.

#### 🚀 Quick Setup

1. **Build RIXA**:
   ```bash
   npm run build
   ```

2. **Add to Claude Desktop config**:

   **Config file locations**:
   - **macOS**: `~/Library/Application Support/Claude/claude_desktop_config.json`
   - **Windows**: `%APPDATA%/Claude/claude_desktop_config.json`
   - **Linux**: `~/.config/Claude/claude_desktop_config.json`

3. **Add this to your config**:
   ```json
   {
     "mcpServers": {
       "rixa": {
         "command": "node",
         "args": ["/Users/username/my_projects/RIXA/dist/index.js", "--stdio"],
         "env": {
           "RIXA_AUTH_ENABLED": "false",
           "RIXA_FS_ALLOWED_PATHS": "/Users/username/my_projects",
           "RIXA_LOG_LEVEL": "error"
         }
       }
     }
   }
   ```

4. **Update the path**: Replace `/Users/username/my_projects/RIXA` with your actual RIXA location

5. **Restart Claude Desktop**

#### ✅ Verification

After setup, verify the integration is working:

1. **Open Claude Desktop**
2. **Ask Claude**: "What debugging tools do you have available?"
3. **Expected Response**: Claude should list RIXA's 27 debugging tools:
   - `debug_createSession` - Create new debugging session
   - `debug_setBreakpoints` - Set breakpoints in code
   - `debug_continue` - Continue execution
   - `debug_stepOver` - Step over current line
   - `debug_getStackTrace` - Get current call stack
   - …and 19 more tools (`debug_evaluate`, `debug_getThreads`, `debug_health`, etc.)

#### 🔧 Troubleshooting

**Common Issues:**
- **"RIXA tools not available"**: Check file paths in config, ensure RIXA is built (`npm run build`)
- **"Permission denied"**: Check `RIXA_FS_ALLOWED_PATHS` includes your project directory
- **"File not found errors"**: Ensure paths use forward slashes, even on Windows

**Debug Steps:**
1. Check RIXA logs in `/tmp/rixa.log`
2. Validate JSON syntax in config file
3. Ensure Claude Desktop can access RIXA installation directory

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
- **Integration**: MCP stdio protocol for seamless AI integration

## 📄 License

MIT License - see [LICENSE](LICENSE) file for details.

---

<div align="center">
  <strong>Built with ❤️ for AI-powered debugging workflows</strong>
  <br>
  <sub>RIXA bridges the gap between AI intelligence and developer tools</sub>
</div>
