import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { loadConfig } from '@/utils/config.js';
import { AppConfigSchema } from '@/types/config.js';
import { ErrorType, RixaError } from '@/types/common.js';

describe('Configuration', () => {
  const originalEnv = process.env;

  beforeEach(() => {
    // Reset environment variables
    process.env = { ...originalEnv };
  });

  afterEach(() => {
    // Restore original environment
    process.env = originalEnv;
  });

  describe('loadConfig', () => {
    it('should load default configuration when no env vars are set', () => {
      // Clear relevant env vars
      delete process.env.RIXA_PORT;
      delete process.env.RIXA_HOST;
      delete process.env.RIXA_AUTH_ENABLED;

      const config = loadConfig();

      expect(config.server.port).toBe(3000);
      expect(config.server.host).toBe('localhost');
      expect(config.auth.enabled).toBe(true);
      expect(config.filesystem.readOnly).toBe(true);
      expect(config.logging.level).toBe('info');
    });

    it('should override defaults with environment variables', () => {
      process.env.RIXA_PORT = '8080';
      process.env.RIXA_HOST = '0.0.0.0';
      process.env.RIXA_AUTH_ENABLED = 'false';
      process.env.RIXA_LOG_LEVEL = 'debug';

      const config = loadConfig();

      expect(config.server.port).toBe(8080);
      expect(config.server.host).toBe('0.0.0.0');
      expect(config.auth.enabled).toBe(false);
      expect(config.logging.level).toBe('debug');
    });

    it('should parse comma-separated values correctly', () => {
      process.env.RIXA_AUTH_TOKENS = 'token1,token2,token3';
      process.env.RIXA_CORS_ORIGINS = 'http://localhost:3000,https://example.com';

      const config = loadConfig();

      expect(config.auth.tokens).toEqual(['token1', 'token2', 'token3']);
      expect(config.server.cors.origins).toEqual(['http://localhost:3000', 'https://example.com']);
    });

    it('should throw RixaError for invalid configuration', () => {
      process.env.RIXA_PORT = 'invalid-port';

      expect(() => loadConfig()).toThrow(RixaError);

      try {
        loadConfig();
      } catch (error) {
        expect(error).toBeInstanceOf(RixaError);
        expect((error as RixaError).type).toBe(ErrorType.VALIDATION_ERROR);
        expect((error as RixaError).code).toBe('CONFIG_VALIDATION_FAILED');
      }
    });

    it('should validate port ranges', () => {
      process.env.RIXA_PORT = '70000'; // Invalid port

      expect(() => loadConfig()).toThrow(RixaError);
    });
  });

  describe('AppConfigSchema', () => {
    it('should validate complete configuration object', () => {
      const validConfig = {
        server: {
          port: 3000,
          host: 'localhost',
          cors: {
            enabled: true,
            origins: ['*'],
          },
        },
        auth: {
          enabled: true,
          tokens: ['test-token'],
          sessionTimeout: 3600,
        },
        filesystem: {
          readOnly: true,
          allowedPaths: ['/test/path'],
          maxFileSize: 1024 * 1024,
          excludePatterns: ['node_modules/**'],
        },
        dap: {
          defaultAdapter: 'node',
          adapters: {
            node: {
              command: 'node',
              args: ['--inspect-brk=0'],
              transport: 'stdio' as const,
            },
          },
          timeout: 30000,
        },
        logging: {
          level: 'info' as const,
          format: 'json' as const,
          file: {
            enabled: false,
            path: './logs/rixa.log',
            maxSize: 10 * 1024 * 1024,
            maxFiles: 5,
          },
        },
      };

      const result = AppConfigSchema.parse(validConfig);
      expect(result).toEqual(validConfig);
    });

    it('should apply defaults for missing values', () => {
      const minimalConfig = {};

      const result = AppConfigSchema.parse(minimalConfig);

      expect(result.server.port).toBe(3000);
      expect(result.auth.enabled).toBe(true);
      expect(result.filesystem.readOnly).toBe(true);
      expect(result.logging.level).toBe('info');
    });
  });
});
