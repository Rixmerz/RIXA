/**
 * Rust MCP Tools Registration
 * Advanced Rust debugging tools for RIXA MCP interface
 * Includes ownership tracking, async debugging, Tauri support, profiling, and more
 */

import { z } from 'zod';
import { RustDebugger } from '../../rust/rust-debugger.js';
import { TauriDebugger } from '../../rust/tauri-debugger.js';
import { RustProfiler } from '../../rust/rust-profiler.js';
import { CargoIntegration } from '../../rust/cargo-integration.js';

// Global instances map for active debuggers
const activeRustDebuggers = new Map<string, RustDebugger>();
const activeTauriDebuggers = new Map<string, TauriDebugger>();
const activeProfilers = new Map<string, RustProfiler>();
const activeCargoIntegrations = new Map<string, CargoIntegration>();

/**
 * Create Rust debugging session
 */
export const debug_rust_create = {
  name: 'debug_rust_create',
  description: 'Create advanced Rust debugging session with ownership tracking and async support',
  inputSchema: z.object({
    project_path: z.string().describe('Path to Rust project'),
    debugger: z.enum(['gdb', 'lldb', 'codelldb', 'rust-gdb', 'rust-lldb']).optional().default('codelldb').describe('Debugger to use'),
    profile: z.enum(['debug', 'release']).optional().default('debug').describe('Build profile'),
    features: z.array(z.string()).optional().default([]).describe('Cargo features to enable'),
    toolchain: z.string().optional().describe('Rust toolchain to use'),
    target: z.string().optional().describe('Target architecture'),
    enable_ownership_tracking: z.boolean().optional().default(true).describe('Enable ownership and borrow tracking'),
    enable_async_debugging: z.boolean().optional().default(true).describe('Enable async/await debugging'),
    enable_lifetime_analysis: z.boolean().optional().default(true).describe('Enable lifetime analysis'),
    enable_unsafe_tracking: z.boolean().optional().default(true).describe('Track unsafe code blocks'),
    enable_macro_debugging: z.boolean().optional().default(true).describe('Enable macro expansion debugging'),
    enable_tauri_debugging: z.boolean().optional().default(false).describe('Enable Tauri framework debugging'),
    timeout: z.number().optional().default(30000).describe('Connection timeout in milliseconds')
  }),
  handler: async (args: any) => {
    try {
      const rustDebugger = new RustDebugger({
        debugger: args.debugger,
        host: 'localhost',
        port: 0, // Auto-select port
        project_path: args.project_path,
        profile: args.profile,
        features: args.features,
        toolchain: args.toolchain,
        target: args.target,
        enable_pretty_printing: true,
        enable_ownership_tracking: args.enable_ownership_tracking,
        enable_async_debugging: args.enable_async_debugging,
        enable_lifetime_analysis: args.enable_lifetime_analysis,
        enable_unsafe_tracking: args.enable_unsafe_tracking,
        enable_macro_debugging: args.enable_macro_debugging,
        enable_tauri_debugging: args.enable_tauri_debugging,
        enable_profiling: false,
        enable_wasm_debugging: false,
        timeout: args.timeout,
        attach_mode: false,
        auto_restart: false
      });

      const connectionResult = await rustDebugger.connect();

      if (connectionResult.success && connectionResult.sessionId) {
        activeRustDebuggers.set(connectionResult.sessionId, rustDebugger);

        // Initialize Tauri debugging if enabled
        if (args.enable_tauri_debugging) {
          const tauriDebugger = new TauriDebugger(rustDebugger, {
            host: 'localhost',
            port: 0,
            project_path: args.project_path,
            enable_ipc_tracking: true,
            enable_command_debugging: true,
            enable_window_debugging: true,
            enable_webview_debugging: true,
            enable_plugin_debugging: true,
            enable_event_debugging: true,
            timeout: args.timeout
          });

          activeTauriDebuggers.set(connectionResult.sessionId, tauriDebugger);
        }

        return {
          success: true,
          sessionId: connectionResult.sessionId,
          connectionInfo: connectionResult.connectionInfo,
          features: {
            ownership_tracking: args.enable_ownership_tracking,
            async_debugging: args.enable_async_debugging,
            lifetime_analysis: args.enable_lifetime_analysis,
            unsafe_tracking: args.enable_unsafe_tracking,
            macro_debugging: args.enable_macro_debugging,
            tauri_debugging: args.enable_tauri_debugging
          }
        };
      }

      return {
        success: false,
        error: 'Failed to create Rust debugging session'
      };
    } catch (error) {
      return {
        success: false,
        error: error instanceof Error ? error.message : String(error)
      };
    }
  }
};

/**
 * Track variable ownership
 */
export const debug_rust_ownership = {
  name: 'debug_rust_ownership',
  description: 'Track ownership and borrowing for Rust variables',
  inputSchema: z.object({
    sessionId: z.string().describe('Rust debugging session ID'),
    variable: z.string().describe('Variable name to track')
  }),
  handler: async (args: any) => {
    try {
      const rustDebugger = activeRustDebuggers.get(args.sessionId);
      if (!rustDebugger) {
        return { success: false, error: 'Rust debugging session not found' };
      }

      const ownership = await rustDebugger.trackOwnership(args.variable);

      return {
        success: true,
        sessionId: args.sessionId,
        variable: args.variable,
        ownership
      };
    } catch (error) {
      return {
        success: false,
        error: error instanceof Error ? error.message : String(error),
        sessionId: args.sessionId
      };
    }
  }
};

/**
 * Analyze lifetimes
 */
export const debug_rust_lifetimes = {
  name: 'debug_rust_lifetimes',
  description: 'Analyze lifetimes in current Rust scope',
  inputSchema: z.object({
    sessionId: z.string().describe('Rust debugging session ID')
  }),
  handler: async (args: any) => {
    try {
      const rustDebugger = activeRustDebuggers.get(args.sessionId);
      if (!rustDebugger) {
        return { success: false, error: 'Rust debugging session not found' };
      }

      const lifetimes = await rustDebugger.analyzeLifetimes('main');

      return {
        success: true,
        sessionId: args.sessionId,
        lifetimes
      };
    } catch (error) {
      return {
        success: false,
        error: error instanceof Error ? error.message : String(error),
        sessionId: args.sessionId
      };
    }
  }
};

/**
 * Track async tasks
 */
export const debug_rust_async = {
  name: 'debug_rust_async',
  description: 'Get async tasks information from Tokio runtime',
  inputSchema: z.object({
    sessionId: z.string().describe('Rust debugging session ID'),
    taskId: z.number().optional().describe('Specific task ID to track')
  }),
  handler: async (args: any) => {
    try {
      const rustDebugger = activeRustDebuggers.get(args.sessionId);
      if (!rustDebugger) {
        return { success: false, error: 'Rust debugging session not found' };
      }

      if (args.taskId) {
        const task = await rustDebugger.trackAsyncTask(args.taskId);
        return {
          success: true,
          sessionId: args.sessionId,
          task
        };
      } else {
        const tasks = await rustDebugger.getAsyncTasks();
        return {
          success: true,
          sessionId: args.sessionId,
          tasks
        };
      }
    } catch (error) {
      return {
        success: false,
        error: error instanceof Error ? error.message : String(error),
        sessionId: args.sessionId
      };
    }
  }
};

/**
 * Analyze unsafe code blocks
 */
export const debug_rust_unsafe = {
  name: 'debug_rust_unsafe',
  description: 'Analyze unsafe code blocks and operations',
  inputSchema: z.object({
    sessionId: z.string().describe('Rust debugging session ID'),
    blockId: z.string().optional().describe('Specific unsafe block ID to analyze')
  }),
  handler: async (args: any) => {
    try {
      const rustDebugger = activeRustDebuggers.get(args.sessionId);
      if (!rustDebugger) {
        return { success: false, error: 'Rust debugging session not found' };
      }

      if (args.blockId) {
        const block = await rustDebugger.analyzeUnsafeBlock(args.blockId);
        return {
          success: true,
          sessionId: args.sessionId,
          unsafeBlock: block
        };
      } else {
        const blocks = await rustDebugger.getUnsafeBlocks();
        return {
          success: true,
          sessionId: args.sessionId,
          unsafeBlocks: blocks
        };
      }
    } catch (error) {
      return {
        success: false,
        error: error instanceof Error ? error.message : String(error),
        sessionId: args.sessionId
      };
    }
  }
};

/**
 * Expand macros
 */
export const debug_rust_macros = {
  name: 'debug_rust_macros',
  description: 'Expand and debug Rust macros',
  inputSchema: z.object({
    sessionId: z.string().describe('Rust debugging session ID'),
    location: z.string().describe('Source location of macro to expand (file:line:column)')
  }),
  handler: async (args: any) => {
    try {
      const rustDebugger = activeRustDebuggers.get(args.sessionId);
      if (!rustDebugger) {
        return { success: false, error: 'Rust debugging session not found' };
      }

      const expansions = await rustDebugger.expandMacro(args.location);

      return {
        success: true,
        sessionId: args.sessionId,
        location: args.location,
        expansions
      };
    } catch (error) {
      return {
        success: false,
        error: error instanceof Error ? error.message : String(error),
        sessionId: args.sessionId
      };
    }
  }
};

/**
 * Get memory information
 */
export const debug_rust_memory = {
  name: 'debug_rust_memory',
  description: 'Get detailed Rust memory information with ownership tracking',
  inputSchema: z.object({
    sessionId: z.string().describe('Rust debugging session ID')
  }),
  handler: async (args: any) => {
    try {
      const rustDebugger = activeRustDebuggers.get(args.sessionId);
      if (!rustDebugger) {
        return { success: false, error: 'Rust debugging session not found' };
      }

      const memoryInfo = await rustDebugger.getMemoryInfo();

      return {
        success: true,
        sessionId: args.sessionId,
        memoryInfo
      };
    } catch (error) {
      return {
        success: false,
        error: error instanceof Error ? error.message : String(error),
        sessionId: args.sessionId
      };
    }
  }
};

/**
 * Start profiling
 */
export const debug_rust_profile_start = {
  name: 'debug_rust_profile_start',
  description: 'Start Rust profiling with flamegraph generation',
  inputSchema: z.object({
    sessionId: z.string().describe('Rust debugging session ID'),
    type: z.enum(['cpu', 'memory', 'async', 'locks']).describe('Type of profiling'),
    duration: z.number().optional().describe('Profiling duration in milliseconds'),
    output_dir: z.string().optional().describe('Output directory for profiling data'),
    sample_rate: z.number().optional().default(1000).describe('Sample rate in Hz')
  }),
  handler: async (args: any) => {
    try {
      const rustDebugger = activeRustDebuggers.get(args.sessionId);
      if (!rustDebugger) {
        return { success: false, error: 'Rust debugging session not found' };
      }

      const project_path = rustDebugger.getProjectInfo()?.projectPath;
      if (!project_path) {
        return { success: false, error: 'Project path not available' };
      }

      // Create profiler if not exists
      let profiler = activeProfilers.get(args.sessionId);
      if (!profiler) {
        profiler = new RustProfiler({
          project_path,
          output_dir: args.output_dir || '/tmp/rixa-profiles',
          sample_rate: args.sample_rate,
          max_stack_depth: 100,
          enable_dwarf: true,
          enable_symbols: true,
          flamegraph_options: {
            width: 1200,
            height: 600,
            font_type: 'Verdana',
            font_size: 12,
            colors: 'hot'
          }
        });
        activeProfilers.set(args.sessionId, profiler);
      }

      let profileId: string;

      switch (args.type) {
        case 'cpu':
          profileId = await profiler.startCPUProfiling(args.duration);
          break;
        case 'memory':
          profileId = await profiler.startMemoryProfiling(args.duration);
          break;
        case 'async':
          profileId = await profiler.startAsyncProfiling(args.duration);
          break;
        case 'locks':
          profileId = await profiler.startLockProfiling(args.duration);
          break;
        default:
          throw new Error(`Unsupported profiling type: ${args.type}`);
      }

      return {
        success: true,
        sessionId: args.sessionId,
        profileId,
        profilingType: args.type,
        duration: args.duration
      };
    } catch (error) {
      return {
        success: false,
        error: error instanceof Error ? error.message : String(error),
        sessionId: args.sessionId
      };
    }
  }
};

/**
 * Stop profiling
 */
export const debug_rust_profile_stop = {
  name: 'debug_rust_profile_stop',
  description: 'Stop Rust profiling and get results',
  inputSchema: z.object({
    sessionId: z.string().describe('Rust debugging session ID'),
    profileId: z.string().describe('Profile ID from start command')
  }),
  handler: async (args: any) => {
    try {
      const profiler = activeProfilers.get(args.sessionId);
      if (!profiler) {
        return { success: false, error: 'Profiler not found for session' };
      }

      const profile = await profiler.stopProfiling(args.profileId);

      return {
        success: true,
        sessionId: args.sessionId,
        profileId: args.profileId,
        profile
      };
    } catch (error) {
      return {
        success: false,
        error: error instanceof Error ? error.message : String(error),
        sessionId: args.sessionId
      };
    }
  }
};

/**
 * Tauri IPC debugging
 */
export const debug_tauri_ipc = {
  name: 'debug_tauri_ipc',
  description: 'Debug Tauri IPC messages between frontend and backend',
  inputSchema: z.object({
    sessionId: z.string().describe('Rust debugging session ID'),
    action: z.enum(['start', 'stop', 'get_messages']).describe('Action to perform'),
    limit: z.number().optional().default(100).describe('Maximum number of messages to return'),
    filter: z.string().optional().describe('Filter messages by command/event name')
  }),
  handler: async (args: any) => {
    try {
      const tauriDebugger = activeTauriDebuggers.get(args.sessionId);
      if (!tauriDebugger) {
        return { success: false, error: 'Tauri debugging not enabled for this session' };
      }

      switch (args.action) {
        case 'start':
          await tauriDebugger.startIPCTracking();
          return { success: true, sessionId: args.sessionId, message: 'IPC tracking started' };

        case 'stop':
          await tauriDebugger.stopIPCTracking();
          return { success: true, sessionId: args.sessionId, message: 'IPC tracking stopped' };

        case 'get_messages':
          const messages = await tauriDebugger.getIPCMessages(args.limit, args.filter);
          return { success: true, sessionId: args.sessionId, messages };

        default:
          return { success: false, error: 'Invalid action' };
      }
    } catch (error) {
      return {
        success: false,
        error: error instanceof Error ? error.message : String(error),
        sessionId: args.sessionId
      };
    }
  }
};

/**
 * Tauri commands debugging
 */
export const debug_tauri_commands = {
  name: 'debug_tauri_commands',
  description: 'Debug Tauri commands and their parameters',
  inputSchema: z.object({
    sessionId: z.string().describe('Rust debugging session ID'),
    command_name: z.string().optional().describe('Specific command to inspect')
  }),
  handler: async (args: any) => {
    try {
      const tauriDebugger = activeTauriDebuggers.get(args.sessionId);
      if (!tauriDebugger) {
        return { success: false, error: 'Tauri debugging not enabled for this session' };
      }

      if (args.command_name) {
        const command = await tauriDebugger.getTauriCommand(args.command_name);
        return { success: true, sessionId: args.sessionId, command };
      } else {
        const commands = await tauriDebugger.getTauriCommands();
        return { success: true, sessionId: args.sessionId, commands };
      }
    } catch (error) {
      return {
        success: false,
        error: error instanceof Error ? error.message : String(error),
        sessionId: args.sessionId
      };
    }
  }
};

/**
 * Tauri windows debugging
 */
export const debug_tauri_windows = {
  name: 'debug_tauri_windows',
  description: 'Debug Tauri windows and their states',
  inputSchema: z.object({
    sessionId: z.string().describe('Rust debugging session ID'),
    window_label: z.string().optional().describe('Specific window to inspect'),
    action: z.enum(['get_info', 'get_metrics', 'execute_js']).optional().default('get_info').describe('Action to perform'),
    script: z.string().optional().describe('JavaScript to execute in WebView (for execute_js action)')
  }),
  handler: async (args: any) => {
    try {
      const tauriDebugger = activeTauriDebuggers.get(args.sessionId);
      if (!tauriDebugger) {
        return { success: false, error: 'Tauri debugging not enabled for this session' };
      }

      switch (args.action) {
        case 'get_info':
          if (args.window_label) {
            const window = await tauriDebugger.getTauriWindow(args.window_label);
            return { success: true, sessionId: args.sessionId, window };
          } else {
            const windows = await tauriDebugger.getTauriWindows();
            return { success: true, sessionId: args.sessionId, windows };
          }

        case 'get_metrics':
          const metrics = await tauriDebugger.getWebViewMetrics(args.window_label);
          return { success: true, sessionId: args.sessionId, metrics };

        case 'execute_js':
          if (!args.script) {
            return { success: false, error: 'Script parameter required for execute_js action' };
          }
          const result = await tauriDebugger.executeJavaScript(args.window_label, args.script);
          return { success: true, sessionId: args.sessionId, result };

        default:
          return { success: false, error: 'Invalid action' };
      }
    } catch (error) {
      return {
        success: false,
        error: error instanceof Error ? error.message : String(error),
        sessionId: args.sessionId
      };
    }
  }
};

/**
 * Cargo integration
 */
export const debug_cargo_integration = {
  name: 'debug_cargo_integration',
  description: 'Integrate with Cargo for build, test, and benchmark operations',
  inputSchema: z.object({
    sessionId: z.string().describe('Rust debugging session ID'),
    action: z.enum(['build', 'test', 'bench', 'run_example', 'metadata', 'clippy', 'fmt']).describe('Cargo action to perform'),
    profile: z.enum(['debug', 'release']).optional().describe('Build profile'),
    features: z.array(z.string()).optional().describe('Features to enable'),
    target: z.string().optional().describe('Target architecture'),
    test_name: z.string().optional().describe('Specific test to run'),
    bench_name: z.string().optional().describe('Specific benchmark to run'),
    example_name: z.string().optional().describe('Example to run'),
    example_args: z.array(z.string()).optional().describe('Arguments for example'),
    verbose: z.boolean().optional().default(false).describe('Verbose output'),
    fix: z.boolean().optional().default(false).describe('Auto-fix issues (for clippy)'),
    check: z.boolean().optional().default(false).describe('Check only (for fmt)')
  }),
  handler: async (args: any) => {
    try {
      const rustDebugger = activeRustDebuggers.get(args.sessionId);
      if (!rustDebugger) {
        return { success: false, error: 'Rust debugging session not found' };
      }

      const project_path = rustDebugger.getProjectInfo()?.projectPath;
      if (!project_path) {
        return { success: false, error: 'Project path not available' };
      }

      // Create cargo integration if not exists
      let cargo = activeCargoIntegrations.get(args.sessionId);
      if (!cargo) {
        cargo = new CargoIntegration({
          project_path,
          features: args.features || [],
          profile: args.profile || 'debug',
          enable_test_debugging: true,
          enable_bench_profiling: true,
          enable_example_debugging: true,
          timeout: 300000
        });
        
        await cargo.initialize();
        activeCargoIntegrations.set(args.sessionId, cargo);
      }

      let result: any;

      switch (args.action) {
        case 'build':
          result = await cargo.build({
            profile: args.profile,
            features: args.features,
            target: args.target,
            verbose: args.verbose
          });
          break;

        case 'test':
          result = await cargo.runTests({
            test_name: args.test_name,
            features: args.features,
            profile: args.profile
          });
          break;

        case 'bench':
          result = await cargo.runBenchmarks({
            bench_name: args.bench_name,
            features: args.features
          });
          break;

        case 'run_example':
          if (!args.example_name) {
            return { success: false, error: 'example_name required for run_example action' };
          }
          await cargo.runExample(args.example_name, args.example_args || []);
          result = { example: args.example_name, status: 'started' };
          break;

        case 'metadata':
          result = await cargo.getMetadata();
          break;

        case 'clippy':
          result = await cargo.runClippy({ fix: args.fix });
          break;

        case 'fmt':
          result = await cargo.formatCode(args.check);
          break;

        default:
          return { success: false, error: 'Invalid cargo action' };
      }

      return {
        success: true,
        sessionId: args.sessionId,
        action: args.action,
        result
      };
    } catch (error) {
      return {
        success: false,
        error: error instanceof Error ? error.message : String(error),
        sessionId: args.sessionId
      };
    }
  }
};

/**
 * Set advanced Rust breakpoints
 */
export const debug_rust_breakpoint = {
  name: 'debug_rust_breakpoint',
  description: 'Set advanced Rust-specific breakpoints',
  inputSchema: z.object({
    sessionId: z.string().describe('Rust debugging session ID'),
    type: z.enum(['ownership', 'async', 'unsafe']).describe('Type of breakpoint'),
    condition: z.string().describe('Breakpoint condition'),
    variable: z.string().optional().describe('Variable name (for ownership breakpoints)'),
    taskId: z.number().optional().describe('Task ID (for async breakpoints)'),
    state: z.string().optional().describe('State to break on (for async breakpoints)'),
    operation: z.string().optional().describe('Unsafe operation to break on')
  }),
  handler: async (args: any) => {
    try {
      const rustDebugger = activeRustDebuggers.get(args.sessionId);
      if (!rustDebugger) {
        return { success: false, error: 'Rust debugging session not found' };
      }

      let breakpoint: any;

      switch (args.type) {
        case 'ownership':
          if (!args.variable) {
            return { success: false, error: 'variable required for ownership breakpoint' };
          }
          breakpoint = await rustDebugger.setOwnershipBreakpoint(args.variable, args.condition);
          break;

        case 'async':
          if (args.taskId === undefined || !args.state) {
            return { success: false, error: 'taskId and state required for async breakpoint' };
          }
          breakpoint = await rustDebugger.setAsyncBreakpoint(args.taskId, args.state);
          break;

        case 'unsafe':
          if (!args.operation) {
            return { success: false, error: 'operation required for unsafe breakpoint' };
          }
          breakpoint = await rustDebugger.setUnsafeBreakpoint(args.operation);
          break;

        default:
          return { success: false, error: 'Invalid breakpoint type' };
      }

      return {
        success: true,
        sessionId: args.sessionId,
        breakpoint
      };
    } catch (error) {
      return {
        success: false,
        error: error instanceof Error ? error.message : String(error),
        sessionId: args.sessionId
      };
    }
  }
};

/**
 * Terminate Rust debugging session
 */
export const debug_rust_terminate = {
  name: 'debug_rust_terminate',
  description: 'Terminate Rust debugging session and cleanup resources',
  inputSchema: z.object({
    sessionId: z.string().describe('Rust debugging session ID')
  }),
  handler: async (args: any) => {
    try {
      const rustDebugger = activeRustDebuggers.get(args.sessionId);
      const tauriDebugger = activeTauriDebuggers.get(args.sessionId);
      const profiler = activeProfilers.get(args.sessionId);
      const cargo = activeCargoIntegrations.get(args.sessionId);

      // Cleanup all components
      if (rustDebugger) {
        await rustDebugger.disconnect();
        activeRustDebuggers.delete(args.sessionId);
      }

      if (tauriDebugger) {
        await tauriDebugger.disconnect();
        activeTauriDebuggers.delete(args.sessionId);
      }

      if (profiler) {
        await profiler.cleanup();
        activeProfilers.delete(args.sessionId);
      }

      if (cargo) {
        await cargo.cleanup();
        activeCargoIntegrations.delete(args.sessionId);
      }

      return {
        success: true,
        sessionId: args.sessionId,
        message: 'Rust debugging session terminated successfully'
      };
    } catch (error) {
      return {
        success: false,
        error: error instanceof Error ? error.message : String(error),
        sessionId: args.sessionId
      };
    }
  }
};

// Export all tools
export const rustTools = {
  debug_rust_create,
  debug_rust_ownership,
  debug_rust_lifetimes,
  debug_rust_async,
  debug_rust_unsafe,
  debug_rust_macros,
  debug_rust_memory,
  debug_rust_profile_start,
  debug_rust_profile_stop,
  debug_tauri_ipc,
  debug_tauri_commands,
  debug_tauri_windows,
  debug_cargo_integration,
  debug_rust_breakpoint,
  debug_rust_terminate
};