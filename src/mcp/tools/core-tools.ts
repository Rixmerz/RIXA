/**
 * Core Debugging Tools
 * Generalized debugging tools that work across all programming languages
 */

import { z } from 'zod';
import { LanguageDispatcher } from '../../core/language-dispatcher.js';

// Get the language dispatcher instance - use mock logger for now
const mockLogger = {
  info: () => {},
  error: () => {},
  warn: () => {},
  debug: () => {}
} as any;
const dispatcher = new LanguageDispatcher(mockLogger);

// Supported languages enum for validation
const supportedLanguages = [
  'javascript', 'typescript', 'node', 'react', 'nextjs',
  'java', 'kotlin', 'scala',
  'python', 'django', 'flask',
  'csharp', 'dotnet', 'fsharp',
  'go', 'gin',
  'rust', 'actix',
  'php', 'laravel', 'symfony', 'wordpress',
  'ruby', 'rails',
  'cpp', 'c'
] as const;

/**
 * Universal debug connection tool
 * Connects to debugging sessions for any supported programming language
 */
export const debug_connect = {
  name: 'debug_connect',
  description: 'Connect to debugging session for any supported language',
  inputSchema: z.object({
    language: z.enum(supportedLanguages).describe('Programming language to debug'),
    host: z.string().optional().default('localhost').describe('Host to connect to'),
    port: z.number().optional().describe('Port to connect to'),
    framework: z.string().optional().describe('Framework being used (e.g., react, django, spring)'),
    enableFrameworkTools: z.boolean().optional().default(true).describe('Enable framework-specific debugging tools'),
    processId: z.number().optional().describe('Process ID to attach to'),
    projectPath: z.string().optional().describe('Path to the project'),
    timeout: z.number().optional().default(30000).describe('Connection timeout in milliseconds'),
    autoAttach: z.boolean().optional().default(false).describe('Automatically attach to process'),
    // Additional language-specific options can be passed through
    options: z.record(z.any()).optional().describe('Additional language-specific options')
  }),
  handler: async (args: any) => {
    try {
      const { language, options = {}, ...connectionOptions } = args;
      
      // Merge connection options with additional options
      const fullOptions = {
        language,
        ...connectionOptions,
        ...options
      };

      const result = await dispatcher.connect(fullOptions);
      
      return {
        success: result.success,
        sessionId: result.sessionId,
        language,
        connectionInfo: result.data,
        message: result.success
          ? `Successfully connected to ${language} debugging session`
          : `Failed to connect to ${language}: ${result.error}`,
        error: result.error
      };
    } catch (error) {
      return {
        success: false,
        error: error instanceof Error ? error.message : String(error),
        operation: 'debug_connect'
      };
    }
  }
};

/**
 * Universal expression evaluation tool
 * Evaluates expressions in debugging context for any language
 */
export const debug_evaluate = {
  name: 'debug_evaluate',
  description: 'Evaluate expression in debugging context for any language',
  inputSchema: z.object({
    sessionId: z.string().describe('Debugging session ID'),
    expression: z.string().describe('Expression to evaluate'),
    contextId: z.number().optional().describe('Context ID for evaluation'),
    frameId: z.number().optional().describe('Stack frame ID for evaluation'),
    timeout: z.number().optional().default(5000).describe('Evaluation timeout in milliseconds')
  }),
  handler: async (args: any) => {
    try {
      const result = await dispatcher.executeOperation(args.sessionId, 'evaluate', {
        expression: args.expression,
        contextId: args.contextId,
        frameId: args.frameId,
        timeout: args.timeout
      });

      return {
        success: result.success,
        result: result.data,
        sessionId: args.sessionId,
        expression: args.expression,
        error: result.error
      };
    } catch (error) {
      return {
        success: false,
        error: error instanceof Error ? error.message : String(error),
        operation: 'debug_evaluate',
        sessionId: args.sessionId,
        expression: args.expression
      };
    }
  }
};

/**
 * Universal breakpoint setting tool
 * Sets breakpoints in code for any language
 */
export const debug_setBreakpoint = {
  name: 'debug_setBreakpoint',
  description: 'Set breakpoint in code for any language',
  inputSchema: z.object({
    sessionId: z.string().describe('Debugging session ID'),
    file: z.string().optional().describe('File path (for file-based languages)'),
    url: z.string().optional().describe('URL (for web-based debugging)'),
    line: z.number().describe('Line number'),
    column: z.number().optional().describe('Column number'),
    condition: z.string().optional().describe('Breakpoint condition'),
    className: z.string().optional().describe('Class name (for OOP languages)'),
    methodName: z.string().optional().describe('Method name (for method breakpoints)')
  }),
  handler: async (args: any) => {
    try {
      const result = await dispatcher.executeOperation(args.sessionId, 'setBreakpoint', {
        file: args.file,
        url: args.url,
        lineNumber: args.line,
        line: args.line,
        column: args.column,
        condition: args.condition,
        className: args.className,
        methodName: args.methodName
      });

      return {
        success: result.success,
        breakpoint: result.data,
        sessionId: args.sessionId,
        location: args.file || args.url || `${args.className}:${args.methodName}`,
        line: args.line,
        error: result.error
      };
    } catch (error) {
      return {
        success: false,
        error: error instanceof Error ? error.message : String(error),
        operation: 'debug_setBreakpoint',
        sessionId: args.sessionId
      };
    }
  }
};

/**
 * Universal thread listing tool
 * Gets all threads in debugging session for any language
 */
export const debug_getThreads = {
  name: 'debug_getThreads',
  description: 'Get all threads in debugging session for any language',
  inputSchema: z.object({
    sessionId: z.string().describe('Debugging session ID'),
    includeStackTrace: z.boolean().optional().default(false).describe('Include stack trace for each thread')
  }),
  handler: async (args: any) => {
    try {
      const result = await dispatcher.executeOperation(args.sessionId, 'getThreads', {
        includeStackTrace: args.includeStackTrace
      });

      return {
        success: result.success,
        threads: result.data,
        sessionId: args.sessionId,
        count: Array.isArray(result.data) ? result.data.length : 0,
        error: result.error
      };
    } catch (error) {
      return {
        success: false,
        error: error instanceof Error ? error.message : String(error),
        operation: 'debug_getThreads',
        sessionId: args.sessionId
      };
    }
  }
};

/**
 * Universal stack trace tool
 * Gets stack trace for a thread in any language
 */
export const debug_getStackTrace = {
  name: 'debug_getStackTrace',
  description: 'Get stack trace for a thread in any language',
  inputSchema: z.object({
    sessionId: z.string().describe('Debugging session ID'),
    threadId: z.number().describe('Thread ID'),
    startFrame: z.number().optional().default(0).describe('Starting frame index'),
    levels: z.number().optional().default(20).describe('Number of stack frames to retrieve')
  }),
  handler: async (args: any) => {
    try {
      const result = await dispatcher.executeOperation(args.sessionId, 'getStackTrace', {
        threadId: args.threadId,
        startFrame: args.startFrame,
        levels: args.levels
      });

      return {
        success: result.success,
        stackTrace: result.data,
        sessionId: args.sessionId,
        threadId: args.threadId,
        frameCount: Array.isArray(result.data) ? result.data.length : 0,
        error: result.error
      };
    } catch (error) {
      return {
        success: false,
        error: error instanceof Error ? error.message : String(error),
        operation: 'debug_getStackTrace',
        sessionId: args.sessionId,
        threadId: args.threadId
      };
    }
  }
};

/**
 * Universal variable inspection tool
 * Gets variables in a scope for any language
 */
export const debug_getVariables = {
  name: 'debug_getVariables',
  description: 'Get variables in a scope for any language',
  inputSchema: z.object({
    sessionId: z.string().describe('Debugging session ID'),
    variablesReference: z.number().describe('Variables reference ID'),
    filter: z.enum(['indexed', 'named']).optional().describe('Variable filter type'),
    start: z.number().optional().describe('Starting index for indexed variables'),
    count: z.number().optional().describe('Number of variables to retrieve')
  }),
  handler: async (args: any) => {
    try {
      const result = await dispatcher.executeOperation(args.sessionId, 'getVariables', {
        variablesReference: args.variablesReference,
        filter: args.filter,
        start: args.start,
        count: args.count
      });

      return {
        success: result.success,
        variables: result.data,
        sessionId: args.sessionId,
        variablesReference: args.variablesReference,
        count: Array.isArray(result.data) ? result.data.length : 0,
        error: result.error
      };
    } catch (error) {
      return {
        success: false,
        error: error instanceof Error ? error.message : String(error),
        operation: 'debug_getVariables',
        sessionId: args.sessionId,
        variablesReference: args.variablesReference
      };
    }
  }
};

/**
 * Universal execution control - continue
 * Continues execution in any language
 */
export const debug_continue = {
  name: 'debug_continue',
  description: 'Continue execution in debugging session for any language',
  inputSchema: z.object({
    sessionId: z.string().describe('Debugging session ID'),
    threadId: z.number().optional().describe('Thread ID to continue (if not specified, continues all threads)')
  }),
  handler: async (args: any) => {
    try {
      const result = await dispatcher.executeOperation(args.sessionId, 'continue', {
        threadId: args.threadId
      });

      return {
        success: result.success,
        sessionId: args.sessionId,
        threadId: args.threadId,
        message: 'Execution continued',
        error: result.error
      };
    } catch (error) {
      return {
        success: false,
        error: error instanceof Error ? error.message : String(error),
        operation: 'debug_continue',
        sessionId: args.sessionId
      };
    }
  }
};

// Export all core tools
export const coreTools = {
  debug_connect,
  debug_evaluate,
  debug_setBreakpoint,
  debug_getThreads,
  debug_getStackTrace,
  debug_getVariables,
  debug_continue
};
