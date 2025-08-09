#!/usr/bin/env tsx

/**
 * Basic usage example for RIXA - Runtime Intelligent eXecution Adapter
 * 
 * This example demonstrates how to:
 * 1. Start an MCP server
 * 2. Create a debug session
 * 3. Handle basic debugging operations
 */

import { loadConfig } from '../src/utils/config.js';
import { initializeLogger, getLogger } from '../src/utils/logger.js';
import { McpServer } from '../src/mcp/server.js';
import { SessionManager } from '../src/core/session.js';

async function main(): Promise<void> {
  try {
    // Load configuration
    const config = loadConfig();
    
    // Initialize logging
    initializeLogger(config.logging);
    const logger = getLogger();
    
    logger.info('Starting RIXA basic usage example');
    
    // Create MCP server
    const mcpServer = new McpServer(
      {
        server: config.server,
        auth: config.auth,
      },
      logger
    );
    
    // Create session manager
    const sessionManager = new SessionManager(logger);
    
    // Setup MCP server handlers
    mcpServer.on('connection', (connection) => {
      logger.info('New MCP connection', { connectionId: connection.id });
      
      // Handle initialize request
      connection.on('request', async (request, context) => {
        logger.debug('Received MCP request', { method: request.method, context });
        
        switch (request.method) {
          case 'initialize':
            // Handle MCP initialize
            connection.sendResponse(request.id!, {
              protocolVersion: '2024-11-05',
              capabilities: {
                resources: true,
                tools: true,
              },
              serverInfo: {
                name: 'RIXA Debug Adapter',
                version: '0.1.0',
              },
            });
            
            // Mark connection as authenticated
            const clientInfo = request.params?.clientInfo as { name: string; version: string };
            if (clientInfo) {
              connection.setAuthenticated(clientInfo);
            }
            break;
            
          case 'tools/list':
            // Return available debugging tools
            connection.sendResponse(request.id!, {
              tools: [
                {
                  name: 'debug/createSession',
                  description: 'Create a new debug session',
                  inputSchema: {
                    type: 'object',
                    properties: {
                      adapter: { type: 'string', description: 'Debug adapter type (e.g., "node")' },
                      program: { type: 'string', description: 'Program to debug' },
                      args: { type: 'array', description: 'Program arguments' },
                    },
                    required: ['adapter', 'program'],
                  },
                },
                {
                  name: 'debug/setBreakpoint',
                  description: 'Set a breakpoint in a file',
                  inputSchema: {
                    type: 'object',
                    properties: {
                      sessionId: { type: 'string', description: 'Debug session ID' },
                      file: { type: 'string', description: 'File path' },
                      line: { type: 'number', description: 'Line number' },
                      condition: { type: 'string', description: 'Optional condition' },
                    },
                    required: ['sessionId', 'file', 'line'],
                  },
                },
                {
                  name: 'debug/continue',
                  description: 'Continue execution',
                  inputSchema: {
                    type: 'object',
                    properties: {
                      sessionId: { type: 'string', description: 'Debug session ID' },
                      threadId: { type: 'number', description: 'Thread ID' },
                    },
                    required: ['sessionId', 'threadId'],
                  },
                },
              ],
            });
            break;
            
          case 'tools/call':
            // Handle tool calls
            const toolName = request.params?.name as string;
            const args = request.params?.arguments as Record<string, unknown>;
            
            try {
              let result;
              
              switch (toolName) {
                case 'debug/createSession':
                  // Create a new debug session
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
                      program: args?.program as string,
                      args: args?.args as string[],
                      console: 'integratedTerminal',
                      internalConsoleOptions: 'neverOpen',
                    },
                    name: `Debug Session for ${args?.program}`,
                  });
                  
                  result = {
                    content: [
                      {
                        type: 'text',
                        text: `Debug session created with ID: ${session.id}`,
                      },
                    ],
                  };
                  break;
                  
                case 'debug/setBreakpoint':
                  // Set a breakpoint
                  const sessionId = args?.sessionId as string;
                  const session2 = sessionManager.getSession(sessionId);
                  
                  if (!session2) {
                    throw new Error(`Session not found: ${sessionId}`);
                  }
                  
                  // This would set breakpoints via DAP
                  result = {
                    content: [
                      {
                        type: 'text',
                        text: `Breakpoint set at ${args?.file}:${args?.line}`,
                      },
                    ],
                  };
                  break;
                  
                default:
                  throw new Error(`Unknown tool: ${toolName}`);
              }
              
              connection.sendResponse(request.id!, result);
            } catch (error) {
              connection.sendResponse(request.id!, {
                content: [
                  {
                    type: 'text',
                    text: `Error: ${error instanceof Error ? error.message : String(error)}`,
                  },
                ],
                isError: true,
              });
            }
            break;
            
          default:
            connection.sendResponse(request.id!, undefined, {
              code: -32601,
              message: `Method not found: ${request.method}`,
            });
        }
      });
    });
    
    // Setup session manager event handlers
    sessionManager.on('sessionStateChanged', (sessionId, oldState, newState) => {
      logger.info('Session state changed', { sessionId, oldState, newState });
      
      // Broadcast state change to all connected clients
      mcpServer.broadcast('notifications/sessionStateChanged', {
        sessionId,
        oldState,
        newState,
      });
    });
    
    sessionManager.on('sessionStopped', (sessionId, event) => {
      logger.info('Session stopped', { sessionId, event });
      
      // Broadcast stopped event
      mcpServer.broadcast('notifications/sessionStopped', {
        sessionId,
        reason: event.body,
      });
    });
    
    sessionManager.on('sessionOutput', (sessionId, event) => {
      logger.debug('Session output', { sessionId, event });
      
      // Broadcast output
      mcpServer.broadcast('notifications/sessionOutput', {
        sessionId,
        output: event.body,
      });
    });
    
    // Start the MCP server
    await mcpServer.start();
    
    logger.info('RIXA example server started', {
      host: config.server.host,
      port: config.server.port,
      wsPath: '/mcp',
    });
    
    // Graceful shutdown
    process.on('SIGINT', async () => {
      logger.info('Shutting down...');
      
      await sessionManager.terminateAllSessions();
      await mcpServer.stop();
      
      logger.info('Shutdown complete');
      process.exit(0);
    });
    
  } catch (error) {
    console.error('Failed to start RIXA example:', error);
    process.exit(1);
  }
}

// Start the example
main().catch(console.error);
