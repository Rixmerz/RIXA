import winston from 'winston';
import type { LoggingConfig } from '@/types/config.js';
import type { CorrelationContext } from '@/types/common.js';

/**
 * Logger interface for structured logging
 */
export interface Logger {
  error(message: string, meta?: Record<string, unknown>): void;
  warn(message: string, meta?: Record<string, unknown>): void;
  info(message: string, meta?: Record<string, unknown>): void;
  debug(message: string, meta?: Record<string, unknown>): void;
  child(context: Partial<CorrelationContext>): Logger;
}

/**
 * Winston-based logger implementation
 */
class WinstonLogger implements Logger {
  private logger: winston.Logger;
  private context: Partial<CorrelationContext>;

  constructor(config: LoggingConfig, context: Partial<CorrelationContext> = {}) {
    this.context = context;
    this.logger = this.createWinstonLogger(config);
  }

  private createWinstonLogger(config: LoggingConfig): winston.Logger {
    const transports: winston.transport[] = [];

    // Console transport
    transports.push(
      new winston.transports.Console({
        format:
          config.format === 'json'
            ? winston.format.combine(
                winston.format.timestamp(),
                winston.format.errors({ stack: true }),
                winston.format.json()
              )
            : winston.format.combine(
                winston.format.timestamp(),
                winston.format.errors({ stack: true }),
                winston.format.simple()
              ),
      })
    );

    // File transport (if enabled)
    if (config.file.enabled) {
      transports.push(
        new winston.transports.File({
          filename: config.file.path,
          maxsize: config.file.maxSize,
          maxFiles: config.file.maxFiles,
          format: winston.format.combine(
            winston.format.timestamp(),
            winston.format.errors({ stack: true }),
            winston.format.json()
          ),
        })
      );
    }

    return winston.createLogger({
      level: config.level,
      transports,
      defaultMeta: {
        service: 'rixa',
        ...this.context,
      },
    });
  }

  error(message: string, meta: Record<string, unknown> = {}): void {
    this.logger.error(message, { ...this.context, ...meta });
  }

  warn(message: string, meta: Record<string, unknown> = {}): void {
    this.logger.warn(message, { ...this.context, ...meta });
  }

  info(message: string, meta: Record<string, unknown> = {}): void {
    this.logger.info(message, { ...this.context, ...meta });
  }

  debug(message: string, meta: Record<string, unknown> = {}): void {
    this.logger.debug(message, { ...this.context, ...meta });
  }

  child(context: Partial<CorrelationContext>): Logger {
    return new WinstonLogger(
      {
        level: this.logger.level as 'error' | 'warn' | 'info' | 'debug',
        format: 'json', // Child loggers always use JSON format
        file: {
          enabled: false,
          path: './logs/child.log',
          maxSize: 1024 * 1024,
          maxFiles: 1,
        }, // Child loggers don't create new file transports
      },
      { ...this.context, ...context }
    );
  }
}

let globalLogger: Logger | null = null;

/**
 * Initialize the global logger with configuration
 */
export function initializeLogger(config: LoggingConfig): void {
  globalLogger = new WinstonLogger(config);
}

/**
 * Get the global logger instance
 */
export function getLogger(): Logger {
  if (!globalLogger) {
    throw new Error('Logger not initialized. Call initializeLogger() first.');
  }
  return globalLogger;
}

/**
 * Create a logger with correlation context
 */
export function createLogger(config: LoggingConfig, context?: Partial<CorrelationContext>): Logger {
  return new WinstonLogger(config, context);
}
