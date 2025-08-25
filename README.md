<div align="center">
  <img src="rixa-logo.png" alt="RIXA Logo" width="200" height="200">

  # RIXA - Runtime Intelligent eXecution Adapter

  **🔗 AI-Powered Universal Debugging Platform**

  A comprehensive MCP server that bridges AI clients with debugging protocols, supporting 6+ languages with advanced debugging capabilities including Electron apps, web frameworks, and enterprise applications.

  [![CI](https://github.com/Rixmerz/RIXA/actions/workflows/ci.yml/badge.svg)](https://github.com/Rixmerz/RIXA/actions/workflows/ci.yml)
  [![TypeScript](https://img.shields.io/badge/TypeScript-5.9-blue.svg)](https://www.typescriptlang.org/)
  [![Node.js](https://img.shields.io/badge/Node.js-20+-green.svg)](https://nodejs.org/)
  [![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](https://opensource.org/licenses/MIT)
</div>

## 🎯 Overview

RIXA is a **universal debugging platform** that connects AI assistants with debugging protocols through MCP (Model Context Protocol). It provides comprehensive debugging capabilities for modern applications across multiple languages, frameworks, and platforms.

### ✨ **Key Features**

- **🌐 Universal Protocol Bridge**: MCP ↔ DAP translation with intelligent error recovery
- **🔧 Multi-Language Support**: 6+ languages with framework-specific debugging tools
- **⚡ Electron Debugging**: Complete Electron app debugging with IPC, security, and performance analysis
- **🧪 Advanced Testing**: Integrated debugging + testing workflows with coverage tracking
- **🛡️ Production Ready**: Rate limiting, security controls, health monitoring, and observability

## 🏗️ Architecture

```
┌─────────────────┐    MCP     ┌──────────────────────┐    DAP     ┌─────────────────┐
│   AI Assistant  │ ◄────────► │       RIXA           │ ◄────────► │  Debug Adapters │
│  (Claude, etc.) │            │  Universal Bridge    │            │ (Node, Python,  │
└─────────────────┘            └──────────────────────┘            │  Java, Go, etc.)│
                                         │                         └─────────────────┘
                                         ▼
                               ┌──────────────────────┐
                               │   Target Application │
                               │ (Any Language/Stack) │
                               └──────────────────────┘
```

## 🚀 **Supported Languages & Frameworks**

### **Core Language Support**
| Language | Status | Debug Adapter | Framework Support |
|----------|--------|---------------|-------------------|
| **JavaScript/TypeScript** | ✅ **Complete** | Node.js, Chrome DevTools | React, Next.js, Express, Nest.js |
| **Java** | ✅ **Complete** | JDWP | Spring Boot, Maven, Gradle |
| **Python** | ✅ **Complete** | debugpy | Django, Flask, FastAPI |
| **PHP** | ✅ **Complete** | Xdebug | Laravel, Symfony, WordPress |
| **Go** | ✅ **Complete** | Delve | Gin, Echo, standard library |
| **Rust** | ✅ **Complete** | GDB/LLDB | Actix-web, Rocket, Tokio |
| **Electron** | ✅ **Complete** | Chrome DevTools + Node.js | Main/Renderer processes, IPC |

### **Advanced Debugging Features**
- **🔍 Multi-Process Debugging**: Main, renderer, and worker processes
- **🔗 IPC Communication Analysis**: Real-time message inspection and tracing
- **🛡️ Security Analysis**: Context isolation, permissions, vulnerability detection
- **⚡ Performance Profiling**: Memory, CPU, and rendering performance metrics
- **🎯 GUI Element Debugging**: DOM inspection, event simulation, accessibility analysis
- **🧪 Integrated Testing**: Debug tests alongside application code

### **Enterprise Features**
- **📊 Health Monitoring**: System metrics, session tracking, error analytics
- **🚦 Rate Limiting**: Request throttling and abuse prevention
- **🔐 Security Controls**: Path validation, input sanitization, authentication
- **📝 Observability**: Structured logging with correlation IDs and tracing

## 🔧 **MCP Tools Available**

RIXA provides **35+ debugging tools** organized into specialized categories:

### **Core Debugging Tools (27 tools)**
- **Session Management**: Create, attach, terminate debugging sessions
- **Execution Control**: Continue, pause, step operations, restart
- **Breakpoint Management**: Set, remove, list breakpoints with conditions
- **State Inspection**: Stack traces, variables, scopes, expression evaluation
- **Enhanced Analysis**: Deep variable inspection, performance metrics
- **Environment Diagnostics**: Adapter validation, setup wizards, health checks

### **Electron-Specific Tools (8 tools)**
- **Process Management**: Main/renderer process debugging and coordination
- **IPC Debugging**: Inter-process communication analysis and tracing
- **Security Analysis**: Context isolation, permissions, vulnerability scanning
- **Performance Profiling**: Memory usage, CPU metrics, rendering performance
- **GUI Debugging**: DOM inspection, event simulation, accessibility testing

## 🚀 **Quick Start**

### **Installation**
```bash
# Clone the repository
git clone https://github.com/Rixmerz/RIXA.git
cd RIXA

# Install dependencies
npm install

# Build the project
npm run build

# Run tests
npm test
```

### **Configuration**
Add RIXA to your MCP client configuration:

```json
{
  "mcpServers": {
    "rixa": {
      "command": "node",
      "args": ["/path/to/RIXA/dist/index.js", "--stdio"],
      "env": {
        "RIXA_LOG_LEVEL": "info",
        "RIXA_FS_ALLOWED_PATHS": "/your/project/path"
      }
    }
  }
}
```

### **Basic Usage**
```typescript
// Start a debugging session
await mcp.callTool('debug_createSession', {
  adapter: 'node',
  program: './dist/app.js',
  cwd: '/path/to/project'
});

// Set breakpoints
await mcp.callTool('debug_setBreakpoints', {
  sessionId: 'session-123',
  source: { path: './src/app.ts' },
  breakpoints: [{ line: 42, condition: 'user.id > 100' }]
});

// Continue execution
await mcp.callTool('debug_continue', {
  sessionId: 'session-123',
  threadId: 1
});
```

## 🧪 **Testing & Quality**

RIXA includes comprehensive testing to ensure reliability:

- **133+ Test Suites**: Complete coverage of all debugging scenarios
- **Integration Tests**: End-to-end MCP ↔ DAP workflows
- **Security Tests**: Path traversal prevention, input validation
- **Performance Tests**: Rate limiting, memory usage, error recovery
- **CI/CD Pipeline**: Automated testing on every commit

### **Test Results**
```bash
npm test
# ✅ 133 tests passing
# ✅ All language adapters validated
# ✅ Security controls verified
# ✅ Error recovery tested
```

## 📁 **Project Structure**

```
src/
├── core/                    # Core business logic
│   ├── session.ts          # Debug session management
│   ├── mappers.ts          # MCP ↔ DAP translation
│   ├── integration.ts      # High-level orchestration
│   ├── error-handler.ts    # 4-strategy error recovery
│   └── enhanced-tools.ts   # Advanced debugging features
├── electron/               # Electron debugging support
│   ├── electron-debugger.ts    # Main Electron debugger
│   ├── main-process-debugger.ts # Main process debugging
│   ├── renderer-process-debugger.ts # Renderer debugging
│   ├── ipc-debugger.ts     # IPC communication analysis
│   ├── electron-profiler.ts    # Performance profiling
│   └── electron-security.ts    # Security analysis
├── mcp/                    # MCP protocol implementation
│   ├── server.ts          # MCP server foundation
│   └── tools/             # MCP tool implementations
├── dap/                    # Debug Adapter Protocol
│   ├── client.ts          # DAP client implementation
│   └── transport.ts       # WebSocket/stdio transport
├── resources/              # Secure resource providers
├── types/                  # TypeScript definitions
└── utils/                  # Utilities and infrastructure
```

## 🔄 **How It Works**

1. **AI Assistant** sends MCP tool call (e.g., "set breakpoint")
2. **RIXA** validates and translates to appropriate DAP command
3. **Debug Adapter** executes the debugging operation
4. **Target Application** is debugged according to the command
5. **RIXA** translates response back to MCP format
6. **AI Assistant** receives structured debugging information

## 🤝 **Contributing**

We welcome contributions! Please see our [Contributing Guide](CONTRIBUTING.md) for details.

### **Running Tests**
```bash
npm test                    # Run all tests
npm run test:watch         # Watch mode
npm run test:coverage      # Coverage report
```

## 📄 **License**

This project is licensed under the MIT License - see the [LICENSE](LICENSE) file for details.

## 🙏 **Acknowledgments**

- **Anthropic** for the Model Context Protocol specification
- **Microsoft** for the Debug Adapter Protocol
- **VSCode Team** for the debugging infrastructure
- **Open Source Community** for the various debug adapters

---

<div align="center">
  <strong>Built with ❤️ for the developer community</strong><br>
  <em>Making debugging accessible through AI</em>
</div>

