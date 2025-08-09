import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { RateLimiter, McpRateLimitMiddleware } from '@/core/rate-limiter.js';
import { createLogger } from '@/utils/logger.js';
import { ErrorType, RixaError } from '@/types/common.js';

// Mock logger for tests
const mockLogger = createLogger(
  { level: 'debug', format: 'json', file: { enabled: false, path: '', maxSize: 0, maxFiles: 0 } },
  { requestId: 'rate-limiter-test' }
);

describe('RateLimiter', () => {
  let rateLimiter: RateLimiter;

  beforeEach(() => {
    rateLimiter = new RateLimiter(
      {
        windowMs: 1000, // 1 second for testing
        maxRequests: 3,
      },
      mockLogger
    );
  });

  afterEach(() => {
    rateLimiter.destroy();
  });

  it('should allow requests within limit', () => {
    const result1 = rateLimiter.checkLimit('user1');
    expect(result1.allowed).toBe(true);
    expect(result1.remaining).toBe(2);

    const result2 = rateLimiter.checkLimit('user1');
    expect(result2.allowed).toBe(true);
    expect(result2.remaining).toBe(1);

    const result3 = rateLimiter.checkLimit('user1');
    expect(result3.allowed).toBe(true);
    expect(result3.remaining).toBe(0);
  });

  it('should reject requests over limit', () => {
    // Use up the limit
    rateLimiter.checkLimit('user1');
    rateLimiter.checkLimit('user1');
    rateLimiter.checkLimit('user1');

    // This should be rejected
    const result = rateLimiter.checkLimit('user1');
    expect(result.allowed).toBe(false);
    expect(result.remaining).toBe(0);
  });

  it('should handle different users separately', () => {
    // User 1 uses up their limit
    rateLimiter.checkLimit('user1');
    rateLimiter.checkLimit('user1');
    rateLimiter.checkLimit('user1');

    // User 2 should still be allowed
    const result = rateLimiter.checkLimit('user2');
    expect(result.allowed).toBe(true);
    expect(result.remaining).toBe(2);
  });

  it('should reset after window expires', async () => {
    // Use up the limit
    rateLimiter.checkLimit('user1');
    rateLimiter.checkLimit('user1');
    rateLimiter.checkLimit('user1');

    // Should be rejected
    const result1 = rateLimiter.checkLimit('user1');
    expect(result1.allowed).toBe(false);

    // Wait for window to expire
    await new Promise(resolve => setTimeout(resolve, 1100));

    // Should be allowed again
    const result2 = rateLimiter.checkLimit('user1');
    expect(result2.allowed).toBe(true);
    expect(result2.remaining).toBe(2);
  });

  it('should provide accurate stats', () => {
    rateLimiter.checkLimit('user1');
    rateLimiter.checkLimit('user1');

    const stats = rateLimiter.getStats('user1');
    expect(stats).toBeDefined();
    expect(stats!.count).toBe(2);
    expect(stats!.remaining).toBe(1);
  });

  it('should reset user limits', () => {
    rateLimiter.checkLimit('user1');
    rateLimiter.checkLimit('user1');

    rateLimiter.reset('user1');

    const result = rateLimiter.checkLimit('user1');
    expect(result.allowed).toBe(true);
    expect(result.remaining).toBe(2);
  });

  it('should handle successful request recording', () => {
    const config = {
      windowMs: 1000,
      maxRequests: 3,
      skipSuccessfulRequests: true,
    };

    const limiter = new RateLimiter(config, mockLogger);

    limiter.checkLimit('user1');
    limiter.checkLimit('user1');
    
    // Record success - should decrease count
    limiter.recordSuccess('user1');

    const stats = limiter.getStats('user1');
    expect(stats!.count).toBe(1);

    limiter.destroy();
  });
});

describe('McpRateLimitMiddleware', () => {
  let middleware: McpRateLimitMiddleware;

  beforeEach(() => {
    middleware = new McpRateLimitMiddleware(
      {
        windowMs: 1000,
        maxRequests: 2,
      },
      mockLogger
    );
  });

  afterEach(() => {
    middleware.destroy();
  });

  it('should allow requests within limit', () => {
    expect(() => {
      middleware.checkRequest('conn1', 'tools/call');
    }).not.toThrow();

    expect(() => {
      middleware.checkRequest('conn1', 'tools/call');
    }).not.toThrow();
  });

  it('should throw RixaError when limit exceeded', () => {
    middleware.checkRequest('conn1', 'tools/call');
    middleware.checkRequest('conn1', 'tools/call');

    expect(() => {
      middleware.checkRequest('conn1', 'tools/call');
    }).toThrow(RixaError);

    try {
      middleware.checkRequest('conn1', 'tools/call');
    } catch (error) {
      expect(error).toBeInstanceOf(RixaError);
      expect((error as RixaError).type).toBe(ErrorType.VALIDATION_ERROR);
      expect((error as RixaError).message).toContain('Rate limit exceeded');
    }
  });

  it('should handle different connections separately', () => {
    middleware.checkRequest('conn1', 'tools/call');
    middleware.checkRequest('conn1', 'tools/call');

    // conn1 is at limit, but conn2 should be fine
    expect(() => {
      middleware.checkRequest('conn2', 'tools/call');
    }).not.toThrow();
  });

  it('should handle different methods separately', () => {
    middleware.checkRequest('conn1', 'tools/call');
    middleware.checkRequest('conn1', 'tools/call');

    // Same connection but different method should be fine
    expect(() => {
      middleware.checkRequest('conn1', 'resources/list');
    }).not.toThrow();
  });

  it('should provide connection stats', () => {
    middleware.checkRequest('conn1', 'tools/call');
    middleware.checkRequest('conn1', 'resources/list');

    const stats = middleware.getConnectionStats('conn1');
    expect(stats.length).toBe(2);
    
    const toolsCallStat = stats.find(s => s.method === 'tools/call');
    expect(toolsCallStat).toBeDefined();
    expect(toolsCallStat!.count).toBe(1);
    expect(toolsCallStat!.remaining).toBe(1);
  });

  it('should provide global stats', () => {
    middleware.checkRequest('conn1', 'tools/call');
    middleware.checkRequest('conn2', 'resources/list');

    const globalStats = middleware.getGlobalStats();
    expect(globalStats.totalConnections).toBe(2);
    expect(globalStats.totalRequests).toBe(2);
    expect(globalStats.activeRateLimits).toBe(2);
  });

  it('should reset connection limits', () => {
    middleware.checkRequest('conn1', 'tools/call');
    middleware.checkRequest('conn1', 'tools/call');

    // Should be at limit
    expect(() => {
      middleware.checkRequest('conn1', 'tools/call');
    }).toThrow();

    // Reset and try again
    middleware.resetConnection('conn1');

    expect(() => {
      middleware.checkRequest('conn1', 'tools/call');
    }).not.toThrow();
  });

  it('should record success and failure', () => {
    middleware.checkRequest('conn1', 'tools/call');
    
    // Record success
    middleware.recordSuccess('conn1', 'tools/call');
    
    // Record failure
    middleware.recordFailure('conn1', 'tools/call');

    // These methods should not throw (implementation detail testing)
    expect(true).toBe(true);
  });
});
