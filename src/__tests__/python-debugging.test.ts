import { describe, it, expect, beforeEach, vi } from 'vitest';
import { PythonDebugger } from '../python/python-debugger.js';
import { DjangoDebugger } from '../python/django-debugger.js';
import { LanguageDispatcher } from '../core/language-dispatcher.js';
import { Logger } from '../core/logger.js';

// Mock file system operations
vi.mock('fs', () => ({
  existsSync: vi.fn().mockReturnValue(true),
  readFileSync: vi.fn().mockReturnValue('from django import *\nDEBUG = True')
}));

vi.mock('path', () => ({
  join: vi.fn((...args) => args.join('/'))
}));

describe('Python Debugging', () => {
  let pythonDebugger: PythonDebugger;
  let djangoDebugger: DjangoDebugger;
  let languageDispatcher: LanguageDispatcher;

  beforeEach(() => {
    const logger = new Logger('test');
    languageDispatcher = new LanguageDispatcher(logger);
  });

  describe('PythonDebugger', () => {
    beforeEach(() => {
      pythonDebugger = new PythonDebugger({
        host: 'localhost',
        port: 5678,
        projectPath: '/test/project'
      });
    });

    it('should create PythonDebugger instance', () => {
      expect(pythonDebugger).toBeDefined();
      expect(pythonDebugger.isConnectedToPython()).toBe(false);
    });

    it('should connect to Python application', async () => {
      const result = await pythonDebugger.connect();
      
      expect(result.success).toBe(true);
      expect(result.sessionId).toBeDefined();
      expect(pythonDebugger.isConnectedToPython()).toBe(true);
    });

    it('should set Python breakpoint', async () => {
      await pythonDebugger.connect();
      
      const breakpoint = await pythonDebugger.setBreakpoint('main.py', 15, 'x > 10');
      
      expect(breakpoint).toBeDefined();
      expect(breakpoint.file).toBe('main.py');
      expect(breakpoint.line).toBe(15);
      expect(breakpoint.condition).toBe('x > 10');
      expect(breakpoint.verified).toBe(true);
    });

    it('should get Python threads', async () => {
      await pythonDebugger.connect();
      
      const threads = await pythonDebugger.getThreads();
      
      expect(threads).toBeDefined();
      expect(Array.isArray(threads)).toBe(true);
      expect(threads.length).toBeGreaterThan(0);
      expect(threads[0].name).toBe('MainThread');
    });

    it('should get Python stack trace', async () => {
      await pythonDebugger.connect();
      
      const stackFrames = await pythonDebugger.getStackTrace(1);
      
      expect(stackFrames).toBeDefined();
      expect(Array.isArray(stackFrames)).toBe(true);
      expect(stackFrames.length).toBeGreaterThan(0);
      expect(stackFrames[0].name).toBe('main');
    });

    it('should evaluate Python expression', async () => {
      await pythonDebugger.connect();
      
      const result = await pythonDebugger.evaluateExpression('len([1, 2, 3])');
      
      expect(result).toBeDefined();
      expect(result.result).toContain('Evaluated: len([1, 2, 3])');
      expect(result.type).toBe('str');
    });

    it('should handle control flow operations', async () => {
      await pythonDebugger.connect();
      
      // Test continue
      await expect(pythonDebugger.continue(1)).resolves.not.toThrow();
      
      // Test step operations
      await expect(pythonDebugger.stepOver(1)).resolves.not.toThrow();
      await expect(pythonDebugger.stepIn(1)).resolves.not.toThrow();
      await expect(pythonDebugger.stepOut(1)).resolves.not.toThrow();
      
      // Test pause
      await expect(pythonDebugger.pause(1)).resolves.not.toThrow();
    });

    it('should disconnect properly', async () => {
      await pythonDebugger.connect();
      expect(pythonDebugger.isConnectedToPython()).toBe(true);
      
      await pythonDebugger.disconnect();
      expect(pythonDebugger.isConnectedToPython()).toBe(false);
    });
  });

  describe('DjangoDebugger', () => {
    beforeEach(async () => {
      pythonDebugger = new PythonDebugger({
        host: 'localhost',
        port: 5678,
        projectPath: '/test/django-project',
        enableDjangoDebugging: true
      });
      
      await pythonDebugger.connect();
      djangoDebugger = new DjangoDebugger(pythonDebugger);
    });

    it('should create DjangoDebugger instance', () => {
      expect(djangoDebugger).toBeDefined();
    });

    it('should start and stop request tracking', async () => {
      await expect(djangoDebugger.startRequestTracking('test-session')).resolves.not.toThrow();
      await expect(djangoDebugger.stopRequestTracking()).resolves.not.toThrow();
    });

    it('should get Django models', async () => {
      const models = await djangoDebugger.getModels();
      
      expect(models).toBeDefined();
      expect(Array.isArray(models)).toBe(true);
      expect(models.length).toBeGreaterThan(0);
      expect(models[0].name).toBe('User');
      expect(models[0].app).toBe('myapp');
    });

    it('should get Django models for specific app', async () => {
      const models = await djangoDebugger.getModels('myapp');
      
      expect(models).toBeDefined();
      expect(Array.isArray(models)).toBe(true);
      expect(models.every(model => model.app === 'myapp')).toBe(true);
    });

    it('should analyze Django queries', async () => {
      const analysis = await djangoDebugger.analyzeQueries('test-session');
      
      expect(analysis).toBeDefined();
      expect(analysis.totalQueries).toBeDefined();
      expect(Array.isArray(analysis.slowQueries)).toBe(true);
      expect(Array.isArray(analysis.duplicateQueries)).toBe(true);
      expect(Array.isArray(analysis.nPlusOneIssues)).toBe(true);
      expect(Array.isArray(analysis.recommendations)).toBe(true);
    });

    it('should get URL patterns', async () => {
      const urlPatterns = await djangoDebugger.getUrlPatterns();
      
      expect(urlPatterns).toBeDefined();
      expect(Array.isArray(urlPatterns)).toBe(true);
      expect(urlPatterns.length).toBeGreaterThan(0);
      expect(urlPatterns[0].pattern).toBeDefined();
      expect(urlPatterns[0].view).toBeDefined();
    });

    it('should get middleware information', async () => {
      const middleware = await djangoDebugger.getMiddleware();
      
      expect(middleware).toBeDefined();
      expect(Array.isArray(middleware)).toBe(true);
      expect(middleware.length).toBeGreaterThan(0);
      expect(middleware[0].name).toContain('django.middleware');
      expect(middleware[0].enabled).toBe(true);
    });

    it('should analyze templates', async () => {
      const analysis = await djangoDebugger.analyzeTemplates();
      
      expect(analysis).toBeDefined();
      expect(Array.isArray(analysis.templates)).toBe(true);
      expect(Array.isArray(analysis.slowTemplates)).toBe(true);
      expect(Array.isArray(analysis.recommendations)).toBe(true);
    });
  });

  describe('Language Dispatcher Python Integration', () => {
    it('should connect to Python via language dispatcher', async () => {
      const result = await languageDispatcher.connect('python', {
        host: 'localhost',
        port: 5678,
        projectPath: '/test/project'
      });

      expect(result.success).toBe(true);
      expect(result.sessionId).toBeDefined();
      expect(result.language).toBe('python');
    });

    it('should connect to Django via language dispatcher', async () => {
      const result = await languageDispatcher.connect('python', {
        host: 'localhost',
        port: 5678,
        projectPath: '/test/django-project',
        enableDjangoDebugging: true
      });

      expect(result.success).toBe(true);
      expect(result.sessionId).toBeDefined();
      expect(result.language).toBe('python');
      expect(result.debugger.framework).toBe('django');
    });

    it('should execute Python operations via language dispatcher', async () => {
      const connectionResult = await languageDispatcher.connect('python', {
        host: 'localhost',
        port: 5678,
        projectPath: '/test/project'
      });

      const sessionId = connectionResult.sessionId;

      // Test setBreakpoint operation
      const breakpointResult = await languageDispatcher.executeOperation(sessionId, 'setBreakpoint', {
        file: 'main.py',
        line: 20
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
      expect(metricsResult.data.metrics.language).toBe('python');
    });

    it('should execute Django operations via language dispatcher', async () => {
      const connectionResult = await languageDispatcher.connect('python', {
        host: 'localhost',
        port: 5678,
        projectPath: '/test/django-project',
        enableDjangoDebugging: true
      });

      const sessionId = connectionResult.sessionId;

      // Test getDjangoInfo operation
      const djangoInfoResult = await languageDispatcher.executeOperation(sessionId, 'getDjangoInfo', {});

      expect(djangoInfoResult.success).toBe(true);
      expect(djangoInfoResult.data.djangoInfo).toBeDefined();

      // Test getDjangoModels operation
      const modelsResult = await languageDispatcher.executeOperation(sessionId, 'getDjangoModels', {});

      expect(modelsResult.success).toBe(true);
      expect(modelsResult.data.models).toBeDefined();

      // Test analyzeDjangoQueries operation
      const queryAnalysisResult = await languageDispatcher.executeOperation(sessionId, 'analyzeDjangoQueries', {});

      expect(queryAnalysisResult.success).toBe(true);
      expect(queryAnalysisResult.data.analysis).toBeDefined();
    });
  });

  describe('Python Performance Metrics', () => {
    it('should return comprehensive Python performance metrics', async () => {
      const connectionResult = await languageDispatcher.connect('python', {
        host: 'localhost',
        port: 5678
      });

      const metricsResult = await languageDispatcher.executeOperation(
        connectionResult.sessionId,
        'getPerformanceMetrics',
        { metricsType: 'general' }
      );

      expect(metricsResult.success).toBe(true);
      expect(metricsResult.data.metrics).toBeDefined();
      
      const metrics = metricsResult.data.metrics;
      expect(metrics.language).toBe('python');
      expect(metrics.memory).toBeDefined();
      expect(metrics.memory.rss).toBeGreaterThan(0);
      expect(metrics.cpu).toBeDefined();
      expect(metrics.gc).toBeDefined();
      expect(metrics.threads).toBeDefined();
    });
  });

  describe('Python Profiling', () => {
    it('should start and stop Python profiling', async () => {
      const connectionResult = await languageDispatcher.connect('python', {
        host: 'localhost',
        port: 5678
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
