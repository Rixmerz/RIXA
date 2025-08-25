import { z } from 'zod';

/**
 * Server configuration schema
 */
export const ServerConfigSchema = z.object({
  port: z.number().int().min(1).max(65535).default(3000),
  host: z.string().default('localhost'),
  cors: z
    .object({
      enabled: z.boolean().default(true),
      origins: z.array(z.string()).default(['*']),
    })
    .default({}),
});

/**
 * Authentication configuration schema
 */
export const AuthConfigSchema = z.object({
  enabled: z.boolean().default(true),
  tokens: z.array(z.string()).min(1).default(['default-token']),
  sessionTimeout: z.number().int().min(60).default(3600), // seconds
});

/**
 * Filesystem policy configuration schema
 */
export const FilesystemConfigSchema = z.object({
  readOnly: z.boolean().default(true),
  allowedPaths: z.array(z.string()).default([process.cwd()]),
  maxFileSize: z
    .number()
    .int()
    .min(1)
    .default(10 * 1024 * 1024), // 10MB
  excludePatterns: z.array(z.string()).default(['node_modules/**', '.git/**', 'dist/**', '*.log']),
});

/**
 * DAP adapter configuration schema
 */
export const DapConfigSchema = z.object({
  defaultAdapter: z.string().default('node'),
  adapters: z
    .record(
      z.object({
        command: z.string(),
        args: z.array(z.string()).default([]),
        transport: z.enum(['stdio', 'tcp']).default('stdio'),
        port: z.number().int().min(1).max(65535).optional(),
      })
    )
    .default({
      node: {
        command: 'node',
        args: ['--inspect-brk=0'],
        transport: 'stdio',
      },
      electron: {
        command: 'electron',
        args: ['--inspect=9229', '--remote-debugging-port=9222'],
        transport: 'tcp',
        port: 9229,
      },
    }),
  timeout: z.number().int().min(1000).default(30000), // 30 seconds
});

/**
 * Logging configuration schema
 */
export const LoggingConfigSchema = z.object({
  level: z.enum(['error', 'warn', 'info', 'debug']).default('info'),
  format: z.enum(['json', 'simple']).default('json'),
  file: z
    .object({
      enabled: z.boolean().default(false),
      path: z.string().default('./logs/rixa.log'),
      maxSize: z
        .number()
        .int()
        .min(1)
        .default(10 * 1024 * 1024), // 10MB
      maxFiles: z.number().int().min(1).default(5),
    })
    .default({}),
});

/**
 * Main application configuration schema
 */
export const AppConfigSchema = z.object({
  server: ServerConfigSchema.default({}),
  auth: AuthConfigSchema.default({}),
  filesystem: FilesystemConfigSchema.default({}),
  dap: DapConfigSchema.default({}),
  logging: LoggingConfigSchema.default({}),
});

// Type exports
export type ServerConfig = z.infer<typeof ServerConfigSchema>;
export type AuthConfig = z.infer<typeof AuthConfigSchema>;
export type FilesystemConfig = z.infer<typeof FilesystemConfigSchema>;
export type DapConfig = z.infer<typeof DapConfigSchema>;
export type LoggingConfig = z.infer<typeof LoggingConfigSchema>;
export type AppConfig = z.infer<typeof AppConfigSchema>;
