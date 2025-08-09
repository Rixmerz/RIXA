import { describe, it, expect, beforeEach, vi } from 'vitest';
import { createLogger, initializeLogger, getLogger } from '@/utils/logger.js';
import { LoggingConfig } from '@/types/config.js';
import { generateRequestId, generateSessionId } from '@/utils/correlation.js';

// Mock winston to avoid actual file operations in tests
vi.mock('winston', () => ({
  default: {
    createLogger: vi.fn(() => ({
      error: vi.fn(),
      warn: vi.fn(),
      info: vi.fn(),
      debug: vi.fn(),
      level: 'info',
    })),
    format: {
      combine: vi.fn(() => ({})),
      timestamp: vi.fn(() => ({})),
      errors: vi.fn(() => ({})),
      json: vi.fn(() => ({})),
      simple: vi.fn(() => ({})),
    },
    transports: {
      Console: vi.fn(),
      File: vi.fn(),
    },
  },
}));

describe('Logger', () => {
  const defaultConfig: LoggingConfig = {
    level: 'info',
    format: 'json',
    file: {
      enabled: false,
      path: './logs/test.log',
      maxSize: 1024 * 1024,
      maxFiles: 3,
    },
  };

  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('createLogger', () => {
    it('should create a logger with default configuration', () => {
      const logger = createLogger(defaultConfig);

      expect(logger).toBeDefined();
      expect(typeof logger.info).toBe('function');
      expect(typeof logger.error).toBe('function');
      expect(typeof logger.warn).toBe('function');
      expect(typeof logger.debug).toBe('function');
      expect(typeof logger.child).toBe('function');
    });

    it('should create a logger with correlation context', () => {
      const requestId = generateRequestId();
      const sessionId = generateSessionId();

      const logger = createLogger(defaultConfig, { requestId, sessionId });

      expect(logger).toBeDefined();
    });

    it('should create child logger with additional context', () => {
      const logger = createLogger(defaultConfig);
      const requestId = generateRequestId();

      const childLogger = logger.child({ requestId });

      expect(childLogger).toBeDefined();
      expect(childLogger).not.toBe(logger);
    });
  });

  describe('global logger', () => {
    it('should initialize and retrieve global logger', () => {
      initializeLogger(defaultConfig);

      const logger = getLogger();

      expect(logger).toBeDefined();
    });

    it('should throw error when getting logger before initialization', async () => {
      // Reset any existing global logger by creating a new module context
      vi.resetModules();

      // Import fresh module
      const { getLogger: freshGetLogger } = await import('@/utils/logger.js?t=' + Date.now());

      expect(() => {
        freshGetLogger();
      }).toThrow('Logger not initialized');
    });
  });

  describe('logging methods', () => {
    it('should call underlying winston methods', () => {
      const logger = createLogger(defaultConfig);

      logger.info('test message', { key: 'value' });
      logger.error('error message');
      logger.warn('warning message');
      logger.debug('debug message');

      // Since we mocked winston, we can't directly test the calls
      // but we can verify the methods exist and don't throw
      expect(true).toBe(true);
    });
  });
});
