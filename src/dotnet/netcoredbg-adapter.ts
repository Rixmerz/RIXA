import { spawn } from 'child_process';
import { existsSync } from 'fs';
import { DapClient } from '../dap/client.js';
import type { Logger } from '../utils/logger.js';

export class NetCoreDbgAdapter {
  private netcoredbgPath?: string;
  private dapClient?: DapClient;
  private logger: Logger;

  constructor(logger: Logger) {
    this.logger = logger;
  }

  async initialize(): Promise<boolean> {
    // Check if netcoredbg is installed
    const path = await this.findNetCoreDbg();
    if (path) {
      this.netcoredbgPath = path;
    }
    return !!this.netcoredbgPath;
  }

  async launch(config: any): Promise<DapClient> {
    if (!this.netcoredbgPath) {
      throw new Error('netcoredbg not found');
    }

    const transportConfig = {
      type: 'stdio' as const,
      command: this.netcoredbgPath,
      args: ['--interpreter=vscode']
    };

    this.dapClient = new DapClient(
      { transport: transportConfig },
      this.logger
    );

    await this.dapClient.connect();
    
    // Initialize DAP session
    await this.dapClient.sendRequest('initialize', {
      clientID: 'rixa',
      clientName: 'RIXA',
      adapterID: 'netcoredbg',
      pathFormat: 'path',
      linesStartAt1: true,
      columnsStartAt1: true,
      supportsVariableType: true,
      supportsVariablePaging: true,
      locale: 'en-US'
    });

    // Launch or attach
    if (config.attachMode) {
      await this.dapClient.sendRequest('attach', {
        processId: config.processId
      });
    } else {
      await this.dapClient.sendRequest('launch', {
        program: config.program,
        args: config.args || [],
        cwd: config.cwd,
        env: config.env,
        console: config.console || 'internalConsole'
      });
    }

    return this.dapClient;
  }

  private async findNetCoreDbg(): Promise<string | undefined> {
    const possiblePaths = [
      '/usr/local/bin/netcoredbg',
      '/usr/bin/netcoredbg',
      'C:\\Program Files\\netcoredbg\\netcoredbg.exe',
      'C:\\netcoredbg\\netcoredbg.exe'
    ];
    
    for (const path of possiblePaths) {
      if (existsSync(path)) {
        return path;
      }
    }
    
    // Check if it's in PATH
    const which = spawn('which', ['netcoredbg']);
    return new Promise((resolve) => {
      let output = '';
      which.stdout.on('data', (data) => {
        output += data.toString();
      });
      which.on('close', (code) => {
        resolve(code === 0 ? output.trim() : undefined);
      });
    });
  }
}