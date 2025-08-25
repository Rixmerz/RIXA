import { describe, it, expect, beforeEach, vi } from 'vitest';
import { JavaDebugger } from '../java/java-debugger.js';
import { LanguageDispatcher } from '../core/language-dispatcher.js';
import { Logger } from '../core/logger.js';

// Mock the Java dependencies
vi.mock('../java/jdwp-validator.js', () => ({
  JDWPValidator: vi.fn().mockImplementation(() => ({
    validateConnection: vi.fn().mockResolvedValue({
      connected: true,
      handshakeSuccessful: true,
      vmVersion: '11.0.0',
      vmName: 'OpenJDK 64-Bit Server VM'
    })
  }))
}));

vi.mock('../java/connection-manager.js', () => ({
  ConnectionManager: vi.fn().mockImplementation(() => ({
    createConnection: vi.fn().mockResolvedValue({
      success: true,
      session: {
        id: 'java-test-session',
        type: 'jdwp',
        status: 'connected'
      }
    }),
    on: vi.fn()
  }))
}));

vi.mock('../java/hybrid-debugger.js', () => ({
  HybridDebugger: vi.fn().mockImplementation(() => ({
    start: vi.fn().mockResolvedValue(undefined),
    stop: vi.fn().mockResolvedValue(undefined),
    addBreakpointSimulation: vi.fn(),
    on: vi.fn()
  }))
}));

vi.mock('../java/enhanced-detection.js', () => ({
  analyzeJavaProject: vi.fn().mockResolvedValue({
    mainClass: 'com.example.Main',
    sourcePaths: ['src/main/java'],
    classPaths: ['target/classes'],
    logFiles: ['logs/application.log']
  })
}));

describe('Java Debugging', () => {
  let javaDebugger: JavaDebugger;
  let languageDispatcher: LanguageDispatcher;

  beforeEach(() => {
    const logger = new Logger('test');
    languageDispatcher = new LanguageDispatcher(logger);
  });

  describe('JavaDebugger', () => {
    beforeEach(() => {
      javaDebugger = new JavaDebugger({
        host: 'localhost',
        port: 5005,
        projectPath: '/test/project'
      });
    });

    it('should create JavaDebugger instance', () => {
      expect(javaDebugger).toBeDefined();
      expect(javaDebugger.isConnectedToJava()).toBe(false);
    });

    it('should connect to Java application', async () => {
      const result = await javaDebugger.connect();
      
      expect(result.success).toBe(true);
      expect(result.sessionId).toBeDefined();
      expect(javaDebugger.isConnectedToJava()).toBe(true);
    });

    it('should set Java breakpoint', async () => {
      await javaDebugger.connect();
      
      const breakpoint = await javaDebugger.setBreakpoint('com.example.Main', 15, 'x > 10');
      
      expect(breakpoint).toBeDefined();
      expect(breakpoint.className).toBe('com.example.Main');
      expect(breakpoint.lineNumber).toBe(15);
      expect(breakpoint.condition).toBe('x > 10');
      expect(breakpoint.verified).toBe(true);
    });

    it('should get Java threads', async () => {
      await javaDebugger.connect();
      
      const threads = await javaDebugger.getThreads();
      
      expect(threads).toBeDefined();
      expect(Array.isArray(threads)).toBe(true);
      expect(threads.length).toBeGreaterThan(0);
      expect(threads[0].name).toBe('main');
    });

    it('should get Java stack trace', async () => {
      await javaDebugger.connect();
      
      const stackFrames = await javaDebugger.getStackTrace(1);
      
      expect(stackFrames).toBeDefined();
      expect(Array.isArray(stackFrames)).toBe(true);
      expect(stackFrames.length).toBeGreaterThan(0);
      expect(stackFrames[0].className).toBe('com.example.Main');
      expect(stackFrames[0].methodName).toBe('main');
    });

    it('should evaluate Java expression', async () => {
      await javaDebugger.connect();
      
      const result = await javaDebugger.evaluateExpression('System.currentTimeMillis()');
      
      expect(result).toBeDefined();
      expect(result.result).toContain('Evaluated: System.currentTimeMillis()');
      expect(result.type).toBe('String');
    });

    it('should handle control flow operations', async () => {
      await javaDebugger.connect();
      
      // Test continue
      await expect(javaDebugger.continue(1)).resolves.not.toThrow();
      
      // Test step operations
      await expect(javaDebugger.stepOver(1)).resolves.not.toThrow();
      await expect(javaDebugger.stepIn(1)).resolves.not.toThrow();
      await expect(javaDebugger.stepOut(1)).resolves.not.toThrow();
      
      // Test pause
      await expect(javaDebugger.pause(1)).resolves.not.toThrow();
    });

    it('should disconnect properly', async () => {
      await javaDebugger.connect();
      expect(javaDebugger.isConnectedToJava()).toBe(true);
      
      await javaDebugger.disconnect();
      expect(javaDebugger.isConnectedToJava()).toBe(false);
    });
  });

  describe('Language Dispatcher Java Integration', () => {
    it('should connect to Java via language dispatcher', async () => {
      const result = await languageDispatcher.connect('java', {
        host: 'localhost',
        port: 5005,
        projectPath: '/test/project'
      });

      expect(result.success).toBe(true);
      expect(result.sessionId).toBeDefined();
      expect(result.language).toBe('java');
    });

    it('should execute Java operations via language dispatcher', async () => {
      const connectionResult = await languageDispatcher.connect('java', {
        host: 'localhost',
        port: 5005,
        projectPath: '/test/project'
      });

      const sessionId = connectionResult.sessionId;

      // Test setBreakpoint operation
      const breakpointResult = await languageDispatcher.executeOperation(sessionId, 'setBreakpoint', {
        className: 'com.example.Main',
        lineNumber: 20
      });

      expect(breakpointResult.success).toBe(true);
      expect(breakpointResult.data.breakpoint).toBeDefined();

      // Test getThreads operation
      const threadsResult = await languageDispatcher.executeOperation(sessionId, 'getThreads', {});

      expect(threadsResult.success).toBe(true);
      expect(threadsResult.data.threads).toBeDefined();

      // Test getPerformanceMetrics operation
      const metricsResult = await languageDispatcher.executeOperation(sessionId, 'getPerformanceMetrics', {
        metricsType: 'memory'
      });

      expect(metricsResult.success).toBe(true);
      expect(metricsResult.data.metrics).toBeDefined();
      expect(metricsResult.data.metrics.language).toBe('java');
    });

    it('should handle Java operation errors gracefully', async () => {
      // Test operation without connection
      await expect(
        languageDispatcher.executeOperation('invalid-session', 'setBreakpoint', {
          className: 'com.example.Main',
          lineNumber: 20
        })
      ).rejects.toThrow();
    });
  });

  describe('Java Performance Metrics', () => {
    it('should return comprehensive Java performance metrics', async () => {
      const connectionResult = await languageDispatcher.connect('java', {
        host: 'localhost',
        port: 5005
      });

      const metricsResult = await languageDispatcher.executeOperation(
        connectionResult.sessionId,
        'getPerformanceMetrics',
        { metricsType: 'general' }
      );

      expect(metricsResult.success).toBe(true);
      expect(metricsResult.data.metrics).toBeDefined();
      
      const metrics = metricsResult.data.metrics;
      expect(metrics.language).toBe('java');
      expect(metrics.memory).toBeDefined();
      expect(metrics.memory.heapUsed).toBeGreaterThan(0);
      expect(metrics.memory.heapMax).toBeGreaterThan(0);
      expect(metrics.gc).toBeDefined();
      expect(metrics.threads).toBeDefined();
      expect(metrics.classLoading).toBeDefined();
    });
  });

  describe('Java Profiling', () => {
    it('should start and stop Java profiling', async () => {
      const connectionResult = await languageDispatcher.connect('java', {
        host: 'localhost',
        port: 5005
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
      expect(stopResult.data.profile.hotMethods).toBeDefined();
    });
  });
});
