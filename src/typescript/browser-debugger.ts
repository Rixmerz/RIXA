/**
 * Enhanced Browser Debugging Integration for TypeScript/JavaScript
 * 
 * This module provides comprehensive browser debugging capabilities
 * including Chrome DevTools integration, React debugging, and
 * modern web framework support.
 */

import { EventEmitter } from 'events';
import WebSocket from 'ws';
import type { Logger } from '../utils/logger.js';

// Simple logger implementation for TypeScript debugging
class SimpleLogger implements Logger {
  constructor(private name: string) {}

  error(message: string, meta?: Record<string, unknown>): void {
    console.error(`[${this.name}] ERROR: ${message}`, meta || '');
  }

  warn(message: string, meta?: Record<string, unknown>): void {
    console.warn(`[${this.name}] WARN: ${message}`, meta || '');
  }

  info(message: string, meta?: Record<string, unknown>): void {
    console.info(`[${this.name}] INFO: ${message}`, meta || '');
  }

  debug(message: string, meta?: Record<string, unknown>): void {
    console.debug(`[${this.name}] DEBUG: ${message}`, meta || '');
  }

  child(): Logger {
    return this;
  }
}

export interface BrowserDebugConfig {
  host?: string;
  port?: number;
  timeout?: number;
  enableReactDevTools?: boolean;
  enableVueDevTools?: boolean;
  enableSourceMaps?: boolean;
  enablePerformanceProfiling?: boolean;
}

export interface ReactComponentInfo {
  id: string;
  name: string;
  props: Record<string, any>;
  state: Record<string, any>;
  hooks?: Array<{
    name: string;
    value: any;
    subHooks?: any[];
  }>;
  context?: Record<string, any>;
  children?: ReactComponentInfo[];
}

export interface BrowserDebugSession {
  sessionId: string;
  tabId: string;
  url: string;
  title: string;
  connected: boolean;
  reactDetected: boolean;
  vueDetected: boolean;
  nextJsDetected: boolean;
}

export class BrowserDebugger extends EventEmitter {
  private logger: Logger;
  private config: BrowserDebugConfig;
  private sessions: Map<string, BrowserDebugSession>;
  private websockets: Map<string, WebSocket>;

  constructor(config: BrowserDebugConfig = {}) {
    super();
    this.config = {
      host: 'localhost',
      port: 9222,
      timeout: 10000,
      enableReactDevTools: true,
      enableVueDevTools: true,
      enableSourceMaps: true,
      enablePerformanceProfiling: true,
      ...config
    };
    this.logger = new SimpleLogger('BrowserDebugger');
    this.sessions = new Map();
    this.websockets = new Map();
  }

  /**
   * Connect to Chrome DevTools Protocol
   */
  async connect(): Promise<BrowserDebugSession[]> {
    try {
      const response = await fetch(`http://${this.config.host}:${this.config.port}/json`);
      const tabs = await response.json() as any[];
      
      const sessions: BrowserDebugSession[] = [];
      
      for (const tab of tabs) {
        if (tab.type === 'page' && tab.webSocketDebuggerUrl) {
          const session = await this.createSession(tab);
          sessions.push(session);
        }
      }
      
      this.logger.info(`Connected to ${sessions.length} browser tabs`);
      return sessions;
    } catch (error) {
      this.logger.error('Failed to connect to Chrome DevTools', { error });
      throw error;
    }
  }

  /**
   * Create debugging session for a browser tab
   */
  private async createSession(tab: any): Promise<BrowserDebugSession> {
    const sessionId = `browser-${tab.id}`;
    const ws = new WebSocket(tab.webSocketDebuggerUrl);
    
    const session: BrowserDebugSession = {
      sessionId,
      tabId: tab.id,
      url: tab.url,
      title: tab.title,
      connected: false,
      reactDetected: false,
      vueDetected: false,
      nextJsDetected: false
    };

    return new Promise((resolve, reject) => {
      const timeout = setTimeout(() => {
        reject(new Error('Connection timeout'));
      }, this.config.timeout);

      ws.on('open', async () => {
        clearTimeout(timeout);
        session.connected = true;
        this.sessions.set(sessionId, session);
        this.websockets.set(sessionId, ws);

        // Enable necessary domains
        await this.sendCommand(sessionId, 'Runtime.enable');
        await this.sendCommand(sessionId, 'Debugger.enable');
        await this.sendCommand(sessionId, 'DOM.enable');
        
        if (this.config.enablePerformanceProfiling) {
          await this.sendCommand(sessionId, 'Performance.enable');
        }

        // Detect frameworks
        await this.detectFrameworks(sessionId);

        this.logger.info(`Browser session created`, { sessionId, url: session.url });
        resolve(session);
      });

      ws.on('message', (data) => {
        this.handleMessage(sessionId, JSON.parse(data.toString()));
      });

      ws.on('error', (error) => {
        clearTimeout(timeout);
        this.logger.error('WebSocket error', { sessionId, error });
        reject(error);
      });

      ws.on('close', () => {
        session.connected = false;
        this.sessions.delete(sessionId);
        this.websockets.delete(sessionId);
        this.logger.info(`Browser session closed`, { sessionId });
      });
    });
  }

  /**
   * Detect JavaScript frameworks in the page
   */
  private async detectFrameworks(sessionId: string): Promise<void> {
    const session = this.sessions.get(sessionId);
    if (!session) return;

    try {
      // Detect React
      const reactResult = await this.sendCommand(sessionId, 'Runtime.evaluate', {
        expression: 'typeof window.React !== "undefined" || typeof window.__REACT_DEVTOOLS_GLOBAL_HOOK__ !== "undefined"'
      });
      session.reactDetected = reactResult.result?.value === true;

      // Detect Vue
      const vueResult = await this.sendCommand(sessionId, 'Runtime.evaluate', {
        expression: 'typeof window.Vue !== "undefined" || typeof window.__VUE__ !== "undefined"'
      });
      session.vueDetected = vueResult.result?.value === true;

      // Detect Next.js
      const nextResult = await this.sendCommand(sessionId, 'Runtime.evaluate', {
        expression: 'typeof window.__NEXT_DATA__ !== "undefined" || typeof window.next !== "undefined"'
      });
      session.nextJsDetected = nextResult.result?.value === true;

      this.logger.info('Framework detection completed', {
        sessionId,
        react: session.reactDetected,
        vue: session.vueDetected,
        nextjs: session.nextJsDetected
      });
    } catch (error) {
      this.logger.error('Framework detection failed', { sessionId, error });
    }
  }

  /**
   * Get React component tree
   */
  async getReactComponents(sessionId: string): Promise<ReactComponentInfo[]> {
    const session = this.sessions.get(sessionId);
    if (!session?.reactDetected) {
      throw new Error('React not detected in this session');
    }

    try {
      const result = await this.sendCommand(sessionId, 'Runtime.evaluate', {
        expression: `
          (function() {
            const hook = window.__REACT_DEVTOOLS_GLOBAL_HOOK__;
            if (!hook || !hook.renderers) return [];
            
            const components = [];
            hook.renderers.forEach((renderer, id) => {
              if (renderer.findFiberByHostInstance) {
                // Get React Fiber tree
                const rootNodes = renderer.Mount._instancesByReactRootID || {};
                Object.keys(rootNodes).forEach(rootID => {
                  const root = rootNodes[rootID];
                  if (root) {
                    components.push(extractComponentInfo(root));
                  }
                });
              }
            });
            
            function extractComponentInfo(fiber) {
              if (!fiber) return null;
              
              return {
                id: fiber.key || fiber.index || 'unknown',
                name: fiber.type?.name || fiber.type?.displayName || 'Unknown',
                props: fiber.memoizedProps || {},
                state: fiber.memoizedState || {},
                hooks: extractHooks(fiber),
                children: fiber.child ? [extractComponentInfo(fiber.child)] : []
              };
            }
            
            function extractHooks(fiber) {
              const hooks = [];
              let hook = fiber.memoizedState;
              while (hook) {
                hooks.push({
                  name: 'useState', // Simplified
                  value: hook.memoizedState
                });
                hook = hook.next;
              }
              return hooks;
            }
            
            return components;
          })()
        `,
        returnByValue: true
      });

      return result.result?.value || [];
    } catch (error) {
      this.logger.error('Failed to get React components', { sessionId, error });
      throw error;
    }
  }

  /**
   * Set breakpoint in browser
   */
  async setBreakpoint(sessionId: string, url: string, lineNumber: number, condition?: string): Promise<string> {
    try {
      const result = await this.sendCommand(sessionId, 'Debugger.setBreakpointByUrl', {
        lineNumber,
        url,
        condition
      });

      this.logger.info('Breakpoint set', { sessionId, url, lineNumber, breakpointId: result.breakpointId });
      return result.breakpointId;
    } catch (error) {
      this.logger.error('Failed to set breakpoint', { sessionId, url, lineNumber, error });
      throw error;
    }
  }

  /**
   * Evaluate expression in browser context
   */
  async evaluateExpression(sessionId: string, expression: string, contextId?: number): Promise<any> {
    try {
      const result = await this.sendCommand(sessionId, 'Runtime.evaluate', {
        expression,
        contextId,
        returnByValue: true,
        awaitPromise: true
      });

      if (result.exceptionDetails) {
        throw new Error(`Evaluation error: ${result.exceptionDetails.text}`);
      }

      return result.result?.value;
    } catch (error) {
      this.logger.error('Expression evaluation failed', { sessionId, expression, error });
      throw error;
    }
  }

  /**
   * Start performance profiling
   */
  async startPerformanceProfiling(sessionId: string): Promise<void> {
    if (!this.config.enablePerformanceProfiling) {
      throw new Error('Performance profiling not enabled');
    }

    try {
      await this.sendCommand(sessionId, 'Performance.enable');
      await this.sendCommand(sessionId, 'Profiler.enable');
      await this.sendCommand(sessionId, 'Profiler.start');
      
      this.logger.info('Performance profiling started', { sessionId });
    } catch (error) {
      this.logger.error('Failed to start performance profiling', { sessionId, error });
      throw error;
    }
  }

  /**
   * Stop performance profiling and get results
   */
  async stopPerformanceProfiling(sessionId: string): Promise<any> {
    try {
      const result = await this.sendCommand(sessionId, 'Profiler.stop');
      await this.sendCommand(sessionId, 'Profiler.disable');
      
      this.logger.info('Performance profiling stopped', { sessionId });
      return result.profile;
    } catch (error) {
      this.logger.error('Failed to stop performance profiling', { sessionId, error });
      throw error;
    }
  }

  /**
   * Send command to Chrome DevTools
   */
  private async sendCommand(sessionId: string, method: string, params?: any): Promise<any> {
    const ws = this.websockets.get(sessionId);
    if (!ws) {
      throw new Error(`No WebSocket connection for session ${sessionId}`);
    }

    const id = Date.now();
    const command = { id, method, params };

    return new Promise((resolve, reject) => {
      const timeout = setTimeout(() => {
        reject(new Error(`Command timeout: ${method}`));
      }, this.config.timeout);

      const messageHandler = (data: Buffer) => {
        const response = JSON.parse(data.toString());
        if (response.id === id) {
          clearTimeout(timeout);
          ws.off('message', messageHandler);
          
          if (response.error) {
            reject(new Error(`Command error: ${response.error.message}`));
          } else {
            resolve(response.result);
          }
        }
      };

      ws.on('message', messageHandler);
      ws.send(JSON.stringify(command));
    });
  }

  /**
   * Handle incoming messages from Chrome DevTools
   */
  private handleMessage(sessionId: string, message: any): void {
    if (message.method) {
      this.emit('debugEvent', {
        sessionId,
        method: message.method,
        params: message.params
      });

      // Handle specific events
      switch (message.method) {
        case 'Debugger.paused':
          this.emit('breakpointHit', {
            sessionId,
            callFrames: message.params.callFrames,
            reason: message.params.reason
          });
          break;
        
        case 'Runtime.consoleAPICalled':
          this.emit('consoleMessage', {
            sessionId,
            type: message.params.type,
            args: message.params.args,
            timestamp: message.params.timestamp
          });
          break;
      }
    }
  }

  /**
   * Get all active sessions
   */
  getSessions(): BrowserDebugSession[] {
    return Array.from(this.sessions.values());
  }

  /**
   * Close specific session
   */
  async closeSession(sessionId: string): Promise<void> {
    const ws = this.websockets.get(sessionId);
    if (ws) {
      ws.close();
    }
    this.sessions.delete(sessionId);
    this.websockets.delete(sessionId);
  }

  /**
   * Close all sessions
   */
  async closeAllSessions(): Promise<void> {
    for (const sessionId of this.sessions.keys()) {
      await this.closeSession(sessionId);
    }
  }
}
