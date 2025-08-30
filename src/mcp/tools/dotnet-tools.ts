/**
 * MCP Tools for .NET/C# Debugging
 */

import { z } from 'zod';
import { getLogger, createLogger } from '../../utils/logger.js';
import { DotNetDebugger } from '../../dotnet/dotnet-debugger.js';
import type {
  DotNetDebugConfig,
  DotNetProcessInfo
} from '../../dotnet/types.js';

// Safe logger that works in both MCP stdio and regular contexts
function getSafeLogger() {
  try {
    return getLogger();
  } catch (error) {
    return createLogger(
      { 
        level: 'info', 
        format: 'simple', 
        file: { enabled: false, path: '', maxSize: 0, maxFiles: 0 } 
      },
      { requestId: 'dotnet-tools' }
    );
  }
}

const logger = getSafeLogger();

// Get DotNetDebugger instance
function getDotNetDebugger(): DotNetDebugger {
  return DotNetDebugger.getInstance();
}

/**
 * Connect to a .NET application for debugging
 */
export const debug_connectDotNet = {
  name: 'debug_connectDotNet',
  description: 'Connect to a .NET application for debugging with automatic version and framework detection',
  inputSchema: z.object({
    processId: z.number().optional().describe('Process ID to attach to'),
    processName: z.string().optional().describe('Process name to search for'),
    host: z.string().optional().default('localhost').describe('Host to connect to'),
    port: z.number().optional().describe('Debug port to connect to'),
    dotnetVersion: z.enum(['netframework4.0', 'netframework4.5', 'netframework4.6', 'netframework4.7', 'netframework4.8', 'netcore3.1', 'net5.0', 'net6.0', 'net7.0', 'net8.0', 'net9.0']).optional().describe('.NET version (auto-detected if not specified)'),
    framework: z.enum(['aspnetcore', 'wpf', 'winforms', 'blazor-server', 'blazor-wasm', 'maui', 'unity', 'console', 'library']).optional().describe('Framework type (auto-detected if not specified)'),
    runtime: z.enum(['framework', 'core', 'mono']).optional().describe('Runtime type (auto-detected if not specified)'),
    projectPath: z.string().optional().describe('Path to project directory'),
    assemblyPath: z.string().optional().describe('Path to main assembly'),
    symbolsPath: z.string().optional().describe('Path to debug symbols'),
    enableHotReload: z.boolean().optional().default(true).describe('Enable hot reload support'),
    enableAsyncDebugging: z.boolean().optional().default(true).describe('Enable async/await debugging'),
    enableLinqDebugging: z.boolean().optional().default(true).describe('Enable LINQ query debugging'),
    enableExceptionBreaking: z.boolean().optional().default(true).describe('Break on exceptions'),
    timeout: z.number().optional().default(30000).describe('Connection timeout in milliseconds'),
    autoAttach: z.boolean().optional().default(false).describe('Automatically attach to process'),
    debuggerType: z.enum(['vsdbg', 'netcoredbg', 'mono']).optional().describe('Debugger type to use (auto-selected if not specified)')
  }),
  handler: async (args: any) => {
    try {
      const dotnetDebugger = getDotNetDebugger();
      
      // Validate input
      if (!args.processId && !args.processName) {
        return {
          success: false,
          error: 'Either processId or processName must be specified',
          message: 'Connection failed: missing process identification'
        };
      }

      const config: DotNetDebugConfig = {
        host: args.host,
        port: args.port,
        processId: args.processId,
        processName: args.processName,
        dotnetVersion: args.dotnetVersion,
        framework: args.framework,
        runtime: args.runtime,
        projectPath: args.projectPath,
        assemblyPath: args.assemblyPath,
        symbolsPath: args.symbolsPath,
        enableHotReload: args.enableHotReload,
        enableAsyncDebugging: args.enableAsyncDebugging,
        enableLinqDebugging: args.enableLinqDebugging,
        enableExceptionBreaking: args.enableExceptionBreaking,
        timeout: args.timeout,
        autoAttach: args.autoAttach,
        debuggerType: args.debuggerType
      };

      const sessionId = await dotnetDebugger.connect(config);
      const session = dotnetDebugger.getSession(sessionId);

      return {
        success: true,
        sessionId,
        processInfo: session?.processInfo,
        detectedVersion: session?.processInfo.version,
        detectedFramework: session?.processInfo.framework,
        detectedRuntime: session?.processInfo.runtime,
        capabilities: {
          hotReload: config.enableHotReload,
          asyncDebugging: config.enableAsyncDebugging,
          linqDebugging: config.enableLinqDebugging,
          exceptionBreaking: config.enableExceptionBreaking
        },
        message: `Successfully connected to .NET process (${session?.processInfo.name}) - ${session?.processInfo.framework} on ${session?.processInfo.version}`
      };
    } catch (error) {
      logger.error('Failed to connect to .NET process', { error: error instanceof Error ? error.message : String(error) });
      return {
        success: false,
        error: error instanceof Error ? error.message : String(error),
        message: 'Failed to connect to .NET process'
      };
    }
  }
};

/**
 * Get all .NET processes available for debugging
 */
export const debug_getDotNetProcesses = {
  name: 'debug_getDotNetProcesses',
  description: 'Get all .NET processes available for debugging with framework and version detection',
  inputSchema: z.object({
    includeSystemProcesses: z.boolean().optional().default(false).describe('Include system .NET processes'),
    filterByFramework: z.enum(['aspnetcore', 'wpf', 'winforms', 'blazor-server', 'blazor-wasm', 'maui', 'unity', 'console', 'library']).optional().describe('Filter by specific framework'),
    filterByVersion: z.enum(['netframework4.0', 'netframework4.5', 'netframework4.6', 'netframework4.7', 'netframework4.8', 'netcore3.1', 'net5.0', 'net6.0', 'net7.0', 'net8.0', 'net9.0']).optional().describe('Filter by specific .NET version'),
    includeDebuggableOnly: z.boolean().optional().default(true).describe('Only include processes that can be debugged')
  }),
  handler: async (args: any) => {
    try {
      const dotnetDebugger = getDotNetDebugger();
      let processes = await dotnetDebugger.getAllDotNetProcesses();

      // Apply filters
      if (args.filterByFramework) {
        processes = processes.filter(p => p.framework === args.filterByFramework);
      }

      if (args.filterByVersion) {
        processes = processes.filter(p => p.version === args.filterByVersion);
      }

      if (args.includeDebuggableOnly) {
        processes = processes.filter(p => p.isDebuggable);
      }

      if (!args.includeSystemProcesses) {
        // Filter out common system processes
        const systemProcesses = ['w3wp.exe', 'iisexpress.exe', 'devenv.exe'];
        processes = processes.filter(p => !systemProcesses.includes(p.name.toLowerCase()));
      }

      // Group by framework for better organization
      const groupedProcesses = processes.reduce((groups, process) => {
        const framework = process.framework;
        if (!groups[framework]) {
          groups[framework] = [];
        }
        groups[framework].push(process);
        return groups;
      }, {} as Record<string, DotNetProcessInfo[]>);

      return {
        success: true,
        processes,
        groupedByFramework: groupedProcesses,
        summary: {
          total: processes.length,
          byFramework: Object.keys(groupedProcesses).reduce((summary, framework) => {
            summary[framework] = groupedProcesses[framework]?.length || 0;
            return summary;
          }, {} as Record<string, number>),
          byVersion: processes.reduce((summary, process) => {
            summary[process.version] = (summary[process.version] || 0) + 1;
            return summary;
          }, {} as Record<string, number>)
        },
        message: `Found ${processes.length} .NET processes available for debugging`
      };
    } catch (error) {
      logger.error('Failed to get .NET processes', { error: error instanceof Error ? error.message : String(error) });
      return {
        success: false,
        error: error instanceof Error ? error.message : String(error),
        message: 'Failed to get .NET processes'
      };
    }
  }
};

/**
 * Inspect a .NET object with deep property and method analysis
 */
export const debug_inspectDotNetObject = {
  name: 'debug_inspectDotNetObject',
  description: 'Inspect a .NET object with deep analysis of properties, fields, and methods',
  inputSchema: z.object({
    sessionId: z.string().describe('.NET debugging session ID'),
    objectId: z.string().describe('Object ID to inspect'),
    includePrivateMembers: z.boolean().optional().default(false).describe('Include private members in inspection'),
    includeStaticMembers: z.boolean().optional().default(false).describe('Include static members'),
    includeInheritedMembers: z.boolean().optional().default(true).describe('Include inherited members'),
    maxDepth: z.number().optional().default(3).describe('Maximum depth for nested object inspection'),
    evaluateProperties: z.boolean().optional().default(true).describe('Evaluate property values')
  }),
  handler: async (args: any) => {
    try {
      const dotnetDebugger = getDotNetDebugger();
      const objectInfo = await dotnetDebugger.inspectObject(args.sessionId, args.objectId);

      // Filter members based on options
      let properties = objectInfo.properties;
      let fields = objectInfo.fields;
      let methods = objectInfo.methods;

      if (!args.includePrivateMembers) {
        properties = properties.filter(p => p.isPublic);
        fields = fields.filter(f => f.isPublic);
        methods = methods.filter(m => m.isPublic);
      }

      if (!args.includeStaticMembers) {
        properties = properties.filter(p => !p.isStatic);
        fields = fields.filter(f => !f.isStatic);
        methods = methods.filter(m => !m.isStatic);
      }

      const analysis = {
        typeInfo: {
          name: objectInfo.type,
          isPrimitive: objectInfo.isPrimitive,
          isArray: objectInfo.isArray,
          isCollection: objectInfo.isCollection,
          isNull: objectInfo.isNull,
          length: objectInfo.length
        },
        memberCounts: {
          properties: properties.length,
          fields: fields.length,
          methods: methods.length,
          total: properties.length + fields.length + methods.length
        },
        capabilities: {
          canModify: properties.some(p => p.canWrite) || fields.some(f => !f.isReadOnly),
          hasIndexer: objectInfo.isArray || objectInfo.isCollection,
          hasAsyncMethods: methods.some(m => m.isAsync),
          hasGenericMethods: methods.some(m => m.isGeneric)
        }
      };

      return {
        success: true,
        objectInfo: {
          ...objectInfo,
          properties,
          fields,
          methods
        },
        analysis,
        options: {
          includePrivateMembers: args.includePrivateMembers,
          includeStaticMembers: args.includeStaticMembers,
          includeInheritedMembers: args.includeInheritedMembers,
          maxDepth: args.maxDepth
        },
        message: `Inspected .NET object of type ${objectInfo.type} with ${analysis.memberCounts.total} members`
      };
    } catch (error) {
      logger.error('Failed to inspect .NET object', { error: error instanceof Error ? error.message : String(error) });
      return {
        success: false,
        error: error instanceof Error ? error.message : String(error),
        message: 'Failed to inspect .NET object'
      };
    }
  }
};

/**
 * Evaluate C# expressions with advanced features
 */
export const debug_evaluateCSharpExpression = {
  name: 'debug_evaluateCSharpExpression',
  description: 'Evaluate C# expressions with support for async/await, LINQ, and complex objects',
  inputSchema: z.object({
    sessionId: z.string().describe('.NET debugging session ID'),
    expression: z.string().describe('C# expression to evaluate'),
    frameId: z.string().optional().describe('Stack frame ID for context (current frame if not specified)'),
    timeout: z.number().optional().default(5000).describe('Evaluation timeout in milliseconds'),
    allowSideEffects: z.boolean().optional().default(false).describe('Allow expressions with side effects'),
    returnFullObject: z.boolean().optional().default(false).describe('Return full object details instead of just display value'),
    enableLinqDebugging: z.boolean().optional().default(true).describe('Enable LINQ query debugging'),
    enableAsyncEvaluation: z.boolean().optional().default(true).describe('Enable async expression evaluation')
  }),
  handler: async (args: any) => {
    try {
      const dotnetDebugger = getDotNetDebugger();
      const result = await dotnetDebugger.evaluateExpression(args.sessionId, args.expression, args.frameId);

      // Analyze the expression
      const analysis = {
        isAsync: result.isAsync,
        isLinqQuery: args.expression.includes('.Where(') || args.expression.includes('.Select(') || args.expression.includes('.OrderBy('),
        isMethodCall: args.expression.includes('(') && args.expression.includes(')'),
        isPropertyAccess: args.expression.includes('.') && !args.expression.includes('('),
        hasLambda: args.expression.includes('=>'),
        complexity: args.expression.length > 100 ? 'high' : args.expression.length > 50 ? 'medium' : 'low'
      };

      // Enhanced result with debugging information
      const enhancedResult = {
        ...result,
        analysis,
        debugInfo: {
          executionTime: result.executionTime,
          timeout: args.timeout,
          allowedSideEffects: args.allowSideEffects,
          evaluationContext: args.frameId || 'current-frame'
        }
      };

      return {
        success: result.success,
        result: enhancedResult,
        expression: args.expression,
        options: {
          timeout: args.timeout,
          allowSideEffects: args.allowSideEffects,
          returnFullObject: args.returnFullObject,
          enableLinqDebugging: args.enableLinqDebugging,
          enableAsyncEvaluation: args.enableAsyncEvaluation
        },
        message: result.success
          ? `Expression evaluated successfully in ${result.executionTime}ms: ${result.displayValue}`
          : `Expression evaluation failed: ${result.error}`
      };
    } catch (error) {
      logger.error('Failed to evaluate C# expression', { error: error instanceof Error ? error.message : String(error) });
      return {
        success: false,
        error: error instanceof Error ? error.message : String(error),
        message: 'Failed to evaluate C# expression'
      };
    }
  }
};

/**
 * Get loaded .NET assemblies with detailed information
 */
export const debug_getDotNetAssemblies = {
  name: 'debug_getDotNetAssemblies',
  description: 'Get detailed information about loaded .NET assemblies including types and metadata',
  inputSchema: z.object({
    sessionId: z.string().describe('.NET debugging session ID'),
    includeSystemAssemblies: z.boolean().optional().default(false).describe('Include system assemblies (mscorlib, System.*, etc.)'),
    includeGACAssemblies: z.boolean().optional().default(false).describe('Include Global Assembly Cache assemblies'),
    includeDynamicAssemblies: z.boolean().optional().default(true).describe('Include dynamically generated assemblies'),
    includeTypeInformation: z.boolean().optional().default(true).describe('Include detailed type information'),
    filterByName: z.string().optional().describe('Filter assemblies by name pattern'),
    sortBy: z.enum(['name', 'version', 'location', 'size']).optional().default('name').describe('Sort assemblies by specified field')
  }),
  handler: async (args: any) => {
    try {
      const dotnetDebugger = getDotNetDebugger();
      let assemblies = await dotnetDebugger.getAssemblies(args.sessionId);

      // Apply filters
      if (!args.includeSystemAssemblies) {
        const systemAssemblyPrefixes = ['mscorlib', 'System.', 'Microsoft.', 'netstandard'];
        assemblies = assemblies.filter(asm =>
          !systemAssemblyPrefixes.some(prefix => asm.name.startsWith(prefix))
        );
      }

      if (!args.includeGACAssemblies) {
        assemblies = assemblies.filter(asm => !asm.isGAC);
      }

      if (!args.includeDynamicAssemblies) {
        assemblies = assemblies.filter(asm => !asm.isDynamic);
      }

      if (args.filterByName) {
        const pattern = new RegExp(args.filterByName, 'i');
        assemblies = assemblies.filter(asm => pattern.test(asm.name));
      }

      // Sort assemblies
      assemblies.sort((a, b) => {
        switch (args.sortBy) {
          case 'version':
            return a.version.localeCompare(b.version);
          case 'location':
            return a.location.localeCompare(b.location);
          case 'name':
          default:
            return a.name.localeCompare(b.name);
        }
      });

      // Generate summary statistics
      const summary = {
        total: assemblies.length,
        byType: {
          gac: assemblies.filter(asm => asm.isGAC).length,
          dynamic: assemblies.filter(asm => asm.isDynamic).length,
          withSymbols: assemblies.filter(asm => asm.hasSymbols).length,
          userAssemblies: assemblies.filter(asm => !asm.isGAC && !asm.isDynamic).length
        },
        frameworks: [...new Set(assemblies.map(asm => {
          // Extract framework from location or name
          if (asm.location.includes('Microsoft.NET')) return '.NET Framework';
          if (asm.location.includes('dotnet')) return '.NET Core';
          return 'Unknown';
        }))],
        totalTypes: assemblies.reduce((sum, asm) => sum + asm.types.length, 0),
        totalModules: assemblies.reduce((sum, asm) => sum + asm.modules.length, 0)
      };

      return {
        success: true,
        assemblies: args.includeTypeInformation ? assemblies : assemblies.map(asm => ({
          ...asm,
          types: [], // Exclude type information if not requested
          modules: asm.modules.map(mod => ({ ...mod })) // Keep module info
        })),
        summary,
        filters: {
          includeSystemAssemblies: args.includeSystemAssemblies,
          includeGACAssemblies: args.includeGACAssemblies,
          includeDynamicAssemblies: args.includeDynamicAssemblies,
          includeTypeInformation: args.includeTypeInformation,
          filterByName: args.filterByName,
          sortBy: args.sortBy
        },
        message: `Found ${assemblies.length} loaded assemblies with ${summary.totalTypes} types`
      };
    } catch (error) {
      logger.error('Failed to get .NET assemblies', { error: error instanceof Error ? error.message : String(error) });
      return {
        success: false,
        error: error instanceof Error ? error.message : String(error),
        message: 'Failed to get .NET assemblies'
      };
    }
  }
};

/**
 * Set advanced breakpoints with C# specific features
 */
export const debug_setDotNetBreakpoint = {
  name: 'debug_setDotNetBreakpoint',
  description: 'Set advanced breakpoints in .NET code with support for async methods, LINQ, and conditional breaking',
  inputSchema: z.object({
    sessionId: z.string().describe('.NET debugging session ID'),
    file: z.string().describe('Source file path'),
    line: z.number().describe('Line number'),
    column: z.number().optional().describe('Column number (optional)'),
    condition: z.string().optional().describe('Conditional expression for breakpoint'),
    hitCondition: z.string().optional().describe('Hit count condition (e.g., ">= 5", "== 10")'),
    logMessage: z.string().optional().describe('Message to log when breakpoint is hit'),
    enabled: z.boolean().optional().default(true).describe('Whether breakpoint is enabled'),
    breakOnAsyncException: z.boolean().optional().default(false).describe('Break on async exceptions in this method'),
    breakOnLinqExecution: z.boolean().optional().default(false).describe('Break on LINQ query execution'),
    assembly: z.string().optional().describe('Specific assembly name to target'),
    method: z.string().optional().describe('Specific method name to target')
  }),
  handler: async (args: any) => {
    try {
      const dotnetDebugger = getDotNetDebugger();
      const breakpoint = await dotnetDebugger.setBreakpoint(
        args.sessionId,
        args.file,
        args.line,
        args.condition
      );

      // Enhance breakpoint with .NET specific information
      const enhancedBreakpoint = {
        ...breakpoint,
        column: args.column,
        hitCondition: args.hitCondition,
        logMessage: args.logMessage,
        enabled: args.enabled,
        dotnetSpecific: {
          breakOnAsyncException: args.breakOnAsyncException,
          breakOnLinqExecution: args.breakOnLinqExecution,
          targetAssembly: args.assembly,
          targetMethod: args.method
        }
      };

      return {
        success: true,
        breakpoint: enhancedBreakpoint,
        location: {
          file: args.file,
          line: args.line,
          column: args.column,
          assembly: args.assembly,
          method: args.method
        },
        features: {
          conditional: !!args.condition,
          hitCount: !!args.hitCondition,
          logging: !!args.logMessage,
          asyncSupport: args.breakOnAsyncException,
          linqSupport: args.breakOnLinqExecution
        },
        message: `Breakpoint set at ${args.file}:${args.line}${args.condition ? ` with condition: ${args.condition}` : ''}`
      };
    } catch (error) {
      logger.error('Failed to set .NET breakpoint', { error: error instanceof Error ? error.message : String(error) });
      return {
        success: false,
        error: error instanceof Error ? error.message : String(error),
        message: 'Failed to set .NET breakpoint'
      };
    }
  }
};

/**
 * Enable and configure hot reload for .NET applications
 */
export const debug_enableDotNetHotReload = {
  name: 'debug_enableDotNetHotReload',
  description: 'Enable and configure hot reload for supported .NET applications',
  inputSchema: z.object({
    sessionId: z.string().describe('.NET debugging session ID'),
    watchPaths: z.array(z.string()).optional().describe('Specific paths to watch for changes'),
    excludePatterns: z.array(z.string()).optional().default(['bin/**', 'obj/**', '*.tmp']).describe('File patterns to exclude from watching'),
    enableAutoReload: z.boolean().optional().default(true).describe('Automatically apply changes when detected'),
    reloadTimeout: z.number().optional().default(5000).describe('Timeout for reload operations in milliseconds'),
    enableVerboseLogging: z.boolean().optional().default(false).describe('Enable verbose hot reload logging')
  }),
  handler: async (args: any) => {
    try {
      const dotnetDebugger = getDotNetDebugger();
      const hotReloadInfo = await dotnetDebugger.enableHotReload(args.sessionId);

      const configuration = {
        watchPaths: args.watchPaths || ['**/*.cs', '**/*.razor', '**/*.cshtml'],
        excludePatterns: args.excludePatterns,
        enableAutoReload: args.enableAutoReload,
        reloadTimeout: args.reloadTimeout,
        enableVerboseLogging: args.enableVerboseLogging
      };

      return {
        success: true,
        hotReloadInfo,
        configuration,
        capabilities: {
          supported: hotReloadInfo.supported,
          enabled: hotReloadInfo.enabled,
          autoReload: args.enableAutoReload,
          verboseLogging: args.enableVerboseLogging
        },
        message: hotReloadInfo.supported
          ? 'Hot reload enabled successfully'
          : 'Hot reload not supported for this application type'
      };
    } catch (error) {
      logger.error('Failed to enable .NET hot reload', { error: error instanceof Error ? error.message : String(error) });
      return {
        success: false,
        error: error instanceof Error ? error.message : String(error),
        message: 'Failed to enable .NET hot reload'
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
