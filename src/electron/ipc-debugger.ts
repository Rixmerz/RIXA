/**
 * IPC Debugger - Handles debugging of Inter-Process Communication
 * 
 * This debugger manages IPC communication between main and renderer processes,
 * providing tracing, inspection, and debugging capabilities for IPC messages.
 */

import { EventEmitter } from 'events';
import { v4 as uuidv4 } from 'uuid';
import type { Logger } from '../utils/logger.js';
import type {
  ElectronDebugSession,
  ElectronIPCMessage,
  ElectronIPCChannel
} from './types.js';
import { ElectronDebugError, ElectronErrorType } from './types.js';

/**
 * IPC Debugging session info
 */
interface IPCDebugSession {
  sessionId: string;
  session: ElectronDebugSession;
  channels: Map<string, ElectronIPCChannel>;
  messages: ElectronIPCMessage[];
  isTracing: boolean;
  maxMessages: number;
}

/**
 * IPC Debugger class
 */
export class IPCDebugger extends EventEmitter {
  private logger: Logger;
  private activeSessions: Map<string, IPCDebugSession> = new Map();
  private messageInterceptors: Map<string, Function> = new Map();

  constructor(logger: Logger) {
    super();
    this.logger = logger;
  }

  /**
   * Initialize IPC debugging for a session
   */
  async initialize(session: ElectronDebugSession): Promise<void> {
    this.logger.info('Initializing IPC debugging', { sessionId: session.sessionId });

    try {
      const ipcSession: IPCDebugSession = {
        sessionId: session.sessionId,
        session,
        channels: new Map(),
        messages: [],
        isTracing: false,
        maxMessages: 1000
      };

      this.activeSessions.set(session.sessionId, ipcSession);

      // Initialize known IPC channels
      await this.discoverIPCChannels(ipcSession);

      this.logger.info('Successfully initialized IPC debugging', {
        sessionId: session.sessionId,
        channelsFound: ipcSession.channels.size
      });
    } catch (error) {
      const debugError = new ElectronDebugError(
        ElectronErrorType.IPC_ERROR,
        `Failed to initialize IPC debugging: ${error instanceof Error ? error.message : String(error)}`,
        { sessionId: session.sessionId, originalError: error }
      );
      this.logger.error('IPC debugging initialization failed', { error: debugError });
      throw debugError;
    }
  }

  /**
   * Cleanup IPC debugging for a session
   */
  async cleanup(sessionId: string): Promise<void> {
    this.logger.info('Cleaning up IPC debugging', { sessionId });

    try {
      const ipcSession = this.activeSessions.get(sessionId);
      if (ipcSession) {
        // Stop tracing if active
        if (ipcSession.isTracing) {
          await this.stopTracing(sessionId);
        }

        // Remove message interceptors
        this.messageInterceptors.delete(sessionId);

        // Clear session data
        this.activeSessions.delete(sessionId);
      }

      this.logger.info('Successfully cleaned up IPC debugging', { sessionId });
    } catch (error) {
      const debugError = new ElectronDebugError(
        ElectronErrorType.IPC_ERROR,
        `Failed to cleanup IPC debugging: ${error instanceof Error ? error.message : String(error)}`,
        { sessionId, originalError: error }
      );
      this.logger.error('IPC debugging cleanup failed', { error: debugError });
      throw debugError;
    }
  }

  /**
   * Get active sessions
   */
  getActiveSessions(): ElectronDebugSession[] {
    return Array.from(this.activeSessions.values()).map(ipcSession => ipcSession.session);
  }

  /**
   * Check if session is active
   */
  isSessionActive(sessionId: string): boolean {
    return this.activeSessions.has(sessionId);
  }

  /**
   * Start IPC message tracing
   */
  async startTracing(sessionId: string): Promise<void> {
    const ipcSession = this.activeSessions.get(sessionId);
    if (!ipcSession) {
      throw new ElectronDebugError(ElectronErrorType.IPC_ERROR, `Session not found: ${sessionId}`);
    }

    if (ipcSession.isTracing) {
      this.logger.warn('IPC tracing already active', { sessionId });
      return;
    }

    try {
      // Set up message interceptors for main and renderer processes
      await this.setupMessageInterceptors(ipcSession);

      ipcSession.isTracing = true;
      this.logger.info('IPC tracing started', { sessionId });

      this.emit('tracingStarted', { sessionId });
    } catch (error) {
      throw new ElectronDebugError(
        ElectronErrorType.IPC_ERROR,
        `Failed to start IPC tracing: ${error instanceof Error ? error.message : String(error)}`,
        { sessionId, originalError: error }
      );
    }
  }

  /**
   * Stop IPC message tracing
   */
  async stopTracing(sessionId: string): Promise<void> {
    const ipcSession = this.activeSessions.get(sessionId);
    if (!ipcSession) {
      throw new ElectronDebugError(ElectronErrorType.IPC_ERROR, `Session not found: ${sessionId}`);
    }

    if (!ipcSession.isTracing) {
      this.logger.warn('IPC tracing not active', { sessionId });
      return;
    }

    try {
      // Remove message interceptors
      this.messageInterceptors.delete(sessionId);

      ipcSession.isTracing = false;
      this.logger.info('IPC tracing stopped', { sessionId });

      this.emit('tracingStopped', { sessionId });
    } catch (error) {
      throw new ElectronDebugError(
        ElectronErrorType.IPC_ERROR,
        `Failed to stop IPC tracing: ${error instanceof Error ? error.message : String(error)}`,
        { sessionId, originalError: error }
      );
    }
  }

  /**
   * Get IPC channels for a session
   */
  getIPCChannels(sessionId: string): ElectronIPCChannel[] {
    const ipcSession = this.activeSessions.get(sessionId);
    if (!ipcSession) {
      throw new ElectronDebugError(ElectronErrorType.IPC_ERROR, `Session not found: ${sessionId}`);
    }

    return Array.from(ipcSession.channels.values());
  }

  /**
   * Get IPC messages for a session
   */
  getIPCMessages(sessionId: string, channelName?: string, limit: number = 100): ElectronIPCMessage[] {
    const ipcSession = this.activeSessions.get(sessionId);
    if (!ipcSession) {
      throw new ElectronDebugError(ElectronErrorType.IPC_ERROR, `Session not found: ${sessionId}`);
    }

    let messages = ipcSession.messages;

    // Filter by channel if specified
    if (channelName) {
      messages = messages.filter(msg => msg.channel === channelName);
    }

    // Sort by timestamp (newest first) and limit
    return messages
      .sort((a, b) => b.timestamp.getTime() - a.timestamp.getTime())
      .slice(0, limit);
  }

  /**
   * Set breakpoint on IPC channel
   */
  async setIPCBreakpoint(sessionId: string, channelName: string, direction?: 'main-to-renderer' | 'renderer-to-main' | 'bidirectional'): Promise<void> {
    const ipcSession = this.activeSessions.get(sessionId);
    if (!ipcSession) {
      throw new ElectronDebugError(ElectronErrorType.IPC_ERROR, `Session not found: ${sessionId}`);
    }

    try {
      // Create or update channel with breakpoint
      const channel = ipcSession.channels.get(channelName) || {
        name: channelName,
        type: 'send',
        direction: direction || 'bidirectional',
        messageCount: 0,
        active: true
      };

      ipcSession.channels.set(channelName, channel);

      this.logger.info('IPC breakpoint set', { sessionId, channelName, direction });

      this.emit('breakpointSet', { sessionId, channelName, direction });
    } catch (error) {
      throw new ElectronDebugError(
        ElectronErrorType.IPC_ERROR,
        `Failed to set IPC breakpoint: ${error instanceof Error ? error.message : String(error)}`,
        { sessionId, channelName, originalError: error }
      );
    }
  }

  /**
   * Remove IPC breakpoint
   */
  async removeIPCBreakpoint(sessionId: string, channelName: string): Promise<void> {
    const ipcSession = this.activeSessions.get(sessionId);
    if (!ipcSession) {
      throw new ElectronDebugError(ElectronErrorType.IPC_ERROR, `Session not found: ${sessionId}`);
    }

    try {
      const channel = ipcSession.channels.get(channelName);
      if (channel) {
        // Keep channel but remove breakpoint behavior
        ipcSession.channels.set(channelName, { ...channel, active: false });
      }

      this.logger.info('IPC breakpoint removed', { sessionId, channelName });

      this.emit('breakpointRemoved', { sessionId, channelName });
    } catch (error) {
      throw new ElectronDebugError(
        ElectronErrorType.IPC_ERROR,
        `Failed to remove IPC breakpoint: ${error instanceof Error ? error.message : String(error)}`,
        { sessionId, channelName, originalError: error }
      );
    }
  }

  /**
   * Simulate IPC message
   */
  async simulateIPCMessage(sessionId: string, channelName: string, payload: any, direction: 'main-to-renderer' | 'renderer-to-main'): Promise<void> {
    const ipcSession = this.activeSessions.get(sessionId);
    if (!ipcSession) {
      throw new ElectronDebugError(ElectronErrorType.IPC_ERROR, `Session not found: ${sessionId}`);
    }

    try {
      const message: ElectronIPCMessage = {
        id: uuidv4(),
        channel: channelName,
        type: 'send',
        direction,
        timestamp: new Date(),
        payload,
        sender: {
          processId: direction === 'main-to-renderer' ? 'main' : 'renderer',
          processType: direction === 'main-to-renderer' ? 'main' : 'renderer'
        },
        receiver: {
          processId: direction === 'main-to-renderer' ? 'renderer' : 'main',
          processType: direction === 'main-to-renderer' ? 'renderer' : 'main'
        }
      };

      // Add to messages
      this.addMessage(ipcSession, message);

      this.logger.info('IPC message simulated', { sessionId, channelName, direction });

      this.emit('messageSimulated', { sessionId, message });
    } catch (error) {
      throw new ElectronDebugError(
        ElectronErrorType.IPC_ERROR,
        `Failed to simulate IPC message: ${error instanceof Error ? error.message : String(error)}`,
        { sessionId, channelName, originalError: error }
      );
    }
  }

  /**
   * Discover IPC channels from processes
   */
  private async discoverIPCChannels(ipcSession: IPCDebugSession): Promise<void> {
    try {
      // Common Electron IPC channels
      const commonChannels = [
        'app-ready',
        'window-close',
        'window-minimize',
        'window-maximize',
        'menu-click',
        'file-open',
        'file-save',
        'dialog-show',
        'notification-show',
        'update-available',
        'update-downloaded'
      ];

      for (const channelName of commonChannels) {
        const channel: ElectronIPCChannel = {
          name: channelName,
          type: 'send',
          direction: 'bidirectional',
          messageCount: 0,
          active: false
        };

        ipcSession.channels.set(channelName, channel);
      }

      this.logger.debug('Discovered IPC channels', {
        sessionId: ipcSession.sessionId,
        channelCount: ipcSession.channels.size
      });
    } catch (error) {
      this.logger.warn('Failed to discover IPC channels', {
        sessionId: ipcSession.sessionId,
        error: error instanceof Error ? error.message : String(error)
      });
    }
  }

  /**
   * Setup message interceptors
   */
  private async setupMessageInterceptors(ipcSession: IPCDebugSession): Promise<void> {
    const interceptor = (message: ElectronIPCMessage) => {
      this.addMessage(ipcSession, message);

      // Check for breakpoints
      const channel = ipcSession.channels.get(message.channel);
      if (channel && channel.active) {
        this.emit('breakpointHit', { sessionId: ipcSession.sessionId, message, channel });
      }

      this.emit('message', message);
    };

    this.messageInterceptors.set(ipcSession.sessionId, interceptor);
  }

  /**
   * Add message to session
   */
  private addMessage(ipcSession: IPCDebugSession, message: ElectronIPCMessage): void {
    // Add message to list
    ipcSession.messages.push(message);

    // Maintain max messages limit
    if (ipcSession.messages.length > ipcSession.maxMessages) {
      ipcSession.messages = ipcSession.messages.slice(-ipcSession.maxMessages);
    }

    // Update channel statistics
    const channel = ipcSession.channels.get(message.channel);
    if (channel) {
      channel.messageCount++;
      channel.lastMessage = message;
      ipcSession.channels.set(message.channel, channel);
    } else {
      // Create new channel
      const newChannel: ElectronIPCChannel = {
        name: message.channel,
        type: message.type,
        direction: message.direction,
        messageCount: 1,
        lastMessage: message,
        active: false
      };
      ipcSession.channels.set(message.channel, newChannel);
    }
  }
}
