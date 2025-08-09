import { v4 as uuidv4 } from 'uuid';
import type { CorrelationContext, RequestId, SessionId } from '@/types/common.js';

/**
 * Generate a new request ID
 */
export function generateRequestId(): RequestId {
  return uuidv4();
}

/**
 * Generate a new session ID
 */
export function generateSessionId(): SessionId {
  return uuidv4();
}

/**
 * Create a correlation context with current timestamp
 */
export function createCorrelationContext(
  requestId: RequestId,
  sessionId?: SessionId,
  dapSeq?: number
): CorrelationContext {
  return {
    requestId,
    sessionId,
    dapSeq,
    timestamp: new Date().toISOString(),
  };
}

/**
 * Extract correlation context from headers or other sources
 */
export function extractCorrelationContext(headers: Record<string, string>): {
  requestId?: RequestId | undefined;
  sessionId?: SessionId | undefined;
} {
  const requestId = headers['x-request-id'] as RequestId | undefined;
  const sessionId = headers['x-session-id'] as SessionId | undefined;

  const result: { requestId?: RequestId | undefined; sessionId?: SessionId | undefined } = {};
  if (requestId) result.requestId = requestId;
  if (sessionId) result.sessionId = sessionId;

  return result;
}
