#!/usr/bin/env node

import { loadConfig } from '@/utils/config.js';
import { initializeLogger, getLogger } from '@/utils/logger.js';
import { ErrorType, RixaError } from '@/types/common.js';
import { RixaIntegration } from '@/core/integration.js';

/**
 * Main application entry point
 */
async function main(): Promise<void> {
  try {
    // Load configuration
    const config = loadConfig();

    // Initialize logging
    initializeLogger(config.logging);
    const logger = getLogger();

    logger.info('Starting RIXA - Runtime Intelligent eXecution Adapter', {
      version: '0.1.0',
      config: {
        server: {
          host: config.server.host,
          port: config.server.port,
        },
        auth: {
          enabled: config.auth.enabled,
        },
        filesystem: {
          readOnly: config.filesystem.readOnly,
          allowedPaths: config.filesystem.allowedPaths.length,
        },
        dap: {
          defaultAdapter: config.dap.defaultAdapter,
        },
      },
    });

    // Initialize and start the integration layer
    const integration = new RixaIntegration(config, logger);

    integration.on('started', () => {
      logger.info('RIXA server started successfully', {
        host: config.server.host,
        port: config.server.port,
        serverInfo: integration.getServerInfo(),
      });
    });

    integration.on('error', (error: Error) => {
      logger.error('Integration layer error', {
        error: error.message,
        stack: error.stack,
      });
    });

    await integration.start();

    // Keep the process running and handle graceful shutdown
    process.on('SIGINT', async () => {
      logger.info('Received SIGINT, shutting down gracefully...');
      await integration.stop();
      process.exit(0);
    });

    process.on('SIGTERM', async () => {
      logger.info('Received SIGTERM, shutting down gracefully...');
      await integration.stop();
      process.exit(0);
    });
  } catch (error) {
    const logger = getLogger();

    if (error instanceof RixaError) {
      logger.error('Application error', {
        type: error.type,
        message: error.message,
        code: error.code,
        details: error.details,
      });
    } else {
      logger.error('Unexpected error', {
        type: ErrorType.INTERNAL_ERROR,
        message: error instanceof Error ? error.message : String(error),
        stack: error instanceof Error ? error.stack : undefined,
      });
    }

    process.exit(1);
  }
}

// Handle unhandled promise rejections
process.on('unhandledRejection', (reason, promise) => {
  const logger = getLogger();
  logger.error('Unhandled promise rejection', {
    reason: reason instanceof Error ? reason.message : String(reason),
    stack: reason instanceof Error ? reason.stack : undefined,
    promise: String(promise),
  });
  process.exit(1);
});

// Handle uncaught exceptions
process.on('uncaughtException', error => {
  const logger = getLogger();
  logger.error('Uncaught exception', {
    message: error.message,
    stack: error.stack,
  });
  process.exit(1);
});

// Start the application
main().catch(error => {
  console.error('Failed to start application:', error);
  process.exit(1);
});
