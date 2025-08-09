import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { HealthMonitor, HealthStatus } from '@/core/health.js';
import { McpRateLimitMiddleware } from '@/core/rate-limiter.js';
import { RixaError, ErrorType } from '@/types/common.js';

import { createLogger } from '@/utils/logger.js';

// Mock logger for tests
const mockLogger = createLogger(
  { level: 'debug', format: 'json', file: { enabled: false, path: '', maxSize: 0, maxFiles: 0 } },
  { requestId: 'health-test' }
);

describe('HealthMonitor', () => {
  let healthMonitor: HealthMonitor;

  beforeEach(() => {
    healthMonitor = new HealthMonitor(mockLogger);
  });

  afterEach(() => {
    // Clean up any intervals
    healthMonitor.removeAllListeners();
  });

  it('should initialize with default health checks', async () => {
    const result = await healthMonitor.runHealthChecks();

    expect(result.status).toBeDefined();
    expect(result.checks).toBeDefined();
    expect(result.overall).toBeDefined();

    // Should have memory health check
    expect(result.checks.memory).toBeDefined();
    expect(result.checks.memory.status).toBe(HealthStatus.HEALTHY);
  });

  it('should add and run custom health checks', async () => {
    healthMonitor.addHealthCheck('custom', async () => ({
      status: HealthStatus.HEALTHY,
      message: 'Custom check passed',
      timestamp: new Date().toISOString(),
      duration: 0,
    }));

    const result = await healthMonitor.runHealthChecks();

    expect(result.checks.custom).toBeDefined();
    expect(result.checks.custom.status).toBe(HealthStatus.HEALTHY);
    expect(result.checks.custom.message).toBe('Custom check passed');
  });

  it('should handle failing health checks', async () => {
    healthMonitor.addHealthCheck('failing', async () => ({
      status: HealthStatus.UNHEALTHY,
      message: 'Something is wrong',
      timestamp: new Date().toISOString(),
      duration: 0,
    }));

    const result = await healthMonitor.runHealthChecks();

    expect(result.status).toBe(HealthStatus.UNHEALTHY);
    expect(result.checks.failing.status).toBe(HealthStatus.UNHEALTHY);
  });

  it('should handle degraded health checks', async () => {
    healthMonitor.addHealthCheck('degraded', async () => ({
      status: HealthStatus.DEGRADED,
      message: 'Performance degraded',
      timestamp: new Date().toISOString(),
      duration: 0,
    }));

    const result = await healthMonitor.runHealthChecks();

    // Overall status should be degraded if no unhealthy checks
    expect([HealthStatus.DEGRADED, HealthStatus.HEALTHY]).toContain(result.status);
    expect(result.checks.degraded.status).toBe(HealthStatus.DEGRADED);
  });

  it('should handle health check exceptions', async () => {
    healthMonitor.addHealthCheck('throwing', async () => {
      throw new Error('Health check failed');
    });

    const result = await healthMonitor.runHealthChecks();

    expect(result.status).toBe(HealthStatus.UNHEALTHY);
    expect(result.checks.throwing.status).toBe(HealthStatus.UNHEALTHY);
    expect(result.checks.throwing.message).toContain('Health check failed');
  });

  it('should remove health checks', async () => {
    healthMonitor.addHealthCheck('temporary', async () => ({
      status: HealthStatus.HEALTHY,
      message: 'Temporary check',
      timestamp: new Date().toISOString(),
      duration: 0,
    }));

    let result = await healthMonitor.runHealthChecks();
    expect(result.checks.temporary).toBeDefined();

    healthMonitor.removeHealthCheck('temporary');

    result = await healthMonitor.runHealthChecks();
    expect(result.checks.temporary).toBeUndefined();
  });

  it('should collect system metrics', () => {
    const metrics = healthMonitor.getMetrics();

    expect(metrics).toBeDefined();
    expect(metrics.uptime).toBeGreaterThan(0);
    expect(metrics.memory).toBeDefined();
    expect(metrics.memory.used).toBeGreaterThan(0);
    expect(metrics.memory.total).toBeGreaterThan(0);
    expect(metrics.memory.percentage).toBeGreaterThan(0);
    expect(metrics.cpu).toBeDefined();
    expect(metrics.connections).toBeDefined();
    expect(metrics.sessions).toBeDefined();
    expect(metrics.requests).toBeDefined();
    expect(metrics.errors).toBeDefined();
  });

  it('should record requests and errors', () => {
    // Record some requests
    healthMonitor.recordRequest(true, false);
    healthMonitor.recordRequest(false, false);
    healthMonitor.recordRequest(true, true);

    // Record some errors
    healthMonitor.recordError('VALIDATION_ERROR');
    healthMonitor.recordError('ADAPTER_ERROR');
    healthMonitor.recordError('VALIDATION_ERROR');

    const metrics = healthMonitor.getMetrics();

    expect(metrics.requests.total).toBe(3);
    expect(metrics.requests.successful).toBe(2);
    expect(metrics.requests.failed).toBe(1);
    expect(metrics.requests.rateLimited).toBe(1);

    expect(metrics.errors.total).toBe(3);
    expect(metrics.errors.byType.VALIDATION_ERROR).toBe(2);
    expect(metrics.errors.byType.ADAPTER_ERROR).toBe(1);
  });

  it('should generate health response', async () => {
    const response = await healthMonitor.getHealthResponse();

    expect(response.status).toBe(200);
    expect(response.body).toBeDefined();
    expect(response.body.status).toBeDefined();
    expect(response.body.timestamp).toBeDefined();
    expect(response.body.uptime).toBeGreaterThan(0);
    expect(response.body.version).toBe('0.1.0');
    expect(response.body.checks).toBeDefined();
  });

  it('should generate metrics response', () => {
    const response = healthMonitor.getMetricsResponse();

    expect(response.status).toBe(200);
    expect(response.body).toBeDefined();
    expect(response.body.uptime).toBeGreaterThan(0);
    expect(response.body.memory).toBeDefined();
    expect(response.body.cpu).toBeDefined();
  });

  it('should handle memory health check thresholds', async () => {
    // Mock memory usage to test thresholds
    const originalMemoryUsage = process.memoryUsage;

    // Mock high memory usage (90%+)
    vi.spyOn(process, 'memoryUsage').mockReturnValue({
      rss: 1000000,
      heapTotal: 1000000,
      heapUsed: 950000, // 95% usage
      external: 0,
      arrayBuffers: 0,
    });

    const result = await healthMonitor.runHealthChecks();

    // Should be unhealthy due to high memory usage
    expect(result.checks.memory.status).toBe(HealthStatus.UNHEALTHY);
    expect(result.checks.memory.message).toContain('critical');

    // Restore original function
    vi.restoreAllMocks();
  });

  it('should handle degraded memory usage', async () => {
    // Mock moderate memory usage (75-90%)
    vi.spyOn(process, 'memoryUsage').mockReturnValue({
      rss: 1000000,
      heapTotal: 1000000,
      heapUsed: 800000, // 80% usage
      external: 0,
      arrayBuffers: 0,
    });

    const result = await healthMonitor.runHealthChecks();

    // Should be degraded due to high memory usage
    expect(result.checks.memory.status).toBe(HealthStatus.DEGRADED);
    expect(result.checks.memory.message).toContain('high');

    vi.restoreAllMocks();
  });
});

describe('McpRateLimitMiddleware Integration', () => {
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

  it('should integrate with health monitoring', () => {
    // Make some requests
    middleware.checkRequest('conn1', 'tools/call');
    middleware.checkRequest('conn2', 'resources/list');

    const globalStats = middleware.getGlobalStats();
    expect(globalStats.totalConnections).toBe(2);
    expect(globalStats.totalRequests).toBe(2);
    expect(globalStats.activeRateLimits).toBe(2);
  });

  it('should provide detailed error information', () => {
    middleware.checkRequest('conn1', 'tools/call');
    middleware.checkRequest('conn1', 'tools/call');

    try {
      middleware.checkRequest('conn1', 'tools/call');
      expect.fail('Should have thrown RixaError');
    } catch (error) {
      expect(error).toBeInstanceOf(RixaError);
      const rixaError = error as RixaError;
      expect(rixaError.details).toBeDefined();
      expect((rixaError.details as any).connectionId).toBe('conn1');
      expect((rixaError.details as any).method).toBe('tools/call');
      expect((rixaError.details as any).resetTime).toBeDefined();
      expect((rixaError.details as any).remaining).toBe(0);
    }
  });
});
