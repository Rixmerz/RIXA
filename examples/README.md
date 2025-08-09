# RIXA Examples

This directory contains examples demonstrating how to use RIXA (Runtime Intelligent eXecution Adapter).

## Basic Usage Example

The `basic-usage.ts` example shows how to:

1. **Start an MCP Server**: Create and configure a WebSocket server that speaks the Model Context Protocol
2. **Handle MCP Connections**: Accept connections from AI clients and authenticate them
3. **Implement Debug Tools**: Provide debugging capabilities as MCP tools
4. **Manage Debug Sessions**: Create and manage multiple debugging sessions
5. **Handle Events**: Forward debugging events to connected AI clients

### Running the Example

```bash
# Make sure you're in the project root
cd /path/to/rixa

# Install dependencies
npm install

# Build the project
npm run build

# Run the example
npx tsx examples/basic-usage.ts
```

### Configuration

The example uses the same configuration system as the main application. You can customize behavior using environment variables:

```bash
# Set custom port
RIXA_PORT=8080 npx tsx examples/basic-usage.ts

# Enable debug logging
RIXA_LOG_LEVEL=debug npx tsx examples/basic-usage.ts

# Use custom auth token
RIXA_AUTH_TOKENS=my-secret-token npx tsx examples/basic-usage.ts
```

### Connecting an AI Client

Once the server is running, you can connect an AI client via WebSocket:

```javascript
// Connect to the MCP server
const ws = new WebSocket('ws://localhost:3000/mcp');

// Send initialize request
ws.send(JSON.stringify({
  jsonrpc: '2.0',
  id: 1,
  method: 'initialize',
  params: {
    protocolVersion: '2024-11-05',
    capabilities: {
      tools: true,
      resources: true,
    },
    clientInfo: {
      name: 'AI Debug Client',
      version: '1.0.0',
    },
  },
}));

// List available tools
ws.send(JSON.stringify({
  jsonrpc: '2.0',
  id: 2,
  method: 'tools/list',
}));

// Create a debug session
ws.send(JSON.stringify({
  jsonrpc: '2.0',
  id: 3,
  method: 'tools/call',
  params: {
    name: 'debug/createSession',
    arguments: {
      adapter: 'node',
      program: '/path/to/your/app.js',
      args: ['--verbose'],
    },
  },
}));
```

### Available Debug Tools

The example implements these debugging tools:

#### `debug/createSession`
Creates a new debugging session.

**Parameters:**
- `adapter` (string): Debug adapter type (e.g., "node")
- `program` (string): Path to the program to debug
- `args` (array, optional): Program arguments

**Returns:**
- Session ID for the created debug session

#### `debug/setBreakpoint`
Sets a breakpoint in a file.

**Parameters:**
- `sessionId` (string): Debug session ID
- `file` (string): File path
- `line` (number): Line number
- `condition` (string, optional): Breakpoint condition

**Returns:**
- Confirmation of breakpoint creation

#### `debug/continue`
Continues execution in a paused debug session.

**Parameters:**
- `sessionId` (string): Debug session ID
- `threadId` (number): Thread ID to continue

**Returns:**
- Confirmation of continue command

### Event Notifications

The server sends these notifications to connected clients:

- `notifications/sessionStateChanged`: When a debug session changes state
- `notifications/sessionStopped`: When execution stops (breakpoint, exception, etc.)
- `notifications/sessionOutput`: When the debugged program produces output

### Architecture Overview

```
AI Client (WebSocket) ←→ MCP Server ←→ Session Manager ←→ DAP Client ←→ Debug Adapter
```

1. **AI Client**: Connects via WebSocket using MCP protocol
2. **MCP Server**: Handles MCP requests and translates them to debug operations
3. **Session Manager**: Manages multiple debug sessions with isolation
4. **DAP Client**: Communicates with debug adapters using Debug Adapter Protocol
5. **Debug Adapter**: The actual debugger (e.g., Node.js debugger, Python debugger)

### Next Steps

This basic example demonstrates the core concepts. For production use, you would want to:

1. **Add more debug tools**: step-in, step-out, evaluate expressions, inspect variables
2. **Implement resource providers**: file system access, project structure
3. **Add security**: proper authentication, input validation, sandboxing
4. **Handle errors gracefully**: timeout handling, adapter crashes, network issues
5. **Add persistence**: session state, breakpoint storage, configuration management

See the main RIXA application for a more complete implementation.
