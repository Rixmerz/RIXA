import { EventEmitter } from 'events';
import { DapClient } from '../dap/client.js';
import { VsDbgAdapter } from './vsdbg-adapter.js';
import { NetCoreDbgAdapter } from './netcoredbg-adapter.js';
import type { Logger } from '../utils/logger.js';
import type { 
  DotNetDebuggerConfig, 
  DotNetBreakpoint, 
  DotNetThread, 
  DotNetStackFrame,
  DotNetVariable
} from './types.js';

export class DotNetDebugger extends EventEmitter {
  private config: DotNetDebuggerConfig;
  protected dapClient?: DapClient;
  private adapter?: VsDbgAdapter | NetCoreDbgAdapter;
  private breakpoints: Map<string, DotNetBreakpoint> = new Map();
  private threads: Map<number, DotNetThread> = new Map();
  protected isConnected = false;
  private sessionId?: string;
  private logger: Logger;

  constructor(config: DotNetDebuggerConfig, logger: Logger) {
    super();
    this.config = {
      adapter: 'auto',
      configuration: 'Debug',
      timeout: 30000,
      attachMode: false,
      enableHotReload: true,
      ...config
    };
    this.logger = logger;
  }

  async connect(): Promise<{ success: boolean; sessionId: string; connectionInfo?: any }> {
    if (this.isConnected) {
      throw new Error('Debugger already connected');
    }

    this.logger.info('Connecting .NET debugger', {
      adapter: this.config.adapter,
      projectPath: this.config.projectPath,
      attachMode: this.config.attachMode
    });

    try {
      // Select and initialize adapter
      await this.selectAndInitializeAdapter();

      if (!this.adapter) {
        throw new Error('No suitable debug adapter found');
      }

      // Create launch configuration
      const launchConfig = {
        program: this.config.projectPath,
        args: [],
        cwd: process.cwd(),
        env: process.env,
        attachMode: this.config.attachMode,
        processId: this.config.processId,
        justMyCode: true,
        console: 'internalConsole'
      };

      // Launch the adapter
      this.dapClient = await this.adapter.launch(launchConfig);

      // Set up event handlers
      this.setupEventHandlers();

      // Configure debugger session
      await this.configureSession();

      this.isConnected = true;
      this.sessionId = `dotnet-${Date.now()}`;

      this.logger.info('Successfully connected .NET debugger', {
        sessionId: this.sessionId,
        adapter: this.adapter.constructor.name
      });

      return {
        success: true,
        sessionId: this.sessionId,
        connectionInfo: {
          adapter: this.adapter.constructor.name,
          config: this.config
        }
      };
    } catch (error) {
      this.logger.error('Failed to connect .NET debugger', { error });
      throw error;
    }
  }

  async setBreakpoint(file: string, line: number, condition?: string): Promise<DotNetBreakpoint> {
    if (!this.dapClient || !this.isConnected) {
      throw new Error('Debugger not connected');
    }

    this.logger.debug('Setting breakpoint', { file, line, condition });

    const breakpointId = `${file}:${line}`;
    
    try {
      const response = await this.dapClient.sendRequest('setBreakpoints', {
        source: { path: file },
        breakpoints: [
          {
            line,
            condition
          }
        ]
      });

      const breakpointsArray = response.body?.['breakpoints'] as any[];
      const breakpointData = breakpointsArray?.[0];
      
      const breakpoint: DotNetBreakpoint = {
        id: breakpointId,
        file,
        line,
        ...(condition && { condition }),
        verified: breakpointData?.verified ?? false,
        hitCount: 0
      };

      this.breakpoints.set(breakpointId, breakpoint);
      
      this.logger.debug('Breakpoint set successfully', {
        id: breakpointId,
        verified: breakpoint.verified
      });

      return breakpoint;
    } catch (error) {
      this.logger.error('Failed to set breakpoint', { file, line, error });
      throw error;
    }
  }

  async continue(threadId: number): Promise<void> {
    if (!this.dapClient || !this.isConnected) {
      throw new Error('Debugger not connected');
    }

    this.logger.debug('Continuing execution', { threadId });

    try {
      await this.dapClient.sendRequest('continue', {
        threadId
      });
      
      // Update thread state
      const thread = this.threads.get(threadId);
      if (thread) {
        thread.state = 'running';
        this.threads.set(threadId, thread);
      }

      this.logger.debug('Successfully continued execution', { threadId });
    } catch (error) {
      this.logger.error('Failed to continue execution', { threadId, error });
      throw error;
    }
  }

  async stepOver(threadId: number): Promise<void> {
    if (!this.dapClient || !this.isConnected) {
      throw new Error('Debugger not connected');
    }

    this.logger.debug('Stepping over', { threadId });

    try {
      await this.dapClient.sendRequest('next', {
        threadId
      });

      this.logger.debug('Successfully stepped over', { threadId });
    } catch (error) {
      this.logger.error('Failed to step over', { threadId, error });
      throw error;
    }
  }

  async stepIn(threadId: number): Promise<void> {
    if (!this.dapClient || !this.isConnected) {
      throw new Error('Debugger not connected');
    }

    this.logger.debug('Stepping in', { threadId });

    try {
      await this.dapClient.sendRequest('stepIn', {
        threadId
      });

      this.logger.debug('Successfully stepped in', { threadId });
    } catch (error) {
      this.logger.error('Failed to step in', { threadId, error });
      throw error;
    }
  }

  async stepOut(threadId: number): Promise<void> {
    if (!this.dapClient || !this.isConnected) {
      throw new Error('Debugger not connected');
    }

    this.logger.debug('Stepping out', { threadId });

    try {
      await this.dapClient.sendRequest('stepOut', {
        threadId
      });

      this.logger.debug('Successfully stepped out', { threadId });
    } catch (error) {
      this.logger.error('Failed to step out', { threadId, error });
      throw error;
    }
  }

  async getThreads(): Promise<DotNetThread[]> {
    if (!this.dapClient || !this.isConnected) {
      throw new Error('Debugger not connected');
    }

    this.logger.debug('Getting threads');

    try {
      const response = await this.dapClient.sendRequest('threads');
      const threadsArray = response.body?.['threads'] as any[] || [];
      const threads = threadsArray;

      const dotnetThreads: DotNetThread[] = threads.map((thread: any) => ({
        id: thread.id,
        name: thread.name || `Thread ${thread.id}`,
        state: 'running' as const // Default state, updated by events
      }));

      // Update internal threads map
      for (const thread of dotnetThreads) {
        this.threads.set(thread.id, thread);
      }

      this.logger.debug('Successfully retrieved threads', { count: dotnetThreads.length });
      return dotnetThreads;
    } catch (error) {
      this.logger.error('Failed to get threads', { error });
      throw error;
    }
  }

  async getStackTrace(threadId: number): Promise<DotNetStackFrame[]> {
    if (!this.dapClient || !this.isConnected) {
      throw new Error('Debugger not connected');
    }

    this.logger.debug('Getting stack trace', { threadId });

    try {
      const response = await this.dapClient.sendRequest('stackTrace', {
        threadId
      });

      const stackFramesArray = response.body?.['stackFrames'] as any[] || [];
      const stackFrames = stackFramesArray;
      
      const dotnetStackFrames: DotNetStackFrame[] = stackFrames.map((frame: any) => ({
        id: frame.id,
        name: frame.name,
        source: {
          name: frame.source?.name || '',
          path: frame.source?.path || ''
        },
        line: frame.line,
        column: frame.column || 0,
        moduleId: frame.moduleId,
        presentationHint: frame.presentationHint || 'normal'
      }));

      this.logger.debug('Successfully retrieved stack trace', {
        threadId,
        frameCount: dotnetStackFrames.length
      });

      return dotnetStackFrames;
    } catch (error) {
      this.logger.error('Failed to get stack trace', { threadId, error });
      throw error;
    }
  }

  async getVariables(variablesReference: number): Promise<DotNetVariable[]> {
    if (!this.dapClient || !this.isConnected) {
      throw new Error('Debugger not connected');
    }

    this.logger.debug('Getting variables', { variablesReference });

    try {
      const response = await this.dapClient.sendRequest('variables', {
        variablesReference
      });

      const variablesArray = response.body?.['variables'] as any[] || [];
      const variables = variablesArray;
      
      const dotnetVariables: DotNetVariable[] = variables.map((variable: any) => ({
        name: variable.name,
        value: variable.value,
        type: variable.type || 'unknown',
        evaluateName: variable.evaluateName,
        variablesReference: variable.variablesReference || 0,
        namedVariables: variable.namedVariables,
        indexedVariables: variable.indexedVariables,
        memoryReference: variable.memoryReference
      }));

      this.logger.debug('Successfully retrieved variables', {
        variablesReference,
        count: dotnetVariables.length
      });

      return dotnetVariables;
    } catch (error) {
      this.logger.error('Failed to get variables', { variablesReference, error });
      throw error;
    }
  }

  async evaluate(expression: string, frameId?: number): Promise<any> {
    if (!this.dapClient || !this.isConnected) {
      throw new Error('Debugger not connected');
    }

    this.logger.debug('Evaluating expression', { expression, frameId });

    try {
      const response = await this.dapClient.sendRequest('evaluate', {
        expression,
        frameId,
        context: 'repl'
      });

      const result = {
        result: response.body?.['result'],
        type: response.body?.['type'],
        variablesReference: response.body?.['variablesReference'] || 0,
        namedVariables: response.body?.['namedVariables'],
        indexedVariables: response.body?.['indexedVariables']
      };

      this.logger.debug('Successfully evaluated expression', {
        expression,
        frameId,
        result: result.result
      });

      return result;
    } catch (error) {
      this.logger.error('Failed to evaluate expression', { expression, frameId, error });
      throw error;
    }
  }

  async disconnect(): Promise<void> {
    this.logger.info('Disconnecting .NET debugger', { sessionId: this.sessionId });

    try {
      if (this.dapClient && this.isConnected) {
        await this.dapClient.sendRequest('disconnect');
        this.dapClient.disconnect();
      }

      this.cleanup();

      this.logger.info('Successfully disconnected .NET debugger');
    } catch (error) {
      this.logger.error('Error during disconnect', { error });
      this.cleanup();
      throw error;
    }
  }

  private async selectAndInitializeAdapter(): Promise<void> {
    if (this.config.adapter === 'vsdbg') {
      this.adapter = new VsDbgAdapter(this.logger);
      if (!(await this.adapter.initialize())) {
        throw new Error('Failed to initialize vsdbg adapter');
      }
    } else if (this.config.adapter === 'netcoredbg') {
      this.adapter = new NetCoreDbgAdapter(this.logger);
      if (!(await this.adapter.initialize())) {
        throw new Error('Failed to initialize netcoredbg adapter');
      }
    } else {
      // Auto-selection: try vsdbg first, fallback to netcoredbg
      this.logger.debug('Auto-selecting debug adapter');
      
      this.adapter = new VsDbgAdapter(this.logger);
      if (await this.adapter.initialize()) {
        this.logger.debug('Using vsdbg adapter');
      } else {
        this.logger.debug('vsdbg not available, trying netcoredbg');
        this.adapter = new NetCoreDbgAdapter(this.logger);
        if (!(await this.adapter.initialize())) {
          throw new Error('No suitable debug adapter found (tried vsdbg and netcoredbg)');
        }
        this.logger.debug('Using netcoredbg adapter');
      }
    }
  }

  private setupEventHandlers(): void {
    if (!this.dapClient) return;

    this.dapClient.on('event', (event: any) => {
      this.handleDapEvent(event);
    });

    this.dapClient.on('disconnect', () => {
      this.isConnected = false;
      this.emit('disconnect');
    });

    this.dapClient.on('error', (error: Error) => {
      this.emit('error', error);
    });
  }

  private handleDapEvent(event: any): void {
    this.logger.debug('Received DAP event', { event: event.event, body: event.body });

    switch (event.event) {
      case 'stopped':
        this.handleStoppedEvent(event);
        break;
      case 'continued':
        this.handleContinuedEvent(event);
        break;
      case 'thread':
        this.handleThreadEvent(event);
        break;
      case 'breakpoint':
        this.handleBreakpointEvent(event);
        break;
      case 'output':
        this.handleOutputEvent(event);
        break;
      default:
        this.emit('event', event);
    }
  }

  private handleStoppedEvent(event: any): void {
    const threadId = event.body?.threadId;
    if (threadId) {
      const thread = this.threads.get(threadId);
      if (thread) {
        thread.state = 'stopped';
        this.threads.set(threadId, thread);
      }
    }
    this.emit('stopped', event.body);
  }

  private handleContinuedEvent(event: any): void {
    const threadId = event.body?.threadId;
    if (threadId) {
      const thread = this.threads.get(threadId);
      if (thread) {
        thread.state = 'running';
        this.threads.set(threadId, thread);
      }
    }
    this.emit('continued', event.body);
  }

  private handleThreadEvent(event: any): void {
    const threadInfo = event.body;
    if (threadInfo) {
      const thread: DotNetThread = {
        id: threadInfo.threadId,
        name: threadInfo.name || `Thread ${threadInfo.threadId}`,
        state: threadInfo.reason === 'started' ? 'running' : 'terminated'
      };
      
      if (threadInfo.reason === 'exited') {
        this.threads.delete(thread.id);
      } else {
        this.threads.set(thread.id, thread);
      }
    }
    this.emit('thread', event.body);
  }

  private handleBreakpointEvent(event: any): void {
    const breakpointInfo = event.body?.breakpoint;
    if (breakpointInfo && breakpointInfo.source?.path) {
      const breakpointId = `${breakpointInfo.source.path}:${breakpointInfo.line}`;
      const existingBreakpoint = this.breakpoints.get(breakpointId);
      
      if (existingBreakpoint) {
        existingBreakpoint.verified = breakpointInfo.verified ?? existingBreakpoint.verified;
        this.breakpoints.set(breakpointId, existingBreakpoint);
      }
    }
    this.emit('breakpoint', event.body);
  }

  private handleOutputEvent(event: any): void {
    this.emit('output', {
      category: event.body?.category || 'stdout',
      output: event.body?.output || '',
      line: event.body?.line,
      column: event.body?.column,
      source: event.body?.source
    });
  }

  private async configureSession(): Promise<void> {
    if (!this.dapClient) return;

    try {
      // Configure debugger settings
      await this.dapClient.sendRequest('configurationDone');
    } catch (error) {
      this.logger.warn('Failed to configure session', { error });
    }
  }

  private cleanup(): void {
    this.isConnected = false;
    delete this.sessionId;
    this.breakpoints.clear();
    this.threads.clear();
    delete this.dapClient;
    delete this.adapter;
  }
}