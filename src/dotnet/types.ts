// Core interfaces for .NET debugging

export interface DotNetDebuggerConfig {
  host: string;
  port: number;
  projectPath?: string;
  adapter?: 'vsdbg' | 'netcoredbg' | 'auto';
  launchProfile?: string;
  targetFramework?: string;
  configuration?: 'Debug' | 'Release';
  timeout?: number;
  attachMode?: boolean;
  processId?: number;
  enableHotReload?: boolean;
}

export interface DotNetBreakpoint {
  id: string;
  file: string;
  line: number;
  column?: number;
  condition?: string;
  hitCondition?: string;
  logMessage?: string;
  verified: boolean;
  hitCount?: number;
}

export interface DotNetStackFrame {
  id: number;
  name: string;
  source: {
    name: string;
    path: string;
  };
  line: number;
  column: number;
  moduleId?: string;
  presentationHint?: 'normal' | 'label' | 'subtle';
}

export interface DotNetVariable {
  name: string;
  value: string;
  type: string;
  evaluateName?: string;
  variablesReference: number;
  namedVariables?: number;
  indexedVariables?: number;
  memoryReference?: string;
}

export interface DotNetThread {
  id: number;
  name: string;
  state: 'running' | 'stopped' | 'waiting' | 'unstarted' | 'terminated';
}

export interface DotNetException {
  id: string;
  description: string;
  breakMode: 'never' | 'always' | 'unhandled' | 'userUnhandled';
  details?: {
    message?: string;
    typeName?: string;
    fullTypeName?: string;
    evaluateName?: string;
    stackTrace?: string;
    innerException?: DotNetException;
  };
}

export interface ProjectInfo {
  name: string;
  targetFramework: string;
  outputType: 'Exe' | 'Library' | 'WinExe';
  projectFile: string;
  outputPath: string;
  assemblyName: string;
  rootNamespace: string;
  nullable?: boolean;
  implicitUsings?: boolean;
  packageReferences: Array<{
    name: string;
    version: string;
  }>;
}