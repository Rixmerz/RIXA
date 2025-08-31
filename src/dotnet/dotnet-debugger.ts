/**
 * .NET Debugger Core Implementation
 * Clean implementation for hybrid architecture
 */

import { BaseDebugger, type ConnectionResult, type ExpressionResult, type DebugBreakpoint, type DebugThread, type DebugStackFrame, type DebugVariable } from '../core/base-debugger.js';
import type {
  DotNetDebugSession,
  DotNetProcessInfo,
  DotNetExpressionResult,
  DotNetObjectInfo,
  DotNetAssemblyInfo,
  DotNetHotReloadInfo
} from './types.js';
import { DotNetErrorType, DotNetDebugError } from './types.js';

export class DotNetDebugger extends BaseDebugger {
  private static instance: DotNetDebugger;
  protected language = 'csharp' as const;
  private dotnetSessions = new Map<string, DotNetDebugSession>();

  constructor() {
    super();
  }

  static getInstance(): DotNetDebugger {
    if (!DotNetDebugger.instance) {
      DotNetDebugger.instance = new DotNetDebugger();
    }
    return DotNetDebugger.instance;
  }

  // BaseDebugger implementation methods

  async connect(options: any): Promise<ConnectionResult> {
    const sessionId = this.generateSessionId();
    
    try {
      // Create base session
      const baseSession = {
        sessionId,
        language: this.language,
        connected: true,
        startTime: new Date(),
        processInfo: null,
        config: options
      };
      this.sessions.set(sessionId, baseSession);

      // Create .NET-specific session
      const dotnetSession: DotNetDebugSession = {
        sessionId,
        processInfo: {
          pid: options.processId || 1234,
          name: options.processName || 'dotnet-app',
          version: options.dotnetVersion || 'net8.0',
          runtime: options.runtime || 'core',
          framework: options.framework || 'console',
          architecture: 'x64',
          startTime: new Date(),
          workingDirectory: options.projectPath || '/app',
          commandLine: 'dotnet run',
          assemblies: [],
          isDebuggable: true
        },
        config: options,
        connected: true,
        startTime: new Date(),
        breakpoints: new Map(),
        watchedExpressions: new Map(),
        callStack: [],
        variables: new Map(),
        isRunning: true,
        isPaused: false
      };
      this.dotnetSessions.set(sessionId, dotnetSession);

      this.emit('sessionCreated', { sessionId, config: options });
      
      return {
        success: true,
        sessionId,
        connectionInfo: {
          language: this.language,
          config: options
        }
      };
    } catch (error) {
      this.emit('error', { sessionId, error });
      
      return {
        success: false,
        error: error instanceof Error ? error.message : String(error)
      };
    }
  }

  async disconnect(sessionId: string): Promise<void> {
    const session = this.sessions.get(sessionId);
    if (session) {
      session.connected = false;
      this.sessions.delete(sessionId);
    }
    
    const dotnetSession = this.dotnetSessions.get(sessionId);
    if (dotnetSession) {
      dotnetSession.connected = false;
      this.dotnetSessions.delete(sessionId);
    }
    
    this.emit('sessionClosed', { sessionId });
  }

  async setBreakpoint(sessionId: string, file: string, line: number, condition?: string): Promise<DebugBreakpoint> {
    this.validateSession(sessionId);
    
    const breakpointId = `${file}:${line}`;
    const breakpoint: DebugBreakpoint = {
      id: breakpointId,
      file,
      line,
      ...(condition && { condition }),
      enabled: true,
      verified: true
    };
    
    return breakpoint;
  }

  async removeBreakpoint(sessionId: string, breakpointId: string): Promise<void> {
    this.validateSession(sessionId);
    // Mock implementation
  }

  async getThreads(sessionId: string): Promise<DebugThread[]> {
    this.validateSession(sessionId);
    
    return [{
      id: 1,
      name: 'Main Thread',
      state: 'running'
    }];
  }

  async getStackTrace(sessionId: string, threadId: number): Promise<DebugStackFrame[]> {
    this.validateSession(sessionId);
    
    return [{
      id: 1,
      name: 'Main',
      source: {
        name: 'Program.cs',
        path: '/app/Program.cs'
      },
      line: 10,
      column: 1
    }];
  }

  async getVariables(sessionId: string, variablesReference: number): Promise<DebugVariable[]> {
    this.validateSession(sessionId);
    
    return [{
      name: 'result',
      value: '"Hello World"',
      type: 'string',
      variablesReference: 0
    }];
  }

  async evaluate(sessionId: string, expression: string, frameId?: number): Promise<ExpressionResult> {
    this.validateSession(sessionId);
    
    return {
      success: true,
      value: 'mock result',
      type: 'string',
      displayValue: 'mock result'
    };
  }

  async continue(sessionId: string, threadId?: number): Promise<void> {
    this.validateSession(sessionId);
    // Mock implementation
  }

  async stepOver(sessionId: string, threadId: number): Promise<void> {
    this.validateSession(sessionId);
    // Mock implementation
  }

  async stepIn(sessionId: string, threadId: number): Promise<void> {
    this.validateSession(sessionId);
    // Mock implementation
  }

  async stepOut(sessionId: string, threadId: number): Promise<void> {
    this.validateSession(sessionId);
    // Mock implementation
  }

  async pause(sessionId: string, threadId?: number): Promise<void> {
    this.validateSession(sessionId);
    // Mock implementation
  }

  // .NET-specific methods for advanced tools

  async getAvailableProcesses(options: any = {}): Promise<DotNetProcessInfo[]> {
    try {
      // Mock implementation - in real implementation, this would scan for .NET processes
      return [{
        pid: 1234,
        name: 'example-dotnet-app',
        version: 'net8.0',
        runtime: 'core',
        framework: 'console',
        architecture: 'x64',
        startTime: new Date(),
        workingDirectory: '/app',
        commandLine: 'dotnet run',
        assemblies: [],
        isDebuggable: true
      }];
    } catch (error) {
      throw new DotNetDebugError(
        DotNetErrorType.PROCESS_NOT_FOUND,
        'Failed to get available processes'
      );
    }
  }

  async inspectObject(sessionId: string, objectId: string, options: any = {}): Promise<DotNetObjectInfo> {
    const session = this.sessions.get(sessionId);
    if (!session) {
      throw new DotNetDebugError(
        DotNetErrorType.CONNECTION_FAILED,
        `Session not found: ${sessionId}`
      );
    }

    // Mock implementation
    return {
      id: objectId,
      type: 'System.Object',
      value: null,
      isNull: false,
      isPrimitive: false,
      isArray: false,
      isCollection: false,
      properties: [],
      fields: [],
      methods: []
    };
  }

  async evaluateExpression(sessionId: string, expression: string, options: any = {}): Promise<DotNetExpressionResult> {
    const session = this.sessions.get(sessionId);
    if (!session) {
      throw new DotNetDebugError(
        DotNetErrorType.CONNECTION_FAILED,
        `Session not found: ${sessionId}`
      );
    }

    // Mock implementation
    return {
      success: true,
      value: 'result',
      type: 'System.String',
      displayValue: 'result',
      isAsync: false,
      executionTime: 10
    };
  }

  async getAssemblies(sessionId: string, options: any = {}): Promise<DotNetAssemblyInfo[]> {
    const session = this.sessions.get(sessionId);
    if (!session) {
      throw new DotNetDebugError(
        DotNetErrorType.CONNECTION_FAILED,
        `Session not found: ${sessionId}`
      );
    }

    // Mock implementation
    return [];
  }

  async enableHotReload(sessionId: string): Promise<DotNetHotReloadInfo> {
    const session = this.sessions.get(sessionId);
    if (!session) {
      throw new DotNetDebugError(
        DotNetErrorType.CONNECTION_FAILED,
        `Session not found: ${sessionId}`
      );
    }

    // Mock implementation
    return {
      supported: true,
      enabled: true,
      changedFiles: [],
      appliedChanges: [],
      errors: [],
      warnings: []
    };
  }
}
