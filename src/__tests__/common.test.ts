import { describe, it, expect } from 'vitest';
import { RixaError, ErrorType } from '@/types/common.js';
import {
  generateRequestId,
  generateSessionId,
  createCorrelationContext,
} from '@/utils/correlation.js';

describe('Common Types and Utilities', () => {
  describe('RixaError', () => {
    it('should create error with basic properties', () => {
      const error = new RixaError(ErrorType.VALIDATION_ERROR, 'Test error message');

      expect(error.name).toBe('RixaError');
      expect(error.type).toBe(ErrorType.VALIDATION_ERROR);
      expect(error.message).toBe('Test error message');
      expect(error.code).toBeUndefined();
      expect(error.details).toBeUndefined();
    });

    it('should create error with all optional properties', () => {
      const requestId = generateRequestId();
      const sessionId = generateSessionId();
      const details = { field: 'value', count: 42 };

      const error = new RixaError(ErrorType.ADAPTER_ERROR, 'Detailed error', {
        code: 'ADAPTER_FAILED',
        details,
        requestId,
        sessionId,
      });

      expect(error.type).toBe(ErrorType.ADAPTER_ERROR);
      expect(error.message).toBe('Detailed error');
      expect(error.code).toBe('ADAPTER_FAILED');
      expect(error.details).toEqual(details);
      expect(error.requestId).toBe(requestId);
      expect(error.sessionId).toBe(sessionId);
    });

    it('should create error with cause', () => {
      const originalError = new Error('Original error');
      const error = new RixaError(ErrorType.INTERNAL_ERROR, 'Wrapped error', {
        cause: originalError,
      });

      expect(error.cause).toBe(originalError);
    });

    it('should serialize to JSON correctly', () => {
      const requestId = generateRequestId();
      const error = new RixaError(ErrorType.TIMEOUT, 'Operation timed out', {
        code: 'TIMEOUT_EXCEEDED',
        details: { timeout: 5000 },
        requestId,
      });

      const json = error.toJSON();

      expect(json).toEqual({
        type: ErrorType.TIMEOUT,
        message: 'Operation timed out',
        code: 'TIMEOUT_EXCEEDED',
        details: { timeout: 5000 },
        requestId,
        sessionId: undefined,
      });
    });
  });

  describe('Correlation utilities', () => {
    it('should generate valid UUIDs for request and session IDs', () => {
      const requestId = generateRequestId();
      const sessionId = generateSessionId();

      // UUID v4 format: xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx
      const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

      expect(requestId).toMatch(uuidRegex);
      expect(sessionId).toMatch(uuidRegex);
      expect(requestId).not.toBe(sessionId);
    });

    it('should create correlation context with timestamp', () => {
      const requestId = generateRequestId();
      const sessionId = generateSessionId();
      const dapSeq = 42;

      const context = createCorrelationContext(requestId, sessionId, dapSeq);

      expect(context.requestId).toBe(requestId);
      expect(context.sessionId).toBe(sessionId);
      expect(context.dapSeq).toBe(dapSeq);
      expect(context.timestamp).toMatch(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/);
    });

    it('should create correlation context with minimal parameters', () => {
      const requestId = generateRequestId();

      const context = createCorrelationContext(requestId);

      expect(context.requestId).toBe(requestId);
      expect(context.sessionId).toBeUndefined();
      expect(context.dapSeq).toBeUndefined();
      expect(context.timestamp).toBeDefined();
    });
  });

  describe('ErrorType enum', () => {
    it('should have all expected error types', () => {
      expect(ErrorType.VALIDATION_ERROR).toBe('validation_error');
      expect(ErrorType.UNSUPPORTED_OPERATION).toBe('unsupported_operation');
      expect(ErrorType.TIMEOUT).toBe('timeout');
      expect(ErrorType.ADAPTER_ERROR).toBe('adapter_error');
      expect(ErrorType.INTERNAL_ERROR).toBe('internal_error');
      expect(ErrorType.AUTH_ERROR).toBe('auth_error');
      expect(ErrorType.FILESYSTEM_ERROR).toBe('filesystem_error');
    });
  });
});
