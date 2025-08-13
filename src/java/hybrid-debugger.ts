import { EventEmitter } from 'events';
import { watch, FSWatcher } from 'chokidar';
import { readFileSync, existsSync } from 'fs';
import { join } from 'path';
import axios from 'axios';
import type { AxiosInstance } from 'axios';

/**
 * Hybrid Debugging Engine
 * Provides alternative debugging methods when traditional debugging fails
 */

export interface HybridDebugConfig {
  workspaceRoot: string;
  applicationUrl?: string;
  logFiles: string[];
  apiEndpoints: string[];
  enableLogWatching: boolean;
  enableApiTesting: boolean;
  enableBreakpointSimulation: boolean;
}

export interface LogEvent {
  timestamp: string;
  level: string;
  message: string;
  className?: string;
  methodName?: string | undefined;
  lineNumber?: number | undefined;
  stackTrace?: string[];
}

export interface ApiTestResult {
  endpoint: string;
  method: string;
  status: number;
  responseTime: number;
  success: boolean;
  data?: any;
  error?: string;
}

export interface BreakpointSimulation {
  className: string;
  methodName: string;
  lineNumber?: number;
  condition?: string;
  logLevel: 'INFO' | 'DEBUG' | 'WARN' | 'ERROR';
}

/**
 * Hybrid Debugging Engine Class
 */
export class HybridDebugger extends EventEmitter {
  private config: HybridDebugConfig;
  private logWatchers: Map<string, FSWatcher> = new Map();
  private apiClient: AxiosInstance;
  private isActive = false;
  private breakpointSimulations: Map<string, BreakpointSimulation> = new Map();

  constructor(config: HybridDebugConfig) {
    super();
    this.config = config;
    
    // Initialize API client
    this.apiClient = axios.create({
      baseURL: config.applicationUrl || 'http://localhost:8080',
      timeout: 10000,
      headers: {
        'Content-Type': 'application/json'
      }
    });
  }

  /**
   * Starts hybrid debugging
   */
  async start(): Promise<void> {
    if (this.isActive) {
      throw new Error('Hybrid debugger is already active');
    }

    this.isActive = true;
    this.emit('started');

    try {
      if (this.config.enableLogWatching) {
        await this.startLogWatching();
      }

      if (this.config.enableApiTesting) {
        await this.startApiTesting();
      }

      if (this.config.enableBreakpointSimulation) {
        await this.setupBreakpointSimulation();
      }

      this.emit('ready');
    } catch (error) {
      this.isActive = false;
      this.emit('error', error);
      throw error;
    }
  }

  /**
   * Stops hybrid debugging
   */
  async stop(): Promise<void> {
    if (!this.isActive) {
      return;
    }

    this.isActive = false;

    // Stop log watchers
    for (const [, watcher] of this.logWatchers) {
      await watcher.close();
    }
    this.logWatchers.clear();

    this.emit('stopped');
  }

  /**
   * Starts watching log files for real-time analysis
   */
  private async startLogWatching(): Promise<void> {
    for (const logFile of this.config.logFiles) {
      const fullPath = join(this.config.workspaceRoot, logFile);
      
      if (!existsSync(fullPath)) {
        console.warn(`Log file not found: ${fullPath}`);
        continue;
      }

      const watcher = watch(fullPath, {
        persistent: true,
        usePolling: false,
        ignoreInitial: false
      });

      watcher.on('change', () => {
        this.processLogFile(fullPath);
      });

      watcher.on('add', () => {
        this.processLogFile(fullPath);
      });

      this.logWatchers.set(logFile, watcher);
      this.emit('log-watcher-started', { file: logFile });
    }
  }

  /**
   * Processes log file changes
   */
  private processLogFile(filePath: string): void {
    try {
      const content = readFileSync(filePath, 'utf-8');
      const lines = content.split('\n');
      
      // Process only the last few lines (new entries)
      const recentLines = lines.slice(-10);
      
      for (const line of recentLines) {
        if (line.trim()) {
          const logEvent = this.parseLogLine(line);
          if (logEvent) {
            this.emit('log-event', logEvent);
            this.checkBreakpointSimulations(logEvent);
          }
        }
      }
    } catch (error) {
      this.emit('log-error', { file: filePath, error });
    }
  }

  /**
   * Parses a log line into structured data
   */
  private parseLogLine(line: string): LogEvent | null {
    try {
      // Spring Boot log pattern: timestamp LEVEL [thread] className : message
      const springBootPattern = /^(\d{4}-\d{2}-\d{2}\s+\d{2}:\d{2}:\d{2}\.\d{3})\s+(\w+)\s+\[([^\]]+)\]\s+([^:]+)\s*:\s*(.+)$/;
      const match = line.match(springBootPattern);
      
      if (match) {
        const [, timestamp, level, , className, message] = match;

        if (timestamp && level && className && message) {
          // Extract method name and line number if available
          const methodMatch = message.match(/(\w+)\(\) - (.+)/);
          const lineMatch = message.match(/line (\d+)/);

          return {
            timestamp,
            level,
            message: methodMatch && methodMatch[2] ? methodMatch[2] : message,
            className: className.trim(),
            methodName: methodMatch ? methodMatch[1] : undefined,
            lineNumber: lineMatch && lineMatch[1] ? parseInt(lineMatch[1]) : undefined
          };
        }
      }
      
      // Fallback: simple timestamp and message
      const simplePattern = /^(\d{4}-\d{2}-\d{2}\s+\d{2}:\d{2}:\d{2})\s+(.+)$/;
      const simpleMatch = line.match(simplePattern);

      if (simpleMatch && simpleMatch[1] && simpleMatch[2]) {
        return {
          timestamp: simpleMatch[1],
          level: 'INFO',
          message: simpleMatch[2]
        };
      }
      
      return null;
    } catch (error) {
      return null;
    }
  }

  /**
   * Starts API testing for endpoints
   */
  private async startApiTesting(): Promise<void> {
    this.emit('api-testing-started');
    
    // Test each endpoint periodically
    setInterval(async () => {
      if (this.isActive) {
        await this.testAllEndpoints();
      }
    }, 30000); // Test every 30 seconds
  }

  /**
   * Tests all configured API endpoints
   */
  private async testAllEndpoints(): Promise<void> {
    const results: ApiTestResult[] = [];
    
    for (const endpoint of this.config.apiEndpoints) {
      try {
        const result = await this.testEndpoint(endpoint);
        results.push(result);
        this.emit('api-test-result', result);
      } catch (error) {
        const errorResult: ApiTestResult = {
          endpoint,
          method: 'GET',
          status: 0,
          responseTime: 0,
          success: false,
          error: error instanceof Error ? error.message : String(error)
        };
        results.push(errorResult);
        this.emit('api-test-result', errorResult);
      }
    }
    
    this.emit('api-test-batch', results);
  }

  /**
   * Tests a single API endpoint
   */
  private async testEndpoint(endpoint: string): Promise<ApiTestResult> {
    const startTime = Date.now();
    
    try {
      const response = await this.apiClient.get(endpoint);
      const responseTime = Date.now() - startTime;
      
      return {
        endpoint,
        method: 'GET',
        status: response.status,
        responseTime,
        success: response.status >= 200 && response.status < 300,
        data: response.data
      };
    } catch (error) {
      const responseTime = Date.now() - startTime;
      
      if (axios.isAxiosError(error)) {
        return {
          endpoint,
          method: 'GET',
          status: error.response?.status || 0,
          responseTime,
          success: false,
          error: error.message
        };
      }
      
      throw error;
    }
  }

  /**
   * Sets up breakpoint simulation
   */
  private async setupBreakpointSimulation(): Promise<void> {
    this.emit('breakpoint-simulation-started');
    
    // Default breakpoint simulations for common Spring Boot patterns
    this.addBreakpointSimulation({
      className: 'com.cocha.flight.service.*',
      methodName: 'dictionaryManager',
      logLevel: 'DEBUG'
    });
    
    this.addBreakpointSimulation({
      className: 'com.cocha.flight.controller.*',
      methodName: '*',
      logLevel: 'INFO'
    });
  }

  /**
   * Adds a breakpoint simulation
   */
  addBreakpointSimulation(simulation: BreakpointSimulation): void {
    const key = `${simulation.className}.${simulation.methodName}`;
    this.breakpointSimulations.set(key, simulation);
    this.emit('breakpoint-added', simulation);
  }

  /**
   * Removes a breakpoint simulation
   */
  removeBreakpointSimulation(className: string, methodName: string): void {
    const key = `${className}.${methodName}`;
    this.breakpointSimulations.delete(key);
    this.emit('breakpoint-removed', { className, methodName });
  }

  /**
   * Checks if log event matches any breakpoint simulations
   */
  private checkBreakpointSimulations(logEvent: LogEvent): void {
    for (const [, simulation] of this.breakpointSimulations) {
      if (this.matchesBreakpoint(logEvent, simulation)) {
        this.emit('breakpoint-hit', {
          simulation,
          logEvent,
          context: this.gatherContext(logEvent)
        });
      }
    }
  }

  /**
   * Checks if log event matches breakpoint simulation
   */
  private matchesBreakpoint(logEvent: LogEvent, simulation: BreakpointSimulation): boolean {
    // Check class name (support wildcards)
    if (simulation.className !== '*') {
      const classPattern = simulation.className.replace(/\*/g, '.*');
      const classRegex = new RegExp(classPattern);
      if (!logEvent.className || !classRegex.test(logEvent.className)) {
        return false;
      }
    }
    
    // Check method name (support wildcards)
    if (simulation.methodName !== '*') {
      const methodPattern = simulation.methodName.replace(/\*/g, '.*');
      const methodRegex = new RegExp(methodPattern);
      if (!logEvent.methodName || !methodRegex.test(logEvent.methodName)) {
        return false;
      }
    }
    
    // Check line number if specified
    if (simulation.lineNumber && logEvent.lineNumber) {
      if (simulation.lineNumber !== logEvent.lineNumber) {
        return false;
      }
    }
    
    return true;
  }

  /**
   * Gathers context information for breakpoint hit
   */
  private gatherContext(logEvent: LogEvent): any {
    return {
      timestamp: logEvent.timestamp,
      thread: 'main', // Could be extracted from logs
      stackTrace: logEvent.stackTrace || [],
      variables: {}, // Could be extracted from log messages
      applicationState: 'running'
    };
  }

  /**
   * Executes a custom API test
   */
  async executeApiTest(endpoint: string, method = 'GET', data?: any): Promise<ApiTestResult> {
    const startTime = Date.now();
    
    try {
      let response;
      switch (method.toUpperCase()) {
        case 'GET':
          response = await this.apiClient.get(endpoint);
          break;
        case 'POST':
          response = await this.apiClient.post(endpoint, data);
          break;
        case 'PUT':
          response = await this.apiClient.put(endpoint, data);
          break;
        case 'DELETE':
          response = await this.apiClient.delete(endpoint);
          break;
        default:
          throw new Error(`Unsupported HTTP method: ${method}`);
      }
      
      const responseTime = Date.now() - startTime;
      
      return {
        endpoint,
        method,
        status: response.status,
        responseTime,
        success: response.status >= 200 && response.status < 300,
        data: response.data
      };
    } catch (error) {
      const responseTime = Date.now() - startTime;
      
      if (axios.isAxiosError(error)) {
        return {
          endpoint,
          method,
          status: error.response?.status || 0,
          responseTime,
          success: false,
          error: error.message,
          data: error.response?.data
        };
      }
      
      throw error;
    }
  }

  /**
   * Gets current debugging state
   */
  getState(): any {
    return {
      isActive: this.isActive,
      logWatchers: Array.from(this.logWatchers.keys()),
      breakpointSimulations: Array.from(this.breakpointSimulations.values()),
      config: this.config
    };
  }
}
