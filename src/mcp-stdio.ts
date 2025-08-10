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
    java: 'java',
    go: 'dlv',
    rust: 'rust-gdb',
  };
  return commands[adapter] || adapter;
}
function getAdapterArgs(adapter: string): string[] {
  const args: Record<string, string[]> = {
    node: ['--inspect-brk=0'],
    python: ['-m', 'debugpy', '--listen', '0'],
    java: ['-agentlib:jdwp=transport=dt_socket,server=y,suspend=y,address=0'],
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
    go: { cmd: 'dlv', args: ['version'], prerequisite: 'delve (dlv)', install: 'go install github.com/go-delve/delve/cmd/dlv@latest' },
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

  // Tool catalog (17 tools)
  const tools = [
    { name: 'debug_ping', description: 'Ping the RIXA MCP server', inputSchema: { type: 'object', properties: { message: { type: 'string' } } } },
    { name: 'debug_version', description: 'Return RIXA version info', inputSchema: { type: 'object', properties: {} } },
    { name: 'debug_createSession', description: 'Create and launch a new debug session', inputSchema: { type: 'object', properties: { adapter: { type: 'string' }, program: { type: 'string' }, args: { type: 'array', items: { type: 'string' } }, cwd: { type: 'string' }, env: { type: 'object' } }, required: ['adapter', 'program'] } },
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
    { name: 'debug_testAdapter', description: 'Test a specific adapter availability', inputSchema: { type: 'object', properties: { lang: { type: 'string', enum: ['node','python','go'] } }, required: ['lang'] } },
    { name: 'debug_prerequisites', description: 'Show prerequisites and install hints for a language', inputSchema: { type: 'object', properties: { lang: { type: 'string', enum: ['node','python','go'] } }, required: ['lang'] } },
    { name: 'debug_diagnose', description: 'Run a full diagnostic suite', inputSchema: { type: 'object', properties: { program: { type: 'string' }, cwd: { type: 'string' } } } },
    { name: 'debug_health', description: 'Quick health summary', inputSchema: { type: 'object', properties: {} } },
    { name: 'debug_checkPorts', description: 'Check common debugger ports availability', inputSchema: { type: 'object', properties: { lang: { type: 'string', enum: ['node','python','go'] } } } },
    { name: 'debug_setup', description: 'Non-interactive setup wizard (dry run or fixes)', inputSchema: { type: 'object', properties: { installMissing: { type: 'boolean' }, execute: { type: 'boolean' }, lang: { type: 'string', enum: ['node','python','go'] }, confirm: { type: 'string' } } } }
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
          if (!adapterCheck) checks.push(`Unsupported adapter: ${adapter}`);
          else {
            const probe = checkCmd(adapterCheck.cmd, adapterCheck.args);
            if (!probe.ok) checks.push(`Adapter unavailable: ${adapter} (${adapterCheck.prerequisite}). Install: ${adapterCheck.install}. Details: ${probe.stderr || probe.stdout || 'n/a'}`);
          }
          if (checks.length) {
            return { content: [{ type: 'text', text: JSON.stringify({ error: 'Preflight failed', issues: checks, recommendation: `Run debug_validateEnvironment or debug_prerequisites { lang: "${adapter}" }` }, null, 2) }] };
          }

          if (verbose) {
            const ports = adapter === 'node' ? [9229] : adapter === 'python' ? [5678] : adapter === 'go' ? [38697] : [];
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
              launchConfig: {
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

            return {
              content: [
                { type: 'text', text: 'Debug session created successfully' },
                { type: 'text', text: JSON.stringify({ sessionId: session.id, state: session.getState() }, null, 2) }
              ]
            };
          } catch (e) {
            const msg = e instanceof Error ? e.message : String(e);
            return { content: [{ type: 'text', text: JSON.stringify({ error: 'Failed to initialize debug session', details: msg, hints: [ 'Verify adapter availability via debug_testAdapter', 'Check program path and permissions', 'Provide absolute paths for program and cwd' ] }, null, 2) }] };
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
          const lang = args?.lang as 'node'|'python'|'go'|undefined;
          const steps: string[] = [];
          const issues: string[] = [];

          // Check adapters
          const toCheck = lang ? [lang] : (Object.keys(adapters) as Array<'node'|'python'|'go'>);
          for (const l of toCheck) {
            const a = adapters[l];
            const r = checkCmd(a.cmd, a.args);
            if (!r.ok) {
              issues.push(`${l} missing (${a.prerequisite}). Install: ${a.install}`);
              if (installMissing) steps.push(execute ? `RUN: ${a.install}` : `Would run: ${a.install}`);
            }
          }

          // Check ports
          const ports = { node: [9229], python: [5678], go: [38697] } as const;
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
                            : l === 'go' ? { c: 'go', a: ['install', 'github.com/go-delve/delve/cmd/dlv@latest'] }
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
