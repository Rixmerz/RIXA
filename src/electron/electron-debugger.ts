/**
 * Electron Debugger - Core implementation
 * 
 * Main class for debugging Electron applications with support for
 * both main and renderer processes, IPC debugging, and GUI inspection
 */

import { EventEmitter } from 'events';
import axios from 'axios';
import { v4 as uuidv4 } from 'uuid';
import { getLogger, type Logger } from '../utils/logger.js';
import type {
  ElectronDebugConfig,
  ElectronDebugSession,
  ElectronProcessInfo,
  ElectronBreakpoint,
  ElectronIPCChannel,
  ElectronIPCMessage,
  ElectronPerformanceMetrics,
  ElectronSecurityContext,
  ElectronGUIElement,
  IElectronDebugger
} from './types.js';
import { ElectronDebugError, ElectronErrorType } from './types.js';
import { MainProcessDebugger } from './main-process-debugger.js';
import { RendererProcessDebugger } from './renderer-process-debugger.js';
import { IPCDebugger } from './ipc-debugger.js';
import { ElectronProfiler } from './electron-profiler.js';
import { ElectronSecurityDebugger } from './electron-security.js';

/**
 * Default configuration for Electron debugging
 */
const DEFAULT_CONFIG: Required<ElectronDebugConfig> = {
  host: 'localhost',
  mainPort: 9229,
  rendererPort: 9222,
  timeout: 30000,
  autoDiscover: true,
  enableIpcDebugging: true,
  enablePerformanceProfiling: true,
  enableSecurityDebugging: true,
  enableGUIDebugging: true,
  projectPath: process.cwd(),
  electronPath: '',
  appPath: ''
};

/**
 * Main Electron Debugger class
 */
export class ElectronDebugger extends EventEmitter implements IElectronDebugger {
  private logger: Logger;
  private sessions: Map<string, ElectronDebugSession> = new Map();
  private mainProcessDebugger: MainProcessDebugger;
  private rendererProcessDebugger: RendererProcessDebugger;
  private ipcDebugger: IPCDebugger;
  private profiler: ElectronProfiler;
  private securityDebugger: ElectronSecurityDebugger;
  private discoveryInterval?: NodeJS.Timeout | undefined;

  constructor() {
    super();
    this.logger = getLogger();
    
    // Initialize sub-debuggers
    this.mainProcessDebugger = new MainProcessDebugger(this.logger);
    this.rendererProcessDebugger = new RendererProcessDebugger(this.logger);
    this.ipcDebugger = new IPCDebugger(this.logger);
    this.profiler = new ElectronProfiler(this.logger);
    this.securityDebugger = new ElectronSecurityDebugger(this.logger);

    this.setupEventHandlers();
  }

  /**
   * Setup event handlers for sub-debuggers
   */
  private setupEventHandlers(): void {
    // Main process events
    this.mainProcessDebugger.on('connected', (processInfo) => {
      this.emit('processAdded', processInfo);
    });

    this.mainProcessDebugger.on('disconnected', (processId) => {
      this.emit('processRemoved', processId);
    });

    // Renderer process events
    this.rendererProcessDebugger.on('processAdded', (processInfo) => {
      this.emit('processAdded', processInfo);
    });

    this.rendererProcessDebugger.on('processRemoved', (processId) => {
      this.emit('processRemoved', processId);
    });

    // IPC events
    this.ipcDebugger.on('message', (message) => {
      this.emit('ipcMessage', message);
    });

    // Performance events
    this.profiler.on('metricsUpdate', (metrics) => {
      this.emit('performanceUpdate', metrics);
    });

    // Security events
    this.securityDebugger.on('violation', (violation) => {
      this.emit('securityViolation', violation);
    });

    // Error handling
    [this.mainProcessDebugger, this.rendererProcessDebugger, this.ipcDebugger, this.profiler, this.securityDebugger]
      .forEach(subDebugger => {
        subDebugger.on('error', (error) => {
          this.logger.error('Sub-debugger error', { error: error.message });
          this.emit('error', error);
        });
      });
  }

  /**
   * Connect to an Electron application
   */
  async connect(config: ElectronDebugConfig): Promise<ElectronDebugSession> {
    const fullConfig = { ...DEFAULT_CONFIG, ...config };
    const sessionId = uuidv4();

    this.logger.info('Connecting to Electron application', { 
      sessionId, 
      config: fullConfig 
    });

    try {
      // Create session
      const session: ElectronDebugSession = {
        sessionId,
        rendererProcesses: new Map(),
        workerProcesses: new Map(),
        ipcChannels: new Map(),
        connected: false,
        startTime: new Date(),
        config: fullConfig
      };

      this.sessions.set(sessionId, session);

      // Discover and connect to processes
      await this.discoverProcesses(session);

      // Connect to main process
      if (session.mainProcess) {
        await this.mainProcessDebugger.connect(session.mainProcess, fullConfig);
      }

      // Connect to renderer processes
      for (const [, processInfo] of session.rendererProcesses) {
        await this.rendererProcessDebugger.connect(processInfo, fullConfig);
      }

      // Initialize IPC debugging if enabled
      if (fullConfig.enableIpcDebugging) {
        await this.ipcDebugger.initialize(session);
      }

      // Initialize profiling if enabled
      if (fullConfig.enablePerformanceProfiling) {
        await this.profiler.initialize(session);
      }

      // Initialize security debugging if enabled
      if (fullConfig.enableSecurityDebugging) {
        await this.securityDebugger.initialize(session);
      }

      session.connected = true;

      // Start auto-discovery if enabled
      if (fullConfig.autoDiscover) {
        this.startAutoDiscovery(session);
      }

      this.logger.info('Successfully connected to Electron application', { 
        sessionId,
        mainProcess: !!session.mainProcess,
        rendererProcesses: session.rendererProcesses.size,
        workerProcesses: session.workerProcesses.size
      });

      this.emit('connected', session);
      return session;

    } catch (error) {
      this.sessions.delete(sessionId);
      const debugError = new ElectronDebugError(
        ElectronErrorType.CONNECTION_FAILED,
        `Failed to connect to Electron application: ${error instanceof Error ? error.message : String(error)}`,
        { config: fullConfig, originalError: error }
      );
      this.logger.error('Connection failed', { error: debugError });
      throw debugError;
    }
  }

  /**
   * Disconnect from an Electron application
   */
  async disconnect(sessionId: string): Promise<void> {
    const session = this.sessions.get(sessionId);
    if (!session) {
      throw new ElectronDebugError(
        ElectronErrorType.PROCESS_NOT_FOUND,
        `Session not found: ${sessionId}`
      );
    }

    this.logger.info('Disconnecting from Electron application', { sessionId });

    try {
      // Stop auto-discovery
      if (this.discoveryInterval) {
        clearInterval(this.discoveryInterval);
        this.discoveryInterval = undefined;
      }

      // Disconnect from all processes
      if (session.mainProcess) {
        await this.mainProcessDebugger.disconnect(session.mainProcess.id);
      }

      for (const [processId] of session.rendererProcesses) {
        await this.rendererProcessDebugger.disconnect(processId);
      }

      // Cleanup sub-debuggers
      await this.ipcDebugger.cleanup(sessionId);
      await this.profiler.cleanup(sessionId);
      await this.securityDebugger.cleanup(sessionId);

      session.connected = false;
      this.sessions.delete(sessionId);

      this.logger.info('Successfully disconnected from Electron application', { sessionId });
      this.emit('disconnected', sessionId);

    } catch (error) {
      const debugError = new ElectronDebugError(
        ElectronErrorType.CONNECTION_FAILED,
        `Failed to disconnect from session ${sessionId}: ${error instanceof Error ? error.message : String(error)}`,
        { sessionId, originalError: error }
      );
      this.logger.error('Disconnection failed', { error: debugError });
      throw debugError;
    }
  }

  /**
   * Get a debugging session
   */
  getSession(sessionId: string): ElectronDebugSession | undefined {
    return this.sessions.get(sessionId);
  }

  /**
   * Get all debugging sessions
   */
  getAllSessions(): ElectronDebugSession[] {
    return Array.from(this.sessions.values());
  }

  /**
   * Discover Electron processes
   */
  private async discoverProcesses(session: ElectronDebugSession): Promise<void> {
    const { host, mainPort, rendererPort, timeout } = session.config;

    try {
      // Discover main process
      await this.discoverMainProcess(session, host || 'localhost', mainPort || 9229, timeout || 30000);
    } catch (error) {
      this.logger.warn('Failed to discover main process', { error: error instanceof Error ? error.message : String(error) });
    }

    try {
      // Discover renderer processes
      await this.discoverRendererProcesses(session, host || 'localhost', rendererPort || 9222, timeout || 30000);
    } catch (error) {
      this.logger.warn('Failed to discover renderer processes', { error: error instanceof Error ? error.message : String(error) });
    }
  }

  /**
   * Discover main process
   */
  private async discoverMainProcess(session: ElectronDebugSession, host: string, port: number, timeout: number): Promise<void> {
    try {
      const response = await axios.get(`http://${host}:${port}/json`, { timeout });
      const targets = response.data;

      if (Array.isArray(targets) && targets.length > 0) {
        const mainTarget = targets[0]; // Main process is typically the first target
        
        const processInfo: ElectronProcessInfo = {
          id: uuidv4(),
          type: 'main',
          pid: 0, // Will be updated when connected
          title: mainTarget.title || 'Electron Main Process',
          url: mainTarget.url,
          webSocketDebuggerUrl: mainTarget.webSocketDebuggerUrl,
          devtoolsFrontendUrl: mainTarget.devtoolsFrontendUrl,
          description: mainTarget.description
        };

        session.mainProcess = processInfo;
        this.logger.debug('Discovered main process', { processInfo });
      }
    } catch (error) {
      this.logger.debug('Main process discovery failed', { host, port, error: error instanceof Error ? error.message : String(error) });
    }
  }

  /**
   * Discover renderer processes
   */
  private async discoverRendererProcesses(session: ElectronDebugSession, host: string, port: number, timeout: number): Promise<void> {
    try {
      const response = await axios.get(`http://${host}:${port}/json`, { timeout });
      const targets = response.data;

      if (Array.isArray(targets)) {
        for (const target of targets) {
          if (target.type === 'page' || target.type === 'webview') {
            const processInfo: ElectronProcessInfo = {
              id: target.id || uuidv4(),
              type: 'renderer',
              pid: 0, // Will be updated when connected
              title: target.title || 'Electron Renderer Process',
              url: target.url,
              webSocketDebuggerUrl: target.webSocketDebuggerUrl,
              devtoolsFrontendUrl: target.devtoolsFrontendUrl,
              faviconUrl: target.faviconUrl,
              thumbnailUrl: target.thumbnailUrl,
              description: target.description
            };

            session.rendererProcesses.set(processInfo.id, processInfo);
            this.logger.debug('Discovered renderer process', { processInfo });
          }
        }
      }
    } catch (error) {
      this.logger.debug('Renderer process discovery failed', { host, port, error: error instanceof Error ? error.message : String(error) });
    }
  }

  /**
   * Start auto-discovery of new processes
   */
  private startAutoDiscovery(session: ElectronDebugSession): void {
    if (this.discoveryInterval) {
      clearInterval(this.discoveryInterval);
    }

    this.discoveryInterval = setInterval(async () => {
      try {
        await this.discoverProcesses(session);
      } catch (error) {
        this.logger.debug('Auto-discovery error', { error: error instanceof Error ? error.message : String(error) });
      }
    }, 5000); // Check every 5 seconds
  }

  async getProcesses(sessionId: string): Promise<ElectronProcessInfo[]> {
    const session = this.getSession(sessionId);
    if (!session) {
      throw new ElectronDebugError(ElectronErrorType.PROCESS_NOT_FOUND, `Session not found: ${sessionId}`);
    }

    const processes: ElectronProcessInfo[] = [];
    if (session.mainProcess) processes.push(session.mainProcess);
    processes.push(...Array.from(session.rendererProcesses.values()));
    processes.push(...Array.from(session.workerProcesses.values()));

    return processes;
  }

  async attachToProcess(sessionId: string, processId: string): Promise<void> {
    const session = this.getSession(sessionId);
    if (!session) {
      throw new ElectronDebugError(ElectronErrorType.PROCESS_NOT_FOUND, `Session not found: ${sessionId}`);
    }

    // Check if process exists
    const process = session.rendererProcesses.get(processId) || session.workerProcesses.get(processId);
    if (!process && session.mainProcess?.id !== processId) {
      throw new ElectronDebugError(ElectronErrorType.PROCESS_NOT_FOUND, `Process not found: ${processId}`);
    }

    // Attach logic would be implemented here
    this.logger.info('Attached to process', { sessionId, processId });
  }

  async detachFromProcess(sessionId: string, processId: string): Promise<void> {
    const session = this.getSession(sessionId);
    if (!session) {
      throw new ElectronDebugError(ElectronErrorType.PROCESS_NOT_FOUND, `Session not found: ${sessionId}`);
    }

    // Detach logic would be implemented here
    this.logger.info('Detached from process', { sessionId, processId });
  }

  async setBreakpoint(sessionId: string, breakpoint: Omit<ElectronBreakpoint, 'id' | 'verified'>): Promise<ElectronBreakpoint> {
    const session = this.getSession(sessionId);
    if (!session) {
      throw new ElectronDebugError(ElectronErrorType.PROCESS_NOT_FOUND, `Session not found: ${sessionId}`);
    }

    const breakpointId = `bp-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
    const fullBreakpoint: ElectronBreakpoint = {
      ...breakpoint,
      id: breakpointId,
      verified: false
    };

    try {
      if (breakpoint.processType === 'main' && session.mainProcess) {
        const result = await this.mainProcessDebugger.setBreakpoint(
          session.mainProcess.id,
          breakpoint.file!,
          breakpoint.line!,
          breakpoint.condition
        );
        return result;
      } else if (breakpoint.processType === 'renderer' && breakpoint.processId) {
        const process = session.rendererProcesses.get(breakpoint.processId);
        if (process) {
          const result = await this.rendererProcessDebugger.setBreakpoint(
            breakpoint.processId,
            breakpoint.file!,
            breakpoint.line!,
            breakpoint.condition
          );
          return result;
        }
      }

      // Fallback - return unverified breakpoint
      return fullBreakpoint;
    } catch (error) {
      throw new ElectronDebugError(
        ElectronErrorType.BREAKPOINT_FAILED,
        `Failed to set breakpoint: ${error instanceof Error ? error.message : String(error)}`,
        { sessionId, breakpoint, originalError: error }
      );
    }
  }

  async removeBreakpoint(sessionId: string, breakpointId: string): Promise<void> {
    const session = this.getSession(sessionId);
    if (!session) {
      throw new ElectronDebugError(ElectronErrorType.PROCESS_NOT_FOUND, `Session not found: ${sessionId}`);
    }

    // Remove breakpoint logic would be implemented here
    this.logger.info('Removed breakpoint', { sessionId, breakpointId });
  }

  async getBreakpoints(sessionId: string): Promise<ElectronBreakpoint[]> {
    const session = this.getSession(sessionId);
    if (!session) {
      throw new ElectronDebugError(ElectronErrorType.PROCESS_NOT_FOUND, `Session not found: ${sessionId}`);
    }

    // Return empty array for now - would collect from all debuggers
    return [];
  }

  async continue(sessionId: string, processId?: string): Promise<void> {
    const session = this.getSession(sessionId);
    if (!session) {
      throw new ElectronDebugError(ElectronErrorType.PROCESS_NOT_FOUND, `Session not found: ${sessionId}`);
    }

    if (processId) {
      if (session.mainProcess?.id === processId) {
        await this.mainProcessDebugger.continue(processId);
      } else if (session.rendererProcesses.has(processId)) {
        // Renderer continue logic would be implemented here
        this.logger.info('Continued renderer process', { sessionId, processId });
      }
    } else {
      // Continue all processes
      if (session.mainProcess) {
        await this.mainProcessDebugger.continue(session.mainProcess.id);
      }
      // Continue all renderer processes
      for (const [rendererProcessId] of session.rendererProcesses) {
        this.logger.info('Continued renderer process', { sessionId, processId: rendererProcessId });
      }
    }
  }

  async pause(sessionId: string, processId?: string): Promise<void> {
    const session = this.getSession(sessionId);
    if (!session) {
      throw new ElectronDebugError(ElectronErrorType.PROCESS_NOT_FOUND, `Session not found: ${sessionId}`);
    }

    if (processId) {
      if (session.mainProcess?.id === processId) {
        await this.mainProcessDebugger.pause(processId);
      } else if (session.rendererProcesses.has(processId)) {
        // Renderer pause logic would be implemented here
        this.logger.info('Paused renderer process', { sessionId, processId });
      }
    } else {
      // Pause all processes
      if (session.mainProcess) {
        await this.mainProcessDebugger.pause(session.mainProcess.id);
      }
      // Pause all renderer processes
      for (const [rendererProcessId] of session.rendererProcesses) {
        this.logger.info('Paused renderer process', { sessionId, processId: rendererProcessId });
      }
    }
  }

  async stepOver(sessionId: string, processId?: string): Promise<void> {
    const session = this.getSession(sessionId);
    if (!session) {
      throw new ElectronDebugError(ElectronErrorType.PROCESS_NOT_FOUND, `Session not found: ${sessionId}`);
    }

    const targetProcessId = processId || session.mainProcess?.id;
    if (!targetProcessId) {
      throw new ElectronDebugError(ElectronErrorType.PROCESS_NOT_FOUND, 'No process specified and no main process available');
    }

    if (session.mainProcess?.id === targetProcessId) {
      await this.mainProcessDebugger.stepOver(targetProcessId);
    } else if (session.rendererProcesses.has(targetProcessId)) {
      // Renderer step over logic would be implemented here
      this.logger.info('Step over in renderer process', { sessionId, processId: targetProcessId });
    }
  }

  async stepInto(sessionId: string, processId?: string): Promise<void> {
    const session = this.getSession(sessionId);
    if (!session) {
      throw new ElectronDebugError(ElectronErrorType.PROCESS_NOT_FOUND, `Session not found: ${sessionId}`);
    }

    const targetProcessId = processId || session.mainProcess?.id;
    if (!targetProcessId) {
      throw new ElectronDebugError(ElectronErrorType.PROCESS_NOT_FOUND, 'No process specified and no main process available');
    }

    if (session.mainProcess?.id === targetProcessId) {
      await this.mainProcessDebugger.stepInto(targetProcessId);
    } else if (session.rendererProcesses.has(targetProcessId)) {
      // Renderer step into logic would be implemented here
      this.logger.info('Step into in renderer process', { sessionId, processId: targetProcessId });
    }
  }

  async stepOut(sessionId: string, processId?: string): Promise<void> {
    const session = this.getSession(sessionId);
    if (!session) {
      throw new ElectronDebugError(ElectronErrorType.PROCESS_NOT_FOUND, `Session not found: ${sessionId}`);
    }

    const targetProcessId = processId || session.mainProcess?.id;
    if (!targetProcessId) {
      throw new ElectronDebugError(ElectronErrorType.PROCESS_NOT_FOUND, 'No process specified and no main process available');
    }

    if (session.mainProcess?.id === targetProcessId) {
      await this.mainProcessDebugger.stepOut(targetProcessId);
    } else if (session.rendererProcesses.has(targetProcessId)) {
      // Renderer step out logic would be implemented here
      this.logger.info('Step out in renderer process', { sessionId, processId: targetProcessId });
    }
  }

  async evaluate(sessionId: string, expression: string, processId?: string, frameId?: number): Promise<any> {
    const session = this.getSession(sessionId);
    if (!session) {
      throw new ElectronDebugError(ElectronErrorType.PROCESS_NOT_FOUND, `Session not found: ${sessionId}`);
    }

    const targetProcessId = processId || session.mainProcess?.id;
    if (!targetProcessId) {
      throw new ElectronDebugError(ElectronErrorType.PROCESS_NOT_FOUND, 'No process specified and no main process available');
    }

    if (session.mainProcess?.id === targetProcessId) {
      return await this.mainProcessDebugger.evaluateExpression(targetProcessId, expression, frameId);
    } else if (session.rendererProcesses.has(targetProcessId)) {
      // Renderer evaluation logic would be implemented here
      this.logger.info('Evaluated expression in renderer process', { sessionId, processId: targetProcessId, expression });
      return { result: 'Renderer evaluation not implemented yet' };
    }

    throw new ElectronDebugError(ElectronErrorType.PROCESS_NOT_FOUND, `Process not found: ${targetProcessId}`);
  }

  async traceIPC(sessionId: string, enabled: boolean): Promise<void> {
    if (enabled) {
      await this.ipcDebugger.startTracing(sessionId);
    } else {
      await this.ipcDebugger.stopTracing(sessionId);
    }
  }

  async getIPCChannels(sessionId: string): Promise<ElectronIPCChannel[]> {
    return this.ipcDebugger.getIPCChannels(sessionId);
  }

  async getIPCMessages(sessionId: string, channelName?: string, limit?: number): Promise<ElectronIPCMessage[]> {
    return this.ipcDebugger.getIPCMessages(sessionId, channelName, limit);
  }

  async startProfiling(sessionId: string, processId?: string, type?: 'cpu' | 'memory' | 'rendering'): Promise<void> {
    const targetProcessId = processId || 'all';
    await this.profiler.startProfiling(sessionId, targetProcessId, type);
  }

  async stopProfiling(sessionId: string, processId?: string): Promise<any> {
    const session = this.getSession(sessionId);
    if (!session) {
      throw new ElectronDebugError(ElectronErrorType.PROCESS_NOT_FOUND, `Session not found: ${sessionId}`);
    }

    // Get active profiles and stop the most recent one
    const profileId = `cpu-${processId || 'all'}-${Date.now()}`;
    return await this.profiler.stopProfiling(sessionId, profileId);
  }

  async getPerformanceMetrics(sessionId: string, processId?: string): Promise<ElectronPerformanceMetrics> {
    return await this.profiler.getPerformanceMetrics(sessionId, processId);
  }

  async getSecurityContext(sessionId: string, processId?: string): Promise<ElectronSecurityContext> {
    return await this.securityDebugger.getSecurityContext(sessionId, processId);
  }

  async validateSecurity(sessionId: string): Promise<any> {
    return await this.securityDebugger.validateSecurity(sessionId);
  }

  async getGUIElements(sessionId: string): Promise<ElectronGUIElement[]> {
    const session = this.getSession(sessionId);
    if (!session) {
      throw new ElectronDebugError(ElectronErrorType.PROCESS_NOT_FOUND, `Session not found: ${sessionId}`);
    }

    const allElements: ElectronGUIElement[] = [];

    // Get GUI elements from all renderer processes
    for (const [processId] of session.rendererProcesses) {
      try {
        const elements = await this.rendererProcessDebugger.getGUIElements(processId);
        allElements.push(...elements);
      } catch (error) {
        this.logger.warn('Failed to get GUI elements from renderer process', {
          sessionId,
          processId,
          error: error instanceof Error ? error.message : String(error)
        });
      }
    }

    return allElements;
  }

  async inspectGUIElement(sessionId: string, elementId: string): Promise<any> {
    const session = this.getSession(sessionId);
    if (!session) {
      throw new ElectronDebugError(ElectronErrorType.PROCESS_NOT_FOUND, `Session not found: ${sessionId}`);
    }

    // Try to find the element in renderer processes
    for (const [processId] of session.rendererProcesses) {
      try {
        const nodeId = parseInt(elementId);
        if (!isNaN(nodeId)) {
          return await this.rendererProcessDebugger.inspectGUIElement(processId, nodeId);
        }
      } catch (error) {
        // Continue to next process
      }
    }

    throw new ElectronDebugError(ElectronErrorType.GUI_ERROR, `GUI element not found: ${elementId}`);
  }

  async simulateGUIEvent(sessionId: string, elementId: string, event: any): Promise<void> {
    const session = this.getSession(sessionId);
    if (!session) {
      throw new ElectronDebugError(ElectronErrorType.PROCESS_NOT_FOUND, `Session not found: ${sessionId}`);
    }

    // Try to simulate event in renderer processes
    for (const [processId] of session.rendererProcesses) {
      try {
        const nodeId = parseInt(elementId);
        if (!isNaN(nodeId)) {
          await this.rendererProcessDebugger.simulateGUIEvent(processId, nodeId, event.type, event.options);
          return;
        }
      } catch (error) {
        // Continue to next process
      }
    }

    throw new ElectronDebugError(ElectronErrorType.GUI_ERROR, `Failed to simulate event on element: ${elementId}`);
  }
}
