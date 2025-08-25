/**
 * Electron Debugging Types
 * 
 * Type definitions for Electron debugging functionality
 */

import { EventEmitter } from 'events';

/**
 * Electron process types
 */
export type ElectronProcessType = 'main' | 'renderer' | 'worker';

/**
 * Electron debugging configuration
 */
export interface ElectronDebugConfig {
  host?: string;
  mainPort?: number;
  rendererPort?: number;
  timeout?: number;
  autoDiscover?: boolean;
  enableIpcDebugging?: boolean;
  enablePerformanceProfiling?: boolean;
  enableSecurityDebugging?: boolean;
  enableGUIDebugging?: boolean;
  projectPath?: string;
  electronPath?: string;
  appPath?: string;
}

/**
 * Electron process information
 */
export interface ElectronProcessInfo {
  id: string;
  type: ElectronProcessType;
  pid: number;
  title: string;
  url?: string;
  webSocketDebuggerUrl?: string;
  devtoolsFrontendUrl?: string;
  faviconUrl?: string;
  thumbnailUrl?: string;
  description?: string;
  parentId?: string;
}

/**
 * Electron debugging session
 */
export interface ElectronDebugSession {
  sessionId: string;
  mainProcess?: ElectronProcessInfo;
  rendererProcesses: Map<string, ElectronProcessInfo>;
  workerProcesses: Map<string, ElectronProcessInfo>;
  ipcChannels: Map<string, ElectronIPCChannel>;
  connected: boolean;
  startTime: Date;
  config: ElectronDebugConfig;
}

/**
 * IPC Channel information
 */
export interface ElectronIPCChannel {
  name: string;
  type: 'invoke' | 'send' | 'sendSync' | 'handle' | 'on';
  direction: 'main-to-renderer' | 'renderer-to-main' | 'bidirectional';
  messageCount: number;
  lastMessage?: ElectronIPCMessage;
  active: boolean;
}

/**
 * IPC Message
 */
export interface ElectronIPCMessage {
  id: string;
  channel: string;
  type: 'invoke' | 'send' | 'sendSync' | 'handle' | 'on';
  direction: 'main-to-renderer' | 'renderer-to-main';
  timestamp: Date;
  payload: any;
  sender: {
    processId: string;
    processType: ElectronProcessType;
  };
  receiver?: {
    processId: string;
    processType: ElectronProcessType;
  };
  response?: any;
  error?: Error;
}

/**
 * Electron breakpoint
 */
export interface ElectronBreakpoint {
  id: string;
  type: 'line' | 'function' | 'ipc' | 'gui' | 'security';
  processType: ElectronProcessType;
  processId?: string;
  file?: string;
  line?: number;
  column?: number;
  condition?: string;
  hitCondition?: string;
  logMessage?: string;
  enabled: boolean;
  verified: boolean;
  // IPC-specific
  ipcChannel?: string;
  ipcDirection?: 'main-to-renderer' | 'renderer-to-main' | 'bidirectional';
  // GUI-specific
  selector?: string;
  eventType?: string;
  // Security-specific
  securityContext?: string;
  permission?: string;
}

/**
 * Electron performance metrics
 */
export interface ElectronPerformanceMetrics {
  processId: string;
  processType: ElectronProcessType;
  timestamp: Date;
  memory: {
    heapUsed: number;
    heapTotal: number;
    external: number;
    rss: number;
    arrayBuffers: number;
  };
  cpu: {
    percentCPUUsage: number;
    idleWakeupsPerSecond: number;
  };
  gpu?: {
    memoryUsage: number;
    utilization: number;
  };
  // Renderer-specific metrics
  dom?: {
    nodeCount: number;
    listenerCount: number;
  };
  rendering?: {
    framesPerSecond: number;
    droppedFrames: number;
    layoutDuration: number;
    paintDuration: number;
  };
}

/**
 * Electron security context
 */
export interface ElectronSecurityContext {
  processId: string;
  processType: ElectronProcessType;
  nodeIntegration: boolean;
  contextIsolation: boolean;
  sandbox: boolean;
  webSecurity: boolean;
  allowRunningInsecureContent: boolean;
  experimentalFeatures: boolean;
  preloadScripts: string[];
  permissions: string[];
  csp?: string;
  origin?: string;
}

/**
 * Electron GUI element
 */
export interface ElectronGUIElement {
  id: string;
  type: 'window' | 'webContents' | 'menu' | 'tray' | 'dialog' | 'notification';
  title?: string;
  bounds?: {
    x: number;
    y: number;
    width: number;
    height: number;
  };
  visible: boolean;
  focused: boolean;
  minimized?: boolean;
  maximized?: boolean;
  fullscreen?: boolean;
  properties: Record<string, any>;
  children?: ElectronGUIElement[];
}

/**
 * Electron debugging events
 */
export interface ElectronDebuggerEvents {
  connected: (session: ElectronDebugSession) => void;
  disconnected: (sessionId: string) => void;
  processAdded: (process: ElectronProcessInfo) => void;
  processRemoved: (processId: string) => void;
  breakpointHit: (breakpoint: ElectronBreakpoint, context: any) => void;
  ipcMessage: (message: ElectronIPCMessage) => void;
  performanceUpdate: (metrics: ElectronPerformanceMetrics) => void;
  securityViolation: (violation: any) => void;
  guiEvent: (event: any) => void;
  error: (error: Error) => void;
}

/**
 * Electron debugger interface
 */
export interface IElectronDebugger extends EventEmitter {
  connect(config: ElectronDebugConfig): Promise<ElectronDebugSession>;
  disconnect(sessionId: string): Promise<void>;
  getSession(sessionId: string): ElectronDebugSession | undefined;
  getAllSessions(): ElectronDebugSession[];
  
  // Process management
  getProcesses(sessionId: string): Promise<ElectronProcessInfo[]>;
  attachToProcess(sessionId: string, processId: string): Promise<void>;
  detachFromProcess(sessionId: string, processId: string): Promise<void>;
  
  // Breakpoints
  setBreakpoint(sessionId: string, breakpoint: Omit<ElectronBreakpoint, 'id' | 'verified'>): Promise<ElectronBreakpoint>;
  removeBreakpoint(sessionId: string, breakpointId: string): Promise<void>;
  getBreakpoints(sessionId: string): Promise<ElectronBreakpoint[]>;
  
  // Execution control
  continue(sessionId: string, processId?: string): Promise<void>;
  pause(sessionId: string, processId?: string): Promise<void>;
  stepOver(sessionId: string, processId?: string): Promise<void>;
  stepInto(sessionId: string, processId?: string): Promise<void>;
  stepOut(sessionId: string, processId?: string): Promise<void>;
  
  // Evaluation
  evaluate(sessionId: string, expression: string, processId?: string, frameId?: number): Promise<any>;
  
  // IPC debugging
  traceIPC(sessionId: string, enabled: boolean): Promise<void>;
  getIPCChannels(sessionId: string): Promise<ElectronIPCChannel[]>;
  getIPCMessages(sessionId: string, channelName?: string, limit?: number): Promise<ElectronIPCMessage[]>;
  
  // Performance
  startProfiling(sessionId: string, processId?: string, type?: 'cpu' | 'memory' | 'rendering'): Promise<void>;
  stopProfiling(sessionId: string, processId?: string): Promise<any>;
  getPerformanceMetrics(sessionId: string, processId?: string): Promise<ElectronPerformanceMetrics>;
  
  // Security
  getSecurityContext(sessionId: string, processId?: string): Promise<ElectronSecurityContext>;
  validateSecurity(sessionId: string): Promise<any>;
  
  // GUI
  getGUIElements(sessionId: string): Promise<ElectronGUIElement[]>;
  inspectGUIElement(sessionId: string, elementId: string): Promise<any>;
  simulateGUIEvent(sessionId: string, elementId: string, event: any): Promise<void>;
}

/**
 * Electron debugging error types
 */
export enum ElectronErrorType {
  CONNECTION_FAILED = 'CONNECTION_FAILED',
  PROCESS_NOT_FOUND = 'PROCESS_NOT_FOUND',
  BREAKPOINT_FAILED = 'BREAKPOINT_FAILED',
  EVALUATION_FAILED = 'EVALUATION_FAILED',
  IPC_ERROR = 'IPC_ERROR',
  SECURITY_ERROR = 'SECURITY_ERROR',
  GUI_ERROR = 'GUI_ERROR',
  PROFILING_ERROR = 'PROFILING_ERROR',
  TIMEOUT = 'TIMEOUT',
  INVALID_CONFIG = 'INVALID_CONFIG'
}

/**
 * Electron debugging error
 */
export class ElectronDebugError extends Error {
  constructor(
    public type: ElectronErrorType,
    message: string,
    public details?: any
  ) {
    super(message);
    this.name = 'ElectronDebugError';
  }
}
