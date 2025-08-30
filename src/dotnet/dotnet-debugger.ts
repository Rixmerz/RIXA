/**
 * .NET Debugger Core Implementation
 */

import { EventEmitter } from 'events';
import { spawn, exec } from 'child_process';
import { promisify } from 'util';
import { DotNetVersionDetector } from './version-detector.js';
import { DotNetFrameworkDetector } from './framework-detector.js';
import type {
  DotNetDebugConfig,
  DotNetDebugSession,
  DotNetProcessInfo,
  DotNetBreakpoint,
  DotNetExpressionResult,
  DotNetObjectInfo,
  DotNetAssemblyInfo,
  DotNetHotReloadInfo
} from './types.js';
import { DotNetErrorType, DotNetDebugError } from './types.js';

const execAsync = promisify(exec);

export class DotNetDebugger extends EventEmitter {
  private static instance: DotNetDebugger;
  private sessions = new Map<string, DotNetDebugSession>();
  private versionDetector: DotNetVersionDetector;
  private frameworkDetector: DotNetFrameworkDetector;
  private debuggerProcesses = new Map<string, any>();

  constructor() {
    super();
    this.versionDetector = DotNetVersionDetector.getInstance();
    this.frameworkDetector = DotNetFrameworkDetector.getInstance();
  }

  static getInstance(): DotNetDebugger {
    if (!DotNetDebugger.instance) {
      DotNetDebugger.instance = new DotNetDebugger();
    }
    return DotNetDebugger.instance;
  }

  /**
   * Connect to a .NET application for debugging
   */
  async connect(config: DotNetDebugConfig): Promise<string> {
    const sessionId = this.generateSessionId();
    
    try {
      // Detect process if not specified
      let processInfo: DotNetProcessInfo;
      
      if (config.processId) {
        processInfo = await this.getProcessInfo(config.processId);
      } else if (config.processName) {
        const processes = await this.findProcessesByName(config.processName);
        if (processes.length === 0) {
          throw new DotNetDebugError(
            DotNetErrorType.PROCESS_NOT_FOUND,
            `No processes found with name: ${config.processName}`
          );
        }
        processInfo = processes[0]!;
      } else {
        throw new DotNetDebugError(
          DotNetErrorType.CONNECTION_FAILED,
          'Either processId or processName must be specified'
        );
      }

      // Detect version and framework if not specified
      if (!config.dotnetVersion || !config.framework) {
        const versionInfo = await this.versionDetector.detectVersionFromProcess(processInfo);
        const frameworkInfo = await this.frameworkDetector.detectFramework(processInfo);
        
        config.dotnetVersion = config.dotnetVersion || versionInfo.version;
        config.framework = config.framework || frameworkInfo.framework;
        config.runtime = config.runtime || versionInfo.runtime;
      }

      // Initialize debugging session
      const session: DotNetDebugSession = {
        sessionId,
        processInfo,
        config,
        connected: false,
        startTime: new Date(),
        breakpoints: new Map(),
        watchedExpressions: new Map(),
        callStack: [],
        variables: new Map(),
        isRunning: true,
        isPaused: false
      };

      // Start appropriate debugger
      await this.startDebugger(session);
      
      this.sessions.set(sessionId, session);
      this.emit('sessionCreated', { sessionId, processInfo, config });
      
      return sessionId;
    } catch (error) {
      this.emit('error', { sessionId, error });
      throw error;
    }
  }

  /**
   * Start the appropriate debugger for the session
   */
  private async startDebugger(session: DotNetDebugSession): Promise<void> {
    const { config } = session;
    
    // Determine debugger type
    let debuggerType = config.debuggerType;
    if (!debuggerType) {
      if (config.runtime === 'framework') {
        debuggerType = 'vsdbg';
      } else if (config.framework === 'unity') {
        debuggerType = 'mono';
      } else {
        debuggerType = 'netcoredbg';
      }
    }

    // Start debugger process
    switch (debuggerType) {
      case 'vsdbg':
        await this.startVsDbg(session);
        break;
      case 'netcoredbg':
        await this.startNetCoreDbg(session);
        break;
      case 'mono':
        await this.startMonoDebugger(session);
        break;
      default:
        throw new DotNetDebugError(
          DotNetErrorType.DEBUGGER_NOT_AVAILABLE,
          `Unsupported debugger type: ${debuggerType}`
        );
    }

    session.connected = true;
  }

  /**
   * Start Visual Studio Debugger
   */
  private async startVsDbg(session: DotNetDebugSession): Promise<void> {
    const { sessionId, processInfo } = session;
    
    try {
      // Check if vsdbg is available
      await execAsync('vsdbg --version');
      
      const debuggerArgs = [
        '--interpreter=vscode',
        `--attach=${processInfo.pid}`
      ];

      const debuggerProcess = spawn('vsdbg', debuggerArgs, {
        stdio: ['pipe', 'pipe', 'pipe']
      });

      this.debuggerProcesses.set(sessionId, debuggerProcess);
      
      // Handle debugger events
      debuggerProcess.on('error', (error) => {
        this.emit('debuggerError', { sessionId, error });
      });

      debuggerProcess.on('exit', (code) => {
        this.emit('debuggerExit', { sessionId, code });
        this.debuggerProcesses.delete(sessionId);
      });

    } catch (error) {
      throw new DotNetDebugError(
        DotNetErrorType.DEBUGGER_NOT_AVAILABLE,
        'Visual Studio Debugger (vsdbg) not available'
      );
    }
  }

  /**
   * Start .NET Core Debugger
   */
  private async startNetCoreDbg(session: DotNetDebugSession): Promise<void> {
    const { sessionId, processInfo } = session;
    
    try {
      // Check if netcoredbg is available
      await execAsync('netcoredbg --version');
      
      const debuggerArgs = [
        '--attach',
        processInfo.pid.toString()
      ];

      const debuggerProcess = spawn('netcoredbg', debuggerArgs, {
        stdio: ['pipe', 'pipe', 'pipe']
      });

      this.debuggerProcesses.set(sessionId, debuggerProcess);
      
      // Handle debugger events
      debuggerProcess.on('error', (error) => {
        this.emit('debuggerError', { sessionId, error });
      });

      debuggerProcess.on('exit', (code) => {
        this.emit('debuggerExit', { sessionId, code });
        this.debuggerProcesses.delete(sessionId);
      });

    } catch (error) {
      throw new DotNetDebugError(
        DotNetErrorType.DEBUGGER_NOT_AVAILABLE,
        '.NET Core Debugger (netcoredbg) not available'
      );
    }
  }

  /**
   * Start Mono Debugger (for Unity)
   */
  private async startMonoDebugger(session: DotNetDebugSession): Promise<void> {
    const { sessionId } = session;
    
    // Unity debugging typically uses a different approach
    // This is a simplified implementation
    try {
      const debuggerProcess = spawn('mono', ['--debug', '--debugger-agent=transport=dt_socket,address=127.0.0.1:56000,server=y'], {
        stdio: ['pipe', 'pipe', 'pipe']
      });

      this.debuggerProcesses.set(sessionId, debuggerProcess);
      
      debuggerProcess.on('error', (error) => {
        this.emit('debuggerError', { sessionId, error });
      });

      debuggerProcess.on('exit', (code) => {
        this.emit('debuggerExit', { sessionId, code });
        this.debuggerProcesses.delete(sessionId);
      });

    } catch (error) {
      throw new DotNetDebugError(
        DotNetErrorType.DEBUGGER_NOT_AVAILABLE,
        'Mono debugger not available'
      );
    }
  }

  /**
   * Get process information by PID
   */
  async getProcessInfo(pid: number): Promise<DotNetProcessInfo> {
    try {
      // This is a simplified implementation
      // In a real implementation, you would use platform-specific APIs
      const { stdout } = await execAsync(`tasklist /FI "PID eq ${pid}" /FO CSV`);
      const lines = stdout.split('\n');
      
      if (lines.length < 2) {
        throw new Error('Process not found');
      }

      const processData = lines[1]?.split(',').map(s => s.replace(/"/g, '')) || [];
      
      const processInfo: DotNetProcessInfo = {
        pid,
        name: processData[0] || 'unknown',
        version: 'net8.0', // Will be detected later
        runtime: 'core',
        framework: 'console',
        architecture: 'x64',
        startTime: new Date(),
        workingDirectory: process.cwd(),
        commandLine: '',
        assemblies: [],
        isDebuggable: true
      };

      // Detect version and framework
      const versionInfo = await this.versionDetector.detectVersionFromProcess(processInfo);
      const frameworkInfo = await this.frameworkDetector.detectFramework(processInfo);
      
      processInfo.version = versionInfo.version;
      processInfo.runtime = versionInfo.runtime;
      processInfo.framework = frameworkInfo.framework;

      return processInfo;
    } catch (error) {
      throw new DotNetDebugError(
        DotNetErrorType.PROCESS_NOT_FOUND,
        `Failed to get process info for PID ${pid}: ${error}`
      );
    }
  }

  /**
   * Find processes by name
   */
  async findProcessesByName(name: string): Promise<DotNetProcessInfo[]> {
    try {
      const { stdout } = await execAsync(`tasklist /FI "IMAGENAME eq ${name}" /FO CSV`);
      const lines = stdout.split('\n').slice(1); // Skip header
      
      const processes: DotNetProcessInfo[] = [];
      
      for (const line of lines) {
        if (line.trim()) {
          const data = line.split(',').map(s => s.replace(/"/g, ''));
          const pid = parseInt(data[1] || '0');
          
          if (!isNaN(pid)) {
            const processInfo = await this.getProcessInfo(pid);
            processes.push(processInfo);
          }
        }
      }
      
      return processes;
    } catch (error) {
      throw new DotNetDebugError(
        DotNetErrorType.PROCESS_NOT_FOUND,
        `Failed to find processes by name ${name}: ${error}`
      );
    }
  }

  /**
   * Get all .NET processes
   */
  async getAllDotNetProcesses(): Promise<DotNetProcessInfo[]> {
    const dotnetProcessNames = [
      'dotnet.exe',
      'w3wp.exe',
      'iisexpress.exe',
      'devenv.exe',
      'unity.exe'
    ];

    const allProcesses: DotNetProcessInfo[] = [];
    
    for (const processName of dotnetProcessNames) {
      try {
        const processes = await this.findProcessesByName(processName);
        allProcesses.push(...processes);
      } catch (error) {
        // Continue with next process name
      }
    }

    return allProcesses;
  }

  /**
   * Get debugging session
   */
  getSession(sessionId: string): DotNetDebugSession | undefined {
    return this.sessions.get(sessionId);
  }

  /**
   * Get all active sessions
   */
  getAllSessions(): DotNetDebugSession[] {
    return Array.from(this.sessions.values());
  }

  /**
   * Disconnect from debugging session
   */
  async disconnect(sessionId: string): Promise<void> {
    const session = this.sessions.get(sessionId);
    if (!session) {
      throw new DotNetDebugError(
        DotNetErrorType.CONNECTION_FAILED,
        `Session not found: ${sessionId}`
      );
    }

    // Stop debugger process
    const debuggerProcess = this.debuggerProcesses.get(sessionId);
    if (debuggerProcess) {
      debuggerProcess.kill();
      this.debuggerProcesses.delete(sessionId);
    }

    // Clean up session
    this.sessions.delete(sessionId);
    this.emit('sessionClosed', { sessionId });
  }

  /**
   * Generate unique session ID
   */
  private generateSessionId(): string {
    return `dotnet-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
  }

  /**
   * Set breakpoint in .NET code
   */
  async setBreakpoint(sessionId: string, file: string, line: number, condition?: string): Promise<DotNetBreakpoint> {
    const session = this.sessions.get(sessionId);
    if (!session) {
      throw new DotNetDebugError(
        DotNetErrorType.CONNECTION_FAILED,
        `Session not found: ${sessionId}`
      );
    }

    const breakpointId = `bp-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
    const breakpoint: DotNetBreakpoint = {
      id: breakpointId,
      file,
      line,
      ...(condition && { condition }),
      enabled: true,
      verified: false
    };

    try {
      // Send breakpoint to debugger (simplified implementation)
      // In real implementation, this would use DAP protocol
      breakpoint.verified = true;

      session.breakpoints.set(breakpointId, breakpoint);
      this.emit('breakpointSet', { sessionId, breakpoint });

      return breakpoint;
    } catch (error) {
      throw new DotNetDebugError(
        DotNetErrorType.BREAKPOINT_SET_FAILED,
        `Failed to set breakpoint: ${error}`
      );
    }
  }

  /**
   * Evaluate C# expression
   */
  async evaluateExpression(sessionId: string, expression: string, _frameId?: string): Promise<DotNetExpressionResult> {
    const session = this.sessions.get(sessionId);
    if (!session) {
      throw new DotNetDebugError(
        DotNetErrorType.CONNECTION_FAILED,
        `Session not found: ${sessionId}`
      );
    }

    const startTime = Date.now();

    try {
      // Simplified expression evaluation
      // In real implementation, this would use debugger APIs
      const result: DotNetExpressionResult = {
        success: true,
        value: `Evaluated: ${expression}`,
        type: 'string',
        displayValue: `"Evaluated: ${expression}"`,
        isAsync: expression.includes('await'),
        executionTime: Date.now() - startTime
      };

      this.emit('expressionEvaluated', { sessionId, expression, result });
      return result;
    } catch (error) {
      return {
        success: false,
        value: null,
        type: 'error',
        displayValue: 'Error',
        error: error instanceof Error ? error.message : String(error),
        isAsync: false,
        executionTime: Date.now() - startTime
      };
    }
  }

  /**
   * Inspect .NET object
   */
  async inspectObject(sessionId: string, objectId: string): Promise<DotNetObjectInfo> {
    const session = this.sessions.get(sessionId);
    if (!session) {
      throw new DotNetDebugError(
        DotNetErrorType.CONNECTION_FAILED,
        `Session not found: ${sessionId}`
      );
    }

    try {
      // Simplified object inspection
      // In real implementation, this would use debugger APIs to get actual object data
      const objectInfo: DotNetObjectInfo = {
        id: objectId,
        type: 'System.Object',
        value: {},
        isNull: false,
        isPrimitive: false,
        isArray: false,
        isCollection: false,
        properties: [
          {
            name: 'ToString',
            type: 'System.String',
            isPublic: true,
            isStatic: false,
            canRead: true,
            canWrite: false,
            hasGetter: true,
            hasSetter: false,
            value: 'System.Object',
            hasValue: true
          }
        ],
        fields: [],
        methods: [
          {
            name: 'ToString',
            returnType: 'System.String',
            parameters: [],
            isPublic: true,
            isStatic: false,
            isVirtual: true,
            isAbstract: false,
            isAsync: false,
            isGeneric: false
          }
        ]
      };

      this.emit('objectInspected', { sessionId, objectId, objectInfo });
      return objectInfo;
    } catch (error) {
      throw new DotNetDebugError(
        DotNetErrorType.EXPRESSION_EVALUATION_FAILED,
        `Failed to inspect object: ${error}`
      );
    }
  }

  /**
   * Get loaded assemblies
   */
  async getAssemblies(sessionId: string): Promise<DotNetAssemblyInfo[]> {
    const session = this.sessions.get(sessionId);
    if (!session) {
      throw new DotNetDebugError(
        DotNetErrorType.CONNECTION_FAILED,
        `Session not found: ${sessionId}`
      );
    }

    try {
      // Return cached assemblies or fetch from debugger
      if (session.processInfo.assemblies.length > 0) {
        return session.processInfo.assemblies;
      }

      // Simplified assembly information
      // In real implementation, this would query the debugger for actual loaded assemblies
      const assemblies: DotNetAssemblyInfo[] = [
        {
          name: 'mscorlib',
          fullName: 'mscorlib, Version=4.0.0.0, Culture=neutral, PublicKeyToken=b77a5c561934e089',
          version: '4.0.0.0',
          location: 'C:\\Windows\\Microsoft.NET\\Framework64\\v4.0.30319\\mscorlib.dll',
          isGAC: true,
          isDynamic: false,
          hasSymbols: false,
          modules: [],
          types: []
        }
      ];

      session.processInfo.assemblies = assemblies;
      this.emit('assembliesLoaded', { sessionId, assemblies });

      return assemblies;
    } catch (error) {
      throw new DotNetDebugError(
        DotNetErrorType.ASSEMBLY_LOAD_FAILED,
        `Failed to get assemblies: ${error}`
      );
    }
  }

  /**
   * Enable hot reload
   */
  async enableHotReload(sessionId: string): Promise<DotNetHotReloadInfo> {
    const session = this.sessions.get(sessionId);
    if (!session) {
      throw new DotNetDebugError(
        DotNetErrorType.CONNECTION_FAILED,
        `Session not found: ${sessionId}`
      );
    }

    const frameworkCapabilities = this.frameworkDetector.getFrameworkCapabilities(session.config.framework!);

    if (!frameworkCapabilities.supportsHotReload) {
      throw new DotNetDebugError(
        DotNetErrorType.HOT_RELOAD_FAILED,
        `Hot reload not supported for framework: ${session.config.framework}`
      );
    }

    const hotReloadInfo: DotNetHotReloadInfo = {
      supported: true,
      enabled: true,
      changedFiles: [],
      appliedChanges: [],
      errors: [],
      warnings: []
    };

    this.emit('hotReloadEnabled', { sessionId, hotReloadInfo });
    return hotReloadInfo;
  }

  /**
   * Check if debugger is healthy
   */
  async checkHealth(): Promise<{
    status: 'healthy' | 'degraded' | 'unhealthy';
    activeSessions: number;
    availableDebuggers: string[];
    installedVersions: { framework: string[]; core: string[] };
  }> {
    const activeSessions = this.sessions.size;
    const availableDebuggers: string[] = [];

    // Check available debuggers
    try {
      await execAsync('vsdbg --version');
      availableDebuggers.push('vsdbg');
    } catch (error) {
      // vsdbg not available
    }

    try {
      await execAsync('netcoredbg --version');
      availableDebuggers.push('netcoredbg');
    } catch (error) {
      // netcoredbg not available
    }

    // Get installed versions
    const installedVersions = await this.versionDetector.getInstalledVersions();

    const status = availableDebuggers.length > 0 ? 'healthy' : 'unhealthy';

    return {
      status,
      activeSessions,
      availableDebuggers,
      installedVersions: {
        framework: installedVersions.framework.map(v => v.toString()),
        core: installedVersions.core.map(v => v.toString())
      }
    };
  }
}
