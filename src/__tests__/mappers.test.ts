import { describe, it, expect, beforeEach, vi } from 'vitest';
import { McpToDapMapper, DapToMcpMapper, DapResponseMapper } from '@/core/mappers.js';
import { createLogger } from '@/utils/logger.js';
import { DebugSession, SessionState } from '@/core/session.js';
import type { McpToolCallRequest } from '@/types/mcp.js';
import type { DapEvent, DapResponse } from '@/types/dap.js';
import { ErrorType, RixaError } from '@/types/common.js';

// Mock logger
const mockLogger = createLogger(
  { level: 'debug', format: 'json', file: { enabled: false, path: '', maxSize: 0, maxFiles: 0 } },
  { requestId: 'test-request' }
);

// Mock debug session
const mockSession = {
  id: 'test-session-123',
  getState: () => SessionState.RUNNING,
  getCapabilities: () => ({}),
  getBreakpoints: () => [],
  getThreads: () => [],
  isActive: () => true,
} as DebugSession;

describe('Command Mappers', () => {
  let mcpToDapMapper: McpToDapMapper;

  beforeEach(() => {
    mcpToDapMapper = new McpToDapMapper(mockLogger);
  });

  describe('McpToDapMapper', () => {
    it('should map continue command correctly', async () => {
      const toolCall: McpToolCallRequest = {
        jsonrpc: '2.0',
        id: 'test-1',
        method: 'tools/call',
        params: {
          name: 'debug/continue',
          arguments: {
            threadId: 1,
            singleThread: true,
          },
        },
      };

      const result = await mcpToDapMapper.mapToolCall(toolCall, mockSession);

      expect(result.requiresResponse).toBe(true);
      expect(result.dapRequests).toHaveLength(1);
      expect(result.dapRequests[0]).toMatchObject({
        type: 'request',
        command: 'continue',
        arguments: {
          threadId: 1,
          singleThread: true,
        },
      });
    });

    it('should map setBreakpoints command correctly', async () => {
      const toolCall: McpToolCallRequest = {
        jsonrpc: '2.0',
        id: 'test-2',
        method: 'tools/call',
        params: {
          name: 'debug/setBreakpoints',
          arguments: {
            source: {
              path: '/path/to/file.js',
              name: 'file.js',
            },
            breakpoints: [
              {
                line: 10,
                condition: 'x > 5',
              },
              {
                line: 20,
                hitCondition: '> 3',
              },
            ],
          },
        },
      };

      const result = await mcpToDapMapper.mapToolCall(toolCall, mockSession);

      expect(result.requiresResponse).toBe(true);
      expect(result.dapRequests).toHaveLength(1);
      expect(result.dapRequests[0]).toMatchObject({
        type: 'request',
        command: 'setBreakpoints',
        arguments: {
          source: {
            name: 'file.js',
            path: '/path/to/file.js',
          },
          breakpoints: [
            {
              line: 10,
              condition: 'x > 5',
            },
            {
              line: 20,
              hitCondition: '> 3',
            },
          ],
        },
      });
    });

    it('should map step commands correctly', async () => {
      const stepOverCall: McpToolCallRequest = {
        jsonrpc: '2.0',
        id: 'test-3',
        method: 'tools/call',
        params: {
          name: 'debug/stepOver',
          arguments: {
            threadId: 1,
            granularity: 'line',
          },
        },
      };

      const result = await mcpToDapMapper.mapToolCall(stepOverCall, mockSession);

      expect(result.dapRequests[0]).toMatchObject({
        command: 'next',
        arguments: {
          threadId: 1,
          granularity: 'line',
        },
      });
    });

    it('should throw error for unsupported tool', async () => {
      const toolCall: McpToolCallRequest = {
        jsonrpc: '2.0',
        id: 'test-4',
        method: 'tools/call',
        params: {
          name: 'debug/unsupportedTool',
          arguments: {},
        },
      };

      await expect(mcpToDapMapper.mapToolCall(toolCall, mockSession)).rejects.toThrow(RixaError);
      await expect(mcpToDapMapper.mapToolCall(toolCall, mockSession)).rejects.toThrow(
        'Unsupported tool: debug/unsupportedTool'
      );
    });

    it('should validate required parameters', async () => {
      const toolCall: McpToolCallRequest = {
        jsonrpc: '2.0',
        id: 'test-5',
        method: 'tools/call',
        params: {
          name: 'debug/continue',
          arguments: {}, // Missing threadId
        },
      };

      await expect(mcpToDapMapper.mapToolCall(toolCall, mockSession)).rejects.toThrow(RixaError);
      await expect(mcpToDapMapper.mapToolCall(toolCall, mockSession)).rejects.toThrow(
        'threadId is required'
      );
    });
  });
});

describe('Event Mappers', () => {
  let dapToMcpMapper: DapToMcpMapper;

  beforeEach(() => {
    dapToMcpMapper = new DapToMcpMapper(mockLogger);
  });

  describe('DapToMcpMapper', () => {
    it('should map stopped event correctly', () => {
      const dapEvent: DapEvent = {
        seq: 10,
        type: 'event',
        event: 'stopped',
        body: {
          reason: 'breakpoint',
          description: 'Paused on breakpoint',
          threadId: 1,
          allThreadsStopped: true,
          hitBreakpointIds: [1, 2],
        },
      };

      const result = dapToMcpMapper.mapEvent(dapEvent, 'test-session');

      expect(result.mcpNotifications).toHaveLength(1);
      expect(result.mcpNotifications[0]).toMatchObject({
        method: 'notifications/debug/stopped',
        params: {
          sessionId: 'test-session',
          reason: 'breakpoint',
          description: 'Paused on breakpoint',
          threadId: 1,
          allThreadsStopped: true,
          hitBreakpointIds: [1, 2],
        },
      });
    });

    it('should map output event correctly', () => {
      const dapEvent: DapEvent = {
        seq: 11,
        type: 'event',
        event: 'output',
        body: {
          category: 'stdout',
          output: 'Hello, World!\n',
          line: 5,
          column: 1,
        },
      };

      const result = dapToMcpMapper.mapEvent(dapEvent, 'test-session');

      expect(result.mcpNotifications).toHaveLength(1);
      expect(result.mcpNotifications[0]).toMatchObject({
        method: 'notifications/debug/output',
        params: {
          sessionId: 'test-session',
          category: 'stdout',
          output: 'Hello, World!\n',
          line: 5,
          column: 1,
        },
      });
    });

    it('should map thread event correctly', () => {
      const dapEvent: DapEvent = {
        seq: 12,
        type: 'event',
        event: 'thread',
        body: {
          reason: 'started',
          threadId: 2,
        },
      };

      const result = dapToMcpMapper.mapEvent(dapEvent, 'test-session');

      expect(result.mcpNotifications).toHaveLength(1);
      expect(result.mcpNotifications[0]).toMatchObject({
        method: 'notifications/debug/thread',
        params: {
          sessionId: 'test-session',
          reason: 'started',
          threadId: 2,
        },
      });
    });

    it('should handle unknown events gracefully', () => {
      const dapEvent: DapEvent = {
        seq: 13,
        type: 'event',
        event: 'unknownEvent',
        body: {
          customData: 'test',
        },
      };

      const result = dapToMcpMapper.mapEvent(dapEvent, 'test-session');

      expect(result.mcpNotifications).toHaveLength(1);
      expect(result.mcpNotifications[0]).toMatchObject({
        method: 'notifications/debug/event',
        params: {
          sessionId: 'test-session',
          eventType: 'unknownEvent',
          data: {
            customData: 'test',
          },
        },
      });
    });
  });
});

describe('Response Mappers', () => {
  let responseMapper: DapResponseMapper;

  beforeEach(() => {
    responseMapper = new DapResponseMapper(mockLogger);
  });

  describe('DapResponseMapper', () => {
    it('should map threads response correctly', () => {
      const dapResponse: DapResponse = {
        seq: 20,
        type: 'response',
        request_seq: 10,
        success: true,
        command: 'threads',
        body: {
          threads: [
            { id: 1, name: 'Main Thread' },
            { id: 2, name: 'Worker Thread' },
          ],
        },
      };

      const originalToolCall: McpToolCallRequest = {
        jsonrpc: '2.0',
        id: 'test-threads',
        method: 'tools/call',
        params: {
          name: 'debug/getThreads',
          arguments: { sessionId: 'test-session' },
        },
      };

      const result = responseMapper.mapResponse(dapResponse, originalToolCall, 'test-session');

      expect(result).toMatchObject({
        jsonrpc: '2.0',
        id: 'test-threads',
        result: {
          content: [
            {
              type: 'text',
              text: expect.stringContaining('Main Thread'),
            },
          ],
        },
      });
    });

    it('should map error response correctly', () => {
      const dapResponse: DapResponse = {
        seq: 21,
        type: 'response',
        request_seq: 11,
        success: false,
        command: 'evaluate',
        message: 'Unable to evaluate expression',
      };

      const originalToolCall: McpToolCallRequest = {
        jsonrpc: '2.0',
        id: 'test-evaluate',
        method: 'tools/call',
        params: {
          name: 'debug/evaluate',
          arguments: { sessionId: 'test-session', expression: 'invalidVar' },
        },
      };

      const result = responseMapper.mapResponse(dapResponse, originalToolCall, 'test-session');

      expect(result).toMatchObject({
        jsonrpc: '2.0',
        id: 'test-evaluate',
        result: {
          content: [
            {
              type: 'text',
              text: 'Error: Unable to evaluate expression',
            },
          ],
          isError: true,
        },
      });
    });

    it('should handle generic success responses', () => {
      const dapResponse: DapResponse = {
        seq: 22,
        type: 'response',
        request_seq: 12,
        success: true,
        command: 'continue',
      };

      const originalToolCall: McpToolCallRequest = {
        jsonrpc: '2.0',
        id: 'test-continue',
        method: 'tools/call',
        params: {
          name: 'debug/continue',
          arguments: { sessionId: 'test-session', threadId: 1 },
        },
      };

      const result = responseMapper.mapResponse(dapResponse, originalToolCall, 'test-session');

      expect(result).toMatchObject({
        jsonrpc: '2.0',
        id: 'test-continue',
        result: {
          content: [
            {
              type: 'text',
              text: 'Command debug/continue executed successfully',
            },
          ],
        },
      });
    });
  });
});
