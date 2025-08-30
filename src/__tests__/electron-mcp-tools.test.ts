/**
 * Tests for Electron MCP Tools
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { electronTools } from '../mcp/tools/electron-tools.js';

describe('Electron MCP Tools', () => {
  beforeEach(() => {
    // Reset any global state
    vi.clearAllMocks();
  });

  afterEach(() => {
    // Clean up any resources
  });

  describe('debug_connectElectron', () => {
    it('should have correct schema', () => {
      const tool = electronTools.debug_connectElectron;
      
      expect(tool.name).toBe('debug_connectElectron');
      expect(tool.description).toContain('Connect to an Electron application');
      expect(tool.inputSchema).toBeDefined();
      expect(tool.handler).toBeDefined();
    });

    it('should handle connection with default parameters', async () => {
      const tool = electronTools.debug_connectElectron;
      
      // Mock the connection to avoid actual network calls
      const result = await tool.handler({});
      
      expect(result).toBeDefined();
      expect(typeof result.success).toBe('boolean');
      expect(result.message).toBeDefined();
    });

    it('should handle connection with custom parameters', async () => {
      const tool = electronTools.debug_connectElectron;
      
      const args = {
        host: 'localhost',
        mainPort: 9229,
        rendererPort: 9222,
        timeout: 30000,
        autoDiscover: true,
        enableIpcDebugging: true,
        enablePerformanceProfiling: true,
        enableSecurityDebugging: true,
        enableGUIDebugging: true,
        projectPath: '/test/project'
      };
      
      const result = await tool.handler(args);
      
      expect(result).toBeDefined();
      expect(typeof result.success).toBe('boolean');
      expect(result.message).toBeDefined();
    });
  });

  describe('debug_getElectronProcesses', () => {
    it('should have correct schema', () => {
      const tool = electronTools.debug_getElectronProcesses;
      
      expect(tool.name).toBe('debug_getElectronProcesses');
      expect(tool.description).toContain('Get all Electron processes');
      expect(tool.inputSchema).toBeDefined();
      expect(tool.handler).toBeDefined();
    });

    it('should require sessionId parameter', async () => {
      const tool = electronTools.debug_getElectronProcesses;
      
      const result = await tool.handler({ sessionId: 'test-session' });
      
      expect(result).toBeDefined();
      expect(typeof result.success).toBe('boolean');
      expect(result.message).toBeDefined();
    });
  });

  describe('debug_setElectronBreakpoint', () => {
    it('should have correct schema', () => {
      const tool = electronTools.debug_setElectronBreakpoint;
      
      expect(tool.name).toBe('debug_setElectronBreakpoint');
      expect(tool.description).toContain('Set a breakpoint');
      expect(tool.inputSchema).toBeDefined();
      expect(tool.handler).toBeDefined();
    });

    it('should handle breakpoint setting', async () => {
      const tool = electronTools.debug_setElectronBreakpoint;
      
      const args = {
        sessionId: 'test-session',
        processType: 'main',
        file: '/test/file.js',
        line: 10
      };
      
      const result = await tool.handler(args);
      
      expect(result).toBeDefined();
      expect(typeof result.success).toBe('boolean');
      expect(result.message).toBeDefined();
    });
  });

  describe('debug_inspectIPC', () => {
    it('should have correct schema', () => {
      const tool = electronTools.debug_inspectIPC;
      
      expect(tool.name).toBe('debug_inspectIPC');
      expect(tool.description).toContain('Inspect IPC communication');
      expect(tool.inputSchema).toBeDefined();
      expect(tool.handler).toBeDefined();
    });

    it('should handle IPC inspection', async () => {
      const tool = electronTools.debug_inspectIPC;
      
      const args = {
        sessionId: 'test-session',
        limit: 50
      };
      
      const result = await tool.handler(args);
      
      expect(result).toBeDefined();
      expect(typeof result.success).toBe('boolean');
      expect(result.message).toBeDefined();
    });
  });

  describe('debug_getElectronPerformance', () => {
    it('should have correct schema', () => {
      const tool = electronTools.debug_getElectronPerformance;
      
      expect(tool.name).toBe('debug_getElectronPerformance');
      expect(tool.description).toContain('Get performance metrics');
      expect(tool.inputSchema).toBeDefined();
      expect(tool.handler).toBeDefined();
    });

    it('should handle performance metrics retrieval', async () => {
      const tool = electronTools.debug_getElectronPerformance;
      
      const args = {
        sessionId: 'test-session'
      };
      
      const result = await tool.handler(args);
      
      expect(result).toBeDefined();
      expect(typeof result.success).toBe('boolean');
      expect(result.message).toBeDefined();
    });
  });

  describe('debug_analyzeElectronMemory', () => {
    it('should have correct schema', () => {
      const tool = electronTools.debug_analyzeElectronMemory;
      
      expect(tool.name).toBe('debug_analyzeElectronMemory');
      expect(tool.description).toContain('Analyze memory usage');
      expect(tool.inputSchema).toBeDefined();
      expect(tool.handler).toBeDefined();
    });

    it('should handle memory analysis', async () => {
      const tool = electronTools.debug_analyzeElectronMemory;
      
      const args = {
        sessionId: 'test-session',
        duration: 10
      };
      
      const result = await tool.handler(args);
      
      expect(result).toBeDefined();
      expect(typeof result.success).toBe('boolean');
      expect(result.message).toBeDefined();
    });
  });

  describe('debug_getElectronSecurity', () => {
    it('should have correct schema', () => {
      const tool = electronTools.debug_getElectronSecurity;
      
      expect(tool.name).toBe('debug_getElectronSecurity');
      expect(tool.description).toContain('Get security context');
      expect(tool.inputSchema).toBeDefined();
      expect(tool.handler).toBeDefined();
    });

    it('should handle security analysis', async () => {
      const tool = electronTools.debug_getElectronSecurity;
      
      const args = {
        sessionId: 'test-session'
      };
      
      const result = await tool.handler(args);
      
      expect(result).toBeDefined();
      expect(typeof result.success).toBe('boolean');
      expect(result.message).toBeDefined();
    });
  });

  describe('debug_debugElectronGUI', () => {
    it('should have correct schema', () => {
      const tool = electronTools.debug_debugElectronGUI;
      
      expect(tool.name).toBe('debug_debugElectronGUI');
      expect(tool.description).toContain('Debug GUI elements');
      expect(tool.inputSchema).toBeDefined();
      expect(tool.handler).toBeDefined();
    });

    it('should handle GUI element listing', async () => {
      const tool = electronTools.debug_debugElectronGUI;
      
      const args = {
        sessionId: 'test-session',
        action: 'list'
      };
      
      const result = await tool.handler(args);
      
      expect(result).toBeDefined();
      expect(typeof result.success).toBe('boolean');
      expect(result.message).toBeDefined();
    });

    it('should handle GUI element inspection', async () => {
      const tool = electronTools.debug_debugElectronGUI;
      
      const args = {
        sessionId: 'test-session',
        action: 'inspect',
        elementId: 'test-element'
      };
      
      const result = await tool.handler(args);
      
      expect(result).toBeDefined();
      expect(typeof result.success).toBe('boolean');
      expect(result.message).toBeDefined();
    });

    it('should handle GUI event simulation', async () => {
      const tool = electronTools.debug_debugElectronGUI;
      
      const args = {
        sessionId: 'test-session',
        action: 'simulate',
        elementId: 'test-element',
        eventType: 'click'
      };
      
      const result = await tool.handler(args);
      
      expect(result).toBeDefined();
      expect(typeof result.success).toBe('boolean');
      expect(result.message).toBeDefined();
    });
  });

  describe('Error Handling', () => {
    it('should handle missing required parameters gracefully', async () => {
      const tool = electronTools.debug_getElectronProcesses;
      
      const result = await tool.handler({});
      
      expect(result).toBeDefined();
      expect(result.success).toBe(false);
      expect(result.error).toBeDefined();
    });

    it('should handle invalid session IDs gracefully', async () => {
      const tool = electronTools.debug_getElectronProcesses;
      
      const result = await tool.handler({ sessionId: 'invalid-session' });
      
      expect(result).toBeDefined();
      expect(result.success).toBe(false);
      expect(result.error).toBeDefined();
    });
  });

  describe('Tool Integration', () => {
    it('should have all expected tools exported', () => {
      expect(electronTools.debug_connectElectron).toBeDefined();
      expect(electronTools.debug_getElectronProcesses).toBeDefined();
      expect(electronTools.debug_setElectronBreakpoint).toBeDefined();
      expect(electronTools.debug_inspectIPC).toBeDefined();
      expect(electronTools.debug_getElectronPerformance).toBeDefined();
      expect(electronTools.debug_analyzeElectronMemory).toBeDefined();
      expect(electronTools.debug_getElectronSecurity).toBeDefined();
      expect(electronTools.debug_debugElectronGUI).toBeDefined();
    });

    it('should have consistent tool structure', () => {
      const tools = Object.values(electronTools);
      
      for (const tool of tools) {
        expect(tool.name).toBeDefined();
        expect(tool.description).toBeDefined();
        expect(tool.inputSchema).toBeDefined();
        expect(tool.handler).toBeDefined();
        expect(typeof tool.handler).toBe('function');
      }
    });
  });

  // Tests for new Electron tools
  describe('New Electron Tools', () => {
    describe('debug_getElectronArchitecture', () => {
      it('should get comprehensive architecture overview', async () => {
        const tool = electronTools.debug_getElectronArchitecture;

        const args = {
          sessionId: 'test-session-123',
          includeMainProcess: true,
          includeRendererProcesses: true,
          includeUtilityProcesses: true,
          showMemoryPerProcess: true,
          showCPUPerProcess: true
        };

        const result = await tool.handler(args);

        expect(result).toBeDefined();
        expect(typeof result.success).toBe('boolean');
        if (result.success) {
          expect(result.architecture).toBeDefined();
          expect(result.architecture.sessionId).toBe(args.sessionId);
          expect(result.architecture.overview).toBeDefined();
        }
        expect(result.message).toBeDefined();
      });
    });

    describe('debug_startIpcMonitoring', () => {
      it('should start IPC monitoring with advanced options', async () => {
        const tool = electronTools.debug_startIpcMonitoring;

        const args = {
          sessionId: 'test-session-123',
          channels: ['get-app-info', 'perform-async-task'],
          capturePayloads: true,
          trackTiming: true,
          detectLeaks: true,
          maxMessages: 1000
        };

        const result = await tool.handler(args);

        expect(result).toBeDefined();
        expect(typeof result.success).toBe('boolean');
        if (result.success) {
          expect(result.monitoring).toBeDefined();
          expect(result.monitoring.active).toBe(true);
          expect(result.monitoring.sessionId).toBe(args.sessionId);
          expect(result.monitoring.config).toBeDefined();
        }
        expect(result.message).toBeDefined();
      });
    });

    describe('debug_getIpcMessages', () => {
      it('should get IPC messages with filtering', async () => {
        const tool = electronTools.debug_getIpcMessages;

        const args = {
          sessionId: 'test-session-123',
          timeRange: 'last-5min',
          filterByChannel: 'get-app-info',
          includeStackTrace: true,
          includePayloads: true,
          limit: 100
        };

        const result = await tool.handler(args);

        expect(result).toBeDefined();
        expect(typeof result.success).toBe('boolean');
        if (result.success) {
          expect(result.messages).toBeDefined();
          expect(Array.isArray(result.messages)).toBe(true);
          expect(result.analysis).toBeDefined();
          expect(result.filter).toBeDefined();
        }
        expect(result.message).toBeDefined();
      });
    });

    describe('debug_analyzeElectronSecurity', () => {
      it('should perform comprehensive security analysis', async () => {
        const tool = electronTools.debug_analyzeElectronSecurity;

        const args = {
          sessionId: 'test-session-123',
          checkNodeIntegration: true,
          checkContextIsolation: true,
          checkSandboxMode: true,
          checkCSP: true,
          checkRemoteModule: true
        };

        const result = await tool.handler(args);

        expect(result).toBeDefined();
        expect(typeof result.success).toBe('boolean');
        if (result.success) {
          expect(result.security).toBeDefined();
          expect(result.security.overallRisk).toMatch(/^(LOW|MEDIUM|HIGH|CRITICAL)$/);
          expect(typeof result.security.score).toBe('number');
          expect(result.security.checks).toBeDefined();
          expect(Array.isArray(result.security.recommendations)).toBe(true);
          expect(Array.isArray(result.security.vulnerabilities)).toBe(true);
        }
        expect(result.message).toBeDefined();
      });
    });

    describe('debug_getAsyncOperations', () => {
      it('should get async operations with Electron-specific tracking', async () => {
        const tool = electronTools.debug_getAsyncOperations;

        const args = {
          sessionId: 'test-session-123',
          includeElectronIPC: true,
          includeRendererAsync: true,
          trackWebContents: true,
          includePromises: true,
          includeTimers: true
        };

        const result = await tool.handler(args);

        expect(result).toBeDefined();
        expect(typeof result.success).toBe('boolean');
        if (result.success) {
          expect(result.asyncOperations).toBeDefined();
          expect(result.asyncOperations.sessionId).toBe(args.sessionId);
          expect(result.asyncOperations.operations).toBeDefined();
          expect(result.asyncOperations.operations.ipc).toBeDefined();
          expect(result.asyncOperations.operations.webContents).toBeDefined();
          expect(result.asyncOperations.summary).toBeDefined();
          expect(typeof result.asyncOperations.summary.total).toBe('number');
        }
        expect(result.message).toBeDefined();
      });
    });

    // Error handling tests for new tools
    describe('Error Handling for New Tools', () => {
      it('should handle invalid session ID gracefully', async () => {
        const tools = [
          electronTools.debug_getElectronArchitecture,
          electronTools.debug_startIpcMonitoring,
          electronTools.debug_getIpcMessages,
          electronTools.debug_analyzeElectronSecurity,
          electronTools.debug_getAsyncOperations
        ];

        for (const tool of tools) {
          const result = await tool.handler({ sessionId: 'invalid-session' });
          expect(result).toBeDefined();
          expect(result.success).toBe(false);
          expect(result.error).toBeDefined();
          expect(result.message).toBeDefined();
        }
      });
    });
  });
});
