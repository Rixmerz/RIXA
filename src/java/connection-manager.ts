import { EventEmitter } from 'events';
import { PortManager } from './port-manager.js';
import { JDWPValidator } from './jdwp-validator.js';
import { HybridDebugger } from './hybrid-debugger.js';
import type { PortInfo, PortConflictResolution } from './port-manager.js';
import type { JDWPConnectionInfo } from './jdwp-validator.js';
import type { HybridDebugConfig } from './hybrid-debugger.js';

/**
 * Advanced Connection Manager
 * Manages multiple debug connections with intelligent conflict resolution
 */

export interface DebugSession {
  id: string;
  type: 'jdwp' | 'hybrid' | 'observer';
  port: number;
  host: string;
  status: 'connecting' | 'connected' | 'disconnected' | 'error' | 'observing';
  startTime: Date;
  lastActivity: Date;
  connectionInfo?: JDWPConnectionInfo;
  hybridDebugger?: HybridDebugger;
  metadata: {
    applicationName?: string;
    projectPath?: string;
    mainClass?: string;
    pid?: number;
  };
}

export interface ConnectionOptions {
  host: string;
  port: number;
  type: 'jdwp' | 'hybrid' | 'auto';
  timeout: number;
  retryAttempts: number;
  handleConflicts: boolean;
  observerMode: boolean;
  projectPath?: string;
  applicationUrl?: string;
}

export interface ConnectionResult {
  success: boolean;
  session?: DebugSession;
  conflictResolutions?: PortConflictResolution[] | undefined;
  error?: string;
  recommendations: string[];
}

/**
 * Advanced Connection Manager Class
 */
export class ConnectionManager extends EventEmitter {
  private sessions: Map<string, DebugSession> = new Map();
  private portManager: PortManager;
  private sessionCounter = 0;

  constructor() {
    super();
    this.portManager = new PortManager();
    
    // Listen to port manager events
    this.portManager.on('monitoring-update', (ports) => {
      this.handlePortChanges(ports);
    });
  }

  /**
   * Create a new debug connection with intelligent conflict resolution
   */
  async createConnection(options: Partial<ConnectionOptions> = {}): Promise<ConnectionResult> {
    const opts: ConnectionOptions = {
      host: 'localhost',
      port: 5005,
      type: 'auto',
      timeout: 10000,
      retryAttempts: 3,
      handleConflicts: true,
      observerMode: false,
      ...options
    };

    this.emit('connection-attempt', opts);

    try {
      // First, analyze the target port
      const portInfo = await this.portManager.analyzePort(opts.port, true);
      
      // Check for conflicts and get resolutions
      if (opts.handleConflicts && this.hasPortConflict(portInfo)) {
        const resolutions = await this.portManager.suggestConflictResolution(opts.port);
        
        if (resolutions.length > 0) {
          // Try to apply the best resolution automatically
          const bestResolution = this.selectBestResolution(resolutions);
          if (bestResolution) {
            const resolvedOptions = await this.applyResolution(opts, bestResolution);

            if (resolvedOptions) {
              return this.attemptConnection(resolvedOptions, resolutions);
            }
          }

          return {
            success: false,
            conflictResolutions: resolutions,
            error: 'Port conflict detected',
            recommendations: resolutions.map(r => r.description)
          };
        }
      }

      return this.attemptConnection(opts);

    } catch (error) {
      this.emit('connection-error', { options: opts, error });
      return {
        success: false,
        error: error instanceof Error ? error.message : String(error),
        recommendations: ['Check if application is running with debug agent enabled']
      };
    }
  }

  /**
   * Attempt to establish connection
   */
  private async attemptConnection(
    options: ConnectionOptions, 
    conflictResolutions?: PortConflictResolution[]
  ): Promise<ConnectionResult> {
    const sessionId = this.generateSessionId();
    
    const session: DebugSession = {
      id: sessionId,
      type: options.observerMode ? 'observer' : (options.type === 'auto' ? 'jdwp' : options.type),
      port: options.port,
      host: options.host,
      status: 'connecting',
      startTime: new Date(),
      lastActivity: new Date(),
      metadata: {
        ...(options.projectPath && { projectPath: options.projectPath })
      }
    };

    this.sessions.set(sessionId, session);
    this.emit('session-created', session);

    try {
      if (session.type === 'jdwp' || session.type === 'observer') {
        const connectionInfo = await this.establishJDWPConnection(options, session);
        session.connectionInfo = connectionInfo;
        session.status = connectionInfo.connected ? 'connected' : 'error';
        
        if (session.type === 'observer') {
          session.status = 'observing';
        }
      } else if (session.type === 'hybrid') {
        const hybridDebugger = await this.establishHybridConnection(options, session);
        session.hybridDebugger = hybridDebugger;
        session.status = 'connected';
      }

      if (session.status === 'connected' || session.status === 'observing') {
        this.emit('session-connected', session);
        return {
          success: true,
          session,
          conflictResolutions,
          recommendations: this.generateSuccessRecommendations(session)
        };
      } else {
        this.sessions.delete(sessionId);
        return {
          success: false,
          error: 'Failed to establish connection',
          conflictResolutions,
          recommendations: ['Try hybrid debugging mode', 'Check application logs']
        };
      }

    } catch (error) {
      this.sessions.delete(sessionId);
      this.emit('session-error', { session, error });
      
      return {
        success: false,
        error: error instanceof Error ? error.message : String(error),
        conflictResolutions,
        recommendations: this.generateErrorRecommendations(error, options)
      };
    }
  }

  /**
   * Establish JDWP connection
   */
  private async establishJDWPConnection(
    options: ConnectionOptions,
    _session: DebugSession
  ): Promise<JDWPConnectionInfo> {
    const validator = new JDWPValidator(options.host, options.port, {
      timeout: options.timeout,
      retryAttempts: options.retryAttempts,
      validateHandshake: !options.observerMode
    });

    // For observer mode, we just validate the connection exists
    if (options.observerMode) {
      const quickCheck = await JDWPValidator.quickValidate(options.host, options.port);
      return {
        host: options.host,
        port: options.port,
        connected: quickCheck,
        handshakeSuccessful: false // We don't handshake in observer mode
      };
    }

    return validator.validateConnection();
  }

  /**
   * Establish hybrid debugging connection
   */
  private async establishHybridConnection(
    options: ConnectionOptions,
    _session: DebugSession
  ): Promise<HybridDebugger> {
    const config: HybridDebugConfig = {
      workspaceRoot: options.projectPath || process.cwd(),
      applicationUrl: options.applicationUrl || `http://${options.host}:8080`,
      logFiles: [
        'logs/application.log',
        'target/spring.log',
        'application.log'
      ],
      apiEndpoints: [
        '/actuator/health',
        '/actuator/info'
      ],
      enableLogWatching: true,
      enableApiTesting: true,
      enableBreakpointSimulation: true
    };

    const hybridDebugger = new HybridDebugger(config);
    await hybridDebugger.start();
    
    return hybridDebugger;
  }

  /**
   * Check if port has conflicts
   */
  private hasPortConflict(portInfo: PortInfo): boolean {
    return portInfo.status === 'debug_agent' && 
           portInfo.debugInfo?.hasActiveClient === true;
  }

  /**
   * Select the best resolution strategy
   */
  private selectBestResolution(resolutions: PortConflictResolution[]): PortConflictResolution | null {
    if (resolutions.length === 0) return null;

    // Prefer low-risk solutions
    const lowRisk = resolutions.filter(r => r.riskLevel === 'low');
    if (lowRisk.length > 0) {
      // Prefer observer mode or alternative port
      const preferred = lowRisk.find(r => r.action === 'observe_mode' || r.action === 'use_alternative');
      return preferred || lowRisk[0] || null;
    }

    return resolutions[0] || null;
  }

  /**
   * Apply resolution strategy
   */
  private async applyResolution(
    options: ConnectionOptions, 
    resolution: PortConflictResolution
  ): Promise<ConnectionOptions | null> {
    switch (resolution.action) {
      case 'observe_mode':
        return { ...options, observerMode: true, type: 'jdwp' };
        
      case 'use_alternative':
        if (resolution.alternativePort) {
          return { ...options, port: resolution.alternativePort };
        }
        break;
        
      case 'disconnect_existing':
        // This would require user confirmation in a real implementation
        // For now, we'll skip this and let the user decide
        break;
        
      case 'force_connect':
        return { ...options, retryAttempts: 1 };
    }
    
    return null;
  }

  /**
   * Generate session ID
   */
  private generateSessionId(): string {
    return `session-${++this.sessionCounter}-${Date.now()}`;
  }

  /**
   * Generate success recommendations
   */
  private generateSuccessRecommendations(session: DebugSession): string[] {
    const recommendations: string[] = [];
    
    if (session.type === 'observer') {
      recommendations.push('Observer mode active - monitoring without interfering');
      recommendations.push('Use hybrid debugging for active testing');
    } else if (session.type === 'jdwp') {
      recommendations.push('JDWP connection established successfully');
      recommendations.push('You can now set breakpoints and debug normally');
    } else if (session.type === 'hybrid') {
      recommendations.push('Hybrid debugging active - log analysis and API testing enabled');
      recommendations.push('Add breakpoint simulations for key methods');
    }
    
    return recommendations;
  }

  /**
   * Generate error recommendations
   */
  private generateErrorRecommendations(error: unknown, options: ConnectionOptions): string[] {
    const recommendations: string[] = [];
    const errorMsg = error instanceof Error ? error.message : String(error);
    
    if (errorMsg.includes('Connection refused')) {
      recommendations.push('Start your application with debug agent enabled');
      recommendations.push(`java -agentlib:jdwp=transport=dt_socket,server=y,suspend=n,address=${options.port} YourApp`);
    } else if (errorMsg.includes('timeout')) {
      recommendations.push('Increase timeout value');
      recommendations.push('Check network connectivity');
    } else {
      recommendations.push('Try hybrid debugging mode as alternative');
      recommendations.push('Check application logs for errors');
    }
    
    return recommendations;
  }

  /**
   * Handle port changes from monitoring
   */
  private handlePortChanges(ports: Map<number, PortInfo>): void {
    for (const [, session] of this.sessions) {
      const portInfo = ports.get(session.port);

      if (portInfo && session.status === 'connected') {
        if (portInfo.status === 'free') {
          // Port became free - connection lost
          session.status = 'disconnected';
          this.emit('session-disconnected', session);
        }
      }
    }
  }

  /**
   * Get all active sessions
   */
  getActiveSessions(): DebugSession[] {
    return Array.from(this.sessions.values());
  }

  /**
   * Get session by ID
   */
  getSession(sessionId: string): DebugSession | null {
    return this.sessions.get(sessionId) || null;
  }

  /**
   * Disconnect session
   */
  async disconnectSession(sessionId: string): Promise<boolean> {
    const session = this.sessions.get(sessionId);
    if (!session) {
      return false;
    }

    try {
      if (session.hybridDebugger) {
        await session.hybridDebugger.stop();
      }
      
      session.status = 'disconnected';
      this.sessions.delete(sessionId);
      this.emit('session-disconnected', session);
      
      return true;
    } catch (error) {
      this.emit('session-error', { session, error });
      return false;
    }
  }

  /**
   * Start port monitoring
   */
  startMonitoring(): void {
    this.portManager.startMonitoring();
    this.emit('monitoring-started');
  }

  /**
   * Stop port monitoring
   */
  stopMonitoring(): void {
    this.portManager.stopMonitoring();
    this.emit('monitoring-stopped');
  }

  /**
   * Get port manager instance
   */
  getPortManager(): PortManager {
    return this.portManager;
  }
}
