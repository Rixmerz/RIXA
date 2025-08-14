/**
 * Enhanced Async/Await Debugging for TypeScript/JavaScript
 * 
 * This module provides comprehensive async debugging capabilities
 * including promise tracking, async stack traces, and performance analysis.
 */

import { EventEmitter } from 'events';
import { BrowserDebugger } from './browser-debugger.js';
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

export interface AsyncOperation {
  id: string;
  type: 'promise' | 'async-function' | 'timeout' | 'interval' | 'fetch' | 'custom';
  name: string;
  startTime: number;
  endTime?: number;
  duration?: number;
  status: 'pending' | 'resolved' | 'rejected' | 'cancelled';
  result?: any;
  error?: Error;
  stackTrace: string;
  parentId?: string;
  children: string[];
}

export interface AsyncFlowTrace {
  rootOperationId: string;
  operations: AsyncOperation[];
  totalDuration: number;
  longestChain: AsyncOperation[];
  parallelOperations: AsyncOperation[][];
  bottlenecks: Array<{
    operation: AsyncOperation;
    reason: string;
    impact: number;
  }>;
}

export interface AsyncPerformanceMetrics {
  totalAsyncOperations: number;
  averageAsyncDuration: number;
  longestAsyncOperation: AsyncOperation;
  shortestAsyncOperation: AsyncOperation;
  promiseRejectionRate: number;
  memoryLeaks: Array<{
    type: string;
    count: number;
    description: string;
  }>;
  recommendations: string[];
}

export class AsyncDebugger extends EventEmitter {
  private logger: Logger;
  private browserDebugger: BrowserDebugger;

  constructor(browserDebugger: BrowserDebugger) {
    super();
    this.logger = new SimpleLogger('AsyncDebugger');
    this.browserDebugger = browserDebugger;
  }

  /**
   * Initialize async debugging for a session
   */
  async initializeAsyncDebugging(sessionId: string): Promise<void> {
    try {
      // Inject async debugging utilities
      await this.browserDebugger.evaluateExpression(sessionId, `
        (function() {
          if (window.__RIXA_ASYNC_DEBUGGER__) return;
          
          window.__RIXA_ASYNC_DEBUGGER__ = {
            operations: new Map(),
            operationCounter: 0,
            isTracking: false,
            
            // Start async tracking
            startTracking: function() {
              if (this.isTracking) return;
              this.isTracking = true;
              
              this.wrapPromise();
              this.wrapAsyncFunction();
              this.wrapFetch();
              this.wrapTimers();
              this.setupUnhandledRejectionTracking();
            },
            
            // Stop async tracking
            stopTracking: function() {
              this.isTracking = false;
              // Note: We don't unwrap functions to avoid breaking existing code
            },
            
            // Wrap Promise constructor
            wrapPromise: function() {
              const originalPromise = window.Promise;
              const self = this;
              
              window.Promise = function(executor) {
                const operationId = 'promise_' + (++self.operationCounter);
                const startTime = performance.now();
                const stackTrace = new Error().stack || '';
                
                const operation = {
                  id: operationId,
                  type: 'promise',
                  name: 'Promise',
                  startTime,
                  status: 'pending',
                  stackTrace,
                  children: []
                };
                
                self.operations.set(operationId, operation);
                
                const wrappedExecutor = function(resolve, reject) {
                  const wrappedResolve = function(value) {
                    operation.endTime = performance.now();
                    operation.duration = operation.endTime - operation.startTime;
                    operation.status = 'resolved';
                    operation.result = value;
                    resolve(value);
                  };
                  
                  const wrappedReject = function(error) {
                    operation.endTime = performance.now();
                    operation.duration = operation.endTime - operation.startTime;
                    operation.status = 'rejected';
                    operation.error = error;
                    reject(error);
                  };
                  
                  try {
                    executor(wrappedResolve, wrappedReject);
                  } catch (error) {
                    wrappedReject(error);
                  }
                };
                
                return new originalPromise(wrappedExecutor);
              };
              
              // Copy static methods
              Object.setPrototypeOf(window.Promise, originalPromise);
              Object.getOwnPropertyNames(originalPromise).forEach(name => {
                if (name !== 'length' && name !== 'name' && name !== 'prototype') {
                  window.Promise[name] = originalPromise[name];
                }
              });
            },
            
            // Wrap async functions (simplified approach)
            wrapAsyncFunction: function() {
              // This is a simplified implementation
              // In practice, this would require more sophisticated AST manipulation
              const self = this;
              
              // Override Function.prototype.constructor for async functions
              const originalAsyncFunction = (async function() {}).constructor;
              
              // Note: This is a conceptual implementation
              // Real async function wrapping would require build-time instrumentation
            },
            
            // Wrap fetch API
            wrapFetch: function() {
              const originalFetch = window.fetch;
              const self = this;
              
              window.fetch = function(url, options) {
                const operationId = 'fetch_' + (++self.operationCounter);
                const startTime = performance.now();
                const stackTrace = new Error().stack || '';
                
                const operation = {
                  id: operationId,
                  type: 'fetch',
                  name: \`fetch(\${typeof url === 'string' ? url : url.toString()})\`,
                  startTime,
                  status: 'pending',
                  stackTrace,
                  children: []
                };
                
                self.operations.set(operationId, operation);
                
                return originalFetch.apply(this, arguments)
                  .then(response => {
                    operation.endTime = performance.now();
                    operation.duration = operation.endTime - operation.startTime;
                    operation.status = 'resolved';
                    operation.result = {
                      status: response.status,
                      statusText: response.statusText,
                      url: response.url
                    };
                    return response;
                  })
                  .catch(error => {
                    operation.endTime = performance.now();
                    operation.duration = operation.endTime - operation.startTime;
                    operation.status = 'rejected';
                    operation.error = error;
                    throw error;
                  });
              };
            },
            
            // Wrap setTimeout and setInterval
            wrapTimers: function() {
              const originalSetTimeout = window.setTimeout;
              const originalSetInterval = window.setInterval;
              const self = this;
              
              window.setTimeout = function(callback, delay, ...args) {
                const operationId = 'timeout_' + (++self.operationCounter);
                const startTime = performance.now();
                const stackTrace = new Error().stack || '';
                
                const operation = {
                  id: operationId,
                  type: 'timeout',
                  name: \`setTimeout(\${delay}ms)\`,
                  startTime,
                  status: 'pending',
                  stackTrace,
                  children: []
                };
                
                self.operations.set(operationId, operation);
                
                const wrappedCallback = function() {
                  operation.endTime = performance.now();
                  operation.duration = operation.endTime - operation.startTime;
                  operation.status = 'resolved';
                  
                  try {
                    return callback.apply(this, args);
                  } catch (error) {
                    operation.status = 'rejected';
                    operation.error = error;
                    throw error;
                  }
                };
                
                return originalSetTimeout.call(this, wrappedCallback, delay);
              };
              
              window.setInterval = function(callback, delay, ...args) {
                const operationId = 'interval_' + (++self.operationCounter);
                const startTime = performance.now();
                const stackTrace = new Error().stack || '';
                
                const operation = {
                  id: operationId,
                  type: 'interval',
                  name: \`setInterval(\${delay}ms)\`,
                  startTime,
                  status: 'pending',
                  stackTrace,
                  children: []
                };
                
                self.operations.set(operationId, operation);
                
                const wrappedCallback = function() {
                  try {
                    return callback.apply(this, args);
                  } catch (error) {
                    operation.status = 'rejected';
                    operation.error = error;
                    throw error;
                  }
                };
                
                return originalSetInterval.call(this, wrappedCallback, delay);
              };
            },
            
            // Setup unhandled promise rejection tracking
            setupUnhandledRejectionTracking: function() {
              const self = this;
              
              window.addEventListener('unhandledrejection', function(event) {
                const operationId = 'unhandled_' + (++self.operationCounter);
                const operation = {
                  id: operationId,
                  type: 'promise',
                  name: 'Unhandled Promise Rejection',
                  startTime: performance.now(),
                  endTime: performance.now(),
                  duration: 0,
                  status: 'rejected',
                  error: event.reason,
                  stackTrace: event.reason?.stack || new Error().stack || '',
                  children: []
                };
                
                self.operations.set(operationId, operation);
              });
            },
            
            // Get all operations
            getOperations: function() {
              return Array.from(this.operations.values());
            },
            
            // Get operation by ID
            getOperation: function(id) {
              return this.operations.get(id);
            },
            
            // Clear operations
            clearOperations: function() {
              this.operations.clear();
              this.operationCounter = 0;
            },
            
            // Get performance metrics
            getPerformanceMetrics: function() {
              const operations = this.getOperations();
              const completedOps = operations.filter(op => op.endTime);
              
              if (completedOps.length === 0) {
                return {
                  totalAsyncOperations: 0,
                  averageAsyncDuration: 0,
                  longestAsyncOperation: null,
                  shortestAsyncOperation: null,
                  promiseRejectionRate: 0,
                  memoryLeaks: [],
                  recommendations: []
                };
              }
              
              const durations = completedOps.map(op => op.duration || 0);
              const averageDuration = durations.reduce((sum, d) => sum + d, 0) / durations.length;
              const longestOp = completedOps.reduce((longest, current) => 
                (current.duration || 0) > (longest.duration || 0) ? current : longest);
              const shortestOp = completedOps.reduce((shortest, current) => 
                (current.duration || 0) < (shortest.duration || 0) ? current : shortest);
              
              const rejectedOps = operations.filter(op => op.status === 'rejected');
              const rejectionRate = rejectedOps.length / operations.length;
              
              return {
                totalAsyncOperations: operations.length,
                averageAsyncDuration: averageDuration,
                longestAsyncOperation: longestOp,
                shortestAsyncOperation: shortestOp,
                promiseRejectionRate: rejectionRate,
                memoryLeaks: this.detectMemoryLeaks(),
                recommendations: this.generateRecommendations(operations)
              };
            },
            
            // Detect potential memory leaks
            detectMemoryLeaks: function() {
              const operations = this.getOperations();
              const leaks = [];
              
              // Check for pending operations that are too old
              const now = performance.now();
              const oldPendingOps = operations.filter(op => 
                op.status === 'pending' && (now - op.startTime) > 30000 // 30 seconds
              );
              
              if (oldPendingOps.length > 0) {
                leaks.push({
                  type: 'long-pending-operations',
                  count: oldPendingOps.length,
                  description: 'Operations pending for more than 30 seconds'
                });
              }
              
              // Check for too many intervals
              const intervals = operations.filter(op => op.type === 'interval');
              if (intervals.length > 10) {
                leaks.push({
                  type: 'excessive-intervals',
                  count: intervals.length,
                  description: 'Large number of active intervals'
                });
              }
              
              return leaks;
            },
            
            // Generate performance recommendations
            generateRecommendations: function(operations) {
              const recommendations = [];
              
              const slowOps = operations.filter(op => (op.duration || 0) > 1000);
              if (slowOps.length > 0) {
                recommendations.push('Consider optimizing slow async operations (>1s)');
              }
              
              const rejectedOps = operations.filter(op => op.status === 'rejected');
              if (rejectedOps.length > operations.length * 0.1) {
                recommendations.push('High promise rejection rate - add better error handling');
              }
              
              const fetchOps = operations.filter(op => op.type === 'fetch');
              if (fetchOps.length > 20) {
                recommendations.push('Consider batching or caching HTTP requests');
              }
              
              return recommendations;
            }
          };
          
          return true;
        })()
      `);

      this.logger.info('Async debugging initialized', { sessionId });
    } catch (error) {
      this.logger.error('Failed to initialize async debugging', { sessionId, error });
      throw error;
    }
  }

  /**
   * Start async operation tracking
   */
  async startAsyncTracking(sessionId: string): Promise<void> {
    try {
      await this.browserDebugger.evaluateExpression(sessionId, `
        window.__RIXA_ASYNC_DEBUGGER__.startTracking()
      `);

      this.logger.info('Async tracking started', { sessionId });
    } catch (error) {
      this.logger.error('Failed to start async tracking', { sessionId, error });
      throw error;
    }
  }

  /**
   * Stop async operation tracking
   */
  async stopAsyncTracking(sessionId: string): Promise<void> {
    try {
      await this.browserDebugger.evaluateExpression(sessionId, `
        window.__RIXA_ASYNC_DEBUGGER__.stopTracking()
      `);

      this.logger.info('Async tracking stopped', { sessionId });
    } catch (error) {
      this.logger.error('Failed to stop async tracking', { sessionId, error });
      throw error;
    }
  }

  /**
   * Get all async operations
   */
  async getAsyncOperations(sessionId: string): Promise<AsyncOperation[]> {
    try {
      const operations = await this.browserDebugger.evaluateExpression(sessionId, `
        window.__RIXA_ASYNC_DEBUGGER__.getOperations()
      `);

      return operations || [];
    } catch (error) {
      this.logger.error('Failed to get async operations', { sessionId, error });
      throw error;
    }
  }

  /**
   * Get async performance metrics
   */
  async getAsyncPerformanceMetrics(sessionId: string): Promise<AsyncPerformanceMetrics> {
    try {
      const metrics = await this.browserDebugger.evaluateExpression(sessionId, `
        window.__RIXA_ASYNC_DEBUGGER__.getPerformanceMetrics()
      `);

      return metrics || {
        totalAsyncOperations: 0,
        averageAsyncDuration: 0,
        longestAsyncOperation: null as any,
        shortestAsyncOperation: null as any,
        promiseRejectionRate: 0,
        memoryLeaks: [],
        recommendations: []
      };
    } catch (error) {
      this.logger.error('Failed to get async performance metrics', { sessionId, error });
      throw error;
    }
  }

  /**
   * Trace async flow
   */
  async traceAsyncFlow(sessionId: string, rootOperationId?: string): Promise<AsyncFlowTrace> {
    try {
      const operations = await this.getAsyncOperations(sessionId);
      
      if (operations.length === 0) {
        return {
          rootOperationId: '',
          operations: [],
          totalDuration: 0,
          longestChain: [],
          parallelOperations: [],
          bottlenecks: []
        };
      }

      // If no root specified, use the first operation
      const rootId = rootOperationId || operations[0]?.id;

      if (!rootId) {
        throw new Error('No root operation ID provided and no operations available');
      }

      const rootOp = operations.find(op => op.id === rootId);

      if (!rootOp) {
        throw new Error(`Root operation ${rootId} not found`);
      }

      // Build operation tree and analyze flow
      const flowTrace = this.analyzeAsyncFlow(operations, rootId);
      
      return flowTrace;
    } catch (error) {
      this.logger.error('Failed to trace async flow', { sessionId, rootOperationId, error });
      throw error;
    }
  }

  /**
   * Clear async operations
   */
  async clearAsyncOperations(sessionId: string): Promise<void> {
    try {
      await this.browserDebugger.evaluateExpression(sessionId, `
        window.__RIXA_ASYNC_DEBUGGER__.clearOperations()
      `);

      this.logger.info('Async operations cleared', { sessionId });
    } catch (error) {
      this.logger.error('Failed to clear async operations', { sessionId, error });
      throw error;
    }
  }

  /**
   * Analyze async flow
   */
  private analyzeAsyncFlow(operations: AsyncOperation[], rootId: string): AsyncFlowTrace {
    const rootOp = operations.find(op => op.id === rootId)!;
    const totalDuration = Math.max(...operations.map(op => (op.endTime || op.startTime) - rootOp.startTime));
    
    // Find longest chain
    const longestChain = this.findLongestChain(operations, rootId);
    
    // Find parallel operations
    const parallelOperations = this.findParallelOperations(operations);
    
    // Find bottlenecks
    const bottlenecks = this.findBottlenecks(operations);
    
    return {
      rootOperationId: rootId,
      operations,
      totalDuration,
      longestChain,
      parallelOperations,
      bottlenecks
    };
  }

  /**
   * Find longest chain of operations
   */
  private findLongestChain(operations: AsyncOperation[], rootId: string): AsyncOperation[] {
    // Simplified implementation - would need more sophisticated graph traversal
    return operations.filter(op => op.parentId === rootId || op.id === rootId);
  }

  /**
   * Find parallel operations
   */
  private findParallelOperations(operations: AsyncOperation[]): AsyncOperation[][] {
    // Group operations that run in parallel (overlapping time ranges)
    const parallel: AsyncOperation[][] = [];
    const processed = new Set<string>();
    
    for (const op of operations) {
      if (processed.has(op.id)) continue;
      
      const parallelGroup = operations.filter(other => 
        other.id !== op.id && 
        !processed.has(other.id) &&
        this.operationsOverlap(op, other)
      );
      
      if (parallelGroup.length > 0) {
        parallelGroup.unshift(op);
        parallel.push(parallelGroup);
        parallelGroup.forEach(p => processed.add(p.id));
      }
    }
    
    return parallel;
  }

  /**
   * Check if two operations overlap in time
   */
  private operationsOverlap(op1: AsyncOperation, op2: AsyncOperation): boolean {
    const op1End = op1.endTime || op1.startTime + 1000; // Assume 1s if not ended
    const op2End = op2.endTime || op2.startTime + 1000;
    
    return op1.startTime < op2End && op2.startTime < op1End;
  }

  /**
   * Find performance bottlenecks
   */
  private findBottlenecks(operations: AsyncOperation[]): Array<{ operation: AsyncOperation; reason: string; impact: number }> {
    const bottlenecks = [];
    
    // Find slow operations
    const avgDuration = operations.reduce((sum, op) => sum + (op.duration || 0), 0) / operations.length;
    const slowOps = operations.filter(op => (op.duration || 0) > avgDuration * 2);
    
    for (const op of slowOps) {
      bottlenecks.push({
        operation: op,
        reason: 'Significantly slower than average',
        impact: (op.duration || 0) / avgDuration
      });
    }
    
    // Find rejected operations
    const rejectedOps = operations.filter(op => op.status === 'rejected');
    for (const op of rejectedOps) {
      bottlenecks.push({
        operation: op,
        reason: 'Promise rejection',
        impact: 1
      });
    }
    
    return bottlenecks.sort((a, b) => b.impact - a.impact);
  }
}
