/**
 * Tests for Electron Debugging functionality
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { ElectronDebugger } from '../electron/electron-debugger.js';
import { ElectronDebugConfig, ElectronProcessType } from '../electron/types.js';
import { initializeLogger } from '../utils/logger.js';

describe('ElectronDebugger', () => {
  let electronDebugger: ElectronDebugger;
  let mockConfig: ElectronDebugConfig;

  beforeEach(() => {
    // Initialize logger for tests
    initializeLogger({
      level: 'error',
      format: 'simple',
      console: { enabled: true },
      file: { enabled: false }
    });
    electronDebugger = new ElectronDebugger();
    mockConfig = {
      host: 'localhost',
      mainPort: 9229,
      rendererPort: 9222,
      timeout: 30000,
      autoDiscover: true,
      enableIpcDebugging: true,
      enablePerformanceProfiling: true,
      enableSecurityDebugging: true,
      enableGUIDebugging: true,
      projectPath: '/test/project',
      electronPath: '/test/electron',
      appPath: '/test/app'
    };
  });

  afterEach(() => {
    // Clean up any active sessions
    const sessions = electronDebugger.getAllSessions();
    for (const session of sessions) {
      electronDebugger.disconnect(session.sessionId).catch(() => {
        // Ignore cleanup errors
      });
    }
  });

  describe('Connection Management', () => {
    it('should create a new debugging session', async () => {
      // Mock the discovery methods to avoid actual network calls
      vi.spyOn(electronDebugger as any, 'discoverMainProcess').mockResolvedValue(undefined);
      vi.spyOn(electronDebugger as any, 'discoverRendererProcesses').mockResolvedValue(undefined);

      const session = await electronDebugger.connect(mockConfig);

      expect(session).toBeDefined();
      expect(session.sessionId).toBeDefined();
      expect(session.connected).toBe(true);
      expect(session.config).toEqual(mockConfig);
    });

    it('should disconnect from a session', async () => {
      // Mock the discovery methods
      vi.spyOn(electronDebugger as any, 'discoverMainProcess').mockResolvedValue(undefined);
      vi.spyOn(electronDebugger as any, 'discoverRendererProcesses').mockResolvedValue(undefined);

      const session = await electronDebugger.connect(mockConfig);
      await electronDebugger.disconnect(session.sessionId);

      const retrievedSession = electronDebugger.getSession(session.sessionId);
      expect(retrievedSession).toBeUndefined();
    });

    it('should throw error when disconnecting non-existent session', async () => {
      await expect(electronDebugger.disconnect('non-existent')).rejects.toThrow('Session not found');
    });
  });

  describe('Process Management', () => {
    it('should get processes for a session', async () => {
      // Mock the discovery methods
      vi.spyOn(electronDebugger as any, 'discoverMainProcess').mockResolvedValue(undefined);
      vi.spyOn(electronDebugger as any, 'discoverRendererProcesses').mockResolvedValue(undefined);

      const session = await electronDebugger.connect(mockConfig);
      const processes = await electronDebugger.getProcesses(session.sessionId);

      expect(Array.isArray(processes)).toBe(true);
    });

    it('should throw error when getting processes for non-existent session', async () => {
      await expect(electronDebugger.getProcesses('non-existent')).rejects.toThrow('Session not found');
    });
  });

  describe('Breakpoint Management', () => {
    it('should set a breakpoint', async () => {
      // Mock the discovery methods
      vi.spyOn(electronDebugger as any, 'discoverMainProcess').mockResolvedValue(undefined);
      vi.spyOn(electronDebugger as any, 'discoverRendererProcesses').mockResolvedValue(undefined);

      const session = await electronDebugger.connect(mockConfig);
      
      const breakpoint = await electronDebugger.setBreakpoint(session.sessionId, {
        type: 'line',
        processType: 'main',
        file: '/test/file.js',
        line: 10,
        enabled: true
      });

      expect(breakpoint).toBeDefined();
      expect(breakpoint.id).toBeDefined();
      expect(breakpoint.type).toBe('line');
      expect(breakpoint.processType).toBe('main');
      expect(breakpoint.file).toBe('/test/file.js');
      expect(breakpoint.line).toBe(10);
    });

    it('should remove a breakpoint', async () => {
      // Mock the discovery methods
      vi.spyOn(electronDebugger as any, 'discoverMainProcess').mockResolvedValue(undefined);
      vi.spyOn(electronDebugger as any, 'discoverRendererProcesses').mockResolvedValue(undefined);

      const session = await electronDebugger.connect(mockConfig);
      
      const breakpoint = await electronDebugger.setBreakpoint(session.sessionId, {
        type: 'line',
        processType: 'main',
        file: '/test/file.js',
        line: 10,
        enabled: true
      });

      await expect(electronDebugger.removeBreakpoint(session.sessionId, breakpoint.id)).resolves.not.toThrow();
    });
  });

  describe('IPC Debugging', () => {
    it('should start IPC tracing', async () => {
      // Mock the discovery methods
      vi.spyOn(electronDebugger as any, 'discoverMainProcess').mockResolvedValue(undefined);
      vi.spyOn(electronDebugger as any, 'discoverRendererProcesses').mockResolvedValue(undefined);

      const session = await electronDebugger.connect(mockConfig);
      
      await expect(electronDebugger.traceIPC(session.sessionId, true)).resolves.not.toThrow();
    });

    it('should get IPC channels', async () => {
      // Mock the discovery methods
      vi.spyOn(electronDebugger as any, 'discoverMainProcess').mockResolvedValue(undefined);
      vi.spyOn(electronDebugger as any, 'discoverRendererProcesses').mockResolvedValue(undefined);

      const session = await electronDebugger.connect(mockConfig);
      const channels = await electronDebugger.getIPCChannels(session.sessionId);

      expect(Array.isArray(channels)).toBe(true);
    });

    it('should get IPC messages', async () => {
      // Mock the discovery methods
      vi.spyOn(electronDebugger as any, 'discoverMainProcess').mockResolvedValue(undefined);
      vi.spyOn(electronDebugger as any, 'discoverRendererProcesses').mockResolvedValue(undefined);

      const session = await electronDebugger.connect(mockConfig);
      const messages = await electronDebugger.getIPCMessages(session.sessionId);

      expect(Array.isArray(messages)).toBe(true);
    });
  });

  describe('Performance Profiling', () => {
    it('should start and stop profiling', async () => {
      // Mock the discovery methods
      vi.spyOn(electronDebugger as any, 'discoverMainProcess').mockResolvedValue(undefined);
      vi.spyOn(electronDebugger as any, 'discoverRendererProcesses').mockResolvedValue(undefined);

      const session = await electronDebugger.connect(mockConfig);
      
      await expect(electronDebugger.startProfiling(session.sessionId, undefined, 'cpu')).resolves.not.toThrow();
      await expect(electronDebugger.stopProfiling(session.sessionId)).resolves.not.toThrow();
    });

    it('should get performance metrics', async () => {
      // Mock the discovery methods
      vi.spyOn(electronDebugger as any, 'discoverMainProcess').mockResolvedValue(undefined);
      vi.spyOn(electronDebugger as any, 'discoverRendererProcesses').mockResolvedValue(undefined);

      const session = await electronDebugger.connect(mockConfig);
      const metrics = await electronDebugger.getPerformanceMetrics(session.sessionId);

      expect(metrics).toBeDefined();
      expect(metrics.processId).toBeDefined();
      expect(metrics.processType).toBeDefined();
      expect(metrics.timestamp).toBeDefined();
      expect(metrics.memory).toBeDefined();
      expect(metrics.cpu).toBeDefined();
    });
  });

  describe('Security Analysis', () => {
    it('should get security context', async () => {
      // Mock the discovery methods
      vi.spyOn(electronDebugger as any, 'discoverMainProcess').mockResolvedValue(undefined);
      vi.spyOn(electronDebugger as any, 'discoverRendererProcesses').mockResolvedValue(undefined);

      const session = await electronDebugger.connect(mockConfig);
      const securityContext = await electronDebugger.getSecurityContext(session.sessionId);

      expect(securityContext).toBeDefined();
      expect(securityContext.processId).toBeDefined();
      expect(securityContext.processType).toBeDefined();
      expect(typeof securityContext.nodeIntegration).toBe('boolean');
      expect(typeof securityContext.contextIsolation).toBe('boolean');
      expect(typeof securityContext.sandbox).toBe('boolean');
      expect(typeof securityContext.webSecurity).toBe('boolean');
    });

    it('should validate security', async () => {
      // Mock the discovery methods
      vi.spyOn(electronDebugger as any, 'discoverMainProcess').mockResolvedValue(undefined);
      vi.spyOn(electronDebugger as any, 'discoverRendererProcesses').mockResolvedValue(undefined);

      const session = await electronDebugger.connect(mockConfig);
      const validation = await electronDebugger.validateSecurity(session.sessionId);

      expect(validation).toBeDefined();
      expect(validation.overall).toBeDefined();
      expect(typeof validation.score).toBe('number');
      expect(Array.isArray(validation.checks)).toBe(true);
      expect(Array.isArray(validation.recommendations)).toBe(true);
    });
  });

  describe('GUI Debugging', () => {
    it('should get GUI elements', async () => {
      // Mock the discovery methods
      vi.spyOn(electronDebugger as any, 'discoverMainProcess').mockResolvedValue(undefined);
      vi.spyOn(electronDebugger as any, 'discoverRendererProcesses').mockResolvedValue(undefined);

      const session = await electronDebugger.connect(mockConfig);
      const elements = await electronDebugger.getGUIElements(session.sessionId);

      expect(Array.isArray(elements)).toBe(true);
    });

    it('should handle GUI element inspection gracefully', async () => {
      // Mock the discovery methods
      vi.spyOn(electronDebugger as any, 'discoverMainProcess').mockResolvedValue(undefined);
      vi.spyOn(electronDebugger as any, 'discoverRendererProcesses').mockResolvedValue(undefined);

      const session = await electronDebugger.connect(mockConfig);
      
      // Should throw error for non-existent element
      await expect(electronDebugger.inspectGUIElement(session.sessionId, 'non-existent')).rejects.toThrow();
    });
  });

  describe('Execution Control', () => {
    it('should handle continue operation', async () => {
      // Mock the discovery methods
      vi.spyOn(electronDebugger as any, 'discoverMainProcess').mockResolvedValue(undefined);
      vi.spyOn(electronDebugger as any, 'discoverRendererProcesses').mockResolvedValue(undefined);

      const session = await electronDebugger.connect(mockConfig);
      
      await expect(electronDebugger.continue(session.sessionId)).resolves.not.toThrow();
    });

    it('should handle pause operation', async () => {
      // Mock the discovery methods
      vi.spyOn(electronDebugger as any, 'discoverMainProcess').mockResolvedValue(undefined);
      vi.spyOn(electronDebugger as any, 'discoverRendererProcesses').mockResolvedValue(undefined);

      const session = await electronDebugger.connect(mockConfig);
      
      await expect(electronDebugger.pause(session.sessionId)).resolves.not.toThrow();
    });

    it('should handle step operations', async () => {
      // Mock the discovery methods
      vi.spyOn(electronDebugger as any, 'discoverMainProcess').mockResolvedValue(undefined);
      vi.spyOn(electronDebugger as any, 'discoverRendererProcesses').mockResolvedValue(undefined);

      const session = await electronDebugger.connect(mockConfig);
      
      await expect(electronDebugger.stepOver(session.sessionId)).resolves.not.toThrow();
      await expect(electronDebugger.stepInto(session.sessionId)).resolves.not.toThrow();
      await expect(electronDebugger.stepOut(session.sessionId)).resolves.not.toThrow();
    });

    it('should handle expression evaluation', async () => {
      // Mock the discovery methods
      vi.spyOn(electronDebugger as any, 'discoverMainProcess').mockResolvedValue(undefined);
      vi.spyOn(electronDebugger as any, 'discoverRendererProcesses').mockResolvedValue(undefined);

      const session = await electronDebugger.connect(mockConfig);
      
      const result = await electronDebugger.evaluate(session.sessionId, '1 + 1');
      expect(result).toBeDefined();
    });
  });

  describe('Error Handling', () => {
    it('should handle connection failures gracefully', async () => {
      const invalidConfig = { ...mockConfig, host: 'invalid-host', timeout: 1000 };
      
      await expect(electronDebugger.connect(invalidConfig)).rejects.toThrow('Failed to connect to Electron application');
    });

    it('should handle operations on non-existent sessions', async () => {
      const nonExistentSessionId = 'non-existent-session';
      
      await expect(electronDebugger.getProcesses(nonExistentSessionId)).rejects.toThrow('Session not found');
      await expect(electronDebugger.setBreakpoint(nonExistentSessionId, {
        type: 'line',
        processType: 'main',
        file: '/test/file.js',
        line: 10,
        enabled: true
      })).rejects.toThrow('Session not found');
      await expect(electronDebugger.continue(nonExistentSessionId)).rejects.toThrow('Session not found');
    });
  });
});
