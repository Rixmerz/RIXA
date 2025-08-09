import { EventEmitter } from 'events';
import type { Logger } from '@/utils/logger.js';
import type { SessionId } from '@/types/common.js';
import { ErrorType, RixaError } from '@/types/common.js';
import { DapClient, createDapClient } from '@/dap/client.js';
import type { DapClientConfig } from '@/dap/client.js';
import type { DapEvent, DapResponse } from '@/types/dap.js';
import { generateSessionId } from '@/utils/correlation.js';

/**
 * Debug session state
 */
export enum SessionState {
  CREATED = 'created',
  INITIALIZING = 'initializing',
  INITIALIZED = 'initialized',
  LAUNCHING = 'launching',
  ATTACHING = 'attaching',
  RUNNING = 'running',
  STOPPED = 'stopped',
  TERMINATED = 'terminated',
  ERROR = 'error',
}

/**
 * Session configuration
 */
export interface SessionConfig {
  adapterConfig: DapClientConfig;
  launchConfig?: Record<string, unknown>;
  attachConfig?: Record<string, unknown>;
  name?: string;
  workspaceRoot?: string;
}

/**
 * Breakpoint information
 */
export interface SessionBreakpoint {
  id: string;
  source: {
    path: string;
    name?: string;
  };
  line: number;
  column?: number;
  condition?: string;
  hitCondition?: string;
  logMessage?: string;
  verified: boolean;
}

/**
 * Debug session events
 */
export interface DebugSessionEvents {
  stateChanged: (oldState: SessionState, newState: SessionState) => void;
  stopped: (event: DapEvent) => void;
  output: (event: DapEvent) => void;
  thread: (event: DapEvent) => void;
  breakpoint: (event: DapEvent) => void;
  terminated: (event: DapEvent) => void;
  error: (error: Error) => void;
}

/**
 * Debug session manages a single debugging session
 */
export class DebugSession extends EventEmitter {
  private dapClient: DapClient;
  private state: SessionState = SessionState.CREATED;
  private breakpoints = new Map<string, SessionBreakpoint>();
  private threads = new Map<number, { id: number; name: string }>();
  private capabilities: Record<string, unknown> = {};

  constructor(
    public readonly id: SessionId,
    private config: SessionConfig,
    private logger: Logger
  ) {
    super();

    this.dapClient = createDapClient(config.adapterConfig, logger.child({ sessionId: id }));
    this.setupDapClientHandlers();
  }

  /**
   * Initialize the debug session
   */
  async initialize(): Promise<void> {
    if (this.state !== SessionState.CREATED) {
      throw new RixaError(ErrorType.INTERNAL_ERROR, 'Session already initialized');
    }

    this.setState(SessionState.INITIALIZING);

    try {
      // Connect to DAP adapter
      await this.dapClient.connect();

      // Send initialize request
      const response = await this.dapClient.sendRequest('initialize', {
        clientID: 'rixa',
        clientName: 'RIXA Debug Adapter',
        adapterID: 'rixa-adapter',
        pathFormat: 'path',
        linesStartAt1: true,
        columnsStartAt1: true,
        supportsVariableType: true,
        supportsVariablePaging: true,
        supportsRunInTerminalRequest: false,
        locale: 'en-US',
      });

      this.capabilities = response.body || {};
      this.setState(SessionState.INITIALIZED);

      this.logger.info('Debug session initialized', {
        sessionId: this.id,
        capabilities: this.capabilities,
      });
    } catch (error) {
      this.setState(SessionState.ERROR);
      throw new RixaError(ErrorType.ADAPTER_ERROR, 'Failed to initialize debug session', {
        sessionId: this.id,
        cause: error instanceof Error ? error : new Error(String(error)),
      });
    }
  }

  /**
   * Launch a debug session
   */
  async launch(): Promise<void> {
    if (this.state !== SessionState.INITIALIZED) {
      throw new RixaError(ErrorType.INTERNAL_ERROR, 'Session not initialized');
    }

    if (!this.config.launchConfig) {
      throw new RixaError(ErrorType.VALIDATION_ERROR, 'Launch configuration not provided');
    }

    this.setState(SessionState.LAUNCHING);

    try {
      await this.dapClient.sendRequest('launch', this.config.launchConfig);
      this.setState(SessionState.RUNNING);

      this.logger.info('Debug session launched', {
        sessionId: this.id,
        config: this.config.launchConfig,
      });
    } catch (error) {
      this.setState(SessionState.ERROR);
      throw new RixaError(ErrorType.ADAPTER_ERROR, 'Failed to launch debug session', {
        sessionId: this.id,
        cause: error instanceof Error ? error : new Error(String(error)),
      });
    }
  }

  /**
   * Attach to a debug session
   */
  async attach(): Promise<void> {
    if (this.state !== SessionState.INITIALIZED) {
      throw new RixaError(ErrorType.INTERNAL_ERROR, 'Session not initialized');
    }

    if (!this.config.attachConfig) {
      throw new RixaError(ErrorType.VALIDATION_ERROR, 'Attach configuration not provided');
    }

    this.setState(SessionState.ATTACHING);

    try {
      await this.dapClient.sendRequest('attach', this.config.attachConfig);
      this.setState(SessionState.RUNNING);

      this.logger.info('Debug session attached', {
        sessionId: this.id,
        config: this.config.attachConfig,
      });
    } catch (error) {
      this.setState(SessionState.ERROR);
      throw new RixaError(ErrorType.ADAPTER_ERROR, 'Failed to attach debug session', {
        sessionId: this.id,
        cause: error instanceof Error ? error : new Error(String(error)),
      });
    }
  }

  /**
   * Terminate the debug session
   */
  async terminate(): Promise<void> {
    if (this.state === SessionState.TERMINATED) return;

    try {
      if (this.dapClient.isConnected()) {
        await this.dapClient.sendRequest('terminate');
      }
    } catch (error) {
      this.logger.warn('Error terminating debug session', {
        sessionId: this.id,
        error: error instanceof Error ? error.message : String(error),
      });
    } finally {
      this.dapClient.disconnect();
      this.setState(SessionState.TERMINATED);
    }
  }

  /**
   * Reconnect the debug session
   */
  async reconnect(): Promise<void> {
    this.logger.info('Attempting to reconnect debug session', { sessionId: this.id });

    try {
      // Disconnect current client
      if (this.dapClient.isConnected()) {
        this.dapClient.disconnect();
      }

      // Wait a moment for cleanup
      await new Promise(resolve => setTimeout(resolve, 500));

      // Reconnect
      await this.dapClient.connect();

      // Re-initialize if needed
      if (this.state === SessionState.ERROR) {
        await this.initialize();
      }

      this.logger.info('Debug session reconnected successfully', { sessionId: this.id });
    } catch (error) {
      this.setState(SessionState.ERROR);
      throw new RixaError(ErrorType.ADAPTER_ERROR, 'Failed to reconnect debug session', {
        sessionId: this.id,
        cause: error instanceof Error ? error : new Error(String(error)),
      });
    }
  }

  /**
   * Send a DAP request
   */
  async sendRequest<T extends DapResponse>(
    command: string,
    args?: Record<string, unknown>
  ): Promise<T> {
    if (!this.dapClient.isConnected()) {
      throw new RixaError(ErrorType.INTERNAL_ERROR, 'DAP client not connected');
    }

    return this.dapClient.sendRequest<T>(command, args);
  }

  /**
   * Get current session state
   */
  getState(): SessionState {
    return this.state;
  }

  /**
   * Get session capabilities
   */
  getCapabilities(): Record<string, unknown> {
    return { ...this.capabilities };
  }

  /**
   * Get session breakpoints
   */
  getBreakpoints(): SessionBreakpoint[] {
    return Array.from(this.breakpoints.values());
  }

  /**
   * Get session threads
   */
  getThreads(): Array<{ id: number; name: string }> {
    return Array.from(this.threads.values());
  }

  /**
   * Check if session is active
   */
  isActive(): boolean {
    return [SessionState.RUNNING, SessionState.STOPPED].includes(this.state);
  }

  private setState(newState: SessionState): void {
    const oldState = this.state;
    this.state = newState;

    this.logger.debug('Session state changed', {
      sessionId: this.id,
      oldState,
      newState,
    });

    this.emit('stateChanged', oldState, newState);
  }

  private setupDapClientHandlers(): void {
    this.dapClient.on('event', (event: DapEvent) => {
      this.handleDapEvent(event);
    });

    this.dapClient.on('error', (error: Error) => {
      this.logger.error('DAP client error', {
        sessionId: this.id,
        error: error.message,
      });
      this.setState(SessionState.ERROR);
      this.emit('error', error);
    });

    this.dapClient.on('disconnect', () => {
      this.logger.info('DAP client disconnected', { sessionId: this.id });
      if (this.state !== SessionState.TERMINATED) {
        this.setState(SessionState.TERMINATED);
      }
    });
  }

  private handleDapEvent(event: DapEvent): void {
    this.logger.debug('Received DAP event', {
      sessionId: this.id,
      event: event.event,
      body: event.body,
    });

    switch (event.event) {
      case 'stopped':
        this.setState(SessionState.STOPPED);
        this.emit('stopped', event);
        break;

      case 'output':
        this.emit('output', event);
        break;

      case 'thread':
        if (event.body && typeof event.body === 'object') {
          const body = event.body as { reason: string; threadId: number };
          if (body.reason === 'started') {
            // We would need to get thread info, but for now just track the ID
            this.threads.set(body.threadId, { id: body.threadId, name: `Thread ${body.threadId}` });
          } else if (body.reason === 'exited') {
            this.threads.delete(body.threadId);
          }
        }
        this.emit('thread', event);
        break;

      case 'breakpoint':
        this.emit('breakpoint', event);
        break;

      case 'terminated':
        this.setState(SessionState.TERMINATED);
        this.emit('terminated', event);
        break;

      default:
        // Forward other events
        this.emit(event.event, event);
        break;
    }
  }
}

/**
 * Session manager handles multiple debug sessions
 */
export class SessionManager extends EventEmitter {
  private sessions = new Map<SessionId, DebugSession>();

  constructor(private logger: Logger) {
    super();
  }

  /**
   * Create a new debug session
   */
  async createSession(config: SessionConfig): Promise<DebugSession> {
    const sessionId = generateSessionId();
    const session = new DebugSession(sessionId, config, this.logger);

    this.sessions.set(sessionId, session);

    // Forward session events
    session.on('stateChanged', (oldState, newState) => {
      this.emit('sessionStateChanged', sessionId, oldState, newState);
    });

    session.on('stopped', event => {
      this.emit('sessionStopped', sessionId, event);
    });

    session.on('output', event => {
      this.emit('sessionOutput', sessionId, event);
    });

    session.on('thread', event => {
      this.emit('sessionThread', sessionId, event);
    });

    session.on('breakpoint', event => {
      this.emit('sessionBreakpoint', sessionId, event);
    });

    session.on('terminated', event => {
      this.emit('sessionTerminated', sessionId, event);
      // Clean up terminated session after a delay
      setTimeout(() => {
        this.sessions.delete(sessionId);
      }, 5000);
    });

    session.on('error', error => {
      this.emit('sessionError', sessionId, error);
    });

    this.logger.info('Debug session created', {
      sessionId,
      name: config.name,
    });

    return session;
  }

  /**
   * Get a session by ID
   */
  getSession(sessionId: SessionId): DebugSession | undefined {
    return this.sessions.get(sessionId);
  }

  /**
   * Get all active sessions
   */
  getSessions(): DebugSession[] {
    return Array.from(this.sessions.values());
  }

  /**
   * Get active sessions count
   */
  getActiveSessionsCount(): number {
    return Array.from(this.sessions.values()).filter(session => session.isActive()).length;
  }

  /**
   * Terminate a session
   */
  async terminateSession(sessionId: SessionId): Promise<void> {
    const session = this.sessions.get(sessionId);
    if (!session) {
      throw new RixaError(ErrorType.VALIDATION_ERROR, 'Session not found', {
        sessionId,
      });
    }

    await session.terminate();
  }

  /**
   * Terminate all sessions
   */
  async terminateAllSessions(): Promise<void> {
    const sessions = Array.from(this.sessions.values());
    await Promise.all(sessions.map(session => session.terminate()));
  }
}
