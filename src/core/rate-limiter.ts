import type { Logger } from '@/utils/logger.js';
import { ErrorType, RixaError } from '@/types/common.js';

/**
 * Rate limiting configuration
 */
export interface RateLimitConfig {
  windowMs: number; // Time window in milliseconds
  maxRequests: number; // Maximum requests per window
  skipSuccessfulRequests?: boolean; // Don't count successful requests
  skipFailedRequests?: boolean; // Don't count failed requests
  keyGenerator?: (identifier: string) => string; // Custom key generator
}

/**
 * Rate limit entry
 */
interface RateLimitEntry {
  count: number;
  resetTime: number;
  firstRequestTime: number;
}

/**
 * Rate limiter with sliding window
 */
export class RateLimiter {
  private entries = new Map<string, RateLimitEntry>();
  private cleanupInterval: ReturnType<typeof setInterval>;

  constructor(
    private config: RateLimitConfig,
    private logger: Logger
  ) {
    // Clean up expired entries every minute
    this.cleanupInterval = setInterval(() => {
      this.cleanup();
    }, 60000);
  }

  /**
   * Check if request is allowed
   */
  checkLimit(identifier: string): { allowed: boolean; resetTime?: number; remaining?: number } {
    const key = this.config.keyGenerator ? this.config.keyGenerator(identifier) : identifier;
    const now = Date.now();
    const windowStart = now - this.config.windowMs;

    let entry = this.entries.get(key);

    if (!entry || entry.resetTime <= now) {
      // Create new entry or reset expired entry
      entry = {
        count: 1,
        resetTime: now + this.config.windowMs,
        firstRequestTime: now,
      };
      this.entries.set(key, entry);

      return {
        allowed: true,
        resetTime: entry.resetTime,
        remaining: this.config.maxRequests - 1,
      };
    }

    // Check if we're within the sliding window
    if (entry.firstRequestTime < windowStart) {
      // Reset the window
      entry.count = 1;
      entry.firstRequestTime = now;
      entry.resetTime = now + this.config.windowMs;
      this.entries.set(key, entry);

      return {
        allowed: true,
        resetTime: entry.resetTime,
        remaining: this.config.maxRequests - 1,
      };
    }

    // Increment count
    entry.count++;

    if (entry.count > this.config.maxRequests) {
      this.logger.warn('Rate limit exceeded', {
        identifier,
        key,
        count: entry.count,
        maxRequests: this.config.maxRequests,
        windowMs: this.config.windowMs,
      });

      return {
        allowed: false,
        resetTime: entry.resetTime,
        remaining: 0,
      };
    }

    return {
      allowed: true,
      resetTime: entry.resetTime,
      remaining: this.config.maxRequests - entry.count,
    };
  }

  /**
   * Record a successful request (if configured to skip)
   */
  recordSuccess(identifier: string): void {
    if (this.config.skipSuccessfulRequests) {
      const key = this.config.keyGenerator ? this.config.keyGenerator(identifier) : identifier;
      const entry = this.entries.get(key);
      if (entry && entry.count > 0) {
        entry.count--;
      }
    }
  }

  /**
   * Record a failed request (if configured to skip)
   */
  recordFailure(identifier: string): void {
    if (this.config.skipFailedRequests) {
      const key = this.config.keyGenerator ? this.config.keyGenerator(identifier) : identifier;
      const entry = this.entries.get(key);
      if (entry && entry.count > 0) {
        entry.count--;
      }
    }
  }

  /**
   * Get current stats for identifier
   */
  getStats(identifier: string): { count: number; resetTime: number; remaining: number } | null {
    const key = this.config.keyGenerator ? this.config.keyGenerator(identifier) : identifier;
    const entry = this.entries.get(key);

    if (!entry) {
      return null;
    }

    return {
      count: entry.count,
      resetTime: entry.resetTime,
      remaining: Math.max(0, this.config.maxRequests - entry.count),
    };
  }

  /**
   * Reset limits for identifier
   */
  reset(identifier: string): void {
    const key = this.config.keyGenerator ? this.config.keyGenerator(identifier) : identifier;
    this.entries.delete(key);
  }

  /**
   * Get all current entries (for monitoring)
   */
  getAllStats(): Array<{ key: string; count: number; resetTime: number; remaining: number }> {
    const stats: Array<{ key: string; count: number; resetTime: number; remaining: number }> = [];
    const now = Date.now();

    for (const [key, entry] of this.entries) {
      if (entry.resetTime > now) {
        stats.push({
          key,
          count: entry.count,
          resetTime: entry.resetTime,
          remaining: Math.max(0, this.config.maxRequests - entry.count),
        });
      }
    }

    return stats;
  }

  /**
   * Clean up expired entries
   */
  private cleanup(): void {
    const now = Date.now();
    let cleaned = 0;

    for (const [key, entry] of this.entries) {
      if (entry.resetTime <= now) {
        this.entries.delete(key);
        cleaned++;
      }
    }

    if (cleaned > 0) {
      this.logger.debug('Cleaned up expired rate limit entries', {
        cleaned,
        remaining: this.entries.size,
      });
    }
  }

  /**
   * Destroy the rate limiter
   */
  destroy(): void {
    if (this.cleanupInterval) {
      clearInterval(this.cleanupInterval);
    }
    this.entries.clear();
  }
}

/**
 * Rate limiting middleware for MCP connections
 */
export class McpRateLimitMiddleware {
  private rateLimiter: RateLimiter;

  constructor(config: RateLimitConfig, logger: Logger) {
    this.rateLimiter = new RateLimiter(config, logger);
  }

  /**
   * Check if request should be allowed
   */
  checkRequest(connectionId: string, method: string): void {
    const identifier = `${connectionId}:${method}`;
    const result = this.rateLimiter.checkLimit(identifier);

    if (!result.allowed) {
      throw new RixaError(ErrorType.VALIDATION_ERROR, 'Rate limit exceeded', {
        details: {
          connectionId,
          method,
          resetTime: result.resetTime,
          remaining: result.remaining,
        },
      });
    }
  }

  /**
   * Record successful request
   */
  recordSuccess(connectionId: string, method: string): void {
    const identifier = `${connectionId}:${method}`;
    this.rateLimiter.recordSuccess(identifier);
  }

  /**
   * Record failed request
   */
  recordFailure(connectionId: string, method: string): void {
    const identifier = `${connectionId}:${method}`;
    this.rateLimiter.recordFailure(identifier);
  }

  /**
   * Get stats for connection
   */
  getConnectionStats(connectionId: string): Array<{
    method: string;
    count: number;
    resetTime: number;
    remaining: number;
  }> {
    const allStats = this.rateLimiter.getAllStats();
    return allStats
      .filter(stat => stat.key.startsWith(`${connectionId}:`))
      .map(stat => ({
        method: stat.key.split(':')[1] || 'unknown',
        count: stat.count,
        resetTime: stat.resetTime,
        remaining: stat.remaining,
      }));
  }

  /**
   * Reset limits for connection
   */
  resetConnection(connectionId: string): void {
    const allStats = this.rateLimiter.getAllStats();
    const connectionKeys = allStats
      .filter(stat => stat.key.startsWith(`${connectionId}:`))
      .map(stat => stat.key);

    for (const key of connectionKeys) {
      this.rateLimiter.reset(key);
    }
  }

  /**
   * Get global stats
   */
  getGlobalStats(): {
    totalConnections: number;
    totalRequests: number;
    activeRateLimits: number;
  } {
    const allStats = this.rateLimiter.getAllStats();
    const connections = new Set<string>();

    let totalRequests = 0;
    for (const stat of allStats) {
      const connectionId = stat.key.split(':')[0];
      if (connectionId) {
        connections.add(connectionId);
      }
      totalRequests += stat.count;
    }

    return {
      totalConnections: connections.size,
      totalRequests,
      activeRateLimits: allStats.length,
    };
  }

  /**
   * Destroy the middleware
   */
  destroy(): void {
    this.rateLimiter.destroy();
  }
}
