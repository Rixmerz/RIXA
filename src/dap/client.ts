import { EventEmitter } from 'events';
import type { Logger } from '@/utils/logger.js';
import { ErrorType, RixaError } from '@/types/common.js';
import { createTransport } from './transport.js';
import type { DapTransport, TransportConfig } from './transport.js';
import type { DapMessage, DapRequest, DapResponse, DapEvent } from '@/types/dap.js';

/**
 * Pending request tracking
 */
interface PendingRequest {
  resolve: (response: DapResponse) => void;
  reject: (error: Error) => void;
  timeout: ReturnType<typeof setTimeout>;
  command: string;
}

/**
 * DAP Client configuration
 */
export interface DapClientConfig {
  transport: TransportConfig;
  requestTimeout?: number;
  maxRetries?: number;
}

/**
 * DAP Client events
 */
export interface DapClientEvents {
  connect: () => void;
  disconnect: (info?: { code?: number; signal?: string }) => void;
  error: (error: Error) => void;
  event: (event: DapEvent) => void;
  message: (message: DapMessage) => void;
}

/**
 * DAP Client for communicating with debug adapters
 */
export class DapClient extends EventEmitter {
  private transport: DapTransport | null = null;
  private sequenceNumber = 1;
  private pendingRequests = new Map<number, PendingRequest>();
  private connected = false;

  constructor(
    private config: DapClientConfig,
    private logger: Logger
  ) {
    super();
  }

  /**
   * Connect to the DAP adapter
   */
  async connect(): Promise<void> {
    if (this.connected) {
      throw new RixaError(ErrorType.INTERNAL_ERROR, 'DAP client already connected');
    }

    this.logger.info('Connecting DAP client', {
      transport: this.config.transport.type,
    });

    try {
      this.transport = createTransport(this.config.transport, this.logger);
      this.setupTransportHandlers();

      // Connect transport (both stdio and tcp have connect method)
      if ('connect' in this.transport && typeof this.transport.connect === 'function') {
        await this.transport.connect();
      }

      this.connected = true;
      this.emit('connect');
    } catch (error) {
      throw new RixaError(ErrorType.ADAPTER_ERROR, 'Failed to connect DAP client', {
        cause: error instanceof Error ? error : new Error(String(error)),
      });
    }
  }

  /**
   * Disconnect from the DAP adapter
   */
  disconnect(): void {
    if (!this.connected) return;

    this.logger.info('Disconnecting DAP client');

    // Reject all pending requests
    for (const [, pending] of this.pendingRequests) {
      clearTimeout(pending.timeout);
      pending.reject(new RixaError(ErrorType.INTERNAL_ERROR, 'DAP client disconnected'));
    }
    this.pendingRequests.clear();

    if (this.transport) {
      this.transport.close();
      this.transport = null;
    }

    this.connected = false;
    this.emit('disconnect');
  }

  /**
   * Send a request to the DAP adapter
   */
  async sendRequest<T extends DapResponse>(
    command: string,
    args?: Record<string, unknown>
  ): Promise<T> {
    if (!this.connected || !this.transport) {
      throw new RixaError(ErrorType.INTERNAL_ERROR, 'DAP client not connected');
    }

    const seq = this.sequenceNumber++;
    const request: DapRequest = {
      seq,
      type: 'request',
      command,
      arguments: args,
    };

    this.logger.debug('Sending DAP request', { seq, command, args });

    return new Promise<T>((resolve, reject) => {
      const timeout = setTimeout(() => {
        this.pendingRequests.delete(seq);
        reject(
          new RixaError(ErrorType.TIMEOUT, `DAP request timeout: ${command}`, {
            details: { seq, command },
          })
        );
      }, this.config.requestTimeout || 30000);

      this.pendingRequests.set(seq, {
        resolve: resolve as (response: DapResponse) => void,
        reject,
        timeout,
        command,
      });

      try {
        this.transport!.send(JSON.stringify(request));
      } catch (error) {
        this.pendingRequests.delete(seq);
        clearTimeout(timeout);
        reject(
          new RixaError(ErrorType.ADAPTER_ERROR, 'Failed to send DAP request', {
            cause: error instanceof Error ? error : new Error(String(error)),
          })
        );
      }
    });
  }

  /**
   * Check if client is connected
   */
  isConnected(): boolean {
    return this.connected && this.transport?.isConnected() === true;
  }

  /**
   * Get current sequence number
   */
  getCurrentSequence(): number {
    return this.sequenceNumber;
  }

  /**
   * Get pending requests count
   */
  getPendingRequestsCount(): number {
    return this.pendingRequests.size;
  }

  private setupTransportHandlers(): void {
    if (!this.transport) return;

    this.transport.on('connect', () => {
      this.logger.debug('DAP transport connected');
    });

    this.transport.on('disconnect', info => {
      this.logger.debug('DAP transport disconnected', info);
      this.connected = false;
      this.emit('disconnect', info);
    });

    this.transport.on('error', error => {
      this.logger.error('DAP transport error', { error: error.message });
      this.emit('error', error);
    });

    this.transport.on('message', (message: DapMessage) => {
      this.handleMessage(message);
    });
  }

  private handleMessage(message: DapMessage): void {
    this.emit('message', message);

    if (message.type === 'response') {
      this.handleResponse(message as DapResponse);
    } else if (message.type === 'event') {
      this.handleEvent(message as DapEvent);
    } else {
      this.logger.warn('Unknown DAP message type', { message });
    }
  }

  private handleResponse(response: DapResponse): void {
    const pending = this.pendingRequests.get(response.request_seq);
    if (!pending) {
      this.logger.warn('Received response for unknown request', {
        seq: response.request_seq,
        command: response.command,
      });
      return;
    }

    this.pendingRequests.delete(response.request_seq);
    clearTimeout(pending.timeout);

    this.logger.debug('Received DAP response', {
      seq: response.seq,
      request_seq: response.request_seq,
      command: response.command,
      success: response.success,
    });

    if (response.success) {
      pending.resolve(response);
    } else {
      pending.reject(
        new RixaError(ErrorType.ADAPTER_ERROR, response.message || 'DAP request failed', {
          details: {
            command: response.command,
            seq: response.seq,
            request_seq: response.request_seq,
          },
        })
      );
    }
  }

  private handleEvent(event: DapEvent): void {
    this.logger.debug('Received DAP event', {
      seq: event.seq,
      event: event.event,
      body: event.body,
    });

    this.emit('event', event);
  }
}

/**
 * Create a DAP client with configuration
 */
export function createDapClient(config: DapClientConfig, logger: Logger): DapClient {
  return new DapClient(config, logger);
}
