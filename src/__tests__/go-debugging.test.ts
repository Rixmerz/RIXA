import { describe, it, expect, beforeEach, vi } from 'vitest';
import { GoDebugger } from '../go/go-debugger.js';
import { GinDebugger } from '../go/gin-debugger.js';
import { LanguageDispatcher } from '../core/language-dispatcher.js';
import { Logger } from '../core/logger.js';

// Mock file system operations
vi.mock('fs', () => ({
  existsSync: vi.fn().mockReturnValue(true),
  readFileSync: vi.fn().mockReturnValue('package main\n\nimport "github.com/gin-gonic/gin"\n\nfunc main() {\n  r := gin.Default()\n}')
}));

vi.mock('path', () => ({
  join: vi.fn((...args) => args.join('/'))
}));

describe('Go Debugging', () => {
  let goDebugger: GoDebugger;
  let ginDebugger: GinDebugger;
  let languageDispatcher: LanguageDispatcher;

  beforeEach(() => {
    const logger = new Logger('test');
    languageDispatcher = new LanguageDispatcher(logger);
  });

  describe('GoDebugger', () => {
    beforeEach(() => {
      goDebugger = new GoDebugger({
        host: 'localhost',
        port: 38697,
        projectPath: '/test/project'
      });
    });

    it('should create GoDebugger instance', () => {
      expect(goDebugger).toBeDefined();
      expect(goDebugger.isConnectedToGo()).toBe(false);
    });

    it('should connect to Go application', async () => {
      const result = await goDebugger.connect();
      
      expect(result.success).toBe(true);
      expect(result.sessionId).toBeDefined();
      expect(goDebugger.isConnectedToGo()).toBe(true);
    });

    it('should set Go breakpoint', async () => {
      await goDebugger.connect();
      
      const breakpoint = await goDebugger.setBreakpoint('main.go', 15, 'x > 10');
      
      expect(breakpoint).toBeDefined();
      expect(breakpoint.file).toBe('main.go');
      expect(breakpoint.line).toBe(15);
      expect(breakpoint.condition).toBe('x > 10');
      expect(breakpoint.verified).toBe(true);
    });

    it('should set Go function breakpoint', async () => {
      await goDebugger.connect();
      
      const breakpoint = await goDebugger.setFunctionBreakpoint('main.main', 'true');
      
      expect(breakpoint).toBeDefined();
      expect(breakpoint.function).toBe('main.main');
      expect(breakpoint.condition).toBe('true');
      expect(breakpoint.verified).toBe(true);
    });

    it('should get Go threads', async () => {
      await goDebugger.connect();
      
      const threads = await goDebugger.getThreads();
      
      expect(threads).toBeDefined();
      expect(Array.isArray(threads)).toBe(true);
      expect(threads.length).toBeGreaterThan(0);
      expect(threads[0].name).toBe('main');
    });

    it('should get Go goroutines', async () => {
      await goDebugger.connect();
      
      const goroutines = await goDebugger.getGoroutines();
      
      expect(goroutines).toBeDefined();
      expect(Array.isArray(goroutines)).toBe(true);
      expect(goroutines.length).toBeGreaterThan(0);
      expect(goroutines[0].id).toBe(1);
    });

    it('should get Go stack trace', async () => {
      await goDebugger.connect();
      
      const stackFrames = await goDebugger.getStackTrace(1);
      
      expect(stackFrames).toBeDefined();
      expect(Array.isArray(stackFrames)).toBe(true);
      expect(stackFrames.length).toBeGreaterThan(0);
      expect(stackFrames[0].name).toBe('main');
      expect(stackFrames[0].function).toBe('main.main');
    });

    it('should evaluate Go expression', async () => {
      await goDebugger.connect();
      
      const result = await goDebugger.evaluateExpression('len(users)');
      
      expect(result).toBeDefined();
      expect(result.result).toContain('Evaluated: len(users)');
      expect(result.type).toBe('string');
    });

    it('should get Go packages', async () => {
      await goDebugger.connect();
      
      const packages = await goDebugger.getPackages();
      
      expect(packages).toBeDefined();
      expect(Array.isArray(packages)).toBe(true);
      expect(packages.length).toBeGreaterThan(0);
      expect(packages[0].name).toBe('main');
    });

    it('should handle control flow operations', async () => {
      await goDebugger.connect();
      
      // Test continue
      await expect(goDebugger.continue(1)).resolves.not.toThrow();
      
      // Test step operations
      await expect(goDebugger.stepOver(1)).resolves.not.toThrow();
      await expect(goDebugger.stepIn(1)).resolves.not.toThrow();
      await expect(goDebugger.stepOut(1)).resolves.not.toThrow();
      
      // Test pause
      await expect(goDebugger.pause(1)).resolves.not.toThrow();
    });

    it('should disconnect properly', async () => {
      await goDebugger.connect();
      expect(goDebugger.isConnectedToGo()).toBe(true);
      
      await goDebugger.disconnect();
      expect(goDebugger.isConnectedToGo()).toBe(false);
    });
  });

  describe('GinDebugger', () => {
    beforeEach(async () => {
      goDebugger = new GoDebugger({
        host: 'localhost',
        port: 38697,
        projectPath: '/test/gin-project',
        enableGinDebugging: true
      });
      
      await goDebugger.connect();
      ginDebugger = new GinDebugger(goDebugger);
    });

    it('should create GinDebugger instance', () => {
      expect(ginDebugger).toBeDefined();
    });

    it('should start and stop request tracking', async () => {
      await expect(ginDebugger.startRequestTracking('test-session')).resolves.not.toThrow();
      await expect(ginDebugger.stopRequestTracking()).resolves.not.toThrow();
    });

    it('should get Gin routes', async () => {
      const routes = await ginDebugger.getRoutes();
      
      expect(routes).toBeDefined();
      expect(Array.isArray(routes)).toBe(true);
      expect(routes.length).toBeGreaterThan(0);
      expect(routes[0].method).toBeDefined();
      expect(routes[0].path).toBeDefined();
      expect(routes[0].handler).toBeDefined();
    });

    it('should get Gin middleware', async () => {
      const middleware = await ginDebugger.getMiddleware();
      
      expect(middleware).toBeDefined();
      expect(Array.isArray(middleware)).toBe(true);
      expect(middleware.length).toBeGreaterThan(0);
      expect(middleware[0].name).toBeDefined();
      expect(middleware[0].function).toBeDefined();
    });

    it('should analyze Gin performance', async () => {
      const performance = await ginDebugger.analyzePerformance();
      
      expect(performance).toBeDefined();
      expect(performance.totalRequests).toBeDefined();
      expect(performance.averageResponseTime).toBeDefined();
      expect(performance.requestsPerSecond).toBeDefined();
      expect(Array.isArray(performance.slowestRoutes)).toBe(true);
      expect(Array.isArray(performance.middlewarePerformance)).toBe(true);
    });

    it('should get Gin context for request', async () => {
      // Start tracking to generate some requests
      await ginDebugger.startRequestTracking('test-session');
      
      // Wait a bit for simulated requests
      await new Promise(resolve => setTimeout(resolve, 100));
      
      const requests = await ginDebugger.getRequests(1);
      if (requests.length > 0) {
        const context = await ginDebugger.getContext(requests[0].id);
        
        expect(context).toBeDefined();
        expect(context?.request).toBeDefined();
        expect(context?.response).toBeDefined();
        expect(context?.keys).toBeDefined();
      }
    });
  });

  describe('Language Dispatcher Go Integration', () => {
    it('should connect to Go via language dispatcher', async () => {
      const result = await languageDispatcher.connect('go', {
        host: 'localhost',
        port: 38697,
        projectPath: '/test/project'
      });

      expect(result.success).toBe(true);
      expect(result.sessionId).toBeDefined();
      expect(result.language).toBe('go');
    });

    it('should connect to Gin via language dispatcher', async () => {
      const result = await languageDispatcher.connect('go', {
        host: 'localhost',
        port: 38697,
        projectPath: '/test/gin-project',
        enableGinDebugging: true
      });

      expect(result.success).toBe(true);
      expect(result.sessionId).toBeDefined();
      expect(result.language).toBe('go');
      expect(result.debugger.framework).toBe('gin');
    });

    it('should execute Go operations via language dispatcher', async () => {
      const connectionResult = await languageDispatcher.connect('go', {
        host: 'localhost',
        port: 38697,
        projectPath: '/test/project'
      });

      const sessionId = connectionResult.sessionId;

      // Test setBreakpoint operation
      const breakpointResult = await languageDispatcher.executeOperation(sessionId, 'setBreakpoint', {
        file: 'main.go',
        line: 20
      });

      expect(breakpointResult.success).toBe(true);
      expect(breakpointResult.data.breakpoint).toBeDefined();

      // Test getThreads operation
      const threadsResult = await languageDispatcher.executeOperation(sessionId, 'getThreads', {});

      expect(threadsResult.success).toBe(true);
      expect(threadsResult.data.threads).toBeDefined();

      // Test getGoroutines operation
      const goroutinesResult = await languageDispatcher.executeOperation(sessionId, 'getGoroutines', {});

      expect(goroutinesResult.success).toBe(true);
      expect(goroutinesResult.data.goroutines).toBeDefined();

      // Test getPerformanceMetrics operation
      const metricsResult = await languageDispatcher.executeOperation(sessionId, 'getPerformanceMetrics', {
        metricsType: 'memory'
      });

      expect(metricsResult.success).toBe(true);
      expect(metricsResult.data.metrics).toBeDefined();
      expect(metricsResult.data.metrics.language).toBe('go');
    });

    it('should execute Gin operations via language dispatcher', async () => {
      const connectionResult = await languageDispatcher.connect('go', {
        host: 'localhost',
        port: 38697,
        projectPath: '/test/gin-project',
        enableGinDebugging: true
      });

      const sessionId = connectionResult.sessionId;

      // Test getGinRoutes operation
      const routesResult = await languageDispatcher.executeOperation(sessionId, 'getGinRoutes', {});

      expect(routesResult.success).toBe(true);
      expect(routesResult.data.routes).toBeDefined();

      // Test getGinMiddleware operation
      const middlewareResult = await languageDispatcher.executeOperation(sessionId, 'getGinMiddleware', {});

      expect(middlewareResult.success).toBe(true);
      expect(middlewareResult.data.middleware).toBeDefined();

      // Test analyzeGinPerformance operation
      const performanceResult = await languageDispatcher.executeOperation(sessionId, 'analyzeGinPerformance', {});

      expect(performanceResult.success).toBe(true);
      expect(performanceResult.data.performance).toBeDefined();
    });
  });

  describe('Go Performance Metrics', () => {
    it('should return comprehensive Go performance metrics', async () => {
      const connectionResult = await languageDispatcher.connect('go', {
        host: 'localhost',
        port: 38697
      });

      const metricsResult = await languageDispatcher.executeOperation(
        connectionResult.sessionId,
        'getPerformanceMetrics',
        { metricsType: 'general' }
      );

      expect(metricsResult.success).toBe(true);
      expect(metricsResult.data.metrics).toBeDefined();
      
      const metrics = metricsResult.data.metrics;
      expect(metrics.language).toBe('go');
      expect(metrics.memory).toBeDefined();
      expect(metrics.memory.alloc).toBeGreaterThan(0);
      expect(metrics.goroutines).toBeDefined();
      expect(metrics.gc).toBeDefined();
      expect(metrics.cpu).toBeDefined();
    });
  });

  describe('Go Profiling', () => {
    it('should start and stop Go profiling', async () => {
      const connectionResult = await languageDispatcher.connect('go', {
        host: 'localhost',
        port: 38697
      });

      // Start profiling
      const startResult = await languageDispatcher.executeOperation(
        connectionResult.sessionId,
        'startProfiling',
        { profilingType: 'cpu' }
      );

      expect(startResult.success).toBe(true);
      expect(startResult.data.profilingType).toBe('cpu');

      // Stop profiling
      const stopResult = await languageDispatcher.executeOperation(
        connectionResult.sessionId,
        'stopProfiling',
        { profilingType: 'cpu' }
      );

      expect(stopResult.success).toBe(true);
      expect(stopResult.data.profile).toBeDefined();
      expect(stopResult.data.profile.type).toBe('cpu');
      expect(stopResult.data.profile.hotFunctions).toBeDefined();
    });
  });
});
