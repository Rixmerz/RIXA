import { describe, it, expect, beforeEach, vi } from 'vitest';
import { EnhancedDebugTools } from '@/core/enhanced-tools.js';
import { createLogger } from '@/utils/logger.js';
import type { DebugSession } from '@/core/session.js';

// Mock logger for tests
const mockLogger = createLogger(
  { level: 'error', format: 'json', file: { enabled: false, path: '', maxSize: 0, maxFiles: 0 } },
  { requestId: 'enhanced-tools-test' }
);

describe('EnhancedDebugTools', () => {
  let enhancedTools: EnhancedDebugTools;
  let mockSession: DebugSession;

  beforeEach(() => {
    enhancedTools = new EnhancedDebugTools(mockLogger);

    // Mock debug session
    mockSession = {
      id: 'test-session',
      sendRequest: vi.fn(),
      state: 'running',
      adapter: 'node',
      program: '/test/program.js',
      args: [],
      cwd: '/test',
      env: {},
    } as any;
  });

  describe('getEnhancedStackTrace', () => {
    it('should get enhanced stack trace with scopes', async () => {
      const mockStackResponse = {
        success: true,
        body: {
          stackFrames: [
            {
              id: 1,
              name: 'main',
              source: { path: '/test/program.js', name: 'program.js' },
              line: 10,
              column: 5,
            },
            {
              id: 2,
              name: 'helper',
              source: { path: '/test/helper.js', name: 'helper.js' },
              line: 20,
              column: 10,
            },
          ],
        },
      };

      const mockScopesResponse = {
        success: true,
        body: {
          scopes: [
            {
              name: 'Local',
              variablesReference: 1,
              expensive: false,
            },
          ],
        },
      };

      vi.mocked(mockSession.sendRequest)
        .mockResolvedValueOnce(mockStackResponse)
        .mockResolvedValue(mockScopesResponse);

      const result = await enhancedTools.getEnhancedStackTrace(mockSession, 1, true, false);

      expect(result).toHaveLength(2);
      expect(result[0]).toMatchObject({
        id: 1,
        name: 'main',
        source: { path: '/test/program.js', name: 'program.js' },
        line: 10,
        column: 5,
        scopes: [
          {
            name: 'Local',
            variablesReference: 1,
            expensive: false,
          },
        ],
      });

      expect(mockSession.sendRequest).toHaveBeenCalledWith('stackTrace', {
        threadId: 1,
        startFrame: 0,
        levels: 20,
      });
    });

    it('should handle stack trace without scopes', async () => {
      const mockStackResponse = {
        success: true,
        body: {
          stackFrames: [
            {
              id: 1,
              name: 'main',
              source: { path: '/test/program.js', name: 'program.js' },
              line: 10,
              column: 5,
            },
          ],
        },
      };

      vi.mocked(mockSession.sendRequest).mockResolvedValueOnce(mockStackResponse);

      const result = await enhancedTools.getEnhancedStackTrace(mockSession, 1, false, false);

      expect(result).toHaveLength(1);
      expect(result[0]).toMatchObject({
        id: 1,
        name: 'main',
        source: { path: '/test/program.js', name: 'program.js' },
        line: 10,
        column: 5,
      });
      // When includeScopes is false, scopes property is not set
      expect(result[0].scopes).toBeUndefined();

      expect(mockSession.sendRequest).toHaveBeenCalledTimes(1);
    });
  });

  describe('getEnhancedVariables', () => {
    it('should get enhanced variables with hierarchy', async () => {
      const mockVariablesResponse = {
        success: true,
        body: {
          variables: [
            {
              name: 'myVar',
              value: 'test value',
              type: 'string',
              variablesReference: 0,
            },
            {
              name: 'myObject',
              value: '{...}',
              type: 'object',
              variablesReference: 2,
            },
          ],
        },
      };

      const mockChildVariablesResponse = {
        success: true,
        body: {
          variables: [
            {
              name: 'prop1',
              value: '42',
              type: 'number',
              variablesReference: 0,
            },
          ],
        },
      };

      vi.mocked(mockSession.sendRequest)
        .mockResolvedValueOnce(mockVariablesResponse)
        .mockResolvedValueOnce(mockChildVariablesResponse);

      const result = await enhancedTools.getEnhancedVariables(mockSession, 1, 2);

      expect(result).toHaveLength(2);
      expect(result[0]).toMatchObject({
        name: 'myVar',
        value: 'test value',
        type: 'string',
        variablesReference: 0,
        hasChildren: false,
      });
      // Variables without children don't have a children property
      expect(result[0].children).toBeUndefined();

      expect(result[1]).toMatchObject({
        name: 'myObject',
        value: '{...}',
        type: 'object',
        variablesReference: 2,
        hasChildren: true,
      });

      expect(result[1].children).toHaveLength(1);
      expect(result[1].children![0]).toMatchObject({
        name: 'prop1',
        value: '42',
        type: 'number',
        variablesReference: 0,
        hasChildren: false,
      });
    });

    it('should respect max depth limit', async () => {
      // When maxDepth is 0, the function returns empty array immediately
      const result = await enhancedTools.getEnhancedVariables(mockSession, 1, 0);

      expect(result).toHaveLength(0);
      expect(mockSession.sendRequest).not.toHaveBeenCalled();
    });
  });

  describe('evaluateExpression', () => {
    it('should evaluate expression with enhanced result', async () => {
      const mockEvaluateResponse = {
        success: true,
        body: {
          result: '42',
          type: 'number',
          variablesReference: 0,
          presentationHint: {
            kind: 'data',
            attributes: ['readOnly'],
          },
        },
      };

      vi.mocked(mockSession.sendRequest).mockResolvedValueOnce(mockEvaluateResponse);

      const result = await enhancedTools.evaluateExpression(
        mockSession,
        'myVariable + 10',
        1,
        'repl'
      );

      expect(result).toMatchObject({
        result: '42',
        type: 'number',
        variablesReference: 0,
        presentationHint: {
          kind: 'data',
          attributes: ['readOnly'],
        },
        success: true,
      });

      expect(mockSession.sendRequest).toHaveBeenCalledWith('evaluate', {
        expression: 'myVariable + 10',
        frameId: 1,
        context: 'repl',
      });
    });

    it('should handle evaluation errors', async () => {
      const mockEvaluateResponse = {
        success: false,
        body: {
          result: 'ReferenceError: myVariable is not defined',
          type: 'error',
          variablesReference: 0,
        },
      };

      vi.mocked(mockSession.sendRequest).mockResolvedValueOnce(mockEvaluateResponse);

      const result = await enhancedTools.evaluateExpression(
        mockSession,
        'myVariable',
        1,
        'hover'
      );

      expect(result).toMatchObject({
        result: 'ReferenceError: myVariable is not defined',
        type: 'error',
        variablesReference: 0,
        success: false,
      });
    });
  });
});
