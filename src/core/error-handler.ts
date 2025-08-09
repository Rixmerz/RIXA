import type { Logger } from '@/utils/logger.js';
import { ErrorType, RixaError } from '@/types/common.js';
import type { DebugSession } from './session.js';
import type { McpConnection } from '@/mcp/server.js';

/**
 * Error recovery strategy
 */
export interface ErrorRecoveryStrategy {
  name: string;
  canRecover: (error: RixaError, context: ErrorContext) => boolean;
  recover: (error: RixaError, context: ErrorContext) => Promise<RecoveryResult>;
  priority: number; // Higher priority strategies are tried first
}

/**
 * Error context information
 */
export interface ErrorContext {
  requestId: string;
  sessionId?: string;
  toolName?: string;
  connection?: McpConnection;
  session?: DebugSession;
  retryCount: number;
  originalArgs?: Record<string, unknown>;
  timestamp: Date;
}

/**
 * Recovery result
 */
export interface RecoveryResult {
  success: boolean;
  message: string;
  newError?: RixaError;
  shouldRetry?: boolean;
  retryDelay?: number; // milliseconds
  context?: Record<string, unknown>;
}

/**
 * Error statistics
 */
export interface ErrorStats {
  totalErrors: number;
  errorsByType: Record<ErrorType, number>;
  errorsByTool: Record<string, number>;
  recoveryAttempts: number;
  successfulRecoveries: number;
  lastError?: {
    type: ErrorType;
    message: string;
    timestamp: Date;
    context: Partial<ErrorContext>;
  };
}

/**
 * Advanced error handler with context and recovery capabilities
 */
export class AdvancedErrorHandler {
  private recoveryStrategies: ErrorRecoveryStrategy[] = [];
  private errorStats: ErrorStats = {
    totalErrors: 0,
    errorsByType: {} as Record<ErrorType, number>,
    errorsByTool: {},
    recoveryAttempts: 0,
    successfulRecoveries: 0,
  };

  constructor(private logger: Logger) {
    this.initializeDefaultStrategies();
  }

  /**
   * Handle an error with context and attempt recovery
   */
  async handleError(error: RixaError, context: ErrorContext): Promise<RecoveryResult> {
    this.recordError(error, context);

    this.logger.error('Handling error with context', {
      errorType: error.type,
      message: error.message,
      context: {
        requestId: context.requestId,
        sessionId: context.sessionId,
        toolName: context.toolName,
        retryCount: context.retryCount,
      },
      details: error.details,
    });

    // Try recovery strategies in priority order
    const sortedStrategies = this.recoveryStrategies.sort((a, b) => b.priority - a.priority);

    for (const strategy of sortedStrategies) {
      if (strategy.canRecover(error, context)) {
        this.logger.debug('Attempting recovery strategy', {
          strategy: strategy.name,
          errorType: error.type,
          requestId: context.requestId,
        });

        try {
          this.errorStats.recoveryAttempts++;
          const result = await strategy.recover(error, context);

          if (result.success) {
            this.errorStats.successfulRecoveries++;
            this.logger.info('Error recovery successful', {
              strategy: strategy.name,
              errorType: error.type,
              requestId: context.requestId,
              message: result.message,
            });
          }

          return result;
        } catch (recoveryError) {
          this.logger.warn('Recovery strategy failed', {
            strategy: strategy.name,
            errorType: error.type,
            requestId: context.requestId,
            recoveryError: recoveryError instanceof Error ? recoveryError.message : String(recoveryError),
          });
        }
      }
    }

    // No recovery possible
    return {
      success: false,
      message: `No recovery strategy available for ${error.type}: ${error.message}`,
    };
  }

  /**
   * Add a custom recovery strategy
   */
  addRecoveryStrategy(strategy: ErrorRecoveryStrategy): void {
    this.recoveryStrategies.push(strategy);
    this.logger.debug('Added recovery strategy', { name: strategy.name, priority: strategy.priority });
  }

  /**
   * Get error statistics
   */
  getErrorStats(): ErrorStats {
    return { ...this.errorStats };
  }

  /**
   * Reset error statistics
   */
  resetStats(): void {
    this.errorStats = {
      totalErrors: 0,
      errorsByType: {} as Record<ErrorType, number>,
      errorsByTool: {},
      recoveryAttempts: 0,
      successfulRecoveries: 0,
    };
  }

  /**
   * Create enhanced error with additional context
   */
  createEnhancedError(
    type: ErrorType,
    message: string,
    context: Partial<ErrorContext>,
    options?: {
      code?: string;
      details?: Record<string, unknown>;
      cause?: Error;
    }
  ): RixaError {
    return new RixaError(type, message, {
      code: options?.code,
      details: {
        ...options?.details,
        context: {
          requestId: context.requestId,
          sessionId: context.sessionId,
          toolName: context.toolName,
          retryCount: context.retryCount || 0,
          timestamp: context.timestamp || new Date(),
        },
      },
      requestId: context.requestId,
      sessionId: context.sessionId,
      cause: options?.cause,
    });
  }

  private recordError(error: RixaError, context: ErrorContext): void {
    this.errorStats.totalErrors++;

    // Count by error type
    this.errorStats.errorsByType[error.type] = (this.errorStats.errorsByType[error.type] || 0) + 1;

    // Count by tool
    if (context.toolName) {
      this.errorStats.errorsByTool[context.toolName] = (this.errorStats.errorsByTool[context.toolName] || 0) + 1;
    }

    // Record last error
    this.errorStats.lastError = {
      type: error.type,
      message: error.message,
      timestamp: context.timestamp,
      context: {
        requestId: context.requestId,
        sessionId: context.sessionId,
        toolName: context.toolName,
        retryCount: context.retryCount,
      },
    };
  }

  private initializeDefaultStrategies(): void {
    // Strategy 1: Session reconnection for adapter errors
    this.addRecoveryStrategy({
      name: 'session-reconnection',
      priority: 100,
      canRecover: (error, context) => {
        return error.type === ErrorType.ADAPTER_ERROR && 
               context.session && 
               context.retryCount < 2 &&
               (error.message.includes('not connected') || error.message.includes('connection lost'));
      },
      recover: async (error, context) => {
        if (!context.session) {
          return { success: false, message: 'No session available for reconnection' };
        }

        try {
          await context.session.reconnect();
          return {
            success: true,
            message: 'Session reconnected successfully',
            shouldRetry: true,
            retryDelay: 1000,
          };
        } catch (reconnectError) {
          return {
            success: false,
            message: `Failed to reconnect session: ${reconnectError instanceof Error ? reconnectError.message : String(reconnectError)}`,
          };
        }
      },
    });

    // Strategy 2: Timeout retry with exponential backoff
    this.addRecoveryStrategy({
      name: 'timeout-retry',
      priority: 80,
      canRecover: (error, context) => {
        return error.type === ErrorType.TIMEOUT && context.retryCount < 3;
      },
      recover: async (error, context) => {
        const delay = Math.min(1000 * Math.pow(2, context.retryCount), 10000);
        return {
          success: true,
          message: `Retrying after timeout (attempt ${context.retryCount + 1})`,
          shouldRetry: true,
          retryDelay: delay,
        };
      },
    });

    // Strategy 3: Validation error with parameter correction
    this.addRecoveryStrategy({
      name: 'parameter-correction',
      priority: 60,
      canRecover: (error, context) => {
        return error.type === ErrorType.VALIDATION_ERROR && 
               context.originalArgs &&
               context.retryCount === 0;
      },
      recover: async (error, context) => {
        // Attempt to correct common parameter issues
        if (error.message.includes('sessionId is required') && context.session) {
          return {
            success: true,
            message: 'Added missing sessionId parameter',
            shouldRetry: true,
            context: {
              correctedArgs: {
                ...context.originalArgs,
                sessionId: context.session.id,
              },
            },
          };
        }

        if (error.message.includes('threadId is required') && context.originalArgs) {
          return {
            success: true,
            message: 'Added default threadId parameter',
            shouldRetry: true,
            context: {
              correctedArgs: {
                ...context.originalArgs,
                threadId: 1, // Default to main thread
              },
            },
          };
        }

        return {
          success: false,
          message: 'No automatic parameter correction available',
        };
      },
    });

    // Strategy 4: Graceful degradation for unsupported operations
    this.addRecoveryStrategy({
      name: 'graceful-degradation',
      priority: 40,
      canRecover: (error, context) => {
        return error.type === ErrorType.UNSUPPORTED_OPERATION;
      },
      recover: async (error, context) => {
        return {
          success: true,
          message: `Operation ${context.toolName} not supported, providing fallback response`,
          context: {
            fallbackResponse: {
              content: [
                {
                  type: 'text',
                  text: `Operation ${context.toolName} is not supported by the current debug adapter. This is expected behavior.`,
                },
              ],
            },
          },
        };
      },
    });
  }
}
