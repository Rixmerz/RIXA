import { EventEmitter } from 'events';
import { spawn, ChildProcess } from 'child_process';
import { createConnection, Socket } from 'net';
import type { Logger } from '@/utils/logger.js';
import { ErrorType, RixaError } from '@/types/common.js';

/**
 * Transport interface for DAP communication
 */
export interface DapTransport extends EventEmitter {
  connect(): Promise<void>;
  send(message: string): void;
  close(): void;
  isConnected(): boolean;
}

/**
 * Transport configuration
 */
export interface TransportConfig {
  type: 'stdio' | 'tcp';
  command?: string;
  args?: string[];
  port?: number;
  host?: string;
  timeout?: number;
}

/**
 * STDIO transport for spawning DAP adapters as subprocesses
 */
export class StdioTransport extends EventEmitter implements DapTransport {
  private process: ChildProcess | null = null;
  private connected = false;
  private buffer = '';

  constructor(
    private config: TransportConfig,
    private logger: Logger
  ) {
    super();
  }

  async connect(): Promise<void> {
    if (this.connected) {
      throw new RixaError(ErrorType.INTERNAL_ERROR, 'Transport already connected');
    }

    if (!this.config.command) {
      throw new RixaError(ErrorType.VALIDATION_ERROR, 'Command is required for stdio transport');
    }

    this.logger.debug('Spawning DAP adapter process', {
      command: this.config.command,
      args: this.config.args,
    });

    try {
      this.process = spawn(this.config.command, this.config.args || [], {
        stdio: ['pipe', 'pipe', 'pipe'],
      });

      this.setupProcessHandlers();
      this.connected = true;

      this.emit('connect');
      this.logger.info('DAP adapter process spawned successfully', {
        pid: this.process.pid,
      });
    } catch (error) {
      throw new RixaError(ErrorType.ADAPTER_ERROR, 'Failed to spawn DAP adapter process', {
        cause: error instanceof Error ? error : new Error(String(error)),
      });
    }
  }

  private setupProcessHandlers(): void {
    if (!this.process) return;

    // Handle stdout (DAP messages)
    this.process.stdout?.on('data', (data: Buffer) => {
      this.handleData(data.toString());
    });

    // Handle stderr (logs)
    this.process.stderr?.on('data', (data: Buffer) => {
      this.logger.debug('DAP adapter stderr', { output: data.toString().trim() });
    });

    // Handle process exit
    this.process.on('exit', (code, signal) => {
      this.logger.info('DAP adapter process exited', { code, signal });
      this.connected = false;
      this.emit('disconnect', { code, signal });
    });

    // Handle process errors
    this.process.on('error', error => {
      this.logger.error('DAP adapter process error', { error: error.message });
      this.connected = false;
      this.emit('error', error);
    });
  }

  private handleData(data: string): void {
    this.buffer += data;

    // Process complete messages (Content-Length header + JSON)
    let processedMessages = 0;
    const maxMessages = 100; // Prevent infinite loops
    while (processedMessages < maxMessages) {
      const headerEnd = this.buffer.indexOf('\r\n\r\n');
      if (headerEnd === -1) break;
      processedMessages++;

      const headerPart = this.buffer.substring(0, headerEnd);
      const contentLengthMatch = headerPart.match(/Content-Length: (\d+)/i);

      if (!contentLengthMatch) {
        this.logger.warn('Invalid DAP message header', { header: headerPart });
        this.buffer = this.buffer.substring(headerEnd + 4);
        continue;
      }

      const contentLength = parseInt(contentLengthMatch[1]!, 10);
      const messageStart = headerEnd + 4;
      const messageEnd = messageStart + contentLength;

      if (this.buffer.length < messageEnd) {
        // Wait for more data
        break;
      }

      const messageContent = this.buffer.substring(messageStart, messageEnd);
      this.buffer = this.buffer.substring(messageEnd);

      try {
        const message = JSON.parse(messageContent);
        this.emit('message', message);
      } catch (error) {
        this.logger.error('Failed to parse DAP message', {
          content: messageContent,
          error: error instanceof Error ? error.message : String(error),
        });
      }
    }
  }

  send(message: string): void {
    if (!this.connected || !this.process?.stdin) {
      throw new RixaError(ErrorType.INTERNAL_ERROR, 'Transport not connected');
    }

    const content = Buffer.from(message, 'utf8');
    const header = `Content-Length: ${content.length}\r\n\r\n`;

    this.logger.debug('Sending DAP message', { message: JSON.parse(message) });

    this.process.stdin.write(header);
    this.process.stdin.write(content);
  }

  close(): void {
    if (this.process) {
      this.process.kill();
      this.process = null;
    }
    this.connected = false;
    this.emit('disconnect');
  }

  isConnected(): boolean {
    return this.connected;
  }
}

/**
 * TCP transport for connecting to DAP adapters via socket
 */
export class TcpTransport extends EventEmitter implements DapTransport {
  private socket: Socket | null = null;
  private connected = false;
  private buffer = '';

  constructor(
    private config: TransportConfig,
    private logger: Logger
  ) {
    super();
  }

  async connect(): Promise<void> {
    if (this.connected) {
      throw new RixaError(ErrorType.INTERNAL_ERROR, 'Transport already connected');
    }

    const port = this.config.port || 4711;
    const host = this.config.host || 'localhost';

    this.logger.debug('Connecting to DAP adapter via TCP', { host, port });

    return new Promise<void>((resolve, reject) => {
      this.socket = createConnection({ port, host });

      this.socket.on('connect', () => {
        this.connected = true;
        this.emit('connect');
        this.logger.info('Connected to DAP adapter via TCP', { host, port });
        resolve();
      });

      this.socket.on('data', (data: Buffer) => {
        this.handleData(data.toString());
      });

      this.socket.on('close', () => {
        this.connected = false;
        this.emit('disconnect');
        this.logger.info('TCP connection to DAP adapter closed');
      });

      this.socket.on('error', error => {
        this.connected = false;
        this.emit('error', error);
        this.logger.error('TCP connection error', { error: error.message });
        reject(error);
      });

      // Set timeout
      const timeout = this.config.timeout || 5000;
      const timeoutId = setTimeout(() => {
        this.socket?.destroy();
        reject(new RixaError(ErrorType.TIMEOUT, 'TCP connection timeout'));
      }, timeout);

      this.socket.on('connect', () => {
        clearTimeout(timeoutId);
      });
    });
  }

  private handleData(data: string): void {
    // Same logic as StdioTransport
    this.buffer += data;

    let processedMessages = 0;
    const maxMessages = 100; // Prevent infinite loops
    while (processedMessages < maxMessages) {
      const headerEnd = this.buffer.indexOf('\r\n\r\n');
      if (headerEnd === -1) break;
      processedMessages++;

      const headerPart = this.buffer.substring(0, headerEnd);
      const contentLengthMatch = headerPart.match(/Content-Length: (\d+)/i);

      if (!contentLengthMatch) {
        this.logger.warn('Invalid DAP message header', { header: headerPart });
        this.buffer = this.buffer.substring(headerEnd + 4);
        continue;
      }

      const contentLength = parseInt(contentLengthMatch[1]!, 10);
      const messageStart = headerEnd + 4;
      const messageEnd = messageStart + contentLength;

      if (this.buffer.length < messageEnd) {
        break;
      }

      const messageContent = this.buffer.substring(messageStart, messageEnd);
      this.buffer = this.buffer.substring(messageEnd);

      try {
        const message = JSON.parse(messageContent);
        this.emit('message', message);
      } catch (error) {
        this.logger.error('Failed to parse DAP message', {
          content: messageContent,
          error: error instanceof Error ? error.message : String(error),
        });
      }
    }
  }

  send(message: string): void {
    if (!this.connected || !this.socket) {
      throw new RixaError(ErrorType.INTERNAL_ERROR, 'Transport not connected');
    }

    const content = Buffer.from(message, 'utf8');
    const header = `Content-Length: ${content.length}\r\n\r\n`;

    this.logger.debug('Sending DAP message via TCP', { message: JSON.parse(message) });

    this.socket.write(header);
    this.socket.write(content);
  }

  close(): void {
    if (this.socket) {
      this.socket.destroy();
      this.socket = null;
    }
    this.connected = false;
    this.emit('disconnect');
  }

  isConnected(): boolean {
    return this.connected;
  }
}

/**
 * Transport factory
 */
export function createTransport(config: TransportConfig, logger: Logger): DapTransport {
  switch (config.type) {
    case 'stdio':
      return new StdioTransport(config, logger);
    case 'tcp':
      return new TcpTransport(config, logger);
    default:
      throw new RixaError(ErrorType.VALIDATION_ERROR, `Unsupported transport type: ${config.type}`);
  }
}
