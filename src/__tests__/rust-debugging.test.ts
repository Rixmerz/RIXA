import { describe, it, expect, beforeEach, vi } from 'vitest';
import { RustDebugger } from '../rust/rust-debugger.js';
import { ActixDebugger } from '../rust/actix-debugger.js';
import { LanguageDispatcher } from '../core/language-dispatcher.js';
import { Logger } from '../core/logger.js';

// Mock file system operations
vi.mock('fs', () => ({
  existsSync: vi.fn().mockReturnValue(true),
  readFileSync: vi.fn().mockReturnValue('[package]\nname = "my_app"\nversion = "0.1.0"\n\n[dependencies]\nactix-web = "4.0"\ntokio = { version = "1.0", features = ["full"] }')
}));

vi.mock('path', () => ({
  join: vi.fn((...args) => args.join('/'))
}));

describe('Rust Debugging', () => {
  let rustDebugger: RustDebugger;
  let actixDebugger: ActixDebugger;
  let languageDispatcher: LanguageDispatcher;

  beforeEach(() => {
    const logger = new Logger('test');
    languageDispatcher = new LanguageDispatcher(logger);
  });

  describe('RustDebugger', () => {
    beforeEach(() => {
      rustDebugger = new RustDebugger({
        host: 'localhost',
        port: 2345,
        projectPath: '/test/project'
      });
    });

    it('should create RustDebugger instance', () => {
      expect(rustDebugger).toBeDefined();
      expect(rustDebugger.isConnectedToRust()).toBe(false);
    });

    it('should connect to Rust application', async () => {
      const result = await rustDebugger.connect();
      
      expect(result.success).toBe(true);
      expect(result.sessionId).toBeDefined();
      expect(rustDebugger.isConnectedToRust()).toBe(true);
    });

    it('should set Rust breakpoint', async () => {
      await rustDebugger.connect();
      
      const breakpoint = await rustDebugger.setBreakpoint('src/main.rs', 15, 'x > 10');
      
      expect(breakpoint).toBeDefined();
      expect(breakpoint.file).toBe('src/main.rs');
      expect(breakpoint.line).toBe(15);
      expect(breakpoint.condition).toBe('x > 10');
      expect(breakpoint.verified).toBe(true);
    });

    it('should set Rust function breakpoint', async () => {
      await rustDebugger.connect();
      
      const breakpoint = await rustDebugger.setFunctionBreakpoint('main::main', 'true');
      
      expect(breakpoint).toBeDefined();
      expect(breakpoint.function).toBe('main::main');
      expect(breakpoint.condition).toBe('true');
      expect(breakpoint.verified).toBe(true);
    });

    it('should get Rust threads', async () => {
      await rustDebugger.connect();
      
      const threads = await rustDebugger.getThreads();
      
      expect(threads).toBeDefined();
      expect(Array.isArray(threads)).toBe(true);
      expect(threads.length).toBeGreaterThan(0);
      expect(threads[0].name).toBe('main');
    });

    it('should get Rust stack trace', async () => {
      await rustDebugger.connect();
      
      const stackFrames = await rustDebugger.getStackTrace(1);
      
      expect(stackFrames).toBeDefined();
      expect(Array.isArray(stackFrames)).toBe(true);
      expect(stackFrames.length).toBeGreaterThan(0);
      expect(stackFrames[0].name).toBe('main');
      expect(stackFrames[0].function).toBe('main::main');
    });

    it('should evaluate Rust expression', async () => {
      await rustDebugger.connect();
      
      const result = await rustDebugger.evaluateExpression('users.len()');
      
      expect(result).toBeDefined();
      expect(result.result).toContain('Evaluated: users.len()');
      expect(result.type).toBe('String');
    });

    it('should get Rust crates', async () => {
      await rustDebugger.connect();
      
      const crates = await rustDebugger.getCrates();
      
      expect(crates).toBeDefined();
      expect(Array.isArray(crates)).toBe(true);
      expect(crates.length).toBeGreaterThan(0);
      expect(crates[0].name).toBeDefined();
      expect(crates[0].dependencies).toBeDefined();
    });

    it('should handle control flow operations', async () => {
      await rustDebugger.connect();
      
      // Test continue
      await expect(rustDebugger.continue(1)).resolves.not.toThrow();
      
      // Test step operations
      await expect(rustDebugger.stepOver(1)).resolves.not.toThrow();
      await expect(rustDebugger.stepIn(1)).resolves.not.toThrow();
      await expect(rustDebugger.stepOut(1)).resolves.not.toThrow();
      
      // Test pause
      await expect(rustDebugger.pause(1)).resolves.not.toThrow();
    });

    it('should disconnect properly', async () => {
      await rustDebugger.connect();
      expect(rustDebugger.isConnectedToRust()).toBe(true);
      
      await rustDebugger.disconnect();
      expect(rustDebugger.isConnectedToRust()).toBe(false);
    });
  });

  describe('ActixDebugger', () => {
    beforeEach(async () => {
      rustDebugger = new RustDebugger({
        host: 'localhost',
        port: 2345,
        projectPath: '/test/actix-project',
        enableActixDebugging: true
      });
      
      await rustDebugger.connect();
      actixDebugger = new ActixDebugger(rustDebugger);
    });

    it('should create ActixDebugger instance', () => {
      expect(actixDebugger).toBeDefined();
    });

    it('should start and stop request tracking', async () => {
      await expect(actixDebugger.startRequestTracking('test-session')).resolves.not.toThrow();
      await expect(actixDebugger.stopRequestTracking()).resolves.not.toThrow();
    });

    it('should get Actix routes', async () => {
      const routes = await actixDebugger.getRoutes();
      
      expect(routes).toBeDefined();
      expect(Array.isArray(routes)).toBe(true);
      expect(routes.length).toBeGreaterThan(0);
      expect(routes[0].method).toBeDefined();
      expect(routes[0].path).toBeDefined();
      expect(routes[0].handler).toBeDefined();
    });

    it('should get Actix middleware', async () => {
      const middleware = await actixDebugger.getMiddleware();
      
      expect(middleware).toBeDefined();
      expect(Array.isArray(middleware)).toBe(true);
      expect(middleware.length).toBeGreaterThan(0);
      expect(middleware[0].name).toBeDefined();
      expect(middleware[0].function).toBeDefined();
    });

    it('should get Actix handlers', async () => {
      const handlers = await actixDebugger.getHandlers();
      
      expect(handlers).toBeDefined();
      expect(Array.isArray(handlers)).toBe(true);
      expect(handlers.length).toBeGreaterThan(0);
      expect(handlers[0].name).toBeDefined();
      expect(handlers[0].extractors).toBeDefined();
    });

    it('should analyze Actix performance', async () => {
      const performance = await actixDebugger.analyzePerformance();
      
      expect(performance).toBeDefined();
      expect(performance.totalRequests).toBeDefined();
      expect(performance.averageResponseTime).toBeDefined();
      expect(performance.requestsPerSecond).toBeDefined();
      expect(Array.isArray(performance.slowestRoutes)).toBe(true);
      expect(Array.isArray(performance.middlewarePerformance)).toBe(true);
      expect(Array.isArray(performance.extractorPerformance)).toBe(true);
    });

    it('should get Actix app structure', async () => {
      const appStructure = await actixDebugger.getAppStructure();
      
      expect(appStructure).toBeDefined();
      expect(Array.isArray(appStructure)).toBe(true);
      expect(appStructure.length).toBeGreaterThan(0);
      expect(appStructure[0].name).toBeDefined();
      expect(appStructure[0].routes).toBeDefined();
      expect(appStructure[0].services).toBeDefined();
    });
  });

  describe('Language Dispatcher Rust Integration', () => {
    it('should connect to Rust via language dispatcher', async () => {
      const result = await languageDispatcher.connect('rust', {
        host: 'localhost',
        port: 2345,
        projectPath: '/test/project'
      });

      expect(result.success).toBe(true);
      expect(result.sessionId).toBeDefined();
      expect(result.language).toBe('rust');
    });

    it('should connect to Actix via language dispatcher', async () => {
      const result = await languageDispatcher.connect('rust', {
        host: 'localhost',
        port: 2345,
        projectPath: '/test/actix-project',
        enableActixDebugging: true
      });

      expect(result.success).toBe(true);
      expect(result.sessionId).toBeDefined();
      expect(result.language).toBe('rust');
      expect(result.debugger.framework).toBe('actix');
    });

    it('should execute Rust operations via language dispatcher', async () => {
      const connectionResult = await languageDispatcher.connect('rust', {
        host: 'localhost',
        port: 2345,
        projectPath: '/test/project'
      });

      const sessionId = connectionResult.sessionId;

      // Test setBreakpoint operation
      const breakpointResult = await languageDispatcher.executeOperation(sessionId, 'setBreakpoint', {
        file: 'src/main.rs',
        line: 20
      });

      expect(breakpointResult.success).toBe(true);
      expect(breakpointResult.data.breakpoint).toBeDefined();

      // Test getThreads operation
      const threadsResult = await languageDispatcher.executeOperation(sessionId, 'getThreads', {});

      expect(threadsResult.success).toBe(true);
      expect(threadsResult.data.threads).toBeDefined();

      // Test getCrates operation
      const cratesResult = await languageDispatcher.executeOperation(sessionId, 'getCrates', {});

      expect(cratesResult.success).toBe(true);
      expect(cratesResult.data.crates).toBeDefined();

      // Test getPerformanceMetrics operation
      const metricsResult = await languageDispatcher.executeOperation(sessionId, 'getPerformanceMetrics', {
        metricsType: 'memory'
      });

      expect(metricsResult.success).toBe(true);
      expect(metricsResult.data.metrics).toBeDefined();
      expect(metricsResult.data.metrics.language).toBe('rust');
    });

    it('should execute Actix operations via language dispatcher', async () => {
      const connectionResult = await languageDispatcher.connect('rust', {
        host: 'localhost',
        port: 2345,
        projectPath: '/test/actix-project',
        enableActixDebugging: true
      });

      const sessionId = connectionResult.sessionId;

      // Test getActixRoutes operation
      const routesResult = await languageDispatcher.executeOperation(sessionId, 'getActixRoutes', {});

      expect(routesResult.success).toBe(true);
      expect(routesResult.data.routes).toBeDefined();

      // Test getActixMiddleware operation
      const middlewareResult = await languageDispatcher.executeOperation(sessionId, 'getActixMiddleware', {});

      expect(middlewareResult.success).toBe(true);
      expect(middlewareResult.data.middleware).toBeDefined();

      // Test analyzeActixPerformance operation
      const performanceResult = await languageDispatcher.executeOperation(sessionId, 'analyzeActixPerformance', {});

      expect(performanceResult.success).toBe(true);
      expect(performanceResult.data.performance).toBeDefined();
    });
  });

  describe('Rust Performance Metrics', () => {
    it('should return comprehensive Rust performance metrics', async () => {
      const connectionResult = await languageDispatcher.connect('rust', {
        host: 'localhost',
        port: 2345
      });

      const metricsResult = await languageDispatcher.executeOperation(
        connectionResult.sessionId,
        'getPerformanceMetrics',
        { metricsType: 'general' }
      );

      expect(metricsResult.success).toBe(true);
      expect(metricsResult.data.metrics).toBeDefined();
      
      const metrics = metricsResult.data.metrics;
      expect(metrics.language).toBe('rust');
      expect(metrics.memory).toBeDefined();
      expect(metrics.memory.heap).toBeGreaterThan(0);
      expect(metrics.cpu).toBeDefined();
      expect(metrics.threads).toBeDefined();
      expect(metrics.ownership).toBeDefined();
    });
  });

  describe('Rust Profiling', () => {
    it('should start and stop Rust profiling', async () => {
      const connectionResult = await languageDispatcher.connect('rust', {
        host: 'localhost',
        port: 2345
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
