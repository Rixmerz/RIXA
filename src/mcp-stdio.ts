#!/usr/bin/env node

import { Server } from '@modelcontextprotocol/sdk/server/index.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import {
  CallToolRequestSchema,
  ListToolsRequestSchema
} from '@modelcontextprotocol/sdk/types.js';

import { SessionManager } from './core/session.js';
import { EnhancedDebugTools } from './core/enhanced-tools.js';
import os from 'os';
import { existsSync } from 'fs';
import { access } from 'fs/promises';
import { spawnSync } from 'child_process';
import { createServer } from 'node:net';
import { sync as globSync } from 'glob';
import { analyzeJavaProject, detectActiveDebugPorts } from './java/enhanced-detection.js';
import { JDWPValidator, scanForJDWPAgents } from './java/jdwp-validator.js';
import { HybridDebugger } from './java/hybrid-debugger.js';
import { AdvancedErrorRecovery } from './java/error-recovery.js';
import { PortManager } from './java/port-manager.js';
import { ConnectionManager } from './java/connection-manager.js';
import { InteractiveTroubleshooter } from './java/interactive-troubleshooter.js';
import type { HybridDebugConfig } from './java/hybrid-debugger.js';
import type { DebugError, RecoveryContext } from './java/error-recovery.js';
import { LanguageDispatcher, type SupportedLanguage } from './core/language-dispatcher.js';


// Do not log to stdout/stderr in stdio mode; MCP expects only JSON-RPC
const noop = () => {};
console.log = noop;
console.info = noop;
console.warn = noop;
console.error = noop;

// Minimal no-op Logger implementation compatible with our interfaces
interface NoopLogger {
  error: (message: string, meta?: Record<string, unknown>) => void;
  warn: (message: string, meta?: Record<string, unknown>) => void;
  info: (message: string, meta?: Record<string, unknown>) => void;
  debug: (message: string, meta?: Record<string, unknown>) => void;
  child: (ctx: Record<string, unknown>) => NoopLogger;
}
const logger: NoopLogger = {
  error: noop,
  warn: noop,
  info: noop,
  debug: noop,
  child: () => logger,
};

// Helper: adapter command/args (aligned with integration layer)
function getAdapterCommand(adapter: string): string {
  const commands: Record<string, string> = {
    node: 'node',
    python: 'python',
    java: getJavaDebugAdapter(), // Auto-detect Java Debug Adapter
    go: 'dlv',
    rust: 'rust-gdb',
  };
  return commands[adapter] || adapter;
}

function findJavaDebugAdapterJar(): string | null {
  // Common locations for Java Debug Adapter
  const searchPaths = [
    // VS Code extensions (macOS/Linux)
    `${process.env['HOME']}/.vscode/extensions/vscjava.vscode-java-debug-*/server/com.microsoft.java.debug.plugin-*.jar`,
    // VS Code extensions (Windows)
    `${process.env['USERPROFILE']}/.vscode/extensions/vscjava.vscode-java-debug-*/server/com.microsoft.java.debug.plugin-*.jar`,
    // Manual installation locations
    '/usr/local/lib/java-debug-adapter/com.microsoft.java.debug.plugin*.jar',
    '/opt/homebrew/lib/java-debug-adapter/com.microsoft.java.debug.plugin*.jar',
    // Current directory (for development)
    './java-debug-adapter/com.microsoft.java.debug.plugin*.jar',
  ];

  // Try to find the JAR file
  for (const searchPath of searchPaths) {
    try {
      const matches = globSync(searchPath);
      if (matches.length > 0) {
        // Return the first (most recent) match
        const jarPath = matches.sort().reverse()[0];
        if (jarPath && existsSync(jarPath)) {
          return jarPath;
        }
      }
    } catch (error) {
      // Continue searching if glob fails
      continue;
    }
  }

  return null;
}

function getJavaDebugAdapter(): string {
  // Always return 'java' as the command, JAR path goes in args
  return 'java';
}

function detectJavaClasspath(workspaceRoot: string): string[] {
  const classpaths = [workspaceRoot];

  try {
    // Look for common Java project structures
    const commonPaths = [
      `${workspaceRoot}/target/classes`,     // Maven
      `${workspaceRoot}/build/classes`,      // Gradle
      `${workspaceRoot}/out/production`,     // IntelliJ
      `${workspaceRoot}/bin`,                // Eclipse
      `${workspaceRoot}/classes`,            // Generic
    ];

    for (const path of commonPaths) {
      if (existsSync(path)) {
        classpaths.push(path);
      }
    }

    // Look for JAR dependencies
    const libPaths = [
      `${workspaceRoot}/lib`,
      `${workspaceRoot}/target/dependency`,
      `${workspaceRoot}/build/libs`,
    ];

    for (const libPath of libPaths) {
      if (existsSync(libPath)) {
        try {
          const jars = globSync(`${libPath}/**/*.jar`);
          classpaths.push(...jars);
        } catch (error) {
          // Continue if glob fails
        }
      }
    }
  } catch (error) {
    // Return basic classpath if detection fails
  }

  return classpaths;
}
function getAdapterArgs(adapter: string): string[] {
  if (adapter === 'java') {
    const jarPath = findJavaDebugAdapterJar();
    if (jarPath) {
      return ['-jar', jarPath];
    } else {
      // Return placeholder that will trigger helpful error message
      return ['-jar', '/path/to/com.microsoft.java.debug.plugin.jar'];
    }
  }

  const args: Record<string, string[]> = {
    node: ['--inspect-brk=0'],
    python: ['-m', 'debugpy', '--listen', '0'],
    go: ['dap', '--listen=127.0.0.1:0'],
    rust: ['--batch', '--ex', 'run', '--ex', 'bt', '--args'],
  };
  return args[adapter] || [];
}

async function main() {
  const server = new Server(
    { name: 'rixa', version: '0.1.0' },
    { capabilities: { tools: {} } }
  );

  // Session management (in-memory)
  const sessionManager = new SessionManager(logger as any);
  const enhanced = new EnhancedDebugTools(logger as any);
  const errorStats = { totalErrors: 0 };

  // Language dispatcher for unified debugging
  const languageDispatcher = new LanguageDispatcher(logger as any);

  // Diagnostics helpers
  const adapters = {
    node: { cmd: 'node', args: ['--version'], prerequisite: 'node (>=16)', install: 'https://nodejs.org' },
    python: { cmd: 'python', args: ['-m', 'debugpy', '--version'], prerequisite: 'python + debugpy', install: 'pip install debugpy' },
    java: { cmd: 'java', args: ['-version'], prerequisite: 'java (>=8) + Microsoft Java Debug Adapter', install: 'Download from: https://github.com/microsoft/java-debug/releases' },
    go: { cmd: 'dlv', args: ['version'], prerequisite: 'delve (dlv)', install: 'go install github.com/go-delve/delve/cmd/dlv@latest' },
    rust: { cmd: 'rust-gdb', args: ['--version'], prerequisite: 'rust + gdb', install: 'https://rustup.rs' },
  } as const;

  function checkCmd(cmd: string, args: ReadonlyArray<string> | string[]): { ok: boolean; stdout?: string; stderr?: string } {
    try {
      const r = spawnSync(cmd, args, { encoding: 'utf8' });
      return { ok: r.status === 0, stdout: r.stdout?.trim(), stderr: r.stderr?.trim() };
    } catch (e) {
      return { ok: false, stderr: (e as Error).message };
    }
  }

  function runAllowed(command: string, args: string[]): { ok: boolean; stdout: string; stderr: string; code: number } {
    const allowlist: Record<string, string[]> = {
      npm: ['install', '-g', 'node-inspect'],
      pip: ['install', 'debugpy'],
      go: ['install', 'github.com/go-delve/delve/cmd/dlv@latest'],
    };

    const key = command as keyof typeof allowlist;
    if (!(key in allowlist) || JSON.stringify(args) !== JSON.stringify(allowlist[key])) {
      return { ok: false, stdout: '', stderr: 'Command not allowed', code: -1 };
    }

    const res = spawnSync(command, args, { encoding: 'utf8' });
    return { ok: res.status === 0, stdout: (res.stdout || '').trim(), stderr: (res.stderr || '').trim(), code: res.status ?? -1 };
  }

  async function checkPathReadable(p: string): Promise<boolean> {
    try { await access(p); return true; } catch { return false; }
  }

  async function isPortFree(port: number, host = '127.0.0.1'): Promise<boolean> {
    return new Promise(resolve => {
      const server = createServer();
      server.once('error', () => resolve(false));
      server.listen(port, host, () => {
        server.close(() => resolve(true));
      });
    });
  }

  // Tool catalog (27 tools)
  const tools = [
    { name: 'debug_ping', description: 'Ping the RIXA MCP server', inputSchema: { type: 'object', properties: { message: { type: 'string' } } } },
    { name: 'debug_version', description: 'Return RIXA version info', inputSchema: { type: 'object', properties: {} } },
    { name: 'debug_createSession', description: 'Create and launch a new debug session', inputSchema: { type: 'object', properties: { adapter: { type: 'string' }, program: { type: 'string' }, args: { type: 'array', items: { type: 'string' } }, cwd: { type: 'string' }, env: { type: 'object' } }, required: ['adapter', 'program'] } },
    { name: 'debug_attachSession', description: 'Create and attach to an existing debug session with intelligent conflict resolution', inputSchema: { type: 'object', properties: { adapter: { type: 'string' }, port: { type: 'number' }, host: { type: 'string' }, processId: { type: 'number' }, cwd: { type: 'string' }, env: { type: 'object' }, forceConnect: { type: 'boolean' }, observerMode: { type: 'boolean' } }, required: ['adapter'] } },
    { name: 'debug_continue', description: 'Continue execution', inputSchema: { type: 'object', properties: { sessionId: { type: 'string' }, threadId: { type: 'number' }, singleThread: { type: 'boolean' } }, required: ['sessionId', 'threadId'] } },
    { name: 'debug_pause', description: 'Pause execution', inputSchema: { type: 'object', properties: { sessionId: { type: 'string' }, threadId: { type: 'number' } }, required: ['sessionId', 'threadId'] } },
    { name: 'debug_stepOver', description: 'Step over (next line)', inputSchema: { type: 'object', properties: { sessionId: { type: 'string' }, threadId: { type: 'number' }, granularity: { type: 'string', enum: ['statement','line','instruction'] } }, required: ['sessionId','threadId'] } },
    { name: 'debug_stepIn', description: 'Step into function', inputSchema: { type: 'object', properties: { sessionId: { type: 'string' }, threadId: { type: 'number' }, granularity: { type: 'string', enum: ['statement','line','instruction'] } }, required: ['sessionId','threadId'] } },
    { name: 'debug_stepOut', description: 'Step out of function', inputSchema: { type: 'object', properties: { sessionId: { type: 'string' }, threadId: { type: 'number' }, granularity: { type: 'string', enum: ['statement','line','instruction'] } }, required: ['sessionId','threadId'] } },
    { name: 'debug_setBreakpoints', description: 'Set breakpoints in a file', inputSchema: { type: 'object', properties: { sessionId: { type: 'string' }, source: { type: 'object', properties: { path: { type: 'string' }, name: { type: 'string' } }, required: ['path'] }, breakpoints: { type: 'array', items: { type: 'object', properties: { line: { type: 'number' }, column: { type: 'number' }, condition: { type: 'string' }, hitCondition: { type: 'string' }, logMessage: { type: 'string' } }, required: ['line'] } } }, required: ['sessionId','source','breakpoints'] } },
    { name: 'debug_getThreads', description: 'Get all threads', inputSchema: { type: 'object', properties: { sessionId: { type: 'string' } }, required: ['sessionId'] } },
    { name: 'debug_getStackTrace', description: 'Get stack trace for a thread', inputSchema: { type: 'object', properties: { sessionId: { type: 'string' }, threadId: { type: 'number' }, startFrame: { type: 'number' }, levels: { type: 'number' } }, required: ['sessionId','threadId'] } },
    { name: 'debug_getVariables', description: 'Get variables for a scope', inputSchema: { type: 'object', properties: { sessionId: { type: 'string' }, variablesReference: { type: 'number' }, filter: { type: 'string', enum: ['indexed','named'] }, start: { type: 'number' }, count: { type: 'number' } }, required: ['sessionId','variablesReference'] } },

    { name: 'debug_terminate', description: 'Terminate session', inputSchema: { type: 'object', properties: { sessionId: { type: 'string' } }, required: ['sessionId'] } },
    // Enhanced
    { name: 'debug_getEnhancedStackTrace', description: 'Enhanced stack trace with scopes and variables', inputSchema: { type: 'object', properties: { sessionId: { type: 'string' }, threadId: { type: 'number' }, includeScopes: { type: 'boolean' }, includeVariables: { type: 'boolean' } }, required: ['sessionId','threadId'] } },
    { name: 'debug_getEnhancedVariables', description: 'Enhanced variables with hierarchy', inputSchema: { type: 'object', properties: { sessionId: { type: 'string' }, variablesReference: { type: 'number' }, maxDepth: { type: 'number' } }, required: ['sessionId','variablesReference'] } },
    { name: 'debug_evaluateEnhanced', description: 'Enhanced evaluate', inputSchema: { type: 'object', properties: { sessionId: { type: 'string' }, expression: { type: 'string' }, frameId: { type: 'number' }, context: { type: 'string', enum: ['watch','repl','hover','clipboard'] } }, required: ['sessionId','expression'] } },
    // Error stats
    { name: 'debug_getErrorStats', description: 'Get error statistics', inputSchema: { type: 'object', properties: {}, required: [] } },
    { name: 'debug_resetErrorStats', description: 'Reset error statistics', inputSchema: { type: 'object', properties: {}, required: [] } },
    // Diagnostics
    { name: 'debug_validateEnvironment', description: 'Validate environment and prerequisites', inputSchema: { type: 'object', properties: { program: { type: 'string' }, cwd: { type: 'string' } } } },
    { name: 'debug_listAdapters', description: 'List supported debug adapters with availability', inputSchema: { type: 'object', properties: {} } },
    { name: 'debug_testAdapter', description: 'Test a specific adapter availability', inputSchema: { type: 'object', properties: { lang: { type: 'string', enum: ['node','python','java','go','rust'] } }, required: ['lang'] } },
    { name: 'debug_prerequisites', description: 'Show prerequisites and install hints for a language', inputSchema: { type: 'object', properties: { lang: { type: 'string', enum: ['node','python','java','go','rust'] } }, required: ['lang'] } },
    { name: 'debug_diagnose', description: 'Run a full diagnostic suite', inputSchema: { type: 'object', properties: { program: { type: 'string' }, cwd: { type: 'string' } } } },
    { name: 'debug_health', description: 'Quick health summary', inputSchema: { type: 'object', properties: {} } },
    { name: 'debug_checkPorts', description: 'Check common debugger ports availability', inputSchema: { type: 'object', properties: { lang: { type: 'string', enum: ['node','python','java','go','rust'] } } } },
    { name: 'debug_setup', description: 'Non-interactive setup wizard (dry run or fixes)', inputSchema: { type: 'object', properties: { installMissing: { type: 'boolean' }, execute: { type: 'boolean' }, lang: { type: 'string', enum: ['node','python','java','go','rust'] }, confirm: { type: 'string' } } } },
    { name: 'debug_diagnoseJavaEnvironment', description: 'Comprehensive Java debugging environment diagnosis', inputSchema: { type: 'object', properties: { workspaceRoot: { type: 'string' } } } },
    { name: 'debug_enhancedJavaDetection', description: 'Enhanced Java project detection and analysis', inputSchema: { type: 'object', properties: { workspaceRoot: { type: 'string' } }, required: ['workspaceRoot'] } },
    { name: 'debug_validateJDWPConnection', description: 'Validate JDWP connection with retry logic', inputSchema: { type: 'object', properties: { host: { type: 'string' }, port: { type: 'number' }, timeout: { type: 'number' }, retryAttempts: { type: 'number' } }, required: ['host', 'port'] } },
    { name: 'debug_scanJDWPAgents', description: 'Scan for active JDWP debug agents', inputSchema: { type: 'object', properties: { portStart: { type: 'number' }, portEnd: { type: 'number' } } } },
    { name: 'debug_startHybridDebugging', description: 'Start hybrid debugging with log analysis and API testing', inputSchema: { type: 'object', properties: { workspaceRoot: { type: 'string' }, applicationUrl: { type: 'string' }, logFiles: { type: 'array', items: { type: 'string' } }, apiEndpoints: { type: 'array', items: { type: 'string' } } }, required: ['workspaceRoot'] } },
    { name: 'debug_stopHybridDebugging', description: 'Stop hybrid debugging session', inputSchema: { type: 'object', properties: {} } },
    { name: 'debug_executeApiTest', description: 'Execute API test for debugging', inputSchema: { type: 'object', properties: { endpoint: { type: 'string' }, method: { type: 'string' }, data: { type: 'object' } }, required: ['endpoint'] } },
    { name: 'debug_addBreakpointSimulation', description: 'Add breakpoint simulation for log analysis', inputSchema: { type: 'object', properties: { className: { type: 'string' }, methodName: { type: 'string' }, logLevel: { type: 'string', enum: ['INFO', 'DEBUG', 'WARN', 'ERROR'] } }, required: ['className', 'methodName'] } },
    { name: 'debug_attemptErrorRecovery', description: 'Attempt automatic error recovery with fallback strategies', inputSchema: { type: 'object', properties: { errorType: { type: 'string', enum: ['connection', 'handshake', 'configuration', 'timeout', 'unknown'] }, errorMessage: { type: 'string' }, workspaceRoot: { type: 'string' } }, required: ['errorType', 'errorMessage', 'workspaceRoot'] } },
    { name: 'debug_getTroubleshootingGuide', description: 'Get troubleshooting guide for debugging issues', inputSchema: { type: 'object', properties: { problemType: { type: 'string' } }, required: ['problemType'] } },
    { name: 'debug_scanPortsAdvanced', description: 'Advanced port scanning with detailed information', inputSchema: { type: 'object', properties: { portStart: { type: 'number' }, portEnd: { type: 'number' }, deepScan: { type: 'boolean' } } } },
    { name: 'debug_createAdvancedConnection', description: 'Create debug connection with intelligent conflict resolution', inputSchema: { type: 'object', properties: { host: { type: 'string' }, port: { type: 'number' }, type: { type: 'string', enum: ['jdwp', 'hybrid', 'auto'] }, handleConflicts: { type: 'boolean' }, observerMode: { type: 'boolean' }, projectPath: { type: 'string' } }, required: ['port'] } },
    { name: 'debug_listActiveSessions', description: 'List all active debug sessions', inputSchema: { type: 'object', properties: {} } },
    { name: 'debug_disconnectSession', description: 'Disconnect a debug session', inputSchema: { type: 'object', properties: { sessionId: { type: 'string' } }, required: ['sessionId'] } },
    { name: 'debug_startInteractiveTroubleshooting', description: 'Start interactive troubleshooting session', inputSchema: { type: 'object', properties: { problem: { type: 'string' }, workspaceRoot: { type: 'string' }, targetPort: { type: 'number' } }, required: ['problem', 'workspaceRoot'] } },
    { name: 'debug_getTroubleshootingSession', description: 'Get troubleshooting session status', inputSchema: { type: 'object', properties: { sessionId: { type: 'string' } }, required: ['sessionId'] } },
    { name: 'debug_runComprehensiveDiagnostics', description: 'Run comprehensive diagnostics on Java environment', inputSchema: { type: 'object', properties: { workspaceRoot: { type: 'string' } }, required: ['workspaceRoot'] } },
    { name: 'debug_suggestPortResolution', description: 'Suggest resolution for port conflicts', inputSchema: { type: 'object', properties: { port: { type: 'number' } }, required: ['port'] } },
    { name: 'debug_startPortMonitoring', description: 'Start continuous port monitoring', inputSchema: { type: 'object', properties: { intervalMs: { type: 'number' } } } },
    { name: 'debug_stopPortMonitoring', description: 'Stop port monitoring', inputSchema: { type: 'object', properties: {} } },
    { name: 'debug_validateJDWPConnectionEnhanced', description: 'Enhanced JDWP validation with agent detection and conflict analysis', inputSchema: { type: 'object', properties: { host: { type: 'string' }, port: { type: 'number' }, timeout: { type: 'number' }, retryAttempts: { type: 'number' } }, required: ['port'] } },
    { name: 'debug_verifyPortStatus', description: 'Verify actual port status with comprehensive system-level checks', inputSchema: { type: 'object', properties: { port: { type: 'number' }, includeProcessDetails: { type: 'boolean' } }, required: ['port'] } },

    // Generalized Language Debugging Tools
    { name: 'debug_connect', description: 'Connect to debugging session for any supported language', inputSchema: { type: 'object', properties: { language: { type: 'string', enum: ['javascript', 'typescript', 'node', 'react', 'nextjs', 'java', 'python', 'go', 'rust', 'csharp', 'dotnet'] }, host: { type: 'string' }, port: { type: 'number' }, framework: { type: 'string' }, enableFrameworkTools: { type: 'boolean' } }, required: ['language'] } },
    { name: 'debug_getSessions', description: 'Get all active debugging sessions across all languages', inputSchema: { type: 'object', properties: {} } },
    { name: 'debug_setBreakpoint', description: 'Set breakpoint in code for any language', inputSchema: { type: 'object', properties: { sessionId: { type: 'string' }, url: { type: 'string' }, lineNumber: { type: 'number' }, condition: { type: 'string' }, className: { type: 'string' }, methodName: { type: 'string' } }, required: ['sessionId'] } },
    { name: 'debug_evaluate', description: 'Evaluate expression in debugging context for any language', inputSchema: { type: 'object', properties: { sessionId: { type: 'string' }, expression: { type: 'string' }, contextId: { type: 'number' }, frameId: { type: 'number' } }, required: ['sessionId', 'expression'] } },

    // Framework-Specific Operations (works with any supported framework)
    { name: 'debug_getComponents', description: 'Get component tree for framework (React, Vue, etc.)', inputSchema: { type: 'object', properties: { sessionId: { type: 'string' }, framework: { type: 'string' } }, required: ['sessionId'] } },
    { name: 'debug_getComponentDetails', description: 'Get component state, props, hooks for any framework', inputSchema: { type: 'object', properties: { sessionId: { type: 'string' }, componentName: { type: 'string' }, detailType: { type: 'string', enum: ['state', 'props', 'hooks', 'all'] } }, required: ['sessionId', 'componentName'] } },
    { name: 'debug_setComponentBreakpoint', description: 'Set breakpoint on component render for any framework', inputSchema: { type: 'object', properties: { sessionId: { type: 'string' }, componentName: { type: 'string' } }, required: ['sessionId', 'componentName'] } },
    { name: 'debug_startProfiling', description: 'Start performance profiling for any language/framework', inputSchema: { type: 'object', properties: { sessionId: { type: 'string' }, profilingType: { type: 'string', enum: ['performance', 'memory', 'cpu', 'render'] } }, required: ['sessionId'] } },
    { name: 'debug_stopProfiling', description: 'Stop performance profiling and get results', inputSchema: { type: 'object', properties: { sessionId: { type: 'string' } }, required: ['sessionId'] } },

    // Framework-Specific Advanced Operations
    { name: 'debug_getFrameworkInfo', description: 'Get framework-specific information (Next.js pages, Django views, etc.)', inputSchema: { type: 'object', properties: { sessionId: { type: 'string' }, infoType: { type: 'string', enum: ['pageInfo', 'routeInfo', 'hydrationInfo', 'bundleAnalysis', 'apiCalls'] } }, required: ['sessionId', 'infoType'] } },
    { name: 'debug_analyzeFrameworkIssues', description: 'Analyze framework-specific issues (hydration mismatches, etc.)', inputSchema: { type: 'object', properties: { sessionId: { type: 'string' }, analysisType: { type: 'string', enum: ['hydrationMismatches', 'performanceBottlenecks', 'memoryLeaks', 'bundleSize'] } }, required: ['sessionId', 'analysisType'] } },
    { name: 'debug_getPerformanceMetrics', description: 'Get performance metrics for any language/framework', inputSchema: { type: 'object', properties: { sessionId: { type: 'string' }, metricsType: { type: 'string', enum: ['general', 'memory', 'cpu', 'network', 'async', 'rendering'] } }, required: ['sessionId'] } },

    // Async/Concurrency Debugging (works for all languages)
    { name: 'debug_startAsyncTracking', description: 'Start tracking async operations for any language', inputSchema: { type: 'object', properties: { sessionId: { type: 'string' }, trackingType: { type: 'string', enum: ['promises', 'threads', 'goroutines', 'tasks', 'futures'] } }, required: ['sessionId'] } },
    { name: 'debug_stopAsyncTracking', description: 'Stop async tracking and get results', inputSchema: { type: 'object', properties: { sessionId: { type: 'string' } }, required: ['sessionId'] } },
    { name: 'debug_getAsyncOperations', description: 'Get tracked async operations for any language', inputSchema: { type: 'object', properties: { sessionId: { type: 'string' }, operationType: { type: 'string', enum: ['all', 'pending', 'completed', 'failed'] } }, required: ['sessionId'] } },
    { name: 'debug_traceAsyncFlow', description: 'Trace async operation flow and dependencies', inputSchema: { type: 'object', properties: { sessionId: { type: 'string' }, rootOperationId: { type: 'string' } }, required: ['sessionId'] } },

    // Universal Debugging Operations
    { name: 'debug_disconnect', description: 'Disconnect from debugging session', inputSchema: { type: 'object', properties: { sessionId: { type: 'string' } }, required: ['sessionId'] } },

    // Diagnostic Tools
    { name: 'debug_diagnoseConnection', description: 'Diagnose connection issues and WebSocket status', inputSchema: { type: 'object', properties: { sessionId: { type: 'string' } }, required: ['sessionId'] } },
    { name: 'debug_diagnoseFramework', description: 'Diagnose framework-specific WebSocket connectivity and capabilities', inputSchema: { type: 'object', properties: { sessionId: { type: 'string' } }, required: ['sessionId'] } },
    { name: 'debug_diagnoseJava', description: 'Diagnose Java-specific debugging capabilities and JDWP connectivity', inputSchema: { type: 'object', properties: { sessionId: { type: 'string' } }, required: ['sessionId'] } },
    { name: 'debug_quickStart', description: 'Quick start debugging with auto-detection', inputSchema: { type: 'object', properties: { projectPath: { type: 'string' }, language: { type: 'string', enum: ['auto', 'javascript', 'typescript', 'node', 'react', 'nextjs', 'java', 'python', 'django', 'go', 'gin', 'rust', 'actix', 'php', 'laravel', 'symfony', 'wordpress'] }, autoBreakpoints: { type: 'array', items: { type: 'string' } } }, required: ['projectPath'] } },

    // Java-specific Tools
    { name: 'debug_setJavaBreakpoint', description: 'Set breakpoint in Java class', inputSchema: { type: 'object', properties: { sessionId: { type: 'string' }, className: { type: 'string' }, lineNumber: { type: 'number' }, condition: { type: 'string' } }, required: ['sessionId', 'className', 'lineNumber'] } },
    { name: 'debug_getJavaThreads', description: 'Get Java application threads', inputSchema: { type: 'object', properties: { sessionId: { type: 'string' } }, required: ['sessionId'] } },
    { name: 'debug_getJavaStackTrace', description: 'Get Java stack trace for thread', inputSchema: { type: 'object', properties: { sessionId: { type: 'string' }, threadId: { type: 'number' } }, required: ['sessionId'] } },
    { name: 'debug_evaluateJavaExpression', description: 'Evaluate Java expression', inputSchema: { type: 'object', properties: { sessionId: { type: 'string' }, expression: { type: 'string' }, frameId: { type: 'number' } }, required: ['sessionId', 'expression'] } },
    { name: 'debug_getJavaPerformanceMetrics', description: 'Get Java application performance metrics', inputSchema: { type: 'object', properties: { sessionId: { type: 'string' }, metricsType: { type: 'string', enum: ['general', 'memory', 'gc', 'threads'] } }, required: ['sessionId'] } },

    // Framework WebSocket Complete Tools
    { name: 'debug_getReactComponentDetails', description: 'Get detailed React component information (state, props, hooks)', inputSchema: { type: 'object', properties: { sessionId: { type: 'string' }, componentName: { type: 'string' }, detailType: { type: 'string', enum: ['all', 'state', 'props', 'hooks'] } }, required: ['sessionId', 'componentName'] } },
    { name: 'debug_setReactComponentBreakpoint', description: 'Set breakpoint on React component render/lifecycle', inputSchema: { type: 'object', properties: { sessionId: { type: 'string' }, componentName: { type: 'string' }, breakpointType: { type: 'string', enum: ['render', 'mount', 'update', 'unmount'] }, condition: { type: 'string' } }, required: ['sessionId', 'componentName'] } },
    { name: 'debug_analyzeNextJsIssues', description: 'Analyze Next.js framework issues (hydration, performance, bundle)', inputSchema: { type: 'object', properties: { sessionId: { type: 'string' }, analysisType: { type: 'string', enum: ['hydrationMismatches', 'performanceBottlenecks', 'bundleSize'] } }, required: ['sessionId', 'analysisType'] } },
    { name: 'debug_getNextJsHydrationInfo', description: 'Get Next.js hydration information and mismatch analysis', inputSchema: { type: 'object', properties: { sessionId: { type: 'string' } }, required: ['sessionId'] } },

    // Python-specific Tools
    { name: 'debug_setPythonBreakpoint', description: 'Set breakpoint in Python file', inputSchema: { type: 'object', properties: { sessionId: { type: 'string' }, file: { type: 'string' }, line: { type: 'number' }, condition: { type: 'string' } }, required: ['sessionId', 'file', 'line'] } },
    { name: 'debug_getPythonThreads', description: 'Get Python application threads', inputSchema: { type: 'object', properties: { sessionId: { type: 'string' } }, required: ['sessionId'] } },
    { name: 'debug_getPythonStackTrace', description: 'Get Python stack trace for thread', inputSchema: { type: 'object', properties: { sessionId: { type: 'string' }, threadId: { type: 'number' } }, required: ['sessionId'] } },
    { name: 'debug_evaluatePythonExpression', description: 'Evaluate Python expression', inputSchema: { type: 'object', properties: { sessionId: { type: 'string' }, expression: { type: 'string' }, frameId: { type: 'number' } }, required: ['sessionId', 'expression'] } },
    { name: 'debug_getPythonPerformanceMetrics', description: 'Get Python application performance metrics', inputSchema: { type: 'object', properties: { sessionId: { type: 'string' }, metricsType: { type: 'string', enum: ['general', 'memory', 'cpu', 'gc'] } }, required: ['sessionId'] } },

    // Django-specific Tools
    { name: 'debug_getDjangoInfo', description: 'Get Django application information (version, settings, apps)', inputSchema: { type: 'object', properties: { sessionId: { type: 'string' } }, required: ['sessionId'] } },
    { name: 'debug_getDjangoModels', description: 'Get Django models information', inputSchema: { type: 'object', properties: { sessionId: { type: 'string' }, appName: { type: 'string' } }, required: ['sessionId'] } },
    { name: 'debug_analyzeDjangoQueries', description: 'Analyze Django ORM queries for performance issues', inputSchema: { type: 'object', properties: { sessionId: { type: 'string' } }, required: ['sessionId'] } },
    { name: 'debug_startDjangoRequestTracking', description: 'Start tracking Django HTTP requests', inputSchema: { type: 'object', properties: { sessionId: { type: 'string' } }, required: ['sessionId'] } },
    { name: 'debug_getDjangoRequests', description: 'Get Django HTTP requests with timing and query information', inputSchema: { type: 'object', properties: { sessionId: { type: 'string' }, limit: { type: 'number' } }, required: ['sessionId'] } },

    // PHP-specific Tools
    { name: 'debug_setPHPBreakpoint', description: 'Set breakpoint in PHP file', inputSchema: { type: 'object', properties: { sessionId: { type: 'string' }, file: { type: 'string' }, line: { type: 'number' }, condition: { type: 'string' } }, required: ['sessionId', 'file', 'line'] } },
    { name: 'debug_getPHPThreads', description: 'Get PHP application threads', inputSchema: { type: 'object', properties: { sessionId: { type: 'string' } }, required: ['sessionId'] } },
    { name: 'debug_getPHPStackTrace', description: 'Get PHP stack trace for thread', inputSchema: { type: 'object', properties: { sessionId: { type: 'string' }, threadId: { type: 'number' } }, required: ['sessionId'] } },
    { name: 'debug_evaluatePHPExpression', description: 'Evaluate PHP expression', inputSchema: { type: 'object', properties: { sessionId: { type: 'string' }, expression: { type: 'string' }, frameId: { type: 'number' } }, required: ['sessionId', 'expression'] } },
    { name: 'debug_getPHPPerformanceMetrics', description: 'Get PHP application performance metrics', inputSchema: { type: 'object', properties: { sessionId: { type: 'string' }, metricsType: { type: 'string', enum: ['general', 'memory', 'execution', 'database', 'framework'] } }, required: ['sessionId'] } },
    { name: 'debug_startPHPHttpRequestTracking', description: 'Start tracking PHP HTTP requests', inputSchema: { type: 'object', properties: { sessionId: { type: 'string' } }, required: ['sessionId'] } },
    { name: 'debug_stopPHPHttpRequestTracking', description: 'Stop tracking PHP HTTP requests and get results', inputSchema: { type: 'object', properties: { sessionId: { type: 'string' } }, required: ['sessionId'] } },
    { name: 'debug_getPHPHttpRequests', description: 'Get PHP HTTP requests with timing information', inputSchema: { type: 'object', properties: { sessionId: { type: 'string' }, limit: { type: 'number' } }, required: ['sessionId'] } },
    { name: 'debug_getPHPComposerPackages', description: 'Get Composer packages information', inputSchema: { type: 'object', properties: { sessionId: { type: 'string' } }, required: ['sessionId'] } },

    // Laravel-specific Tools
    { name: 'debug_getLaravelInfo', description: 'Get Laravel application information (version, routes, config)', inputSchema: { type: 'object', properties: { sessionId: { type: 'string' } }, required: ['sessionId'] } },
    { name: 'debug_getLaravelRoutes', description: 'Get Laravel routes information', inputSchema: { type: 'object', properties: { sessionId: { type: 'string' } }, required: ['sessionId'] } },
    { name: 'debug_getLaravelMiddleware', description: 'Get Laravel middleware information', inputSchema: { type: 'object', properties: { sessionId: { type: 'string' } }, required: ['sessionId'] } },
    { name: 'debug_getEloquentQueries', description: 'Get Eloquent ORM queries', inputSchema: { type: 'object', properties: { sessionId: { type: 'string' }, limit: { type: 'number' } }, required: ['sessionId'] } },
    { name: 'debug_analyzeEloquentQueries', description: 'Analyze Eloquent queries for performance issues', inputSchema: { type: 'object', properties: { sessionId: { type: 'string' } }, required: ['sessionId'] } },
    { name: 'debug_getLaravelJobs', description: 'Get Laravel queue jobs', inputSchema: { type: 'object', properties: { sessionId: { type: 'string' } }, required: ['sessionId'] } },
    { name: 'debug_getLaravelFailedJobs', description: 'Get Laravel failed queue jobs', inputSchema: { type: 'object', properties: { sessionId: { type: 'string' } }, required: ['sessionId'] } },
    { name: 'debug_getLaravelEvents', description: 'Get Laravel events', inputSchema: { type: 'object', properties: { sessionId: { type: 'string' }, limit: { type: 'number' } }, required: ['sessionId'] } },
    { name: 'debug_getArtisanCommands', description: 'Get available Artisan commands', inputSchema: { type: 'object', properties: { sessionId: { type: 'string' } }, required: ['sessionId'] } },
    { name: 'debug_executeArtisanCommand', description: 'Execute Artisan command', inputSchema: { type: 'object', properties: { sessionId: { type: 'string' }, command: { type: 'string' }, args: { type: 'array', items: { type: 'string' } } }, required: ['sessionId', 'command'] } },
    { name: 'debug_getLaravelPerformanceMetrics', description: 'Get Laravel performance metrics', inputSchema: { type: 'object', properties: { sessionId: { type: 'string' } }, required: ['sessionId'] } },
    { name: 'debug_setLaravelRouteBreakpoint', description: 'Set breakpoint on Laravel route', inputSchema: { type: 'object', properties: { sessionId: { type: 'string' }, routeName: { type: 'string' }, condition: { type: 'string' } }, required: ['sessionId', 'routeName'] } },

    // Symfony-specific Tools
    { name: 'debug_getSymfonyInfo', description: 'Get Symfony application information (version, routes, services)', inputSchema: { type: 'object', properties: { sessionId: { type: 'string' } }, required: ['sessionId'] } },

    // WordPress-specific Tools
    { name: 'debug_getWordPressInfo', description: 'Get WordPress information (version, plugins, theme, hooks)', inputSchema: { type: 'object', properties: { sessionId: { type: 'string' } }, required: ['sessionId'] } },

    // Go-specific Tools
    { name: 'debug_setGoBreakpoint', description: 'Set breakpoint in Go file', inputSchema: { type: 'object', properties: { sessionId: { type: 'string' }, file: { type: 'string' }, line: { type: 'number' }, condition: { type: 'string' } }, required: ['sessionId', 'file', 'line'] } },
    { name: 'debug_setGoFunctionBreakpoint', description: 'Set breakpoint on Go function', inputSchema: { type: 'object', properties: { sessionId: { type: 'string' }, functionName: { type: 'string' }, condition: { type: 'string' } }, required: ['sessionId', 'functionName'] } },
    { name: 'debug_getGoThreads', description: 'Get Go application threads', inputSchema: { type: 'object', properties: { sessionId: { type: 'string' } }, required: ['sessionId'] } },
    { name: 'debug_getGoGoroutines', description: 'Get Go goroutines information', inputSchema: { type: 'object', properties: { sessionId: { type: 'string' } }, required: ['sessionId'] } },
    { name: 'debug_getGoStackTrace', description: 'Get Go stack trace for thread', inputSchema: { type: 'object', properties: { sessionId: { type: 'string' }, threadId: { type: 'number' } }, required: ['sessionId'] } },
    { name: 'debug_evaluateGoExpression', description: 'Evaluate Go expression', inputSchema: { type: 'object', properties: { sessionId: { type: 'string' }, expression: { type: 'string' }, frameId: { type: 'number' } }, required: ['sessionId', 'expression'] } },
    { name: 'debug_getGoPackages', description: 'Get Go packages information', inputSchema: { type: 'object', properties: { sessionId: { type: 'string' } }, required: ['sessionId'] } },
    { name: 'debug_getGoPerformanceMetrics', description: 'Get Go application performance metrics', inputSchema: { type: 'object', properties: { sessionId: { type: 'string' }, metricsType: { type: 'string', enum: ['general', 'memory', 'goroutines', 'gc'] } }, required: ['sessionId'] } },

    // Gin-specific Tools
    { name: 'debug_getGinRoutes', description: 'Get Gin framework routes information', inputSchema: { type: 'object', properties: { sessionId: { type: 'string' } }, required: ['sessionId'] } },
    { name: 'debug_getGinMiddleware', description: 'Get Gin middleware information', inputSchema: { type: 'object', properties: { sessionId: { type: 'string' } }, required: ['sessionId'] } },
    { name: 'debug_analyzeGinPerformance', description: 'Analyze Gin framework performance metrics', inputSchema: { type: 'object', properties: { sessionId: { type: 'string' } }, required: ['sessionId'] } },
    { name: 'debug_startGinRequestTracking', description: 'Start tracking Gin HTTP requests', inputSchema: { type: 'object', properties: { sessionId: { type: 'string' } }, required: ['sessionId'] } },
    { name: 'debug_getGinRequests', description: 'Get Gin HTTP requests with timing and middleware information', inputSchema: { type: 'object', properties: { sessionId: { type: 'string' }, limit: { type: 'number' } }, required: ['sessionId'] } },

    // Rust-specific Tools
    { name: 'debug_setRustBreakpoint', description: 'Set breakpoint in Rust file', inputSchema: { type: 'object', properties: { sessionId: { type: 'string' }, file: { type: 'string' }, line: { type: 'number' }, condition: { type: 'string' } }, required: ['sessionId', 'file', 'line'] } },
    { name: 'debug_setRustFunctionBreakpoint', description: 'Set breakpoint on Rust function', inputSchema: { type: 'object', properties: { sessionId: { type: 'string' }, functionName: { type: 'string' }, condition: { type: 'string' } }, required: ['sessionId', 'functionName'] } },
    { name: 'debug_getRustThreads', description: 'Get Rust application threads', inputSchema: { type: 'object', properties: { sessionId: { type: 'string' } }, required: ['sessionId'] } },
    { name: 'debug_getRustStackTrace', description: 'Get Rust stack trace for thread', inputSchema: { type: 'object', properties: { sessionId: { type: 'string' }, threadId: { type: 'number' } }, required: ['sessionId'] } },
    { name: 'debug_evaluateRustExpression', description: 'Evaluate Rust expression', inputSchema: { type: 'object', properties: { sessionId: { type: 'string' }, expression: { type: 'string' }, frameId: { type: 'number' } }, required: ['sessionId', 'expression'] } },
    { name: 'debug_getRustCrates', description: 'Get Rust crates information', inputSchema: { type: 'object', properties: { sessionId: { type: 'string' } }, required: ['sessionId'] } },
    { name: 'debug_getRustPerformanceMetrics', description: 'Get Rust application performance metrics', inputSchema: { type: 'object', properties: { sessionId: { type: 'string' }, metricsType: { type: 'string', enum: ['general', 'memory', 'cpu', 'ownership'] } }, required: ['sessionId'] } },

    // Actix-specific Tools
    { name: 'debug_getActixRoutes', description: 'Get Actix-web framework routes information', inputSchema: { type: 'object', properties: { sessionId: { type: 'string' } }, required: ['sessionId'] } },
    { name: 'debug_getActixMiddleware', description: 'Get Actix middleware information', inputSchema: { type: 'object', properties: { sessionId: { type: 'string' } }, required: ['sessionId'] } },
    { name: 'debug_getActixHandlers', description: 'Get Actix handlers information', inputSchema: { type: 'object', properties: { sessionId: { type: 'string' } }, required: ['sessionId'] } },
    { name: 'debug_analyzeActixPerformance', description: 'Analyze Actix framework performance metrics', inputSchema: { type: 'object', properties: { sessionId: { type: 'string' } }, required: ['sessionId'] } },
    { name: 'debug_startActixRequestTracking', description: 'Start tracking Actix HTTP requests', inputSchema: { type: 'object', properties: { sessionId: { type: 'string' } }, required: ['sessionId'] } },
    { name: 'debug_getActixRequests', description: 'Get Actix HTTP requests with timing and middleware information', inputSchema: { type: 'object', properties: { sessionId: { type: 'string' }, limit: { type: 'number' } }, required: ['sessionId'] } },

    // Electron debugging tools (13 tools - EXPANDIDO)
    { name: 'debug_connectElectron', description: 'Connect to an Electron application for debugging', inputSchema: { type: 'object', properties: { host: { type: 'string' }, mainPort: { type: 'number' }, rendererPort: { type: 'number' }, timeout: { type: 'number' }, autoDiscover: { type: 'boolean' }, enableIpcDebugging: { type: 'boolean' }, enablePerformanceProfiling: { type: 'boolean' }, enableSecurityDebugging: { type: 'boolean' }, enableGUIDebugging: { type: 'boolean' }, projectPath: { type: 'string' }, electronPath: { type: 'string' }, appPath: { type: 'string' } } } },
    { name: 'debug_getElectronProcesses', description: 'Get all Electron processes for a debugging session', inputSchema: { type: 'object', properties: { sessionId: { type: 'string' } }, required: ['sessionId'] } },
    { name: 'debug_setElectronBreakpoint', description: 'Set a breakpoint in an Electron process', inputSchema: { type: 'object', properties: { sessionId: { type: 'string' }, processType: { type: 'string', enum: ['main', 'renderer', 'worker'] }, processId: { type: 'string' }, file: { type: 'string' }, line: { type: 'number' }, condition: { type: 'string' } }, required: ['sessionId', 'processType', 'file', 'line'] } },
    { name: 'debug_inspectIPC', description: 'Inspect IPC communication between Electron processes', inputSchema: { type: 'object', properties: { sessionId: { type: 'string' }, channelName: { type: 'string' }, limit: { type: 'number' } }, required: ['sessionId'] } },
    { name: 'debug_getElectronPerformance', description: 'Get performance metrics for Electron processes', inputSchema: { type: 'object', properties: { sessionId: { type: 'string' }, processId: { type: 'string' } }, required: ['sessionId'] } },
    { name: 'debug_analyzeElectronMemory', description: 'Analyze memory usage and detect potential leaks in Electron processes', inputSchema: { type: 'object', properties: { sessionId: { type: 'string' }, processId: { type: 'string' }, duration: { type: 'number' } }, required: ['sessionId'] } },
    { name: 'debug_getElectronSecurity', description: 'Get security context and analyze security configuration for Electron processes', inputSchema: { type: 'object', properties: { sessionId: { type: 'string' }, processId: { type: 'string' } }, required: ['sessionId'] } },
    { name: 'debug_debugElectronGUI', description: 'Debug GUI elements in Electron renderer processes', inputSchema: { type: 'object', properties: { sessionId: { type: 'string' }, action: { type: 'string', enum: ['inspect', 'simulate', 'list'] }, elementId: { type: 'string' }, eventType: { type: 'string' }, eventOptions: { type: 'object' } }, required: ['sessionId', 'action'] } },
    // Nuevas herramientas Electron agregadas
    { name: 'debug_getElectronArchitecture', description: 'Get comprehensive Electron application architecture overview including all processes', inputSchema: { type: 'object', properties: { sessionId: { type: 'string' }, includeMainProcess: { type: 'boolean' }, includeRendererProcesses: { type: 'boolean' }, includeUtilityProcesses: { type: 'boolean' }, showMemoryPerProcess: { type: 'boolean' }, showCPUPerProcess: { type: 'boolean' } }, required: ['sessionId'] } },
    { name: 'debug_startIpcMonitoring', description: 'Start comprehensive IPC monitoring with advanced filtering and leak detection', inputSchema: { type: 'object', properties: { sessionId: { type: 'string' }, channels: { type: 'array', items: { type: 'string' } }, capturePayloads: { type: 'boolean' }, trackTiming: { type: 'boolean' }, detectLeaks: { type: 'boolean' }, maxMessages: { type: 'number' } }, required: ['sessionId'] } },
    { name: 'debug_getIpcMessages', description: 'Get IPC messages with advanced filtering and analysis', inputSchema: { type: 'object', properties: { sessionId: { type: 'string' }, timeRange: { type: 'string' }, filterByChannel: { type: 'string' }, includeStackTrace: { type: 'boolean' }, includePayloads: { type: 'boolean' }, limit: { type: 'number' } }, required: ['sessionId'] } },
    { name: 'debug_analyzeElectronSecurity', description: 'Comprehensive security analysis for Electron applications', inputSchema: { type: 'object', properties: { sessionId: { type: 'string' }, checkNodeIntegration: { type: 'boolean' }, checkContextIsolation: { type: 'boolean' }, checkSandboxMode: { type: 'boolean' }, checkCSP: { type: 'boolean' }, checkRemoteModule: { type: 'boolean' } }, required: ['sessionId'] } },
    { name: 'debug_getElectronAsyncOperations', description: 'Get active async operations with Electron-specific tracking', inputSchema: { type: 'object', properties: { sessionId: { type: 'string' }, includeElectronIPC: { type: 'boolean' }, includeRendererAsync: { type: 'boolean' }, trackWebContents: { type: 'boolean' }, includePromises: { type: 'boolean' }, includeTimers: { type: 'boolean' } }, required: ['sessionId'] } },

    // .NET/C# debugging tools (7 tools)
    { name: 'debug_connectDotNet', description: 'Connect to a .NET application for debugging with automatic version and framework detection', inputSchema: { type: 'object', properties: { processId: { type: 'number' }, processName: { type: 'string' }, host: { type: 'string' }, port: { type: 'number' }, dotnetVersion: { type: 'string', enum: ['netframework4.0', 'netframework4.5', 'netframework4.6', 'netframework4.7', 'netframework4.8', 'netcore3.1', 'net5.0', 'net6.0', 'net7.0', 'net8.0', 'net9.0'] }, framework: { type: 'string', enum: ['aspnetcore', 'wpf', 'winforms', 'blazor-server', 'blazor-wasm', 'maui', 'unity', 'console', 'library'] }, runtime: { type: 'string', enum: ['framework', 'core', 'mono'] }, projectPath: { type: 'string' }, assemblyPath: { type: 'string' }, symbolsPath: { type: 'string' }, enableHotReload: { type: 'boolean' }, enableAsyncDebugging: { type: 'boolean' }, enableLinqDebugging: { type: 'boolean' }, enableExceptionBreaking: { type: 'boolean' }, timeout: { type: 'number' }, autoAttach: { type: 'boolean' }, debuggerType: { type: 'string', enum: ['vsdbg', 'netcoredbg', 'mono'] } } } },
    { name: 'debug_getDotNetProcesses', description: 'Get all .NET processes available for debugging with framework and version detection', inputSchema: { type: 'object', properties: { includeSystemProcesses: { type: 'boolean' }, filterByFramework: { type: 'string', enum: ['aspnetcore', 'wpf', 'winforms', 'blazor-server', 'blazor-wasm', 'maui', 'unity', 'console', 'library'] }, filterByVersion: { type: 'string', enum: ['netframework4.0', 'netframework4.5', 'netframework4.6', 'netframework4.7', 'netframework4.8', 'netcore3.1', 'net5.0', 'net6.0', 'net7.0', 'net8.0', 'net9.0'] }, includeDebuggableOnly: { type: 'boolean' } } } },
    { name: 'debug_inspectDotNetObject', description: 'Inspect a .NET object with deep analysis of properties, fields, and methods', inputSchema: { type: 'object', properties: { sessionId: { type: 'string' }, objectId: { type: 'string' }, includePrivateMembers: { type: 'boolean' }, includeStaticMembers: { type: 'boolean' }, includeInheritedMembers: { type: 'boolean' }, maxDepth: { type: 'number' }, evaluateProperties: { type: 'boolean' } }, required: ['sessionId', 'objectId'] } },
    { name: 'debug_evaluateCSharpExpression', description: 'Evaluate C# expressions with support for async/await, LINQ, and complex objects', inputSchema: { type: 'object', properties: { sessionId: { type: 'string' }, expression: { type: 'string' }, frameId: { type: 'string' }, timeout: { type: 'number' }, allowSideEffects: { type: 'boolean' }, returnFullObject: { type: 'boolean' }, enableLinqDebugging: { type: 'boolean' }, enableAsyncEvaluation: { type: 'boolean' } }, required: ['sessionId', 'expression'] } },
    { name: 'debug_getDotNetAssemblies', description: 'Get detailed information about loaded .NET assemblies including types and metadata', inputSchema: { type: 'object', properties: { sessionId: { type: 'string' }, includeSystemAssemblies: { type: 'boolean' }, includeGACAssemblies: { type: 'boolean' }, includeDynamicAssemblies: { type: 'boolean' }, includeTypeInformation: { type: 'boolean' }, filterByName: { type: 'string' }, sortBy: { type: 'string', enum: ['name', 'version', 'location', 'size'] } }, required: ['sessionId'] } },
    { name: 'debug_setDotNetBreakpoint', description: 'Set advanced breakpoints in .NET code with support for async methods, LINQ, and conditional breaking', inputSchema: { type: 'object', properties: { sessionId: { type: 'string' }, file: { type: 'string' }, line: { type: 'number' }, column: { type: 'number' }, condition: { type: 'string' }, hitCondition: { type: 'string' }, logMessage: { type: 'string' }, enabled: { type: 'boolean' }, breakOnAsyncException: { type: 'boolean' }, breakOnLinqExecution: { type: 'boolean' }, assembly: { type: 'string' }, method: { type: 'string' } }, required: ['sessionId', 'file', 'line'] } },
    { name: 'debug_enableDotNetHotReload', description: 'Enable and configure hot reload for supported .NET applications', inputSchema: { type: 'object', properties: { sessionId: { type: 'string' }, watchPaths: { type: 'array', items: { type: 'string' } }, excludePatterns: { type: 'array', items: { type: 'string' } }, enableAutoReload: { type: 'boolean' }, reloadTimeout: { type: 'number' }, enableVerboseLogging: { type: 'boolean' } }, required: ['sessionId'] } }
  ];

  server.setRequestHandler(ListToolsRequestSchema, async () => ({ tools }));

  server.setRequestHandler(CallToolRequestSchema, async req => {
    const { name, arguments: args } = req.params as any;

    try {
      switch (name) {
        case 'debug_ping':
          return { content: [{ type: 'text', text: String(args?.message ?? 'pong') }] };

        case 'debug_version':
          return { content: [{ type: 'text', text: 'RIXA 0.1.0' }] };

        case 'debug_createSession': {
          const adapter = String(args?.adapter || 'node');
          const program = String(args?.program);
          const programArgs = Array.isArray(args?.args) ? (args.args as string[]) : [];
          const cwd = args?.cwd ? String(args.cwd) : process.cwd();
          const env = (args?.env && typeof args.env === 'object') ? (args.env as Record<string, string>) : undefined;
          const verbose = !!args?.verbose;
          const dryRun = !!args?.dryRun;

          // Enhanced preflight validation with better path resolution
          const checks: string[] = [];

          // Enhanced program file validation
          let resolvedProgram = program;
          let programFound = false;

          if (program) {
            const { resolve, isAbsolute, join } = await import('path');

            // Resolve program path
            if (!isAbsolute(program)) {
              resolvedProgram = resolve(cwd, program);
            }

            // Check if file exists, try common variations for TypeScript/JavaScript
            const variations = [
              resolvedProgram,
              resolvedProgram + '.js',
              resolvedProgram + '.ts',
              join(cwd, 'dist', program),
              join(cwd, 'build', program),
              join(cwd, 'src', program),
              join(cwd, program)
            ];

            for (const variation of variations) {
              if (existsSync(variation)) {
                resolvedProgram = variation;
                programFound = true;
                break;
              }
            }

            if (!programFound) {
              checks.push(`Program not found: ${program}`);
              checks.push(`Searched paths: ${variations.join(', ')}`);
              checks.push(`Suggestions:`);
              checks.push(`  - Check if the file exists`);
              checks.push(`  - Run 'npm run build' if using TypeScript`);
              checks.push(`  - Use absolute path: ${resolve(cwd, program)}`);
            } else {
              // Verify it's a file, not a directory
              try {
                const { statSync } = await import('fs');
                const stats = statSync(resolvedProgram);
                if (!stats.isFile()) {
                  checks.push(`Program path is not a file: ${resolvedProgram}`);
                  programFound = false;
                }
              } catch (error) {
                checks.push(`Cannot access program file: ${resolvedProgram}`);
                programFound = false;
              }
            }
          } else {
            checks.push(`Program path is required`);
          }

          if (!(await checkPathReadable(cwd))) checks.push(`CWD not accessible: ${cwd}`);
          const adapterCheck = adapters[adapter as keyof typeof adapters];
          if (!adapterCheck) {
            checks.push(`Unsupported adapter: ${adapter}`);
          } else {
            const probe = checkCmd(adapterCheck.cmd, adapterCheck.args);
            if (!probe.ok) {
              checks.push(`Adapter unavailable: ${adapter} (${adapterCheck.prerequisite}). Install: ${adapterCheck.install}. Details: ${probe.stderr || probe.stdout || 'n/a'}`);
            }

            // Special validation for Java
            if (adapter === 'java') {
              const jarPath = findJavaDebugAdapterJar();
              if (!jarPath) {
                checks.push(`❌ Java Debug Adapter JAR not found`);
                checks.push(`   Searched locations:`);
                checks.push(`   - ~/.vscode/extensions/vscjava.vscode-java-debug-*/server/`);
                checks.push(`   - /usr/local/lib/java-debug-adapter/`);
                checks.push(`   - /opt/homebrew/lib/java-debug-adapter/`);
                checks.push(`   Solutions:`);
                checks.push(`   1. Install VS Code Java Extension Pack`);
                checks.push(`   2. Download JAR: https://github.com/microsoft/java-debug/releases`);
              }
              // Note: Success message will be shown in the success response
            }
          }
          if (checks.length) {
            return { content: [{ type: 'text', text: JSON.stringify({ error: 'Preflight failed', issues: checks, recommendation: `Run debug_validateEnvironment or debug_prerequisites { lang: "${adapter}" }` }, null, 2) }] };
          }

          if (verbose) {
            const ports = adapter === 'node' ? [9229] : adapter === 'python' ? [5678] : adapter === 'java' ? [5005] : adapter === 'go' ? [38697] : adapter === 'rust' ? [2345] : [];
            const portStates = await Promise.all(ports.map(async p => ({ port: p, free: await isPortFree(p) })));
            checks.push(...portStates.filter(s => !s.free).map(s => `Port ${s.port} is busy`));
            if (checks.length) {
              return { content: [{ type: 'text', text: JSON.stringify({ error: 'Preflight warnings', issues: checks, hint: 'Use debug_checkPorts to inspect and free ports' }, null, 2) }] };
            }
          }

          if (dryRun) {
            return { content: [{ type: 'text', text: JSON.stringify({ dryRun: true, wouldLaunch: { adapter, program, args: programArgs, cwd } }, null, 2) }] };
          }

          try {
            const session = await sessionManager.createSession({
              adapterConfig: {
                transport: {
                  type: 'stdio',
                  command: getAdapterCommand(adapter),
                  args: getAdapterArgs(adapter),
                },
              },
              launchConfig: adapter === 'java' ? {
                type: 'java',
                request: 'launch',
                mainClass: (programFound ? resolvedProgram : program).replace(/\.java$/, '').replace(/.*\//, ''),
                projectName: '',
                cwd,
                env: { ...process.env, ...(env || {}) },
                args: programArgs,
                vmArgs: '',
                classPaths: detectJavaClasspath(cwd),
                modulePaths: [],
                sourcePaths: [cwd],
                console: 'integratedTerminal',
                internalConsoleOptions: 'neverOpen',
                stepFilters: {
                  classNameFilters: ['java.*', 'javax.*', 'com.sun.*', 'sun.*'],
                  skipSynthetics: true,
                  skipStaticInitializers: true,
                  skipConstructors: false
                }
              } : {
                type: adapter,
                program: programFound ? resolvedProgram : program,
                args: programArgs,
                cwd,
                env: { ...process.env, ...(env || {}) },
                console: 'integratedTerminal',
                internalConsoleOptions: 'neverOpen',
              },
              name: `Debug Session for ${program}`,
              workspaceRoot: cwd,
            });

            await session.initialize();
            await session.launch();

            // Add Java-specific info if applicable
            const sessionInfo: any = { sessionId: session.id, state: session.getState() };
            if (adapter === 'java') {
              const jarPath = findJavaDebugAdapterJar();
              if (jarPath) {
                sessionInfo.javaDebugAdapter = jarPath;
              }
            }

            return {
              content: [
                { type: 'text', text: 'Debug session created successfully' },
                { type: 'text', text: JSON.stringify(sessionInfo, null, 2) }
              ]
            };
          } catch (e) {
            const msg = e instanceof Error ? e.message : String(e);
            return { content: [{ type: 'text', text: JSON.stringify({ error: 'Failed to initialize debug session', details: msg, hints: [ 'Verify adapter availability via debug_testAdapter', 'Check program path and permissions', 'Provide absolute paths for program and cwd' ] }, null, 2) }] };
          }
        }

        case 'debug_attachSession': {
          const adapter = String(args?.adapter || 'java');
          const port = args?.port ? Number(args.port) : (adapter === 'java' ? 5005 : 9229);
          const host = String(args?.host || 'localhost');
          const cwd = args?.cwd ? String(args.cwd) : process.cwd();
          const forceConnect = Boolean(args?.forceConnect);
          const useObserverMode = Boolean(args?.observerMode);

          // Enhanced preflight validation with intelligent conflict resolution
          const checks: string[] = [];
          if (!(await checkPathReadable(cwd))) checks.push(`CWD not accessible: ${cwd}`);
          const adapterCheck = adapters[adapter as keyof typeof adapters];
          if (!adapterCheck) checks.push(`Unsupported adapter: ${adapter}`);
          else {
            const probe = checkCmd(adapterCheck.cmd, adapterCheck.args);
            if (!probe.ok) checks.push(`Adapter unavailable: ${adapter} (${adapterCheck.prerequisite}). Install: ${adapterCheck.install}. Details: ${probe.stderr || probe.stdout || 'n/a'}`);
          }

          // Enhanced port analysis for Java debugging with improved JDWP validation
          if (adapter === 'java') {
            try {
              // Use enhanced JDWP validation
              const validator = new JDWPValidator(host, port, { timeout: 5000, retryAttempts: 1 });
              const connectionInfo = await validator.validateConnection();

              if (!connectionInfo.connected && !connectionInfo.jdwpAgentDetected) {
                checks.push(`Port ${port} is not in use or not a JDWP agent. Make sure your application is running with debug agent on port ${port}`);
                checks.push(`For Java: java -agentlib:jdwp=transport=dt_socket,server=y,suspend=n,address=${port} YourMainClass`);
              } else if (connectionInfo.jdwpAgentDetected && connectionInfo.hasActiveClient && !forceConnect && !useObserverMode) {
                // JDWP agent detected but has active client - suggest alternatives
                const portManager = new PortManager();
                const resolutions = await portManager.suggestConflictResolution(port);

                return { content: [{ type: 'text', text: JSON.stringify({
                  status: 'jdwp_agent_detected',
                  message: 'JDWP agent detected but has active client connection',
                  connectionInfo,
                  suggestedResolutions: resolutions,
                  recommendations: [
                    '✅ Add observerMode: true to monitor without interfering (RECOMMENDED)',
                    '⚠️ Add forceConnect: true to attempt connection anyway (may fail)',
                    '🚀 Try debug_createAdvancedConnection for automatic conflict resolution',
                    '🔄 Use debug_startHybridDebugging as non-invasive alternative'
                  ],
                  examples: [
                    'debug_attachSession({ adapter: "java", port: ' + port + ', observerMode: true })',
                    'debug_createAdvancedConnection({ port: ' + port + ', type: "auto", handleConflicts: true })',
                    'debug_startHybridDebugging({ workspaceRoot: "' + cwd + '", applicationUrl: "http://localhost:8080" })'
                  ],
                  nextSteps: [
                    'Observer mode allows you to monitor the debug session without conflicts',
                    'Advanced connection will automatically handle conflicts and suggest alternatives',
                    'Hybrid debugging provides API testing and log analysis capabilities'
                  ]
                }, null, 2) }] };
              } else if (connectionInfo.connected) {
                // Connection successful - we can proceed normally
                console.log('JDWP connection validated successfully');
              }
            } catch (error) {
              // If enhanced validation fails, fall back to basic port check
              const portFree = await isPortFree(port);
              if (portFree) {
                checks.push(`Port ${port} is not in use. Make sure your application is running with debug agent on port ${port}`);
                checks.push(`For Java: java -agentlib:jdwp=transport=dt_socket,server=y,suspend=n,address=${port} YourMainClass`);
              }
            }
          } else {
            // Basic port check for non-Java adapters
            const portFree = await isPortFree(port);
            if (portFree) {
              checks.push(`Port ${port} is not in use. Make sure your application is running with debug agent on port ${port}`);
            }
          }

          if (checks.length && !forceConnect) {
            return { content: [{ type: 'text', text: JSON.stringify({
              error: 'Attach preflight failed',
              issues: checks,
              recommendation: `Ensure your ${adapter} application is running with debug agent on port ${port}`,
              hint: 'Add forceConnect: true to bypass these checks'
            }, null, 2) }] };
          }

          try {
            // Enhanced Java debugging with observer mode support
            if (adapter === 'java' && useObserverMode) {
              // Observer mode - enhanced validation with better detection
              const validator = new JDWPValidator(host, port, { timeout: 5000, retryAttempts: 1 });
              const connectionInfo = await validator.validateConnection();

              if (connectionInfo.connected) {
                return { content: [{ type: 'text', text: JSON.stringify({
                  mode: 'observer',
                  status: 'monitoring_active_connection',
                  connectionInfo,
                  message: 'Observer mode active - successfully connected to debug agent',
                  capabilities: [
                    'Monitor debug session without interference',
                    'View VM information and capabilities',
                    'Non-invasive debugging observation'
                  ],
                  recommendations: [
                    'Use debug_startHybridDebugging for active testing capabilities',
                    'Observer mode allows monitoring without disrupting existing debug sessions',
                    'You can safely observe breakpoints and debugging activity'
                  ]
                }, null, 2) }] };
              } else if (connectionInfo.jdwpAgentDetected) {
                return { content: [{ type: 'text', text: JSON.stringify({
                  mode: 'observer',
                  status: 'monitoring_detected_agent',
                  connectionInfo,
                  message: 'Observer mode active - JDWP agent detected with active client',
                  detection: {
                    agentPresent: true,
                    hasActiveClient: connectionInfo.hasActiveClient,
                    canObserve: true
                  },
                  capabilities: [
                    'JDWP agent confirmed on port ' + port,
                    'Active client connection detected',
                    'Observer mode provides non-invasive monitoring'
                  ],
                  recommendations: [
                    'JDWP agent is running and accessible',
                    'Another debugger is currently connected',
                    'Observer mode allows you to monitor without conflicts',
                    'Use debug_startHybridDebugging for additional testing capabilities'
                  ]
                }, null, 2) }] };
              } else {
                return { content: [{ type: 'text', text: JSON.stringify({
                  mode: 'observer',
                  status: 'no_agent_detected',
                  connectionInfo,
                  error: 'No JDWP agent detected on port ' + port,
                  recommendations: [
                    'Ensure your Java application is running with debug agent enabled',
                    'java -agentlib:jdwp=transport=dt_socket,server=y,suspend=n,address=' + port + ' YourApp',
                    'Check if the application is running on a different port',
                    'Use debug_scanPortsAdvanced to find active debug agents'
                  ]
                }, null, 2) }] };
              }
            }

            // Create attach configuration based on adapter
            let attachConfig: Record<string, unknown>;

            if (adapter === 'java') {
              // Enhanced Java configuration with project analysis
              const projectInfo = analyzeJavaProject(cwd);

              attachConfig = {
                type: 'java',
                request: 'attach',
                hostName: host,
                port: port,
                timeout: forceConnect ? 45000 : 30000,
                projectName: projectInfo.mainClass || '',
                vmArgs: '',
                // Advanced Java debugging configuration
                stepFilters: {
                  classNameFilters: ['java.*', 'javax.*', 'com.sun.*', 'sun.*', 'sunw.*', 'org.omg.*'],
                  skipSynthetics: true,
                  skipStaticInitializers: true,
                  skipConstructors: false
                },
                // Enhanced source path configuration
                sourcePaths: [cwd, ...projectInfo.sourcePaths],
                classPaths: projectInfo.classPaths.length > 0 ? projectInfo.classPaths : detectJavaClasspath(cwd),
                // Console configuration
                console: 'internalConsole',
                internalConsoleOptions: 'neverOpen'
              };
            } else if (adapter === 'node') {
              attachConfig = {
                type: 'node',
                request: 'attach',
                address: host,
                port: port,
                timeout: forceConnect ? 45000 : 30000
              };
            } else if (adapter === 'python') {
              attachConfig = {
                type: 'python',
                request: 'attach',
                connect: {
                  host: host,
                  port: port
                }
              };
            } else {
              attachConfig = {
                type: adapter,
                request: 'attach',
                host: host,
                port: port
              };
            }

            // Enhanced session creation with better error handling and retry logic
            let session: any = null;
            let attachAttempts = 0;
            const maxAttachAttempts = forceConnect ? 3 : 1;

            // Helper function for attach with retry
            const attachWithRetry = async (sessionToAttach: any, attempt: number) => {
              const timeout = 5000 + (attempt * 2000); // Increasing timeout
              return Promise.race([
                sessionToAttach.attach(),
                new Promise((_, reject) =>
                  setTimeout(() => reject(new Error(`Attach timeout after ${timeout}ms`)), timeout)
                )
              ]);
            };

            while (attachAttempts < maxAttachAttempts) {
              try {
                attachAttempts++;

                session = await sessionManager.createSession({
                  adapterConfig: {
                    transport: {
                      type: 'stdio',
                      command: getAdapterCommand(adapter),
                      args: getAdapterArgs(adapter),
                    },
                  },
                  attachConfig,
                  name: `Debug Attach Session (${adapter}:${port}) - Attempt ${attachAttempts}`,
                  workspaceRoot: cwd,
                });

                await session.initialize();

                // Enhanced attach with timeout and retry logic
                if (forceConnect) {
                  // For force connect, try multiple times with increasing delays
                  await attachWithRetry(session, attachAttempts);
                } else {
                  await session.attach();
                }

                // If we get here, attach was successful
                break;

              } catch (attachError) {
                if (session) {
                  try {
                    await session.terminate();
                  } catch (cleanupError) {
                    // Ignore cleanup errors
                  }
                }

                if (attachAttempts >= maxAttachAttempts) {
                  throw attachError;
                }

                // Wait before retry (exponential backoff)
                await new Promise(resolve => setTimeout(resolve, 1000 * attachAttempts));
              }
            }

            if (!session) {
              throw new Error('Failed to create debug session after all attempts');
            }

            return {
              content: [
                { type: 'text', text: 'Debug session attached successfully' },
                { type: 'text', text: JSON.stringify({
                  sessionId: session.id,
                  state: session.getState(),
                  adapter,
                  port,
                  host,
                  mode: useObserverMode ? 'observer' : 'normal',
                  recommendations: [
                    'Debug session is now active',
                    'You can set breakpoints and debug normally',
                    'Use debug_setBreakpoints to add breakpoints',
                    'Use debug_continue, debug_stepOver, etc. for debugging'
                  ]
                }, null, 2) }
              ]
            };
          } catch (e) {
            const msg = e instanceof Error ? e.message : String(e);

            // Enhanced error handling with recovery suggestions
            const errorResponse: any = {
              error: 'Failed to attach debug session',
              details: msg,
              hints: [
                `Verify ${adapter} application is running with debug agent`,
                `Check port ${port} is accessible`,
                `For Java: java -agentlib:jdwp=transport=dt_socket,server=y,suspend=n,address=${port} YourApp`
              ]
            };

            // Add specific recovery suggestions
            if (msg.includes('Connection refused') || msg.includes('timeout')) {
              errorResponse.recovery = {
                suggestions: [
                  'Try debug_createAdvancedConnection for intelligent conflict resolution',
                  'Use debug_startHybridDebugging as non-invasive alternative',
                  'Run debug_attemptErrorRecovery for automatic problem resolution'
                ],
                examples: [
                  `debug_createAdvancedConnection({ port: ${port}, type: "auto", handleConflicts: true })`,
                  `debug_startHybridDebugging({ workspaceRoot: "${cwd}" })`,
                  `debug_attemptErrorRecovery({ errorType: "connection", errorMessage: "${msg}" })`
                ]
              };
            }

            return { content: [{ type: 'text', text: JSON.stringify(errorResponse, null, 2) }] };
          }
        }

        case 'debug_getThreads': {
          const sessionId = String(args?.sessionId);

          try {
            // CRITICAL FIX: Use LanguageDispatcher for unified session management
            const result = await languageDispatcher.executeOperation(sessionId, 'getThreads', {});
            return { content: [{ type: 'text', text: JSON.stringify(result, null, 2) }] };
          } catch (error) {
            // Fallback to old SessionManager for backward compatibility
            try {
              const session = sessionManager.getSession(sessionId);
              if (!session) {
                return { content: [{ type: 'text', text: JSON.stringify({
                  success: false,
                  error: `Session not found: ${sessionId}`,
                  sessionId,
                  operation: 'getThreads',
                  suggestion: 'Make sure to connect first with debug_connect'
                }, null, 2) }] };
              }
              const response = await session.sendRequest<any>('threads');
              return { content: [{ type: 'text', text: JSON.stringify({
                success: true,
                data: response?.body || {},
                sessionId,
                operation: 'getThreads'
              }, null, 2) }] };
            } catch (fallbackError) {
              return { content: [{ type: 'text', text: JSON.stringify({
                success: false,
                error: error instanceof Error ? error.message : String(error),
                fallbackError: fallbackError instanceof Error ? fallbackError.message : String(fallbackError),
                sessionId,
                operation: 'getThreads'
              }, null, 2) }] };
            }
          }
        }

        case 'debug_getStackTrace': {
          const sessionId = String(args?.sessionId);
          const threadId = Number(args?.threadId || 1);
          const startFrame = args?.startFrame ? Number(args.startFrame) : undefined;
          const levels = args?.levels ? Number(args.levels) : undefined;

          try {
            // Try new language dispatcher first
            const newSession = languageDispatcher.getSession(sessionId);
            if (newSession) {
              const result = await languageDispatcher.executeOperation(sessionId, 'getStackTrace', {
                threadId,
                startFrame,
                levels
              });
              return { content: [{ type: 'text', text: JSON.stringify(result, null, 2) }] };
            }

            // Fallback to old session manager
            const session = sessionManager.getSession(sessionId);
            if (!session) {
              return { content: [{ type: 'text', text: JSON.stringify({
                success: false,
                error: `Session not found: ${sessionId}`,
                suggestion: 'Use debug_getSessions to see active sessions or connect with debug_connect'
              }, null, 2) }] };
            }

            const response = await session.sendRequest<any>('stackTrace', { threadId, startFrame, levels });
            return { content: [{ type: 'text', text: JSON.stringify({
              success: true,
              response: response?.body || {},
              sessionId,
              threadId
            }, null, 2) }] };
          } catch (error) {
            return { content: [{ type: 'text', text: JSON.stringify({
              success: false,
              error: error instanceof Error ? error.message : String(error),
              sessionId,
              operation: 'getStackTrace'
            }, null, 2) }] };
          }
        }

        case 'debug_continue': {
          const sessionId = String(args?.sessionId);
          const threadId = Number(args?.threadId || 1);
          const singleThread = Boolean(args?.singleThread !== false);

          try {
            // Try new language dispatcher first
            const newSession = languageDispatcher.getSession(sessionId);
            if (newSession) {
              const result = await languageDispatcher.executeOperation(sessionId, 'continue', {
                threadId,
                singleThread
              });
              return { content: [{ type: 'text', text: JSON.stringify(result, null, 2) }] };
            }

            // Fallback to old session manager
            const session = sessionManager.getSession(sessionId);
            if (!session) {
              return { content: [{ type: 'text', text: JSON.stringify({
                success: false,
                error: `Session not found: ${sessionId}`,
                suggestion: 'Use debug_getSessions to see active sessions or connect with debug_connect'
              }, null, 2) }] };
            }

            const response = await session.sendRequest<any>('continue', { threadId, singleThread });
            return { content: [{ type: 'text', text: JSON.stringify({
              success: true,
              response: response?.body || {},
              sessionId,
              threadId
            }, null, 2) }] };
          } catch (error) {
            return { content: [{ type: 'text', text: JSON.stringify({
              success: false,
              error: error instanceof Error ? error.message : String(error),
              sessionId,
              operation: 'continue'
            }, null, 2) }] };
          }
        }

        case 'debug_pause': {
          const sessionId = String(args?.sessionId);
          const threadId = Number(args?.threadId || 1);

          try {
            // Try new language dispatcher first
            const newSession = languageDispatcher.getSession(sessionId);
            if (newSession) {
              const result = await languageDispatcher.executeOperation(sessionId, 'pause', {
                threadId
              });
              return { content: [{ type: 'text', text: JSON.stringify(result, null, 2) }] };
            }

            // Fallback to old session manager
            const session = sessionManager.getSession(sessionId);
            if (!session) {
              return { content: [{ type: 'text', text: JSON.stringify({
                success: false,
                error: `Session not found: ${sessionId}`,
                suggestion: 'Use debug_getSessions to see active sessions or connect with debug_connect'
              }, null, 2) }] };
            }

            const response = await session.sendRequest<any>('pause', { threadId });
            return { content: [{ type: 'text', text: JSON.stringify({
              success: true,
              response: response?.body || {},
              sessionId,
              threadId
            }, null, 2) }] };
          } catch (error) {
            return { content: [{ type: 'text', text: JSON.stringify({
              success: false,
              error: error instanceof Error ? error.message : String(error),
              sessionId,
              operation: 'pause'
            }, null, 2) }] };
          }
        }

        case 'debug_stepOver': {
          const sessionId = String(args?.sessionId);
          const threadId = Number(args?.threadId || 1);
          const granularity = String(args?.granularity || 'line');

          try {
            // Try new language dispatcher first
            const newSession = languageDispatcher.getSession(sessionId);
            if (newSession) {
              const result = await languageDispatcher.executeOperation(sessionId, 'stepOver', {
                threadId,
                granularity
              });
              return { content: [{ type: 'text', text: JSON.stringify(result, null, 2) }] };
            }

            // Fallback to old session manager
            const session = sessionManager.getSession(sessionId);
            if (!session) {
              return { content: [{ type: 'text', text: JSON.stringify({
                success: false,
                error: `Session not found: ${sessionId}`,
                suggestion: 'Use debug_getSessions to see active sessions or connect with debug_connect'
              }, null, 2) }] };
            }

            const response = await session.sendRequest<any>('next', { threadId, granularity });
            return { content: [{ type: 'text', text: JSON.stringify({
              success: true,
              response: response?.body || {},
              sessionId,
              threadId
            }, null, 2) }] };
          } catch (error) {
            return { content: [{ type: 'text', text: JSON.stringify({
              success: false,
              error: error instanceof Error ? error.message : String(error),
              sessionId,
              operation: 'stepOver'
            }, null, 2) }] };
          }
        }

        case 'debug_stepIn': {
          const sessionId = String(args?.sessionId);
          const threadId = Number(args?.threadId || 1);
          const granularity = String(args?.granularity || 'line');

          try {
            // Try new language dispatcher first
            const newSession = languageDispatcher.getSession(sessionId);
            if (newSession) {
              const result = await languageDispatcher.executeOperation(sessionId, 'stepIn', {
                threadId,
                granularity
              });
              return { content: [{ type: 'text', text: JSON.stringify(result, null, 2) }] };
            }

            // Fallback to old session manager
            const session = sessionManager.getSession(sessionId);
            if (!session) {
              return { content: [{ type: 'text', text: JSON.stringify({
                success: false,
                error: `Session not found: ${sessionId}`,
                suggestion: 'Use debug_getSessions to see active sessions or connect with debug_connect'
              }, null, 2) }] };
            }

            const response = await session.sendRequest<any>('stepIn', { threadId, granularity });
            return { content: [{ type: 'text', text: JSON.stringify({
              success: true,
              response: response?.body || {},
              sessionId,
              threadId
            }, null, 2) }] };
          } catch (error) {
            return { content: [{ type: 'text', text: JSON.stringify({
              success: false,
              error: error instanceof Error ? error.message : String(error),
              sessionId,
              operation: 'stepIn'
            }, null, 2) }] };
          }
        }

        case 'debug_stepOut': {
          const sessionId = String(args?.sessionId);
          const threadId = Number(args?.threadId || 1);
          const granularity = String(args?.granularity || 'line');

          try {
            // Try new language dispatcher first
            const newSession = languageDispatcher.getSession(sessionId);
            if (newSession) {
              const result = await languageDispatcher.executeOperation(sessionId, 'stepOut', {
                threadId,
                granularity
              });
              return { content: [{ type: 'text', text: JSON.stringify(result, null, 2) }] };
            }

            // Fallback to old session manager
            const session = sessionManager.getSession(sessionId);
            if (!session) {
              return { content: [{ type: 'text', text: JSON.stringify({
                success: false,
                error: `Session not found: ${sessionId}`,
                suggestion: 'Use debug_getSessions to see active sessions or connect with debug_connect'
              }, null, 2) }] };
            }

            const response = await session.sendRequest<any>('stepOut', { threadId, granularity });
            return { content: [{ type: 'text', text: JSON.stringify({
              success: true,
              response: response?.body || {},
              sessionId,
              threadId
            }, null, 2) }] };
          } catch (error) {
            return { content: [{ type: 'text', text: JSON.stringify({
              success: false,
              error: error instanceof Error ? error.message : String(error),
              sessionId,
              operation: 'stepOut'
            }, null, 2) }] };
          }
        }

        case 'debug_setBreakpoints': {
          const sessionId = String(args?.sessionId);
          const source = args?.source as { path: string; name?: string };
          const breakpoints = Array.isArray(args?.breakpoints) ? args.breakpoints : [];
          const session = sessionManager.getSession(sessionId);
          if (!session) return { content: [{ type: 'text', text: `Session not found: ${sessionId}` }] };
          const response = await session.sendRequest<any>('setBreakpoints', { source, breakpoints });
          return { content: [{ type: 'text', text: JSON.stringify(response?.body || {}, null, 2) }] };
        }

        case 'debug_getVariables': {
          const sessionId = String(args?.sessionId);
          const variablesReference = Number(args?.variablesReference);
          const filter = args?.filter as 'indexed' | 'named' | undefined;
          const start = args?.start ? Number(args.start) : undefined;
          const count = args?.count ? Number(args.count) : undefined;

          try {
            // CRITICAL FIX: Use LanguageDispatcher for unified session management
            const result = await languageDispatcher.executeOperation(sessionId, 'getVariables', {
              variablesReference, filter, start, count
            });
            return { content: [{ type: 'text', text: JSON.stringify(result, null, 2) }] };
          } catch (error) {
            // Fallback to old SessionManager for backward compatibility
            try {
              const session = sessionManager.getSession(sessionId);
              if (!session) {
                return { content: [{ type: 'text', text: JSON.stringify({
                  success: false,
                  error: `Session not found: ${sessionId}`,
                  sessionId,
                  operation: 'getVariables',
                  suggestion: 'Make sure to connect first with debug_connect'
                }, null, 2) }] };
              }
              const response = await session.sendRequest<any>('variables', { variablesReference, filter, start, count });
              return { content: [{ type: 'text', text: JSON.stringify({
                success: true,
                data: response?.body || {},
                sessionId,
                operation: 'getVariables'
              }, null, 2) }] };
            } catch (fallbackError) {
              return { content: [{ type: 'text', text: JSON.stringify({
                success: false,
                error: error instanceof Error ? error.message : String(error),
                fallbackError: fallbackError instanceof Error ? fallbackError.message : String(fallbackError),
                sessionId,
                operation: 'getVariables'
              }, null, 2) }] };
            }
          }
        }



        case 'debug_getEnhancedStackTrace': {
          const sessionId = String(args?.sessionId);
          const threadId = Number(args?.threadId);
          const includeScopes = !!args?.includeScopes;
          const includeVariables = !!args?.includeVariables;
          const session = sessionManager.getSession(sessionId);
          if (!session) return { content: [{ type: 'text', text: `Session not found: ${sessionId}` }] };
          const frames = await enhanced.getEnhancedStackTrace(session, threadId, includeScopes, includeVariables);
          return { content: [{ type: 'text', text: JSON.stringify(frames, null, 2) }] };
        }

        case 'debug_getEnhancedVariables': {
          const sessionId = String(args?.sessionId);
          const variablesReference = Number(args?.variablesReference);
          const maxDepth = args?.maxDepth ? Number(args.maxDepth) : 3;
          const session = sessionManager.getSession(sessionId);
          if (!session) return { content: [{ type: 'text', text: `Session not found: ${sessionId}` }] };
          const vars = await enhanced.getEnhancedVariables(session, variablesReference, maxDepth);
          return { content: [{ type: 'text', text: JSON.stringify(vars, null, 2) }] };
        }

        case 'debug_evaluateEnhanced': {
          const sessionId = String(args?.sessionId);
          const expression = String(args?.expression);
          const frameId = args?.frameId ? Number(args.frameId) : undefined;
          const context = (args?.context as any) || 'repl';
          const session = sessionManager.getSession(sessionId);
          if (!session) return { content: [{ type: 'text', text: `Session not found: ${sessionId}` }] };
          const result = await enhanced.evaluateExpression(session, expression, frameId, context);
          return { content: [{ type: 'text', text: JSON.stringify(result, null, 2) }] };
        }

        case 'debug_getErrorStats': {
          return { content: [{ type: 'text', text: JSON.stringify(errorStats, null, 2) }] };
        }

        case 'debug_resetErrorStats': {
          errorStats.totalErrors = 0;
          return { content: [{ type: 'text', text: 'Error stats reset' }] };
        }

        case 'debug_validateEnvironment': {
          const info = {
            system: {
              os: `${os.type()} ${os.release()}`,
              rixa_version: '0.1.0',
            },
            permissions: {
              file_access: await checkPathReadable(args?.cwd || process.cwd()),
            },
            adapters: Object.fromEntries(
              Object.entries(adapters).map(([k, v]) => {
                const r = checkCmd(v.cmd, v.args);
                return [k, { status: r.ok ? 'available' : 'missing', detail: r.ok ? r.stdout : r.stderr, prerequisite: v.prerequisite, install_cmd: v.install }];
              })
            ),
          };
          return { content: [{ type: 'text', text: JSON.stringify(info, null, 2) }] };
        }

        case 'debug_listAdapters': {
          const list = Object.entries(adapters).map(([k, v]) => ({
            name: k,
            available: checkCmd(v.cmd, v.args).ok,
            prerequisite: v.prerequisite,
            install_cmd: v.install,
          }));
          return { content: [{ type: 'text', text: JSON.stringify(list, null, 2) }] };
        }

        case 'debug_testAdapter': {
          const lang = String(args?.lang);
          const v = adapters[lang as keyof typeof adapters];
          if (!v) return { content: [{ type: 'text', text: `Unsupported language: ${lang}` }] };
          const r = checkCmd(v.cmd, v.args);
          return { content: [{ type: 'text', text: JSON.stringify({ lang, ok: r.ok, stdout: r.stdout, stderr: r.stderr }, null, 2) }] };
        }

        case 'debug_prerequisites': {
          const lang = String(args?.lang);
          const v = adapters[lang as keyof typeof adapters];
          if (!v) return { content: [{ type: 'text', text: `Unsupported language: ${lang}` }] };
          return { content: [{ type: 'text', text: JSON.stringify({ lang, prerequisite: v.prerequisite, install_cmd: v.install }, null, 2) }] };
        }

        case 'debug_diagnose': {
          const program = args?.program ? String(args.program) : undefined;
          const cwd = args?.cwd ? String(args.cwd) : process.cwd();
          const diag = {
            program: program || '(none provided)',
            program_exists: program ? existsSync(program) : false,
            cwd,
            cwd_accessible: await checkPathReadable(cwd),
            adapters: Object.fromEntries(
              Object.entries(adapters).map(([k, v]) => {
                const r = checkCmd(v.cmd, v.args);
                return [k, { ok: r.ok, detail: r.ok ? r.stdout : r.stderr }];
              })
            )
          };
          return { content: [{ type: 'text', text: JSON.stringify(diag, null, 2) }] };
        }

        case 'debug_health': {
          const missing = Object.values(adapters).filter(v => !checkCmd(v.cmd, v.args).ok).length;
          const status = missing ? 'degraded' : 'healthy';
          const ports = { node: 9229, python: 5678, go: 38697 } as const;
          const portCheck = await Promise.all(Object.entries(ports).map(async ([k,p]) => ({ lang: k, port: p, free: await isPortFree(p) })));
          return { content: [{ type: 'text', text: JSON.stringify({ status, missingAdapters: missing, ports: portCheck }, null, 2) }] };
        }

        case 'debug_checkPorts': {
          const lang = args?.lang as 'node'|'python'|'go'|undefined;
          const ports = { node: [9229], python: [5678], go: [38697] } as const;
          const list = lang ? ports[lang] ?? [] : [...new Set(Object.values(ports).flat())];
          const results = await Promise.all(list.map(async p => ({ port: p, free: await isPortFree(p) })));
          return { content: [{ type: 'text', text: JSON.stringify({ lang: lang ?? 'all', results }, null, 2) }] };
        }

        case 'debug_setup': {
          const installMissing = !!args?.installMissing;
          const execute = !!args?.execute;
          const confirm = args?.confirm as string | undefined;
          const lang = args?.lang as 'node'|'python'|'java'|'go'|'rust'|undefined;
          const steps: string[] = [];
          const issues: string[] = [];

          // Check adapters
          const toCheck = lang ? [lang] : (Object.keys(adapters) as Array<'node'|'python'|'java'|'go'|'rust'>);
          for (const l of toCheck) {
            const a = adapters[l];
            const r = checkCmd(a.cmd, a.args);
            if (!r.ok) {
              issues.push(`${l} missing (${a.prerequisite}). Install: ${a.install}`);
              if (installMissing) steps.push(execute ? `RUN: ${a.install}` : `Would run: ${a.install}`);
            }
          }

          // Check ports
          const ports = { node: [9229], python: [5678], java: [5005], go: [38697], rust: [2345] } as const;
          for (const [k, list] of Object.entries(ports)) {
            for (const p of list) {
              const free = await isPortFree(p);
              if (!free) issues.push(`Port ${p} in use (${k})`);
            }
          }

          // Safety: require explicit confirmation to execute
          if (execute) {
            const expected = 'I UNDERSTAND AND APPROVE';
            if (confirm !== expected) {
              return { content: [{ type: 'text', text: JSON.stringify({ error: 'Confirmation required', expected, hint: "Call debug_setup again with execute: true and confirm: 'I UNDERSTAND AND APPROVE'" }, null, 2) }] };
            }
            // Execute allowed install commands when confirmed
            if (installMissing) {
              for (const l of toCheck) {
                const a = adapters[l];
                const r = checkCmd(a.cmd, a.args);
                if (!r.ok) {
                  const cmd = l === 'node' ? { c: 'npm', a: ['install', '-g', 'node-inspect'] }
                            : l === 'python' ? { c: 'pip', a: ['install', 'debugpy'] }
                            : l === 'java' ? { c: 'echo', a: ['Java debug agent is built-in, ensure JDK is installed'] }
                            : l === 'go' ? { c: 'go', a: ['install', 'github.com/go-delve/delve/cmd/dlv@latest'] }
                            : l === 'rust' ? { c: 'echo', a: ['Rust GDB is typically installed with system packages'] }
                            : null;
                  if (cmd) {
                    const res = runAllowed(cmd.c, cmd.a);
                    steps.push(`${res.ok ? 'Installed' : 'Failed'}: ${cmd.c} ${cmd.a.join(' ')} (code ${res.code})`);
                    if (!res.ok) issues.push(`Failed to install ${l}: ${res.stderr || res.stdout}`);
                  }
                }
              }
            }
          }

          const result = { status: issues.length ? 'needs_attention' : 'ready', issues, steps, executed: execute ? 'confirmed' : 'dry-run' };
          return { content: [{ type: 'text', text: JSON.stringify(result, null, 2) }] };
        }

        case 'debug_terminate': {
          const sessionId = String(args?.sessionId);
          await sessionManager.terminateSession(sessionId);
          return { content: [{ type: 'text', text: `Terminated session ${sessionId}` }] };
        }

        case 'debug_diagnoseJavaEnvironment': {
          const workspaceRoot = args?.workspaceRoot ? String(args.workspaceRoot) : process.cwd();

          const diagnosis = {
            workspace: {
              root: workspaceRoot,
              accessible: existsSync(workspaceRoot)
            },
            javaRuntime: {
              available: false,
              version: '',
              path: ''
            },
            debugAdapter: {
              jarFound: false,
              jarPath: '',
              accessible: false
            },
            projectStructure: {
              type: 'unknown',
              classPaths: [] as string[],
              sourcePaths: [workspaceRoot],
              buildTool: 'none'
            },
            recommendations: [] as string[]
          };

          // Check Java runtime
          const javaCheck = checkCmd('java', ['-version']);
          if (javaCheck.ok) {
            diagnosis.javaRuntime.available = true;
            diagnosis.javaRuntime.version = javaCheck.stderr?.split('\n')[0] || javaCheck.stdout?.split('\n')[0] || 'unknown';
          } else {
            diagnosis.recommendations.push('Install Java JDK 8 or higher');
          }

          // Check debug adapter
          const jarPath = findJavaDebugAdapterJar();
          if (jarPath) {
            diagnosis.debugAdapter.jarFound = true;
            diagnosis.debugAdapter.jarPath = jarPath;
            diagnosis.debugAdapter.accessible = existsSync(jarPath);
          } else {
            diagnosis.recommendations.push('Install VS Code Java Extension Pack or download Java Debug Adapter');
          }

          // Detect project structure
          const classPaths = detectJavaClasspath(workspaceRoot);
          diagnosis.projectStructure.classPaths = classPaths;

          // Detect build tool
          if (existsSync(`${workspaceRoot}/pom.xml`)) {
            diagnosis.projectStructure.buildTool = 'maven';
            diagnosis.projectStructure.type = 'maven';
          } else if (existsSync(`${workspaceRoot}/build.gradle`) || existsSync(`${workspaceRoot}/build.gradle.kts`)) {
            diagnosis.projectStructure.buildTool = 'gradle';
            diagnosis.projectStructure.type = 'gradle';
          } else if (existsSync(`${workspaceRoot}/.project`)) {
            diagnosis.projectStructure.type = 'eclipse';
          } else if (existsSync(`${workspaceRoot}/.idea`)) {
            diagnosis.projectStructure.type = 'intellij';
          }

          // Add recommendations based on findings
          if (diagnosis.javaRuntime.available && diagnosis.debugAdapter.jarFound) {
            diagnosis.recommendations.push('✅ Java debugging should work! Try: debug_attachSession(adapter="java", port=5005)');
            diagnosis.recommendations.push('Run your Java app with: java -agentlib:jdwp=transport=dt_socket,server=y,suspend=n,address=5005 YourMainClass');
          }

          return { content: [{ type: 'text', text: JSON.stringify(diagnosis, null, 2) }] };
        }

        case 'debug_enhancedJavaDetection': {
          const workspaceRoot = String(args?.workspaceRoot || process.cwd());

          try {
            const projectInfo = analyzeJavaProject(workspaceRoot);
            return { content: [{ type: 'text', text: JSON.stringify(projectInfo, null, 2) }] };
          } catch (error) {
            return { content: [{ type: 'text', text: `Enhanced detection failed: ${error}` }] };
          }
        }

        case 'debug_validateJDWPConnection': {
          const host = String(args?.host || 'localhost');
          const port = Number(args?.port || 5005);
          const timeout = Number(args?.timeout || 10000);
          const retryAttempts = Number(args?.retryAttempts || 3);

          try {
            const validator = new JDWPValidator(host, port, { timeout, retryAttempts });
            const result = await validator.validateConnection();
            return { content: [{ type: 'text', text: JSON.stringify(result, null, 2) }] };
          } catch (error) {
            return { content: [{ type: 'text', text: `JDWP validation failed: ${error}` }] };
          }
        }

        case 'debug_scanJDWPAgents': {
          const portStart = Number(args?.portStart || 5000);
          const portEnd = Number(args?.portEnd || 9999);

          try {
            const agents = await scanForJDWPAgents({ start: portStart, end: portEnd });
            return { content: [{ type: 'text', text: JSON.stringify(agents, null, 2) }] };
          } catch (error) {
            return { content: [{ type: 'text', text: `JDWP scan failed: ${error}` }] };
          }
        }

        case 'debug_startHybridDebugging': {
          const workspaceRoot = String(args?.workspaceRoot || process.cwd());
          const applicationUrl = String(args?.applicationUrl || 'http://localhost:8080');
          const logFiles = Array.isArray(args?.logFiles) ? args.logFiles.map(String) : ['logs/application.log'];
          const apiEndpoints = Array.isArray(args?.apiEndpoints) ? args.apiEndpoints.map(String) : ['/actuator/health'];

          try {
            const config: HybridDebugConfig = {
              workspaceRoot,
              applicationUrl,
              logFiles,
              apiEndpoints,
              enableLogWatching: true,
              enableApiTesting: true,
              enableBreakpointSimulation: true
            };

            const hybridDebugger = new HybridDebugger(config);
            await hybridDebugger.start();

            // Store reference for later use (in a real implementation, you'd use a session manager)
            (global as any).hybridDebugger = hybridDebugger;

            return { content: [{ type: 'text', text: 'Hybrid debugging started successfully' }] };
          } catch (error) {
            return { content: [{ type: 'text', text: `Hybrid debugging failed: ${error}` }] };
          }
        }

        case 'debug_stopHybridDebugging': {
          try {
            const hybridDebugger = (global as any).hybridDebugger;
            if (hybridDebugger) {
              await hybridDebugger.stop();
              delete (global as any).hybridDebugger;
              return { content: [{ type: 'text', text: 'Hybrid debugging stopped' }] };
            } else {
              return { content: [{ type: 'text', text: 'No active hybrid debugging session' }] };
            }
          } catch (error) {
            return { content: [{ type: 'text', text: `Failed to stop hybrid debugging: ${error}` }] };
          }
        }

        case 'debug_executeApiTest': {
          const endpoint = String(args?.endpoint);
          const method = String(args?.method || 'GET');
          const data = args?.data;

          try {
            const hybridDebugger = (global as any).hybridDebugger;
            if (!hybridDebugger) {
              return { content: [{ type: 'text', text: 'No active hybrid debugging session. Start hybrid debugging first.' }] };
            }

            const result = await hybridDebugger.executeApiTest(endpoint, method, data);
            return { content: [{ type: 'text', text: JSON.stringify(result, null, 2) }] };
          } catch (error) {
            return { content: [{ type: 'text', text: `API test failed: ${error}` }] };
          }
        }

        case 'debug_addBreakpointSimulation': {
          const className = String(args?.className);
          const methodName = String(args?.methodName);
          const logLevel = String(args?.logLevel || 'INFO') as 'INFO' | 'DEBUG' | 'WARN' | 'ERROR';

          try {
            const hybridDebugger = (global as any).hybridDebugger;
            if (!hybridDebugger) {
              return { content: [{ type: 'text', text: 'No active hybrid debugging session. Start hybrid debugging first.' }] };
            }

            hybridDebugger.addBreakpointSimulation({ className, methodName, logLevel });
            return { content: [{ type: 'text', text: `Breakpoint simulation added for ${className}.${methodName}` }] };
          } catch (error) {
            return { content: [{ type: 'text', text: `Failed to add breakpoint simulation: ${error}` }] };
          }
        }

        case 'debug_attemptErrorRecovery': {
          const errorType = String(args?.errorType) as 'connection' | 'handshake' | 'configuration' | 'timeout' | 'unknown';
          const errorMessage = String(args?.errorMessage);
          const workspaceRoot = String(args?.workspaceRoot || process.cwd());

          try {
            const errorRecovery = new AdvancedErrorRecovery();
            const projectInfo = analyzeJavaProject(workspaceRoot);

            const debugError: DebugError = {
              type: errorType,
              message: errorMessage,
              timestamp: new Date(),
              retryCount: 0
            };

            const context: RecoveryContext = {
              workspaceRoot,
              projectInfo,
              originalConfig: {},
              availablePorts: detectActiveDebugPorts(),
              jdwpAgents: await scanForJDWPAgents()
            };

            const result = await errorRecovery.attemptRecovery(debugError, context);
            return { content: [{ type: 'text', text: JSON.stringify(result, null, 2) }] };
          } catch (error) {
            return { content: [{ type: 'text', text: `Error recovery failed: ${error}` }] };
          }
        }

        case 'debug_getTroubleshootingGuide': {
          const problemType = String(args?.problemType);

          try {
            const errorRecovery = new AdvancedErrorRecovery();
            const debugError: DebugError = {
              type: problemType as any,
              message: 'User requested troubleshooting guide',
              timestamp: new Date(),
              retryCount: 0
            };

            const guide = errorRecovery.generateTroubleshootingGuide(debugError);
            return { content: [{ type: 'text', text: JSON.stringify(guide, null, 2) }] };
          } catch (error) {
            return { content: [{ type: 'text', text: `Failed to generate troubleshooting guide: ${error}` }] };
          }
        }

        case 'debug_scanPortsAdvanced': {
          const portStart = Number(args?.portStart || 5000);
          const portEnd = Number(args?.portEnd || 9999);
          const deepScan = Boolean(args?.deepScan !== false);

          try {
            const portManager = new PortManager();
            const ports = await portManager.scanPorts({
              portRange: { start: portStart, end: portEnd },
              deepScan,
              includeSystemPorts: false,
              timeout: 5000
            });
            return { content: [{ type: 'text', text: JSON.stringify(ports, null, 2) }] };
          } catch (error) {
            return { content: [{ type: 'text', text: `Advanced port scan failed: ${error}` }] };
          }
        }

        case 'debug_createAdvancedConnection': {
          const host = String(args?.host || 'localhost');
          const port = Number(args?.port || 5005);
          const type = String(args?.type || 'auto') as 'jdwp' | 'hybrid' | 'auto';
          const handleConflicts = Boolean(args?.handleConflicts !== false);
          const observerMode = Boolean(args?.observerMode);
          const projectPath = args?.projectPath ? String(args.projectPath) : undefined;

          try {
            const connectionManager = new ConnectionManager();
            const connectionOptions: any = {
              host,
              port,
              type,
              handleConflicts,
              observerMode,
              timeout: 10000,
              retryAttempts: 3
            };

            if (projectPath) {
              connectionOptions.projectPath = projectPath;
            }

            const result = await connectionManager.createConnection(connectionOptions);

            // Store connection manager globally for session management
            (global as any).connectionManager = connectionManager;

            return { content: [{ type: 'text', text: JSON.stringify(result, null, 2) }] };
          } catch (error) {
            return { content: [{ type: 'text', text: `Advanced connection failed: ${error}` }] };
          }
        }

        case 'debug_listActiveSessions': {
          try {
            const connectionManager = (global as any).connectionManager;
            if (!connectionManager) {
              return { content: [{ type: 'text', text: 'No connection manager active. Create a connection first.' }] };
            }

            const sessions = connectionManager.getActiveSessions();
            return { content: [{ type: 'text', text: JSON.stringify(sessions, null, 2) }] };
          } catch (error) {
            return { content: [{ type: 'text', text: `Failed to list sessions: ${error}` }] };
          }
        }

        case 'debug_disconnectSession': {
          const sessionId = String(args?.sessionId);

          try {
            const connectionManager = (global as any).connectionManager;
            if (!connectionManager) {
              return { content: [{ type: 'text', text: 'No connection manager active.' }] };
            }

            const success = await connectionManager.disconnectSession(sessionId);
            return { content: [{ type: 'text', text: success ? 'Session disconnected successfully' : 'Failed to disconnect session' }] };
          } catch (error) {
            return { content: [{ type: 'text', text: `Failed to disconnect session: ${error}` }] };
          }
        }

        case 'debug_startInteractiveTroubleshooting': {
          const problem = String(args?.problem);
          const workspaceRoot = String(args?.workspaceRoot);
          const targetPort = args?.targetPort ? Number(args.targetPort) : undefined;

          try {
            const troubleshooter = new InteractiveTroubleshooter();
            const session = await troubleshooter.startTroubleshooting(problem, workspaceRoot, targetPort);

            // Store troubleshooter globally
            (global as any).troubleshooter = troubleshooter;

            return { content: [{ type: 'text', text: JSON.stringify(session, null, 2) }] };
          } catch (error) {
            return { content: [{ type: 'text', text: `Failed to start troubleshooting: ${error}` }] };
          }
        }

        case 'debug_getTroubleshootingSession': {
          const sessionId = String(args?.sessionId);

          try {
            const troubleshooter = (global as any).troubleshooter;
            if (!troubleshooter) {
              return { content: [{ type: 'text', text: 'No troubleshooter active. Start troubleshooting first.' }] };
            }

            const session = troubleshooter.getTroubleshootingSession(sessionId);
            return { content: [{ type: 'text', text: JSON.stringify(session, null, 2) }] };
          } catch (error) {
            return { content: [{ type: 'text', text: `Failed to get troubleshooting session: ${error}` }] };
          }
        }

        case 'debug_runComprehensiveDiagnostics': {
          const workspaceRoot = String(args?.workspaceRoot);

          try {
            const troubleshooter = new InteractiveTroubleshooter();
            const diagnostics = await troubleshooter.runComprehensiveDiagnostics(workspaceRoot);
            return { content: [{ type: 'text', text: JSON.stringify(diagnostics, null, 2) }] };
          } catch (error) {
            return { content: [{ type: 'text', text: `Comprehensive diagnostics failed: ${error}` }] };
          }
        }

        case 'debug_suggestPortResolution': {
          const port = Number(args?.port || 5005);

          try {
            const portManager = new PortManager();
            const resolutions = await portManager.suggestConflictResolution(port);
            return { content: [{ type: 'text', text: JSON.stringify(resolutions, null, 2) }] };
          } catch (error) {
            return { content: [{ type: 'text', text: `Failed to suggest port resolution: ${error}` }] };
          }
        }

        case 'debug_startPortMonitoring': {
          const intervalMs = Number(args?.intervalMs || 30000);

          try {
            const portManager = (global as any).portManager || new PortManager();
            (global as any).portManager = portManager;

            portManager.startMonitoring(intervalMs);
            return { content: [{ type: 'text', text: `Port monitoring started with ${intervalMs}ms interval` }] };
          } catch (error) {
            return { content: [{ type: 'text', text: `Failed to start port monitoring: ${error}` }] };
          }
        }

        case 'debug_stopPortMonitoring': {
          try {
            const portManager = (global as any).portManager;
            if (!portManager) {
              return { content: [{ type: 'text', text: 'No port monitoring active.' }] };
            }

            portManager.stopMonitoring();
            return { content: [{ type: 'text', text: 'Port monitoring stopped' }] };
          } catch (error) {
            return { content: [{ type: 'text', text: `Failed to stop port monitoring: ${error}` }] };
          }
        }

        case 'debug_validateJDWPConnectionEnhanced': {
          const host = String(args?.host || 'localhost');
          const port = Number(args?.port || 5005);
          const timeout = Number(args?.timeout || 10000);
          const retryAttempts = Number(args?.retryAttempts || 3);

          try {
            const validator = new JDWPValidator(host, port, { timeout, retryAttempts });
            const connectionInfo = await validator.validateConnection();

            // Enhanced analysis and recommendations
            const analysis = {
              connectionInfo,
              analysis: {
                portAccessible: connectionInfo.connected || connectionInfo.jdwpAgentDetected,
                jdwpAgentPresent: connectionInfo.jdwpAgentDetected || false,
                hasActiveClient: connectionInfo.hasActiveClient || false,
                canConnect: connectionInfo.connected,
                recommendedAction: ''
              },
              recommendations: [] as string[],
              nextSteps: [] as string[]
            };

            // Generate specific recommendations based on the analysis
            if (connectionInfo.connected) {
              analysis.analysis.recommendedAction = 'direct_connection';
              analysis.recommendations.push('✅ JDWP connection successful - you can debug normally');
              analysis.recommendations.push('Use debug_attachSession for full debugging capabilities');
              analysis.nextSteps.push('Set breakpoints and start debugging');
              analysis.nextSteps.push('Use debug_setBreakpoints to add breakpoints');
            } else if (connectionInfo.jdwpAgentDetected && connectionInfo.hasActiveClient) {
              analysis.analysis.recommendedAction = 'observer_mode_or_hybrid';
              analysis.recommendations.push('🔍 JDWP agent detected but has active client connection');
              analysis.recommendations.push('✅ Use Observer Mode: debug_attachSession({ observerMode: true })');
              analysis.recommendations.push('🔄 Use Hybrid Debugging: debug_startHybridDebugging()');
              analysis.recommendations.push('🚀 Use Advanced Connection: debug_createAdvancedConnection({ handleConflicts: true })');
              analysis.nextSteps.push('Choose observer mode for non-invasive monitoring');
              analysis.nextSteps.push('Choose hybrid debugging for API testing and log analysis');
              analysis.nextSteps.push('Choose advanced connection for automatic conflict resolution');
            } else if (connectionInfo.jdwpAgentDetected) {
              analysis.analysis.recommendedAction = 'retry_connection';
              analysis.recommendations.push('🔍 JDWP agent detected but connection failed');
              analysis.recommendations.push('🔄 Try again - agent may be temporarily busy');
              analysis.recommendations.push('⚠️ Check firewall and network connectivity');
              analysis.nextSteps.push('Retry connection with higher timeout');
              analysis.nextSteps.push('Check application logs for debug agent status');
            } else {
              analysis.analysis.recommendedAction = 'start_debug_agent';
              analysis.recommendations.push('❌ No JDWP agent detected on port ' + port);
              analysis.recommendations.push('🚀 Start your application with debug agent enabled');
              analysis.recommendations.push('📋 Command: java -agentlib:jdwp=transport=dt_socket,server=y,suspend=n,address=' + port + ' YourApp');
              analysis.nextSteps.push('Start application with debug agent');
              analysis.nextSteps.push('Verify application is listening on port ' + port);
              analysis.nextSteps.push('Use debug_scanPortsAdvanced to find active agents');
            }

            return { content: [{ type: 'text', text: JSON.stringify(analysis, null, 2) }] };
          } catch (error) {
            return { content: [{ type: 'text', text: `Enhanced JDWP validation failed: ${error}` }] };
          }
        }

        case 'debug_verifyPortStatus': {
          const port = Number(args?.port || 5005);
          const includeProcessDetails = Boolean(args?.includeProcessDetails !== false);

          try {
            // Use system-level commands to get accurate port status
            const { execSync } = await import('child_process');

            // Get comprehensive port information
            const lsofResult = execSync(`lsof -i :${port} -P -n`, {
              encoding: 'utf-8',
              timeout: 5000
            });

            const lines = lsofResult.split('\n').filter(line =>
              line.trim() && !line.startsWith('COMMAND')
            );

            const portStatus = {
              port,
              inUse: lines.length > 0,
              connections: [] as any[],
              summary: {
                listening: false,
                established: 0,
                total: lines.length
              },
              systemCheck: {
                lsofOutput: lsofResult,
                timestamp: new Date().toISOString()
              }
            };

            // Analyze each connection
            for (const line of lines) {
              const parts = line.split(/\s+/);
              if (parts.length >= 8) {
                const connection: any = {
                  process: parts[0],
                  pid: parts[1],
                  user: parts[2],
                  fd: parts[3],
                  type: parts[4],
                  device: parts[5],
                  node: parts[7],
                  name: parts[8],
                  state: line.includes('LISTEN') ? 'LISTEN' :
                         line.includes('ESTABLISHED') ? 'ESTABLISHED' : 'OTHER'
                };

                if (includeProcessDetails) {
                  connection.fullLine = line;
                }

                portStatus.connections.push(connection);

                if (connection.state === 'LISTEN') {
                  portStatus.summary.listening = true;
                }
                if (connection.state === 'ESTABLISHED') {
                  portStatus.summary.established++;
                }
              }
            }

            // Add recommendations based on findings
            const recommendations = [];
            if (!portStatus.inUse) {
              recommendations.push('❌ Port is not in use - no processes detected');
              recommendations.push('🚀 Start your application with debug agent on this port');
            } else if (portStatus.summary.listening) {
              recommendations.push('✅ Port has listening process - likely a server/debug agent');
              if (portStatus.summary.established > 0) {
                recommendations.push(`⚠️ ${portStatus.summary.established} established connection(s) detected`);
                recommendations.push('🔍 Use observer mode or hybrid debugging to avoid conflicts');
              } else {
                recommendations.push('✅ No active connections - port should be available for debugging');
              }
            } else if (portStatus.summary.established > 0) {
              recommendations.push('⚠️ Port has established connections but no listener');
              recommendations.push('🔍 This might indicate a client-side connection');
            }

            return { content: [{ type: 'text', text: JSON.stringify({
              ...portStatus,
              recommendations
            }, null, 2) }] };

          } catch (error) {
            // If lsof fails, port is likely not in use
            return { content: [{ type: 'text', text: JSON.stringify({
              port,
              inUse: false,
              error: error instanceof Error ? error.message : String(error),
              recommendations: [
                '❌ Port verification failed - likely not in use',
                '🚀 Start your application with debug agent enabled',
                `📋 Command: java -agentlib:jdwp=transport=dt_socket,server=y,suspend=n,address=${port} YourApp`
              ]
            }, null, 2) }] };
          }
        }

        // Generalized Language Debugging
        case 'debug_connect': {
          const language = String(args?.language) as SupportedLanguage;
          const host = String(args?.host || 'localhost');
          const port = args?.port ? Number(args.port) : undefined;
          const framework = args?.framework ? String(args.framework) : undefined;
          const enableFrameworkTools = Boolean(args?.enableFrameworkTools !== false);

          try {
            const result = await languageDispatcher.connect({
              language,
              host,
              ...(port !== undefined && { port }),
              ...(framework && { framework }),
              enableFrameworkTools
            });

            return { content: [{ type: 'text', text: JSON.stringify(result, null, 2) }] };
          } catch (error) {
            return { content: [{ type: 'text', text: JSON.stringify({
              success: false,
              error: error instanceof Error ? error.message : String(error),
              language,
              operation: 'connect'
            }, null, 2) }] };
          }
        }

        case 'debug_getSessions': {
          try {
            const sessions = languageDispatcher.getSessions();
            return { content: [{ type: 'text', text: JSON.stringify({
              success: true,
              sessions: sessions.map(s => ({
                sessionId: s.sessionId,
                language: s.language,
                framework: s.framework,
                metadata: s.metadata
              }))
            }, null, 2) }] };
          } catch (error) {
            return { content: [{ type: 'text', text: JSON.stringify({
              success: false,
              error: error instanceof Error ? error.message : String(error),
              operation: 'getSessions'
            }, null, 2) }] };
          }
        }

        case 'debug_setBreakpoint': {
          const sessionId = String(args?.sessionId);
          const url = args?.url ? String(args.url) : undefined;
          const lineNumber = args?.lineNumber ? Number(args.lineNumber) : undefined;
          const condition = args?.condition ? String(args.condition) : undefined;
          const className = args?.className ? String(args.className) : undefined;
          const methodName = args?.methodName ? String(args.methodName) : undefined;

          try {
            const result = await languageDispatcher.executeOperation(sessionId, 'setBreakpoint', {
              url,
              lineNumber,
              condition,
              className,
              methodName
            });

            return { content: [{ type: 'text', text: JSON.stringify(result, null, 2) }] };
          } catch (error) {
            return { content: [{ type: 'text', text: JSON.stringify({
              success: false,
              error: error instanceof Error ? error.message : String(error),
              sessionId,
              operation: 'setBreakpoint'
            }, null, 2) }] };
          }
        }

        case 'debug_evaluate': {
          const sessionId = String(args?.sessionId);
          const expression = String(args?.expression);
          const contextId = args?.contextId ? Number(args.contextId) : undefined;
          const frameId = args?.frameId ? Number(args.frameId) : undefined;

          try {
            const result = await languageDispatcher.executeOperation(sessionId, 'evaluate', {
              expression,
              contextId,
              frameId
            });

            return { content: [{ type: 'text', text: JSON.stringify(result, null, 2) }] };
          } catch (error) {
            return { content: [{ type: 'text', text: JSON.stringify({
              success: false,
              error: error instanceof Error ? error.message : String(error),
              sessionId,
              operation: 'evaluate'
            }, null, 2) }] };
          }
        }

        // Framework-Specific Operations
        case 'debug_getComponents': {
          const sessionId = String(args?.sessionId);
          const framework = args?.framework ? String(args.framework) : undefined;

          try {
            const result = await languageDispatcher.executeOperation(sessionId, 'getComponents', {
              framework
            });

            return { content: [{ type: 'text', text: JSON.stringify(result, null, 2) }] };
          } catch (error) {
            return { content: [{ type: 'text', text: JSON.stringify({
              success: false,
              error: error instanceof Error ? error.message : String(error),
              sessionId,
              operation: 'getComponents'
            }, null, 2) }] };
          }
        }

        case 'debug_getComponentDetails': {
          const sessionId = String(args?.sessionId);
          const componentName = String(args?.componentName);
          const detailType = String(args?.detailType || 'all');

          try {
            const result = await languageDispatcher.executeOperation(sessionId, 'getComponentDetails', {
              componentName,
              detailType
            });

            return { content: [{ type: 'text', text: JSON.stringify(result, null, 2) }] };
          } catch (error) {
            return { content: [{ type: 'text', text: JSON.stringify({
              success: false,
              error: error instanceof Error ? error.message : String(error),
              sessionId,
              operation: 'getComponentDetails'
            }, null, 2) }] };
          }
        }

        case 'debug_setComponentBreakpoint': {
          const sessionId = String(args?.sessionId);
          const componentName = String(args?.componentName);

          try {
            const result = await languageDispatcher.executeOperation(sessionId, 'setComponentBreakpoint', {
              componentName
            });

            return { content: [{ type: 'text', text: JSON.stringify(result, null, 2) }] };
          } catch (error) {
            return { content: [{ type: 'text', text: JSON.stringify({
              success: false,
              error: error instanceof Error ? error.message : String(error),
              sessionId,
              operation: 'setComponentBreakpoint'
            }, null, 2) }] };
          }
        }

        case 'debug_startProfiling': {
          const sessionId = String(args?.sessionId);
          const profilingType = String(args?.profilingType || 'performance');

          try {
            const result = await languageDispatcher.executeOperation(sessionId, 'startProfiling', {
              profilingType
            });

            return { content: [{ type: 'text', text: JSON.stringify(result, null, 2) }] };
          } catch (error) {
            return { content: [{ type: 'text', text: JSON.stringify({
              success: false,
              error: error instanceof Error ? error.message : String(error),
              sessionId,
              operation: 'startProfiling'
            }, null, 2) }] };
          }
        }

        case 'debug_stopProfiling': {
          const sessionId = String(args?.sessionId);

          try {
            const result = await languageDispatcher.executeOperation(sessionId, 'stopProfiling', {});

            return { content: [{ type: 'text', text: JSON.stringify(result, null, 2) }] };
          } catch (error) {
            return { content: [{ type: 'text', text: JSON.stringify({
              success: false,
              error: error instanceof Error ? error.message : String(error),
              sessionId,
              operation: 'stopProfiling'
            }, null, 2) }] };
          }
        }

        case 'debug_getFrameworkInfo': {
          const sessionId = String(args?.sessionId);
          const infoType = String(args?.infoType);

          try {
            const result = await languageDispatcher.executeOperation(sessionId, 'getFrameworkInfo', {
              infoType
            });

            return { content: [{ type: 'text', text: JSON.stringify(result, null, 2) }] };
          } catch (error) {
            return { content: [{ type: 'text', text: JSON.stringify({
              success: false,
              error: error instanceof Error ? error.message : String(error),
              sessionId,
              operation: 'getFrameworkInfo'
            }, null, 2) }] };
          }
        }

        case 'debug_analyzeFrameworkIssues': {
          const sessionId = String(args?.sessionId);
          const analysisType = String(args?.analysisType);

          try {
            const result = await languageDispatcher.executeOperation(sessionId, 'analyzeFrameworkIssues', {
              analysisType
            });

            return { content: [{ type: 'text', text: JSON.stringify(result, null, 2) }] };
          } catch (error) {
            return { content: [{ type: 'text', text: JSON.stringify({
              success: false,
              error: error instanceof Error ? error.message : String(error),
              sessionId,
              operation: 'analyzeFrameworkIssues'
            }, null, 2) }] };
          }
        }

        case 'debug_getPerformanceMetrics': {
          const sessionId = String(args?.sessionId);
          const metricsType = String(args?.metricsType || 'general');

          try {
            const result = await languageDispatcher.executeOperation(sessionId, 'getPerformanceMetrics', {
              metricsType
            });

            return { content: [{ type: 'text', text: JSON.stringify(result, null, 2) }] };
          } catch (error) {
            return { content: [{ type: 'text', text: JSON.stringify({
              success: false,
              error: error instanceof Error ? error.message : String(error),
              sessionId,
              operation: 'getPerformanceMetrics'
            }, null, 2) }] };
          }
        }

        case 'debug_startAsyncTracking': {
          const sessionId = String(args?.sessionId);
          const trackingType = String(args?.trackingType || 'promises');

          try {
            const result = await languageDispatcher.executeOperation(sessionId, 'startAsyncTracking', {
              trackingType
            });

            return { content: [{ type: 'text', text: JSON.stringify(result, null, 2) }] };
          } catch (error) {
            return { content: [{ type: 'text', text: JSON.stringify({
              success: false,
              error: error instanceof Error ? error.message : String(error),
              sessionId,
              operation: 'startAsyncTracking'
            }, null, 2) }] };
          }
        }

        case 'debug_stopAsyncTracking': {
          const sessionId = String(args?.sessionId);

          try {
            const result = await languageDispatcher.executeOperation(sessionId, 'stopAsyncTracking', {});

            return { content: [{ type: 'text', text: JSON.stringify(result, null, 2) }] };
          } catch (error) {
            return { content: [{ type: 'text', text: JSON.stringify({
              success: false,
              error: error instanceof Error ? error.message : String(error),
              sessionId,
              operation: 'stopAsyncTracking'
            }, null, 2) }] };
          }
        }

        case 'debug_getAsyncOperations': {
          const sessionId = String(args?.sessionId);
          const operationType = String(args?.operationType || 'all');

          try {
            const result = await languageDispatcher.executeOperation(sessionId, 'getAsyncOperations', {
              operationType
            });

            return { content: [{ type: 'text', text: JSON.stringify(result, null, 2) }] };
          } catch (error) {
            return { content: [{ type: 'text', text: JSON.stringify({
              success: false,
              error: error instanceof Error ? error.message : String(error),
              sessionId,
              operation: 'getAsyncOperations'
            }, null, 2) }] };
          }
        }

        case 'debug_traceAsyncFlow': {
          const sessionId = String(args?.sessionId);
          const rootOperationId = args?.rootOperationId ? String(args.rootOperationId) : undefined;

          try {
            const result = await languageDispatcher.executeOperation(sessionId, 'traceAsyncFlow', {
              rootOperationId
            });

            return { content: [{ type: 'text', text: JSON.stringify(result, null, 2) }] };
          } catch (error) {
            return { content: [{ type: 'text', text: JSON.stringify({
              success: false,
              error: error instanceof Error ? error.message : String(error),
              sessionId,
              operation: 'traceAsyncFlow'
            }, null, 2) }] };
          }
        }

        case 'debug_disconnect': {
          const sessionId = String(args?.sessionId);

          try {
            const result = await languageDispatcher.disconnect(sessionId);

            return { content: [{ type: 'text', text: JSON.stringify(result, null, 2) }] };
          } catch (error) {
            return { content: [{ type: 'text', text: JSON.stringify({
              success: false,
              error: error instanceof Error ? error.message : String(error),
              sessionId,
              operation: 'disconnect'
            }, null, 2) }] };
          }
        }

        case 'debug_diagnoseConnection': {
          const sessionId = String(args?.sessionId);

          try {
            const session = languageDispatcher.getSession(sessionId);
            if (!session) {
              return { content: [{ type: 'text', text: JSON.stringify({
                success: false,
                error: `Session not found: ${sessionId}`,
                diagnosis: {
                  sessionExists: false,
                  recommendations: [
                    'Check if the session ID is correct',
                    'Try connecting again with debug_connect',
                    'Use debug_getSessions to see active sessions'
                  ]
                }
              }, null, 2) }] };
            }

            const diagnosis = {
              sessionExists: true,
              sessionId: session.sessionId,
              language: session.language,
              framework: session.framework,
              debuggerType: session.debugger?.type || 'unknown',
              webSocketUrl: session.debugger?.webSocketUrl || null,
              connected: session.debugger?.connected || false,
              recommendations: [] as string[]
            };

            // Add specific recommendations based on the session state
            if (!session.debugger?.connected) {
              diagnosis.recommendations.push('WebSocket connection not established');
              diagnosis.recommendations.push('Try reconnecting with debug_connect');
            }

            if (session.language === 'node' || session.language === 'javascript') {
              diagnosis.recommendations.push('For Node.js debugging, ensure your app is started with --inspect flag');
              diagnosis.recommendations.push('Example: node --inspect=0.0.0.0:9229 your-app.js');
            }

            if (session.language === 'react' || session.language === 'nextjs') {
              diagnosis.recommendations.push('For React/Next.js debugging, ensure Chrome DevTools is available');
              diagnosis.recommendations.push('Open Chrome and navigate to chrome://inspect');
            }

            return { content: [{ type: 'text', text: JSON.stringify({
              success: true,
              diagnosis
            }, null, 2) }] };
          } catch (error) {
            return { content: [{ type: 'text', text: JSON.stringify({
              success: false,
              error: error instanceof Error ? error.message : String(error),
              sessionId,
              operation: 'diagnoseConnection'
            }, null, 2) }] };
          }
        }

        case 'debug_diagnoseFramework': {
          const sessionId = String(args?.sessionId);

          try {
            const session = languageDispatcher.getSession(sessionId);
            if (!session) {
              return { content: [{ type: 'text', text: JSON.stringify({
                success: false,
                error: `Session not found: ${sessionId}`,
                diagnosis: {
                  sessionExists: false,
                  recommendations: [
                    'Check if the session ID is correct',
                    'Try connecting again with debug_connect',
                    'Use debug_getSessions to see active sessions'
                  ]
                }
              }, null, 2) }] };
            }

            const { language, debugger: debuggerInfo } = session;
            const isFramework = language === 'react' || language === 'nextjs';

            if (!isFramework) {
              return { content: [{ type: 'text', text: JSON.stringify({
                success: false,
                error: `Session ${sessionId} is not a framework session (language: ${language})`,
                diagnosis: {
                  isFramework: false,
                  language,
                  recommendations: [
                    'This diagnostic is for React/Next.js sessions only',
                    'Use debug_diagnoseConnection for general connection issues'
                  ]
                }
              }, null, 2) }] };
            }

            const diagnosis = {
              sessionExists: true,
              sessionId: session.sessionId,
              language: session.language,
              framework: session.framework,
              isFramework: true,
              debuggerType: debuggerInfo?.type || 'unknown',
              webSocketUrl: debuggerInfo?.webSocketUrl || null,
              connected: debuggerInfo?.connected || false,
              hasWebSocket: !!(debuggerInfo?.webSocketUrl && (debuggerInfo?.type?.includes('node') || debuggerInfo?.type === 'node-inspector')),
              capabilities: {
                getComponents: true,
                getFrameworkInfo: true,
                analyzeFrameworkIssues: true,
                setBreakpoints: !!(debuggerInfo?.webSocketUrl),
                evaluate: !!(debuggerInfo?.webSocketUrl),
                controlFlow: !!(debuggerInfo?.webSocketUrl)
              },
              recommendations: [] as string[]
            };

            // Add specific recommendations for framework debugging
            if (!diagnosis.hasWebSocket) {
              diagnosis.recommendations.push('⚠️  No WebSocket connection detected for framework session');
              diagnosis.recommendations.push('For full functionality, ensure your app is running with Node.js --inspect flag');
              diagnosis.recommendations.push(`Example: node --inspect=0.0.0.0:9229 ${language === 'nextjs' ? 'next dev' : 'your-react-app.js'}`);
              diagnosis.recommendations.push('Framework operations will work in limited mode without WebSocket');
            } else {
              diagnosis.recommendations.push('✅ WebSocket connection available - full framework debugging enabled');
              diagnosis.recommendations.push('All framework operations should work correctly');
            }

            if (language === 'react') {
              diagnosis.recommendations.push('For React DevTools integration, install React DevTools browser extension');
              diagnosis.recommendations.push('Component inspection and profiling available');
            }

            if (language === 'nextjs') {
              diagnosis.recommendations.push('Next.js specific debugging includes SSR, hydration, and API route debugging');
              diagnosis.recommendations.push('Bundle analysis and performance metrics available');
            }

            return { content: [{ type: 'text', text: JSON.stringify({
              success: true,
              diagnosis
            }, null, 2) }] };
          } catch (error) {
            return { content: [{ type: 'text', text: JSON.stringify({
              success: false,
              error: error instanceof Error ? error.message : String(error),
              sessionId,
              operation: 'diagnoseFramework'
            }, null, 2) }] };
          }
        }

        case 'debug_diagnoseJava': {
          const sessionId = String(args?.sessionId);

          try {
            const session = languageDispatcher.getSession(sessionId);
            if (!session) {
              return { content: [{ type: 'text', text: JSON.stringify({
                success: false,
                error: `Session not found: ${sessionId}`,
                diagnosis: {
                  sessionExists: false,
                  recommendations: [
                    'Check if the session ID is correct',
                    'Try connecting again with debug_connect',
                    'Use debug_getSessions to see active sessions'
                  ]
                }
              }, null, 2) }] };
            }

            const { language, debugger: debuggerInfo } = session;

            if (language !== 'java') {
              return { content: [{ type: 'text', text: JSON.stringify({
                success: false,
                error: `Session ${sessionId} is not a Java session (language: ${language})`,
                diagnosis: {
                  isJava: false,
                  language,
                  recommendations: [
                    'This diagnostic is for Java sessions only',
                    'Use debug_diagnoseConnection for general connection issues'
                  ]
                }
              }, null, 2) }] };
            }

            const diagnosis = {
              sessionExists: true,
              sessionId: session.sessionId,
              language: session.language,
              isJava: true,
              debuggerType: debuggerInfo?.type || 'unknown',
              connected: debuggerInfo?.connected || false,
              connectionType: debuggerInfo?.connectionInfo?.type || 'unknown',
              jdwpEnabled: debuggerInfo?.connectionInfo?.type === 'jdwp',
              hybridMode: debuggerInfo?.connectionInfo?.hybridMode || false,
              observerMode: debuggerInfo?.connectionInfo?.observerMode || false,
              capabilities: {
                setBreakpoints: true,
                getThreads: true,
                getStackTrace: true,
                evaluate: true,
                controlFlow: true,
                performanceMetrics: true,
                profiling: true
              },
              recommendations: [] as string[]
            };

            // Add specific recommendations for Java debugging
            if (!diagnosis.connected) {
              diagnosis.recommendations.push('⚠️  Java session not connected');
              diagnosis.recommendations.push('Ensure your Java app is running with JDWP agent');
              diagnosis.recommendations.push('Example: java -agentlib:jdwp=transport=dt_socket,server=y,suspend=n,address=5005 YourMainClass');
              diagnosis.recommendations.push('Or try hybrid debugging for Spring Boot applications');
            } else {
              diagnosis.recommendations.push('✅ Java debugging connection established');

              if (diagnosis.jdwpEnabled) {
                diagnosis.recommendations.push('✅ JDWP connection active - full debugging capabilities available');
                diagnosis.recommendations.push('All Java debugging operations should work correctly');
              } else if (diagnosis.hybridMode) {
                diagnosis.recommendations.push('✅ Hybrid debugging mode active - log watching and API testing available');
                diagnosis.recommendations.push('Breakpoint simulation and performance monitoring enabled');
              }

              if (diagnosis.observerMode) {
                diagnosis.recommendations.push('ℹ️  Observer mode enabled - non-intrusive debugging');
              }
            }

            diagnosis.recommendations.push('Available Java operations: setJavaBreakpoint, getJavaThreads, getJavaStackTrace, evaluateJavaExpression');
            diagnosis.recommendations.push('Performance monitoring: getJavaPerformanceMetrics with memory, GC, and thread metrics');

            return { content: [{ type: 'text', text: JSON.stringify({
              success: true,
              diagnosis
            }, null, 2) }] };
          } catch (error) {
            return { content: [{ type: 'text', text: JSON.stringify({
              success: false,
              error: error instanceof Error ? error.message : String(error),
              sessionId,
              operation: 'diagnoseJava'
            }, null, 2) }] };
          }
        }

        case 'debug_setJavaBreakpoint': {
          const sessionId = String(args?.sessionId);
          const className = String(args?.className);
          const lineNumber = Number(args?.lineNumber);
          const condition = args?.condition ? String(args.condition) : undefined;

          try {
            const result = await languageDispatcher.executeOperation(sessionId, 'setBreakpoint', {
              className,
              lineNumber,
              condition
            });

            return { content: [{ type: 'text', text: JSON.stringify(result, null, 2) }] };
          } catch (error) {
            return { content: [{ type: 'text', text: JSON.stringify({
              success: false,
              error: error instanceof Error ? error.message : String(error),
              sessionId,
              operation: 'setJavaBreakpoint'
            }, null, 2) }] };
          }
        }

        case 'debug_getJavaThreads': {
          const sessionId = String(args?.sessionId);

          try {
            const result = await languageDispatcher.executeOperation(sessionId, 'getThreads', {});
            return { content: [{ type: 'text', text: JSON.stringify(result, null, 2) }] };
          } catch (error) {
            return { content: [{ type: 'text', text: JSON.stringify({
              success: false,
              error: error instanceof Error ? error.message : String(error),
              sessionId,
              operation: 'getJavaThreads'
            }, null, 2) }] };
          }
        }

        case 'debug_getJavaStackTrace': {
          const sessionId = String(args?.sessionId);
          const threadId = args?.threadId ? Number(args.threadId) : 1;

          try {
            const result = await languageDispatcher.executeOperation(sessionId, 'getStackTrace', {
              threadId
            });

            return { content: [{ type: 'text', text: JSON.stringify(result, null, 2) }] };
          } catch (error) {
            return { content: [{ type: 'text', text: JSON.stringify({
              success: false,
              error: error instanceof Error ? error.message : String(error),
              sessionId,
              operation: 'getJavaStackTrace'
            }, null, 2) }] };
          }
        }

        case 'debug_evaluateJavaExpression': {
          const sessionId = String(args?.sessionId);
          const expression = String(args?.expression);
          const frameId = args?.frameId ? Number(args.frameId) : undefined;

          try {
            const result = await languageDispatcher.executeOperation(sessionId, 'evaluate', {
              expression,
              frameId
            });

            return { content: [{ type: 'text', text: JSON.stringify(result, null, 2) }] };
          } catch (error) {
            return { content: [{ type: 'text', text: JSON.stringify({
              success: false,
              error: error instanceof Error ? error.message : String(error),
              sessionId,
              operation: 'evaluateJavaExpression'
            }, null, 2) }] };
          }
        }

        case 'debug_getJavaPerformanceMetrics': {
          const sessionId = String(args?.sessionId);
          const metricsType = args?.metricsType ? String(args.metricsType) : 'general';

          try {
            const result = await languageDispatcher.executeOperation(sessionId, 'getPerformanceMetrics', {
              metricsType
            });

            return { content: [{ type: 'text', text: JSON.stringify(result, null, 2) }] };
          } catch (error) {
            return { content: [{ type: 'text', text: JSON.stringify({
              success: false,
              error: error instanceof Error ? error.message : String(error),
              sessionId,
              operation: 'getJavaPerformanceMetrics'
            }, null, 2) }] };
          }
        }

        case 'debug_getReactComponentDetails': {
          const sessionId = String(args?.sessionId);
          const componentName = String(args?.componentName);
          const detailType = args?.detailType ? String(args.detailType) : 'all';

          try {
            const result = await languageDispatcher.executeOperation(sessionId, 'getComponentDetails', {
              componentName,
              detailType
            });

            return { content: [{ type: 'text', text: JSON.stringify(result, null, 2) }] };
          } catch (error) {
            return { content: [{ type: 'text', text: JSON.stringify({
              success: false,
              error: error instanceof Error ? error.message : String(error),
              sessionId,
              operation: 'getReactComponentDetails'
            }, null, 2) }] };
          }
        }

        case 'debug_setReactComponentBreakpoint': {
          const sessionId = String(args?.sessionId);
          const componentName = String(args?.componentName);
          const breakpointType = args?.breakpointType ? String(args.breakpointType) : 'render';
          const condition = args?.condition ? String(args.condition) : undefined;

          try {
            const result = await languageDispatcher.executeOperation(sessionId, 'setComponentBreakpoint', {
              componentName,
              breakpointType,
              condition
            });

            return { content: [{ type: 'text', text: JSON.stringify(result, null, 2) }] };
          } catch (error) {
            return { content: [{ type: 'text', text: JSON.stringify({
              success: false,
              error: error instanceof Error ? error.message : String(error),
              sessionId,
              operation: 'setReactComponentBreakpoint'
            }, null, 2) }] };
          }
        }

        case 'debug_analyzeNextJsIssues': {
          const sessionId = String(args?.sessionId);
          const analysisType = String(args?.analysisType);

          try {
            const result = await languageDispatcher.executeOperation(sessionId, 'analyzeFrameworkIssues', {
              analysisType
            });

            return { content: [{ type: 'text', text: JSON.stringify(result, null, 2) }] };
          } catch (error) {
            return { content: [{ type: 'text', text: JSON.stringify({
              success: false,
              error: error instanceof Error ? error.message : String(error),
              sessionId,
              operation: 'analyzeNextJsIssues'
            }, null, 2) }] };
          }
        }

        case 'debug_getNextJsHydrationInfo': {
          const sessionId = String(args?.sessionId);

          try {
            const result = await languageDispatcher.executeOperation(sessionId, 'getFrameworkInfo', {
              infoType: 'hydrationInfo'
            });

            return { content: [{ type: 'text', text: JSON.stringify(result, null, 2) }] };
          } catch (error) {
            return { content: [{ type: 'text', text: JSON.stringify({
              success: false,
              error: error instanceof Error ? error.message : String(error),
              sessionId,
              operation: 'getNextJsHydrationInfo'
            }, null, 2) }] };
          }
        }

        case 'debug_setPythonBreakpoint': {
          const sessionId = String(args?.sessionId);
          const file = String(args?.file);
          const line = Number(args?.line);
          const condition = args?.condition ? String(args.condition) : undefined;

          try {
            const result = await languageDispatcher.executeOperation(sessionId, 'setBreakpoint', {
              file,
              line,
              condition
            });

            return { content: [{ type: 'text', text: JSON.stringify(result, null, 2) }] };
          } catch (error) {
            return { content: [{ type: 'text', text: JSON.stringify({
              success: false,
              error: error instanceof Error ? error.message : String(error),
              sessionId,
              operation: 'setPythonBreakpoint'
            }, null, 2) }] };
          }
        }

        case 'debug_getPythonThreads': {
          const sessionId = String(args?.sessionId);

          try {
            const result = await languageDispatcher.executeOperation(sessionId, 'getThreads', {});
            return { content: [{ type: 'text', text: JSON.stringify(result, null, 2) }] };
          } catch (error) {
            return { content: [{ type: 'text', text: JSON.stringify({
              success: false,
              error: error instanceof Error ? error.message : String(error),
              sessionId,
              operation: 'getPythonThreads'
            }, null, 2) }] };
          }
        }

        case 'debug_getPythonStackTrace': {
          const sessionId = String(args?.sessionId);
          const threadId = args?.threadId ? Number(args.threadId) : 1;

          try {
            const result = await languageDispatcher.executeOperation(sessionId, 'getStackTrace', {
              threadId
            });

            return { content: [{ type: 'text', text: JSON.stringify(result, null, 2) }] };
          } catch (error) {
            return { content: [{ type: 'text', text: JSON.stringify({
              success: false,
              error: error instanceof Error ? error.message : String(error),
              sessionId,
              operation: 'getPythonStackTrace'
            }, null, 2) }] };
          }
        }

        case 'debug_evaluatePythonExpression': {
          const sessionId = String(args?.sessionId);
          const expression = String(args?.expression);
          const frameId = args?.frameId ? Number(args.frameId) : undefined;

          try {
            const result = await languageDispatcher.executeOperation(sessionId, 'evaluate', {
              expression,
              frameId
            });

            return { content: [{ type: 'text', text: JSON.stringify(result, null, 2) }] };
          } catch (error) {
            return { content: [{ type: 'text', text: JSON.stringify({
              success: false,
              error: error instanceof Error ? error.message : String(error),
              sessionId,
              operation: 'evaluatePythonExpression'
            }, null, 2) }] };
          }
        }

        case 'debug_getPythonPerformanceMetrics': {
          const sessionId = String(args?.sessionId);
          const metricsType = args?.metricsType ? String(args.metricsType) : 'general';

          try {
            const result = await languageDispatcher.executeOperation(sessionId, 'getPerformanceMetrics', {
              metricsType
            });

            return { content: [{ type: 'text', text: JSON.stringify(result, null, 2) }] };
          } catch (error) {
            return { content: [{ type: 'text', text: JSON.stringify({
              success: false,
              error: error instanceof Error ? error.message : String(error),
              sessionId,
              operation: 'getPythonPerformanceMetrics'
            }, null, 2) }] };
          }
        }

        case 'debug_getDjangoInfo': {
          const sessionId = String(args?.sessionId);

          try {
            const result = await languageDispatcher.executeOperation(sessionId, 'getDjangoInfo', {});
            return { content: [{ type: 'text', text: JSON.stringify(result, null, 2) }] };
          } catch (error) {
            return { content: [{ type: 'text', text: JSON.stringify({
              success: false,
              error: error instanceof Error ? error.message : String(error),
              sessionId,
              operation: 'getDjangoInfo'
            }, null, 2) }] };
          }
        }

        case 'debug_getDjangoModels': {
          const sessionId = String(args?.sessionId);
          const appName = args?.appName ? String(args.appName) : undefined;

          try {
            const result = await languageDispatcher.executeOperation(sessionId, 'getDjangoModels', {
              appName
            });

            return { content: [{ type: 'text', text: JSON.stringify(result, null, 2) }] };
          } catch (error) {
            return { content: [{ type: 'text', text: JSON.stringify({
              success: false,
              error: error instanceof Error ? error.message : String(error),
              sessionId,
              operation: 'getDjangoModels'
            }, null, 2) }] };
          }
        }

        case 'debug_analyzeDjangoQueries': {
          const sessionId = String(args?.sessionId);

          try {
            const result = await languageDispatcher.executeOperation(sessionId, 'analyzeDjangoQueries', {});
            return { content: [{ type: 'text', text: JSON.stringify(result, null, 2) }] };
          } catch (error) {
            return { content: [{ type: 'text', text: JSON.stringify({
              success: false,
              error: error instanceof Error ? error.message : String(error),
              sessionId,
              operation: 'analyzeDjangoQueries'
            }, null, 2) }] };
          }
        }

        case 'debug_startDjangoRequestTracking': {
          const sessionId = String(args?.sessionId);

          try {
            const result = await languageDispatcher.executeOperation(sessionId, 'startDjangoRequestTracking', {});
            return { content: [{ type: 'text', text: JSON.stringify(result, null, 2) }] };
          } catch (error) {
            return { content: [{ type: 'text', text: JSON.stringify({
              success: false,
              error: error instanceof Error ? error.message : String(error),
              sessionId,
              operation: 'startDjangoRequestTracking'
            }, null, 2) }] };
          }
        }

        case 'debug_getDjangoRequests': {
          const sessionId = String(args?.sessionId);
          const limit = args?.limit ? Number(args.limit) : 50;

          try {
            const result = await languageDispatcher.executeOperation(sessionId, 'getDjangoRequests', {
              limit
            });

            return { content: [{ type: 'text', text: JSON.stringify(result, null, 2) }] };
          } catch (error) {
            return { content: [{ type: 'text', text: JSON.stringify({
              success: false,
              error: error instanceof Error ? error.message : String(error),
              sessionId,
              operation: 'getDjangoRequests'
            }, null, 2) }] };
          }
        }

        // PHP-specific handlers
        case 'debug_setPHPBreakpoint': {
          const sessionId = String(args?.sessionId);
          const file = String(args?.file);
          const line = Number(args?.line);
          const condition = args?.condition ? String(args.condition) : undefined;

          try {
            const result = await languageDispatcher.executeOperation(sessionId, 'setBreakpoint', {
              file, line, condition
            });

            return { content: [{ type: 'text', text: JSON.stringify(result, null, 2) }] };
          } catch (error) {
            return { content: [{ type: 'text', text: JSON.stringify({
              success: false,
              error: error instanceof Error ? error.message : String(error),
              sessionId,
              operation: 'setPHPBreakpoint'
            }, null, 2) }] };
          }
        }

        case 'debug_getPHPThreads': {
          const sessionId = String(args?.sessionId);

          try {
            const result = await languageDispatcher.executeOperation(sessionId, 'getThreads', {});
            return { content: [{ type: 'text', text: JSON.stringify(result, null, 2) }] };
          } catch (error) {
            return { content: [{ type: 'text', text: JSON.stringify({
              success: false,
              error: error instanceof Error ? error.message : String(error),
              sessionId,
              operation: 'getPHPThreads'
            }, null, 2) }] };
          }
        }

        case 'debug_getPHPStackTrace': {
          const sessionId = String(args?.sessionId);
          const threadId = Number(args?.threadId);

          try {
            const result = await languageDispatcher.executeOperation(sessionId, 'getStackTrace', {
              threadId
            });

            return { content: [{ type: 'text', text: JSON.stringify(result, null, 2) }] };
          } catch (error) {
            return { content: [{ type: 'text', text: JSON.stringify({
              success: false,
              error: error instanceof Error ? error.message : String(error),
              sessionId,
              operation: 'getPHPStackTrace'
            }, null, 2) }] };
          }
        }

        case 'debug_evaluatePHPExpression': {
          const sessionId = String(args?.sessionId);
          const expression = String(args?.expression);
          const frameId = args?.frameId ? Number(args.frameId) : undefined;

          try {
            const result = await languageDispatcher.executeOperation(sessionId, 'evaluateExpression', {
              expression, frameId
            });

            return { content: [{ type: 'text', text: JSON.stringify(result, null, 2) }] };
          } catch (error) {
            return { content: [{ type: 'text', text: JSON.stringify({
              success: false,
              error: error instanceof Error ? error.message : String(error),
              sessionId,
              operation: 'evaluatePHPExpression'
            }, null, 2) }] };
          }
        }

        case 'debug_getPHPPerformanceMetrics': {
          const sessionId = String(args?.sessionId);

          try {
            const result = await languageDispatcher.executeOperation(sessionId, 'getPerformanceMetrics', {});
            return { content: [{ type: 'text', text: JSON.stringify(result, null, 2) }] };
          } catch (error) {
            return { content: [{ type: 'text', text: JSON.stringify({
              success: false,
              error: error instanceof Error ? error.message : String(error),
              sessionId,
              operation: 'getPHPPerformanceMetrics'
            }, null, 2) }] };
          }
        }

        case 'debug_startPHPHttpRequestTracking': {
          const sessionId = String(args?.sessionId);

          try {
            const result = await languageDispatcher.executeOperation(sessionId, 'startHttpRequestTracking', {});
            return { content: [{ type: 'text', text: JSON.stringify(result, null, 2) }] };
          } catch (error) {
            return { content: [{ type: 'text', text: JSON.stringify({
              success: false,
              error: error instanceof Error ? error.message : String(error),
              sessionId,
              operation: 'startPHPHttpRequestTracking'
            }, null, 2) }] };
          }
        }

        case 'debug_stopPHPHttpRequestTracking': {
          const sessionId = String(args?.sessionId);

          try {
            const result = await languageDispatcher.executeOperation(sessionId, 'stopHttpRequestTracking', {});
            return { content: [{ type: 'text', text: JSON.stringify(result, null, 2) }] };
          } catch (error) {
            return { content: [{ type: 'text', text: JSON.stringify({
              success: false,
              error: error instanceof Error ? error.message : String(error),
              sessionId,
              operation: 'stopPHPHttpRequestTracking'
            }, null, 2) }] };
          }
        }

        case 'debug_getPHPHttpRequests': {
          const sessionId = String(args?.sessionId);
          const limit = args?.limit ? Number(args.limit) : 50;

          try {
            const result = await languageDispatcher.executeOperation(sessionId, 'getHttpRequests', {
              limit
            });

            return { content: [{ type: 'text', text: JSON.stringify(result, null, 2) }] };
          } catch (error) {
            return { content: [{ type: 'text', text: JSON.stringify({
              success: false,
              error: error instanceof Error ? error.message : String(error),
              sessionId,
              operation: 'getPHPHttpRequests'
            }, null, 2) }] };
          }
        }

        case 'debug_getPHPComposerPackages': {
          const sessionId = String(args?.sessionId);

          try {
            const result = await languageDispatcher.executeOperation(sessionId, 'getComposerPackages', {});
            return { content: [{ type: 'text', text: JSON.stringify(result, null, 2) }] };
          } catch (error) {
            return { content: [{ type: 'text', text: JSON.stringify({
              success: false,
              error: error instanceof Error ? error.message : String(error),
              sessionId,
              operation: 'getPHPComposerPackages'
            }, null, 2) }] };
          }
        }

        // Laravel-specific handlers
        case 'debug_getLaravelInfo': {
          const sessionId = String(args?.sessionId);

          try {
            const result = await languageDispatcher.executeOperation(sessionId, 'getLaravelInfo', {});
            return { content: [{ type: 'text', text: JSON.stringify(result, null, 2) }] };
          } catch (error) {
            return { content: [{ type: 'text', text: JSON.stringify({
              success: false,
              error: error instanceof Error ? error.message : String(error),
              sessionId,
              operation: 'getLaravelInfo'
            }, null, 2) }] };
          }
        }

        case 'debug_getLaravelRoutes': {
          const sessionId = String(args?.sessionId);

          try {
            const result = await languageDispatcher.executeOperation(sessionId, 'getLaravelRoutes', {});
            return { content: [{ type: 'text', text: JSON.stringify(result, null, 2) }] };
          } catch (error) {
            return { content: [{ type: 'text', text: JSON.stringify({
              success: false,
              error: error instanceof Error ? error.message : String(error),
              sessionId,
              operation: 'getLaravelRoutes'
            }, null, 2) }] };
          }
        }

        case 'debug_getLaravelMiddleware': {
          const sessionId = String(args?.sessionId);

          try {
            const result = await languageDispatcher.executeOperation(sessionId, 'getLaravelMiddleware', {});
            return { content: [{ type: 'text', text: JSON.stringify(result, null, 2) }] };
          } catch (error) {
            return { content: [{ type: 'text', text: JSON.stringify({
              success: false,
              error: error instanceof Error ? error.message : String(error),
              sessionId,
              operation: 'getLaravelMiddleware'
            }, null, 2) }] };
          }
        }

        case 'debug_getEloquentQueries': {
          const sessionId = String(args?.sessionId);
          const limit = args?.limit ? Number(args.limit) : 100;

          try {
            const result = await languageDispatcher.executeOperation(sessionId, 'getEloquentQueries', {
              limit
            });

            return { content: [{ type: 'text', text: JSON.stringify(result, null, 2) }] };
          } catch (error) {
            return { content: [{ type: 'text', text: JSON.stringify({
              success: false,
              error: error instanceof Error ? error.message : String(error),
              sessionId,
              operation: 'getEloquentQueries'
            }, null, 2) }] };
          }
        }

        case 'debug_analyzeEloquentQueries': {
          const sessionId = String(args?.sessionId);

          try {
            const result = await languageDispatcher.executeOperation(sessionId, 'analyzeEloquentQueries', {});
            return { content: [{ type: 'text', text: JSON.stringify(result, null, 2) }] };
          } catch (error) {
            return { content: [{ type: 'text', text: JSON.stringify({
              success: false,
              error: error instanceof Error ? error.message : String(error),
              sessionId,
              operation: 'analyzeEloquentQueries'
            }, null, 2) }] };
          }
        }

        case 'debug_getLaravelJobs': {
          const sessionId = String(args?.sessionId);

          try {
            const result = await languageDispatcher.executeOperation(sessionId, 'getLaravelJobs', {});
            return { content: [{ type: 'text', text: JSON.stringify(result, null, 2) }] };
          } catch (error) {
            return { content: [{ type: 'text', text: JSON.stringify({
              success: false,
              error: error instanceof Error ? error.message : String(error),
              sessionId,
              operation: 'getLaravelJobs'
            }, null, 2) }] };
          }
        }

        case 'debug_getLaravelFailedJobs': {
          const sessionId = String(args?.sessionId);

          try {
            const result = await languageDispatcher.executeOperation(sessionId, 'getLaravelFailedJobs', {});
            return { content: [{ type: 'text', text: JSON.stringify(result, null, 2) }] };
          } catch (error) {
            return { content: [{ type: 'text', text: JSON.stringify({
              success: false,
              error: error instanceof Error ? error.message : String(error),
              sessionId,
              operation: 'getLaravelFailedJobs'
            }, null, 2) }] };
          }
        }

        case 'debug_getLaravelEvents': {
          const sessionId = String(args?.sessionId);
          const limit = args?.limit ? Number(args.limit) : 100;

          try {
            const result = await languageDispatcher.executeOperation(sessionId, 'getLaravelEvents', {
              limit
            });

            return { content: [{ type: 'text', text: JSON.stringify(result, null, 2) }] };
          } catch (error) {
            return { content: [{ type: 'text', text: JSON.stringify({
              success: false,
              error: error instanceof Error ? error.message : String(error),
              sessionId,
              operation: 'getLaravelEvents'
            }, null, 2) }] };
          }
        }

        case 'debug_setGoBreakpoint': {
          const sessionId = String(args?.sessionId);
          const file = String(args?.file);
          const line = Number(args?.line);
          const condition = args?.condition ? String(args.condition) : undefined;

          try {
            const result = await languageDispatcher.executeOperation(sessionId, 'setBreakpoint', {
              file,
              line,
              condition
            });

            return { content: [{ type: 'text', text: JSON.stringify(result, null, 2) }] };
          } catch (error) {
            return { content: [{ type: 'text', text: JSON.stringify({
              success: false,
              error: error instanceof Error ? error.message : String(error),
              sessionId,
              operation: 'setGoBreakpoint'
            }, null, 2) }] };
          }
        }

        case 'debug_setGoFunctionBreakpoint': {
          const sessionId = String(args?.sessionId);
          const functionName = String(args?.functionName);
          const condition = args?.condition ? String(args.condition) : undefined;

          try {
            const result = await languageDispatcher.executeOperation(sessionId, 'setFunctionBreakpoint', {
              functionName,
              condition
            });

            return { content: [{ type: 'text', text: JSON.stringify(result, null, 2) }] };
          } catch (error) {
            return { content: [{ type: 'text', text: JSON.stringify({
              success: false,
              error: error instanceof Error ? error.message : String(error),
              sessionId,
              operation: 'setGoFunctionBreakpoint'
            }, null, 2) }] };
          }
        }

        case 'debug_getGoThreads': {
          const sessionId = String(args?.sessionId);

          try {
            const result = await languageDispatcher.executeOperation(sessionId, 'getThreads', {});
            return { content: [{ type: 'text', text: JSON.stringify(result, null, 2) }] };
          } catch (error) {
            return { content: [{ type: 'text', text: JSON.stringify({
              success: false,
              error: error instanceof Error ? error.message : String(error),
              sessionId,
              operation: 'getGoThreads'
            }, null, 2) }] };
          }
        }

        case 'debug_getGoGoroutines': {
          const sessionId = String(args?.sessionId);

          try {
            const result = await languageDispatcher.executeOperation(sessionId, 'getGoroutines', {});
            return { content: [{ type: 'text', text: JSON.stringify(result, null, 2) }] };
          } catch (error) {
            return { content: [{ type: 'text', text: JSON.stringify({
              success: false,
              error: error instanceof Error ? error.message : String(error),
              sessionId,
              operation: 'getGoGoroutines'
            }, null, 2) }] };
          }
        }

        case 'debug_getGoStackTrace': {
          const sessionId = String(args?.sessionId);
          const threadId = args?.threadId ? Number(args.threadId) : 1;

          try {
            const result = await languageDispatcher.executeOperation(sessionId, 'getStackTrace', {
              threadId
            });

            return { content: [{ type: 'text', text: JSON.stringify(result, null, 2) }] };
          } catch (error) {
            return { content: [{ type: 'text', text: JSON.stringify({
              success: false,
              error: error instanceof Error ? error.message : String(error),
              sessionId,
              operation: 'getGoStackTrace'
            }, null, 2) }] };
          }
        }

        case 'debug_evaluateGoExpression': {
          const sessionId = String(args?.sessionId);
          const expression = String(args?.expression);
          const frameId = args?.frameId ? Number(args.frameId) : undefined;

          try {
            const result = await languageDispatcher.executeOperation(sessionId, 'evaluate', {
              expression,
              frameId
            });

            return { content: [{ type: 'text', text: JSON.stringify(result, null, 2) }] };
          } catch (error) {
            return { content: [{ type: 'text', text: JSON.stringify({
              success: false,
              error: error instanceof Error ? error.message : String(error),
              sessionId,
              operation: 'evaluateGoExpression'
            }, null, 2) }] };
          }
        }

        case 'debug_getGoPackages': {
          const sessionId = String(args?.sessionId);

          try {
            const result = await languageDispatcher.executeOperation(sessionId, 'getPackages', {});
            return { content: [{ type: 'text', text: JSON.stringify(result, null, 2) }] };
          } catch (error) {
            return { content: [{ type: 'text', text: JSON.stringify({
              success: false,
              error: error instanceof Error ? error.message : String(error),
              sessionId,
              operation: 'getGoPackages'
            }, null, 2) }] };
          }
        }

        case 'debug_getGoPerformanceMetrics': {
          const sessionId = String(args?.sessionId);
          const metricsType = args?.metricsType ? String(args.metricsType) : 'general';

          try {
            const result = await languageDispatcher.executeOperation(sessionId, 'getPerformanceMetrics', {
              metricsType
            });

            return { content: [{ type: 'text', text: JSON.stringify(result, null, 2) }] };
          } catch (error) {
            return { content: [{ type: 'text', text: JSON.stringify({
              success: false,
              error: error instanceof Error ? error.message : String(error),
              sessionId,
              operation: 'getGoPerformanceMetrics'
            }, null, 2) }] };
          }
        }

        case 'debug_getGinRoutes': {
          const sessionId = String(args?.sessionId);

          try {
            const result = await languageDispatcher.executeOperation(sessionId, 'getGinRoutes', {});
            return { content: [{ type: 'text', text: JSON.stringify(result, null, 2) }] };
          } catch (error) {
            return { content: [{ type: 'text', text: JSON.stringify({
              success: false,
              error: error instanceof Error ? error.message : String(error),
              sessionId,
              operation: 'getGinRoutes'
            }, null, 2) }] };
          }
        }

        case 'debug_getGinMiddleware': {
          const sessionId = String(args?.sessionId);

          try {
            const result = await languageDispatcher.executeOperation(sessionId, 'getGinMiddleware', {});
            return { content: [{ type: 'text', text: JSON.stringify(result, null, 2) }] };
          } catch (error) {
            return { content: [{ type: 'text', text: JSON.stringify({
              success: false,
              error: error instanceof Error ? error.message : String(error),
              sessionId,
              operation: 'getGinMiddleware'
            }, null, 2) }] };
          }
        }

        case 'debug_analyzeGinPerformance': {
          const sessionId = String(args?.sessionId);

          try {
            const result = await languageDispatcher.executeOperation(sessionId, 'analyzeGinPerformance', {});
            return { content: [{ type: 'text', text: JSON.stringify(result, null, 2) }] };
          } catch (error) {
            return { content: [{ type: 'text', text: JSON.stringify({
              success: false,
              error: error instanceof Error ? error.message : String(error),
              sessionId,
              operation: 'analyzeGinPerformance'
            }, null, 2) }] };
          }
        }

        case 'debug_startGinRequestTracking': {
          const sessionId = String(args?.sessionId);

          try {
            const result = await languageDispatcher.executeOperation(sessionId, 'startGinRequestTracking', {});
            return { content: [{ type: 'text', text: JSON.stringify(result, null, 2) }] };
          } catch (error) {
            return { content: [{ type: 'text', text: JSON.stringify({
              success: false,
              error: error instanceof Error ? error.message : String(error),
              sessionId,
              operation: 'startGinRequestTracking'
            }, null, 2) }] };
          }
        }

        case 'debug_getGinRequests': {
          const sessionId = String(args?.sessionId);
          const limit = args?.limit ? Number(args.limit) : 50;

          try {
            const result = await languageDispatcher.executeOperation(sessionId, 'getGinRequests', {
              limit
            });

            return { content: [{ type: 'text', text: JSON.stringify(result, null, 2) }] };
          } catch (error) {
            return { content: [{ type: 'text', text: JSON.stringify({
              success: false,
              error: error instanceof Error ? error.message : String(error),
              sessionId,
              operation: 'getGinRequests'
            }, null, 2) }] };
          }
        }

        case 'debug_setRustBreakpoint': {
          const sessionId = String(args?.sessionId);
          const file = String(args?.file);
          const line = Number(args?.line);
          const condition = args?.condition ? String(args.condition) : undefined;

          try {
            const result = await languageDispatcher.executeOperation(sessionId, 'setBreakpoint', {
              file,
              line,
              condition
            });

            return { content: [{ type: 'text', text: JSON.stringify(result, null, 2) }] };
          } catch (error) {
            return { content: [{ type: 'text', text: JSON.stringify({
              success: false,
              error: error instanceof Error ? error.message : String(error),
              sessionId,
              operation: 'setRustBreakpoint'
            }, null, 2) }] };
          }
        }

        case 'debug_setRustFunctionBreakpoint': {
          const sessionId = String(args?.sessionId);
          const functionName = String(args?.functionName);
          const condition = args?.condition ? String(args.condition) : undefined;

          try {
            const result = await languageDispatcher.executeOperation(sessionId, 'setFunctionBreakpoint', {
              functionName,
              condition
            });

            return { content: [{ type: 'text', text: JSON.stringify(result, null, 2) }] };
          } catch (error) {
            return { content: [{ type: 'text', text: JSON.stringify({
              success: false,
              error: error instanceof Error ? error.message : String(error),
              sessionId,
              operation: 'setRustFunctionBreakpoint'
            }, null, 2) }] };
          }
        }

        case 'debug_getRustThreads': {
          const sessionId = String(args?.sessionId);

          try {
            const result = await languageDispatcher.executeOperation(sessionId, 'getThreads', {});
            return { content: [{ type: 'text', text: JSON.stringify(result, null, 2) }] };
          } catch (error) {
            return { content: [{ type: 'text', text: JSON.stringify({
              success: false,
              error: error instanceof Error ? error.message : String(error),
              sessionId,
              operation: 'getRustThreads'
            }, null, 2) }] };
          }
        }

        case 'debug_getRustStackTrace': {
          const sessionId = String(args?.sessionId);
          const threadId = args?.threadId ? Number(args.threadId) : 1;

          try {
            const result = await languageDispatcher.executeOperation(sessionId, 'getStackTrace', {
              threadId
            });

            return { content: [{ type: 'text', text: JSON.stringify(result, null, 2) }] };
          } catch (error) {
            return { content: [{ type: 'text', text: JSON.stringify({
              success: false,
              error: error instanceof Error ? error.message : String(error),
              sessionId,
              operation: 'getRustStackTrace'
            }, null, 2) }] };
          }
        }

        case 'debug_evaluateRustExpression': {
          const sessionId = String(args?.sessionId);
          const expression = String(args?.expression);
          const frameId = args?.frameId ? Number(args.frameId) : undefined;

          try {
            const result = await languageDispatcher.executeOperation(sessionId, 'evaluate', {
              expression,
              frameId
            });

            return { content: [{ type: 'text', text: JSON.stringify(result, null, 2) }] };
          } catch (error) {
            return { content: [{ type: 'text', text: JSON.stringify({
              success: false,
              error: error instanceof Error ? error.message : String(error),
              sessionId,
              operation: 'evaluateRustExpression'
            }, null, 2) }] };
          }
        }

        case 'debug_getRustCrates': {
          const sessionId = String(args?.sessionId);

          try {
            const result = await languageDispatcher.executeOperation(sessionId, 'getCrates', {});
            return { content: [{ type: 'text', text: JSON.stringify(result, null, 2) }] };
          } catch (error) {
            return { content: [{ type: 'text', text: JSON.stringify({
              success: false,
              error: error instanceof Error ? error.message : String(error),
              sessionId,
              operation: 'getRustCrates'
            }, null, 2) }] };
          }
        }

        case 'debug_getRustPerformanceMetrics': {
          const sessionId = String(args?.sessionId);
          const metricsType = args?.metricsType ? String(args.metricsType) : 'general';

          try {
            const result = await languageDispatcher.executeOperation(sessionId, 'getPerformanceMetrics', {
              metricsType
            });

            return { content: [{ type: 'text', text: JSON.stringify(result, null, 2) }] };
          } catch (error) {
            return { content: [{ type: 'text', text: JSON.stringify({
              success: false,
              error: error instanceof Error ? error.message : String(error),
              sessionId,
              operation: 'getRustPerformanceMetrics'
            }, null, 2) }] };
          }
        }

        case 'debug_getActixRoutes': {
          const sessionId = String(args?.sessionId);

          try {
            const result = await languageDispatcher.executeOperation(sessionId, 'getActixRoutes', {});
            return { content: [{ type: 'text', text: JSON.stringify(result, null, 2) }] };
          } catch (error) {
            return { content: [{ type: 'text', text: JSON.stringify({
              success: false,
              error: error instanceof Error ? error.message : String(error),
              sessionId,
              operation: 'getActixRoutes'
            }, null, 2) }] };
          }
        }

        case 'debug_getActixMiddleware': {
          const sessionId = String(args?.sessionId);

          try {
            const result = await languageDispatcher.executeOperation(sessionId, 'getActixMiddleware', {});
            return { content: [{ type: 'text', text: JSON.stringify(result, null, 2) }] };
          } catch (error) {
            return { content: [{ type: 'text', text: JSON.stringify({
              success: false,
              error: error instanceof Error ? error.message : String(error),
              sessionId,
              operation: 'getActixMiddleware'
            }, null, 2) }] };
          }
        }

        case 'debug_getActixHandlers': {
          const sessionId = String(args?.sessionId);

          try {
            const result = await languageDispatcher.executeOperation(sessionId, 'getActixHandlers', {});
            return { content: [{ type: 'text', text: JSON.stringify(result, null, 2) }] };
          } catch (error) {
            return { content: [{ type: 'text', text: JSON.stringify({
              success: false,
              error: error instanceof Error ? error.message : String(error),
              sessionId,
              operation: 'getActixHandlers'
            }, null, 2) }] };
          }
        }

        case 'debug_analyzeActixPerformance': {
          const sessionId = String(args?.sessionId);

          try {
            const result = await languageDispatcher.executeOperation(sessionId, 'analyzeActixPerformance', {});
            return { content: [{ type: 'text', text: JSON.stringify(result, null, 2) }] };
          } catch (error) {
            return { content: [{ type: 'text', text: JSON.stringify({
              success: false,
              error: error instanceof Error ? error.message : String(error),
              sessionId,
              operation: 'analyzeActixPerformance'
            }, null, 2) }] };
          }
        }

        case 'debug_startActixRequestTracking': {
          const sessionId = String(args?.sessionId);

          try {
            const result = await languageDispatcher.executeOperation(sessionId, 'startActixRequestTracking', {});
            return { content: [{ type: 'text', text: JSON.stringify(result, null, 2) }] };
          } catch (error) {
            return { content: [{ type: 'text', text: JSON.stringify({
              success: false,
              error: error instanceof Error ? error.message : String(error),
              sessionId,
              operation: 'startActixRequestTracking'
            }, null, 2) }] };
          }
        }

        case 'debug_getActixRequests': {
          const sessionId = String(args?.sessionId);
          const limit = args?.limit ? Number(args.limit) : 50;

          try {
            const result = await languageDispatcher.executeOperation(sessionId, 'getActixRequests', {
              limit
            });

            return { content: [{ type: 'text', text: JSON.stringify(result, null, 2) }] };
          } catch (error) {
            return { content: [{ type: 'text', text: JSON.stringify({
              success: false,
              error: error instanceof Error ? error.message : String(error),
              sessionId,
              operation: 'getActixRequests'
            }, null, 2) }] };
          }
        }

        case 'debug_quickStart': {
          const projectPath = String(args?.projectPath || '.');
          const language = String(args?.language || 'auto');
          const autoBreakpoints = args?.autoBreakpoints ? (Array.isArray(args.autoBreakpoints) ? args.autoBreakpoints.map(String) : [String(args.autoBreakpoints)]) : [];

          try {
            // Auto-detect language if needed
            let detectedLanguage = language;
            if (language === 'auto') {
              const { existsSync } = await import('fs');
              const { join } = await import('path');

              if (existsSync(join(projectPath, 'package.json'))) {
                const packageJson = JSON.parse(await import('fs').then(fs => fs.readFileSync(join(projectPath, 'package.json'), 'utf8')));

                if (packageJson.dependencies?.['next'] || packageJson.devDependencies?.['next']) {
                  detectedLanguage = 'nextjs';
                } else if (packageJson.dependencies?.['react'] || packageJson.devDependencies?.['react']) {
                  detectedLanguage = 'react';
                } else if (packageJson.dependencies?.['typescript'] || packageJson.devDependencies?.['typescript']) {
                  detectedLanguage = 'typescript';
                } else {
                  detectedLanguage = 'javascript';
                }
              } else {
                detectedLanguage = 'javascript';
              }
            }

            // Connect with detected language
            const connectResult = await languageDispatcher.connect({
              language: detectedLanguage as any,
              enableFrameworkTools: true
            });

            if (!connectResult.success) {
              return { content: [{ type: 'text', text: JSON.stringify({
                success: false,
                error: 'Failed to connect',
                details: connectResult.error,
                detectedLanguage,
                projectPath
              }, null, 2) }] };
            }

            const sessionId = connectResult.sessionId!;
            const breakpointsSet = [];

            // Set auto breakpoints if provided
            for (const breakpoint of autoBreakpoints) {
              try {
                const [file, line] = breakpoint.split(':');
                const result = await languageDispatcher.executeOperation(sessionId, 'setBreakpoint', {
                  url: file,
                  lineNumber: parseInt(line) || 1
                });
                breakpointsSet.push({ file, line, result });
              } catch (error) {
                breakpointsSet.push({
                  file: breakpoint,
                  error: error instanceof Error ? error.message : String(error)
                });
              }
            }

            return { content: [{ type: 'text', text: JSON.stringify({
              success: true,
              message: 'Quick start completed successfully',
              sessionId,
              detectedLanguage,
              projectPath,
              breakpointsSet,
              nextSteps: [
                `Use debug_setBreakpoint with sessionId: ${sessionId}`,
                `Use debug_evaluate to run expressions`,
                `Use debug_getSessions to see all active sessions`
              ]
            }, null, 2) }] };
          } catch (error) {
            return { content: [{ type: 'text', text: JSON.stringify({
              success: false,
              error: error instanceof Error ? error.message : String(error),
              projectPath,
              language,
              operation: 'quickStart'
            }, null, 2) }] };
          }
        }

        // Electron debugging tools
        case 'debug_connectElectron': {
          try {
            const { electronTools } = await import('./mcp/tools/electron-tools.js');
            const result = await electronTools.debug_connectElectron.handler(args);
            return { content: [{ type: 'text', text: JSON.stringify(result, null, 2) }] };
          } catch (error) {
            return { content: [{ type: 'text', text: JSON.stringify({
              success: false,
              error: error instanceof Error ? error.message : String(error),
              operation: 'connectElectron'
            }, null, 2) }] };
          }
        }

        case 'debug_getElectronProcesses': {
          try {
            const { electronTools } = await import('./mcp/tools/electron-tools.js');
            const result = await electronTools.debug_getElectronProcesses.handler(args);
            return { content: [{ type: 'text', text: JSON.stringify(result, null, 2) }] };
          } catch (error) {
            return { content: [{ type: 'text', text: JSON.stringify({
              success: false,
              error: error instanceof Error ? error.message : String(error),
              operation: 'getElectronProcesses'
            }, null, 2) }] };
          }
        }

        case 'debug_setElectronBreakpoint': {
          try {
            const { electronTools } = await import('./mcp/tools/electron-tools.js');
            const result = await electronTools.debug_setElectronBreakpoint.handler(args);
            return { content: [{ type: 'text', text: JSON.stringify(result, null, 2) }] };
          } catch (error) {
            return { content: [{ type: 'text', text: JSON.stringify({
              success: false,
              error: error instanceof Error ? error.message : String(error),
              operation: 'setElectronBreakpoint'
            }, null, 2) }] };
          }
        }

        case 'debug_inspectIPC': {
          try {
            const { electronTools } = await import('./mcp/tools/electron-tools.js');
            const result = await electronTools.debug_inspectIPC.handler(args);
            return { content: [{ type: 'text', text: JSON.stringify(result, null, 2) }] };
          } catch (error) {
            return { content: [{ type: 'text', text: JSON.stringify({
              success: false,
              error: error instanceof Error ? error.message : String(error),
              operation: 'inspectIPC'
            }, null, 2) }] };
          }
        }

        case 'debug_getElectronPerformance': {
          try {
            const { electronTools } = await import('./mcp/tools/electron-tools.js');
            const result = await electronTools.debug_getElectronPerformance.handler(args);
            return { content: [{ type: 'text', text: JSON.stringify(result, null, 2) }] };
          } catch (error) {
            return { content: [{ type: 'text', text: JSON.stringify({
              success: false,
              error: error instanceof Error ? error.message : String(error),
              operation: 'getElectronPerformance'
            }, null, 2) }] };
          }
        }

        case 'debug_analyzeElectronMemory': {
          try {
            const { electronTools } = await import('./mcp/tools/electron-tools.js');
            const result = await electronTools.debug_analyzeElectronMemory.handler(args);
            return { content: [{ type: 'text', text: JSON.stringify(result, null, 2) }] };
          } catch (error) {
            return { content: [{ type: 'text', text: JSON.stringify({
              success: false,
              error: error instanceof Error ? error.message : String(error),
              operation: 'analyzeElectronMemory'
            }, null, 2) }] };
          }
        }

        case 'debug_getElectronSecurity': {
          try {
            const { electronTools } = await import('./mcp/tools/electron-tools.js');
            const result = await electronTools.debug_getElectronSecurity.handler(args);
            return { content: [{ type: 'text', text: JSON.stringify(result, null, 2) }] };
          } catch (error) {
            return { content: [{ type: 'text', text: JSON.stringify({
              success: false,
              error: error instanceof Error ? error.message : String(error),
              operation: 'getElectronSecurity'
            }, null, 2) }] };
          }
        }

        case 'debug_debugElectronGUI': {
          try {
            const { electronTools } = await import('./mcp/tools/electron-tools.js');
            const result = await electronTools.debug_debugElectronGUI.handler(args);
            return { content: [{ type: 'text', text: JSON.stringify(result, null, 2) }] };
          } catch (error) {
            return { content: [{ type: 'text', text: JSON.stringify({
              success: false,
              error: error instanceof Error ? error.message : String(error),
              operation: 'debugElectronGUI'
            }, null, 2) }] };
          }
        }

        // Nuevas herramientas Electron agregadas
        case 'debug_getElectronArchitecture': {
          try {
            const { electronTools } = await import('./mcp/tools/electron-tools.js');
            const result = await electronTools.debug_getElectronArchitecture.handler(args);
            return { content: [{ type: 'text', text: JSON.stringify(result, null, 2) }] };
          } catch (error) {
            return { content: [{ type: 'text', text: JSON.stringify({
              success: false,
              error: error instanceof Error ? error.message : String(error),
              operation: 'getElectronArchitecture'
            }, null, 2) }] };
          }
        }

        case 'debug_startIpcMonitoring': {
          try {
            const { electronTools } = await import('./mcp/tools/electron-tools.js');
            const result = await electronTools.debug_startIpcMonitoring.handler(args);
            return { content: [{ type: 'text', text: JSON.stringify(result, null, 2) }] };
          } catch (error) {
            return { content: [{ type: 'text', text: JSON.stringify({
              success: false,
              error: error instanceof Error ? error.message : String(error),
              operation: 'startIpcMonitoring'
            }, null, 2) }] };
          }
        }

        case 'debug_getIpcMessages': {
          try {
            const { electronTools } = await import('./mcp/tools/electron-tools.js');
            const result = await electronTools.debug_getIpcMessages.handler(args);
            return { content: [{ type: 'text', text: JSON.stringify(result, null, 2) }] };
          } catch (error) {
            return { content: [{ type: 'text', text: JSON.stringify({
              success: false,
              error: error instanceof Error ? error.message : String(error),
              operation: 'getIpcMessages'
            }, null, 2) }] };
          }
        }

        case 'debug_analyzeElectronSecurity': {
          try {
            const { electronTools } = await import('./mcp/tools/electron-tools.js');
            const result = await electronTools.debug_analyzeElectronSecurity.handler(args);
            return { content: [{ type: 'text', text: JSON.stringify(result, null, 2) }] };
          } catch (error) {
            return { content: [{ type: 'text', text: JSON.stringify({
              success: false,
              error: error instanceof Error ? error.message : String(error),
              operation: 'analyzeElectronSecurity'
            }, null, 2) }] };
          }
        }

        case 'debug_getElectronAsyncOperations': {
          try {
            const { electronTools } = await import('./mcp/tools/electron-tools.js');
            const result = await electronTools.debug_getElectronAsyncOperations.handler(args);
            return { content: [{ type: 'text', text: JSON.stringify(result, null, 2) }] };
          } catch (error) {
            return { content: [{ type: 'text', text: JSON.stringify({
              success: false,
              error: error instanceof Error ? error.message : String(error),
              operation: 'getElectronAsyncOperations'
            }, null, 2) }] };
          }
        }

        // .NET/C# debugging tools
        case 'debug_connectDotNet': {
          try {
            const { dotnetTools } = await import('./mcp/tools/dotnet-tools.js');
            const result = await dotnetTools.debug_connectDotNet.handler(args);
            return { content: [{ type: 'text', text: JSON.stringify(result, null, 2) }] };
          } catch (error) {
            return { content: [{ type: 'text', text: JSON.stringify({
              success: false,
              error: error instanceof Error ? error.message : String(error),
              operation: 'connectDotNet'
            }, null, 2) }] };
          }
        }

        case 'debug_getDotNetProcesses': {
          try {
            const { dotnetTools } = await import('./mcp/tools/dotnet-tools.js');
            const result = await dotnetTools.debug_getDotNetProcesses.handler(args);
            return { content: [{ type: 'text', text: JSON.stringify(result, null, 2) }] };
          } catch (error) {
            return { content: [{ type: 'text', text: JSON.stringify({
              success: false,
              error: error instanceof Error ? error.message : String(error),
              operation: 'getDotNetProcesses'
            }, null, 2) }] };
          }
        }

        case 'debug_inspectDotNetObject': {
          try {
            const { dotnetTools } = await import('./mcp/tools/dotnet-tools.js');
            const result = await dotnetTools.debug_inspectDotNetObject.handler(args);
            return { content: [{ type: 'text', text: JSON.stringify(result, null, 2) }] };
          } catch (error) {
            return { content: [{ type: 'text', text: JSON.stringify({
              success: false,
              error: error instanceof Error ? error.message : String(error),
              operation: 'inspectDotNetObject'
            }, null, 2) }] };
          }
        }

        case 'debug_evaluateCSharpExpression': {
          try {
            const { dotnetTools } = await import('./mcp/tools/dotnet-tools.js');
            const result = await dotnetTools.debug_evaluateCSharpExpression.handler(args);
            return { content: [{ type: 'text', text: JSON.stringify(result, null, 2) }] };
          } catch (error) {
            return { content: [{ type: 'text', text: JSON.stringify({
              success: false,
              error: error instanceof Error ? error.message : String(error),
              operation: 'evaluateCSharpExpression'
            }, null, 2) }] };
          }
        }

        case 'debug_getDotNetAssemblies': {
          try {
            const { dotnetTools } = await import('./mcp/tools/dotnet-tools.js');
            const result = await dotnetTools.debug_getDotNetAssemblies.handler(args);
            return { content: [{ type: 'text', text: JSON.stringify(result, null, 2) }] };
          } catch (error) {
            return { content: [{ type: 'text', text: JSON.stringify({
              success: false,
              error: error instanceof Error ? error.message : String(error),
              operation: 'getDotNetAssemblies'
            }, null, 2) }] };
          }
        }

        case 'debug_setDotNetBreakpoint': {
          try {
            const { dotnetTools } = await import('./mcp/tools/dotnet-tools.js');
            const result = await dotnetTools.debug_setDotNetBreakpoint.handler(args);
            return { content: [{ type: 'text', text: JSON.stringify(result, null, 2) }] };
          } catch (error) {
            return { content: [{ type: 'text', text: JSON.stringify({
              success: false,
              error: error instanceof Error ? error.message : String(error),
              operation: 'setDotNetBreakpoint'
            }, null, 2) }] };
          }
        }

        case 'debug_enableDotNetHotReload': {
          try {
            const { dotnetTools } = await import('./mcp/tools/dotnet-tools.js');
            const result = await dotnetTools.debug_enableDotNetHotReload.handler(args);
            return { content: [{ type: 'text', text: JSON.stringify(result, null, 2) }] };
          } catch (error) {
            return { content: [{ type: 'text', text: JSON.stringify({
              success: false,
              error: error instanceof Error ? error.message : String(error),
              operation: 'enableDotNetHotReload'
            }, null, 2) }] };
          }
        }

        default:
          return { content: [{ type: 'text', text: `Unknown tool: ${name}` }] };
      }
    } catch (error) {
      errorStats.totalErrors++;
      return { content: [{ type: 'text', text: `Error: ${error instanceof Error ? error.message : String(error)}` }] };
    }
  });

  const transport = new StdioServerTransport();
  await server.connect(transport);
}

main().catch(() => process.exit(1));
