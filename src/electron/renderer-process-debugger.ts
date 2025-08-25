/**
 * Renderer Process Debugger - Handles debugging of Electron renderer processes
 * 
 * This debugger manages the Chromium renderer processes of Electron applications,
 * providing debugging capabilities for web content, DOM manipulation,
 * and browser API interactions.
 */

import { EventEmitter } from 'events';
import WebSocket from 'ws';
import axios from 'axios';
import type { Logger } from '../utils/logger.js';
import type {
  ElectronProcessInfo,
  ElectronDebugConfig,
  ElectronBreakpoint,
  ElectronGUIElement,
  ElectronPerformanceMetrics
} from './types.js';
import { ElectronDebugError, ElectronErrorType } from './types.js';

/**
 * Renderer Process connection info
 */
interface RendererProcessConnection {
  processInfo: ElectronProcessInfo;
  websocket?: WebSocket;
  debuggerUrl?: string;
  sessionId?: string;
  breakpoints: Map<string, ElectronBreakpoint>;
  isDebugging: boolean;
  domEnabled: boolean;
  runtimeEnabled: boolean;
  performanceEnabled: boolean;
}

/**
 * Renderer Process Debugger class
 */
export class RendererProcessDebugger extends EventEmitter {
  private logger: Logger;
  private connectedProcesses: Map<string, RendererProcessConnection> = new Map();
  private messageId = 1;

  constructor(logger: Logger) {
    super();
    this.logger = logger;
  }

  /**
   * Connect to renderer process
   */
  async connect(processInfo: ElectronProcessInfo, config: ElectronDebugConfig): Promise<void> {
    this.logger.info('Connecting to renderer process', { processId: processInfo.id });

    try {
      const connection: RendererProcessConnection = {
        processInfo,
        breakpoints: new Map(),
        isDebugging: false,
        domEnabled: false,
        runtimeEnabled: false,
        performanceEnabled: false
      };

      // Connect via WebSocket if available
      if (processInfo.webSocketDebuggerUrl) {
        await this.connectWebSocket(connection, processInfo.webSocketDebuggerUrl);
      } else {
        // Try to discover WebSocket URL
        const discoveredUrl = await this.discoverWebSocketUrl(config.host || 'localhost', config.rendererPort || 9222, processInfo.id);
        if (discoveredUrl) {
          await this.connectWebSocket(connection, discoveredUrl);
        }
      }

      this.connectedProcesses.set(processInfo.id, connection);
      this.emit('processAdded', processInfo);

      this.logger.info('Successfully connected to renderer process', {
        processId: processInfo.id,
        hasWebSocket: !!connection.websocket
      });
    } catch (error) {
      const debugError = new ElectronDebugError(
        ElectronErrorType.CONNECTION_FAILED,
        `Failed to connect to renderer process: ${error instanceof Error ? error.message : String(error)}`,
        { processInfo, originalError: error }
      );
      this.logger.error('Renderer process connection failed', { error: debugError });
      throw debugError;
    }
  }

  /**
   * Disconnect from renderer process
   */
  async disconnect(processId: string): Promise<void> {
    this.logger.info('Disconnecting from renderer process', { processId });

    try {
      const connection = this.connectedProcesses.get(processId);
      if (connection) {
        // Close WebSocket connection
        if (connection.websocket) {
          connection.websocket.close();
        }

        this.connectedProcesses.delete(processId);
      }

      this.emit('processRemoved', processId);
      this.logger.info('Successfully disconnected from renderer process', { processId });
    } catch (error) {
      const debugError = new ElectronDebugError(
        ElectronErrorType.CONNECTION_FAILED,
        `Failed to disconnect from renderer process: ${error instanceof Error ? error.message : String(error)}`,
        { processId, originalError: error }
      );
      this.logger.error('Renderer process disconnection failed', { error: debugError });
      throw debugError;
    }
  }

  /**
   * Get connected processes
   */
  getConnectedProcesses(): ElectronProcessInfo[] {
    return Array.from(this.connectedProcesses.values()).map(conn => conn.processInfo);
  }

  /**
   * Check if process is connected
   */
  isConnected(processId: string): boolean {
    return this.connectedProcesses.has(processId);
  }

  /**
   * Set breakpoint in renderer process
   */
  async setBreakpoint(processId: string, url: string, line: number, condition?: string): Promise<ElectronBreakpoint> {
    const connection = this.connectedProcesses.get(processId);
    if (!connection) {
      throw new ElectronDebugError(ElectronErrorType.PROCESS_NOT_FOUND, `Process not found: ${processId}`);
    }

    if (!connection.websocket) {
      throw new ElectronDebugError(ElectronErrorType.CONNECTION_FAILED, 'WebSocket connection not available');
    }

    const breakpointId = `bp-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
    const breakpoint: ElectronBreakpoint = {
      id: breakpointId,
      type: 'line',
      processType: 'renderer',
      processId,
      file: url,
      line,
      ...(condition && { condition }),
      enabled: true,
      verified: false
    };

    try {
      // Send setBreakpointByUrl command via Chrome DevTools Protocol
      const response = await this.sendDebuggerCommand(connection, 'Debugger.setBreakpointByUrl', {
        lineNumber: line - 1, // Chrome DevTools uses 0-based line numbers
        url: url,
        condition
      });

      if (response.result && response.result.breakpointId) {
        breakpoint.verified = true;
        connection.breakpoints.set(breakpointId, breakpoint);

        this.logger.info('Breakpoint set in renderer process', { processId, url, line, breakpointId });
        return breakpoint;
      } else {
        throw new Error('Failed to set breakpoint');
      }
    } catch (error) {
      throw new ElectronDebugError(
        ElectronErrorType.BREAKPOINT_FAILED,
        `Failed to set breakpoint: ${error instanceof Error ? error.message : String(error)}`,
        { processId, url, line, originalError: error }
      );
    }
  }

  /**
   * Get DOM tree from renderer process
   */
  async getDOMTree(processId: string): Promise<any> {
    const connection = this.connectedProcesses.get(processId);
    if (!connection) {
      throw new ElectronDebugError(ElectronErrorType.PROCESS_NOT_FOUND, `Process not found: ${processId}`);
    }

    if (!connection.websocket) {
      throw new ElectronDebugError(ElectronErrorType.CONNECTION_FAILED, 'WebSocket connection not available');
    }

    try {
      if (!connection.domEnabled) {
        await this.sendDebuggerCommand(connection, 'DOM.enable');
        connection.domEnabled = true;
      }

      const response = await this.sendDebuggerCommand(connection, 'DOM.getDocument', {
        depth: -1,
        pierce: true
      });

      return response.result.root;
    } catch (error) {
      throw new ElectronDebugError(
        ElectronErrorType.GUI_ERROR,
        `Failed to get DOM tree: ${error instanceof Error ? error.message : String(error)}`,
        { processId, originalError: error }
      );
    }
  }

  /**
   * Get GUI elements from renderer process
   */
  async getGUIElements(processId: string): Promise<ElectronGUIElement[]> {
    try {
      const domTree = await this.getDOMTree(processId);
      return this.convertDOMToGUIElements(domTree);
    } catch (error) {
      throw new ElectronDebugError(
        ElectronErrorType.GUI_ERROR,
        `Failed to get GUI elements: ${error instanceof Error ? error.message : String(error)}`,
        { processId, originalError: error }
      );
    }
  }

  /**
   * Inspect specific GUI element
   */
  async inspectGUIElement(processId: string, nodeId: number): Promise<any> {
    const connection = this.connectedProcesses.get(processId);
    if (!connection) {
      throw new ElectronDebugError(ElectronErrorType.PROCESS_NOT_FOUND, `Process not found: ${processId}`);
    }

    if (!connection.websocket) {
      throw new ElectronDebugError(ElectronErrorType.CONNECTION_FAILED, 'WebSocket connection not available');
    }

    try {
      // Get computed styles
      const stylesResponse = await this.sendDebuggerCommand(connection, 'CSS.getComputedStyleForNode', {
        nodeId
      });

      // Get box model
      const boxModelResponse = await this.sendDebuggerCommand(connection, 'DOM.getBoxModel', {
        nodeId
      });

      // Get attributes
      const attributesResponse = await this.sendDebuggerCommand(connection, 'DOM.getAttributes', {
        nodeId
      });

      return {
        nodeId,
        computedStyles: stylesResponse.result.computedStyle,
        boxModel: boxModelResponse.result.model,
        attributes: attributesResponse.result.attributes
      };
    } catch (error) {
      throw new ElectronDebugError(
        ElectronErrorType.GUI_ERROR,
        `Failed to inspect GUI element: ${error instanceof Error ? error.message : String(error)}`,
        { processId, nodeId, originalError: error }
      );
    }
  }

  /**
   * Simulate GUI event
   */
  async simulateGUIEvent(processId: string, nodeId: number, eventType: string, options?: any): Promise<void> {
    const connection = this.connectedProcesses.get(processId);
    if (!connection) {
      throw new ElectronDebugError(ElectronErrorType.PROCESS_NOT_FOUND, `Process not found: ${processId}`);
    }

    if (!connection.websocket) {
      throw new ElectronDebugError(ElectronErrorType.CONNECTION_FAILED, 'WebSocket connection not available');
    }

    try {
      // Get the center point of the element
      const boxModel = await this.sendDebuggerCommand(connection, 'DOM.getBoxModel', { nodeId });
      const quad = boxModel.result.model.content;
      const x = (quad[0] + quad[2] + quad[4] + quad[6]) / 4;
      const y = (quad[1] + quad[3] + quad[5] + quad[7]) / 4;

      // Simulate the event
      switch (eventType) {
        case 'click':
          await this.sendDebuggerCommand(connection, 'Input.dispatchMouseEvent', {
            type: 'mousePressed',
            x,
            y,
            button: 'left',
            clickCount: 1
          });
          await this.sendDebuggerCommand(connection, 'Input.dispatchMouseEvent', {
            type: 'mouseReleased',
            x,
            y,
            button: 'left',
            clickCount: 1
          });
          break;

        case 'hover':
          await this.sendDebuggerCommand(connection, 'Input.dispatchMouseEvent', {
            type: 'mouseMoved',
            x,
            y
          });
          break;

        case 'keypress':
          if (options && options.key) {
            await this.sendDebuggerCommand(connection, 'Input.dispatchKeyEvent', {
              type: 'keyDown',
              key: options.key,
              text: options.text || options.key
            });
            await this.sendDebuggerCommand(connection, 'Input.dispatchKeyEvent', {
              type: 'keyUp',
              key: options.key
            });
          }
          break;

        default:
          throw new Error(`Unsupported event type: ${eventType}`);
      }

      this.logger.info('GUI event simulated', { processId, nodeId, eventType });
    } catch (error) {
      throw new ElectronDebugError(
        ElectronErrorType.GUI_ERROR,
        `Failed to simulate GUI event: ${error instanceof Error ? error.message : String(error)}`,
        { processId, nodeId, eventType, originalError: error }
      );
    }
  }

  /**
   * Start performance profiling
   */
  async startPerformanceProfiling(processId: string, type: 'cpu' | 'memory' | 'rendering' = 'cpu'): Promise<void> {
    const connection = this.connectedProcesses.get(processId);
    if (!connection) {
      throw new ElectronDebugError(ElectronErrorType.PROCESS_NOT_FOUND, `Process not found: ${processId}`);
    }

    if (!connection.websocket) {
      throw new ElectronDebugError(ElectronErrorType.CONNECTION_FAILED, 'WebSocket connection not available');
    }

    try {
      switch (type) {
        case 'cpu':
          await this.sendDebuggerCommand(connection, 'Profiler.enable');
          await this.sendDebuggerCommand(connection, 'Profiler.start');
          break;

        case 'memory':
          await this.sendDebuggerCommand(connection, 'HeapProfiler.enable');
          await this.sendDebuggerCommand(connection, 'HeapProfiler.startSampling');
          break;

        case 'rendering':
          if (!connection.performanceEnabled) {
            await this.sendDebuggerCommand(connection, 'Performance.enable');
            connection.performanceEnabled = true;
          }
          await this.sendDebuggerCommand(connection, 'Performance.getMetrics');
          break;
      }

      this.logger.info('Performance profiling started', { processId, type });
    } catch (error) {
      throw new ElectronDebugError(
        ElectronErrorType.PROFILING_ERROR,
        `Failed to start performance profiling: ${error instanceof Error ? error.message : String(error)}`,
        { processId, type, originalError: error }
      );
    }
  }

  /**
   * Stop performance profiling
   */
  async stopPerformanceProfiling(processId: string, type: 'cpu' | 'memory' | 'rendering' = 'cpu'): Promise<any> {
    const connection = this.connectedProcesses.get(processId);
    if (!connection) {
      throw new ElectronDebugError(ElectronErrorType.PROCESS_NOT_FOUND, `Process not found: ${processId}`);
    }

    if (!connection.websocket) {
      throw new ElectronDebugError(ElectronErrorType.CONNECTION_FAILED, 'WebSocket connection not available');
    }

    try {
      let result;

      switch (type) {
        case 'cpu':
          result = await this.sendDebuggerCommand(connection, 'Profiler.stop');
          await this.sendDebuggerCommand(connection, 'Profiler.disable');
          break;

        case 'memory':
          result = await this.sendDebuggerCommand(connection, 'HeapProfiler.stopSampling');
          await this.sendDebuggerCommand(connection, 'HeapProfiler.disable');
          break;

        case 'rendering':
          result = await this.sendDebuggerCommand(connection, 'Performance.getMetrics');
          break;
      }

      this.logger.info('Performance profiling stopped', { processId, type });
      return result.result;
    } catch (error) {
      throw new ElectronDebugError(
        ElectronErrorType.PROFILING_ERROR,
        `Failed to stop performance profiling: ${error instanceof Error ? error.message : String(error)}`,
        { processId, type, originalError: error }
      );
    }
  }

  /**
   * Get performance metrics
   */
  async getPerformanceMetrics(processId: string): Promise<ElectronPerformanceMetrics> {
    const connection = this.connectedProcesses.get(processId);
    if (!connection) {
      throw new ElectronDebugError(ElectronErrorType.PROCESS_NOT_FOUND, `Process not found: ${processId}`);
    }

    if (!connection.websocket) {
      throw new ElectronDebugError(ElectronErrorType.CONNECTION_FAILED, 'WebSocket connection not available');
    }

    try {
      // Get runtime metrics
      const runtimeResponse = await this.sendDebuggerCommand(connection, 'Runtime.evaluate', {
        expression: `JSON.stringify({
          memory: performance.memory ? {
            usedJSHeapSize: performance.memory.usedJSHeapSize,
            totalJSHeapSize: performance.memory.totalJSHeapSize,
            jsHeapSizeLimit: performance.memory.jsHeapSizeLimit
          } : null,
          timing: performance.timing ? {
            navigationStart: performance.timing.navigationStart,
            loadEventEnd: performance.timing.loadEventEnd,
            domContentLoadedEventEnd: performance.timing.domContentLoadedEventEnd
          } : null,
          navigation: performance.navigation ? {
            type: performance.navigation.type,
            redirectCount: performance.navigation.redirectCount
          } : null
        })`,
        returnByValue: true
      });

      const runtimeData = JSON.parse(runtimeResponse.result.result.value);

      // Get DOM metrics
      const domResponse = await this.sendDebuggerCommand(connection, 'Runtime.evaluate', {
        expression: `JSON.stringify({
          nodeCount: document.querySelectorAll('*').length,
          listenerCount: getEventListeners ? Object.keys(getEventListeners(document)).length : 0
        })`,
        returnByValue: true
      });

      const domData = JSON.parse(domResponse.result.result.value);

      const metrics: ElectronPerformanceMetrics = {
        processId,
        processType: 'renderer',
        timestamp: new Date(),
        memory: {
          heapUsed: runtimeData.memory ? Math.round(runtimeData.memory.usedJSHeapSize / 1024 / 1024) : 0,
          heapTotal: runtimeData.memory ? Math.round(runtimeData.memory.totalJSHeapSize / 1024 / 1024) : 0,
          external: 0,
          rss: 0,
          arrayBuffers: 0
        },
        cpu: {
          percentCPUUsage: 0,
          idleWakeupsPerSecond: 0
        },
        dom: {
          nodeCount: domData.nodeCount,
          listenerCount: domData.listenerCount
        },
        rendering: {
          framesPerSecond: 60, // Default, would need more complex measurement
          droppedFrames: 0,
          layoutDuration: 0,
          paintDuration: 0
        }
      };

      return metrics;
    } catch (error) {
      throw new ElectronDebugError(
        ElectronErrorType.PROFILING_ERROR,
        `Failed to get performance metrics: ${error instanceof Error ? error.message : String(error)}`,
        { processId, originalError: error }
      );
    }
  }

  /**
   * Connect WebSocket to debugger
   */
  private async connectWebSocket(connection: RendererProcessConnection, webSocketUrl: string): Promise<void> {
    return new Promise((resolve, reject) => {
      const ws = new WebSocket(webSocketUrl);

      ws.on('open', async () => {
        connection.websocket = ws;
        connection.debuggerUrl = webSocketUrl;

        // Enable debugger and runtime
        try {
          await this.sendDebuggerCommand(connection, 'Debugger.enable');
          await this.sendDebuggerCommand(connection, 'Runtime.enable');
          await this.sendDebuggerCommand(connection, 'CSS.enable');
          connection.isDebugging = true;
          connection.runtimeEnabled = true;

          this.logger.debug('WebSocket connected and debugger enabled', {
            processId: connection.processInfo.id,
            url: webSocketUrl
          });
          resolve();
        } catch (error) {
          reject(error);
        }
      });

      ws.on('message', (data) => {
        try {
          const message = JSON.parse(data.toString());
          this.handleDebuggerMessage(connection, message);
        } catch (error) {
          this.logger.warn('Failed to parse debugger message', { error: error instanceof Error ? error.message : String(error) });
        }
      });

      ws.on('error', (error) => {
        this.logger.error('WebSocket error', { error: error.message });
        reject(error);
      });

      ws.on('close', () => {
        connection.websocket = undefined as any;
        connection.isDebugging = false;
        this.logger.debug('WebSocket connection closed', { processId: connection.processInfo.id });
      });
    });
  }

  /**
   * Discover WebSocket URL for debugging
   */
  private async discoverWebSocketUrl(host: string, port: number, processId: string): Promise<string | null> {
    try {
      const response = await axios.get(`http://${host}:${port}/json`, { timeout: 5000 });
      const targets = response.data;

      if (Array.isArray(targets)) {
        // Find target by ID or URL
        const target = targets.find(t => t.id === processId) ||
                     targets.find(t => t.type === 'page') ||
                     targets[0];

        return target ? target.webSocketDebuggerUrl : null;
      }
    } catch (error) {
      this.logger.debug('Failed to discover WebSocket URL', { host, port, processId, error: error instanceof Error ? error.message : String(error) });
    }

    return null;
  }

  /**
   * Send command to debugger via WebSocket
   */
  private async sendDebuggerCommand(connection: RendererProcessConnection, method: string, params?: any): Promise<any> {
    if (!connection.websocket) {
      throw new Error('WebSocket connection not available');
    }

    const id = this.messageId++;
    const message = {
      id,
      method,
      params: params || {}
    };

    return new Promise((resolve, reject) => {
      const timeout = setTimeout(() => {
        reject(new Error(`Debugger command timeout: ${method}`));
      }, 10000);

      const messageHandler = (data: WebSocket.Data) => {
        try {
          const response = JSON.parse(data.toString());
          if (response.id === id) {
            clearTimeout(timeout);
            connection.websocket!.removeListener('message', messageHandler);

            if (response.error) {
              reject(new Error(response.error.message || 'Debugger command failed'));
            } else {
              resolve(response);
            }
          }
        } catch (error) {
          // Ignore parsing errors for other messages
        }
      };

      connection.websocket!.on('message', messageHandler);
      connection.websocket!.send(JSON.stringify(message));
    });
  }

  /**
   * Handle debugger messages
   */
  private handleDebuggerMessage(connection: RendererProcessConnection, message: any): void {
    if (message.method) {
      switch (message.method) {
        case 'Debugger.paused':
          this.emit('paused', {
            processId: connection.processInfo.id,
            reason: message.params.reason,
            callFrames: message.params.callFrames
          });
          break;

        case 'Debugger.resumed':
          this.emit('resumed', {
            processId: connection.processInfo.id
          });
          break;

        case 'Runtime.consoleAPICalled':
          this.emit('console', {
            processId: connection.processInfo.id,
            type: message.params.type,
            args: message.params.args,
            timestamp: message.params.timestamp
          });
          break;

        case 'Runtime.exceptionThrown':
          this.emit('exception', {
            processId: connection.processInfo.id,
            exceptionDetails: message.params.exceptionDetails
          });
          break;

        case 'DOM.documentUpdated':
          this.emit('domUpdated', {
            processId: connection.processInfo.id
          });
          break;

        case 'CSS.styleSheetChanged':
          this.emit('styleChanged', {
            processId: connection.processInfo.id,
            styleSheetId: message.params.styleSheetId
          });
          break;
      }
    }
  }

  /**
   * Convert DOM tree to GUI elements
   */
  private convertDOMToGUIElements(domNode: any, _parent?: ElectronGUIElement): ElectronGUIElement[] {
    const elements: ElectronGUIElement[] = [];

    if (!domNode) return elements;

    const element: ElectronGUIElement = {
      id: domNode.nodeId?.toString() || `node-${Date.now()}`,
      type: 'webContents',
      title: domNode.nodeName || 'Unknown',
      visible: true,
      focused: false,
      properties: {
        nodeId: domNode.nodeId,
        nodeName: domNode.nodeName,
        nodeType: domNode.nodeType,
        nodeValue: domNode.nodeValue,
        attributes: domNode.attributes || []
      }
    };

    elements.push(element);

    // Process children
    if (domNode.children && Array.isArray(domNode.children)) {
      const children: ElectronGUIElement[] = [];
      for (const child of domNode.children) {
        children.push(...this.convertDOMToGUIElements(child, element));
      }
      element.children = children;
    }

    return elements;
  }
}
