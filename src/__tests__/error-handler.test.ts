import { describe, it, expect, beforeEach, vi } from 'vitest';
import { AdvancedErrorHandler, type ErrorContext, type ErrorRecoveryStrategy } from '@/core/error-handler.js';
import { ErrorType, RixaError } from '@/types/common.js';
import { createLogger } from '@/utils/logger.js';

// Mock logger for tests
const mockLogger = createLogger(
  { level: 'error', format: 'json', file: { enabled: false, path: '', maxSize: 0, maxFiles: 0 } },
  { requestId: 'error-handler-test' }
);

describe('AdvancedErrorHandler', () => {
  let errorHandler: AdvancedErrorHandler;
  let mockContext: ErrorContext;

  beforeEach(() => {
    errorHandler = new AdvancedErrorHandler(mockLogger);
    
    mockContext = {
      requestId: 'test-request-123',
      sessionId: 'test-session-456',
      toolName: 'debug/continue',
      retryCount: 0,
      timestamp: new Date(),
    };
  });

  describe('Error Recording', () => {
    it('should record error statistics', async () => {
      const error = new RixaError(ErrorType.TIMEOUT, 'Request timeout');
      
      await errorHandler.handleError(error, mockContext);
      
      const stats = errorHandler.getErrorStats();
      expect(stats.totalErrors).toBe(1);
      expect(stats.errorsByType[ErrorType.TIMEOUT]).toBe(1);
      expect(stats.errorsByTool['debug/continue']).toBe(1);
      expect(stats.lastError).toMatchObject({
        type: ErrorType.TIMEOUT,
        message: 'Request timeout',
      });
    });

    it('should accumulate error statistics', async () => {
      const error1 = new RixaError(ErrorType.TIMEOUT, 'First timeout');
      const error2 = new RixaError(ErrorType.TIMEOUT, 'Second timeout');
      const error3 = new RixaError(ErrorType.ADAPTER_ERROR, 'Adapter error');
      
      await errorHandler.handleError(error1, mockContext);
      await errorHandler.handleError(error2, { ...mockContext, toolName: 'debug/stepOver' });
      await errorHandler.handleError(error3, mockContext);
      
      const stats = errorHandler.getErrorStats();
      expect(stats.totalErrors).toBe(3);
      expect(stats.errorsByType[ErrorType.TIMEOUT]).toBe(2);
      expect(stats.errorsByType[ErrorType.ADAPTER_ERROR]).toBe(1);
      expect(stats.errorsByTool['debug/continue']).toBe(2);
      expect(stats.errorsByTool['debug/stepOver']).toBe(1);
    });

    it('should reset statistics', async () => {
      const error = new RixaError(ErrorType.TIMEOUT, 'Test error');
      await errorHandler.handleError(error, mockContext);
      
      expect(errorHandler.getErrorStats().totalErrors).toBe(1);
      
      errorHandler.resetStats();
      
      const stats = errorHandler.getErrorStats();
      expect(stats.totalErrors).toBe(0);
      expect(stats.errorsByType).toEqual({});
      expect(stats.errorsByTool).toEqual({});
      expect(stats.lastError).toBeUndefined();
    });
  });

  describe('Recovery Strategies', () => {
    it('should apply timeout retry strategy', async () => {
      const error = new RixaError(ErrorType.TIMEOUT, 'Request timeout');
      
      const result = await errorHandler.handleError(error, mockContext);
      
      expect(result.success).toBe(true);
      expect(result.shouldRetry).toBe(true);
      expect(result.retryDelay).toBeGreaterThan(0);
      expect(result.message).toContain('Retrying after timeout');
    });

    it('should not retry timeout after max attempts', async () => {
      const error = new RixaError(ErrorType.TIMEOUT, 'Request timeout');
      const contextWithRetries = { ...mockContext, retryCount: 3 };
      
      const result = await errorHandler.handleError(error, contextWithRetries);
      
      expect(result.success).toBe(false);
      expect(result.shouldRetry).toBeFalsy();
    });

    it('should apply parameter correction strategy', async () => {
      const error = new RixaError(ErrorType.VALIDATION_ERROR, 'sessionId is required');
      const contextWithArgs = {
        ...mockContext,
        originalArgs: { threadId: 1 },
        session: { id: 'session-123' } as any,
      };
      
      const result = await errorHandler.handleError(error, contextWithArgs);
      
      expect(result.success).toBe(true);
      expect(result.shouldRetry).toBe(true);
      expect(result.context?.correctedArgs).toMatchObject({
        threadId: 1,
        sessionId: 'session-123',
      });
    });

    it('should apply graceful degradation for unsupported operations', async () => {
      const error = new RixaError(ErrorType.UNSUPPORTED_OPERATION, 'Tool not supported');
      
      const result = await errorHandler.handleError(error, mockContext);
      
      expect(result.success).toBe(true);
      expect(result.context?.fallbackResponse).toBeDefined();
      expect(result.context?.fallbackResponse.content[0].text).toContain('not supported');
    });

    it('should handle session reconnection strategy', async () => {
      const error = new RixaError(ErrorType.ADAPTER_ERROR, 'DAP client not connected');
      const mockSession = {
        reconnect: vi.fn().mockResolvedValue(undefined),
      };
      const contextWithSession = {
        ...mockContext,
        session: mockSession as any,
      };
      
      const result = await errorHandler.handleError(error, contextWithSession);
      
      expect(result.success).toBe(true);
      expect(result.shouldRetry).toBe(true);
      expect(mockSession.reconnect).toHaveBeenCalled();
    });
  });

  describe('Custom Recovery Strategies', () => {
    it('should add and use custom recovery strategies', async () => {
      const customStrategy: ErrorRecoveryStrategy = {
        name: 'custom-test-strategy',
        priority: 200,
        canRecover: (error) => error.type === ErrorType.INTERNAL_ERROR,
        recover: async () => ({
          success: true,
          message: 'Custom recovery applied',
          shouldRetry: false,
        }),
      };

      errorHandler.addRecoveryStrategy(customStrategy);
      
      const error = new RixaError(ErrorType.INTERNAL_ERROR, 'Internal error');
      const result = await errorHandler.handleError(error, mockContext);
      
      expect(result.success).toBe(true);
      expect(result.message).toBe('Custom recovery applied');
    });

    it('should prioritize strategies correctly', async () => {
      const lowPriorityStrategy: ErrorRecoveryStrategy = {
        name: 'low-priority',
        priority: 10,
        canRecover: () => true,
        recover: async () => ({ success: true, message: 'Low priority' }),
      };

      const highPriorityStrategy: ErrorRecoveryStrategy = {
        name: 'high-priority',
        priority: 300,
        canRecover: () => true,
        recover: async () => ({ success: true, message: 'High priority' }),
      };

      errorHandler.addRecoveryStrategy(lowPriorityStrategy);
      errorHandler.addRecoveryStrategy(highPriorityStrategy);
      
      const error = new RixaError(ErrorType.INTERNAL_ERROR, 'Test error');
      const result = await errorHandler.handleError(error, mockContext);
      
      expect(result.message).toBe('High priority');
    });
  });

  describe('Enhanced Error Creation', () => {
    it('should create enhanced errors with context', () => {
      const error = errorHandler.createEnhancedError(
        ErrorType.VALIDATION_ERROR,
        'Test validation error',
        mockContext,
        {
          code: 'VALIDATION_001',
          details: { field: 'sessionId' },
          cause: new Error('Original cause'),
        }
      );

      expect(error.type).toBe(ErrorType.VALIDATION_ERROR);
      expect(error.message).toBe('Test validation error');
      expect(error.code).toBe('VALIDATION_001');
      expect(error.requestId).toBe(mockContext.requestId);
      expect(error.sessionId).toBe(mockContext.sessionId);
      expect(error.details?.context).toMatchObject({
        requestId: mockContext.requestId,
        sessionId: mockContext.sessionId,
        toolName: mockContext.toolName,
        retryCount: 0,
      });
    });
  });
});
