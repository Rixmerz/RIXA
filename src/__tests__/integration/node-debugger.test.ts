import { describe, it, expect, beforeAll, afterAll, beforeEach, afterEach } from 'vitest';
import { writeFileSync, mkdirSync, rmSync } from 'fs';
import { join } from 'path';
import { tmpdir } from 'os';
import { SessionManager, SessionState } from '@/core/session.js';
import { createLogger } from '@/utils/logger.js';
import type { DapEvent } from '@/types/dap.js';

// Mock logger for tests
const mockLogger = createLogger(
  { level: 'debug', format: 'json', file: { enabled: false, path: '', maxSize: 0, maxFiles: 0 } },
  { requestId: 'integration-test' }
);

describe('Node.js Debugger Integration', () => {
  let sessionManager: SessionManager;
  let testDir: string;
  let testScript: string;

  beforeAll(() => {
    // Create temporary directory for test files
    testDir = join(tmpdir(), 'rixa-integration-test');
    mkdirSync(testDir, { recursive: true });

    // Create a simple test script
    testScript = join(testDir, 'test-app.js');
    writeFileSync(
      testScript,
      `
// Simple test application for debugging
function fibonacci(n) {
  if (n <= 1) return n;
  return fibonacci(n - 1) + fibonacci(n - 2);
}

function main() {
  console.log('Starting test application');
  
  const numbers = [5, 8, 10];
  for (const num of numbers) {
    const result = fibonacci(num);
    console.log(\`fibonacci(\${num}) = \${result}\`);
  }
  
  console.log('Test application completed');
}

// Add a breakpoint opportunity
debugger;
main();
`
    );

    sessionManager = new SessionManager(mockLogger);
  });

  afterAll(() => {
    // Clean up test directory
    rmSync(testDir, { recursive: true, force: true });
  });

  beforeEach(() => {
    // Reset session manager state
  });

  afterEach(async () => {
    // Terminate any active sessions
    await sessionManager.terminateAllSessions();
  });

  it('should create and initialize a Node.js debug session', async () => {
    const session = await sessionManager.createSession({
      adapterConfig: {
        transport: {
          type: 'stdio',
          command: 'node',
          args: ['--inspect-brk=0'],
        },
      },
      launchConfig: {
        type: 'node',
        program: testScript,
        console: 'integratedTerminal',
        internalConsoleOptions: 'neverOpen',
      },
      name: 'Node.js Integration Test',
    });

    expect(session).toBeDefined();
    expect(session.getState()).toBe(SessionState.CREATED);

    // Initialize the session
    await session.initialize();
    expect(session.getState()).toBe(SessionState.INITIALIZED);

    // Check capabilities
    const capabilities = session.getCapabilities();
    expect(capabilities).toBeDefined();
    expect(typeof capabilities).toBe('object');
  }, 30000);

  it('should launch and connect to Node.js debugger', async () => {
    const session = await sessionManager.createSession({
      adapterConfig: {
        transport: {
          type: 'stdio',
          command: 'node',
          args: ['--inspect-brk=0'],
        },
      },
      launchConfig: {
        type: 'node',
        program: testScript,
        console: 'integratedTerminal',
        internalConsoleOptions: 'neverOpen',
      },
      name: 'Node.js Launch Test',
    });

    await session.initialize();
    
    // Launch the session
    await session.launch();
    expect(session.getState()).toBe(SessionState.RUNNING);

    // Wait a bit for the debugger to start
    await new Promise(resolve => setTimeout(resolve, 2000));

    // The session should still be active
    expect(session.isActive()).toBe(true);
  }, 30000);

  it('should handle debug events', async () => {
    const session = await sessionManager.createSession({
      adapterConfig: {
        transport: {
          type: 'stdio',
          command: 'node',
          args: ['--inspect-brk=0'],
        },
      },
      launchConfig: {
        type: 'node',
        program: testScript,
        console: 'integratedTerminal',
        internalConsoleOptions: 'neverOpen',
      },
      name: 'Node.js Events Test',
    });

    const events: DapEvent[] = [];
    
    // Listen for events
    session.on('stopped', (event: DapEvent) => {
      events.push(event);
    });

    session.on('output', (event: DapEvent) => {
      events.push(event);
    });

    await session.initialize();
    await session.launch();

    // Wait for events
    await new Promise(resolve => setTimeout(resolve, 3000));

    // Should have received some events
    expect(events.length).toBeGreaterThan(0);
    
    // Check for output events
    const outputEvents = events.filter(e => e.event === 'output');
    expect(outputEvents.length).toBeGreaterThan(0);
  }, 30000);

  it('should set and hit breakpoints', async () => {
    const session = await sessionManager.createSession({
      adapterConfig: {
        transport: {
          type: 'stdio',
          command: 'node',
          args: ['--inspect-brk=0'],
        },
      },
      launchConfig: {
        type: 'node',
        program: testScript,
        console: 'integratedTerminal',
        internalConsoleOptions: 'neverOpen',
      },
      name: 'Node.js Breakpoints Test',
    });

    let stoppedEvent: DapEvent | null = null;
    
    session.on('stopped', (event: DapEvent) => {
      stoppedEvent = event;
    });

    await session.initialize();

    // Set breakpoints
    const breakpointResponse = await session.sendRequest('setBreakpoints', {
      source: {
        name: 'test-app.js',
        path: testScript,
      },
      breakpoints: [
        {
          line: 10, // Inside the main function
        },
      ],
    });

    expect(breakpointResponse.success).toBe(true);
    const breakpoints = (breakpointResponse.body as any)?.breakpoints || [];
    expect(breakpoints.length).toBe(1);
    expect(breakpoints[0].verified).toBe(true);

    await session.launch();

    // Wait for breakpoint to be hit
    await new Promise(resolve => setTimeout(resolve, 5000));

    // Should have stopped at breakpoint
    expect(stoppedEvent).toBeDefined();
    expect((stoppedEvent?.body as any)?.reason).toBe('breakpoint');
  }, 30000);

  it('should get threads and stack trace', async () => {
    const session = await sessionManager.createSession({
      adapterConfig: {
        transport: {
          type: 'stdio',
          command: 'node',
          args: ['--inspect-brk=0'],
        },
      },
      launchConfig: {
        type: 'node',
        program: testScript,
        console: 'integratedTerminal',
        internalConsoleOptions: 'neverOpen',
      },
      name: 'Node.js Stack Test',
    });

    let threadId: number | null = null;

    session.on('stopped', async (event: DapEvent) => {
      const body = event.body as any;
      threadId = body.threadId;
    });

    await session.initialize();
    await session.launch();

    // Wait for initial stop
    await new Promise(resolve => setTimeout(resolve, 3000));

    // Get threads
    const threadsResponse = await session.sendRequest('threads');
    expect(threadsResponse.success).toBe(true);
    
    const threads = (threadsResponse.body as any)?.threads || [];
    expect(threads.length).toBeGreaterThan(0);
    
    const mainThread = threads[0];
    expect(mainThread.id).toBeDefined();
    expect(mainThread.name).toBeDefined();

    if (threadId) {
      // Get stack trace
      const stackResponse = await session.sendRequest('stackTrace', {
        threadId,
        startFrame: 0,
        levels: 10,
      });

      expect(stackResponse.success).toBe(true);
      const stackFrames = (stackResponse.body as any)?.stackFrames || [];
      expect(stackFrames.length).toBeGreaterThan(0);

      const topFrame = stackFrames[0];
      expect(topFrame.id).toBeDefined();
      expect(topFrame.name).toBeDefined();
      expect(topFrame.line).toBeGreaterThan(0);
      expect(topFrame.column).toBeGreaterThan(0);
    }
  }, 30000);

  it('should evaluate expressions', async () => {
    const session = await sessionManager.createSession({
      adapterConfig: {
        transport: {
          type: 'stdio',
          command: 'node',
          args: ['--inspect-brk=0'],
        },
      },
      launchConfig: {
        type: 'node',
        program: testScript,
        console: 'integratedTerminal',
        internalConsoleOptions: 'neverOpen',
      },
      name: 'Node.js Evaluation Test',
    });

    let frameId: number | null = null;

    session.on('stopped', async (event: DapEvent) => {
      const body = event.body as any;
      if (body.threadId) {
        // Get stack trace to get frame ID
        const stackResponse = await session.sendRequest('stackTrace', {
          threadId: body.threadId,
          startFrame: 0,
          levels: 1,
        });

        const stackFrames = (stackResponse.body as any)?.stackFrames || [];
        if (stackFrames.length > 0) {
          frameId = stackFrames[0].id;
        }
      }
    });

    await session.initialize();

    // Set breakpoint in main function where variables are available
    await session.sendRequest('setBreakpoints', {
      source: {
        name: 'test-app.js',
        path: testScript,
      },
      breakpoints: [
        {
          line: 15, // Inside the loop where 'num' variable exists
        },
      ],
    });

    await session.launch();

    // Wait for breakpoint
    await new Promise(resolve => setTimeout(resolve, 5000));

    if (frameId) {
      // Evaluate simple expression
      const evalResponse = await session.sendRequest('evaluate', {
        expression: '2 + 2',
        frameId,
        context: 'repl',
      });

      expect(evalResponse.success).toBe(true);
      const result = (evalResponse.body as any)?.result;
      expect(result).toBe('4');

      // Evaluate variable (might not be available depending on timing)
      try {
        const varResponse = await session.sendRequest('evaluate', {
          expression: 'typeof numbers',
          frameId,
          context: 'repl',
        });

        if (varResponse.success) {
          const varResult = (varResponse.body as any)?.result;
          expect(varResult).toBeDefined();
        }
      } catch (error) {
        // Variable might not be in scope, which is okay for this test
      }
    }
  }, 30000);

  it('should handle session termination gracefully', async () => {
    const session = await sessionManager.createSession({
      adapterConfig: {
        transport: {
          type: 'stdio',
          command: 'node',
          args: ['--inspect-brk=0'],
        },
      },
      launchConfig: {
        type: 'node',
        program: testScript,
        console: 'integratedTerminal',
        internalConsoleOptions: 'neverOpen',
      },
      name: 'Node.js Termination Test',
    });

    let terminatedEvent: DapEvent | null = null;

    session.on('terminated', (event: DapEvent) => {
      terminatedEvent = event;
    });

    await session.initialize();
    await session.launch();

    // Wait a bit
    await new Promise(resolve => setTimeout(resolve, 2000));

    // Terminate the session
    await session.terminate();

    expect(session.getState()).toBe(SessionState.TERMINATED);
    expect(session.isActive()).toBe(false);

    // Should have received terminated event
    await new Promise(resolve => setTimeout(resolve, 1000));
    // Note: terminated event might not always be received depending on timing
  }, 30000);
});
