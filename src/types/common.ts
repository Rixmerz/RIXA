import { z } from 'zod';

/**
 * Common error types for the application
 */
export enum ErrorType {
  VALIDATION_ERROR = 'validation_error',
  UNSUPPORTED_OPERATION = 'unsupported_operation',
  TIMEOUT = 'timeout',
  ADAPTER_ERROR = 'adapter_error',
  INTERNAL_ERROR = 'internal_error',
  AUTH_ERROR = 'auth_error',
  FILESYSTEM_ERROR = 'filesystem_error',
}

/**
 * Base error schema
 */
export const BaseErrorSchema = z.object({
  type: z.nativeEnum(ErrorType),
  message: z.string(),
  code: z.string().optional(),
  details: z.record(z.unknown()).optional(),
  requestId: z.string().optional(),
  sessionId: z.string().optional(),
});

/**
 * Session identifier schema
 */
export const SessionIdSchema = z.string().uuid();

/**
 * Request identifier schema
 */
export const RequestIdSchema = z.string().uuid();

/**
 * Correlation context for logging and tracing
 */
export const CorrelationContextSchema = z.object({
  requestId: RequestIdSchema,
  sessionId: SessionIdSchema.optional(),
  dapSeq: z.number().int().optional(),
  timestamp: z.string().datetime(),
});

// Type exports
export type BaseError = z.infer<typeof BaseErrorSchema>;
export type SessionId = z.infer<typeof SessionIdSchema>;
export type RequestId = z.infer<typeof RequestIdSchema>;
export type CorrelationContext = z.infer<typeof CorrelationContextSchema>;

/**
 * Custom error class with structured error information
 */
export class RixaError extends Error {
  public readonly type: ErrorType;
  public readonly code?: string | undefined;
  public readonly details?: Record<string, unknown> | undefined;
  public readonly requestId?: string | undefined;
  public readonly sessionId?: string | undefined;

  constructor(
    type: ErrorType,
    message: string,
    options?: {
      code?: string;
      details?: Record<string, unknown>;
      requestId?: string;
      sessionId?: string;
      cause?: Error;
    }
  ) {
    super(message);
    this.name = 'RixaError';
    this.type = type;
    this.code = options?.code;
    this.details = options?.details;
    this.requestId = options?.requestId;
    this.sessionId = options?.sessionId;

    if (options?.cause) {
      this.cause = options.cause;
    }
  }

  toJSON(): BaseError {
    return {
      type: this.type,
      message: this.message,
      code: this.code,
      details: this.details,
      requestId: this.requestId,
      sessionId: this.sessionId,
    };
  }
}
