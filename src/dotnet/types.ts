/**
 * Types and interfaces for .NET debugging support
 */

// .NET Version Types
export type DotNetVersion = 
  | 'netframework4.0' | 'netframework4.5' | 'netframework4.6' | 'netframework4.7' | 'netframework4.8'
  | 'netcore3.1' | 'net5.0' | 'net6.0' | 'net7.0' | 'net8.0' | 'net9.0';

export type DotNetFramework = 
  | 'aspnetcore' | 'wpf' | 'winforms' | 'blazor-server' | 'blazor-wasm' | 'maui' | 'unity' | 'console' | 'library';

export type DotNetRuntime = 'framework' | 'core' | 'mono';

// Configuration Interfaces
export interface DotNetDebugConfig {
  // Connection settings
  host?: string;
  port?: number;
  processId?: number;
  processName?: string;
  
  // .NET specific settings
  dotnetVersion?: DotNetVersion;
  framework?: DotNetFramework;
  runtime?: DotNetRuntime;
  
  // Path settings
  projectPath?: string;
  assemblyPath?: string;
  symbolsPath?: string;
  
  // Debug options
  enableHotReload?: boolean;
  enableAsyncDebugging?: boolean;
  enableLinqDebugging?: boolean;
  enableExceptionBreaking?: boolean;
  
  // Advanced options
  timeout?: number;
  autoAttach?: boolean;
  debuggerType?: 'vsdbg' | 'netcoredbg' | 'mono';
}

// Process Information
export interface DotNetProcessInfo {
  pid: number;
  name: string;
  version: DotNetVersion;
  runtime: DotNetRuntime;
  framework: DotNetFramework;
  architecture: 'x86' | 'x64' | 'arm' | 'arm64';
  startTime: Date;
  workingDirectory: string;
  commandLine: string;
  assemblies: DotNetAssemblyInfo[];
  isDebuggable: boolean;
  debugPort?: number;
}

// Assembly Information
export interface DotNetAssemblyInfo {
  name: string;
  fullName: string;
  version: string;
  location: string;
  isGAC: boolean;
  isDynamic: boolean;
  hasSymbols: boolean;
  modules: DotNetModuleInfo[];
  types: DotNetTypeInfo[];
}

export interface DotNetModuleInfo {
  name: string;
  fileName: string;
  hasSymbols: boolean;
  symbolsPath?: string;
}

export interface DotNetTypeInfo {
  name: string;
  fullName: string;
  namespace: string;
  assembly: string;
  isPublic: boolean;
  isClass: boolean;
  isInterface: boolean;
  isEnum: boolean;
  isStruct: boolean;
  baseType?: string;
  interfaces: string[];
  methods: DotNetMethodInfo[];
  properties: DotNetPropertyInfo[];
  fields: DotNetFieldInfo[];
}

// Object and Member Information
export interface DotNetObjectInfo {
  id: string;
  type: string;
  value: any;
  isNull: boolean;
  isPrimitive: boolean;
  isArray: boolean;
  isCollection: boolean;
  length?: number;
  properties: DotNetPropertyValue[];
  fields: DotNetFieldValue[];
  methods: DotNetMethodInfo[];
}

export interface DotNetPropertyInfo {
  name: string;
  type: string;
  isPublic: boolean;
  isStatic: boolean;
  canRead: boolean;
  canWrite: boolean;
  hasGetter: boolean;
  hasSetter: boolean;
}

export interface DotNetPropertyValue extends DotNetPropertyInfo {
  value: any;
  hasValue: boolean;
}

export interface DotNetFieldInfo {
  name: string;
  type: string;
  isPublic: boolean;
  isStatic: boolean;
  isReadOnly: boolean;
  isLiteral: boolean;
}

export interface DotNetFieldValue extends DotNetFieldInfo {
  value: any;
  hasValue: boolean;
}

export interface DotNetMethodInfo {
  name: string;
  returnType: string;
  parameters: DotNetParameterInfo[];
  isPublic: boolean;
  isStatic: boolean;
  isVirtual: boolean;
  isAbstract: boolean;
  isAsync: boolean;
  isGeneric: boolean;
  genericArguments?: string[];
}

export interface DotNetParameterInfo {
  name: string;
  type: string;
  hasDefaultValue: boolean;
  defaultValue?: any;
  isOptional: boolean;
  isOut: boolean;
  isRef: boolean;
  isParams: boolean;
}

// Exception Information
export interface DotNetExceptionInfo {
  type: string;
  message: string;
  stackTrace: DotNetStackFrame[];
  innerException?: DotNetExceptionInfo;
  data: Record<string, any>;
  source?: string;
  targetSite?: string;
  helpLink?: string;
}

export interface DotNetStackFrame {
  method: string;
  fileName?: string;
  lineNumber?: number;
  columnNumber?: number;
  assembly: string;
  namespace: string;
  className: string;
  methodName: string;
  parameters: string[];
  isAsync: boolean;
  asyncStateMachine?: string;
}

// Breakpoint Information
export interface DotNetBreakpoint {
  id: string;
  file: string;
  line: number;
  column?: number;
  condition?: string;
  hitCondition?: string;
  logMessage?: string;
  enabled: boolean;
  verified: boolean;
  assembly?: string;
  method?: string;
  isAsync?: boolean;
}

// Debugging Session
export interface DotNetDebugSession {
  sessionId: string;
  processInfo: DotNetProcessInfo;
  config: DotNetDebugConfig;
  connected: boolean;
  startTime: Date;
  breakpoints: Map<string, DotNetBreakpoint>;
  watchedExpressions: Map<string, any>;
  callStack: DotNetStackFrame[];
  currentFrame?: DotNetStackFrame;
  variables: Map<string, DotNetObjectInfo>;
  isRunning: boolean;
  isPaused: boolean;
  lastError?: DotNetExceptionInfo;
}

// Expression Evaluation
export interface DotNetExpressionResult {
  success: boolean;
  value: any;
  type: string;
  displayValue: string;
  error?: string;
  isAsync: boolean;
  executionTime: number;
}

// Hot Reload Information
export interface DotNetHotReloadInfo {
  supported: boolean;
  enabled: boolean;
  changedFiles: string[];
  appliedChanges: DotNetHotReloadChange[];
  errors: string[];
  warnings: string[];
}

export interface DotNetHotReloadChange {
  file: string;
  changeType: 'method' | 'property' | 'field' | 'type';
  target: string;
  success: boolean;
  error?: string;
}

// LINQ Debugging
export interface DotNetLinqQuery {
  id: string;
  expression: string;
  source: string;
  resultType: string;
  executionPlan: DotNetLinqStep[];
  result?: any;
  executionTime: number;
  itemCount?: number;
}

export interface DotNetLinqStep {
  operation: string;
  description: string;
  inputCount: number;
  outputCount: number;
  executionTime: number;
}

// Error Types
export const DotNetErrorType = {
  CONNECTION_FAILED: 'CONNECTION_FAILED',
  PROCESS_NOT_FOUND: 'PROCESS_NOT_FOUND',
  ASSEMBLY_LOAD_FAILED: 'ASSEMBLY_LOAD_FAILED',
  EXPRESSION_EVALUATION_FAILED: 'EXPRESSION_EVALUATION_FAILED',
  BREAKPOINT_SET_FAILED: 'BREAKPOINT_SET_FAILED',
  HOT_RELOAD_FAILED: 'HOT_RELOAD_FAILED',
  UNSUPPORTED_VERSION: 'UNSUPPORTED_VERSION',
  DEBUGGER_NOT_AVAILABLE: 'DEBUGGER_NOT_AVAILABLE'
} as const;

export type DotNetErrorTypeValues = typeof DotNetErrorType[keyof typeof DotNetErrorType];

export class DotNetDebugError extends Error {
  constructor(
    public type: DotNetErrorTypeValues,
    message: string,
    public details?: any
  ) {
    super(message);
    this.name = 'DotNetDebugError';
  }
}

// Framework Detection Results
export interface DotNetFrameworkDetection {
  framework: DotNetFramework;
  version: string;
  confidence: number;
  indicators: string[];
  capabilities: DotNetFrameworkCapabilities;
}

export interface DotNetFrameworkCapabilities {
  supportsHotReload: boolean;
  supportsAsyncDebugging: boolean;
  supportsLinqDebugging: boolean;
  supportsRemoteDebugging: boolean;
  supportsAttachToProcess: boolean;
  supportedDebuggers: string[];
}
