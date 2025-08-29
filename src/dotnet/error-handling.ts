import { exec } from 'child_process';
import { promisify } from 'util';
import * as net from 'net';
import type { DotNetDebuggerConfig } from './types.js';

const execAsync = promisify(exec);

/**
 * Handles connection errors and implements recovery mechanisms for .NET debugging
 */
export class ConnectionErrorHandler {
  /**
   * Handle connection errors and attempt recovery
   */
  async handleConnectionError(error: Error, config: DotNetDebuggerConfig): Promise<void> {
    if (error.message.includes('vsdbg not found')) {
      // Try to download vsdbg
      await this.downloadVsDbg();
      
      // If that fails, try netcoredbg
      if (!await this.tryNetCoreDbg(config)) {
        throw new Error('No .NET debugger available. Please install vsdbg or netcoredbg.');
      }
    } else if (error.message.includes('port in use')) {
      // Suggest alternative port
      const alternativePort = await this.findFreePort(config.port);
      throw new Error(`Port ${config.port} is in use. Try port ${alternativePort}.`);
    } else if (error.message.includes('timeout')) {
      // Increase timeout and retry
      config.timeout = (config.timeout || 30000) * 2;
      throw new Error('Connection timeout. Retrying with increased timeout.');
    }
  }

  /**
   * Attempt to download vsdbg debugger
   */
  private async downloadVsDbg(): Promise<boolean> {
    try {
      // Check if vsdbg-ui is available
      await execAsync('vsdbg-ui --version');
      return true;
    } catch {
      try {
        // Try downloading with curl/wget if available
        const command = process.platform === 'win32'
          ? 'powershell -Command "Invoke-WebRequest -Uri https://aka.ms/getvsdbgsh -OutFile vsdbg.sh"'
          : 'curl -sSL https://aka.ms/getvsdbgsh | bash /dev/stdin -v latest -l ~/vsdbg';
        
        await execAsync(command);
        return true;
      } catch {
        return false;
      }
    }
  }

  /**
   * Try using netcoredbg as fallback
   */
  private async tryNetCoreDbg(config: DotNetDebuggerConfig): Promise<boolean> {
    try {
      await execAsync('netcoredbg --version');
      config.adapter = 'netcoredbg';
      return true;
    } catch {
      return false;
    }
  }

  /**
   * Find an available port starting from the given port
   */
  private async findFreePort(startPort: number): Promise<number> {
    for (let port = startPort + 1; port <= startPort + 100; port++) {
      if (await this.isPortFree(port)) {
        return port;
      }
    }
    throw new Error('No free ports available');
  }

  /**
   * Check if a port is free
   */
  private isPortFree(port: number): Promise<boolean> {
    return new Promise((resolve) => {
      const server = net.createServer();
      server.listen(port, () => {
        server.once('close', () => resolve(true));
        server.close();
      });
      server.on('error', () => resolve(false));
    });
  }
}

/**
 * Implements adapter fallback strategy for .NET debugging
 */
export class AdapterFallback {
  /**
   * Select the best available adapter from the fallback chain
   */
  async selectAdapter(preferred: string): Promise<string> {
    const adapters = ['vsdbg', 'netcoredbg'];
    
    for (const adapter of adapters) {
      if (await this.isAdapterAvailable(adapter)) {
        if (adapter !== preferred) {
          console.warn(`Preferred adapter ${preferred} not available, using ${adapter}`);
        }
        return adapter;
      }
    }
    
    throw new Error('No .NET debug adapter available');
  }

  /**
   * Check if an adapter is available on the system
   */
  private async isAdapterAvailable(adapter: string): Promise<boolean> {
    try {
      const command = adapter === 'vsdbg' 
        ? 'vsdbg --version' 
        : 'netcoredbg --version';
      
      await execAsync(command);
      return true;
    } catch {
      return false;
    }
  }
}