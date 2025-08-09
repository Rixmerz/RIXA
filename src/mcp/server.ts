import { EventEmitter } from 'events';
import { WebSocketServer, WebSocket } from 'ws';
import { createServer, Server } from 'http';
import type { Logger } from '@/utils/logger.js';
import type { ServerConfig, AuthConfig } from '@/types/config.js';
import { ErrorType, RixaError } from '@/types/common.js';
import { generateRequestId, createCorrelationContext } from '@/utils/correlation.js';
import type { McpMessage, McpRequest, McpResponse, McpNotification } from '@/types/mcp.js';

/**
 * MCP Connection represents a single client connection
 */
export class McpConnection extends EventEmitter {
  private authenticated = false;
  private clientInfo: { name: string; version: string } | null = null;

  constructor(
    public readonly id: string,
    private ws: WebSocket,
    private logger: Logger,
    private authConfig: AuthConfig
  ) {
    super();
    this.setupWebSocketHandlers();
  }

  /**
   * Send a message to the client
   */
  send(message: McpMessage): void {
    if (this.ws.readyState !== WebSocket.OPEN) {
      throw new RixaError(ErrorType.INTERNAL_ERROR, 'WebSocket connection not open');
    }

    const messageStr = JSON.stringify(message);
    this.logger.debug('Sending MCP message', {
      connectionId: this.id,
      message,
    });

    this.ws.send(messageStr);
  }

  /**
   * Send a response to a request
   */
  sendResponse(requestId: string | number, result?: unknown, error?: unknown): void {
    const response: McpResponse = {
      jsonrpc: '2.0',
      id: requestId,
    };

    if (error) {
      response.error = {
        code: -32000,
        message: typeof error === 'string' ? error : 'Internal error',
        data: typeof error === 'object' ? error : undefined,
      };
    } else {
      response.result = result;
    }

    this.send(response);
  }

  /**
   * Send a notification to the client
   */
  sendNotification(method: string, params?: Record<string, unknown>): void {
    const notification: McpNotification = {
      jsonrpc: '2.0',
      method,
      params,
    };

    this.send(notification);
  }

  /**
   * Close the connection
   */
  close(code?: number, reason?: string): void {
    this.ws.close(code, reason);
  }

  /**
   * Check if connection is authenticated
   */
  isAuthenticated(): boolean {
    return this.authenticated;
  }

  /**
   * Get client information
   */
  getClientInfo(): { name: string; version: string } | null {
    return this.clientInfo;
  }

  private setupWebSocketHandlers(): void {
    this.ws.on('message', (data: Buffer) => {
      try {
        const message = JSON.parse(data.toString()) as McpMessage;
        this.handleMessage(message);
      } catch (error) {
        this.logger.error('Failed to parse MCP message', {
          connectionId: this.id,
          error: error instanceof Error ? error.message : String(error),
          data: data.toString(),
        });

        this.sendResponse('unknown', undefined, {
          code: -32700,
          message: 'Parse error',
        });
      }
    });

    this.ws.on('close', (code, reason) => {
      this.logger.info('MCP connection closed', {
        connectionId: this.id,
        code,
        reason: reason.toString(),
      });
      this.emit('close', { code, reason });
    });

    this.ws.on('error', error => {
      this.logger.error('MCP connection error', {
        connectionId: this.id,
        error: error.message,
      });
      this.emit('error', error);
    });

    this.ws.on('pong', () => {
      this.emit('pong');
    });
  }

  private handleMessage(message: McpMessage): void {
    const requestId = generateRequestId();
    const context = createCorrelationContext(requestId);

    this.logger.debug('Received MCP message', {
      connectionId: this.id,
      message,
      context,
    });

    // Check if this is a request that requires authentication
    if ('method' in message && message.method !== 'initialize' && !this.authenticated) {
      if (this.authConfig.enabled) {
        this.sendResponse(message.id || 'unknown', undefined, {
          code: -32001,
          message: 'Not authenticated',
        });
        return;
      }
    }

    if ('method' in message) {
      if (message.id !== undefined) {
        // This is a request
        this.emit('request', message as McpRequest, context);
      } else {
        // This is a notification
        this.emit('notification', message as McpNotification, context);
      }
    } else {
      // This is a response (shouldn't happen in server context, but handle gracefully)
      this.emit('response', message as McpResponse, context);
    }
  }

  /**
   * Mark connection as authenticated
   */
  setAuthenticated(clientInfo: { name: string; version: string }): void {
    this.authenticated = true;
    this.clientInfo = clientInfo;
    this.logger.info('MCP connection authenticated', {
      connectionId: this.id,
      clientInfo,
    });
  }
}

/**
 * MCP Server configuration
 */
export interface McpServerConfig {
  server: ServerConfig;
  auth: AuthConfig;
}

/**
 * MCP Server events
 */
export interface McpServerEvents {
  connection: (connection: McpConnection) => void;
  error: (error: Error) => void;
  listening: () => void;
}

/**
 * MCP WebSocket Server
 */
export class McpServer extends EventEmitter {
  private httpServer: Server | null = null;
  private wsServer: WebSocketServer | null = null;
  private connections = new Map<string, McpConnection>();
  private connectionCounter = 0;

  constructor(
    private config: McpServerConfig,
    private logger: Logger
  ) {
    super();
  }

  /**
   * Start the MCP server
   */
  async start(): Promise<void> {
    if (this.httpServer) {
      throw new RixaError(ErrorType.INTERNAL_ERROR, 'MCP server already started');
    }

    this.logger.info('Starting MCP server', {
      host: this.config.server.host,
      port: this.config.server.port,
    });

    try {
      // Create HTTP server
      this.httpServer = createServer();

      // Create WebSocket server
      this.wsServer = new WebSocketServer({
        server: this.httpServer,
        path: '/mcp',
      });

      this.setupServerHandlers();

      // Start listening
      await new Promise<void>((resolve, reject) => {
        this.httpServer!.listen(this.config.server.port, this.config.server.host, () => {
          this.logger.info('MCP server listening', {
            host: this.config.server.host,
            port: this.config.server.port,
          });
          this.emit('listening');
          resolve();
        });

        this.httpServer!.on('error', reject);
      });
    } catch (error) {
      throw new RixaError(ErrorType.INTERNAL_ERROR, 'Failed to start MCP server', {
        cause: error instanceof Error ? error : new Error(String(error)),
      });
    }
  }

  /**
   * Stop the MCP server
   */
  async stop(): Promise<void> {
    if (!this.httpServer) return;

    this.logger.info('Stopping MCP server');

    // Close all connections
    for (const connection of this.connections.values()) {
      connection.close(1001, 'Server shutting down');
    }
    this.connections.clear();

    // Close WebSocket server
    if (this.wsServer) {
      this.wsServer.close();
      this.wsServer = null;
    }

    // Close HTTP server
    await new Promise<void>(resolve => {
      this.httpServer!.close(() => {
        this.httpServer = null;
        resolve();
      });
    });

    this.logger.info('MCP server stopped');
  }

  /**
   * Get all active connections
   */
  getConnections(): McpConnection[] {
    return Array.from(this.connections.values());
  }

  /**
   * Get connection by ID
   */
  getConnection(id: string): McpConnection | undefined {
    return this.connections.get(id);
  }

  /**
   * Broadcast notification to all authenticated connections
   */
  broadcast(method: string, params?: Record<string, unknown>): void {
    for (const connection of this.connections.values()) {
      if (connection.isAuthenticated()) {
        try {
          connection.sendNotification(method, params);
        } catch (error) {
          this.logger.error('Failed to broadcast to connection', {
            connectionId: connection.id,
            error: error instanceof Error ? error.message : String(error),
          });
        }
      }
    }
  }

  private setupServerHandlers(): void {
    if (!this.wsServer) return;

    this.wsServer.on('connection', (ws, request) => {
      const connectionId = `conn-${++this.connectionCounter}`;
      const connection = new McpConnection(connectionId, ws, this.logger, this.config.auth);

      this.connections.set(connectionId, connection);

      this.logger.info('New MCP connection', {
        connectionId,
        remoteAddress: request.socket.remoteAddress,
        userAgent: request.headers['user-agent'],
      });

      connection.on('close', () => {
        this.connections.delete(connectionId);
      });

      connection.on('error', error => {
        this.logger.error('MCP connection error', {
          connectionId,
          error: error.message,
        });
        this.connections.delete(connectionId);
      });

      this.emit('connection', connection);
    });

    this.wsServer.on('error', error => {
      this.logger.error('MCP WebSocket server error', { error: error.message });
      this.emit('error', error);
    });

    this.httpServer!.on('error', error => {
      this.logger.error('MCP HTTP server error', { error: error.message });
      this.emit('error', error);
    });
  }
}
