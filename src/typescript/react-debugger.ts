/**
 * React Component Debugging Integration
 * 
 * This module provides comprehensive React debugging capabilities
 * including component state inspection, hook debugging, and
 * performance profiling for React applications.
 */

import { EventEmitter } from 'events';
import { BrowserDebugger, type ReactComponentInfo } from './browser-debugger.js';
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

export interface ReactHookInfo {
  type: 'useState' | 'useEffect' | 'useContext' | 'useReducer' | 'useMemo' | 'useCallback' | 'custom';
  name: string;
  value: any;
  deps?: any[];
  subHooks?: ReactHookInfo[];
}

export interface ReactRenderInfo {
  componentName: string;
  renderTime: number;
  propsChanged: boolean;
  stateChanged: boolean;
  contextChanged: boolean;
  reRenderReason: string;
  timestamp: number;
}

export interface ReactPerformanceProfile {
  totalRenderTime: number;
  componentRenders: ReactRenderInfo[];
  slowComponents: Array<{
    name: string;
    averageRenderTime: number;
    renderCount: number;
  }>;
  unnecessaryRenders: Array<{
    name: string;
    reason: string;
    count: number;
  }>;
}

export class ReactDebugger extends EventEmitter {
  private logger: Logger;
  private browserDebugger: BrowserDebugger;
  private performanceData: Map<string, ReactRenderInfo[]>;
  private componentBreakpoints: Map<string, Set<string>>;

  constructor(browserDebugger: BrowserDebugger) {
    super();
    this.logger = new SimpleLogger('ReactDebugger');
    this.browserDebugger = browserDebugger;
    this.performanceData = new Map();
    this.componentBreakpoints = new Map();
  }

  /**
   * Initialize React debugging for a session
   */
  async initializeReactDebugging(sessionId: string): Promise<void> {
    try {
      // Inject React debugging utilities
      await this.browserDebugger.evaluateExpression(sessionId, `
        (function() {
          if (window.__RIXA_REACT_DEBUGGER__) return;
          
          window.__RIXA_REACT_DEBUGGER__ = {
            componentBreakpoints: new Set(),
            renderData: [],
            
            // Hook into React DevTools
            setupDevToolsHook: function() {
              const hook = window.__REACT_DEVTOOLS_GLOBAL_HOOK__;
              if (!hook) return false;
              
              // Override onCommitFiberRoot to track renders
              const originalOnCommitFiberRoot = hook.onCommitFiberRoot;
              hook.onCommitFiberRoot = function(id, root, priorityLevel) {
                window.__RIXA_REACT_DEBUGGER__.trackRender(root);
                return originalOnCommitFiberRoot.call(this, id, root, priorityLevel);
              };
              
              return true;
            },
            
            // Track component renders
            trackRender: function(root) {
              const startTime = performance.now();
              this.walkFiberTree(root.current, startTime);
            },
            
            // Walk React Fiber tree
            walkFiberTree: function(fiber, startTime) {
              if (!fiber) return;
              
              if (fiber.type && typeof fiber.type === 'function') {
                const componentName = fiber.type.name || fiber.type.displayName || 'Anonymous';
                const renderTime = performance.now() - startTime;
                
                this.renderData.push({
                  componentName,
                  renderTime,
                  propsChanged: this.didPropsChange(fiber),
                  stateChanged: this.didStateChange(fiber),
                  contextChanged: this.didContextChange(fiber),
                  timestamp: Date.now()
                });
                
                // Check for component breakpoints
                if (this.componentBreakpoints.has(componentName)) {
                  debugger; // Trigger breakpoint
                }
              }
              
              // Walk children
              let child = fiber.child;
              while (child) {
                this.walkFiberTree(child, startTime);
                child = child.sibling;
              }
            },
            
            // Check if props changed
            didPropsChange: function(fiber) {
              const alternate = fiber.alternate;
              if (!alternate) return true;
              return fiber.memoizedProps !== alternate.memoizedProps;
            },
            
            // Check if state changed
            didStateChange: function(fiber) {
              const alternate = fiber.alternate;
              if (!alternate) return false;
              return fiber.memoizedState !== alternate.memoizedState;
            },
            
            // Check if context changed
            didContextChange: function(fiber) {
              const alternate = fiber.alternate;
              if (!alternate) return false;
              return fiber.dependencies !== alternate.dependencies;
            },
            
            // Get component info
            getComponentInfo: function(componentName) {
              const hook = window.__REACT_DEVTOOLS_GLOBAL_HOOK__;
              if (!hook || !hook.renderers) return null;
              
              // Find component in React tree
              for (const [id, renderer] of hook.renderers) {
                if (renderer.findFiberByHostInstance) {
                  // Search for component
                  const component = this.findComponentByName(renderer, componentName);
                  if (component) {
                    return this.extractDetailedComponentInfo(component);
                  }
                }
              }
              return null;
            },
            
            // Find component by name
            findComponentByName: function(renderer, name) {
              // Implementation would search through React tree
              // This is a simplified version
              return null;
            },
            
            // Extract detailed component information
            extractDetailedComponentInfo: function(fiber) {
              return {
                name: fiber.type?.name || 'Unknown',
                props: fiber.memoizedProps || {},
                state: fiber.memoizedState || {},
                hooks: this.extractHooks(fiber),
                context: this.extractContext(fiber),
                children: this.extractChildren(fiber)
              };
            },
            
            // Extract hooks information
            extractHooks: function(fiber) {
              const hooks = [];
              let hook = fiber.memoizedState;
              let hookIndex = 0;
              
              while (hook) {
                const hookInfo = {
                  type: this.getHookType(hook, hookIndex),
                  name: \`hook_\${hookIndex}\`,
                  value: hook.memoizedState
                };
                
                if (hook.deps) {
                  hookInfo.deps = hook.deps;
                }
                
                hooks.push(hookInfo);
                hook = hook.next;
                hookIndex++;
              }
              
              return hooks;
            },
            
            // Get hook type (simplified)
            getHookType: function(hook, index) {
              // This would need more sophisticated detection
              return 'useState';
            },
            
            // Extract context information
            extractContext: function(fiber) {
              const contexts = {};
              let dependencies = fiber.dependencies;
              
              while (dependencies) {
                if (dependencies.context) {
                  contexts[dependencies.context.displayName || 'Context'] = dependencies.memoizedValue;
                }
                dependencies = dependencies.next;
              }
              
              return contexts;
            },
            
            // Extract children information
            extractChildren: function(fiber) {
              const children = [];
              let child = fiber.child;
              
              while (child) {
                if (child.type && typeof child.type === 'function') {
                  children.push({
                    name: child.type.name || 'Anonymous',
                    key: child.key,
                    props: child.memoizedProps
                  });
                }
                child = child.sibling;
              }
              
              return children;
            }
          };
          
          // Initialize
          window.__RIXA_REACT_DEBUGGER__.setupDevToolsHook();
          return true;
        })()
      `);

      this.logger.info('React debugging initialized', { sessionId });
    } catch (error) {
      this.logger.error('Failed to initialize React debugging', { sessionId, error });
      throw error;
    }
  }

  /**
   * Get React component tree
   */
  async getComponentTree(sessionId: string): Promise<ReactComponentInfo[]> {
    try {
      const components = await this.browserDebugger.evaluateExpression(sessionId, `
        window.__RIXA_REACT_DEBUGGER__.getComponentInfo()
      `);

      return components || [];
    } catch (error) {
      this.logger.error('Failed to get component tree', { sessionId, error });
      throw error;
    }
  }

  /**
   * Set breakpoint on component render
   */
  async setComponentBreakpoint(sessionId: string, componentName: string): Promise<void> {
    try {
      await this.browserDebugger.evaluateExpression(sessionId, `
        window.__RIXA_REACT_DEBUGGER__.componentBreakpoints.add('${componentName}')
      `);

      // Track locally
      if (!this.componentBreakpoints.has(sessionId)) {
        this.componentBreakpoints.set(sessionId, new Set());
      }
      this.componentBreakpoints.get(sessionId)!.add(componentName);

      this.logger.info('Component breakpoint set', { sessionId, componentName });
    } catch (error) {
      this.logger.error('Failed to set component breakpoint', { sessionId, componentName, error });
      throw error;
    }
  }

  /**
   * Remove component breakpoint
   */
  async removeComponentBreakpoint(sessionId: string, componentName: string): Promise<void> {
    try {
      await this.browserDebugger.evaluateExpression(sessionId, `
        window.__RIXA_REACT_DEBUGGER__.componentBreakpoints.delete('${componentName}')
      `);

      // Remove locally
      const breakpoints = this.componentBreakpoints.get(sessionId);
      if (breakpoints) {
        breakpoints.delete(componentName);
      }

      this.logger.info('Component breakpoint removed', { sessionId, componentName });
    } catch (error) {
      this.logger.error('Failed to remove component breakpoint', { sessionId, componentName, error });
      throw error;
    }
  }

  /**
   * Get component state
   */
  async getComponentState(sessionId: string, componentName: string): Promise<any> {
    try {
      const state = await this.browserDebugger.evaluateExpression(sessionId, `
        (function() {
          const info = window.__RIXA_REACT_DEBUGGER__.getComponentInfo('${componentName}');
          return info ? info.state : null;
        })()
      `);

      return state;
    } catch (error) {
      this.logger.error('Failed to get component state', { sessionId, componentName, error });
      throw error;
    }
  }

  /**
   * Get component props
   */
  async getComponentProps(sessionId: string, componentName: string): Promise<any> {
    try {
      const props = await this.browserDebugger.evaluateExpression(sessionId, `
        (function() {
          const info = window.__RIXA_REACT_DEBUGGER__.getComponentInfo('${componentName}');
          return info ? info.props : null;
        })()
      `);

      return props;
    } catch (error) {
      this.logger.error('Failed to get component props', { sessionId, componentName, error });
      throw error;
    }
  }

  /**
   * Get component hooks
   */
  async getComponentHooks(sessionId: string, componentName: string): Promise<ReactHookInfo[]> {
    try {
      const hooks = await this.browserDebugger.evaluateExpression(sessionId, `
        (function() {
          const info = window.__RIXA_REACT_DEBUGGER__.getComponentInfo('${componentName}');
          return info ? info.hooks : [];
        })()
      `);

      return hooks || [];
    } catch (error) {
      this.logger.error('Failed to get component hooks', { sessionId, componentName, error });
      throw error;
    }
  }

  /**
   * Start performance profiling
   */
  async startPerformanceProfiling(sessionId: string): Promise<void> {
    try {
      await this.browserDebugger.evaluateExpression(sessionId, `
        window.__RIXA_REACT_DEBUGGER__.renderData = [];
        window.__RIXA_REACT_PROFILING_START__ = performance.now();
      `);

      this.performanceData.set(sessionId, []);
      this.logger.info('React performance profiling started', { sessionId });
    } catch (error) {
      this.logger.error('Failed to start React performance profiling', { sessionId, error });
      throw error;
    }
  }

  /**
   * Stop performance profiling and get results
   */
  async stopPerformanceProfiling(sessionId: string): Promise<ReactPerformanceProfile> {
    try {
      const renderData = await this.browserDebugger.evaluateExpression(sessionId, `
        window.__RIXA_REACT_DEBUGGER__.renderData
      `);

      const profile = this.analyzePerformanceData(renderData || []);
      this.performanceData.delete(sessionId);

      this.logger.info('React performance profiling stopped', { sessionId, profile });
      return profile;
    } catch (error) {
      this.logger.error('Failed to stop React performance profiling', { sessionId, error });
      throw error;
    }
  }

  /**
   * Analyze performance data
   */
  private analyzePerformanceData(renderData: ReactRenderInfo[]): ReactPerformanceProfile {
    const componentStats = new Map<string, { totalTime: number; count: number; renders: ReactRenderInfo[] }>();
    let totalRenderTime = 0;

    // Aggregate data by component
    for (const render of renderData) {
      totalRenderTime += render.renderTime;
      
      if (!componentStats.has(render.componentName)) {
        componentStats.set(render.componentName, { totalTime: 0, count: 0, renders: [] });
      }
      
      const stats = componentStats.get(render.componentName)!;
      stats.totalTime += render.renderTime;
      stats.count++;
      stats.renders.push(render);
    }

    // Find slow components (average render time > 16ms)
    const slowComponents = Array.from(componentStats.entries())
      .map(([name, stats]) => ({
        name,
        averageRenderTime: stats.totalTime / stats.count,
        renderCount: stats.count
      }))
      .filter(comp => comp.averageRenderTime > 16)
      .sort((a, b) => b.averageRenderTime - a.averageRenderTime);

    // Find unnecessary renders
    const unnecessaryRenders = Array.from(componentStats.entries())
      .map(([name, stats]) => {
        const unnecessaryCount = stats.renders.filter(render => 
          !render.propsChanged && !render.stateChanged && !render.contextChanged
        ).length;
        
        return {
          name,
          reason: 'No props/state/context changes',
          count: unnecessaryCount
        };
      })
      .filter(comp => comp.count > 0)
      .sort((a, b) => b.count - a.count);

    return {
      totalRenderTime,
      componentRenders: renderData,
      slowComponents,
      unnecessaryRenders
    };
  }

  /**
   * Get active component breakpoints
   */
  getComponentBreakpoints(sessionId: string): string[] {
    const breakpoints = this.componentBreakpoints.get(sessionId);
    return breakpoints ? Array.from(breakpoints) : [];
  }

  /**
   * Clear all component breakpoints
   */
  async clearAllComponentBreakpoints(sessionId: string): Promise<void> {
    try {
      await this.browserDebugger.evaluateExpression(sessionId, `
        window.__RIXA_REACT_DEBUGGER__.componentBreakpoints.clear()
      `);

      this.componentBreakpoints.delete(sessionId);
      this.logger.info('All component breakpoints cleared', { sessionId });
    } catch (error) {
      this.logger.error('Failed to clear component breakpoints', { sessionId, error });
      throw error;
    }
  }
}
