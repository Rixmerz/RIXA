import { EventEmitter } from 'events';
import type { Logger } from '@/utils/logger.js';
import type { AppConfig } from '@/types/config.js';
import { ErrorType, RixaError } from '@/types/common.js';
import { McpServer, McpConnection } from '@/mcp/server.js';
import { SessionManager, DebugSession } from './session.js';
import { FilesystemResourceProvider } from '@/resources/filesystem.js';
import { ProjectResourceProvider } from '@/resources/project.js';
import { EnhancedDebugTools } from './enhanced-tools.js';
import { McpRateLimitMiddleware } from './rate-limiter.js';
import { HealthMonitor } from './health.js';
import { AdvancedErrorHandler, type ErrorContext } from './error-handler.js';
import { McpToDapMapper, DapToMcpMapper, DapResponseMapper } from './mappers.js';
import type {
  McpRequest,
  McpToolCallRequest,
  McpResourcesListRequest,
  McpResourceReadRequest,
  McpInitializeRequest,
} from '@/types/mcp.js';
import type { CorrelationContext } from '@/types/common.js';

/**
 * Main integration layer that connects MCP server with debugging functionality
 */
export class RixaIntegration extends EventEmitter {
  private mcpServer: McpServer;
  private sessionManager: SessionManager;
  private filesystemProvider: FilesystemResourceProvider;
  private projectProvider: ProjectResourceProvider;
  private enhancedTools: EnhancedDebugTools;
  private errorHandler: AdvancedErrorHandler;
  private mcpToDapMapper: McpToDapMapper;
  private dapToMcpMapper: DapToMcpMapper;
  private responseMapper: DapResponseMapper;
  private rateLimiter?: McpRateLimitMiddleware;
  private healthMonitor: HealthMonitor;
  private connections = new Map<string, McpConnection>();

  constructor(
    config: AppConfig,
    private logger: Logger
  ) {
    super();

    // Initialize components
    this.mcpServer = new McpServer(
      {
        server: config.server,
        auth: config.auth,
      },
      logger
    );

    this.sessionManager = new SessionManager(logger);
    this.filesystemProvider = new FilesystemResourceProvider(config.filesystem, logger);
    this.projectProvider = new ProjectResourceProvider(config.filesystem, logger);
    this.enhancedTools = new EnhancedDebugTools(logger);
    this.errorHandler = new AdvancedErrorHandler(logger);
    this.mcpToDapMapper = new McpToDapMapper(logger);
    this.dapToMcpMapper = new DapToMcpMapper(logger);
    this.responseMapper = new DapResponseMapper(logger);

    // Initialize rate limiting if configured
    if (config.auth.enabled) {
      this.rateLimiter = new McpRateLimitMiddleware(
        {
          windowMs: 60000, // 1 minute
          maxRequests: 100, // 100 requests per minute
          skipSuccessfulRequests: false,
        },
        logger
      );
    }

    // Initialize health monitor
    this.healthMonitor = new HealthMonitor(
      logger,
      this.sessionManager,
      this.mcpServer,
      this.rateLimiter
    );

    this.setupEventHandlers();
  }

  /**
   * Start the integration layer
   */
  async start(): Promise<void> {
    this.logger.info('Starting RIXA integration layer');

    try {
      await this.mcpServer.start();
      this.setupHttpEndpoints();
      this.logger.info('RIXA integration layer started successfully');
      this.emit('started');
    } catch (error) {
      throw new RixaError(ErrorType.INTERNAL_ERROR, 'Failed to start integration layer', {
        cause: error instanceof Error ? error : new Error(String(error)),
      });
    }
  }

  /**
   * Stop the integration layer
   */
  async stop(): Promise<void> {
    this.logger.info('Stopping RIXA integration layer');

    try {
      // Terminate all debug sessions
      await this.sessionManager.terminateAllSessions();

      // Stop MCP server
      await this.mcpServer.stop();

      this.logger.info('RIXA integration layer stopped successfully');
      this.emit('stopped');
    } catch (error) {
      this.logger.error('Error stopping integration layer', {
        error: error instanceof Error ? error.message : String(error),
      });
    }
  }

  /**
   * Get server information
   */
  getServerInfo(): {
    connections: number;
    activeSessions: number;
    capabilities: string[];
  } {
    return {
      connections: this.connections.size,
      activeSessions: this.sessionManager.getActiveSessionsCount(),
      capabilities: [
        'resources',
        'tools',
        'debugging',
        'filesystem',
        'breakpoints',
        'execution-control',
        'variable-inspection',
        'enhanced-debugging',
        'enhanced-stack-traces',
        'enhanced-variables',
        'enhanced-evaluation',
        'advanced-error-handling',
        'error-recovery',
        'error-statistics',
      ],
    };
  }

  private setupEventHandlers(): void {
    // MCP Server events
    this.mcpServer.on('connection', (connection: McpConnection) => {
      this.handleNewConnection(connection);
    });

    this.mcpServer.on('error', (error: Error) => {
      this.logger.error('MCP server error', { error: error.message });
      this.emit('error', error);
    });

    // Session Manager events
    this.sessionManager.on('sessionStateChanged', (sessionId, oldState, newState) => {
      this.broadcastSessionStateChange(sessionId, oldState, newState);
    });

    this.sessionManager.on('sessionStopped', (sessionId, event) => {
      this.broadcastSessionEvent(sessionId, 'stopped', event);
    });

    this.sessionManager.on('sessionOutput', (sessionId, event) => {
      this.broadcastSessionEvent(sessionId, 'output', event);
    });

    this.sessionManager.on('sessionThread', (sessionId, event) => {
      this.broadcastSessionEvent(sessionId, 'thread', event);
    });

    this.sessionManager.on('sessionBreakpoint', (sessionId, event) => {
      this.broadcastSessionEvent(sessionId, 'breakpoint', event);
    });

    this.sessionManager.on('sessionTerminated', (sessionId, event) => {
      this.broadcastSessionEvent(sessionId, 'terminated', event);
    });

    this.sessionManager.on('sessionError', (sessionId, error) => {
      this.broadcastSessionError(sessionId, error);
    });
  }

  private handleNewConnection(connection: McpConnection): void {
    this.connections.set(connection.id, connection);

    this.logger.info('New MCP connection established', {
      connectionId: connection.id,
    });

    // Handle connection events
    connection.on('request', (request: McpRequest, context: CorrelationContext) => {
      // Apply rate limiting
      if (this.rateLimiter) {
        try {
          this.rateLimiter.checkRequest(connection.id, request.method);
        } catch (error) {
          if (error instanceof RixaError) {
            connection.sendResponse(request.id || 'unknown', undefined, {
              code: -32429, // Too Many Requests
              message: error.message,
              data: error.details,
            });
            this.healthMonitor.recordRequest(false, true);
            return;
          }
        }
      }

      this.handleMcpRequest(connection, request, context).catch(error => {
        this.logger.error('Error handling MCP request', {
          connectionId: connection.id,
          method: request.method,
          error: error instanceof Error ? error.message : String(error),
          context,
        });

        connection.sendResponse(request.id || 'unknown', undefined, {
          code: -32603,
          message: 'Internal error',
          data: { error: error instanceof Error ? error.message : String(error) },
        });
      });
    });

    connection.on('close', () => {
      this.connections.delete(connection.id);
      this.logger.info('MCP connection closed', {
        connectionId: connection.id,
      });
    });

    connection.on('error', (error: Error) => {
      this.logger.error('MCP connection error', {
        connectionId: connection.id,
        error: error.message,
      });
      this.connections.delete(connection.id);
    });
  }

  private async handleMcpRequest(
    connection: McpConnection,
    request: McpRequest,
    context: CorrelationContext
  ): Promise<void> {
    this.logger.debug('Handling MCP request', {
      connectionId: connection.id,
      method: request.method,
      context,
    });

    try {
      switch (request.method) {
        case 'initialize':
          await this.handleInitialize(connection, request as McpInitializeRequest);
          break;

        case 'resources/list':
          await this.handleResourcesList(connection, request as McpResourcesListRequest);
          break;

        case 'resources/read':
          await this.handleResourceRead(connection, request as McpResourceReadRequest);
          break;

        case 'tools/list':
          await this.handleToolsList(connection, request);
          break;

        case 'tools/call':
          await this.handleToolCall(connection, request as McpToolCallRequest, context);
          break;

        default:
          connection.sendResponse(request.id || 'unknown', undefined, {
            code: -32601,
            message: `Method not found: ${request.method}`,
          });
      }
    } catch (error) {
      if (error instanceof RixaError) {
        connection.sendResponse(request.id || 'unknown', undefined, {
          code: this.getErrorCode(error.type),
          message: error.message,
          data: error.details,
        });
      } else {
        connection.sendResponse(request.id || 'unknown', undefined, {
          code: -32603,
          message: 'Internal error',
          data: { error: error instanceof Error ? error.message : String(error) },
        });
      }
    }
  }

  private async handleInitialize(
    connection: McpConnection,
    request: McpInitializeRequest
  ): Promise<void> {
    const clientInfo = request.params.clientInfo;

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
    connection.setAuthenticated(clientInfo);

    this.logger.info('MCP connection initialized', {
      connectionId: connection.id,
      clientInfo,
    });
  }

  private async handleResourcesList(
    connection: McpConnection,
    request: McpResourcesListRequest
  ): Promise<void> {
    // Get both basic filesystem resources and enhanced project resources
    const [basicResources, enhancedResources] = await Promise.all([
      this.filesystemProvider.listResources(),
      this.projectProvider.getEnhancedResources(),
    ]);

    // Combine and deduplicate resources
    const allResources = [...basicResources, ...enhancedResources];
    const uniqueResources = allResources.filter(
      (resource, index, array) => array.findIndex(r => r.uri === resource.uri) === index
    );

    connection.sendResponse(request.id!, {
      resources: uniqueResources,
    });
  }

  private async handleResourceRead(
    connection: McpConnection,
    request: McpResourceReadRequest
  ): Promise<void> {
    const uri = request.params.uri;

    try {
      // Check if this is an enhanced project resource
      if (uri.startsWith('project://')) {
        const enhancedContent = await this.projectProvider.readEnhancedResource(uri);
        connection.sendResponse(request.id!, {
          contents: [
            {
              uri: enhancedContent.uri,
              mimeType: enhancedContent.mimeType,
              text: enhancedContent.content,
            },
          ],
        });
        return;
      }

      // Handle regular file resources
      const fileContent = await this.filesystemProvider.readFile(uri);
      connection.sendResponse(request.id!, {
        contents: [
          {
            uri: fileContent.uri,
            mimeType: fileContent.mimeType,
            text: fileContent.encoding === 'utf8' ? fileContent.content : undefined,
            blob: fileContent.encoding === 'base64' ? fileContent.content : undefined,
          },
        ],
      });
    } catch (error) {
      throw new RixaError(ErrorType.FILESYSTEM_ERROR, 'Failed to read resource', {
        details: {
          uri,
          cause: error instanceof Error ? error.message : String(error),
        },
      });
    }
  }

  private async handleToolsList(connection: McpConnection, request: McpRequest): Promise<void> {
    const tools = [
      {
        name: 'debug/createSession',
        description: 'Create a new debug session',
        inputSchema: {
          type: 'object',
          properties: {
            adapter: { type: 'string', description: 'Debug adapter type (e.g., "node")' },
            program: { type: 'string', description: 'Program to debug' },
            args: { type: 'array', description: 'Program arguments' },
            cwd: { type: 'string', description: 'Working directory' },
            env: { type: 'object', description: 'Environment variables' },
          },
          required: ['adapter', 'program'],
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
            singleThread: { type: 'boolean', description: 'Continue single thread only' },
          },
          required: ['sessionId', 'threadId'],
        },
      },
      {
        name: 'debug/pause',
        description: 'Pause execution',
        inputSchema: {
          type: 'object',
          properties: {
            sessionId: { type: 'string', description: 'Debug session ID' },
            threadId: { type: 'number', description: 'Thread ID' },
          },
          required: ['sessionId', 'threadId'],
        },
      },
      {
        name: 'debug/stepOver',
        description: 'Step over (next line)',
        inputSchema: {
          type: 'object',
          properties: {
            sessionId: { type: 'string', description: 'Debug session ID' },
            threadId: { type: 'number', description: 'Thread ID' },
            granularity: { type: 'string', enum: ['statement', 'line', 'instruction'] },
          },
          required: ['sessionId', 'threadId'],
        },
      },
      {
        name: 'debug/stepIn',
        description: 'Step into function',
        inputSchema: {
          type: 'object',
          properties: {
            sessionId: { type: 'string', description: 'Debug session ID' },
            threadId: { type: 'number', description: 'Thread ID' },
            granularity: { type: 'string', enum: ['statement', 'line', 'instruction'] },
          },
          required: ['sessionId', 'threadId'],
        },
      },
      {
        name: 'debug/stepOut',
        description: 'Step out of function',
        inputSchema: {
          type: 'object',
          properties: {
            sessionId: { type: 'string', description: 'Debug session ID' },
            threadId: { type: 'number', description: 'Thread ID' },
            granularity: { type: 'string', enum: ['statement', 'line', 'instruction'] },
          },
          required: ['sessionId', 'threadId'],
        },
      },
      {
        name: 'debug/setBreakpoints',
        description: 'Set breakpoints in a file',
        inputSchema: {
          type: 'object',
          properties: {
            sessionId: { type: 'string', description: 'Debug session ID' },
            source: {
              type: 'object',
              properties: {
                path: { type: 'string', description: 'File path' },
                name: { type: 'string', description: 'File name' },
              },
              required: ['path'],
            },
            breakpoints: {
              type: 'array',
              items: {
                type: 'object',
                properties: {
                  line: { type: 'number', description: 'Line number' },
                  column: { type: 'number', description: 'Column number' },
                  condition: { type: 'string', description: 'Breakpoint condition' },
                  hitCondition: { type: 'string', description: 'Hit condition' },
                  logMessage: { type: 'string', description: 'Log message' },
                },
                required: ['line'],
              },
            },
          },
          required: ['sessionId', 'source', 'breakpoints'],
        },
      },
      {
        name: 'debug/getThreads',
        description: 'Get all threads',
        inputSchema: {
          type: 'object',
          properties: {
            sessionId: { type: 'string', description: 'Debug session ID' },
          },
          required: ['sessionId'],
        },
      },
      {
        name: 'debug/getStackTrace',
        description: 'Get stack trace for a thread',
        inputSchema: {
          type: 'object',
          properties: {
            sessionId: { type: 'string', description: 'Debug session ID' },
            threadId: { type: 'number', description: 'Thread ID' },
            startFrame: { type: 'number', description: 'Start frame index' },
            levels: { type: 'number', description: 'Number of frames' },
          },
          required: ['sessionId', 'threadId'],
        },
      },
      {
        name: 'debug/getVariables',
        description: 'Get variables for a scope',
        inputSchema: {
          type: 'object',
          properties: {
            sessionId: { type: 'string', description: 'Debug session ID' },
            variablesReference: { type: 'number', description: 'Variables reference' },
            filter: { type: 'string', enum: ['indexed', 'named'] },
            start: { type: 'number', description: 'Start index' },
            count: { type: 'number', description: 'Number of variables' },
          },
          required: ['sessionId', 'variablesReference'],
        },
      },
      {
        name: 'debug/evaluate',
        description: 'Evaluate an expression',
        inputSchema: {
          type: 'object',
          properties: {
            sessionId: { type: 'string', description: 'Debug session ID' },
            expression: { type: 'string', description: 'Expression to evaluate' },
            frameId: { type: 'number', description: 'Frame ID for context' },
            context: { type: 'string', enum: ['watch', 'repl', 'hover', 'clipboard'] },
          },
          required: ['sessionId', 'expression'],
        },
      },
      {
        name: 'debug/terminate',
        description: 'Terminate debug session',
        inputSchema: {
          type: 'object',
          properties: {
            sessionId: { type: 'string', description: 'Debug session ID' },
          },
          required: ['sessionId'],
        },
      },
      // Enhanced debugging tools
      {
        name: 'debug/getEnhancedStackTrace',
        description: 'Get enhanced stack trace with scopes and variables',
        inputSchema: {
          type: 'object',
          properties: {
            sessionId: { type: 'string', description: 'Debug session ID' },
            threadId: { type: 'number', description: 'Thread ID' },
            includeScopes: { type: 'boolean', description: 'Include scope information' },
            includeVariables: { type: 'boolean', description: 'Include variable values' },
          },
          required: ['sessionId', 'threadId'],
        },
      },
      {
        name: 'debug/getEnhancedVariables',
        description: 'Get enhanced variables with hierarchy and metadata',
        inputSchema: {
          type: 'object',
          properties: {
            sessionId: { type: 'string', description: 'Debug session ID' },
            variablesReference: { type: 'number', description: 'Variables reference' },
            maxDepth: { type: 'number', description: 'Maximum depth for variable expansion' },
          },
          required: ['sessionId', 'variablesReference'],
        },
      },
      {
        name: 'debug/evaluateEnhanced',
        description: 'Evaluate expression with enhanced result information',
        inputSchema: {
          type: 'object',
          properties: {
            sessionId: { type: 'string', description: 'Debug session ID' },
            expression: { type: 'string', description: 'Expression to evaluate' },
            frameId: { type: 'number', description: 'Frame ID for context' },
            context: { type: 'string', enum: ['watch', 'repl', 'hover', 'clipboard'] },
          },
          required: ['sessionId', 'expression'],
        },
      },
      // Error handling and statistics tools
      {
        name: 'debug/getErrorStats',
        description: 'Get error statistics and recovery information',
        inputSchema: {
          type: 'object',
          properties: {},
          required: [],
        },
      },
      {
        name: 'debug/resetErrorStats',
        description: 'Reset error statistics',
        inputSchema: {
          type: 'object',
          properties: {},
          required: [],
        },
      },
    ];

    connection.sendResponse(request.id!, { tools });
  }

  private async handleToolCall(
    connection: McpConnection,
    request: McpToolCallRequest,
    context: CorrelationContext
  ): Promise<void> {
    const toolName = request.params.name;
    const args = request.params.arguments || {};

    this.logger.debug('Handling tool call', {
      connectionId: connection.id,
      toolName,
      args,
      context,
    });

    try {
      if (toolName === 'debug/createSession') {
        await this.handleCreateSession(connection, request, args);
        return;
      }

      // For other debug tools, we need a session
      const sessionId = args?.['sessionId'] as string;
      if (!sessionId) {
        throw new RixaError(ErrorType.VALIDATION_ERROR, 'sessionId is required');
      }

      const session = this.sessionManager.getSession(sessionId);
      if (!session) {
        throw new RixaError(ErrorType.VALIDATION_ERROR, `Session not found: ${sessionId}`);
      }

      // Handle enhanced debugging tools
      if (toolName === 'debug/getEnhancedStackTrace') {
        await this.handleEnhancedStackTrace(connection, request, session, args);
        return;
      }

      if (toolName === 'debug/getEnhancedVariables') {
        await this.handleEnhancedVariables(connection, request, session, args);
        return;
      }

      if (toolName === 'debug/evaluateEnhanced') {
        await this.handleEnhancedEvaluate(connection, request, session, args);
        return;
      }

      if (toolName === 'debug/getErrorStats') {
        await this.handleGetErrorStats(connection, request);
        return;
      }

      if (toolName === 'debug/resetErrorStats') {
        await this.handleResetErrorStats(connection, request);
        return;
      }

      // Map MCP tool call to DAP request(s)
      const mappingResult = await this.mcpToDapMapper.mapToolCall(request, session);

      // Execute DAP requests
      const dapResponses = [];
      for (const dapRequest of mappingResult.dapRequests) {
        const dapResponse = await session.sendRequest(dapRequest.command, dapRequest.arguments);
        dapResponses.push(dapResponse);
      }

      // Map DAP response(s) back to MCP
      if (mappingResult.requiresResponse && dapResponses.length > 0) {
        const mcpResponse = this.responseMapper.mapResponse(
          dapResponses[0]!,
          request,
          sessionId
        );
        connection.sendResponse(request.id!, mcpResponse.result);
      } else {
        // Simple success response
        connection.sendResponse(request.id!, {
          content: [
            {
              type: 'text',
              text: `Command ${toolName} executed successfully`,
            },
          ],
        });
      }
    } catch (error) {
      await this.handleToolCallError(error, connection, request, {
        requestId: context.requestId,
        sessionId: args?.['sessionId'] as string,
        toolName,
        connection,
        session: undefined, // Session may not be available if validation failed
        retryCount: 0,
        originalArgs: args,
        timestamp: new Date(),
      });
    }
  }

  private async handleCreateSession(
    connection: McpConnection,
    request: McpToolCallRequest,
    args: Record<string, unknown>
  ): Promise<void> {
    const adapter = args['adapter'] as string;
    const program = args['program'] as string;
    const programArgs = args['args'] as string[];
    const cwd = args['cwd'] as string;
    const env = args['env'] as Record<string, string>;

    if (!adapter || !program) {
      throw new RixaError(ErrorType.VALIDATION_ERROR, 'adapter and program are required');
    }

    // Create debug session
    const session = await this.sessionManager.createSession({
      adapterConfig: {
        transport: {
          type: 'stdio',
          command: this.getAdapterCommand(adapter),
          args: this.getAdapterArgs(adapter),
        },
      },
      launchConfig: {
        type: adapter,
        program,
        args: programArgs,
        cwd: cwd || process.cwd(),
        env: { ...process.env, ...env },
        console: 'integratedTerminal',
        internalConsoleOptions: 'neverOpen',
      },
      name: `Debug Session for ${program}`,
      workspaceRoot: cwd || process.cwd(),
    });

    // Initialize and launch the session
    await session.initialize();
    await session.launch();

    connection.sendResponse(request.id!, {
      content: [
        {
          type: 'text',
          text: `Debug session created successfully`,
        },
        {
          type: 'text',
          text: JSON.stringify(
            {
              sessionId: session.id,
              state: session.getState(),
              capabilities: session.getCapabilities(),
            },
            null,
            2
          ),
        },
      ],
    });
  }

  private getAdapterCommand(adapter: string): string {
    const commands: Record<string, string> = {
      node: 'node',
      python: 'python',
      java: 'java',
      go: 'dlv',
      rust: 'rust-gdb',
    };

    return commands[adapter] || adapter;
  }

  private getAdapterArgs(adapter: string): string[] {
    const args: Record<string, string[]> = {
      node: ['--inspect-brk=0'],
      python: ['-m', 'debugpy', '--listen', '0'],
      java: ['-agentlib:jdwp=transport=dt_socket,server=y,suspend=y,address=0'],
      go: ['dap', '--listen=127.0.0.1:0'],
      rust: ['--batch', '--ex', 'run', '--ex', 'bt', '--args'],
    };

    return args[adapter] || [];
  }

  private broadcastSessionStateChange(sessionId: string, oldState: string, newState: string): void {
    this.mcpServer.broadcast('notifications/debug/sessionStateChanged', {
      sessionId,
      oldState,
      newState,
      timestamp: new Date().toISOString(),
    });
  }

  private broadcastSessionEvent(sessionId: string, _eventType: string, event: unknown): void {
    // Map DAP event to MCP notification
    const mappingResult = this.dapToMcpMapper.mapEvent(event as any, sessionId);

    // Broadcast all resulting notifications
    for (const notification of mappingResult.mcpNotifications) {
      this.mcpServer.broadcast(notification.method, notification.params);
    }
  }

  private broadcastSessionError(sessionId: string, error: Error): void {
    this.mcpServer.broadcast('notifications/debug/error', {
      sessionId,
      error: {
        message: error.message,
        type: error.constructor.name,
        stack: error.stack,
      },
      timestamp: new Date().toISOString(),
    });
  }

  private getErrorCode(errorType: ErrorType): number {
    const errorCodes: Record<ErrorType, number> = {
      [ErrorType.VALIDATION_ERROR]: -32602,
      [ErrorType.UNSUPPORTED_OPERATION]: -32601,
      [ErrorType.TIMEOUT]: -32603,
      [ErrorType.ADAPTER_ERROR]: -32603,
      [ErrorType.INTERNAL_ERROR]: -32603,
      [ErrorType.AUTH_ERROR]: -32001,
      [ErrorType.FILESYSTEM_ERROR]: -32603,
    };

    return errorCodes[errorType] || -32603;
  }

  private setupHttpEndpoints(): void {
    // Get the HTTP server from MCP server
    const httpServer = (this.mcpServer as any).httpServer;
    if (!httpServer) return;

    // Health endpoint
    httpServer.on('request', async (req: any, res: any) => {
      if (req.method === 'GET' && req.url === '/health') {
        try {
          const healthResponse = await this.healthMonitor.getHealthResponse();
          res.writeHead(healthResponse.status, {
            'Content-Type': 'application/json',
            'Access-Control-Allow-Origin': '*',
          });
          res.end(JSON.stringify(healthResponse.body, null, 2));
        } catch (error) {
          res.writeHead(500, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({ error: 'Health check failed' }));
        }
        return;
      }

      // Metrics endpoint
      if (req.method === 'GET' && req.url === '/metrics') {
        try {
          const metricsResponse = this.healthMonitor.getMetricsResponse();
          res.writeHead(metricsResponse.status, {
            'Content-Type': 'application/json',
            'Access-Control-Allow-Origin': '*',
          });
          res.end(JSON.stringify(metricsResponse.body, null, 2));
        } catch (error) {
          res.writeHead(500, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({ error: 'Metrics collection failed' }));
        }
        return;
      }

      // API info endpoint
      if (req.method === 'GET' && req.url === '/') {
        const info = {
          name: 'RIXA - Runtime Intelligent eXecution Adapter',
          version: '0.1.0',
          description: 'MCP server for debugging operations',
          endpoints: {
            websocket: '/mcp',
            health: '/health',
            metrics: '/metrics',
          },
          ...this.getServerInfo(),
        };

        res.writeHead(200, {
          'Content-Type': 'application/json',
          'Access-Control-Allow-Origin': '*',
        });
        res.end(JSON.stringify(info, null, 2));
        return;
      }
    });
  }

  /**
   * Handle enhanced stack trace request
   */
  private async handleEnhancedStackTrace(
    connection: McpConnection,
    request: McpToolCallRequest,
    session: DebugSession,
    args: Record<string, unknown>
  ): Promise<void> {
    const threadId = args?.['threadId'] as number;
    const includeScopes = args?.['includeScopes'] as boolean ?? true;
    const includeVariables = args?.['includeVariables'] as boolean ?? false;

    if (!threadId) {
      throw new RixaError(ErrorType.VALIDATION_ERROR, 'threadId is required');
    }

    try {
      const enhancedStackTrace = await this.enhancedTools.getEnhancedStackTrace(
        session,
        threadId,
        includeScopes,
        includeVariables
      );

      connection.sendResponse(request.id!, {
        content: [
          {
            type: 'text',
            text: JSON.stringify(enhancedStackTrace, null, 2),
          },
        ],
      });
    } catch (error) {
      throw new RixaError(ErrorType.ADAPTER_ERROR, 'Failed to get enhanced stack trace', {
        details: {
          threadId,
          includeScopes,
          includeVariables,
          cause: error instanceof Error ? error.message : String(error),
        },
      });
    }
  }

  /**
   * Handle enhanced variables request
   */
  private async handleEnhancedVariables(
    connection: McpConnection,
    request: McpToolCallRequest,
    session: DebugSession,
    args: Record<string, unknown>
  ): Promise<void> {
    const variablesReference = args?.['variablesReference'] as number;
    const maxDepth = args?.['maxDepth'] as number ?? 3;

    if (!variablesReference) {
      throw new RixaError(ErrorType.VALIDATION_ERROR, 'variablesReference is required');
    }

    try {
      const enhancedVariables = await this.enhancedTools.getEnhancedVariables(
        session,
        variablesReference,
        maxDepth
      );

      connection.sendResponse(request.id!, {
        content: [
          {
            type: 'text',
            text: JSON.stringify(enhancedVariables, null, 2),
          },
        ],
      });
    } catch (error) {
      throw new RixaError(ErrorType.ADAPTER_ERROR, 'Failed to get enhanced variables', {
        details: {
          variablesReference,
          maxDepth,
          cause: error instanceof Error ? error.message : String(error),
        },
      });
    }
  }

  /**
   * Handle enhanced evaluate request
   */
  private async handleEnhancedEvaluate(
    connection: McpConnection,
    request: McpToolCallRequest,
    session: DebugSession,
    args: Record<string, unknown>
  ): Promise<void> {
    const expression = args?.['expression'] as string;
    const frameId = args?.['frameId'] as number;
    const context = args?.['context'] as 'watch' | 'repl' | 'hover' | 'clipboard' ?? 'repl';

    if (!expression) {
      throw new RixaError(ErrorType.VALIDATION_ERROR, 'expression is required');
    }

    try {
      const evaluationResult = await this.enhancedTools.evaluateExpression(
        session,
        expression,
        frameId,
        context
      );

      connection.sendResponse(request.id!, {
        content: [
          {
            type: 'text',
            text: JSON.stringify(evaluationResult, null, 2),
          },
        ],
      });
    } catch (error) {
      throw new RixaError(ErrorType.ADAPTER_ERROR, 'Failed to evaluate enhanced expression', {
        details: {
          expression,
          frameId,
          context,
          cause: error instanceof Error ? error.message : String(error),
        },
      });
    }
  }

  /**
   * Handle tool call errors with advanced recovery
   */
  private async handleToolCallError(
    error: unknown,
    connection: McpConnection,
    request: McpToolCallRequest,
    errorContext: ErrorContext
  ): Promise<void> {
    // Convert to RixaError if needed
    const rixaError = error instanceof RixaError
      ? error
      : this.errorHandler.createEnhancedError(
          ErrorType.INTERNAL_ERROR,
          error instanceof Error ? error.message : String(error),
          errorContext,
          { cause: error instanceof Error ? error : undefined }
        );

    // Attempt recovery
    const recoveryResult = await this.errorHandler.handleError(rixaError, errorContext);

    if (recoveryResult.success && recoveryResult.shouldRetry) {
      // Retry the operation after delay
      if (recoveryResult.retryDelay) {
        await new Promise(resolve => setTimeout(resolve, recoveryResult.retryDelay));
      }

      try {
        // Update context for retry
        const retryContext = {
          ...errorContext,
          retryCount: errorContext.retryCount + 1,
          originalArgs: recoveryResult.context?.correctedArgs || errorContext.originalArgs,
        };

        // Retry the tool call
        await this.retryToolCall(connection, request, retryContext);
        return;
      } catch (retryError) {
        // If retry fails, fall through to error response
        this.logger.warn('Tool call retry failed', {
          requestId: errorContext.requestId,
          toolName: errorContext.toolName,
          retryCount: errorContext.retryCount + 1,
          retryError: retryError instanceof Error ? retryError.message : String(retryError),
        });
      }
    }

    // Send error response
    if (recoveryResult.context?.fallbackResponse) {
      // Use fallback response for graceful degradation
      connection.sendResponse(request.id!, recoveryResult.context.fallbackResponse);
    } else {
      // Standard error response
      connection.sendResponse(request.id!, {
        content: [
          {
            type: 'text',
            text: recoveryResult.success
              ? recoveryResult.message
              : `Error: ${rixaError.message}`,
          },
        ],
        isError: !recoveryResult.success,
      });
    }
  }

  /**
   * Retry a tool call with updated context
   */
  private async retryToolCall(
    connection: McpConnection,
    request: McpToolCallRequest,
    context: ErrorContext
  ): Promise<void> {
    const toolName = request.params.name;
    const args = context.originalArgs || request.params.arguments;

    this.logger.info('Retrying tool call', {
      requestId: context.requestId,
      toolName,
      retryCount: context.retryCount,
    });

    // Create a new request with updated arguments
    const retryRequest = {
      ...request,
      params: {
        ...request.params,
        arguments: args,
      },
    };

    // Call the tool again (this will go through the same error handling if it fails again)
    await this.handleToolCall(connection, retryRequest, {
      requestId: context.requestId,
    });
  }

  /**
   * Get error statistics
   */
  getErrorStats(): any {
    return this.errorHandler.getErrorStats();
  }

  /**
   * Handle get error stats request
   */
  private async handleGetErrorStats(
    connection: McpConnection,
    request: McpToolCallRequest
  ): Promise<void> {
    try {
      const stats = this.errorHandler.getErrorStats();

      connection.sendResponse(request.id!, {
        content: [
          {
            type: 'text',
            text: JSON.stringify(stats, null, 2),
          },
        ],
      });
    } catch (error) {
      connection.sendResponse(request.id!, {
        content: [
          {
            type: 'text',
            text: `Failed to get error stats: ${error instanceof Error ? error.message : String(error)}`,
          },
        ],
        isError: true,
      });
    }
  }

  /**
   * Handle reset error stats request
   */
  private async handleResetErrorStats(
    connection: McpConnection,
    request: McpToolCallRequest
  ): Promise<void> {
    try {
      this.errorHandler.resetStats();

      connection.sendResponse(request.id!, {
        content: [
          {
            type: 'text',
            text: 'Error statistics reset successfully',
          },
        ],
      });
    } catch (error) {
      connection.sendResponse(request.id!, {
        content: [
          {
            type: 'text',
            text: `Failed to reset error stats: ${error instanceof Error ? error.message : String(error)}`,
          },
        ],
        isError: true,
      });
    }
  }

  /**
   * Handle get error stats request
   */
  private async handleGetErrorStats(
    connection: McpConnection,
    request: McpToolCallRequest
  ): Promise<void> {
    try {
      const stats = this.errorHandler.getErrorStats();

      connection.sendResponse(request.id!, {
        content: [
          {
            type: 'text',
            text: JSON.stringify(stats, null, 2),
          },
        ],
      });
    } catch (error) {
      connection.sendResponse(request.id!, {
        content: [
          {
            type: 'text',
            text: `Failed to get error stats: ${error instanceof Error ? error.message : String(error)}`,
          },
        ],
        isError: true,
      });
    }
  }

  /**
   * Handle reset error stats request
   */
  private async handleResetErrorStats(
    connection: McpConnection,
    request: McpToolCallRequest
  ): Promise<void> {
    try {
      this.errorHandler.resetStats();

      connection.sendResponse(request.id!, {
        content: [
          {
            type: 'text',
            text: 'Error statistics reset successfully',
          },
        ],
      });
    } catch (error) {
      connection.sendResponse(request.id!, {
        content: [
          {
            type: 'text',
            text: `Failed to reset error stats: ${error instanceof Error ? error.message : String(error)}`,
          },
        ],
        isError: true,
      });
    }
  }

  /**
   * Get error statistics
   */
  getErrorStats(): any {
    return this.errorHandler.getErrorStats();
  }

  /**
   * Reset error statistics
   */
  resetErrorStats(): void {
    this.errorHandler.resetStats();
  }
}
