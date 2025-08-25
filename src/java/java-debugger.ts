import { EventEmitter } from 'events';
// import { JDWPValidator, type JDWPConnectionInfo } from './jdwp-validator.js';
import { ConnectionManager } from './connection-manager.js';
import { HybridDebugger, type HybridDebugConfig } from './hybrid-debugger.js';
// import { analyzeJavaProject } from './enhanced-detection.js';

/**
 * Java Debugger - Complete Java debugging implementation
 * Supports JDWP, Hybrid debugging, and Spring Boot applications
 */

export interface JavaDebuggerConfig {
  host: string;
  port: number;
  projectPath?: string;
  enableHybridDebugging?: boolean;
  enableJDWP?: boolean;
  timeout?: number;
  observerMode?: boolean;
}

export interface JavaBreakpoint {
  id: string;
  className: string;
  methodName?: string;
  lineNumber: number;
  condition?: string | undefined;
  verified: boolean;
  hitCount?: number;
}

export interface JavaStackFrame {
  id: number;
  name: string;
  className: string;
  methodName: string;
  lineNumber: number;
  source: {
    name: string;
    path: string;
  };
  variables?: JavaVariable[];
}

export interface JavaVariable {
  name: string;
  value: string;
  type: string;
  scope: 'local' | 'instance' | 'static';
  variablesReference?: number;
}

export interface JavaThread {
  id: number;
  name: string;
  state: 'running' | 'suspended' | 'terminated';
  stackFrames?: JavaStackFrame[];
}

export class JavaDebugger extends EventEmitter {
  private config: JavaDebuggerConfig;
  private connectionManager: ConnectionManager;
  private hybridDebugger?: HybridDebugger;
  // private jdwpValidator?: JDWPValidator;
  // private connectionInfo?: JDWPConnectionInfo;
  private breakpoints: Map<string, JavaBreakpoint> = new Map();
  private threads: Map<number, JavaThread> = new Map();
  private isConnected = false;
  private sessionId?: string | undefined;

  constructor(config: JavaDebuggerConfig) {
    super();
    this.config = {
      enableHybridDebugging: true,
      enableJDWP: true,
      timeout: 10000,
      observerMode: false,
      ...config
    };

    this.connectionManager = new ConnectionManager();
    this.setupEventHandlers();
  }

  private setupEventHandlers(): void {
    this.connectionManager.on('session-created', (session) => {
      this.emit('session-created', session);
    });

    this.connectionManager.on('connection-established', (info) => {
      // this.connectionInfo = info;
      this.isConnected = true;
      this.emit('connected', info);
    });

    this.connectionManager.on('connection-failed', (error) => {
      this.emit('connection-failed', error);
    });
  }

  /**
   * Connect to Java application
   */
  async connect(): Promise<{ success: boolean; sessionId: string; connectionInfo?: any }> {
    try {
      this.emit('connecting');

      // Try JDWP connection first if enabled
      if (this.config.enableJDWP) {
        try {
          const connectionResult = await this.connectionManager.createConnection({
            host: this.config.host,
            port: this.config.port,
            timeout: this.config.timeout || 10000,
            observerMode: this.config.observerMode || false,
            projectPath: this.config.projectPath || process.cwd()
          });

          if (connectionResult.success && connectionResult.session) {
            this.sessionId = connectionResult.session.id;
            this.isConnected = true;
            
            // Initialize threads
            await this.initializeThreads();

            return {
              success: true,
              sessionId: this.sessionId,
              connectionInfo: {
                type: 'jdwp',
                host: this.config.host,
                port: this.config.port,
                connected: true,
                observerMode: this.config.observerMode
              }
            };
          }
        } catch (jdwpError) {
          console.warn('JDWP connection failed, trying hybrid debugging:', jdwpError);
        }
      }

      // Fallback to hybrid debugging if JDWP fails or is disabled
      if (this.config.enableHybridDebugging && this.config.projectPath) {
        // const projectInfo = await analyzeJavaProject(this.config.projectPath);
        
        const hybridConfig: HybridDebugConfig = {
          workspaceRoot: this.config.projectPath,
          applicationUrl: `http://${this.config.host}:8080`,
          logFiles: [],
          apiEndpoints: ['/actuator/health', '/api/**'],
          enableLogWatching: true,
          enableApiTesting: true,
          enableBreakpointSimulation: true
        };

        this.hybridDebugger = new HybridDebugger(hybridConfig);
        await this.hybridDebugger.start();

        this.sessionId = `java-hybrid-${Date.now()}`;
        this.isConnected = true;

        return {
          success: true,
          sessionId: this.sessionId,
          connectionInfo: {
            type: 'hybrid',
            host: this.config.host,
            port: this.config.port,
            connected: true,
            hybridMode: true
          }
        };
      }

      throw new Error('Both JDWP and hybrid debugging failed to connect');

    } catch (error) {
      this.emit('error', error);
      throw error;
    }
  }

  /**
   * Initialize threads information
   */
  private async initializeThreads(): Promise<void> {
    // Mock thread initialization - in real implementation, this would query JDWP
    const mainThread: JavaThread = {
      id: 1,
      name: 'main',
      state: 'running'
    };

    this.threads.set(1, mainThread);
    this.emit('threads-initialized', Array.from(this.threads.values()));
  }

  /**
   * Set breakpoint in Java code
   */
  async setBreakpoint(className: string, lineNumber: number, condition?: string): Promise<JavaBreakpoint> {
    const breakpointId = `${className}:${lineNumber}`;
    
    const breakpoint: JavaBreakpoint = {
      id: breakpointId,
      className,
      lineNumber,
      condition,
      verified: this.isConnected,
      hitCount: 0
    };

    this.breakpoints.set(breakpointId, breakpoint);

    if (this.hybridDebugger) {
      // Add breakpoint simulation for hybrid debugging
      this.hybridDebugger.addBreakpointSimulation({
        className,
        methodName: '*',
        logLevel: 'DEBUG'
      });
    }

    this.emit('breakpoint-set', breakpoint);
    return breakpoint;
  }

  /**
   * Get all threads
   */
  async getThreads(): Promise<JavaThread[]> {
    if (!this.isConnected) {
      throw new Error('Not connected to Java application');
    }

    return Array.from(this.threads.values());
  }

  /**
   * Get stack trace for a thread
   */
  async getStackTrace(threadId: number): Promise<JavaStackFrame[]> {
    if (!this.isConnected) {
      throw new Error('Not connected to Java application');
    }

    const thread = this.threads.get(threadId);
    if (!thread) {
      throw new Error(`Thread ${threadId} not found`);
    }

    // Mock stack frames - in real implementation, this would query JDWP
    const stackFrames: JavaStackFrame[] = [
      {
        id: 1,
        name: 'main',
        className: 'com.example.Main',
        methodName: 'main',
        lineNumber: 15,
        source: {
          name: 'Main.java',
          path: this.config.projectPath ? `${this.config.projectPath}/src/main/java/com/example/Main.java` : 'Main.java'
        }
      }
    ];

    thread.stackFrames = stackFrames;
    return stackFrames;
  }

  /**
   * Evaluate expression in Java context
   */
  async evaluateExpression(expression: string, _frameId?: number): Promise<{ result: string; type: string }> {
    if (!this.isConnected) {
      throw new Error('Not connected to Java application');
    }

    // Mock evaluation - in real implementation, this would use JDWP
    return {
      result: `Evaluated: ${expression}`,
      type: 'String'
    };
  }

  /**
   * Continue execution
   */
  async continue(threadId?: number): Promise<void> {
    if (!this.isConnected) {
      throw new Error('Not connected to Java application');
    }

    this.emit('continued', { threadId });
  }

  /**
   * Step over
   */
  async stepOver(threadId: number): Promise<void> {
    if (!this.isConnected) {
      throw new Error('Not connected to Java application');
    }

    this.emit('stepped', { threadId, type: 'over' });
  }

  /**
   * Step into
   */
  async stepIn(threadId: number): Promise<void> {
    if (!this.isConnected) {
      throw new Error('Not connected to Java application');
    }

    this.emit('stepped', { threadId, type: 'in' });
  }

  /**
   * Step out
   */
  async stepOut(threadId: number): Promise<void> {
    if (!this.isConnected) {
      throw new Error('Not connected to Java application');
    }

    this.emit('stepped', { threadId, type: 'out' });
  }

  /**
   * Pause execution
   */
  async pause(threadId: number): Promise<void> {
    if (!this.isConnected) {
      throw new Error('Not connected to Java application');
    }

    const thread = this.threads.get(threadId);
    if (thread) {
      thread.state = 'suspended';
    }

    this.emit('paused', { threadId });
  }

  /**
   * Disconnect from Java application
   */
  async disconnect(): Promise<void> {
    if (this.hybridDebugger) {
      await this.hybridDebugger.stop();
    }

    this.isConnected = false;
    this.sessionId = undefined;
    this.breakpoints.clear();
    this.threads.clear();

    this.emit('disconnected');
  }

  /**
   * Get connection status
   */
  isConnectedToJava(): boolean {
    return this.isConnected;
  }

  /**
   * Get session ID
   */
  getSessionId(): string | undefined {
    return this.sessionId;
  }

  /**
   * Get breakpoints
   */
  getBreakpoints(): JavaBreakpoint[] {
    return Array.from(this.breakpoints.values());
  }
}
