import { describe, it, expect } from 'vitest';
import {
  McpRequestSchema,
  McpResponseSchema,
  McpNotificationSchema,
  McpInitializeRequestSchema,
  McpInitializeResponseSchema,
  McpResourcesListRequestSchema,
  McpResourcesListResponseSchema,
  McpToolCallRequestSchema,
  McpToolCallResponseSchema,
  MCP_VERSION,
} from '@/types/mcp.js';

describe('MCP Schemas', () => {
  describe('Basic message schemas', () => {
    it('should validate MCP request', () => {
      const validRequest = {
        jsonrpc: '2.0',
        id: 'test-123',
        method: 'test/method',
        params: { key: 'value' },
      };

      const result = McpRequestSchema.parse(validRequest);
      expect(result).toEqual(validRequest);
    });

    it('should validate MCP response with result', () => {
      const validResponse = {
        jsonrpc: '2.0',
        id: 'test-123',
        result: { data: 'success' },
      };

      const result = McpResponseSchema.parse(validResponse);
      expect(result).toEqual(validResponse);
    });

    it('should validate MCP response with error', () => {
      const validResponse = {
        jsonrpc: '2.0',
        id: 'test-123',
        error: {
          code: -32000,
          message: 'Internal error',
          data: { details: 'Something went wrong' },
        },
      };

      const result = McpResponseSchema.parse(validResponse);
      expect(result).toEqual(validResponse);
    });

    it('should validate MCP notification', () => {
      const validNotification = {
        jsonrpc: '2.0',
        method: 'notifications/progress',
        params: { progress: 50, total: 100 },
      };

      const result = McpNotificationSchema.parse(validNotification);
      expect(result).toEqual(validNotification);
    });

    it('should reject invalid jsonrpc version', () => {
      const invalidRequest = {
        jsonrpc: '1.0',
        id: 'test-123',
        method: 'test/method',
      };

      expect(() => McpRequestSchema.parse(invalidRequest)).toThrow();
    });
  });

  describe('Initialize request/response', () => {
    it('should validate initialize request', () => {
      const validRequest = {
        jsonrpc: '2.0',
        id: 'init-1',
        method: 'initialize',
        params: {
          protocolVersion: MCP_VERSION,
          capabilities: {
            resources: true,
            tools: true,
            prompts: false,
          },
          clientInfo: {
            name: 'Test Client',
            version: '1.0.0',
          },
        },
      };

      const result = McpInitializeRequestSchema.parse(validRequest);
      expect(result).toEqual(validRequest);
    });

    it('should validate initialize response', () => {
      const validResponse = {
        jsonrpc: '2.0',
        id: 'init-1',
        result: {
          protocolVersion: MCP_VERSION,
          capabilities: {
            resources: true,
            tools: true,
          },
          serverInfo: {
            name: 'RIXA Server',
            version: '0.1.0',
          },
        },
      };

      const result = McpInitializeResponseSchema.parse(validResponse);
      expect(result).toEqual(validResponse);
    });

    it('should reject initialize request with wrong method', () => {
      const invalidRequest = {
        jsonrpc: '2.0',
        id: 'init-1',
        method: 'wrong-method',
        params: {
          protocolVersion: MCP_VERSION,
          capabilities: {},
          clientInfo: { name: 'Test', version: '1.0.0' },
        },
      };

      expect(() => McpInitializeRequestSchema.parse(invalidRequest)).toThrow();
    });
  });

  describe('Resources schemas', () => {
    it('should validate resources list request', () => {
      const validRequest = {
        jsonrpc: '2.0',
        id: 'res-1',
        method: 'resources/list',
      };

      const result = McpResourcesListRequestSchema.parse(validRequest);
      expect(result).toEqual(validRequest);
    });

    it('should validate resources list response', () => {
      const validResponse = {
        jsonrpc: '2.0',
        id: 'res-1',
        result: {
          resources: [
            {
              uri: 'file:///path/to/file.js',
              name: 'file.js',
              description: 'JavaScript file',
              mimeType: 'application/javascript',
            },
            {
              uri: 'file:///path/to/data.json',
              name: 'data.json',
            },
          ],
        },
      };

      const result = McpResourcesListResponseSchema.parse(validResponse);
      expect(result).toEqual(validResponse);
    });
  });

  describe('Tools schemas', () => {
    it('should validate tool call request', () => {
      const validRequest = {
        jsonrpc: '2.0',
        id: 'tool-1',
        method: 'tools/call',
        params: {
          name: 'debug/setBreakpoint',
          arguments: {
            file: '/path/to/file.js',
            line: 42,
            condition: 'x > 10',
          },
        },
      };

      const result = McpToolCallRequestSchema.parse(validRequest);
      expect(result).toEqual(validRequest);
    });

    it('should validate tool call response', () => {
      const validResponse = {
        jsonrpc: '2.0',
        id: 'tool-1',
        result: {
          content: [
            {
              type: 'text',
              text: 'Breakpoint set successfully',
            },
          ],
          isError: false,
        },
      };

      const result = McpToolCallResponseSchema.parse(validResponse);
      expect(result).toEqual(validResponse);
    });

    it('should validate tool call response with error', () => {
      const validResponse = {
        jsonrpc: '2.0',
        id: 'tool-1',
        result: {
          content: [
            {
              type: 'text',
              text: 'Failed to set breakpoint: file not found',
            },
          ],
          isError: true,
        },
      };

      const result = McpToolCallResponseSchema.parse(validResponse);
      expect(result).toEqual(validResponse);
    });
  });

  describe('Edge cases', () => {
    it('should handle optional fields correctly', () => {
      const minimalRequest = {
        jsonrpc: '2.0',
        method: 'test/method',
      };

      const result = McpRequestSchema.parse(minimalRequest);
      expect(result.id).toBeUndefined();
      expect(result.params).toBeUndefined();
    });

    it('should handle numeric IDs', () => {
      const requestWithNumericId = {
        jsonrpc: '2.0',
        id: 42,
        method: 'test/method',
      };

      const result = McpRequestSchema.parse(requestWithNumericId);
      expect(result.id).toBe(42);
    });
  });
});
