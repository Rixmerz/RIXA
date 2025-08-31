import { existsSync, mkdirSync } from 'fs';
import { platform } from 'os';
import { join } from 'path';
import { execSync } from 'child_process';
import { DapClient } from '../dap/client.js';
import type { Logger } from '../utils/logger.js';

export class VsDbgAdapter {
  private vsdbgPath?: string;
  private dapClient?: DapClient;
  private logger: Logger;

  constructor(logger: Logger) {
    this.logger = logger;
  }

  async initialize(): Promise<boolean> {
    // Check if vsdbg is installed
    const foundPath = await this.findVsDbg();
    
    if (foundPath) {
      this.vsdbgPath = foundPath;
    } else {
      // Attempt to download vsdbg
      const downloadedPath = await this.downloadVsDbg();
      if (downloadedPath) {
        this.vsdbgPath = downloadedPath;
      }
    }
    
    return !!this.vsdbgPath;
  }

  async launch(config: any): Promise<DapClient> {
    if (!this.vsdbgPath) {
      throw new Error('vsdbg not found');
    }

    const transportConfig = {
      type: 'stdio' as const,
      command: this.vsdbgPath,
      args: ['--interpreter=vscode', '--engineLogging']
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
      adapterID: 'coreclr',
      pathFormat: 'path',
      linesStartAt1: true,
      columnsStartAt1: true,
      supportsVariableType: true,
      supportsVariablePaging: true,
      supportsRunInTerminalRequest: true,
      locale: 'en-US'
    });

    // Launch or attach
    if (config.attachMode) {
      await this.dapClient.sendRequest('attach', {
        processId: config.processId,
        justMyCode: config.justMyCode ?? true
      });
    } else {
      await this.dapClient.sendRequest('launch', {
        program: config.program,
        args: config.args || [],
        cwd: config.cwd,
        env: config.env,
        console: config.console || 'internalConsole',
        justMyCode: config.justMyCode ?? true,
        enableStepFiltering: true,
        requireExactSource: false
      });
    }

    return this.dapClient;
  }

  private async findVsDbg(): Promise<string | undefined> {
    const possiblePaths = this.getVsDbgPaths();
    
    for (const path of possiblePaths) {
      if (existsSync(path)) {
        return path;
      }
    }
    
    return undefined;
  }

  private getVsDbgPaths(): string[] {
    const paths: string[] = [];
    const home = process.env['HOME'] || process.env['USERPROFILE'];
    
    if (!home) return paths;

    switch (platform()) {
      case 'win32':
        paths.push(
          join(home, '.vscode', 'extensions', 'ms-dotnettools.csharp-*', '.debugger', 'vsdbg.exe'),
          join(home, '.vscode-insiders', 'extensions', 'ms-dotnettools.csharp-*', '.debugger', 'vsdbg.exe'),
          join(home, 'vsdbg', 'vsdbg.exe')
        );
        break;
      case 'darwin':
        paths.push(
          join(home, '.vscode', 'extensions', 'ms-dotnettools.csharp-*', '.debugger', 'vsdbg'),
          join(home, '.vscode-insiders', 'extensions', 'ms-dotnettools.csharp-*', '.debugger', 'vsdbg'),
          join(home, 'vsdbg', 'vsdbg')
        );
        break;
      case 'linux':
        paths.push(
          join(home, '.vscode', 'extensions', 'ms-dotnettools.csharp-*', '.debugger', 'vsdbg'),
          join(home, '.vscode-insiders', 'extensions', 'ms-dotnettools.csharp-*', '.debugger', 'vsdbg'),
          join(home, 'vsdbg', 'vsdbg')
        );
        break;
    }
    
    return paths;
  }

  private async downloadVsDbg(): Promise<string | undefined> {
    try {
      const home = process.env['HOME'] || process.env['USERPROFILE'];
      if (!home) {
        this.logger.error('Cannot determine home directory');
        return undefined;
      }

      const vsdbgDir = join(home, 'vsdbg');
      
      // Create vsdbg directory if it doesn't exist
      if (!existsSync(vsdbgDir)) {
        mkdirSync(vsdbgDir, { recursive: true });
      }

      let executablePath: string;
      let downloadScript: string;

      if (platform() === 'win32') {
        // Windows: Download and execute PowerShell script
        downloadScript = 'https://aka.ms/getvsdbgps1';
        executablePath = join(vsdbgDir, 'vsdbg.exe');
        
        this.logger.info('Downloading vsdbg for Windows...');
        execSync(`powershell -Command "& {Invoke-WebRequest -Uri '${downloadScript}' -OutFile 'GetVsDbg.ps1'; ./GetVsDbg.ps1 -Version latest -RuntimeID win7-x64 -InstallPath '${vsdbgDir.replace(/\\/g, '\\\\')}'}"`, {
          cwd: vsdbgDir,
          stdio: 'pipe'
        });
      } else {
        // Linux/macOS: Download and execute shell script
        downloadScript = 'https://aka.ms/getvsdbgsh';
        executablePath = join(vsdbgDir, 'vsdbg');
        
        const runtimeId = platform() === 'darwin' ? 'osx-x64' : 'linux-x64';
        
        this.logger.info(`Downloading vsdbg for ${platform()}...`);
        execSync(`curl -sSL "${downloadScript}" | bash /dev/stdin -v latest -r "${runtimeId}" -l "${vsdbgDir}"`, {
          cwd: vsdbgDir,
          stdio: 'pipe'
        });
      }

      // Verify the download was successful
      if (existsSync(executablePath)) {
        this.logger.info(`vsdbg successfully downloaded to: ${executablePath}`);
        return executablePath;
      } else {
        this.logger.error('vsdbg download completed but executable not found');
        return undefined;
      }

    } catch (error) {
      this.logger.error(`Failed to download vsdbg: ${error instanceof Error ? error.message : String(error)}`);
      return undefined;
    }
  }
}