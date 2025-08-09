# CLAUDE.md

This file is for Claude Desktop/Claude Code. It teaches you how to use RIXA (Runtime Intelligent eXecution Adapter) via MCP stdio to debug programs using the Debug Adapter Protocol (DAP).

If you follow the prompts and examples below, you can create a debug session, set breakpoints, control execution, inspect state, and evaluate expressions.

## How Claude connects to RIXA

Claude Desktop is configured to launch RIXA in MCP stdio mode:
- Command: `node /Users/juanpablodiaz/my_projects/RIXA/dist/index.js --stdio`
- Stdout is strictly JSON‑RPC (no logs). File logging can be enabled separately.

If tools do not appear, fully quit and reopen Claude Desktop (Cmd+Q).

## Available MCP tools (17)
Each tool name and its arguments. Required arguments are marked with (!).

- debug_createSession (!adapter, !program, args[], cwd, env)
  - Starts a debug session. Example adapters: "node", "python".
- debug_terminate (!sessionId)
  - Terminates a session and cleans resources.
- debug_continue (!sessionId, !threadId, singleThread)
  - Continues execution for the given thread.
- debug_pause (!sessionId, !threadId)
  - Pauses execution of a running thread.
- debug_stepOver (!sessionId, !threadId, granularity)
- debug_stepIn (!sessionId, !threadId, granularity)
- debug_stepOut (!sessionId, !threadId, granularity)
  - granularity: "statement" | "line" | "instruction" (default: line)
- debug_setBreakpoints (!sessionId, !source{path,name?}, !breakpoints[])
  - breakpoint item: { line, column?, condition?, hitCondition?, logMessage? }
- debug_getThreads (!sessionId)
- debug_getStackTrace (!sessionId, !threadId, startFrame?, levels?)
- debug_getVariables (!sessionId, !variablesReference, filter?, start?, count?)
- debug_evaluate (!sessionId, !expression, frameId?, context?)
  - context: "watch" | "repl" | "hover" | "clipboard" (default: repl)

Enhanced helpers (rich responses built on top of DAP):
- debug_getEnhancedStackTrace (!sessionId, !threadId, includeScopes?, includeVariables?)
- debug_getEnhancedVariables (!sessionId, !variablesReference, maxDepth?)
- debug_evaluateEnhanced (!sessionId, !expression, frameId?, context?)

Diagnostics (optional):
- debug_getErrorStats, debug_resetErrorStats

## Typical debug workflow (Claude prompts)
Use these prompts in the chat; Claude will call the tools with the right arguments.

1) Create a session (Node)
- Prompt: "Create a debug session for Node. Program: /ABS/PATH/app.js. CWD: /ABS/PATH/project"
- Tool called: debug_createSession
- Save the sessionId returned in the result content JSON.

2) Add breakpoints
- Prompt: "Set a breakpoint in /ABS/PATH/app.js at line 12 for session <sessionId>"
- Tool: debug_setBreakpoints { sessionId, source: { path }, breakpoints: [{ line: 12 }] }

3) Start/Control execution
- Prompt: "Continue execution on thread 1 for session <sessionId>"
- Tool: debug_continue { sessionId, threadId: 1 }
- Prompts for pause/step: "Pause thread 1", "Step over on thread 1", etc.

4) Inspect threads and stack
- Prompt: "List threads for session <sessionId>" → debug_getThreads
- Prompt: "Get stack trace for thread 1" → debug_getStackTrace

5) Inspect variables and evaluate
- Prompt: "Evaluate `a + b` in session <sessionId>" → debug_evaluate
- Prompt: "Get variables for variablesReference 3" → debug_getVariables
- Tip: Get variablesReference from scopes/stack trace responses.

6) Enhanced inspection (optional)
- Prompt: "Give me an enhanced stack trace with scopes and variables for thread 1" → debug_getEnhancedStackTrace
- Prompt: "Get enhanced variables for variablesReference 3, depth 4" → debug_getEnhancedVariables

7) Terminate session
- Prompt: "Terminate session <sessionId>" → debug_terminate

## Quick JSON‑RPC tests (terminal)
These help verify the server is healthy if Claude cannot connect:

- List tools
  echo '{"jsonrpc":"2.0","id":1,"method":"tools/list","params":{}}' | node /Users/juanpablodiaz/my_projects/RIXA/dist/index.js --stdio

- Initialize + List + Ping
  printf '%s\n' '{"jsonrpc":"2.0","id":0,"method":"initialize","params":{"protocolVersion":"2025-06-18","capabilities":{},"clientInfo":{"name":"claude-ai","version":"0.1.0"}}}' '{"jsonrpc":"2.0","id":1,"method":"tools/list","params":{}}' '{"jsonrpc":"2.0","id":2,"method":"tools/call","params":{"name":"debug_ping","arguments":{"message":"hello"}}}' | node /Users/juanpablodiaz/my_projects/RIXA/dist/index.js --stdio

## Tips & requirements
- Use absolute paths in program/source.path.
- Claude should copy the sessionId returned by createSession for subsequent calls.
- threadId is usually 1 after launch, but confirm via getThreads.
- If tools are missing, restart Claude Desktop and re-run npm run build.
- Claude Desktop MCP server log: ~/Library/Logs/Claude/mcp-server-rixa.log
- Optional RIXA file log: /tmp/rixa.log (enable file logging via env if needed).

## Minimal environment variables (Claude Desktop)
When configuring the MCP entry in Claude, these envs are safe defaults:
- RIXA_AUTH_ENABLED=false
- RIXA_FS_ALLOWED_PATHS=/Users/juanpablodiaz/my_projects
- RIXA_LOG_LEVEL=error

## Why MCP stdio
RIXA’s stdio mode ensures pure JSON‑RPC over stdout/stderr (no mixed logs), which Claude requires. The classic HTTP/WebSocket server is not used when `--stdio` is provided.
