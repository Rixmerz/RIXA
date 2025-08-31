/**
 * .NET/C# MCP Tools
 * Provides debugging tools for .NET applications
 */

import { z } from 'zod';
import { DotNetDebugger } from '../../dotnet/dotnet-debugger.js';

// Connect to .NET application for debugging
export const debug_connectDotNet = {
  name: 'debug_connectDotNet',
  description: 'Connect to a .NET application for debugging with automatic version and framework detection',
  inputSchema: z.object({
    host: z.string().optional().default('localhost').describe('Host to connect to'),
    port: z.number().optional().describe('Port to connect to'),
    processId: z.number().optional().describe('Process ID to attach to'),
    processName: z.string().optional().describe('Process name to attach to'),
    projectPath: z.string().optional().describe('Path to the .NET project'),
    assemblyPath: z.string().optional().describe('Path to the assembly'),
    dotnetVersion: z.enum(['netframework4.0', 'netframework4.5', 'netframework4.6', 'netframework4.7', 'netframework4.8', 'netcore3.1', 'net5.0', 'net6.0', 'net7.0', 'net8.0', 'net9.0']).optional().describe('.NET version'),
    framework: z.enum(['aspnetcore', 'wpf', 'winforms', 'blazor-server', 'blazor-wasm', 'maui', 'unity', 'console', 'library']).optional().describe('Framework type'),
    runtime: z.enum(['framework', 'core', 'mono']).optional().describe('Runtime type'),
    debuggerType: z.enum(['vsdbg', 'netcoredbg', 'mono']).optional().describe('Debugger type'),
    enableHotReload: z.boolean().optional().default(false).describe('Enable hot reload'),
    enableAsyncDebugging: z.boolean().optional().default(true).describe('Enable async debugging'),
    enableLinqDebugging: z.boolean().optional().default(true).describe('Enable LINQ debugging'),
    enableExceptionBreaking: z.boolean().optional().default(true).describe('Enable exception breaking'),
    timeout: z.number().optional().default(30000).describe('Connection timeout in milliseconds'),
    autoAttach: z.boolean().optional().default(false).describe('Auto-attach to process')
  }),
  handler: async (args: any) => {
    const dotnetDebugger = DotNetDebugger.getInstance();

    try {
      const sessionId = await dotnetDebugger.connect(args);
      return {
        success: true,
        sessionId,
        message: 'Successfully connected to .NET application',
        config: args
      };
    } catch (error) {
      return {
        success: false,
        error: error instanceof Error ? error.message : String(error),
        operation: 'connectDotNet'
      };
    }
  }
};

// Get available .NET processes
export const debug_getDotNetProcesses = {
  name: 'debug_getDotNetProcesses',
  description: 'Get all .NET processes available for debugging with framework and version detection',
  inputSchema: z.object({
    includeSystemProcesses: z.boolean().optional().default(false).describe('Include system processes'),
    includeDebuggableOnly: z.boolean().optional().default(true).describe('Include only debuggable processes'),
    filterByFramework: z.enum(['aspnetcore', 'wpf', 'winforms', 'blazor-server', 'blazor-wasm', 'maui', 'unity', 'console', 'library']).optional().describe('Filter by framework'),
    filterByVersion: z.enum(['netframework4.0', 'netframework4.5', 'netframework4.6', 'netframework4.7', 'netframework4.8', 'netcore3.1', 'net5.0', 'net6.0', 'net7.0', 'net8.0', 'net9.0']).optional().describe('Filter by version')
  }),
  handler: async (args: any) => {
    const dotnetDebugger = DotNetDebugger.getInstance();

    try {
      const processes = await dotnetDebugger.getAvailableProcesses(args);
      return {
        success: true,
        processes,
        count: processes.length
      };
    } catch (error) {
      return {
        success: false,
        error: error instanceof Error ? error.message : String(error),
        operation: 'getDotNetProcesses'
      };
    }
  }
};

// Inspect .NET object
export const debug_inspectDotNetObject = {
  name: 'debug_inspectDotNetObject',
  description: 'Inspect a .NET object with deep analysis of properties, fields, and methods',
  inputSchema: z.object({
    sessionId: z.string().describe('Debugging session ID'),
    objectId: z.string().describe('Object ID to inspect'),
    maxDepth: z.number().optional().default(3).describe('Maximum depth for inspection'),
    includePrivateMembers: z.boolean().optional().default(false).describe('Include private members'),
    includeStaticMembers: z.boolean().optional().default(false).describe('Include static members'),
    includeInheritedMembers: z.boolean().optional().default(true).describe('Include inherited members'),
    evaluateProperties: z.boolean().optional().default(true).describe('Evaluate property values')
  }),
  handler: async (args: any) => {
    const dotnetDebugger = DotNetDebugger.getInstance();

    try {
      const objectInfo = await dotnetDebugger.inspectObject(args.sessionId, args.objectId, args);
      return {
        success: true,
        objectInfo
      };
    } catch (error) {
      return {
        success: false,
        error: error instanceof Error ? error.message : String(error),
        operation: 'inspectDotNetObject'
      };
    }
  }
};

// Evaluate C# expression
export const debug_evaluateCSharpExpression = {
  name: 'debug_evaluateCSharpExpression',
  description: 'Evaluate C# expressions with support for async/await, LINQ, and complex objects',
  inputSchema: z.object({
    sessionId: z.string().describe('Debugging session ID'),
    expression: z.string().describe('C# expression to evaluate'),
    frameId: z.string().optional().describe('Stack frame ID for context'),
    timeout: z.number().optional().default(5000).describe('Evaluation timeout in milliseconds'),
    allowSideEffects: z.boolean().optional().default(false).describe('Allow side effects'),
    enableAsyncEvaluation: z.boolean().optional().default(true).describe('Enable async evaluation'),
    enableLinqDebugging: z.boolean().optional().default(true).describe('Enable LINQ debugging'),
    returnFullObject: z.boolean().optional().default(false).describe('Return full object details')
  }),
  handler: async (args: any) => {
    const dotnetDebugger = DotNetDebugger.getInstance();

    try {
      const result = await dotnetDebugger.evaluateExpression(args.sessionId, args.expression, args);
      return {
        success: true,
        result
      };
    } catch (error) {
      return {
        success: false,
        error: error instanceof Error ? error.message : String(error),
        operation: 'evaluateCSharpExpression'
      };
    }
  }
};

// Get .NET assemblies
export const debug_getDotNetAssemblies = {
  name: 'debug_getDotNetAssemblies',
  description: 'Get detailed information about loaded .NET assemblies including types and metadata',
  inputSchema: z.object({
    sessionId: z.string().describe('Debugging session ID'),
    filterByName: z.string().optional().describe('Filter assemblies by name'),
    includeSystemAssemblies: z.boolean().optional().default(false).describe('Include system assemblies'),
    includeGACAssemblies: z.boolean().optional().default(false).describe('Include GAC assemblies'),
    includeDynamicAssemblies: z.boolean().optional().default(true).describe('Include dynamic assemblies'),
    includeTypeInformation: z.boolean().optional().default(true).describe('Include type information'),
    sortBy: z.enum(['name', 'version', 'location', 'size']).optional().default('name').describe('Sort order')
  }),
  handler: async (args: any) => {
    const dotnetDebugger = DotNetDebugger.getInstance();

    try {
      const assemblies = await dotnetDebugger.getAssemblies(args.sessionId, args);
      return {
        success: true,
        assemblies,
        count: assemblies.length
      };
    } catch (error) {
      return {
        success: false,
        error: error instanceof Error ? error.message : String(error),
        operation: 'getDotNetAssemblies'
      };
    }
  }
};

// Set .NET breakpoint
export const debug_setDotNetBreakpoint = {
  name: 'debug_setDotNetBreakpoint',
  description: 'Set advanced breakpoints in .NET code with support for async methods, LINQ, and conditional breaking',
  inputSchema: z.object({
    sessionId: z.string().describe('Debugging session ID'),
    file: z.string().describe('File path'),
    line: z.number().describe('Line number'),
    column: z.number().optional().describe('Column number'),
    condition: z.string().optional().describe('Breakpoint condition'),
    hitCondition: z.string().optional().describe('Hit condition'),
    logMessage: z.string().optional().describe('Log message'),
    enabled: z.boolean().optional().default(true).describe('Whether breakpoint is enabled'),
    assembly: z.string().optional().describe('Assembly name'),
    method: z.string().optional().describe('Method name'),
    breakOnAsyncException: z.boolean().optional().default(false).describe('Break on async exceptions'),
    breakOnLinqExecution: z.boolean().optional().default(false).describe('Break on LINQ execution')
  }),
  handler: async (args: any) => {
    const dotnetDebugger = DotNetDebugger.getInstance();

    try {
      const breakpoint = await dotnetDebugger.setBreakpoint(args.sessionId, args.file, args.line, args.condition);
      return {
        success: true,
        breakpoint
      };
    } catch (error) {
      return {
        success: false,
        error: error instanceof Error ? error.message : String(error),
        operation: 'setDotNetBreakpoint'
      };
    }
  }
};

// Enable .NET hot reload
export const debug_enableDotNetHotReload = {
  name: 'debug_enableDotNetHotReload',
  description: 'Enable and configure hot reload for supported .NET applications',
  inputSchema: z.object({
    sessionId: z.string().describe('Debugging session ID'),
    enableAutoReload: z.boolean().optional().default(true).describe('Enable automatic reload'),
    enableVerboseLogging: z.boolean().optional().default(false).describe('Enable verbose logging'),
    reloadTimeout: z.number().optional().default(10000).describe('Reload timeout in milliseconds'),
    watchPaths: z.array(z.string()).optional().describe('Paths to watch for changes'),
    excludePatterns: z.array(z.string()).optional().describe('Patterns to exclude from watching')
  }),
  handler: async (args: any) => {
    const dotnetDebugger = DotNetDebugger.getInstance();

    try {
      const hotReloadInfo = await dotnetDebugger.enableHotReload(args.sessionId);
      return {
        success: true,
        hotReloadInfo
      };
    } catch (error) {
      return {
        success: false,
        error: error instanceof Error ? error.message : String(error),
        operation: 'enableDotNetHotReload'
      };
    }
  }
};

// Export all tools
export const dotnetTools = {
  debug_connectDotNet,
  debug_getDotNetProcesses,
  debug_inspectDotNetObject,
  debug_evaluateCSharpExpression,
  debug_getDotNetAssemblies,
  debug_setDotNetBreakpoint,
  debug_enableDotNetHotReload
};