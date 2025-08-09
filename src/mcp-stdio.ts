#!/usr/bin/env node

import { Server } from '@modelcontextprotocol/sdk/server/index.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import {
  CallToolRequestSchema,
  ListToolsRequestSchema
} from '@modelcontextprotocol/sdk/types.js';

import { SessionManager } from './core/session.js';
import { EnhancedDebugTools } from './core/enhanced-tools.js';

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

  // Tool catalog (17 tools)
  const tools = [
    { name: 'debug/ping', description: 'Ping the RIXA MCP server', inputSchema: { type: 'object', properties: { message: { type: 'string' } } } },
    { name: 'debug/version', description: 'Return RIXA version info', inputSchema: { type: 'object', properties: {} } },
    { name: 'debug/createSession', description: 'Create and launch a new debug session', inputSchema: { type: 'object', properties: { adapter: { type: 'string' }, program: { type: 'string' }, args: { type: 'array', items: { type: 'string' } }, cwd: { type: 'string' }, env: { type: 'object' } }, required: ['adapter', 'program'] } },
    { name: 'debug/continue', description: 'Continue execution', inputSchema: { type: 'object', properties: { sessionId: { type: 'string' }, threadId: { type: 'number' }, singleThread: { type: 'boolean' } }, required: ['sessionId', 'threadId'] } },
    { name: 'debug/pause', description: 'Pause execution', inputSchema: { type: 'object', properties: { sessionId: { type: 'string' }, threadId: { type: 'number' } }, required: ['sessionId', 'threadId'] } },
    { name: 'debug/stepOver', description: 'Step over (next line)', inputSchema: { type: 'object', properties: { sessionId: { type: 'string' }, threadId: { type: 'number' }, granularity: { type: 'string', enum: ['statement','line','instruction'] } }, required: ['sessionId','threadId'] } },
    { name: 'debug/stepIn', description: 'Step into function', inputSchema: { type: 'object', properties: { sessionId: { type: 'string' }, threadId: { type: 'number' }, granularity: { type: 'string', enum: ['statement','line','instruction'] } }, required: ['sessionId','threadId'] } },
    { name: 'debug/stepOut', description: 'Step out of function', inputSchema: { type: 'object', properties: { sessionId: { type: 'string' }, threadId: { type: 'number' }, granularity: { type: 'string', enum: ['statement','line','instruction'] } }, required: ['sessionId','threadId'] } },
    { name: 'debug/setBreakpoints', description: 'Set breakpoints in a file', inputSchema: { type: 'object', properties: { sessionId: { type: 'string' }, source: { type: 'object', properties: { path: { type: 'string' }, name: { type: 'string' } }, required: ['path'] }, breakpoints: { type: 'array', items: { type: 'object', properties: { line: { type: 'number' }, column: { type: 'number' }, condition: { type: 'string' }, hitCondition: { type: 'string' }, logMessage: { type: 'string' } }, required: ['line'] } } }, required: ['sessionId','source','breakpoints'] } },
    { name: 'debug/getThreads', description: 'Get all threads', inputSchema: { type: 'object', properties: { sessionId: { type: 'string' } }, required: ['sessionId'] } },
    { name: 'debug/getStackTrace', description: 'Get stack trace for a thread', inputSchema: { type: 'object', properties: { sessionId: { type: 'string' }, threadId: { type: 'number' }, startFrame: { type: 'number' }, levels: { type: 'number' } }, required: ['sessionId','threadId'] } },
    { name: 'debug/getVariables', description: 'Get variables for a scope', inputSchema: { type: 'object', properties: { sessionId: { type: 'string' }, variablesReference: { type: 'number' }, filter: { type: 'string', enum: ['indexed','named'] }, start: { type: 'number' }, count: { type: 'number' } }, required: ['sessionId','variablesReference'] } },
    { name: 'debug/evaluate', description: 'Evaluate an expression', inputSchema: { type: 'object', properties: { sessionId: { type: 'string' }, expression: { type: 'string' }, frameId: { type: 'number' }, context: { type: 'string', enum: ['watch','repl','hover','clipboard'] } }, required: ['sessionId','expression'] } },
    { name: 'debug/terminate', description: 'Terminate session', inputSchema: { type: 'object', properties: { sessionId: { type: 'string' } }, required: ['sessionId'] } },
    // Enhanced
    { name: 'debug/getEnhancedStackTrace', description: 'Enhanced stack trace with scopes and variables', inputSchema: { type: 'object', properties: { sessionId: { type: 'string' }, threadId: { type: 'number' }, includeScopes: { type: 'boolean' }, includeVariables: { type: 'boolean' } }, required: ['sessionId','threadId'] } },
    { name: 'debug/getEnhancedVariables', description: 'Enhanced variables with hierarchy', inputSchema: { type: 'object', properties: { sessionId: { type: 'string' }, variablesReference: { type: 'number' }, maxDepth: { type: 'number' } }, required: ['sessionId','variablesReference'] } },
    { name: 'debug/evaluateEnhanced', description: 'Enhanced evaluate', inputSchema: { type: 'object', properties: { sessionId: { type: 'string' }, expression: { type: 'string' }, frameId: { type: 'number' }, context: { type: 'string', enum: ['watch','repl','hover','clipboard'] } }, required: ['sessionId','expression'] } },
    // Error stats
    { name: 'debug/getErrorStats', description: 'Get error statistics', inputSchema: { type: 'object', properties: {}, required: [] } },
    { name: 'debug/resetErrorStats', description: 'Reset error statistics', inputSchema: { type: 'object', properties: {}, required: [] } }
  ];

  server.setRequestHandler(ListToolsRequestSchema, async () => ({ tools }));

  server.setRequestHandler(CallToolRequestSchema, async req => {
    const { name, arguments: args } = req.params as any;

    try {
      switch (name) {
        case 'debug/ping':
          return { content: [{ type: 'text', text: String(args?.message ?? 'pong') }] };

        case 'debug/version':
          return { content: [{ type: 'text', text: 'RIXA 0.1.0' }] };

        case 'debug/createSession': {
          const adapter = String(args?.adapter || 'node');
          const program = String(args?.program);
          const programArgs = Array.isArray(args?.args) ? (args.args as string[]) : [];
          const cwd = args?.cwd ? String(args.cwd) : process.cwd();
          const env = (args?.env && typeof args.env === 'object') ? (args.env as Record<string, string>) : undefined;

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
        }

        case 'debug/getThreads': {
          const sessionId = String(args?.sessionId);
          const session = sessionManager.getSession(sessionId);
          if (!session) return { content: [{ type: 'text', text: `Session not found: ${sessionId}` }] };
          const response = await session.sendRequest<any>('threads');
          return { content: [{ type: 'text', text: JSON.stringify(response?.body || {}, null, 2) }] };
        }

        case 'debug/getStackTrace': {
          const sessionId = String(args?.sessionId);
          const threadId = Number(args?.threadId);
          const startFrame = args?.startFrame ? Number(args.startFrame) : undefined;
          const levels = args?.levels ? Number(args.levels) : undefined;
          const session = sessionManager.getSession(sessionId);
          if (!session) return { content: [{ type: 'text', text: `Session not found: ${sessionId}` }] };
          const response = await session.sendRequest<any>('stackTrace', { threadId, startFrame, levels });
          return { content: [{ type: 'text', text: JSON.stringify(response?.body || {}, null, 2) }] };
        }

        case 'debug/continue': {
          const sessionId = String(args?.sessionId);
          const threadId = Number(args?.threadId);
          const session = sessionManager.getSession(sessionId);
          if (!session) return { content: [{ type: 'text', text: `Session not found: ${sessionId}` }] };
          const response = await session.sendRequest<any>('continue', { threadId, singleThread: !!args?.singleThread });
          return { content: [{ type: 'text', text: JSON.stringify(response?.body || {}, null, 2) }] };
        }

        case 'debug/pause': {
          const sessionId = String(args?.sessionId);
          const threadId = Number(args?.threadId);
          const session = sessionManager.getSession(sessionId);
          if (!session) return { content: [{ type: 'text', text: `Session not found: ${sessionId}` }] };
          const response = await session.sendRequest<any>('pause', { threadId });
          return { content: [{ type: 'text', text: JSON.stringify(response?.body || {}, null, 2) }] };
        }

        case 'debug/stepOver': {
          const sessionId = String(args?.sessionId);
          const threadId = Number(args?.threadId);
          const session = sessionManager.getSession(sessionId);
          if (!session) return { content: [{ type: 'text', text: `Session not found: ${sessionId}` }] };
          const response = await session.sendRequest<any>('next', { threadId, granularity: args?.granularity || 'line' });
          return { content: [{ type: 'text', text: JSON.stringify(response?.body || {}, null, 2) }] };
        }

        case 'debug/stepIn': {
          const sessionId = String(args?.sessionId);
          const threadId = Number(args?.threadId);
          const session = sessionManager.getSession(sessionId);
          if (!session) return { content: [{ type: 'text', text: `Session not found: ${sessionId}` }] };
          const response = await session.sendRequest<any>('stepIn', { threadId, granularity: args?.granularity || 'line' });
          return { content: [{ type: 'text', text: JSON.stringify(response?.body || {}, null, 2) }] };
        }

        case 'debug/stepOut': {
          const sessionId = String(args?.sessionId);
          const threadId = Number(args?.threadId);
          const session = sessionManager.getSession(sessionId);
          if (!session) return { content: [{ type: 'text', text: `Session not found: ${sessionId}` }] };
          const response = await session.sendRequest<any>('stepOut', { threadId, granularity: args?.granularity || 'line' });
          return { content: [{ type: 'text', text: JSON.stringify(response?.body || {}, null, 2) }] };
        }

        case 'debug/setBreakpoints': {
          const sessionId = String(args?.sessionId);
          const source = args?.source as { path: string; name?: string };
          const breakpoints = Array.isArray(args?.breakpoints) ? args.breakpoints : [];
          const session = sessionManager.getSession(sessionId);
          if (!session) return { content: [{ type: 'text', text: `Session not found: ${sessionId}` }] };
          const response = await session.sendRequest<any>('setBreakpoints', { source, breakpoints });
          return { content: [{ type: 'text', text: JSON.stringify(response?.body || {}, null, 2) }] };
        }

        case 'debug/getVariables': {
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

        case 'debug/evaluate': {
          const sessionId = String(args?.sessionId);
          const expression = String(args?.expression);
          const frameId = args?.frameId ? Number(args.frameId) : undefined;
          const context = (args?.context as any) || 'repl';
          const session = sessionManager.getSession(sessionId);
          if (!session) return { content: [{ type: 'text', text: `Session not found: ${sessionId}` }] };
          const response = await session.sendRequest<any>('evaluate', { expression, frameId, context });
          return { content: [{ type: 'text', text: JSON.stringify(response?.body || {}, null, 2) }] };
        }

        case 'debug/getEnhancedStackTrace': {
          const sessionId = String(args?.sessionId);
          const threadId = Number(args?.threadId);
          const includeScopes = !!args?.includeScopes;
          const includeVariables = !!args?.includeVariables;
          const session = sessionManager.getSession(sessionId);
          if (!session) return { content: [{ type: 'text', text: `Session not found: ${sessionId}` }] };
          const frames = await enhanced.getEnhancedStackTrace(session, threadId, includeScopes, includeVariables);
          return { content: [{ type: 'text', text: JSON.stringify(frames, null, 2) }] };
        }

        case 'debug/getEnhancedVariables': {
          const sessionId = String(args?.sessionId);
          const variablesReference = Number(args?.variablesReference);
          const maxDepth = args?.maxDepth ? Number(args.maxDepth) : 3;
          const session = sessionManager.getSession(sessionId);
          if (!session) return { content: [{ type: 'text', text: `Session not found: ${sessionId}` }] };
          const vars = await enhanced.getEnhancedVariables(session, variablesReference, maxDepth);
          return { content: [{ type: 'text', text: JSON.stringify(vars, null, 2) }] };
        }

        case 'debug/evaluateEnhanced': {
          const sessionId = String(args?.sessionId);
          const expression = String(args?.expression);
          const frameId = args?.frameId ? Number(args.frameId) : undefined;
          const context = (args?.context as any) || 'repl';
          const session = sessionManager.getSession(sessionId);
          if (!session) return { content: [{ type: 'text', text: `Session not found: ${sessionId}` }] };
          const result = await enhanced.evaluateExpression(session, expression, frameId, context);
          return { content: [{ type: 'text', text: JSON.stringify(result, null, 2) }] };
        }

        case 'debug/getErrorStats': {
          return { content: [{ type: 'text', text: JSON.stringify(errorStats, null, 2) }] };
        }

        case 'debug/resetErrorStats': {
          errorStats.totalErrors = 0;
          return { content: [{ type: 'text', text: 'Error stats reset' }] };
        }

        case 'debug/terminate': {
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
