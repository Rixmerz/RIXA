import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { RixaIntegration } from '@/core/integration.js';
import { createLogger } from '@/utils/logger.js';
import type { AppConfig } from '@/types/config.js';
import type { McpConnection } from '@/mcp/server.js';

// Mock logger for tests
const mockLogger = createLogger(
  { level: 'error', format: 'json', file: { enabled: false, path: '', maxSize: 0, maxFiles: 0 } },
  { requestId: 'tool-registration-test' }
);

describe('Tool Registration Pipeline', () => {
  let integration: RixaIntegration;
  let mockConnection: McpConnection;

  const testConfig: AppConfig = {
    server: {
      host: 'localhost',
      port: 3000,
      cors: {
        enabled: true,
        origins: ['*'],
        credentials: false,
      },
    },
    auth: {
      enabled: false,
      secret: 'test-secret',
      tokenExpiry: '1h',
    },
    filesystem: {
      allowedPaths: ['/test'],
      excludePatterns: ['node_modules/**'],
      readOnly: false,
      maxFileSize: 1024 * 1024,
    },
    logging: {
      level: 'error',
      format: 'json',
      file: {
        enabled: false,
        path: '',
        maxSize: 0,
        maxFiles: 0,
      },
    },
  };

  beforeEach(() => {
    integration = new RixaIntegration(testConfig, mockLogger);

    // Mock connection
    mockConnection = {
      id: 'test-conn',
      sendResponse: vi.fn(),
      sendNotification: vi.fn(),
      authenticated: true,
      clientInfo: { name: 'test-client', version: '1.0.0' },
    } as any;
  });

  afterEach(async () => {
    await integration.stop();
  });

  describe('Tool Discovery', () => {
    it('should list all available tools', async () => {
      const request = {
        jsonrpc: '2.0' as const,
        id: 'test-1',
        method: 'tools/list' as const,
        params: {},
      };

      await integration.handleMcpRequest(mockConnection, request, { requestId: 'test-1' });

      expect(mockConnection.sendResponse).toHaveBeenCalledWith('test-1', {
        tools: expect.arrayContaining([
          expect.objectContaining({
            name: 'debug/createSession',
            description: 'Create a new debug session',
          }),
          expect.objectContaining({
            name: 'debug/continue',
            description: 'Continue execution',
          }),
          expect.objectContaining({
            name: 'debug/pause',
            description: 'Pause execution',
          }),
          expect.objectContaining({
            name: 'debug/stepOver',
            description: 'Step over (next line)',
          }),
          expect.objectContaining({
            name: 'debug/stepIn',
            description: 'Step into function',
          }),
          expect.objectContaining({
            name: 'debug/stepOut',
            description: 'Step out of function',
          }),
          expect.objectContaining({
            name: 'debug/setBreakpoints',
            description: 'Set breakpoints in a file',
          }),
          expect.objectContaining({
            name: 'debug/getThreads',
            description: 'Get all threads',
          }),
          expect.objectContaining({
            name: 'debug/getStackTrace',
            description: 'Get stack trace for a thread',
          }),
          expect.objectContaining({
            name: 'debug/getVariables',
            description: 'Get variables for a scope',
          }),
          expect.objectContaining({
            name: 'debug/evaluate',
            description: 'Evaluate an expression',
          }),
          expect.objectContaining({
            name: 'debug/terminate',
            description: 'Terminate debug session',
          }),
          // Enhanced tools
          expect.objectContaining({
            name: 'debug/getEnhancedStackTrace',
            description: 'Get enhanced stack trace with scopes and variables',
          }),
          expect.objectContaining({
            name: 'debug/getEnhancedVariables',
            description: 'Get enhanced variables with hierarchy and metadata',
          }),
          expect.objectContaining({
            name: 'debug/evaluateEnhanced',
            description: 'Evaluate expression with enhanced result information',
          }),
        ]),
      });
    });

    it('should provide proper input schemas for all tools', async () => {
      const request = {
        jsonrpc: '2.0' as const,
        id: 'test-2',
        method: 'tools/list' as const,
        params: {},
      };

      await integration.handleMcpRequest(mockConnection, request, { requestId: 'test-2' });

      const response = vi.mocked(mockConnection.sendResponse).mock.calls[0][1];
      const tools = response.tools;

      // Verify all tools have proper schemas
      for (const tool of tools) {
        expect(tool).toHaveProperty('name');
        expect(tool).toHaveProperty('description');
        expect(tool).toHaveProperty('inputSchema');
        expect(tool.inputSchema).toHaveProperty('type', 'object');
        expect(tool.inputSchema).toHaveProperty('properties');
        expect(tool.inputSchema).toHaveProperty('required');
      }
    });
  });

  describe('Tool Validation', () => {
    it('should reject calls to non-existent tools', async () => {
      const request = {
        jsonrpc: '2.0' as const,
        id: 'test-3',
        method: 'tools/call' as const,
        params: {
          name: 'debug/nonExistentTool',
          arguments: {},
        },
      };

      await integration.handleMcpRequest(mockConnection, request, { requestId: 'test-3' });

      // Non-existent tools should fail at sessionId validation since they're not createSession
      expect(mockConnection.sendResponse).toHaveBeenCalledWith(
        'test-3',
        expect.objectContaining({
          content: expect.arrayContaining([
            expect.objectContaining({
              type: 'text',
              text: expect.stringContaining('sessionId is required'),
            }),
          ]),
          isError: true,
        })
      );
    });

    it('should validate required parameters for createSession', async () => {
      const request = {
        jsonrpc: '2.0' as const,
        id: 'test-4',
        method: 'tools/call' as const,
        params: {
          name: 'debug/createSession',
          arguments: {
            // Missing required 'adapter' and 'program'
          },
        },
      };

      await integration.handleMcpRequest(mockConnection, request, { requestId: 'test-4' });

      expect(mockConnection.sendResponse).toHaveBeenCalledWith(
        'test-4',
        expect.objectContaining({
          content: expect.arrayContaining([
            expect.objectContaining({
              type: 'text',
              text: expect.stringContaining('adapter and program are required'),
            }),
          ]),
          isError: true,
        })
      );
    });

    it('should validate sessionId for session-dependent tools', async () => {
      const request = {
        jsonrpc: '2.0' as const,
        id: 'test-5',
        method: 'tools/call' as const,
        params: {
          name: 'debug/continue',
          arguments: {
            threadId: 1,
            // Missing sessionId
          },
        },
      };

      await integration.handleMcpRequest(mockConnection, request, { requestId: 'test-5' });

      expect(mockConnection.sendResponse).toHaveBeenCalledWith(
        'test-5',
        expect.objectContaining({
          content: expect.arrayContaining([
            expect.objectContaining({
              type: 'text',
              text: expect.stringContaining('sessionId is required'),
            }),
          ]),
          isError: true,
        })
      );
    });
  });

  describe('Enhanced Tools Integration', () => {
    it('should handle enhanced tools without DAP mapping', async () => {
      // This test verifies that enhanced tools are handled directly
      // and don't go through the DAP mapper
      const request = {
        jsonrpc: '2.0' as const,
        id: 'test-6',
        method: 'tools/call' as const,
        params: {
          name: 'debug/getEnhancedStackTrace',
          arguments: {
            sessionId: 'non-existent-session',
            threadId: 1,
          },
        },
      };

      await integration.handleMcpRequest(mockConnection, request, { requestId: 'test-6' });

      // Should fail with session not found, not unsupported tool
      expect(mockConnection.sendResponse).toHaveBeenCalledWith(
        'test-6',
        expect.objectContaining({
          content: expect.arrayContaining([
            expect.objectContaining({
              type: 'text',
              text: expect.stringContaining('Session not found'),
            }),
          ]),
          isError: true,
        })
      );
    });

    it('should verify tool registration completeness', async () => {
      // This test verifies that all expected tools are registered
      const request = {
        jsonrpc: '2.0' as const,
        id: 'test-completeness',
        method: 'tools/list' as const,
        params: {},
      };

      await integration.handleMcpRequest(mockConnection, request, { requestId: 'test-completeness' });

      const response = vi.mocked(mockConnection.sendResponse).mock.calls[0][1];
      const toolNames = response.tools.map((tool: any) => tool.name);

      // Verify all expected tools are present
      const expectedTools = [
        'debug/createSession',
        'debug/continue',
        'debug/pause',
        'debug/stepOver',
        'debug/stepIn',
        'debug/stepOut',
        'debug/setBreakpoints',
        'debug/getThreads',
        'debug/getStackTrace',
        'debug/getVariables',
        'debug/evaluate',
        'debug/terminate',
        'debug/getEnhancedStackTrace',
        'debug/getEnhancedVariables',
        'debug/evaluateEnhanced',
        'debug/getErrorStats',
        'debug/resetErrorStats',
      ];

      for (const expectedTool of expectedTools) {
        expect(toolNames).toContain(expectedTool);
      }

      // Verify we have exactly the expected number of tools
      expect(toolNames).toHaveLength(expectedTools.length);
    });
  });
});
