/**
 * Base Debugger Abstract Class
 * Provides common debugging interface for all programming languages
 */

import { EventEmitter } from 'events';

// Common debugging types
export interface DebugSession {
  sessionId: string;
  language: string;
  connected: boolean;
  startTime: Date;
  processInfo?: any;
  config?: any;
}

export interface DebugBreakpoint {
  id: string;
  file: string;
  line: number;
  column?: number;
  condition?: string;
  enabled: boolean;
  verified: boolean;
}

export interface DebugThread {
  id: number;
  name: string;
  state: 'running' | 'stopped' | 'waiting' | 'unstarted' | 'terminated';
}

export interface DebugStackFrame {
  id: number;
  name: string;
  source: {
    name: string;
    path: string;
  };
  line: number;
  column: number;
}

export interface DebugVariable {
  name: string;
  value: string;
  type: string;
  variablesReference?: number;
}

export interface ExpressionResult {
  success: boolean;
  value: any;
  type: string;
  displayValue: string;
  error?: string;
}

export interface ConnectionResult {
  success: boolean;
  sessionId?: string;
  error?: string;
  connectionInfo?: any;
}

// Supported programming languages
export type SupportedLanguage = 
  | 'javascript' | 'typescript' | 'node' | 'react' | 'nextjs'
  | 'java' | 'kotlin' | 'scala'
  | 'python' | 'django' | 'flask'
  | 'csharp' | 'dotnet' | 'fsharp'
  | 'go' | 'gin'
  | 'rust' | 'actix'
  | 'php' | 'laravel' | 'symfony' | 'wordpress'
  | 'ruby' | 'rails'
  | 'cpp' | 'c';

/**
 * Abstract base class for all language debuggers
 * Defines the common interface that all debuggers must implement
 */
export abstract class BaseDebugger extends EventEmitter {
  protected sessions = new Map<string, DebugSession>();
  protected abstract language: SupportedLanguage;

  constructor() {
    super();
  }

  /**
   * Get the language this debugger supports
   */
  getLanguage(): SupportedLanguage {
    return this.language;
  }

  /**
   * Connect to a debugging target
   */
  abstract connect(options: any): Promise<ConnectionResult>;

  /**
   * Disconnect from a debugging session
   */
  abstract disconnect(sessionId: string): Promise<void>;

  /**
   * Set a breakpoint in the code
   */
  abstract setBreakpoint(sessionId: string, file: string, line: number, condition?: string): Promise<DebugBreakpoint>;

  /**
   * Remove a breakpoint
   */
  abstract removeBreakpoint(sessionId: string, breakpointId: string): Promise<void>;

  /**
   * Get all threads in the debugging session
   */
  abstract getThreads(sessionId: string): Promise<DebugThread[]>;

  /**
   * Get stack trace for a thread
   */
  abstract getStackTrace(sessionId: string, threadId: number): Promise<DebugStackFrame[]>;

  /**
   * Get variables in a scope
   */
  abstract getVariables(sessionId: string, variablesReference: number): Promise<DebugVariable[]>;

  /**
   * Evaluate an expression in the debugging context
   */
  abstract evaluate(sessionId: string, expression: string, frameId?: number): Promise<ExpressionResult>;

  /**
   * Continue execution
   */
  abstract continue(sessionId: string, threadId?: number): Promise<void>;

  /**
   * Step over (next line)
   */
  abstract stepOver(sessionId: string, threadId: number): Promise<void>;

  /**
   * Step into function
   */
  abstract stepIn(sessionId: string, threadId: number): Promise<void>;

  /**
   * Step out of function
   */
  abstract stepOut(sessionId: string, threadId: number): Promise<void>;

  /**
   * Pause execution
   */
  abstract pause(sessionId: string, threadId?: number): Promise<void>;

  /**
   * Get active debugging sessions
   */
  getSessions(): DebugSession[] {
    return Array.from(this.sessions.values());
  }

  /**
   * Get a specific debugging session
   */
  getSession(sessionId: string): DebugSession | undefined {
    return this.sessions.get(sessionId);
  }

  /**
   * Check if a session exists and is connected
   */
  isSessionActive(sessionId: string): boolean {
    const session = this.sessions.get(sessionId);
    return session ? session.connected : false;
  }

  /**
   * Generate a unique session ID
   */
  protected generateSessionId(): string {
    return `${this.language}-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
  }

  /**
   * Validate session exists and is active
   */
  protected validateSession(sessionId: string): DebugSession {
    const session = this.sessions.get(sessionId);
    if (!session) {
      throw new Error(`Session not found: ${sessionId}`);
    }
    if (!session.connected) {
      throw new Error(`Session not connected: ${sessionId}`);
    }
    return session;
  }

  /**
   * Clean up session resources
   */
  protected cleanupSession(sessionId: string): void {
    this.sessions.delete(sessionId);
    this.emit('sessionClosed', { sessionId });
  }
}
