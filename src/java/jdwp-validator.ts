import { Socket } from 'net';
import { EventEmitter } from 'events';

/**
 * JDWP Connection Validator
 * Validates direct connectivity to Java Debug Wire Protocol agents
 */

export interface JDWPConnectionInfo {
  host: string;
  port: number;
  connected: boolean;
  handshakeSuccessful: boolean;
  vmVersion?: string;
  vmName?: string;
  capabilities?: JDWPCapabilities;
  error?: string;
}

export interface JDWPCapabilities {
  canWatchFieldModification: boolean;
  canWatchFieldAccess: boolean;
  canGetBytecodes: boolean;
  canGetSyntheticAttribute: boolean;
  canGetOwnedMonitorInfo: boolean;
  canGetCurrentContendedMonitor: boolean;
  canGetMonitorInfo: boolean;
}

export interface JDWPValidationOptions {
  timeout: number;
  retryAttempts: number;
  retryDelay: number;
  validateHandshake: boolean;
}

/**
 * JDWP Protocol Constants
 */
const JDWP_HANDSHAKE = 'JDWP-Handshake';
const JDWP_COMMAND_SET_VM = 1;
const JDWP_COMMAND_VERSION = 1;
// const JDWP_COMMAND_CAPABILITIES = 12;

/**
 * JDWP Connection Validator Class
 */
export class JDWPValidator extends EventEmitter {
  private socket: Socket | null = null;
  private connectionInfo: JDWPConnectionInfo;
  private options: JDWPValidationOptions;

  constructor(host: string, port: number, options: Partial<JDWPValidationOptions> = {}) {
    super();
    
    this.connectionInfo = {
      host,
      port,
      connected: false,
      handshakeSuccessful: false
    };
    
    this.options = {
      timeout: options.timeout || 10000,
      retryAttempts: options.retryAttempts || 3,
      retryDelay: options.retryDelay || 1000,
      validateHandshake: options.validateHandshake !== false
    };
  }

  /**
   * Validates JDWP connection with retry logic
   */
  async validateConnection(): Promise<JDWPConnectionInfo> {
    let lastError: Error | null = null;
    
    for (let attempt = 1; attempt <= this.options.retryAttempts; attempt++) {
      try {
        this.emit('attempt', { attempt, total: this.options.retryAttempts });
        
        const result = await this.attemptConnection();
        if (result.connected) {
          return result;
        }
        
        lastError = new Error(result.error || 'Connection failed');
      } catch (error) {
        lastError = error instanceof Error ? error : new Error(String(error));
        this.emit('error', { attempt, error: lastError });
      }
      
      if (attempt < this.options.retryAttempts) {
        await this.delay(this.options.retryDelay);
      }
    }
    
    this.connectionInfo.error = lastError?.message || 'All connection attempts failed';
    return this.connectionInfo;
  }

  /**
   * Attempts a single connection to JDWP agent
   */
  private async attemptConnection(): Promise<JDWPConnectionInfo> {
    return new Promise((resolve) => {
      this.socket = new Socket();
      
      const timeout = setTimeout(() => {
        this.cleanup();
        this.connectionInfo.error = 'Connection timeout';
        resolve(this.connectionInfo);
      }, this.options.timeout);

      this.socket.on('connect', async () => {
        clearTimeout(timeout);
        this.connectionInfo.connected = true;
        this.emit('connected');
        
        if (this.options.validateHandshake) {
          try {
            await this.performHandshake();
            resolve(this.connectionInfo);
          } catch (error) {
            this.connectionInfo.error = error instanceof Error ? error.message : String(error);
            this.cleanup();
            resolve(this.connectionInfo);
          }
        } else {
          this.cleanup();
          resolve(this.connectionInfo);
        }
      });

      this.socket.on('error', (error) => {
        clearTimeout(timeout);
        this.connectionInfo.error = error.message;
        this.cleanup();
        resolve(this.connectionInfo);
      });

      this.socket.on('timeout', () => {
        clearTimeout(timeout);
        this.connectionInfo.error = 'Socket timeout';
        this.cleanup();
        resolve(this.connectionInfo);
      });

      // Attempt connection
      this.socket.connect(this.connectionInfo.port, this.connectionInfo.host);
    });
  }

  /**
   * Performs JDWP handshake validation
   */
  private async performHandshake(): Promise<void> {
    if (!this.socket) {
      throw new Error('No socket available for handshake');
    }

    return new Promise((resolve, reject) => {
      let handshakeReceived = false;
      
      const handshakeTimeout = setTimeout(() => {
        if (!handshakeReceived) {
          reject(new Error('Handshake timeout'));
        }
      }, 5000);

      this.socket!.on('data', (data) => {
        if (!handshakeReceived) {
          const response = data.toString();
          if (response.startsWith(JDWP_HANDSHAKE)) {
            handshakeReceived = true;
            clearTimeout(handshakeTimeout);
            this.connectionInfo.handshakeSuccessful = true;
            this.emit('handshake-success');
            
            // Try to get VM information
            this.getVMInformation()
              .then(() => resolve())
              .catch(() => resolve()); // Don't fail if we can't get VM info
          } else {
            clearTimeout(handshakeTimeout);
            reject(new Error('Invalid handshake response'));
          }
        }
      });

      // Send handshake
      this.socket!.write(JDWP_HANDSHAKE);
    });
  }

  /**
   * Gets VM information from JDWP agent
   */
  private async getVMInformation(): Promise<void> {
    if (!this.socket || !this.connectionInfo.handshakeSuccessful) {
      return;
    }

    try {
      // This is a simplified version - real JDWP protocol is more complex
      const versionCommand = this.buildJDWPCommand(JDWP_COMMAND_SET_VM, JDWP_COMMAND_VERSION);
      
      return new Promise((resolve, reject) => {
        const timeout = setTimeout(() => {
          reject(new Error('VM information timeout'));
        }, 3000);

        this.socket!.once('data', (data) => {
          clearTimeout(timeout);
          try {
            const vmInfo = this.parseVMVersionResponse(data);
            this.connectionInfo.vmVersion = vmInfo.version;
            this.connectionInfo.vmName = vmInfo.name;
            resolve();
          } catch (error) {
            // Don't fail if we can't parse VM info
            resolve();
          }
        });

        this.socket!.write(versionCommand);
      });
    } catch (error) {
      // Don't fail if we can't get VM information
      console.warn('Failed to get VM information:', error);
    }
  }

  /**
   * Builds a JDWP command packet
   */
  private buildJDWPCommand(commandSet: number, command: number): Buffer {
    // Simplified JDWP command structure
    const buffer = Buffer.alloc(11);
    buffer.writeUInt32BE(11, 0); // length
    buffer.writeUInt32BE(1, 4);  // id
    buffer.writeUInt8(0, 8);     // flags
    buffer.writeUInt8(commandSet, 9);
    buffer.writeUInt8(command, 10);
    return buffer;
  }

  /**
   * Parses VM version response (simplified)
   */
  private parseVMVersionResponse(_data: Buffer): { version: string; name: string } {
    // This is a very simplified parser - real JDWP parsing is much more complex
    try {
      // const response = data.toString('utf8', 11); // Skip header
      return {
        version: 'Unknown',
        name: 'Java VM'
      };
    } catch (error) {
      return {
        version: 'Unknown',
        name: 'Java VM'
      };
    }
  }

  /**
   * Cleanup resources
   */
  private cleanup(): void {
    if (this.socket) {
      this.socket.destroy();
      this.socket = null;
    }
  }

  /**
   * Delay utility
   */
  private delay(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms));
  }

  /**
   * Static method to quickly validate a JDWP connection
   */
  static async quickValidate(host: string, port: number): Promise<boolean> {
    const validator = new JDWPValidator(host, port, {
      timeout: 5000,
      retryAttempts: 1,
      validateHandshake: false
    });
    
    try {
      const result = await validator.validateConnection();
      return result.connected;
    } catch (error) {
      return false;
    }
  }

  /**
   * Static method to perform full JDWP validation
   */
  static async fullValidate(host: string, port: number): Promise<JDWPConnectionInfo> {
    const validator = new JDWPValidator(host, port, {
      timeout: 10000,
      retryAttempts: 3,
      retryDelay: 1000,
      validateHandshake: true
    });
    
    return validator.validateConnection();
  }
}

/**
 * Utility function to scan for active JDWP agents
 */
export async function scanForJDWPAgents(portRange: { start: number; end: number } = { start: 5000, end: 9999 }): Promise<JDWPConnectionInfo[]> {
  const activeAgents: JDWPConnectionInfo[] = [];
  const commonPorts = [5005, 8000, 8080, 9999]; // Common debug ports

  // First check common ports
  for (const port of commonPorts) {
    if (port >= portRange.start && port <= portRange.end) {
      try {
        const isActive = await JDWPValidator.quickValidate('localhost', port);
        if (isActive) {
          const fullInfo = await JDWPValidator.fullValidate('localhost', port);
          activeAgents.push(fullInfo);
        }
      } catch (error) {
        // Port might be in use but not accessible for new connections
        // This is common when a debug agent already has a client connected
        console.warn(`Port ${port} detected but not accessible for new connections`);

        // Still add it to the list as "detected but occupied"
        activeAgents.push({
          host: 'localhost',
          port: port,
          connected: false,
          handshakeSuccessful: false,
          error: 'Port in use by existing debug session'
        });
      }
    }
  }

  return activeAgents;
}

/**
 * Health monitor for JDWP connections
 */
export class JDWPHealthMonitor extends EventEmitter {
  private connections: Map<string, JDWPValidator> = new Map();
  private monitorInterval: NodeJS.Timeout | null = null;
  private isMonitoring = false;

  /**
   * Starts monitoring JDWP connections
   */
  startMonitoring(connections: Array<{ host: string; port: number }>, intervalMs = 30000): void {
    if (this.isMonitoring) {
      this.stopMonitoring();
    }

    this.isMonitoring = true;
    
    // Initialize validators
    for (const conn of connections) {
      const key = `${conn.host}:${conn.port}`;
      this.connections.set(key, new JDWPValidator(conn.host, conn.port));
    }

    // Start monitoring
    this.monitorInterval = setInterval(async () => {
      await this.checkAllConnections();
    }, intervalMs);

    this.emit('monitoring-started', { connections: connections.length });
  }

  /**
   * Stops monitoring
   */
  stopMonitoring(): void {
    if (this.monitorInterval) {
      clearInterval(this.monitorInterval);
      this.monitorInterval = null;
    }
    
    this.connections.clear();
    this.isMonitoring = false;
    this.emit('monitoring-stopped');
  }

  /**
   * Checks all monitored connections
   */
  private async checkAllConnections(): Promise<void> {
    const results: Array<{ key: string; status: JDWPConnectionInfo }> = [];
    
    for (const [key, validator] of this.connections) {
      try {
        const status = await validator.validateConnection();
        results.push({ key, status });
        
        if (!status.connected) {
          this.emit('connection-lost', { key, status });
        }
      } catch (error) {
        this.emit('connection-error', { key, error });
      }
    }
    
    this.emit('health-check', results);
  }
}
