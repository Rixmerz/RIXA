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

  // Tool catalog (19 tools)
  const tools = [
    { name: 'debug_ping', description: 'Ping the RIXA MCP server', inputSchema: { type: 'object', properties: { message: { type: 'string' } } } },
    { name: 'debug_version', description: 'Return RIXA version info', inputSchema: { type: 'object', properties: {} } },
    { name: 'debug_createSession', description: 'Create and launch a new debug session', inputSchema: { type: 'object', properties: { adapter: { type: 'string' }, program: { type: 'string' }, args: { type: 'array', items: { type: 'string' } }, cwd: { type: 'string' }, env: { type: 'object' } }, required: ['adapter', 'program'] } },
    { name: 'debug_attachSession', description: 'Create and attach to an existing debug session', inputSchema: { type: 'object', properties: { adapter: { type: 'string' }, port: { type: 'number' }, host: { type: 'string' }, processId: { type: 'number' }, cwd: { type: 'string' }, env: { type: 'object' } }, required: ['adapter'] } },
    { name: 'debug_continue', description: 'Continue execution', inputSchema: { type: 'object', properties: { sessionId: { type: 'string' }, threadId: { type: 'number' }, singleThread: { type: 'boolean' } }, required: ['sessionId', 'threadId'] } },
    { name: 'debug_pause', description: 'Pause execution', inputSchema: { type: 'object', properties: { sessionId: { type: 'string' }, threadId: { type: 'number' } }, required: ['sessionId', 'threadId'] } },
    { name: 'debug_stepOver', description: 'Step over (next line)', inputSchema: { type: 'object', properties: { sessionId: { type: 'string' }, threadId: { type: 'number' }, granularity: { type: 'string', enum: ['statement','line','instruction'] } }, required: ['sessionId','threadId'] } },
    { name: 'debug_stepIn', description: 'Step into function', inputSchema: { type: 'object', properties: { sessionId: { type: 'string' }, threadId: { type: 'number' }, granularity: { type: 'string', enum: ['statement','line','instruction'] } }, required: ['sessionId','threadId'] } },
    { name: 'debug_stepOut', description: 'Step out of function', inputSchema: { type: 'object', properties: { sessionId: { type: 'string' }, threadId: { type: 'number' }, granularity: { type: 'string', enum: ['statement','line','instruction'] } }, required: ['sessionId','threadId'] } },
    { name: 'debug_setBreakpoints', description: 'Set breakpoints in a file', inputSchema: { type: 'object', properties: { sessionId: { type: 'string' }, source: { type: 'object', properties: { path: { type: 'string' }, name: { type: 'string' } }, required: ['path'] }, breakpoints: { type: 'array', items: { type: 'object', properties: { line: { type: 'number' }, column: { type: 'number' }, condition: { type: 'string' }, hitCondition: { type: 'string' }, logMessage: { type: 'string' } }, required: ['line'] } } }, required: ['sessionId','source','breakpoints'] } },
    { name: 'debug_getThreads', description: 'Get all threads', inputSchema: { type: 'object', properties: { sessionId: { type: 'string' } }, required: ['sessionId'] } },
    { name: 'debug_getStackTrace', description: 'Get stack trace for a thread', inputSchema: { type: 'object', properties: { sessionId: { type: 'string' }, threadId: { type: 'number' }, startFrame: { type: 'number' }, levels: { type: 'number' } }, required: ['sessionId','threadId'] } },
    { name: 'debug_getVariables', description: 'Get variables for a scope', inputSchema: { type: 'object', properties: { sessionId: { type: 'string' }, variablesReference: { type: 'number' }, filter: { type: 'string', enum: ['indexed','named'] }, start: { type: 'number' }, count: { type: 'number' } }, required: ['sessionId','variablesReference'] } },
    { name: 'debug_evaluate', description: 'Evaluate an expression', inputSchema: { type: 'object', properties: { sessionId: { type: 'string' }, expression: { type: 'string' }, frameId: { type: 'number' }, context: { type: 'string', enum: ['watch','repl','hover','clipboard'] } }, required: ['sessionId','expression'] } },
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
    { name: 'debug_diagnoseJava', description: 'Comprehensive Java debugging environment diagnosis', inputSchema: { type: 'object', properties: { workspaceRoot: { type: 'string' } } } }
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

          // Preflight validation
          const checks: string[] = [];
          if (!existsSync(program)) checks.push(`Program not found: ${program}`);
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
                mainClass: program.replace(/\.java$/, '').replace(/.*\//, ''),
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
                program,
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

          // Preflight validation for attach mode
          const checks: string[] = [];
          if (!(await checkPathReadable(cwd))) checks.push(`CWD not accessible: ${cwd}`);
          const adapterCheck = adapters[adapter as keyof typeof adapters];
          if (!adapterCheck) checks.push(`Unsupported adapter: ${adapter}`);
          else {
            const probe = checkCmd(adapterCheck.cmd, adapterCheck.args);
            if (!probe.ok) checks.push(`Adapter unavailable: ${adapter} (${adapterCheck.prerequisite}). Install: ${adapterCheck.install}. Details: ${probe.stderr || probe.stdout || 'n/a'}`);
          }

          // Check if port is accessible (for attach mode, port should be in use)
          const portFree = await isPortFree(port);
          if (portFree) {
            checks.push(`Port ${port} is not in use. Make sure your application is running with debug agent on port ${port}`);
            checks.push(`For Java: java -agentlib:jdwp=transport=dt_socket,server=y,suspend=n,address=${port} YourMainClass`);
          }

          if (checks.length) {
            return { content: [{ type: 'text', text: JSON.stringify({ error: 'Attach preflight failed', issues: checks, recommendation: `Ensure your ${adapter} application is running with debug agent on port ${port}` }, null, 2) }] };
          }

          try {
            // Create attach configuration based on adapter
            let attachConfig: Record<string, unknown>;

            if (adapter === 'java') {
              attachConfig = {
                type: 'java',
                request: 'attach',
                hostName: host,
                port: port,
                timeout: 30000,
                projectName: '',
                vmArgs: '',
                // Advanced Java debugging configuration
                stepFilters: {
                  classNameFilters: ['java.*', 'javax.*', 'com.sun.*', 'sun.*', 'sunw.*', 'org.omg.*'],
                  skipSynthetics: true,
                  skipStaticInitializers: true,
                  skipConstructors: false
                },
                // Source path configuration
                sourcePaths: [cwd],
                classPaths: detectJavaClasspath(cwd),
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
                timeout: 30000
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

            const session = await sessionManager.createSession({
              adapterConfig: {
                transport: {
                  type: 'stdio',
                  command: getAdapterCommand(adapter),
                  args: getAdapterArgs(adapter),
                },
              },
              attachConfig,
              name: `Debug Attach Session (${adapter}:${port})`,
              workspaceRoot: cwd,
            });

            await session.initialize();
            await session.attach();

            return {
              content: [
                { type: 'text', text: 'Debug session attached successfully' },
                { type: 'text', text: JSON.stringify({ sessionId: session.id, state: session.getState(), adapter, port, host }, null, 2) }
              ]
            };
          } catch (e) {
            const msg = e instanceof Error ? e.message : String(e);
            return { content: [{ type: 'text', text: JSON.stringify({ error: 'Failed to attach debug session', details: msg, hints: [ `Verify ${adapter} application is running with debug agent`, `Check port ${port} is accessible`, `For Java: java -agentlib:jdwp=transport=dt_socket,server=y,suspend=n,address=${port} YourApp` ] }, null, 2) }] };
          }
        }

        case 'debug_getThreads': {
          const sessionId = String(args?.sessionId);
          const session = sessionManager.getSession(sessionId);
          if (!session) return { content: [{ type: 'text', text: `Session not found: ${sessionId}` }] };
          const response = await session.sendRequest<any>('threads');
          return { content: [{ type: 'text', text: JSON.stringify(response?.body || {}, null, 2) }] };
        }

        case 'debug_getStackTrace': {
          const sessionId = String(args?.sessionId);
          const threadId = Number(args?.threadId);
          const startFrame = args?.startFrame ? Number(args.startFrame) : undefined;
          const levels = args?.levels ? Number(args.levels) : undefined;
          const session = sessionManager.getSession(sessionId);
          if (!session) return { content: [{ type: 'text', text: `Session not found: ${sessionId}` }] };
          const response = await session.sendRequest<any>('stackTrace', { threadId, startFrame, levels });
          return { content: [{ type: 'text', text: JSON.stringify(response?.body || {}, null, 2) }] };
        }

        case 'debug_continue': {
          const sessionId = String(args?.sessionId);
          const threadId = Number(args?.threadId);
          const session = sessionManager.getSession(sessionId);
          if (!session) return { content: [{ type: 'text', text: `Session not found: ${sessionId}` }] };
          const response = await session.sendRequest<any>('continue', { threadId, singleThread: !!args?.singleThread });
          return { content: [{ type: 'text', text: JSON.stringify(response?.body || {}, null, 2) }] };
        }

        case 'debug_pause': {
          const sessionId = String(args?.sessionId);
          const threadId = Number(args?.threadId);
          const session = sessionManager.getSession(sessionId);
          if (!session) return { content: [{ type: 'text', text: `Session not found: ${sessionId}` }] };
          const response = await session.sendRequest<any>('pause', { threadId });
          return { content: [{ type: 'text', text: JSON.stringify(response?.body || {}, null, 2) }] };
        }

        case 'debug_stepOver': {
          const sessionId = String(args?.sessionId);
          const threadId = Number(args?.threadId);
          const session = sessionManager.getSession(sessionId);
          if (!session) return { content: [{ type: 'text', text: `Session not found: ${sessionId}` }] };
          const response = await session.sendRequest<any>('next', { threadId, granularity: args?.granularity || 'line' });
          return { content: [{ type: 'text', text: JSON.stringify(response?.body || {}, null, 2) }] };
        }

        case 'debug_stepIn': {
          const sessionId = String(args?.sessionId);
          const threadId = Number(args?.threadId);
          const session = sessionManager.getSession(sessionId);
          if (!session) return { content: [{ type: 'text', text: `Session not found: ${sessionId}` }] };
          const response = await session.sendRequest<any>('stepIn', { threadId, granularity: args?.granularity || 'line' });
          return { content: [{ type: 'text', text: JSON.stringify(response?.body || {}, null, 2) }] };
        }

        case 'debug_stepOut': {
          const sessionId = String(args?.sessionId);
          const threadId = Number(args?.threadId);
          const session = sessionManager.getSession(sessionId);
          if (!session) return { content: [{ type: 'text', text: `Session not found: ${sessionId}` }] };
          const response = await session.sendRequest<any>('stepOut', { threadId, granularity: args?.granularity || 'line' });
          return { content: [{ type: 'text', text: JSON.stringify(response?.body || {}, null, 2) }] };
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
          const session = sessionManager.getSession(sessionId);
          if (!session) return { content: [{ type: 'text', text: `Session not found: ${sessionId}` }] };
          const response = await session.sendRequest<any>('variables', { variablesReference, filter, start, count });
          return { content: [{ type: 'text', text: JSON.stringify(response?.body || {}, null, 2) }] };
        }

        case 'debug_evaluate': {
          const sessionId = String(args?.sessionId);
          const expression = String(args?.expression);
          const frameId = args?.frameId ? Number(args.frameId) : undefined;
          const context = (args?.context as any) || 'repl';
          const session = sessionManager.getSession(sessionId);
          if (!session) return { content: [{ type: 'text', text: `Session not found: ${sessionId}` }] };
          const response = await session.sendRequest<any>('evaluate', { expression, frameId, context });
          return { content: [{ type: 'text', text: JSON.stringify(response?.body || {}, null, 2) }] };
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

        case 'debug_diagnoseJava': {
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
