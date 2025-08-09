import { describe, it, expect } from 'vitest';
import {
  DapRequestSchema,
  DapResponseSchema,
  DapEventSchema,
  DapInitializeRequestSchema,
  DapInitializeResponseSchema,
  DapSetBreakpointsRequestSchema,
  DapSetBreakpointsResponseSchema,
  DapStoppedEventSchema,
  DapOutputEventSchema,
} from '@/types/dap.js';

describe('DAP Schemas', () => {
  describe('Basic message schemas', () => {
    it('should validate DAP request', () => {
      const validRequest = {
        seq: 1,
        type: 'request',
        command: 'initialize',
        arguments: { adapterID: 'test' },
      };

      const result = DapRequestSchema.parse(validRequest);
      expect(result).toEqual(validRequest);
    });

    it('should validate DAP response', () => {
      const validResponse = {
        seq: 2,
        type: 'response',
        request_seq: 1,
        success: true,
        command: 'initialize',
        body: { supportsConfigurationDoneRequest: true },
      };

      const result = DapResponseSchema.parse(validResponse);
      expect(result).toEqual(validResponse);
    });

    it('should validate DAP event', () => {
      const validEvent = {
        seq: 3,
        type: 'event',
        event: 'stopped',
        body: { reason: 'breakpoint', threadId: 1 },
      };

      const result = DapEventSchema.parse(validEvent);
      expect(result).toEqual(validEvent);
    });

    it('should reject invalid message type', () => {
      const invalidMessage = {
        seq: 1,
        type: 'invalid',
        command: 'test',
      };

      expect(() => DapRequestSchema.parse(invalidMessage)).toThrow();
    });
  });

  describe('Initialize request/response', () => {
    it('should validate initialize request', () => {
      const validRequest = {
        seq: 1,
        type: 'request',
        command: 'initialize',
        arguments: {
          clientID: 'rixa',
          clientName: 'RIXA Debug Adapter',
          adapterID: 'node',
          pathFormat: 'path',
          linesStartAt1: true,
          columnsStartAt1: true,
          supportsVariableType: true,
          supportsVariablePaging: false,
          supportsRunInTerminalRequest: false,
          locale: 'en-US',
        },
      };

      const result = DapInitializeRequestSchema.parse(validRequest);
      expect(result).toEqual(validRequest);
    });

    it('should validate initialize response', () => {
      const validResponse = {
        seq: 2,
        type: 'response',
        request_seq: 1,
        success: true,
        command: 'initialize',
        body: {
          supportsConfigurationDoneRequest: true,
          supportsFunctionBreakpoints: false,
          supportsConditionalBreakpoints: true,
          supportsHitConditionalBreakpoints: false,
          supportsEvaluateForHovers: true,
          exceptionBreakpointFilters: [
            {
              filter: 'uncaught',
              label: 'Uncaught Exceptions',
              default: false,
            },
          ],
          supportsStepBack: false,
          supportsSetVariable: true,
          supportsRestartFrame: false,
          supportsGotoTargetsRequest: false,
          supportsStepInTargetsRequest: false,
          supportsCompletionsRequest: true,
          completionTriggerCharacters: ['.', '['],
          supportsModulesRequest: false,
          supportsRestartRequest: false,
          supportsExceptionOptions: false,
          supportsValueFormattingOptions: true,
          supportsExceptionInfoRequest: true,
          supportTerminateDebuggee: true,
          supportSuspendDebuggee: false,
          supportsDelayedStackTraceLoading: true,
          supportsLoadedSourcesRequest: false,
          supportsLogPoints: true,
          supportsTerminateThreadsRequest: false,
          supportsSetExpression: false,
          supportsTerminateRequest: true,
          supportsDataBreakpoints: false,
          supportsReadMemoryRequest: false,
          supportsWriteMemoryRequest: false,
          supportsDisassembleRequest: false,
          supportsCancelRequest: false,
          supportsBreakpointLocationsRequest: false,
          supportsClipboardContext: false,
          supportsSteppingGranularity: false,
          supportsInstructionBreakpoints: false,
          supportsExceptionFilterOptions: false,
        },
      };

      const result = DapInitializeResponseSchema.parse(validResponse);
      expect(result).toEqual(validResponse);
    });

    it('should validate minimal initialize request', () => {
      const minimalRequest = {
        seq: 1,
        type: 'request',
        command: 'initialize',
        arguments: {
          adapterID: 'node',
        },
      };

      const result = DapInitializeRequestSchema.parse(minimalRequest);
      expect(result.arguments.adapterID).toBe('node');
      expect(result.arguments.clientID).toBeUndefined();
    });
  });

  describe('Breakpoints schemas', () => {
    it('should validate setBreakpoints request', () => {
      const validRequest = {
        seq: 5,
        type: 'request',
        command: 'setBreakpoints',
        arguments: {
          source: {
            name: 'app.js',
            path: '/path/to/app.js',
          },
          lines: [10, 20, 30],
          breakpoints: [
            {
              line: 10,
              condition: 'x > 5',
            },
            {
              line: 20,
              hitCondition: '> 3',
            },
            {
              line: 30,
              logMessage: 'Value is {x}',
            },
          ],
          sourceModified: false,
        },
      };

      const result = DapSetBreakpointsRequestSchema.parse(validRequest);
      expect(result).toEqual(validRequest);
    });

    it('should validate setBreakpoints response', () => {
      const validResponse = {
        seq: 6,
        type: 'response',
        request_seq: 5,
        success: true,
        command: 'setBreakpoints',
        body: {
          breakpoints: [
            {
              id: 1,
              verified: true,
              line: 10,
            },
            {
              id: 2,
              verified: false,
              message: 'Breakpoint ignored because of missing line table',
              line: 20,
            },
            {
              id: 3,
              verified: true,
              line: 30,
            },
          ],
        },
      };

      const result = DapSetBreakpointsResponseSchema.parse(validResponse);
      expect(result).toEqual(validResponse);
    });
  });

  describe('Event schemas', () => {
    it('should validate stopped event', () => {
      const validEvent = {
        seq: 10,
        type: 'event',
        event: 'stopped',
        body: {
          reason: 'breakpoint',
          description: 'Paused on breakpoint',
          threadId: 1,
          preserveFocusHint: false,
          text: 'Breakpoint hit',
          allThreadsStopped: true,
          hitBreakpointIds: [1],
        },
      };

      const result = DapStoppedEventSchema.parse(validEvent);
      expect(result).toEqual(validEvent);
    });

    it('should validate output event', () => {
      const validEvent = {
        seq: 11,
        type: 'event',
        event: 'output',
        body: {
          category: 'stdout',
          output: 'Hello, World!\n',
          variablesReference: 0,
          line: 5,
          column: 1,
        },
      };

      const result = DapOutputEventSchema.parse(validEvent);
      expect(result).toEqual(validEvent);
    });

    it('should validate minimal stopped event', () => {
      const minimalEvent = {
        seq: 12,
        type: 'event',
        event: 'stopped',
        body: {
          reason: 'step',
        },
      };

      const result = DapStoppedEventSchema.parse(minimalEvent);
      expect(result.body.reason).toBe('step');
      expect(result.body.threadId).toBeUndefined();
    });

    it('should reject invalid stop reason', () => {
      const invalidEvent = {
        seq: 13,
        type: 'event',
        event: 'stopped',
        body: {
          reason: 'invalid-reason',
        },
      };

      expect(() => DapStoppedEventSchema.parse(invalidEvent)).toThrow();
    });
  });

  describe('Edge cases', () => {
    it('should handle optional arguments in requests', () => {
      const requestWithoutArgs = {
        seq: 20,
        type: 'request',
        command: 'threads',
      };

      const result = DapRequestSchema.parse(requestWithoutArgs);
      expect(result.arguments).toBeUndefined();
    });

    it('should handle optional body in responses', () => {
      const responseWithoutBody = {
        seq: 21,
        type: 'response',
        request_seq: 20,
        success: true,
        command: 'threads',
      };

      const result = DapResponseSchema.parse(responseWithoutBody);
      expect(result.body).toBeUndefined();
    });

    it('should handle error responses', () => {
      const errorResponse = {
        seq: 22,
        type: 'response',
        request_seq: 20,
        success: false,
        command: 'evaluate',
        message: 'Unable to evaluate expression',
      };

      const result = DapResponseSchema.parse(errorResponse);
      expect(result.success).toBe(false);
      expect(result.message).toBe('Unable to evaluate expression');
    });
  });
});
