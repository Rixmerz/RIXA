import type { Logger } from '@/utils/logger.js';
import { ErrorType, RixaError } from '@/types/common.js';
import type { McpToolCallRequest, McpToolCallResponse } from '@/types/mcp.js';
import type { DapRequest, DapResponse, DapEvent } from '@/types/dap.js';
import type { DebugSession } from './session.js';

/**
 * Command mapping result
 */
export interface CommandMappingResult {
  dapRequests: DapRequest[];
  requiresResponse: boolean;
}

/**
 * Event mapping result
 */
export interface EventMappingResult {
  mcpNotifications: Array<{
    method: string;
    params: Record<string, unknown>;
  }>;
}

/**
 * MCP to DAP command mapper
 */
export class McpToDapMapper {
  constructor(private logger: Logger) {}

  /**
   * Map MCP tool call to DAP request(s)
   */
  async mapToolCall(
    toolCall: McpToolCallRequest,
    session: DebugSession
  ): Promise<CommandMappingResult> {
    const toolName = toolCall.params.name;
    const args = toolCall.params.arguments || {};

    this.logger.debug('Mapping MCP tool call to DAP', {
      sessionId: session.id,
      toolName,
      args,
    });

    switch (toolName) {
      case 'debug/continue':
        return this.mapContinue(args);

      case 'debug/pause':
        return this.mapPause(args);

      case 'debug/stepOver':
      case 'debug/next':
        return this.mapStepOver(args);

      case 'debug/stepIn':
        return this.mapStepIn(args);

      case 'debug/stepOut':
        return this.mapStepOut(args);

      case 'debug/setBreakpoints':
        return this.mapSetBreakpoints(args);

      case 'debug/getThreads':
        return this.mapGetThreads();

      case 'debug/getStackTrace':
        return this.mapGetStackTrace(args);

      case 'debug/getScopes':
        return this.mapGetScopes(args);

      case 'debug/getVariables':
        return this.mapGetVariables(args);

      case 'debug/evaluate':
        return this.mapEvaluate(args);

      case 'debug/terminate':
        return this.mapTerminate();

      // Enhanced tools are handled directly in integration layer
      case 'debug/getEnhancedStackTrace':
      case 'debug/getEnhancedVariables':
      case 'debug/evaluateEnhanced':
        throw new RixaError(
          ErrorType.UNSUPPORTED_OPERATION,
          `Enhanced tool ${toolName} should be handled directly`,
          {
            details: {
              toolName,
              message:
                'Enhanced tools bypass DAP mapping and are handled directly by EnhancedDebugTools',
            },
          }
        );

      default:
        throw new RixaError(ErrorType.UNSUPPORTED_OPERATION, `Unsupported tool: ${toolName}`, {
          details: {
            toolName,
            availableTools: [
              'debug/continue',
              'debug/pause',
              'debug/stepOver',
              'debug/stepIn',
              'debug/stepOut',
              'debug/setBreakpoints',
              'debug/getThreads',
              'debug/getStackTrace',
              'debug/getScopes',
              'debug/getVariables',
              'debug/evaluate',
              'debug/terminate',
              'debug/getEnhancedStackTrace',
              'debug/getEnhancedVariables',
              'debug/evaluateEnhanced',
            ],
          },
        });
    }
  }

  private mapContinue(args: Record<string, unknown>): CommandMappingResult {
    const threadId = args['threadId'] as number;
    if (typeof threadId !== 'number') {
      throw new RixaError(ErrorType.VALIDATION_ERROR, 'threadId is required for continue command');
    }

    return {
      dapRequests: [
        {
          seq: 0, // Will be set by DAP client
          type: 'request',
          command: 'continue',
          arguments: {
            threadId,
            singleThread: args['singleThread'] as boolean,
          },
        },
      ],
      requiresResponse: true,
    };
  }

  private mapPause(args: Record<string, unknown>): CommandMappingResult {
    const threadId = args['threadId'] as number;
    if (typeof threadId !== 'number') {
      throw new RixaError(ErrorType.VALIDATION_ERROR, 'threadId is required for pause command');
    }

    return {
      dapRequests: [
        {
          seq: 0,
          type: 'request',
          command: 'pause',
          arguments: { threadId },
        },
      ],
      requiresResponse: true,
    };
  }

  private mapStepOver(args: Record<string, unknown>): CommandMappingResult {
    const threadId = args['threadId'] as number;
    if (typeof threadId !== 'number') {
      throw new RixaError(ErrorType.VALIDATION_ERROR, 'threadId is required for stepOver command');
    }

    return {
      dapRequests: [
        {
          seq: 0,
          type: 'request',
          command: 'next',
          arguments: {
            threadId,
            singleThread: args['singleThread'] as boolean,
            granularity: (args['granularity'] as 'statement' | 'line' | 'instruction') || 'line',
          },
        },
      ],
      requiresResponse: true,
    };
  }

  private mapStepIn(args: Record<string, unknown>): CommandMappingResult {
    const threadId = args['threadId'] as number;
    if (typeof threadId !== 'number') {
      throw new RixaError(ErrorType.VALIDATION_ERROR, 'threadId is required for stepIn command');
    }

    return {
      dapRequests: [
        {
          seq: 0,
          type: 'request',
          command: 'stepIn',
          arguments: {
            threadId,
            singleThread: args['singleThread'] as boolean,
            targetId: args['targetId'] as number,
            granularity: (args['granularity'] as 'statement' | 'line' | 'instruction') || 'line',
          },
        },
      ],
      requiresResponse: true,
    };
  }

  private mapStepOut(args: Record<string, unknown>): CommandMappingResult {
    const threadId = args['threadId'] as number;
    if (typeof threadId !== 'number') {
      throw new RixaError(ErrorType.VALIDATION_ERROR, 'threadId is required for stepOut command');
    }

    return {
      dapRequests: [
        {
          seq: 0,
          type: 'request',
          command: 'stepOut',
          arguments: {
            threadId,
            singleThread: args['singleThread'] as boolean,
            granularity: (args['granularity'] as 'statement' | 'line' | 'instruction') || 'line',
          },
        },
      ],
      requiresResponse: true,
    };
  }

  private mapSetBreakpoints(args: Record<string, unknown>): CommandMappingResult {
    const source = args['source'] as { path: string; name?: string };
    const breakpoints = args['breakpoints'] as Array<{
      line: number;
      column?: number;
      condition?: string;
      hitCondition?: string;
      logMessage?: string;
    }>;

    if (!source?.path) {
      throw new RixaError(ErrorType.VALIDATION_ERROR, 'source.path is required for setBreakpoints');
    }

    if (!Array.isArray(breakpoints)) {
      throw new RixaError(ErrorType.VALIDATION_ERROR, 'breakpoints array is required');
    }

    return {
      dapRequests: [
        {
          seq: 0,
          type: 'request',
          command: 'setBreakpoints',
          arguments: {
            source: {
              name: source.name || source.path.split('/').pop(),
              path: source.path,
            },
            breakpoints,
            sourceModified: args['sourceModified'] as boolean,
          },
        },
      ],
      requiresResponse: true,
    };
  }

  private mapGetThreads(): CommandMappingResult {
    return {
      dapRequests: [
        {
          seq: 0,
          type: 'request',
          command: 'threads',
        },
      ],
      requiresResponse: true,
    };
  }

  private mapGetStackTrace(args: Record<string, unknown>): CommandMappingResult {
    const threadId = args['threadId'] as number;
    if (typeof threadId !== 'number') {
      throw new RixaError(
        ErrorType.VALIDATION_ERROR,
        'threadId is required for getStackTrace command'
      );
    }

    return {
      dapRequests: [
        {
          seq: 0,
          type: 'request',
          command: 'stackTrace',
          arguments: {
            threadId,
            startFrame: args['startFrame'] as number,
            levels: args['levels'] as number,
            format: args['format'] as Record<string, unknown>,
          },
        },
      ],
      requiresResponse: true,
    };
  }

  private mapGetScopes(args: Record<string, unknown>): CommandMappingResult {
    const frameId = args['frameId'] as number;
    if (typeof frameId !== 'number') {
      throw new RixaError(ErrorType.VALIDATION_ERROR, 'frameId is required for getScopes command');
    }

    return {
      dapRequests: [
        {
          seq: 0,
          type: 'request',
          command: 'scopes',
          arguments: { frameId },
        },
      ],
      requiresResponse: true,
    };
  }

  private mapGetVariables(args: Record<string, unknown>): CommandMappingResult {
    const variablesReference = args['variablesReference'] as number;
    if (typeof variablesReference !== 'number') {
      throw new RixaError(
        ErrorType.VALIDATION_ERROR,
        'variablesReference is required for getVariables command'
      );
    }

    return {
      dapRequests: [
        {
          seq: 0,
          type: 'request',
          command: 'variables',
          arguments: {
            variablesReference,
            filter: args['filter'] as 'indexed' | 'named',
            start: args['start'] as number,
            count: args['count'] as number,
            format: args['format'] as Record<string, unknown>,
          },
        },
      ],
      requiresResponse: true,
    };
  }

  private mapEvaluate(args: Record<string, unknown>): CommandMappingResult {
    const expression = args['expression'] as string;
    if (typeof expression !== 'string') {
      throw new RixaError(
        ErrorType.VALIDATION_ERROR,
        'expression is required for evaluate command'
      );
    }

    return {
      dapRequests: [
        {
          seq: 0,
          type: 'request',
          command: 'evaluate',
          arguments: {
            expression,
            frameId: args['frameId'] as number,
            context: (args['context'] as 'watch' | 'repl' | 'hover' | 'clipboard') || 'repl',
            format: args['format'] as Record<string, unknown>,
          },
        },
      ],
      requiresResponse: true,
    };
  }

  private mapTerminate(): CommandMappingResult {
    return {
      dapRequests: [
        {
          seq: 0,
          type: 'request',
          command: 'terminate',
          arguments: {
            restart: false,
          },
        },
      ],
      requiresResponse: true,
    };
  }
}

/**
 * DAP to MCP event mapper
 */
export class DapToMcpMapper {
  constructor(private logger: Logger) {}

  /**
   * Map DAP event to MCP notification(s)
   */
  mapEvent(event: DapEvent, sessionId: string): EventMappingResult {
    this.logger.debug('Mapping DAP event to MCP', {
      sessionId,
      eventType: event.event,
      body: event.body,
    });

    switch (event.event) {
      case 'stopped':
        return this.mapStoppedEvent(event, sessionId);

      case 'output':
        return this.mapOutputEvent(event, sessionId);

      case 'thread':
        return this.mapThreadEvent(event, sessionId);

      case 'breakpoint':
        return this.mapBreakpointEvent(event, sessionId);

      case 'terminated':
        return this.mapTerminatedEvent(event, sessionId);

      case 'exited':
        return this.mapExitedEvent(event, sessionId);

      case 'continued':
        return this.mapContinuedEvent(event, sessionId);

      case 'initialized':
        return this.mapInitializedEvent(event, sessionId);

      case 'capabilities':
        return this.mapCapabilitiesEvent(event, sessionId);

      default:
        // Forward unknown events as generic notifications
        return {
          mcpNotifications: [
            {
              method: 'notifications/debug/event',
              params: {
                sessionId,
                eventType: event.event,
                data: event.body,
                timestamp: new Date().toISOString(),
              },
            },
          ],
        };
    }
  }

  private mapStoppedEvent(event: DapEvent, sessionId: string): EventMappingResult {
    const body = event.body as {
      reason: string;
      description?: string;
      threadId?: number;
      preserveFocusHint?: boolean;
      text?: string;
      allThreadsStopped?: boolean;
      hitBreakpointIds?: number[];
    };

    return {
      mcpNotifications: [
        {
          method: 'notifications/debug/stopped',
          params: {
            sessionId,
            reason: body.reason,
            description: body.description,
            threadId: body.threadId,
            text: body.text,
            allThreadsStopped: body.allThreadsStopped,
            hitBreakpointIds: body.hitBreakpointIds,
            timestamp: new Date().toISOString(),
          },
        },
      ],
    };
  }

  private mapOutputEvent(event: DapEvent, sessionId: string): EventMappingResult {
    const body = event.body as {
      category?: string;
      output: string;
      group?: string;
      variablesReference?: number;
      source?: unknown;
      line?: number;
      column?: number;
      data?: unknown;
    };

    return {
      mcpNotifications: [
        {
          method: 'notifications/debug/output',
          params: {
            sessionId,
            category: body.category || 'console',
            output: body.output,
            group: body.group,
            variablesReference: body.variablesReference,
            source: body.source,
            line: body.line,
            column: body.column,
            data: body.data,
            timestamp: new Date().toISOString(),
          },
        },
      ],
    };
  }

  private mapThreadEvent(event: DapEvent, sessionId: string): EventMappingResult {
    const body = event.body as {
      reason: 'started' | 'exited';
      threadId: number;
    };

    return {
      mcpNotifications: [
        {
          method: 'notifications/debug/thread',
          params: {
            sessionId,
            reason: body.reason,
            threadId: body.threadId,
            timestamp: new Date().toISOString(),
          },
        },
      ],
    };
  }

  private mapBreakpointEvent(event: DapEvent, sessionId: string): EventMappingResult {
    const body = event.body as {
      reason: 'changed' | 'new' | 'removed';
      breakpoint: {
        id?: number;
        verified: boolean;
        message?: string;
        source?: unknown;
        line?: number;
        column?: number;
        endLine?: number;
        endColumn?: number;
      };
    };

    return {
      mcpNotifications: [
        {
          method: 'notifications/debug/breakpoint',
          params: {
            sessionId,
            reason: body.reason,
            breakpoint: body.breakpoint,
            timestamp: new Date().toISOString(),
          },
        },
      ],
    };
  }

  private mapTerminatedEvent(event: DapEvent, sessionId: string): EventMappingResult {
    const body = event.body as {
      restart?: boolean;
    };

    return {
      mcpNotifications: [
        {
          method: 'notifications/debug/terminated',
          params: {
            sessionId,
            restart: body?.restart || false,
            timestamp: new Date().toISOString(),
          },
        },
      ],
    };
  }

  private mapExitedEvent(event: DapEvent, sessionId: string): EventMappingResult {
    const body = event.body as {
      exitCode: number;
    };

    return {
      mcpNotifications: [
        {
          method: 'notifications/debug/exited',
          params: {
            sessionId,
            exitCode: body.exitCode,
            timestamp: new Date().toISOString(),
          },
        },
      ],
    };
  }

  private mapContinuedEvent(event: DapEvent, sessionId: string): EventMappingResult {
    const body = event.body as {
      threadId: number;
      allThreadsContinued?: boolean;
    };

    return {
      mcpNotifications: [
        {
          method: 'notifications/debug/continued',
          params: {
            sessionId,
            threadId: body.threadId,
            allThreadsContinued: body.allThreadsContinued,
            timestamp: new Date().toISOString(),
          },
        },
      ],
    };
  }

  private mapInitializedEvent(_event: DapEvent, sessionId: string): EventMappingResult {
    return {
      mcpNotifications: [
        {
          method: 'notifications/debug/initialized',
          params: {
            sessionId,
            timestamp: new Date().toISOString(),
          },
        },
      ],
    };
  }

  private mapCapabilitiesEvent(event: DapEvent, sessionId: string): EventMappingResult {
    const body = event.body as {
      capabilities: Record<string, unknown>;
    };

    return {
      mcpNotifications: [
        {
          method: 'notifications/debug/capabilities',
          params: {
            sessionId,
            capabilities: body.capabilities,
            timestamp: new Date().toISOString(),
          },
        },
      ],
    };
  }
}

/**
 * Response mapper for converting DAP responses to MCP tool call responses
 */
export class DapResponseMapper {
  constructor(private logger: Logger) {}

  /**
   * Map DAP response to MCP tool call response
   */
  mapResponse(
    dapResponse: DapResponse,
    originalToolCall: McpToolCallRequest,
    sessionId: string
  ): McpToolCallResponse {
    const toolName = originalToolCall.params.name;

    this.logger.debug('Mapping DAP response to MCP', {
      sessionId,
      toolName,
      command: dapResponse.command,
      success: dapResponse.success,
    });

    if (!dapResponse.success) {
      return {
        jsonrpc: '2.0',
        id: originalToolCall.id!,
        result: {
          content: [
            {
              type: 'text',
              text: `Error: ${dapResponse.message || 'DAP command failed'}`,
            },
          ],
          isError: true,
        },
      };
    }

    switch (toolName) {
      case 'debug/getThreads':
        return this.mapThreadsResponse(dapResponse, originalToolCall);

      case 'debug/getStackTrace':
        return this.mapStackTraceResponse(dapResponse, originalToolCall);

      case 'debug/getScopes':
        return this.mapScopesResponse(dapResponse, originalToolCall);

      case 'debug/getVariables':
        return this.mapVariablesResponse(dapResponse, originalToolCall);

      case 'debug/evaluate':
        return this.mapEvaluateResponse(dapResponse, originalToolCall);

      case 'debug/setBreakpoints':
        return this.mapSetBreakpointsResponse(dapResponse, originalToolCall);

      default:
        // Generic success response for execution commands
        return {
          jsonrpc: '2.0',
          id: originalToolCall.id!,
          result: {
            content: [
              {
                type: 'text',
                text: `Command ${toolName} executed successfully`,
              },
            ],
          },
        };
    }
  }

  private mapThreadsResponse(
    dapResponse: DapResponse,
    originalToolCall: McpToolCallRequest
  ): McpToolCallResponse {
    const body = dapResponse.body as {
      threads: Array<{ id: number; name: string }>;
    };

    return {
      jsonrpc: '2.0',
      id: originalToolCall.id!,
      result: {
        content: [
          {
            type: 'text',
            text: JSON.stringify(body.threads, null, 2),
          },
        ],
      },
    };
  }

  private mapStackTraceResponse(
    dapResponse: DapResponse,
    originalToolCall: McpToolCallRequest
  ): McpToolCallResponse {
    const body = dapResponse.body as {
      stackFrames: Array<{
        id: number;
        name: string;
        source?: unknown;
        line: number;
        column: number;
        endLine?: number;
        endColumn?: number;
      }>;
      totalFrames?: number;
    };

    return {
      jsonrpc: '2.0',
      id: originalToolCall.id!,
      result: {
        content: [
          {
            type: 'text',
            text: JSON.stringify(
              {
                stackFrames: body.stackFrames,
                totalFrames: body.totalFrames,
              },
              null,
              2
            ),
          },
        ],
      },
    };
  }

  private mapScopesResponse(
    dapResponse: DapResponse,
    originalToolCall: McpToolCallRequest
  ): McpToolCallResponse {
    const body = dapResponse.body as {
      scopes: Array<{
        name: string;
        variablesReference: number;
        namedVariables?: number;
        indexedVariables?: number;
        expensive: boolean;
        source?: unknown;
        line?: number;
        column?: number;
        endLine?: number;
        endColumn?: number;
      }>;
    };

    return {
      jsonrpc: '2.0',
      id: originalToolCall.id!,
      result: {
        content: [
          {
            type: 'text',
            text: JSON.stringify(body.scopes, null, 2),
          },
        ],
      },
    };
  }

  private mapVariablesResponse(
    dapResponse: DapResponse,
    originalToolCall: McpToolCallRequest
  ): McpToolCallResponse {
    const body = dapResponse.body as {
      variables: Array<{
        name: string;
        value: string;
        type?: string;
        presentationHint?: unknown;
        evaluateName?: string;
        variablesReference: number;
        namedVariables?: number;
        indexedVariables?: number;
        memoryReference?: string;
      }>;
    };

    return {
      jsonrpc: '2.0',
      id: originalToolCall.id!,
      result: {
        content: [
          {
            type: 'text',
            text: JSON.stringify(body.variables, null, 2),
          },
        ],
      },
    };
  }

  private mapEvaluateResponse(
    dapResponse: DapResponse,
    originalToolCall: McpToolCallRequest
  ): McpToolCallResponse {
    const body = dapResponse.body as {
      result: string;
      type?: string;
      presentationHint?: unknown;
      variablesReference: number;
      namedVariables?: number;
      indexedVariables?: number;
      memoryReference?: string;
    };

    return {
      jsonrpc: '2.0',
      id: originalToolCall.id!,
      result: {
        content: [
          {
            type: 'text',
            text: `Result: ${body.result}${body.type ? ` (${body.type})` : ''}`,
          },
        ],
      },
    };
  }

  private mapSetBreakpointsResponse(
    dapResponse: DapResponse,
    originalToolCall: McpToolCallRequest
  ): McpToolCallResponse {
    const body = dapResponse.body as {
      breakpoints: Array<{
        id?: number;
        verified: boolean;
        message?: string;
        source?: unknown;
        line?: number;
        column?: number;
        endLine?: number;
        endColumn?: number;
      }>;
    };

    const verifiedCount = body.breakpoints.filter(bp => bp.verified).length;
    const totalCount = body.breakpoints.length;

    return {
      jsonrpc: '2.0',
      id: originalToolCall.id!,
      result: {
        content: [
          {
            type: 'text',
            text: `Set ${verifiedCount}/${totalCount} breakpoints successfully`,
          },
          {
            type: 'text',
            text: JSON.stringify(body.breakpoints, null, 2),
          },
        ],
      },
    };
  }
}
