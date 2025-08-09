import { config } from 'dotenv';
import type { AppConfig } from '@/types/config.js';
import { AppConfigSchema } from '@/types/config.js';
import { ErrorType, RixaError } from '@/types/common.js';

// Load environment variables
config();

/**
 * Load and validate application configuration from environment variables
 */
export function loadConfig(): AppConfig {
  try {
    const rawConfig = {
      server: {
        port: process.env['RIXA_PORT'] ? parseInt(process.env['RIXA_PORT'], 10) : undefined,
        host: process.env['RIXA_HOST'],
        cors: {
          enabled: process.env['RIXA_CORS_ENABLED'] === 'true',
          origins: process.env['RIXA_CORS_ORIGINS']?.split(',') || undefined,
        },
      },
      auth: {
        enabled: process.env['RIXA_AUTH_ENABLED'] !== 'false',
        tokens: process.env['RIXA_AUTH_TOKENS']?.split(',') || undefined,
        sessionTimeout: process.env['RIXA_SESSION_TIMEOUT']
          ? parseInt(process.env['RIXA_SESSION_TIMEOUT'], 10)
          : undefined,
      },
      filesystem: {
        readOnly: process.env['RIXA_FS_READ_ONLY'] !== 'false',
        allowedPaths: process.env['RIXA_FS_ALLOWED_PATHS']?.split(',') || undefined,
        maxFileSize: process.env['RIXA_FS_MAX_FILE_SIZE']
          ? parseInt(process.env['RIXA_FS_MAX_FILE_SIZE'], 10)
          : undefined,
        excludePatterns: process.env['RIXA_FS_EXCLUDE_PATTERNS']?.split(',') || undefined,
      },
      dap: {
        defaultAdapter: process.env['RIXA_DAP_DEFAULT_ADAPTER'],
        timeout: process.env['RIXA_DAP_TIMEOUT']
          ? parseInt(process.env['RIXA_DAP_TIMEOUT'], 10)
          : undefined,
      },
      logging: {
        level: process.env['RIXA_LOG_LEVEL'] as 'error' | 'warn' | 'info' | 'debug' | undefined,
        format: process.env['RIXA_LOG_FORMAT'] as 'json' | 'simple' | undefined,
        file: {
          enabled: process.env['RIXA_LOG_FILE_ENABLED'] === 'true',
          path: process.env['RIXA_LOG_FILE_PATH'],
          maxSize: process.env['RIXA_LOG_FILE_MAX_SIZE']
            ? parseInt(process.env['RIXA_LOG_FILE_MAX_SIZE'], 10)
            : undefined,
          maxFiles: process.env['RIXA_LOG_FILE_MAX_FILES']
            ? parseInt(process.env['RIXA_LOG_FILE_MAX_FILES'], 10)
            : undefined,
        },
      },
    };

    // Remove undefined values to let zod apply defaults
    const cleanConfig = removeUndefined(rawConfig);

    return AppConfigSchema.parse(cleanConfig);
  } catch (error) {
    throw new RixaError(ErrorType.VALIDATION_ERROR, 'Failed to load and validate configuration', {
      code: 'CONFIG_VALIDATION_FAILED',
      details: { error: error instanceof Error ? error.message : String(error) },
    });
  }
}

/**
 * Recursively remove undefined values from an object
 */
function removeUndefined(obj: unknown): unknown {
  if (obj === null || typeof obj !== 'object') {
    return obj;
  }

  if (Array.isArray(obj)) {
    return obj.map(removeUndefined);
  }

  const result: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(obj)) {
    if (value !== undefined) {
      result[key] = removeUndefined(value);
    }
  }

  return result;
}
