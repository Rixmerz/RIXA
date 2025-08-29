import { DotNetDebugger } from './dotnet-debugger.js';
import type { Logger } from '../utils/logger.js';
import type { DotNetDebuggerConfig } from './types.js';

export class HotReloadSupport extends DotNetDebugger {
  constructor(config: DotNetDebuggerConfig, logger: Logger) {
    super(config, logger);
  }

  async enableHotReload(): Promise<void> {
    // Enable .NET Hot Reload
    const expression = `
      System.Environment.SetEnvironmentVariable("DOTNET_WATCH_RESTART_ON_RUDE_EDIT", "true");
      System.Environment.SetEnvironmentVariable("DOTNET_USE_POLLING_FILE_WATCHER", "true");
    `;
    
    await this.evaluate(expression);
  }

  async applyCodeChanges(changes: any[]): Promise<void> {
    if (!this.dapClient || !this.isConnected) {
      throw new Error('Debugger not connected');
    }

    // Apply hot reload changes
    const request = {
      command: 'hotReload',
      arguments: {
        changes: changes
      }
    };
    
    await this.dapClient.sendRequest(request.command, request.arguments);
  }

  async getHotReloadCapabilities(): Promise<any> {
    // Check what hot reload operations are supported
    const expression = `
      System.Reflection.Metadata.MetadataUpdater.GetCapabilities()
    `;
    
    return await this.evaluate(expression);
  }
}