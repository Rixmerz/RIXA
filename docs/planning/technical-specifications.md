# Technical Specifications for .NET Debugging in RIXA

## System Requirements

### Minimum Requirements
- **Operating System**: Windows 10/11, macOS 10.15+, Linux (Ubuntu 18.04+, Debian 10+, RHEL 8+)
- **Node.js**: Version 20.0.0 or higher
- **.NET SDK**: 6.0 or higher (8.0 recommended)
- **Memory**: 4GB RAM minimum, 8GB recommended
- **Disk Space**: 500MB for RIXA + debugger installation

### Supported .NET Versions
| Version | Support Level | Notes |
|---------|--------------|-------|
| .NET 9.0 | Full | Latest features, best performance |
| .NET 8.0 | Full | LTS, recommended for production |
| .NET 7.0 | Full | Standard support |
| .NET 6.0 | Full | LTS, minimum required version |
| .NET 5.0 | Limited | End of life, basic debugging only |
| .NET Core 3.1 | Limited | End of life, basic debugging only |
| .NET Framework | Not Supported | Use Visual Studio |

## Debug Adapter Protocol (DAP) Specification

### DAP Version
- **Protocol Version**: 1.65.0
- **Specification**: [Debug Adapter Protocol](https://microsoft.github.io/debug-adapter-protocol/)

### Message Flow

```
Client (RIXA)                    Adapter (vsdbg/netcoredbg)
     |                                    |
     |-------- initialize request ------->|
     |<------- initialize response -------|
     |                                    |
     |-------- launch/attach request ---->|
     |<------- launch/attach response ----|
     |                                    |
     |-------- setBreakpoints request --->|
     |<------- setBreakpoints response ---|
     |                                    |
     |<------- stopped event -------------|
     |                                    |
     |-------- stackTrace request ------->|
     |<------- stackTrace response -------|
     |                                    |
     |-------- continue request --------->|
     |<------- continue response ---------|
     |                                    |
     |-------- disconnect request ------->|
     |<------- disconnect response -------|
```

### Supported DAP Requests

| Request | vsdbg | netcoredbg | Description |
|---------|-------|------------|-------------|
| initialize | ✅ | ✅ | Initialize debug session |
| launch | ✅ | ✅ | Launch new process |
| attach | ✅ | ✅ | Attach to existing process |
| disconnect | ✅ | ✅ | End debug session |
| terminate | ✅ | ✅ | Terminate debuggee |
| setBreakpoints | ✅ | ✅ | Set line breakpoints |
| setFunctionBreakpoints | ✅ | ✅ | Set function breakpoints |
| setExceptionBreakpoints | ✅ | ✅ | Set exception breakpoints |
| continue | ✅ | ✅ | Continue execution |
| next | ✅ | ✅ | Step over |
| stepIn | ✅ | ✅ | Step into |
| stepOut | ✅ | ✅ | Step out |
| pause | ✅ | ✅ | Pause execution |
| stackTrace | ✅ | ✅ | Get call stack |
| scopes | ✅ | ✅ | Get variable scopes |
| variables | ✅ | ✅ | Get variables |
| evaluate | ✅ | ✅ | Evaluate expression |
| threads | ✅ | ✅ | Get threads |
| modules | ✅ | ⚠️ | Get loaded modules |
| source | ✅ | ✅ | Get source code |
| completions | ✅ | ⚠️ | Get completions |
| setVariable | ✅ | ⚠️ | Set variable value |
| restartFrame | ❌ | ❌ | Not supported |
| stepBack | ❌ | ❌ | Not supported |

Legend: ✅ Full support, ⚠️ Partial support, ❌ Not supported

### DAP Events

| Event | Description | Handling |
|-------|-------------|----------|
| initialized | Adapter is ready | Enable UI |
| stopped | Execution stopped | Update state, get stack |
| continued | Execution continued | Update UI state |
| exited | Process exited | Clean up session |
| terminated | Process terminated | Clean up session |
| thread | Thread started/exited | Update thread list |
| output | Console output | Display to user |
| breakpoint | Breakpoint changed | Update breakpoint state |
| module | Module loaded/unloaded | Update module list |
| process | Process info | Update process info |

## Communication Protocols

### stdio Communication
```typescript
interface StdioConfig {
  command: string;        // vsdbg or netcoredbg path
  args: string[];        // ['--interpreter=vscode']
  encoding: 'utf8';
  stdio: ['pipe', 'pipe', 'pipe'];
}
```

### TCP Communication (Future)
```typescript
interface TcpConfig {
  host: string;          // Default: 'localhost'
  port: number;          // Default: 4711
  timeout: number;       // Connection timeout in ms
}
```

### Message Format
```typescript
// DAP Message Header
"Content-Length: {length}\r\n\r\n{json-body}"

// JSON Body Structure
interface DapMessage {
  seq: number;           // Sequence number
  type: 'request' | 'response' | 'event';
  command?: string;      // For requests
  request_seq?: number;  // For responses
  success?: boolean;     // For responses
  body?: any;           // Message-specific data
  event?: string;       // For events
}
```

## Data Structures

### Session Management
```typescript
interface DebugSession {
  id: string;                    // UUID
  adapter: 'vsdbg' | 'netcoredbg';
  state: 'initializing' | 'running' | 'stopped' | 'terminated';
  process?: {
    pid: number;
    name: string;
  };
  threads: Map<number, ThreadInfo>;
  breakpoints: Map<string, BreakpointInfo[]>;
  capabilities: DapCapabilities;
  metadata: {
    projectPath: string;
    targetFramework: string;
    configuration: string;
    startTime: Date;
  };
}
```

### Variable Representation
```typescript
interface Variable {
  name: string;
  value: string;
  type: string;
  variablesReference: number;  // 0 if no children
  namedVariables?: number;      // Number of named children
  indexedVariables?: number;    // Number of indexed children
  evaluateName?: string;        // Expression to access
  
  // .NET specific
  attributes?: {
    visibility?: 'public' | 'private' | 'protected' | 'internal';
    static?: boolean;
    readonly?: boolean;
    const?: boolean;
  };
}
```

### Breakpoint Specification
```typescript
interface BreakpointSpec {
  source: {
    path?: string;           // Absolute path
    name?: string;           // File name
    sourceReference?: number; // For generated code
  };
  breakpoints: Array<{
    line: number;
    column?: number;
    condition?: string;      // C# expression
    hitCondition?: string;   // Hit count expression
    logMessage?: string;     // Interpolated string
  }>;
}
```

## Performance Specifications

### Response Time Requirements
| Operation | Maximum Time | Target Time |
|-----------|-------------|-------------|
| Initialize | 5000ms | 1000ms |
| Set Breakpoint | 500ms | 100ms |
| Step Operation | 1000ms | 200ms |
| Get Variables (< 100) | 500ms | 100ms |
| Get Variables (< 1000) | 2000ms | 500ms |
| Get Stack Trace | 500ms | 100ms |
| Evaluate Expression | 1000ms | 200ms |
| Continue | 200ms | 50ms |

### Memory Constraints
- Maximum variables per scope: 10,000
- Maximum stack frames: 1,000
- Maximum threads: 1,000
- Maximum breakpoints: 1,000
- Maximum expression length: 10,000 characters
- Variable value truncation: 10,000 characters

### Scalability Limits
- Concurrent debug sessions: 10
- Total MCP connections: 100
- Message queue size: 1,000
- Event buffer size: 10,000

## Error Handling

### Error Categories
```typescript
enum ErrorCategory {
  ADAPTER_NOT_FOUND = 'E001',
  CONNECTION_FAILED = 'E002',
  INITIALIZATION_FAILED = 'E003',
  INVALID_BREAKPOINT = 'E004',
  EVALUATION_FAILED = 'E005',
  PROCESS_TERMINATED = 'E006',
  TIMEOUT = 'E007',
  PROTOCOL_ERROR = 'E008',
  UNSUPPORTED_OPERATION = 'E009',
  INTERNAL_ERROR = 'E010'
}
```

### Error Response Format
```typescript
interface ErrorResponse {
  success: false;
  error: {
    code: ErrorCategory;
    message: string;
    details?: any;
    recoverable: boolean;
    suggestions?: string[];
  };
}
```

### Recovery Strategies
| Error | Recovery Strategy |
|-------|------------------|
| Adapter not found | Try alternative adapter, provide installation instructions |
| Connection failed | Retry with exponential backoff, check port availability |
| Timeout | Increase timeout, retry operation |
| Process terminated | Clean up session, notify user |
| Protocol error | Log details, restart adapter |

## Security Considerations

### Authentication
- No authentication required for local debugging
- Future: Token-based auth for remote debugging

### Authorization
- File system access limited to project directory
- Process attachment requires appropriate permissions
- No arbitrary code execution outside debug context

### Data Protection
- Sensitive data (passwords, tokens) masked in variable inspection
- No persistent storage of debug data
- Memory cleared on session termination

### Network Security
- Local connections only by default
- TLS support for remote debugging (future)
- Port binding to localhost only

## Compatibility Matrix

### IDE Compatibility
| IDE | Version | Support Level |
|-----|---------|--------------|
| VS Code | 1.85+ | Full |
| Visual Studio | 2022 17.8+ | Full (via DAP) |
| Visual Studio | 2019 | Limited |
| JetBrains Rider | N/A | Not tested |
| Neovim (DAP) | Latest | Full |
| Emacs (DAP) | Latest | Full |

### Framework Compatibility
| Framework | Support Level | Features |
|-----------|--------------|----------|
| Console Apps | Full | All debugging features |
| ASP.NET Core | Full | Middleware, routing, DI |
| Blazor Server | Full | Components, SignalR |
| Blazor WebAssembly | Partial | Limited browser debugging |
| WinForms | Basic | Core debugging only |
| WPF | Basic | Core debugging only |
| MAUI | Not Supported | Future |
| Xamarin | Not Supported | Use Visual Studio |

### Language Feature Support
| Feature | C# Version | Support |
|---------|------------|---------|
| Nullable Reference Types | 8.0+ | ✅ |
| Records | 9.0+ | ✅ |
| Pattern Matching | 7.0+ | ✅ |
| Async/Await | 5.0+ | ✅ |
| LINQ | 3.0+ | ✅ |
| Generics | 2.0+ | ✅ |
| Dynamic | 4.0+ | ⚠️ |
| Unsafe Code | All | ⚠️ |
| Span<T> | 7.2+ | ✅ |
| Default Interface Methods | 8.0+ | ✅ |

## Configuration Schema

### Launch Configuration
```json
{
  "type": "object",
  "properties": {
    "adapter": {
      "type": "string",
      "enum": ["vsdbg", "netcoredbg", "auto"],
      "default": "auto"
    },
    "program": {
      "type": "string",
      "description": "Path to dll or exe"
    },
    "args": {
      "type": "array",
      "items": { "type": "string" }
    },
    "cwd": {
      "type": "string",
      "description": "Working directory"
    },
    "env": {
      "type": "object",
      "description": "Environment variables"
    },
    "console": {
      "type": "string",
      "enum": ["internalConsole", "integratedTerminal", "externalTerminal"],
      "default": "internalConsole"
    },
    "stopAtEntry": {
      "type": "boolean",
      "default": false
    },
    "justMyCode": {
      "type": "boolean",
      "default": true
    },
    "enableStepFiltering": {
      "type": "boolean",
      "default": true
    },
    "symbolOptions": {
      "type": "object",
      "properties": {
        "searchPaths": {
          "type": "array",
          "items": { "type": "string" }
        },
        "searchMicrosoftSymbolServer": {
          "type": "boolean",
          "default": false
        },
        "searchNuGetOrgSymbolServer": {
          "type": "boolean",
          "default": false
        }
      }
    },
    "logging": {
      "type": "object",
      "properties": {
        "engineLogging": {
          "type": "boolean",
          "default": false
        },
        "trace": {
          "type": "boolean",
          "default": false
        },
        "traceResponse": {
          "type": "boolean",
          "default": false
        }
      }
    }
  },
  "required": ["program"]
}
```

### Attach Configuration
```json
{
  "type": "object",
  "properties": {
    "processId": {
      "type": "number",
      "description": "Process ID to attach"
    },
    "processName": {
      "type": "string",
      "description": "Process name to attach"
    },
    "justMyCode": {
      "type": "boolean",
      "default": true
    }
  },
  "oneOf": [
    { "required": ["processId"] },
    { "required": ["processName"] }
  ]
}
```

## Logging Specification

### Log Levels
```typescript
enum LogLevel {
  ERROR = 0,
  WARN = 1,
  INFO = 2,
  DEBUG = 3,
  TRACE = 4
}
```

### Log Format
```
[{timestamp}] [{level}] [{component}] {message} {metadata}
```

### Log Categories
- `adapter`: Debug adapter communication
- `session`: Session management
- `breakpoint`: Breakpoint operations
- `evaluation`: Expression evaluation
- `performance`: Performance metrics
- `error`: Error handling

## Testing Requirements

### Unit Test Coverage
- Minimum: 80%
- Target: 95%
- Critical paths: 100%

### Integration Test Scenarios
1. Basic debugging flow
2. ASP.NET Core application
3. Blazor application
4. Multi-threaded application
5. Exception handling
6. Hot reload
7. Large variable inspection
8. Performance under load

### Performance Benchmarks
- Session creation: < 1 second
- Breakpoint hit: < 100ms response
- Variable inspection (1000 items): < 500ms
- Step operation: < 200ms

---

*Document Version: 1.0*  
*Last Updated: 2025-08-29*  
*Status: Draft*