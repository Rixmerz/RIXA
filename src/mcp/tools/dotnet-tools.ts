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

// Export all tools
export const dotnetTools = {
  debug_connectDotNet,
  debug_getDotNetProcesses,
  debug_inspectDotNetObject
};