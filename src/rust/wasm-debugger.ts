/**
 * Rust WASM Debugger
 * Debug Rust applications compiled to WebAssembly
 * Supports browser DevTools integration, WASM memory inspection, and source mapping
 */

import { EventEmitter } from 'events';
import { existsSync, readFileSync } from 'fs';
import { join } from 'path';
import { spawn, ChildProcess } from 'child_process';
import type {
  RustWasmModule,
  RustWasmFunction,
  RustWasmImport,
  RustWasmExport
} from './types.js';

// WebAssembly type declarations for Node.js environment
declare global {
  namespace WebAssembly {
    class Module {
      constructor(bytes: ArrayBuffer | Uint8Array);
    }
    class Instance {
      constructor(module: WebAssembly.Module, importObject?: any);
      exports: any;
    }
    class Memory {
      constructor(descriptor: { initial: number; maximum?: number; shared?: boolean });
      buffer: ArrayBuffer;
    }
    class Table {
      constructor(descriptor: { initial: number; maximum?: number; element: string });
    }
    class Global {
      constructor(descriptor: { value: string; mutable?: boolean }, value?: any);
      value: any;
    }
    function instantiate(bytes: ArrayBuffer | Uint8Array, importObject?: any): Promise<{
      module: WebAssembly.Module;
      instance: WebAssembly.Instance;
    }>;
    function instantiate(module: WebAssembly.Module, importObject?: any): Promise<WebAssembly.Instance>;
    function compile(bytes: ArrayBuffer | Uint8Array): Promise<WebAssembly.Module>;
  }
}

export interface WasmDebuggerConfig {
  project_path: string;
  wasm_file?: string;
  source_map?: string;
  host: string;
  port: number;
  enable_source_maps: boolean;
  enable_memory_inspection: boolean;
  enable_function_profiling: boolean;
  enable_browser_devtools: boolean;
  chrome_debugging_port?: number;
  timeout: number;
}

export interface WasmBreakpoint {
  id: string;
  function_index: number;
  instruction_offset: number;
  condition?: string;
  verified: boolean;
  source_location?: {
    file: string;
    line: number;
    column: number;
  };
}

export interface WasmExecutionFrame {
  function_index: number;
  function_name?: string;
  instruction_pointer: number;
  locals: WasmLocal[];
  source_location?: {
    file: string;
    line: number;
    column: number;
  };
}

export interface WasmLocal {
  index: number;
  type: string;
  value: any;
}

export interface WasmMemoryView {
  address: number;
  size: number;
  data: Uint8Array;
  type: 'heap' | 'stack' | 'static';
}

export interface WasmPerformanceMetrics {
  function_calls: Map<number, number>;
  execution_time: Map<number, number>;
  memory_usage: number;
  instantiation_time: number;
  compilation_time: number;
}

export class RustWasmDebugger extends EventEmitter {
  private config: WasmDebuggerConfig;
  private wasmModule?: RustWasmModule;
  private wasmInstance?: WebAssembly.Instance;
  private sourceMap?: any;
  private breakpoints: Map<string, WasmBreakpoint> = new Map();
  private executionStack: WasmExecutionFrame[] = [];
  private memoryViews: Map<string, WasmMemoryView> = new Map();
  private performanceMetrics: WasmPerformanceMetrics;
  private chromeProcess?: ChildProcess;
  private devToolsConnected = false;
  private isRunning = false;

  constructor(config: WasmDebuggerConfig) {
    super();
    this.config = {
      project_path: config.project_path,
      wasm_file: config.wasm_file || 'target/wasm32-unknown-unknown/release/app.wasm',
      host: config.host,
      port: config.port,
      enable_source_maps: config.enable_source_maps !== false,
      enable_memory_inspection: config.enable_memory_inspection !== false,
      enable_function_profiling: config.enable_function_profiling !== false,
      enable_browser_devtools: config.enable_browser_devtools !== false,
      chrome_debugging_port: config.chrome_debugging_port || 9222,
      timeout: config.timeout || 30000
    };

    this.performanceMetrics = {
      function_calls: new Map(),
      execution_time: new Map(),
      memory_usage: 0,
      instantiation_time: 0,
      compilation_time: 0
    };
  }

  /**
   * Check if DevTools is connected
   */
  get isDevToolsConnected(): boolean {
    return this.devToolsConnected;
  }

  /**
   * Initialize WASM debugging
   */
  async initialize(): Promise<void> {
    try {
      // Load WASM module
      await this.loadWasmModule();

      // Load source maps if enabled
      if (this.config.enable_source_maps) {
        await this.loadSourceMaps();
      }

      // Connect to browser DevTools if enabled
      if (this.config.enable_browser_devtools) {
        await this.connectToDevTools();
      }

      // Initialize memory inspection
      if (this.config.enable_memory_inspection) {
        await this.initializeMemoryInspection();
      }

      this.emit('wasm-debugger-initialized');
    } catch (error) {
      this.emit('wasm-debugger-error', error);
      throw error;
    }
  }

  /**
   * Load WASM module from file
   */
  private async loadWasmModule(): Promise<void> {
    const wasmPath = this.config.wasm_file || 
                    this.findWasmFile() || 
                    join(this.config.project_path, 'pkg', 'index_bg.wasm');

    if (!existsSync(wasmPath)) {
      throw new Error(`WASM file not found: ${wasmPath}`);
    }

    try {
      const wasmBuffer = readFileSync(wasmPath);
      const compilationStart = Date.now();
      
      const wasmModule = await WebAssembly.compile(wasmBuffer);
      this.performanceMetrics.compilation_time = Date.now() - compilationStart;

      const instantiationStart = Date.now();
      this.wasmInstance = await WebAssembly.instantiate(wasmModule, this.createImportObject());
      this.performanceMetrics.instantiation_time = Date.now() - instantiationStart;

      // Analyze WASM module structure
      this.wasmModule = await this.analyzeWasmModule(wasmBuffer);

      this.emit('wasm-module-loaded', {
        path: wasmPath,
        size: wasmBuffer.length,
        functions: this.wasmModule.functions.length,
        exports: this.wasmModule.exports.length,
        imports: this.wasmModule.imports.length
      });

    } catch (error) {
      throw new Error(`Failed to load WASM module: ${error}`);
    }
  }

  /**
   * Find WASM file in common locations
   */
  private findWasmFile(): string | null {
    const commonPaths = [
      join(this.config.project_path, 'target', 'wasm32-unknown-unknown', 'debug', '*.wasm'),
      join(this.config.project_path, 'target', 'wasm32-unknown-unknown', 'release', '*.wasm'),
      join(this.config.project_path, 'pkg', '*.wasm'),
      join(this.config.project_path, 'dist', '*.wasm'),
      join(this.config.project_path, 'build', '*.wasm')
    ];

    // Simple file search - would use glob in real implementation
    for (const pathPattern of commonPaths) {
      const dir = pathPattern.substring(0, pathPattern.lastIndexOf('/'));
      if (existsSync(dir)) {
        // Return first .wasm file found
        const files = ['index_bg.wasm', 'main.wasm', 'app.wasm'];
        for (const file of files) {
          const fullPath = join(dir, file);
          if (existsSync(fullPath)) {
            return fullPath;
          }
        }
      }
    }

    return null;
  }

  /**
   * Create import object for WASM instantiation
   */
  private createImportObject(): any {
    const importObject: any = {
      env: {
        memory: new WebAssembly.Memory({ initial: 256, maximum: 1024 }),
        table: new WebAssembly.Table({ initial: 1, element: 'anyfunc' }),
        
        // Standard WASM imports
        __stack_pointer: new WebAssembly.Global({ value: 'i32', mutable: true }, 65536),
        abort: () => { throw new Error('WASM abort called'); },
        
        // Debugging hooks
        __debug_break: this.handleDebugBreak.bind(this),
        __debug_log: this.handleDebugLog.bind(this),
        __debug_trace: this.handleDebugTrace.bind(this)
      },
      
      // Web APIs for web-based WASM
      wbg: {
        __wbg_console_log: (ptr: number, len: number) => {
          const message = this.readStringFromMemory(ptr, len);
          this.emit('wasm-console-log', message);
        },
        __wbg_console_error: (ptr: number, len: number) => {
          const message = this.readStringFromMemory(ptr, len);
          this.emit('wasm-console-error', message);
        }
      }
    };

    // Add performance monitoring hooks if enabled
    if (this.config.enable_function_profiling) {
      importObject.env.__debug_function_enter = this.handleFunctionEnter.bind(this);
      importObject.env.__debug_function_exit = this.handleFunctionExit.bind(this);
    }

    return importObject;
  }

  /**
   * Analyze WASM module structure
   */
  private async analyzeWasmModule(wasmBuffer: Buffer): Promise<RustWasmModule> {
    // Simplified WASM parsing - would use proper WASM parser in production
    const module: RustWasmModule = {
      name: 'rust-wasm-module',
      size: wasmBuffer.length,
      functions: [],
      globals: [],
      memory: { initial: 256, shared: false },
      tables: [],
      imports: [],
      exports: []
    };

    // Mock analysis - would parse actual WASM binary format
    const mockFunctions: RustWasmFunction[] = [
      {
        index: 0,
        name: 'main',
        signature: '() -> ()',
        locals: [
          { index: 0, type: 'i32' },
          { index: 1, type: 'i32' }
        ],
        instructions: 42
      },
      {
        index: 1,
        name: 'calculate',
        signature: '(i32, i32) -> (i32)',
        locals: [
          { index: 0, type: 'i32' },
          { index: 1, type: 'i32' }
        ],
        instructions: 15
      }
    ];

    const mockExports: RustWasmExport[] = [
      { name: 'main', type: 'function', index: 0 },
      { name: 'calculate', type: 'function', index: 1 },
      { name: 'memory', type: 'memory', index: 0 }
    ];

    const mockImports: RustWasmImport[] = [
      { module: 'env', name: 'console_log', type: 'function', signature: '(i32, i32) -> ()' },
      { module: 'env', name: 'memory', type: 'memory' }
    ];

    module.functions = mockFunctions;
    module.exports = mockExports;
    module.imports = mockImports;

    return module;
  }

  /**
   * Load source maps for debugging
   */
  private async loadSourceMaps(): Promise<void> {
    const sourceMapPath = this.config.source_map || 
                         join(this.config.project_path, 'pkg', 'index_bg.wasm.map');

    if (existsSync(sourceMapPath)) {
      try {
        const sourceMapContent = readFileSync(sourceMapPath, 'utf-8');
        this.sourceMap = JSON.parse(sourceMapContent);
        this.emit('source-maps-loaded', { path: sourceMapPath });
      } catch (error) {
        console.warn('Failed to load source maps:', error);
      }
    }
  }

  /**
   * Connect to Chrome DevTools for enhanced debugging
   */
  private async connectToDevTools(): Promise<void> {
    try {
      // Launch Chrome in debugging mode if not already running
      await this.launchChromeDebugger();
      
      // Connect to DevTools protocol
      await this.connectToDevToolsProtocol();

      this.devToolsConnected = true;
      this.emit('devtools-connected');
    } catch (error) {
      console.warn('DevTools connection failed:', error);
    }
  }

  private async launchChromeDebugger(): Promise<void> {
    const chromeArgs = [
      '--headless',
      '--disable-gpu',
      '--disable-web-security',
      '--disable-features=VizDisplayCompositor',
      `--remote-debugging-port=${this.config.chrome_debugging_port}`,
      'about:blank'
    ];

    this.chromeProcess = spawn('google-chrome', chromeArgs, {
      stdio: ['pipe', 'pipe', 'pipe']
    });

    // Wait for Chrome to start
    await new Promise(resolve => setTimeout(resolve, 2000));
  }

  private async connectToDevToolsProtocol(): Promise<void> {
    // Mock DevTools protocol connection
    // In real implementation, would use Chrome DevTools Protocol
    this.emit('devtools-protocol-connected');
  }

  /**
   * Initialize memory inspection
   */
  private async initializeMemoryInspection(): Promise<void> {
    if (!this.wasmInstance) return;

    const memory = this.wasmInstance.exports.memory as WebAssembly.Memory;
    if (memory) {
      this.createMemoryView('main', 0, memory.buffer.byteLength, 'heap');
      this.emit('memory-inspection-initialized', {
        size: memory.buffer.byteLength,
        pages: memory.buffer.byteLength / 65536
      });
    }
  }

  /**
   * Create memory view
   */
  private createMemoryView(id: string, address: number, size: number, type: 'heap' | 'stack' | 'static'): void {
    if (!this.wasmInstance) return;

    const memory = this.wasmInstance.exports.memory as WebAssembly.Memory;
    const data = new Uint8Array(memory.buffer, address, size);

    const memoryView: WasmMemoryView = {
      address,
      size,
      data,
      type
    };

    this.memoryViews.set(id, memoryView);
    this.emit('memory-view-created', { id, address, size, type });
  }

  /**
   * Set breakpoint
   */
  async setBreakpoint(functionIndex: number, instructionOffset: number, condition?: string): Promise<WasmBreakpoint> {
    const breakpointId = `bp-${functionIndex}-${instructionOffset}`;
    
    const breakpoint: WasmBreakpoint = {
      id: breakpointId,
      function_index: functionIndex,
      instruction_offset: instructionOffset,
      verified: true,
      ...(condition && { condition })
    };

    // Try to resolve source location if source maps are available
    if (this.sourceMap) {
      breakpoint.source_location = this.resolveSourceLocation(functionIndex, instructionOffset);
    }

    this.breakpoints.set(breakpointId, breakpoint);
    this.emit('wasm-breakpoint-set', breakpoint);

    return breakpoint;
  }

  /**
   * Resolve source location using source maps
   */
  private resolveSourceLocation(_functionIndex: number, _instructionOffset: number): any {
    // Mock source location resolution
    return {
      file: 'src/lib.rs',
      line: 42,
      column: 10
    };
  }

  /**
   * Step execution
   */
  async step(type: 'into' | 'over' | 'out'): Promise<void> {
    if (!this.isRunning) {
      throw new Error('WASM not running');
    }

    this.emit('wasm-step', { type });
    
    // In real implementation, would control WASM execution
    setTimeout(() => {
      this.emit('wasm-stepped', { type, stopped: true });
    }, 100);
  }

  /**
   * Continue execution
   */
  async continue(): Promise<void> {
    if (!this.isRunning) {
      throw new Error('WASM not running');
    }

    this.emit('wasm-continue');
    this.isRunning = true;
  }

  /**
   * Pause execution
   */
  async pause(): Promise<void> {
    if (!this.isRunning) {
      return;
    }

    this.isRunning = false;
    this.emit('wasm-paused');
  }

  /**
   * Get execution stack trace
   */
  getStackTrace(): WasmExecutionFrame[] {
    return [...this.executionStack];
  }

  /**
   * Get memory view
   */
  getMemoryView(id: string): WasmMemoryView | undefined {
    return this.memoryViews.get(id);
  }

  /**
   * Read memory at address
   */
  readMemory(address: number, size: number): Uint8Array | null {
    if (!this.wasmInstance) return null;

    const memory = this.wasmInstance.exports.memory as WebAssembly.Memory;
    if (address + size > memory.buffer.byteLength) {
      return null;
    }

    return new Uint8Array(memory.buffer, address, size);
  }

  /**
   * Write memory at address
   */
  writeMemory(address: number, data: Uint8Array): boolean {
    if (!this.wasmInstance) return false;

    const memory = this.wasmInstance.exports.memory as WebAssembly.Memory;
    if (address + data.length > memory.buffer.byteLength) {
      return false;
    }

    const memoryView = new Uint8Array(memory.buffer, address, data.length);
    memoryView.set(data);

    this.emit('memory-written', { address, size: data.length });
    return true;
  }

  /**
   * Evaluate expression in WASM context
   */
  async evaluateExpression(expression: string): Promise<any> {
    // Mock expression evaluation
    // In real implementation, would evaluate WASM expressions
    this.emit('wasm-expression-evaluated', { expression });
    
    return {
      result: `Evaluated: ${expression}`,
      type: 'i32',
      value: 42
    };
  }

  /**
   * Get performance metrics
   */
  getPerformanceMetrics(): WasmPerformanceMetrics {
    return { ...this.performanceMetrics };
  }

  /**
   * Get WASM module info
   */
  getModuleInfo(): RustWasmModule | undefined {
    return this.wasmModule;
  }

  /**
   * Export WASM memory to file
   */
  async exportMemory(filename: string): Promise<void> {
    if (!this.wasmInstance) {
      throw new Error('WASM instance not available');
    }

    const memory = this.wasmInstance.exports.memory as WebAssembly.Memory;
    const data = new Uint8Array(memory.buffer);

    // Would write to file in real implementation
    this.emit('memory-exported', { filename, size: data.length });
  }

  // Debug event handlers
  private handleDebugBreak(functionIndex: number, instructionOffset: number): void {
    const breakpointId = `bp-${functionIndex}-${instructionOffset}`;
    const breakpoint = this.breakpoints.get(breakpointId);
    
    if (breakpoint) {
      this.isRunning = false;
      this.emit('wasm-breakpoint-hit', { breakpoint, functionIndex, instructionOffset });
    }
  }

  private handleDebugLog(ptr: number, len: number): void {
    const message = this.readStringFromMemory(ptr, len);
    this.emit('wasm-debug-log', message);
  }

  private handleDebugTrace(functionIndex: number): void {
    const frame: WasmExecutionFrame = {
      function_index: functionIndex,
      function_name: this.wasmModule?.functions[functionIndex]?.name || `func_${functionIndex}`,
      instruction_pointer: 0, // Would get actual IP
      locals: []
    };

    this.executionStack.push(frame);
    this.emit('wasm-trace', frame);
  }

  private handleFunctionEnter(functionIndex: number): void {
    if (this.config.enable_function_profiling) {
      const currentCalls = this.performanceMetrics.function_calls.get(functionIndex) || 0;
      this.performanceMetrics.function_calls.set(functionIndex, currentCalls + 1);
    }
  }

  private handleFunctionExit(functionIndex: number): void {
    if (this.config.enable_function_profiling) {
      // Would measure actual execution time
      const currentTime = this.performanceMetrics.execution_time.get(functionIndex) || 0;
      this.performanceMetrics.execution_time.set(functionIndex, currentTime + 1);
    }
  }

  /**
   * Helper to read string from WASM memory
   */
  private readStringFromMemory(ptr: number, len: number): string {
    if (!this.wasmInstance) return '';

    const memory = this.wasmInstance.exports.memory as WebAssembly.Memory;
    const bytes = new Uint8Array(memory.buffer, ptr, len);
    return new TextDecoder().decode(bytes);
  }

  /**
   * Disconnect and cleanup
   */
  async disconnect(): Promise<void> {
    this.isRunning = false;
    
    if (this.chromeProcess) {
      this.chromeProcess.kill('SIGTERM');
      delete this.chromeProcess;
    }

    this.devToolsConnected = false;
    this.breakpoints.clear();
    this.executionStack = [];
    this.memoryViews.clear();

    delete this.wasmModule;
    delete this.wasmInstance;
    delete this.sourceMap;

    this.emit('wasm-debugger-disconnected');
  }
}