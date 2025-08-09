import type { Logger } from '@/utils/logger.js';
import type { DebugSession } from './session.js';
import type { McpToolCallRequest, McpToolCallResponse } from '@/types/mcp.js';
import { ErrorType, RixaError } from '@/types/common.js';

/**
 * Variable information with enhanced details
 */
export interface EnhancedVariable {
  name: string;
  value: string;
  type?: string;
  kind?: 'local' | 'parameter' | 'field' | 'global' | 'static';
  scope?: string;
  variablesReference: number;
  hasChildren: boolean;
  children?: EnhancedVariable[];
  evaluateName?: string;
  memoryReference?: string;
  presentationHint?: {
    kind?:
      | 'property'
      | 'method'
      | 'class'
      | 'data'
      | 'event'
      | 'baseClass'
      | 'innerClass'
      | 'interface'
      | 'mostDerivedClass'
      | 'virtual'
      | 'dataBreakpoint';
    attributes?: (
      | 'static'
      | 'constant'
      | 'readOnly'
      | 'rawString'
      | 'hasObjectId'
      | 'canHaveObjectId'
      | 'hasSideEffects'
      | 'hasDataBreakpoint'
      | 'canHaveDataBreakpoint'
    )[];
    visibility?: 'public' | 'private' | 'protected' | 'internal' | 'final';
  };
}

/**
 * Stack frame with enhanced information
 */
export interface EnhancedStackFrame {
  id: number;
  name: string;
  source?: {
    name?: string;
    path?: string;
    sourceReference?: number;
    presentationHint?: 'normal' | 'emphasize' | 'deemphasize';
    origin?: string;
  };
  line: number;
  column: number;
  endLine?: number;
  endColumn?: number;
  canRestart?: boolean;
  instructionPointerReference?: string;
  moduleId?: string | number;
  presentationHint?: 'normal' | 'label' | 'subtle';
  scopes?: Array<{
    name: string;
    variablesReference: number;
    namedVariables?: number;
    indexedVariables?: number;
    expensive: boolean;
  }>;
}

/**
 * Expression evaluation result
 */
export interface EvaluationResult {
  result: string;
  type?: string;
  variablesReference: number;
  namedVariables?: number;
  indexedVariables?: number;
  memoryReference?: string;
  presentationHint?: {
    kind?:
      | 'property'
      | 'method'
      | 'class'
      | 'data'
      | 'event'
      | 'baseClass'
      | 'innerClass'
      | 'interface'
      | 'mostDerivedClass'
      | 'virtual'
      | 'dataBreakpoint';
    attributes?: string[];
    visibility?: 'public' | 'private' | 'protected' | 'internal' | 'final';
  };
  success: boolean;
  error?: string;
}

/**
 * Enhanced debugging tools with rich responses
 */
export class EnhancedDebugTools {
  constructor(private logger: Logger) {}

  /**
   * Get enhanced stack trace with scopes and variables
   */
  async getEnhancedStackTrace(
    session: DebugSession,
    threadId: number,
    includeScopes: boolean = true,
    includeVariables: boolean = false
  ): Promise<EnhancedStackFrame[]> {
    try {
      // Get stack trace
      const stackResponse = await session.sendRequest('stackTrace', {
        threadId,
        startFrame: 0,
        levels: 20,
      });

      const stackFrames = (stackResponse.body as any)?.stackFrames || [];
      const enhancedFrames: EnhancedStackFrame[] = [];

      for (const frame of stackFrames) {
        const enhancedFrame: EnhancedStackFrame = {
          id: frame.id,
          name: frame.name,
          source: frame.source,
          line: frame.line,
          column: frame.column,
          endLine: frame.endLine,
          endColumn: frame.endColumn,
          canRestart: frame.canRestart,
          instructionPointerReference: frame.instructionPointerReference,
          moduleId: frame.moduleId,
          presentationHint: frame.presentationHint,
        };

        if (includeScopes) {
          try {
            const scopesResponse = await session.sendRequest('scopes', {
              frameId: frame.id,
            });

            const scopes = (scopesResponse.body as any)?.scopes || [];
            enhancedFrame.scopes = scopes;

            if (includeVariables) {
              // Get variables for each scope
              for (const scope of scopes) {
                if (scope.variablesReference > 0) {
                  try {
                    const variablesResponse = await session.sendRequest('variables', {
                      variablesReference: scope.variablesReference,
                    });
                    scope.variables = (variablesResponse.body as any)?.variables || [];
                  } catch (error) {
                    this.logger.warn('Failed to get variables for scope', {
                      frameId: frame.id,
                      scopeName: scope.name,
                      error: error instanceof Error ? error.message : String(error),
                    });
                  }
                }
              }
            }
          } catch (error) {
            this.logger.warn('Failed to get scopes for frame', {
              frameId: frame.id,
              error: error instanceof Error ? error.message : String(error),
            });
          }
        }

        enhancedFrames.push(enhancedFrame);
      }

      return enhancedFrames;
    } catch (error) {
      throw new RixaError(ErrorType.ADAPTER_ERROR, 'Failed to get enhanced stack trace', {
        details: {
          threadId,
          cause: error instanceof Error ? error.message : String(error),
        },
      });
    }
  }

  /**
   * Get enhanced variables with hierarchy
   */
  async getEnhancedVariables(
    session: DebugSession,
    variablesReference: number,
    maxDepth: number = 3,
    currentDepth: number = 0
  ): Promise<EnhancedVariable[]> {
    if (currentDepth >= maxDepth) {
      return [];
    }

    try {
      const response = await session.sendRequest('variables', {
        variablesReference,
      });

      const variables = (response.body as any)?.variables || [];
      const enhancedVariables: EnhancedVariable[] = [];

      for (const variable of variables) {
        const enhanced: EnhancedVariable = {
          name: variable.name,
          value: variable.value,
          type: variable.type,
          variablesReference: variable.variablesReference,
          hasChildren: variable.variablesReference > 0,
          evaluateName: variable.evaluateName,
          memoryReference: variable.memoryReference,
          presentationHint: variable.presentationHint,
        };

        // Determine variable kind based on presentation hint or name patterns
        if (variable.presentationHint?.kind) {
          enhanced.kind = this.mapPresentationKindToVariableKind(variable.presentationHint.kind);
        } else {
          enhanced.kind = this.inferVariableKind(variable.name);
        }

        // Get children if they exist and we haven't reached max depth
        if (variable.variablesReference > 0 && currentDepth < maxDepth - 1) {
          try {
            enhanced.children = await this.getEnhancedVariables(
              session,
              variable.variablesReference,
              maxDepth,
              currentDepth + 1
            );
          } catch (error) {
            this.logger.warn('Failed to get child variables', {
              variableName: variable.name,
              variablesReference: variable.variablesReference,
              error: error instanceof Error ? error.message : String(error),
            });
            enhanced.children = [];
          }
        }

        enhancedVariables.push(enhanced);
      }

      return enhancedVariables;
    } catch (error) {
      throw new RixaError(ErrorType.ADAPTER_ERROR, 'Failed to get enhanced variables', {
        details: {
          variablesReference,
          cause: error instanceof Error ? error.message : String(error),
        },
      });
    }
  }

  /**
   * Evaluate expression with enhanced result
   */
  async evaluateExpression(
    session: DebugSession,
    expression: string,
    frameId?: number,
    context: 'watch' | 'repl' | 'hover' | 'clipboard' = 'repl'
  ): Promise<EvaluationResult> {
    try {
      const response = await session.sendRequest('evaluate', {
        expression,
        frameId,
        context,
      });

      const body = response.body as any;

      return {
        result: body?.result || '',
        type: body?.type,
        variablesReference: body?.variablesReference || 0,
        namedVariables: body?.namedVariables,
        indexedVariables: body?.indexedVariables,
        memoryReference: body?.memoryReference,
        presentationHint: body?.presentationHint,
        success: response.success,
      };
    } catch (error) {
      return {
        result: '',
        variablesReference: 0,
        success: false,
        error: error instanceof Error ? error.message : String(error),
      };
    }
  }

  /**
   * Create enhanced tool call response
   */
  createEnhancedResponse(
    toolCall: McpToolCallRequest,
    data: unknown,
    title: string
  ): McpToolCallResponse {
    return {
      jsonrpc: '2.0',
      id: toolCall.id!,
      result: {
        content: [
          {
            type: 'text',
            text: title,
          },
          {
            type: 'text',
            text: JSON.stringify(data, null, 2),
          },
        ],
      },
    };
  }

  private mapPresentationKindToVariableKind(
    kind: string
  ): 'local' | 'parameter' | 'field' | 'global' | 'static' {
    switch (kind) {
      case 'property':
      case 'field':
        return 'field';
      case 'method':
        return 'field';
      case 'data':
        return 'local';
      default:
        return 'local';
    }
  }

  private inferVariableKind(name: string): 'local' | 'parameter' | 'field' | 'global' | 'static' {
    // Common patterns for different variable kinds
    if (name.startsWith('this.') || name.startsWith('self.')) {
      return 'field';
    }
    if (name.startsWith('_') || name.toUpperCase() === name) {
      return 'static';
    }
    if (name.includes('::') || name.startsWith('global.')) {
      return 'global';
    }
    // Default to local for most variables
    return 'local';
  }
}
