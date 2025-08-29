# Phase 1: Core .NET Debugger Implementation

## Overview

This document details the implementation of the core .NET debugging functionality for RIXA. This phase establishes the foundation for all .NET debugging capabilities by implementing the base debugger class and integrating both vsdbg and netcoredbg adapters.

## Objectives

- Create the `/src/dotnet/` directory structure
- Implement the `DotNetDebugger` base class
- Integrate vsdbg adapter with DAP protocol
- Integrate netcoredbg as fallback adapter
- Implement core debugging operations

## Implementation Details

### 1. Directory Structure Creation

Create the following file structure:

```
src/dotnet/
├── dotnet-debugger.ts       # Main debugger implementation
├── vsdbg-adapter.ts         # vsdbg DAP adapter
├── netcoredbg-adapter.ts    # netcoredbg DAP adapter
├── types.ts                 # TypeScript interfaces
└── utils.ts                 # Utility functions
```

### 2. Type Definitions (`types.ts`)

```typescript
// Core interfaces for .NET debugging

export interface DotNetDebuggerConfig {
  host: string;
  port: number;
  projectPath?: string;
  adapter?: 'vsdbg' | 'netcoredbg' | 'auto';
  launchProfile?: string;
  targetFramework?: string;
  configuration?: 'Debug' | 'Release';
  timeout?: number;
  attachMode?: boolean;
  processId?: number;
  enableHotReload?: boolean;
}

export interface DotNetBreakpoint {
  id: string;
  file: string;
  line: number;
  column?: number;
  condition?: string;
  hitCondition?: string;
  logMessage?: string;
  verified: boolean;
  hitCount?: number;
}

export interface DotNetStackFrame {
  id: number;
  name: string;
  source: {
    name: string;
    path: string;
  };
  line: number;
  column: number;
  moduleId?: string;
  presentationHint?: 'normal' | 'label' | 'subtle';
}

export interface DotNetVariable {
  name: string;
  value: string;
  type: string;
  evaluateName?: string;
  variablesReference: number;
  namedVariables?: number;
  indexedVariables?: number;
  memoryReference?: string;
}

export interface DotNetThread {
  id: number;
  name: string;
  state: 'running' | 'stopped' | 'waiting' | 'unstarted' | 'terminated';
}

export interface DotNetException {
  id: string;
  description: string;
  breakMode: 'never' | 'always' | 'unhandled' | 'userUnhandled';
  details?: {
    message?: string;
    typeName?: string;
    fullTypeName?: string;
    evaluateName?: string;
    stackTrace?: string;
    innerException?: DotNetException;
  };
}

export interface ProjectInfo {
  name: string;
  targetFramework: string;
  outputType: 'Exe' | 'Library' | 'WinExe';
  projectFile: string;
  outputPath: string;
  assemblyName: string;
  rootNamespace: string;
  nullable?: boolean;
  implicitUsings?: boolean;
  packageReferences: Array<{
    name: string;
    version: string;
  }>;
}
```

### 3. DotNetDebugger Implementation (`dotnet-debugger.ts`)

```typescript
import { EventEmitter } from 'events';
import { DapClient } from '../dap/client.js';
import { VsDbgAdapter } from './vsdbg-adapter.js';
import { NetCoreDbgAdapter } from './netcoredbg-adapter.js';
import type { DotNetDebuggerConfig, DotNetBreakpoint, DotNetThread } from './types.js';

export class DotNetDebugger extends EventEmitter {
  private config: DotNetDebuggerConfig;
  private dapClient?: DapClient;
  private adapter?: VsDbgAdapter | NetCoreDbgAdapter;
  private breakpoints: Map<string, DotNetBreakpoint> = new Map();
  private threads: Map<number, DotNetThread> = new Map();
  private isConnected = false;
  private sessionId?: string;
  private projectInfo?: ProjectInfo;

  constructor(config: DotNetDebuggerConfig) {
    super();
    this.config = {
      adapter: 'auto',
      configuration: 'Debug',
      timeout: 30000,
      attachMode: false,
      enableHotReload: true,
      ...config
    };
  }

  async connect(): Promise<{ success: boolean; sessionId: string; connectionInfo?: any }> {
    // Implementation details in section below
  }

  async setBreakpoint(file: string, line: number, condition?: string): Promise<DotNetBreakpoint> {
    // Implementation details in section below
  }

  async continue(threadId: number): Promise<void> {
    // Implementation details in section below
  }

  async stepOver(threadId: number): Promise<void> {
    // Implementation details in section below
  }

  async stepIn(threadId: number): Promise<void> {
    // Implementation details in section below
  }

  async stepOut(threadId: number): Promise<void> {
    // Implementation details in section below
  }

  async getThreads(): Promise<DotNetThread[]> {
    // Implementation details in section below
  }

  async getStackTrace(threadId: number): Promise<DotNetStackFrame[]> {
    // Implementation details in section below
  }

  async getVariables(variablesReference: number): Promise<DotNetVariable[]> {
    // Implementation details in section below
  }

  async evaluate(expression: string, frameId?: number): Promise<any> {
    // Implementation details in section below
  }

  async disconnect(): Promise<void> {
    // Implementation details in section below
  }
}
```

### 4. vsdbg Adapter (`vsdbg-adapter.ts`)

```typescript
import { spawn } from 'child_process';
import { existsSync } from 'fs';
import { platform } from 'os';
import { join } from 'path';
import { DapClient } from '../dap/client.js';
import { Logger } from '../utils/logger.js';

export class VsDbgAdapter {
  private vsdbgPath?: string;
  private dapClient?: DapClient;
  private logger: Logger;

  constructor(logger: Logger) {
    this.logger = logger;
  }

  async initialize(): Promise<boolean> {
    // Check if vsdbg is installed
    this.vsdbgPath = await this.findVsDbg();
    
    if (!this.vsdbgPath) {
      // Attempt to download vsdbg
      this.vsdbgPath = await this.downloadVsDbg();
    }
    
    return !!this.vsdbgPath;
  }

  async launch(config: any): Promise<DapClient> {
    if (!this.vsdbgPath) {
      throw new Error('vsdbg not found');
    }

    const transportConfig = {
      type: 'stdio' as const,
      command: this.vsdbgPath,
      args: ['--interpreter=vscode', '--engineLogging']
    };

    this.dapClient = new DapClient(
      { transport: transportConfig },
      this.logger
    );

    await this.dapClient.connect();
    
    // Initialize DAP session
    await this.dapClient.sendRequest('initialize', {
      clientID: 'rixa',
      clientName: 'RIXA',
      adapterID: 'coreclr',
      pathFormat: 'path',
      linesStartAt1: true,
      columnsStartAt1: true,
      supportsVariableType: true,
      supportsVariablePaging: true,
      supportsRunInTerminalRequest: true,
      locale: 'en-US'
    });

    // Launch or attach
    if (config.attachMode) {
      await this.dapClient.sendRequest('attach', {
        processId: config.processId,
        justMyCode: config.justMyCode ?? true
      });
    } else {
      await this.dapClient.sendRequest('launch', {
        program: config.program,
        args: config.args || [],
        cwd: config.cwd,
        env: config.env,
        console: config.console || 'internalConsole',
        justMyCode: config.justMyCode ?? true,
        enableStepFiltering: true,
        requireExactSource: false
      });
    }

    return this.dapClient;
  }

  private async findVsDbg(): Promise<string | undefined> {
    const possiblePaths = this.getVsDbgPaths();
    
    for (const path of possiblePaths) {
      if (existsSync(path)) {
        return path;
      }
    }
    
    return undefined;
  }

  private getVsDbgPaths(): string[] {
    const paths: string[] = [];
    const home = process.env.HOME || process.env.USERPROFILE;
    
    if (!home) return paths;

    switch (platform()) {
      case 'win32':
        paths.push(
          join(home, '.vscode', 'extensions', 'ms-dotnettools.csharp-*', '.debugger', 'vsdbg.exe'),
          join(home, '.vscode-insiders', 'extensions', 'ms-dotnettools.csharp-*', '.debugger', 'vsdbg.exe'),
          join(home, 'vsdbg', 'vsdbg.exe')
        );
        break;
      case 'darwin':
        paths.push(
          join(home, '.vscode', 'extensions', 'ms-dotnettools.csharp-*', '.debugger', 'vsdbg'),
          join(home, '.vscode-insiders', 'extensions', 'ms-dotnettools.csharp-*', '.debugger', 'vsdbg'),
          join(home, 'vsdbg', 'vsdbg')
        );
        break;
      case 'linux':
        paths.push(
          join(home, '.vscode', 'extensions', 'ms-dotnettools.csharp-*', '.debugger', 'vsdbg'),
          join(home, '.vscode-insiders', 'extensions', 'ms-dotnettools.csharp-*', '.debugger', 'vsdbg'),
          join(home, 'vsdbg', 'vsdbg')
        );
        break;
    }
    
    return paths;
  }

  private async downloadVsDbg(): Promise<string | undefined> {
    // Implementation for downloading vsdbg
    // Uses https://aka.ms/getvsdbgsh for Linux/macOS
    // Uses https://aka.ms/getvsdbgps1 for Windows
    // This would be implemented with proper error handling
    return undefined;
  }
}
```

### 5. netcoredbg Adapter (`netcoredbg-adapter.ts`)

```typescript
import { spawn } from 'child_process';
import { existsSync } from 'fs';
import { DapClient } from '../dap/client.js';
import { Logger } from '../utils/logger.js';

export class NetCoreDbgAdapter {
  private netcoredbgPath?: string;
  private dapClient?: DapClient;
  private logger: Logger;

  constructor(logger: Logger) {
    this.logger = logger;
  }

  async initialize(): Promise<boolean> {
    // Check if netcoredbg is installed
    this.netcoredbgPath = await this.findNetCoreDbg();
    return !!this.netcoredbgPath;
  }

  async launch(config: any): Promise<DapClient> {
    if (!this.netcoredbgPath) {
      throw new Error('netcoredbg not found');
    }

    const transportConfig = {
      type: 'stdio' as const,
      command: this.netcoredbgPath,
      args: ['--interpreter=vscode']
    };

    this.dapClient = new DapClient(
      { transport: transportConfig },
      this.logger
    );

    await this.dapClient.connect();
    
    // Initialize DAP session
    await this.dapClient.sendRequest('initialize', {
      clientID: 'rixa',
      clientName: 'RIXA',
      adapterID: 'netcoredbg',
      pathFormat: 'path',
      linesStartAt1: true,
      columnsStartAt1: true,
      supportsVariableType: true,
      supportsVariablePaging: true,
      locale: 'en-US'
    });

    // Launch or attach
    if (config.attachMode) {
      await this.dapClient.sendRequest('attach', {
        processId: config.processId
      });
    } else {
      await this.dapClient.sendRequest('launch', {
        program: config.program,
        args: config.args || [],
        cwd: config.cwd,
        env: config.env,
        console: config.console || 'internalConsole'
      });
    }

    return this.dapClient;
  }

  private async findNetCoreDbg(): Promise<string | undefined> {
    const possiblePaths = [
      '/usr/local/bin/netcoredbg',
      '/usr/bin/netcoredbg',
      'C:\\Program Files\\netcoredbg\\netcoredbg.exe',
      'C:\\netcoredbg\\netcoredbg.exe'
    ];
    
    for (const path of possiblePaths) {
      if (existsSync(path)) {
        return path;
      }
    }
    
    // Check if it's in PATH
    const which = spawn('which', ['netcoredbg']);
    return new Promise((resolve) => {
      let output = '';
      which.stdout.on('data', (data) => {
        output += data.toString();
      });
      which.on('close', (code) => {
        resolve(code === 0 ? output.trim() : undefined);
      });
    });
  }
}
```

## Implementation Steps

### Step 1: Create Base Structure (Day 1-2)
1. Create `/src/dotnet/` directory
2. Implement type definitions
3. Set up base class structure
4. Add logging infrastructure

### Step 2: Implement vsdbg Adapter (Day 3-5)
1. Implement vsdbg detection logic
2. Add vsdbg download capability
3. Implement DAP initialization
4. Test basic launch/attach modes

### Step 3: Implement netcoredbg Adapter (Day 6-7)
1. Implement netcoredbg detection
2. Add installation instructions
3. Implement DAP initialization
4. Test as fallback option

### Step 4: Core Operations (Day 8-10)
1. Implement breakpoint management
2. Add stepping operations
3. Implement variable inspection
4. Add expression evaluation

### Step 5: Integration Testing (Day 11-14)
1. Test with console applications
2. Test with web applications
3. Validate adapter switching
4. Performance testing

## Testing Requirements

### Unit Tests
```typescript
// __tests__/dotnet-debugging.test.ts

describe('DotNetDebugger', () => {
  describe('Initialization', () => {
    it('should detect vsdbg when available');
    it('should fall back to netcoredbg when vsdbg unavailable');
    it('should handle missing adapters gracefully');
  });

  describe('Connection', () => {
    it('should connect in launch mode');
    it('should connect in attach mode');
    it('should handle connection failures');
  });

  describe('Breakpoints', () => {
    it('should set line breakpoints');
    it('should set conditional breakpoints');
    it('should remove breakpoints');
  });

  describe('Stepping', () => {
    it('should step over');
    it('should step into');
    it('should step out');
    it('should continue execution');
  });

  describe('Inspection', () => {
    it('should get threads');
    it('should get stack trace');
    it('should get variables');
    it('should evaluate expressions');
  });
});
```

### Integration Test Scenarios
1. Debug a simple console application
2. Set and hit breakpoints
3. Step through code
4. Inspect local variables
5. Evaluate expressions in watch window
6. Handle exceptions

## Success Metrics

- [ ] vsdbg adapter successfully launches
- [ ] netcoredbg adapter works as fallback
- [ ] Basic debugging operations functional
- [ ] All unit tests passing
- [ ] Integration tests passing
- [ ] No memory leaks or performance issues

## Dependencies

### Required
- Existing DAP client infrastructure
- Logger utility
- Session manager

### Optional
- vsdbg (auto-downloadable)
- netcoredbg (manual installation)

## Known Challenges

1. **vsdbg Licensing**: vsdbg has licensing restrictions - must be used with VS Code/VS
2. **Cross-platform Paths**: Different installation paths on Windows/Linux/macOS
3. **Adapter Detection**: Need robust detection mechanism
4. **Version Compatibility**: Different .NET versions may require different adapter versions

## Next Steps

After completing Phase 1:
- Proceed to [Phase 2: Framework Support](./phase2-framework-support.md)
- Begin integration with language dispatcher
- Start documenting user guides

---

*Document Version: 1.0*  
*Last Updated: 2025-08-29*  
*Status: Draft*