import { execSync } from 'child_process';
import { EventEmitter } from 'events';
import { JDWPValidator } from './jdwp-validator.js';
// import type { JDWPConnectionInfo } from './jdwp-validator.js';

/**
 * Advanced Port Manager
 * Centralized port detection and management for Java debugging
 */

export interface PortInfo {
  port: number;
  status: 'free' | 'occupied' | 'debug_agent' | 'unknown';
  process?: {
    pid: number;
    name: string;
    command: string;
  };
  debugInfo?: {
    isJDWP: boolean;
    hasActiveClient: boolean;
    vmInfo?: string | undefined;
    connectionCount: number;
  };
  lastChecked: Date;
}

export interface PortScanOptions {
  portRange: { start: number; end: number };
  includeSystemPorts: boolean;
  deepScan: boolean;
  timeout: number;
}

export interface PortConflictResolution {
  action: 'disconnect_existing' | 'use_alternative' | 'observe_mode' | 'force_connect';
  alternativePort?: number;
  requiresConfirmation: boolean;
  riskLevel: 'low' | 'medium' | 'high';
  description: string;
}

/**
 * Advanced Port Manager Class
 */
export class PortManager extends EventEmitter {
  private portCache: Map<number, PortInfo> = new Map();
  private scanInterval: NodeJS.Timeout | null = null;
  private isScanning = false;

  constructor() {
    super();
  }

  /**
   * Comprehensive port scan with detailed information
   */
  async scanPorts(options: Partial<PortScanOptions> = {}): Promise<PortInfo[]> {
    const opts: PortScanOptions = {
      portRange: { start: 5000, end: 9999 },
      includeSystemPorts: false,
      deepScan: true,
      timeout: 5000,
      ...options
    };

    this.isScanning = true;
    this.emit('scan-started', opts);

    const ports: PortInfo[] = [];
    const commonDebugPorts = [5005, 8000, 8080, 9999, 5006, 5007, 5008];

    try {
      // First, get all listening ports from the system
      const listeningPorts = await this.getListeningPorts();
      
      // Scan common debug ports first
      for (const port of commonDebugPorts) {
        if (port >= opts.portRange.start && port <= opts.portRange.end) {
          const portInfo = await this.analyzePort(port, opts.deepScan);
          ports.push(portInfo);
          this.portCache.set(port, portInfo);
        }
      }

      // Scan other listening ports in range
      for (const listeningPort of listeningPorts) {
        if (listeningPort >= opts.portRange.start && 
            listeningPort <= opts.portRange.end &&
            !commonDebugPorts.includes(listeningPort)) {
          const portInfo = await this.analyzePort(listeningPort, opts.deepScan);
          ports.push(portInfo);
          this.portCache.set(listeningPort, portInfo);
        }
      }

      this.emit('scan-completed', { ports: ports.length, debugAgents: ports.filter(p => p.status === 'debug_agent').length });
      return ports.sort((a, b) => a.port - b.port);

    } catch (error) {
      this.emit('scan-error', error);
      throw error;
    } finally {
      this.isScanning = false;
    }
  }

  /**
   * Get all listening ports from the system with enhanced detection
   */
  private async getListeningPorts(): Promise<number[]> {
    try {
      // Get both LISTEN and ESTABLISHED connections for comprehensive detection
      const listenResult = execSync('lsof -i -P -n | grep LISTEN', {
        encoding: 'utf-8',
        timeout: 5000
      });

      const establishedResult = execSync('lsof -i -P -n | grep ESTABLISHED', {
        encoding: 'utf-8',
        timeout: 5000
      });

      const ports: number[] = [];
      const allLines = [...listenResult.split('\n'), ...establishedResult.split('\n')];

      for (const line of allLines) {
        // Match both LISTEN and ESTABLISHED patterns
        const listenMatch = line.match(/:(\d+)\s+\(LISTEN\)/);
        const establishedMatch = line.match(/:(\d+)->/);

        if (listenMatch && listenMatch[1]) {
          const port = parseInt(listenMatch[1]);
          if (port > 1024) {
            ports.push(port);
          }
        }

        if (establishedMatch && establishedMatch[1]) {
          const port = parseInt(establishedMatch[1]);
          if (port > 1024) {
            ports.push(port);
          }
        }
      }

      return [...new Set(ports)]; // Remove duplicates
    } catch (error) {
      console.warn('Failed to get listening ports:', error);
      return [];
    }
  }

  /**
   * Analyze a specific port in detail
   */
  async analyzePort(port: number, deepScan: boolean): Promise<PortInfo> {
    const portInfo: PortInfo = {
      port,
      status: 'unknown',
      lastChecked: new Date()
    };

    try {
      // First check if port is actually in use (comprehensive check)
      const inUse = await this.isPortInUse(port);

      if (inUse) {
        // Get detailed process information
        const processInfo = await this.getPortProcessInfo(port);
        if (processInfo) {
          portInfo.process = processInfo;
          portInfo.status = 'occupied';

          // Check if it's a Java process (potential debug agent)
          if (processInfo.command.includes('java') || processInfo.name === 'java') {
            if (deepScan) {
              const debugInfo = await this.analyzeJavaProcess(port);
              if (debugInfo.isJDWP) {
                portInfo.status = 'debug_agent';
                portInfo.debugInfo = debugInfo;
              }
            } else {
              portInfo.status = 'debug_agent'; // Assume it's a debug agent
            }
          }
        } else {
          // Port is in use but we couldn't get process info
          portInfo.status = 'occupied';
        }
      } else {
        portInfo.status = 'free';
      }

    } catch (error) {
      portInfo.status = 'unknown';
    }

    return portInfo;
  }

  /**
   * Get process information for a specific port with enhanced detection
   */
  private async getPortProcessInfo(port: number): Promise<{ pid: number; name: string; command: string } | null> {
    try {
      const result = execSync(`lsof -i :${port} -P -n`, {
        encoding: 'utf-8',
        timeout: 3000
      });

      const lines = result.split('\n');

      // First, look for LISTEN connections (servers)
      for (const line of lines) {
        if (line.includes('LISTEN')) {
          const parts = line.split(/\s+/);
          if (parts.length >= 2) {
            return {
              pid: parts[1] ? parseInt(parts[1]) : 0,
              name: parts[0] || 'unknown',
              command: line
            };
          }
        }
      }

      // If no LISTEN found, look for ESTABLISHED connections
      for (const line of lines) {
        if (line.includes('ESTABLISHED')) {
          const parts = line.split(/\s+/);
          if (parts.length >= 2) {
            return {
              pid: parts[1] ? parseInt(parts[1]) : 0,
              name: parts[0] || 'unknown',
              command: line
            };
          }
        }
      }

      // If no specific state found, take the first valid line
      for (const line of lines) {
        if (line.trim() && !line.startsWith('COMMAND')) {
          const parts = line.split(/\s+/);
          if (parts.length >= 2) {
            return {
              pid: parts[1] ? parseInt(parts[1]) : 0,
              name: parts[0] || 'unknown',
              command: line
            };
          }
        }
      }

      return null;
    } catch (error) {
      return null;
    }
  }

  /**
   * Analyze if a Java process is a JDWP debug agent
   */
  private async analyzeJavaProcess(port: number): Promise<{
    isJDWP: boolean;
    hasActiveClient: boolean;
    vmInfo?: string | undefined;
    connectionCount: number;
  }> {
    const debugInfo: {
      isJDWP: boolean;
      hasActiveClient: boolean;
      vmInfo?: string | undefined;
      connectionCount: number;
    } = {
      isJDWP: false,
      hasActiveClient: false,
      connectionCount: 0
    };

    try {
      // Try to validate JDWP connection
      const validator = new JDWPValidator('localhost', port, { 
        timeout: 3000, 
        retryAttempts: 1,
        validateHandshake: true 
      });
      
      const connectionInfo = await validator.validateConnection();
      
      if (connectionInfo.connected) {
        debugInfo.isJDWP = true;
        debugInfo.hasActiveClient = false; // We could connect, so no active client
        debugInfo.vmInfo = connectionInfo.vmName || undefined;
      } else if (connectionInfo.error?.includes('Connection refused')) {
        debugInfo.isJDWP = false;
      } else {
        // Connection failed but port is listening - likely has active client
        debugInfo.isJDWP = true;
        debugInfo.hasActiveClient = true;
      }

      // Count connections to this port
      debugInfo.connectionCount = await this.countPortConnections(port);

    } catch (error) {
      // If we can't connect, it might still be JDWP with an active client
      debugInfo.isJDWP = true;
      debugInfo.hasActiveClient = true;
      debugInfo.connectionCount = await this.countPortConnections(port);
    }

    return debugInfo;
  }

  /**
   * Count active connections to a port
   */
  private async countPortConnections(port: number): Promise<number> {
    try {
      const result = execSync(`lsof -i :${port} -P -n`, {
        encoding: 'utf-8',
        timeout: 3000
      });

      const lines = result.split('\n');
      return lines.filter(line => line.includes('ESTABLISHED')).length;
    } catch (error) {
      return 0;
    }
  }

  /**
   * Check if port is actually in use (more comprehensive than just LISTEN)
   */
  private async isPortInUse(port: number): Promise<boolean> {
    try {
      const result = execSync(`lsof -i :${port} -P -n`, {
        encoding: 'utf-8',
        timeout: 3000
      });

      // Port is in use if there are any connections (LISTEN, ESTABLISHED, etc.)
      const lines = result.split('\n').filter(line =>
        line.trim() &&
        !line.startsWith('COMMAND') &&
        line.includes(`:${port}`)
      );

      return lines.length > 0;
    } catch (error) {
      // If lsof fails, the port is likely not in use
      return false;
    }
  }

  /**
   * Find available debug ports
   */
  async findAvailableDebugPorts(count: number = 3): Promise<number[]> {
    const availablePorts: number[] = [];
    const startPort = 5005;
    
    for (let port = startPort; port < startPort + 100 && availablePorts.length < count; port++) {
      const portInfo = await this.analyzePort(port, false);
      if (portInfo.status === 'free') {
        availablePorts.push(port);
      }
    }
    
    return availablePorts;
  }

  /**
   * Suggest resolution for port conflicts
   */
  async suggestConflictResolution(port: number): Promise<PortConflictResolution[]> {
    const portInfo = await this.analyzePort(port, true);
    const resolutions: PortConflictResolution[] = [];

    if (portInfo.status === 'debug_agent' && portInfo.debugInfo?.hasActiveClient) {
      // Debug agent with active client
      resolutions.push({
        action: 'observe_mode',
        requiresConfirmation: false,
        riskLevel: 'low',
        description: 'Use observation mode to monitor without interfering with existing debug session'
      });

      const alternativePorts = await this.findAvailableDebugPorts(1);
      if (alternativePorts.length > 0 && alternativePorts[0]) {
        resolutions.push({
          action: 'use_alternative',
          alternativePort: alternativePorts[0],
          requiresConfirmation: false,
          riskLevel: 'low',
          description: `Use alternative port ${alternativePorts[0]} for new debug session`
        });
      }

      resolutions.push({
        action: 'disconnect_existing',
        requiresConfirmation: true,
        riskLevel: 'high',
        description: 'Disconnect existing debug client (may interrupt ongoing debugging)'
      });

    } else if (portInfo.status === 'occupied') {
      // Port occupied by non-debug process
      const alternativePorts = await this.findAvailableDebugPorts(1);
      if (alternativePorts.length > 0 && alternativePorts[0]) {
        resolutions.push({
          action: 'use_alternative',
          alternativePort: alternativePorts[0],
          requiresConfirmation: false,
          riskLevel: 'low',
          description: `Port occupied by ${portInfo.process?.name}. Use alternative port ${alternativePorts[0]}`
        });
      }
    }

    return resolutions;
  }

  /**
   * Start continuous port monitoring
   */
  startMonitoring(intervalMs: number = 30000): void {
    if (this.scanInterval) {
      this.stopMonitoring();
    }

    this.scanInterval = setInterval(async () => {
      if (!this.isScanning) {
        try {
          await this.scanPorts({ deepScan: false });
          this.emit('monitoring-update', this.portCache);
        } catch (error) {
          this.emit('monitoring-error', error);
        }
      }
    }, intervalMs);

    this.emit('monitoring-started', { interval: intervalMs });
  }

  /**
   * Stop port monitoring
   */
  stopMonitoring(): void {
    if (this.scanInterval) {
      clearInterval(this.scanInterval);
      this.scanInterval = null;
      this.emit('monitoring-stopped');
    }
  }

  /**
   * Get cached port information
   */
  getCachedPortInfo(port: number): PortInfo | null {
    return this.portCache.get(port) || null;
  }

  /**
   * Get all cached ports
   */
  getAllCachedPorts(): PortInfo[] {
    return Array.from(this.portCache.values());
  }

  /**
   * Clear port cache
   */
  clearCache(): void {
    this.portCache.clear();
    this.emit('cache-cleared');
  }
}
