/**
 * Main Process Debugger - Handles debugging of Electron main process
 * 
 * This debugger manages the Node.js main process of Electron applications,
 * providing debugging capabilities for the main thread, app lifecycle,
 * and native API interactions.
 */

import { EventEmitter } from 'events';
import WebSocket from 'ws';
import axios from 'axios';
import type { Logger } from '../utils/logger.js';
import type { ElectronProcessInfo, ElectronDebugConfig, ElectronBreakpoint } from './types.js';
import { ElectronDebugError, ElectronErrorType } from './types.js';

/**
 * Main Process connection info
 */
interface MainProcessConnection {
  processInfo: ElectronProcessInfo;
  websocket?: WebSocket;
  debuggerUrl?: string;
  sessionId?: string;
  breakpoints: Map<string, ElectronBreakpoint>;
  isDebugging: boolean;
}

/**
 * Main Process Debugger class
 */
export class MainProcessDebugger extends EventEmitter {
  private logger: Logger;
  private connectedProcesses: Map<string, MainProcessConnection> = new Map();
  private messageId = 1;

  constructor(logger: Logger) {
    super();
    this.logger = logger;
  }

  /**
   * Connect to main process
   */
  async connect(processInfo: ElectronProcessInfo, config: ElectronDebugConfig): Promise<void> {
    this.logger.info('Connecting to main process', { processId: processInfo.id });

    try {
      const connection: MainProcessConnection = {
        processInfo,
        breakpoints: new Map(),
        isDebugging: false
      };

      // Connect via WebSocket if available
      if (processInfo.webSocketDebuggerUrl) {
        await this.connectWebSocket(connection, processInfo.webSocketDebuggerUrl);
      } else {
        // Try to discover WebSocket URL
        const discoveredUrl = await this.discoverWebSocketUrl(config.host || 'localhost', config.mainPort || 9229);
        if (discoveredUrl) {
          await this.connectWebSocket(connection, discoveredUrl);
        }
      }

      this.connectedProcesses.set(processInfo.id, connection);
      this.emit('connected', processInfo);

      this.logger.info('Successfully connected to main process', {
        processId: processInfo.id,
        hasWebSocket: !!connection.websocket
      });
    } catch (error) {
      const debugError = new ElectronDebugError(
        ElectronErrorType.CONNECTION_FAILED,
        `Failed to connect to main process: ${error instanceof Error ? error.message : String(error)}`,
        { processInfo, originalError: error }
      );
      this.logger.error('Main process connection failed', { error: debugError });
      throw debugError;
    }
  }

  /**
   * Disconnect from main process
   */
  async disconnect(processId: string): Promise<void> {
    this.logger.info('Disconnecting from main process', { processId });

    try {
      const connection = this.connectedProcesses.get(processId);
      if (connection) {
        // Close WebSocket connection
        if (connection.websocket) {
          connection.websocket.close();
        }

        this.connectedProcesses.delete(processId);
      }

      this.emit('disconnected', processId);
      this.logger.info('Successfully disconnected from main process', { processId });
    } catch (error) {
      const debugError = new ElectronDebugError(
        ElectronErrorType.CONNECTION_FAILED,
        `Failed to disconnect from main process: ${error instanceof Error ? error.message : String(error)}`,
        { processId, originalError: error }
      );
      this.logger.error('Main process disconnection failed', { error: debugError });
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
   * Set breakpoint in main process
   */
  async setBreakpoint(processId: string, file: string, line: number, condition?: string): Promise<ElectronBreakpoint> {
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
      processType: 'main',
      processId,
      file,
      line,
      ...(condition && { condition }),
      enabled: true,
      verified: false
    };

    try {
      // Send setBreakpointByUrl command via Chrome DevTools Protocol
      const response = await this.sendDebuggerCommand(connection, 'Debugger.setBreakpointByUrl', {
        lineNumber: line - 1, // Chrome DevTools uses 0-based line numbers
        url: file,
        condition
      });

      if (response.result && response.result.breakpointId) {
        breakpoint.verified = true;
        connection.breakpoints.set(breakpointId, breakpoint);

        this.logger.info('Breakpoint set in main process', { processId, file, line, breakpointId });
        return breakpoint;
      } else {
        throw new Error('Failed to set breakpoint');
      }
    } catch (error) {
      throw new ElectronDebugError(
        ElectronErrorType.BREAKPOINT_FAILED,
        `Failed to set breakpoint: ${error instanceof Error ? error.message : String(error)}`,
        { processId, file, line, originalError: error }
      );
    }
  }

  /**
   * Remove breakpoint from main process
   */
  async removeBreakpoint(processId: string, breakpointId: string): Promise<void> {
    const connection = this.connectedProcesses.get(processId);
    if (!connection) {
      throw new ElectronDebugError(ElectronErrorType.PROCESS_NOT_FOUND, `Process not found: ${processId}`);
    }

    const breakpoint = connection.breakpoints.get(breakpointId);
    if (!breakpoint) {
      throw new ElectronDebugError(ElectronErrorType.BREAKPOINT_FAILED, `Breakpoint not found: ${breakpointId}`);
    }

    if (!connection.websocket) {
      throw new ElectronDebugError(ElectronErrorType.CONNECTION_FAILED, 'WebSocket connection not available');
    }

    try {
      await this.sendDebuggerCommand(connection, 'Debugger.removeBreakpoint', {
        breakpointId: breakpoint.id
      });

      connection.breakpoints.delete(breakpointId);
      this.logger.info('Breakpoint removed from main process', { processId, breakpointId });
    } catch (error) {
      throw new ElectronDebugError(
        ElectronErrorType.BREAKPOINT_FAILED,
        `Failed to remove breakpoint: ${error instanceof Error ? error.message : String(error)}`,
        { processId, breakpointId, originalError: error }
      );
    }
  }

  /**
   * Evaluate expression in main process
   */
  async evaluateExpression(processId: string, expression: string, contextId?: number): Promise<any> {
    const connection = this.connectedProcesses.get(processId);
    if (!connection) {
      throw new ElectronDebugError(ElectronErrorType.PROCESS_NOT_FOUND, `Process not found: ${processId}`);
    }

    if (!connection.websocket) {
      throw new ElectronDebugError(ElectronErrorType.CONNECTION_FAILED, 'WebSocket connection not available');
    }

    try {
      const response = await this.sendDebuggerCommand(connection, 'Runtime.evaluate', {
        expression,
        contextId,
        returnByValue: true,
        generatePreview: true
      });

      if (response.result && response.result.result) {
        return response.result.result.value;
      } else if (response.result && response.result.exceptionDetails) {
        throw new Error(response.result.exceptionDetails.text || 'Evaluation failed');
      } else {
        throw new Error('Unknown evaluation error');
      }
    } catch (error) {
      throw new ElectronDebugError(
        ElectronErrorType.EVALUATION_FAILED,
        `Failed to evaluate expression: ${error instanceof Error ? error.message : String(error)}`,
        { processId, expression, originalError: error }
      );
    }
  }

  /**
   * Continue execution in main process
   */
  async continue(processId: string): Promise<void> {
    const connection = this.connectedProcesses.get(processId);
    if (!connection) {
      throw new ElectronDebugError(ElectronErrorType.PROCESS_NOT_FOUND, `Process not found: ${processId}`);
    }

    if (!connection.websocket) {
      throw new ElectronDebugError(ElectronErrorType.CONNECTION_FAILED, 'WebSocket connection not available');
    }

    try {
      await this.sendDebuggerCommand(connection, 'Debugger.resume');
      this.logger.info('Continued execution in main process', { processId });
    } catch (error) {
      throw new ElectronDebugError(
        ElectronErrorType.EVALUATION_FAILED,
        `Failed to continue execution: ${error instanceof Error ? error.message : String(error)}`,
        { processId, originalError: error }
      );
    }
  }

  /**
   * Pause execution in main process
   */
  async pause(processId: string): Promise<void> {
    const connection = this.connectedProcesses.get(processId);
    if (!connection) {
      throw new ElectronDebugError(ElectronErrorType.PROCESS_NOT_FOUND, `Process not found: ${processId}`);
    }

    if (!connection.websocket) {
      throw new ElectronDebugError(ElectronErrorType.CONNECTION_FAILED, 'WebSocket connection not available');
    }

    try {
      await this.sendDebuggerCommand(connection, 'Debugger.pause');
      this.logger.info('Paused execution in main process', { processId });
    } catch (error) {
      throw new ElectronDebugError(
        ElectronErrorType.EVALUATION_FAILED,
        `Failed to pause execution: ${error instanceof Error ? error.message : String(error)}`,
        { processId, originalError: error }
      );
    }
  }

  /**
   * Step over in main process
   */
  async stepOver(processId: string): Promise<void> {
    const connection = this.connectedProcesses.get(processId);
    if (!connection) {
      throw new ElectronDebugError(ElectronErrorType.PROCESS_NOT_FOUND, `Process not found: ${processId}`);
    }

    if (!connection.websocket) {
      throw new ElectronDebugError(ElectronErrorType.CONNECTION_FAILED, 'WebSocket connection not available');
    }

    try {
      await this.sendDebuggerCommand(connection, 'Debugger.stepOver');
      this.logger.info('Step over executed in main process', { processId });
    } catch (error) {
      throw new ElectronDebugError(
        ElectronErrorType.EVALUATION_FAILED,
        `Failed to step over: ${error instanceof Error ? error.message : String(error)}`,
        { processId, originalError: error }
      );
    }
  }

  /**
   * Step into in main process
   */
  async stepInto(processId: string): Promise<void> {
    const connection = this.connectedProcesses.get(processId);
    if (!connection) {
      throw new ElectronDebugError(ElectronErrorType.PROCESS_NOT_FOUND, `Process not found: ${processId}`);
    }

    if (!connection.websocket) {
      throw new ElectronDebugError(ElectronErrorType.CONNECTION_FAILED, 'WebSocket connection not available');
    }

    try {
      await this.sendDebuggerCommand(connection, 'Debugger.stepInto');
      this.logger.info('Step into executed in main process', { processId });
    } catch (error) {
      throw new ElectronDebugError(
        ElectronErrorType.EVALUATION_FAILED,
        `Failed to step into: ${error instanceof Error ? error.message : String(error)}`,
        { processId, originalError: error }
      );
    }
  }

  /**
   * Step out in main process
   */
  async stepOut(processId: string): Promise<void> {
    const connection = this.connectedProcesses.get(processId);
    if (!connection) {
      throw new ElectronDebugError(ElectronErrorType.PROCESS_NOT_FOUND, `Process not found: ${processId}`);
    }

    if (!connection.websocket) {
      throw new ElectronDebugError(ElectronErrorType.CONNECTION_FAILED, 'WebSocket connection not available');
    }

    try {
      await this.sendDebuggerCommand(connection, 'Debugger.stepOut');
      this.logger.info('Step out executed in main process', { processId });
    } catch (error) {
      throw new ElectronDebugError(
        ElectronErrorType.EVALUATION_FAILED,
        `Failed to step out: ${error instanceof Error ? error.message : String(error)}`,
        { processId, originalError: error }
      );
    }
  }

  /**
   * Get Electron app information
   */
  async getElectronAppInfo(processId: string): Promise<any> {
    try {
      const appInfo = await this.evaluateExpression(processId, `
        JSON.stringify({
          name: require('electron').app.getName(),
          version: require('electron').app.getVersion(),
          path: require('electron').app.getAppPath(),
          userData: require('electron').app.getPath('userData'),
          isReady: require('electron').app.isReady(),
          isPackaged: require('electron').app.isPackaged
        })
      `);

      return JSON.parse(appInfo);
    } catch (error) {
      this.logger.warn('Failed to get Electron app info', { processId, error: error instanceof Error ? error.message : String(error) });
      return null;
    }
  }

  /**
   * Get BrowserWindow information
   */
  async getBrowserWindows(processId: string): Promise<any[]> {
    try {
      const windowsInfo = await this.evaluateExpression(processId, `
        JSON.stringify(
          require('electron').BrowserWindow.getAllWindows().map(win => ({
            id: win.id,
            title: win.getTitle(),
            bounds: win.getBounds(),
            isVisible: win.isVisible(),
            isFocused: win.isFocused(),
            isMinimized: win.isMinimized(),
            isMaximized: win.isMaximized(),
            isFullScreen: win.isFullScreen(),
            webContentsId: win.webContents.id
          }))
        )
      `);

      return JSON.parse(windowsInfo);
    } catch (error) {
      this.logger.warn('Failed to get BrowserWindow info', { processId, error: error instanceof Error ? error.message : String(error) });
      return [];
    }
  }

  /**
   * Connect WebSocket to debugger
   */
  private async connectWebSocket(connection: MainProcessConnection, webSocketUrl: string): Promise<void> {
    return new Promise((resolve, reject) => {
      const ws = new WebSocket(webSocketUrl);

      ws.on('open', async () => {
        connection.websocket = ws;
        connection.debuggerUrl = webSocketUrl;

        // Enable debugger
        try {
          await this.sendDebuggerCommand(connection, 'Debugger.enable');
          await this.sendDebuggerCommand(connection, 'Runtime.enable');
          connection.isDebugging = true;

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
  private async discoverWebSocketUrl(host: string, port: number): Promise<string | null> {
    try {
      const response = await axios.get(`http://${host}:${port}/json`, { timeout: 5000 });
      const targets = response.data;

      if (Array.isArray(targets) && targets.length > 0) {
        const mainTarget = targets.find(target => target.type === 'node') || targets[0];
        return mainTarget.webSocketDebuggerUrl || null;
      }
    } catch (error) {
      this.logger.debug('Failed to discover WebSocket URL', { host, port, error: error instanceof Error ? error.message : String(error) });
    }

    return null;
  }

  /**
   * Send command to debugger via WebSocket
   */
  private async sendDebuggerCommand(connection: MainProcessConnection, method: string, params?: any): Promise<any> {
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
  private handleDebuggerMessage(connection: MainProcessConnection, message: any): void {
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
      }
    }
  }
}
