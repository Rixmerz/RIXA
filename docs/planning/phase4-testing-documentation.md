# Phase 4: Testing & Documentation

## Overview

This phase focuses on comprehensive testing of the .NET debugging implementation, performance optimization, and creating complete documentation for users and developers. This ensures the feature is production-ready and maintainable.

## Objectives

- Create comprehensive test suite for all .NET debugging features
- Perform integration testing with real applications
- Optimize performance for large-scale applications
- Create user and developer documentation
- Prepare for production release

## Testing Strategy

### Testing Pyramid

```
         ┌─────┐
        /       \
       /   E2E   \      5%  - End-to-end MCP tests
      /___________\
     /             \
    / Integration   \   25% - Integration tests
   /_________________\
  /                   \
 /    Unit Tests       \  70% - Unit tests
/______________________\
```

## Test Implementation

### 1. Unit Test Suite (`src/__tests__/dotnet-debugging.test.ts`)

```typescript
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { DotNetDebugger } from '../dotnet/dotnet-debugger';
import { VsDbgAdapter } from '../dotnet/vsdbg-adapter';
import { NetCoreDbgAdapter } from '../dotnet/netcoredbg-adapter';
import { AspNetCoreDebugger } from '../dotnet/aspnet-debugger';
import { BlazorDebugger } from '../dotnet/blazor-debugger';
import { ProjectAnalyzer } from '../dotnet/project-analyzer';

describe('DotNetDebugger Core', () => {
  let debugger: DotNetDebugger;
  let mockDapClient: any;

  beforeEach(() => {
    mockDapClient = {
      connect: vi.fn(),
      sendRequest: vi.fn(),
      disconnect: vi.fn(),
      isConnected: vi.fn(() => true)
    };
    
    debugger = new DotNetDebugger({
      host: 'localhost',
      port: 4711,
      projectPath: '/test/project'
    });
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  describe('Initialization', () => {
    it('should initialize with default configuration', () => {
      expect(debugger).toBeDefined();
      expect(debugger.config.adapter).toBe('auto');
      expect(debugger.config.timeout).toBe(30000);
    });

    it('should detect available adapters', async () => {
      const vsdbgAdapter = new VsDbgAdapter(mockLogger);
      const available = await vsdbgAdapter.initialize();
      
      // Test will vary based on environment
      expect(typeof available).toBe('boolean');
    });

    it('should fall back to netcoredbg when vsdbg unavailable', async () => {
      // Mock vsdbg not found
      vi.spyOn(VsDbgAdapter.prototype, 'initialize').mockResolvedValue(false);
      vi.spyOn(NetCoreDbgAdapter.prototype, 'initialize').mockResolvedValue(true);
      
      const result = await debugger.connect();
      expect(result.connectionInfo.adapter).toBe('netcoredbg');
    });
  });

  describe('Connection', () => {
    it('should connect in launch mode', async () => {
      mockDapClient.sendRequest.mockResolvedValue({ success: true });
      
      const result = await debugger.connect();
      
      expect(result.success).toBe(true);
      expect(result.sessionId).toBeDefined();
      expect(mockDapClient.connect).toHaveBeenCalled();
    });

    it('should connect in attach mode', async () => {
      debugger = new DotNetDebugger({
        host: 'localhost',
        port: 4711,
        attachMode: true,
        processId: 1234
      });
      
      mockDapClient.sendRequest.mockResolvedValue({ success: true });
      
      const result = await debugger.connect();
      
      expect(result.success).toBe(true);
      expect(mockDapClient.sendRequest).toHaveBeenCalledWith('attach', 
        expect.objectContaining({ processId: 1234 })
      );
    });

    it('should handle connection failures gracefully', async () => {
      mockDapClient.connect.mockRejectedValue(new Error('Connection refused'));
      
      await expect(debugger.connect()).rejects.toThrow('Connection refused');
    });

    it('should timeout on slow connections', async () => {
      debugger = new DotNetDebugger({
        host: 'localhost',
        port: 4711,
        timeout: 100 // Very short timeout
      });
      
      mockDapClient.connect.mockImplementation(() => 
        new Promise(resolve => setTimeout(resolve, 200))
      );
      
      await expect(debugger.connect()).rejects.toThrow('timeout');
    });
  });

  describe('Breakpoints', () => {
    beforeEach(async () => {
      await debugger.connect();
    });

    it('should set line breakpoints', async () => {
      const breakpoint = await debugger.setBreakpoint('Program.cs', 10);
      
      expect(breakpoint).toMatchObject({
        file: 'Program.cs',
        line: 10,
        verified: true
      });
    });

    it('should set conditional breakpoints', async () => {
      const breakpoint = await debugger.setBreakpoint(
        'Program.cs',
        10,
        'i > 5'
      );
      
      expect(breakpoint.condition).toBe('i > 5');
    });

    it('should set hit conditional breakpoints', async () => {
      const breakpoint = await debugger.setBreakpoint(
        'Program.cs',
        10,
        undefined,
        '> 3'
      );
      
      expect(breakpoint.hitCondition).toBe('> 3');
    });

    it('should remove breakpoints', async () => {
      const breakpoint = await debugger.setBreakpoint('Program.cs', 10);
      const removed = await debugger.removeBreakpoint(breakpoint.id);
      
      expect(removed).toBe(true);
    });

    it('should handle invalid breakpoint locations', async () => {
      await expect(
        debugger.setBreakpoint('NonExistent.cs', 999)
      ).rejects.toThrow();
    });
  });

  describe('Stepping', () => {
    beforeEach(async () => {
      await debugger.connect();
    });

    it('should step over', async () => {
      await debugger.stepOver(1);
      expect(mockDapClient.sendRequest).toHaveBeenCalledWith(
        'next',
        expect.objectContaining({ threadId: 1 })
      );
    });

    it('should step into', async () => {
      await debugger.stepIn(1);
      expect(mockDapClient.sendRequest).toHaveBeenCalledWith(
        'stepIn',
        expect.objectContaining({ threadId: 1 })
      );
    });

    it('should step out', async () => {
      await debugger.stepOut(1);
      expect(mockDapClient.sendRequest).toHaveBeenCalledWith(
        'stepOut',
        expect.objectContaining({ threadId: 1 })
      );
    });

    it('should continue execution', async () => {
      await debugger.continue(1);
      expect(mockDapClient.sendRequest).toHaveBeenCalledWith(
        'continue',
        expect.objectContaining({ threadId: 1 })
      );
    });
  });

  describe('Inspection', () => {
    beforeEach(async () => {
      await debugger.connect();
    });

    it('should get threads', async () => {
      mockDapClient.sendRequest.mockResolvedValue({
        threads: [
          { id: 1, name: 'Main Thread' },
          { id: 2, name: 'Worker Thread' }
        ]
      });
      
      const threads = await debugger.getThreads();
      
      expect(threads).toHaveLength(2);
      expect(threads[0].name).toBe('Main Thread');
    });

    it('should get stack trace', async () => {
      mockDapClient.sendRequest.mockResolvedValue({
        stackFrames: [
          { id: 1, name: 'Main', line: 10, source: { path: 'Program.cs' } },
          { id: 2, name: 'DoWork', line: 25, source: { path: 'Worker.cs' } }
        ]
      });
      
      const stackTrace = await debugger.getStackTrace(1);
      
      expect(stackTrace).toHaveLength(2);
      expect(stackTrace[0].name).toBe('Main');
    });

    it('should get variables', async () => {
      mockDapClient.sendRequest.mockResolvedValue({
        variables: [
          { name: 'x', value: '42', type: 'int' },
          { name: 'message', value: '"Hello"', type: 'string' }
        ]
      });
      
      const variables = await debugger.getVariables(1);
      
      expect(variables).toHaveLength(2);
      expect(variables[0].name).toBe('x');
      expect(variables[0].value).toBe('42');
    });

    it('should evaluate expressions', async () => {
      mockDapClient.sendRequest.mockResolvedValue({
        result: '50',
        type: 'int'
      });
      
      const result = await debugger.evaluate('x + 8');
      
      expect(result.result).toBe('50');
      expect(result.type).toBe('int');
    });
  });
});

describe('AspNetCoreDebugger', () => {
  let debugger: AspNetCoreDebugger;

  beforeEach(() => {
    debugger = new AspNetCoreDebugger({
      host: 'localhost',
      port: 5000,
      projectPath: '/test/webapp'
    });
  });

  describe('Middleware Inspection', () => {
    it('should inspect middleware pipeline', async () => {
      const middleware = await debugger.inspectMiddlewarePipeline();
      
      expect(Array.isArray(middleware)).toBe(true);
    });

    it('should track HTTP requests', async () => {
      await debugger.trackHttpRequest(true);
      
      // Verify breakpoint was set
      expect(debugger.breakpoints.size).toBeGreaterThan(0);
    });

    it('should inspect DI container', async () => {
      const services = await debugger.inspectDependencyInjection();
      
      expect(services instanceof Map).toBe(true);
    });

    it('should get routing information', async () => {
      const endpoints = await debugger.inspectRouting();
      
      expect(Array.isArray(endpoints)).toBe(true);
    });
  });

  describe('HTTP Context', () => {
    it('should inspect current HTTP context', async () => {
      const context = await debugger.inspectHttpContext();
      
      expect(context).toBeDefined();
    });

    it('should get authentication info', async () => {
      const auth = await debugger.inspectAuthentication();
      
      expect(auth).toHaveProperty('IsAuthenticated');
    });

    it('should inspect session data', async () => {
      const session = await debugger.inspectSession();
      
      expect(session).toBeDefined();
    });
  });
});

describe('BlazorDebugger', () => {
  let debugger: BlazorDebugger;

  beforeEach(() => {
    debugger = new BlazorDebugger({
      host: 'localhost',
      port: 5000,
      projectPath: '/test/blazorapp',
      mode: 'Server'
    });
  });

  describe('Component Inspection', () => {
    it('should get component tree', async () => {
      const components = await debugger.getComponentTree();
      
      expect(Array.isArray(components)).toBe(true);
    });

    it('should inspect specific component', async () => {
      const component = await debugger.inspectComponent('comp-1');
      
      expect(component).toHaveProperty('type');
      expect(component).toHaveProperty('state');
    });

    it('should get render tree', async () => {
      const renderTree = await debugger.getRenderTree();
      
      expect(Array.isArray(renderTree)).toBe(true);
    });

    it('should set component breakpoint', async () => {
      await debugger.setComponentBreakpoint('Counter', 'OnInitialized');
      
      expect(debugger.breakpoints.size).toBe(1);
    });
  });

  describe('JavaScript Interop', () => {
    it('should track JS interop calls', async () => {
      const calls = await debugger.getJsInteropCalls();
      
      expect(Array.isArray(calls)).toBe(true);
    });
  });

  describe('Blazor Server Specific', () => {
    it('should inspect SignalR connection', async () => {
      const connection = await debugger.inspectSignalRConnection();
      
      if (debugger.config.mode === 'Server') {
        expect(connection).toBeDefined();
      } else {
        expect(connection).toBeNull();
      }
    });

    it('should get circuit info', async () => {
      const circuit = await debugger.getCircuitInfo();
      
      if (debugger.config.mode === 'Server') {
        expect(circuit).toHaveProperty('CircuitId');
      } else {
        expect(circuit).toBeNull();
      }
    });
  });
});

describe('ProjectAnalyzer', () => {
  let analyzer: ProjectAnalyzer;

  beforeEach(() => {
    analyzer = new ProjectAnalyzer();
  });

  it('should analyze console project', async () => {
    const project = await analyzer.analyzeProject('/test/console');
    
    expect(project.outputType).toBe('Exe');
    expect(project.isWebProject).toBe(false);
  });

  it('should analyze web project', async () => {
    const project = await analyzer.analyzeProject('/test/webapp');
    
    expect(project.isWebProject).toBe(true);
  });

  it('should detect Blazor project', async () => {
    const project = await analyzer.analyzeProject('/test/blazor');
    
    expect(project.isBlazorProject).toBe(true);
  });

  it('should parse package references', async () => {
    const project = await analyzer.analyzeProject('/test/project');
    
    expect(Array.isArray(project.packages)).toBe(true);
  });

  it('should load launch profiles', async () => {
    const project = await analyzer.analyzeProject('/test/project');
    
    expect(Array.isArray(project.launchProfiles)).toBe(true);
  });
});
```

### 2. Integration Test Suite (`src/__tests__/integration/dotnet-integration.test.ts`)

```typescript
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { LanguageDispatcher } from '../../core/language-dispatcher';
import { SessionManager } from '../../core/session';
import { spawn } from 'child_process';
import { join } from 'path';

describe('DotNet Integration Tests', () => {
  let dispatcher: LanguageDispatcher;
  let sessionManager: SessionManager;
  let testApp: any;

  beforeAll(async () => {
    // Start test .NET application
    testApp = spawn('dotnet', ['run'], {
      cwd: join(__dirname, 'fixtures', 'TestApp')
    });
    
    // Wait for app to start
    await new Promise(resolve => setTimeout(resolve, 5000));
    
    dispatcher = new LanguageDispatcher(mockLogger, sessionManager);
    sessionManager = new SessionManager(mockLogger);
  });

  afterAll(async () => {
    // Clean up
    testApp.kill();
  });

  it('should complete full debugging session', async () => {
    // Connect
    const connection = await dispatcher.connect({
      language: 'dotnet',
      host: 'localhost',
      port: 4711
    });
    
    expect(connection.sessionId).toBeDefined();
    
    const sessionId = connection.sessionId;
    
    // Set breakpoint
    const breakpoint = await dispatcher.executeOperation(
      sessionId,
      'setBreakpoint',
      { file: 'Program.cs', line: 10 }
    );
    
    expect(breakpoint.verified).toBe(true);
    
    // Continue execution
    await dispatcher.executeOperation(
      sessionId,
      'continue',
      { threadId: 1 }
    );
    
    // Wait for breakpoint hit
    await new Promise(resolve => setTimeout(resolve, 1000));
    
    // Get stack trace
    const stackTrace = await dispatcher.executeOperation(
      sessionId,
      'getStackTrace',
      { threadId: 1 }
    );
    
    expect(stackTrace.length).toBeGreaterThan(0);
    
    // Get variables
    const variables = await dispatcher.executeOperation(
      sessionId,
      'getVariables',
      { variablesReference: 1 }
    );
    
    expect(Array.isArray(variables)).toBe(true);
    
    // Disconnect
    await dispatcher.disconnect(sessionId);
  });

  it('should debug ASP.NET Core application', async () => {
    // Start ASP.NET Core app
    const webApp = spawn('dotnet', ['run'], {
      cwd: join(__dirname, 'fixtures', 'TestWebApp')
    });
    
    await new Promise(resolve => setTimeout(resolve, 5000));
    
    try {
      const connection = await dispatcher.connect({
        language: 'dotnet',
        framework: 'aspnetcore',
        host: 'localhost',
        port: 5000
      });
      
      const sessionId = connection.sessionId;
      
      // Inspect middleware
      const middleware = await dispatcher.executeOperation(
        sessionId,
        'inspectMiddleware',
        {}
      );
      
      expect(Array.isArray(middleware)).toBe(true);
      
      // Track requests
      await dispatcher.executeOperation(
        sessionId,
        'trackRequests',
        { enable: true }
      );
      
      // Make HTTP request to trigger breakpoint
      await fetch('http://localhost:5000/api/test');
      
      // Inspect HTTP context
      const context = await dispatcher.executeOperation(
        sessionId,
        'inspectHttpContext',
        {}
      );
      
      expect(context).toBeDefined();
      
    } finally {
      webApp.kill();
    }
  });
});
```

### 3. End-to-End MCP Tests (`src/__tests__/e2e/mcp-dotnet.test.ts`)

```typescript
describe('MCP .NET Tools E2E', () => {
  let mcpServer: any;
  let sessionId: string;

  beforeAll(async () => {
    // Start MCP server
    mcpServer = await startMcpServer();
  });

  afterAll(async () => {
    await mcpServer.stop();
  });

  it('should execute complete debugging workflow via MCP', async () => {
    // Create session
    const createResult = await mcpServer.callTool('debug_createSession', {
      adapter: 'dotnet',
      program: '/path/to/TestApp.dll'
    });
    
    sessionId = JSON.parse(createResult.content[0].text).sessionId;
    
    // Set breakpoint
    await mcpServer.callTool('debug_setDotNetBreakpoint', {
      sessionId,
      file: 'Program.cs',
      line: 10
    });
    
    // Get threads
    const threadsResult = await mcpServer.callTool('debug_getDotNetThreads', {
      sessionId
    });
    
    expect(threadsResult.content[0].text).toContain('Thread');
    
    // Evaluate expression
    const evalResult = await mcpServer.callTool('debug_evaluateDotNetExpression', {
      sessionId,
      expression: '2 + 2'
    });
    
    expect(evalResult.content[0].text).toContain('4');
    
    // Terminate
    await mcpServer.callTool('debug_terminate', {
      sessionId
    });
  });
});
```

## Performance Testing

### Performance Benchmarks

```typescript
describe('Performance Tests', () => {
  it('should handle large variable inspection', async () => {
    const startTime = Date.now();
    
    // Inspect large object with 10,000 properties
    const variables = await debugger.getVariables(largeObjectRef);
    
    const duration = Date.now() - startTime;
    
    expect(duration).toBeLessThan(1000); // Should complete in < 1 second
    expect(variables.length).toBe(10000);
  });

  it('should handle many breakpoints', async () => {
    const startTime = Date.now();
    
    // Set 100 breakpoints
    for (let i = 1; i <= 100; i++) {
      await debugger.setBreakpoint('LargeFile.cs', i);
    }
    
    const duration = Date.now() - startTime;
    
    expect(duration).toBeLessThan(5000); // Should complete in < 5 seconds
  });

  it('should handle rapid stepping', async () => {
    const startTime = Date.now();
    
    // Perform 50 step operations
    for (let i = 0; i < 50; i++) {
      await debugger.stepOver(1);
    }
    
    const duration = Date.now() - startTime;
    
    expect(duration).toBeLessThan(10000); // Should complete in < 10 seconds
  });
});
```

## Documentation

### 1. User Guide (`docs/guides/dotnet-debugging.md`)

```markdown
# .NET Debugging Guide

## Getting Started

### Prerequisites
- .NET SDK 6.0 or later
- RIXA installed and configured
- vsdbg or netcoredbg debugger

### Quick Start

1. **Start a debugging session:**
```bash
# Via MCP
debug_createSession adapter:dotnet program:/path/to/app.dll

# Via API
rixa debug --language dotnet --program /path/to/app.dll
```

2. **Set a breakpoint:**
```bash
debug_setDotNetBreakpoint sessionId:<id> file:Program.cs line:10
```

3. **Inspect variables:**
```bash
debug_getDotNetVariables sessionId:<id> variablesReference:1
```

## Framework-Specific Features

### ASP.NET Core
- Inspect middleware pipeline
- Track HTTP requests
- Examine DI container
- Debug routing

### Blazor
- Component tree inspection
- Render tree analysis
- JS interop tracking
- SignalR debugging (Server)

### Entity Framework Core
- Query inspection
- Change tracker analysis
- SQL generation viewing

## Troubleshooting

### Common Issues

1. **Debugger not found**
   - Install vsdbg: `curl -sSL https://aka.ms/getvsdbgsh | bash`
   - Or install netcoredbg: `apt-get install netcoredbg`

2. **Connection timeout**
   - Ensure application is running with debugging enabled
   - Check firewall settings
   - Verify port availability

3. **Breakpoints not hit**
   - Ensure PDB files are available
   - Check symbol paths
   - Verify Just My Code settings
```

### 2. API Reference (`docs/api/dotnet-debugger.md`)

```markdown
# DotNetDebugger API Reference

## Class: DotNetDebugger

### Constructor
```typescript
new DotNetDebugger(config: DotNetDebuggerConfig)
```

### Methods

#### connect()
Establishes connection to .NET application.

**Returns:** `Promise<ConnectionResult>`

#### setBreakpoint(file, line, condition?)
Sets a breakpoint in the specified file.

**Parameters:**
- `file: string` - File path
- `line: number` - Line number
- `condition?: string` - Optional condition

**Returns:** `Promise<DotNetBreakpoint>`

[Continue with all methods...]
```

## Release Checklist

### Pre-Release
- [ ] All unit tests passing (>95% coverage)
- [ ] All integration tests passing
- [ ] Performance benchmarks met
- [ ] Documentation complete
- [ ] Code review completed
- [ ] Security audit passed

### Release
- [ ] Version number updated
- [ ] Changelog updated
- [ ] Release notes prepared
- [ ] Binaries built and tested
- [ ] Documentation published

### Post-Release
- [ ] Monitor error reports
- [ ] Gather user feedback
- [ ] Plan next iteration
- [ ] Update roadmap

## Success Metrics

- Test coverage > 95%
- All tests passing
- Performance benchmarks met
- Documentation complete
- Zero critical bugs
- User satisfaction > 4/5

---

*Document Version: 1.0*  
*Last Updated: 2025-08-29*  
*Status: Draft*