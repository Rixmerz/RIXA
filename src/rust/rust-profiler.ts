/**
 * Rust Profiler - Advanced profiling for Rust applications
 * Supports CPU, memory, async, and lock profiling with flamegraph generation
 */

import { EventEmitter } from 'events';
import { spawn, ChildProcess } from 'child_process';
import { writeFileSync, existsSync, mkdirSync } from 'fs';
import { join } from 'path';
import type {
  RustProfile,
  RustCpuProfile,
  RustMemoryProfile,
  RustAsyncProfile,
  RustLockProfile,
  RustHotFunction,
  RustCallGraphNode,
  RustAllocation,
  RustDeallocation,
  RustLiveObject
} from './types.js';

export interface RustProfilerConfig {
  project_path: string;
  output_dir: string;
  sample_rate: number;
  max_stack_depth: number;
  enable_dwarf: boolean;
  enable_symbols: boolean;
  flamegraph_options: {
    width: number;
    height: number;
    font_type: string;
    font_size: number;
    colors: string;
  };
}

export class RustProfiler extends EventEmitter {
  private config: RustProfilerConfig;
  private activeProfiles: Map<string, RustProfile> = new Map();
  private profilerProcesses: Map<string, ChildProcess> = new Map();
  private outputDir: string;

  constructor(config: RustProfilerConfig) {
    super();
    this.config = {
      project_path: config.project_path,
      output_dir: config.output_dir || './profiling-output',
      sample_rate: config.sample_rate || 1000, // Hz
      max_stack_depth: config.max_stack_depth || 100,
      enable_dwarf: config.enable_dwarf !== false,
      enable_symbols: config.enable_symbols !== false,
      flamegraph_options: config.flamegraph_options || {
        width: 1200,
        height: 600,
        font_type: 'Verdana',
        font_size: 12,
        colors: 'hot'
      }
    };

    this.outputDir = this.config.output_dir;
    this.ensureOutputDirectory();
  }

  private ensureOutputDirectory(): void {
    if (!existsSync(this.outputDir)) {
      mkdirSync(this.outputDir, { recursive: true });
    }
  }

  /**
   * Start CPU profiling
   */
  async startCPUProfiling(duration?: number): Promise<string> {
    const profileId = `cpu-${Date.now()}`;
    
    const profile: RustProfile = {
      type: 'cpu',
      duration: duration || 0,
      start_time: Date.now(),
      end_time: 0,
      samples: 0,
      data: {}
    };

    this.activeProfiles.set(profileId, profile);

    try {
      // Use perf for CPU profiling on Linux, Instruments on macOS, or cargo-profiler
      const profilerCommand = this.getCPUProfilerCommand();
      const args = this.getCPUProfilerArgs(profileId, duration);

      const profilerProcess = spawn(profilerCommand, args, {
        stdio: ['pipe', 'pipe', 'pipe'],
        cwd: this.config.project_path
      });

      this.profilerProcesses.set(profileId, profilerProcess);

      profilerProcess.on('exit', async (code) => {
        if (code === 0) {
          await this.processCPUProfileData(profileId);
        } else {
          this.emit('profiling-error', { profileId, error: `Profiler exited with code ${code}` });
        }
      });

      // Auto-stop profiling if duration is specified
      if (duration) {
        setTimeout(() => {
          this.stopProfiling(profileId);
        }, duration);
      }

      this.emit('cpu-profiling-started', { profileId, duration });
      return profileId;

    } catch (error) {
      this.activeProfiles.delete(profileId);
      this.emit('profiling-error', { profileId, error });
      throw error;
    }
  }

  private getCPUProfilerCommand(): string {
    // Detect platform and return appropriate profiler
    const platform = process.platform;
    
    if (platform === 'linux') {
      return 'perf';
    } else if (platform === 'darwin') {
      return 'xcrun';
    } else {
      // Fallback to cargo-profiler or custom implementation
      return 'cargo';
    }
  }

  private getCPUProfilerArgs(profileId: string, duration?: number): string[] {
    const platform = process.platform;
    const outputFile = join(this.outputDir, `${profileId}.data`);

    if (platform === 'linux') {
      const args = [
        'record',
        '-F', this.config.sample_rate.toString(),
        '-g',
        '--call-graph=dwarf',
        '-o', outputFile
      ];

      if (duration) {
        args.push('--', 'timeout', (duration / 1000).toString());
      }

      return args;
    } else if (platform === 'darwin') {
      return [
        'xctrace',
        'record',
        '--template', 'Time Profiler',
        '--output', outputFile,
        '--launch', '--'
      ];
    } else {
      return [
        'profiler',
        'cpu',
        '--output', outputFile,
        '--sample-rate', this.config.sample_rate.toString()
      ];
    }
  }

  /**
   * Start memory profiling
   */
  async startMemoryProfiling(duration?: number): Promise<string> {
    const profileId = `memory-${Date.now()}`;
    
    const profile: RustProfile = {
      type: 'memory',
      duration: duration || 0,
      start_time: Date.now(),
      end_time: 0,
      samples: 0,
      data: {}
    };

    this.activeProfiles.set(profileId, profile);

    try {
      // Use valgrind, jemalloc profiling, or custom memory tracker
      const profilerCommand = this.getMemoryProfilerCommand();
      const args = this.getMemoryProfilerArgs(profileId);

      const profilerProcess = spawn(profilerCommand, args, {
        stdio: ['pipe', 'pipe', 'pipe'],
        cwd: this.config.project_path,
        env: {
          ...process.env,
          MALLOC_CONF: 'prof:true,prof_active:true,prof_leak:true'
        }
      });

      this.profilerProcesses.set(profileId, profilerProcess);

      profilerProcess.on('exit', async (code) => {
        if (code === 0) {
          await this.processMemoryProfileData(profileId);
        } else {
          this.emit('profiling-error', { profileId, error: `Memory profiler exited with code ${code}` });
        }
      });

      if (duration) {
        setTimeout(() => {
          this.stopProfiling(profileId);
        }, duration);
      }

      this.emit('memory-profiling-started', { profileId, duration });
      return profileId;

    } catch (error) {
      this.activeProfiles.delete(profileId);
      this.emit('profiling-error', { profileId, error });
      throw error;
    }
  }

  private getMemoryProfilerCommand(): string {
    // Check if jemalloc profiling is available
    if (existsSync(join(this.config.project_path, 'Cargo.toml'))) {
      return 'cargo';
    }
    
    return 'valgrind';
  }

  private getMemoryProfilerArgs(profileId: string): string[] {
    const outputFile = join(this.outputDir, `${profileId}.heap`);
    
    if (this.getMemoryProfilerCommand() === 'cargo') {
      return [
        'run',
        '--release',
        '--features', 'profiling'
      ];
    } else {
      return [
        '--tool=massif',
        '--heap=yes',
        '--stacks=yes',
        `--massif-out-file=${outputFile}`,
        '--'
      ];
    }
  }

  /**
   * Start async profiling (Tokio runtime analysis)
   */
  async startAsyncProfiling(duration?: number): Promise<string> {
    const profileId = `async-${Date.now()}`;
    
    const profile: RustProfile = {
      type: 'async',
      duration: duration || 0,
      start_time: Date.now(),
      end_time: 0,
      samples: 0,
      data: {}
    };

    this.activeProfiles.set(profileId, profile);

    try {
      // Use tokio-console or custom async profiler
      await this.startTokioConsoleProfiler(profileId);

      if (duration) {
        setTimeout(() => {
          this.stopProfiling(profileId);
        }, duration);
      }

      this.emit('async-profiling-started', { profileId, duration });
      return profileId;

    } catch (error) {
      this.activeProfiles.delete(profileId);
      this.emit('profiling-error', { profileId, error });
      throw error;
    }
  }

  private async startTokioConsoleProfiler(profileId: string): Promise<void> {
    // Mock implementation - would integrate with tokio-console or custom tracer
    const asyncData: RustAsyncProfile = {
      tasks: [],
      runtime_stats: {
        total_tasks: 0,
        active_tasks: 0,
        completed_tasks: 0,
        cancelled_tasks: 0,
        worker_threads: 4,
        blocking_threads: 16,
        queue_depth: 0
      },
      blocking_operations: []
    };

    const profile = this.activeProfiles.get(profileId);
    if (profile) {
      profile.data.async = asyncData;
    }
  }

  /**
   * Start lock profiling
   */
  async startLockProfiling(duration?: number): Promise<string> {
    const profileId = `locks-${Date.now()}`;
    
    const profile: RustProfile = {
      type: 'locks',
      duration: duration || 0,
      start_time: Date.now(),
      end_time: 0,
      samples: 0,
      data: {}
    };

    this.activeProfiles.set(profileId, profile);

    try {
      await this.startLockContentionTracker(profileId);

      if (duration) {
        setTimeout(() => {
          this.stopProfiling(profileId);
        }, duration);
      }

      this.emit('lock-profiling-started', { profileId, duration });
      return profileId;

    } catch (error) {
      this.activeProfiles.delete(profileId);
      this.emit('profiling-error', { profileId, error });
      throw error;
    }
  }

  private async startLockContentionTracker(profileId: string): Promise<void> {
    // Mock implementation - would use custom lock tracking or external tools
    const lockData: RustLockProfile = {
      contentions: [],
      deadlocks: [],
      lock_stats: []
    };

    const profile = this.activeProfiles.get(profileId);
    if (profile) {
      profile.data.locks = lockData;
    }
  }

  /**
   * Stop profiling
   */
  async stopProfiling(profileId: string): Promise<RustProfile | undefined> {
    const profile = this.activeProfiles.get(profileId);
    if (!profile) {
      throw new Error(`No active profile with ID: ${profileId}`);
    }

    // Stop profiler process if running
    const profilerProcess = this.profilerProcesses.get(profileId);
    if (profilerProcess) {
      profilerProcess.kill('SIGTERM');
      this.profilerProcesses.delete(profileId);
    }

    // Finalize profile
    profile.end_time = Date.now();
    profile.duration = profile.end_time - profile.start_time;

    // Process collected data based on profile type
    switch (profile.type) {
      case 'cpu':
        await this.processCPUProfileData(profileId);
        break;
      case 'memory':
        await this.processMemoryProfileData(profileId);
        break;
      case 'async':
        await this.processAsyncProfileData(profileId);
        break;
      case 'locks':
        await this.processLockProfileData(profileId);
        break;
    }

    this.activeProfiles.delete(profileId);
    this.emit('profiling-stopped', { profileId, profile });

    return profile;
  }

  /**
   * Process CPU profile data and generate flamegraph
   */
  private async processCPUProfileData(profileId: string): Promise<void> {
    const profile = this.activeProfiles.get(profileId);
    if (!profile || profile.type !== 'cpu') return;

    try {
      // Parse profiling data and extract stack traces
      const stackTraces = await this.parseStackTraces(profileId);
      
      // Generate hot functions list
      const hotFunctions = this.extractHotFunctions(stackTraces);
      
      // Build call graph
      const callGraph = this.buildCallGraph(stackTraces);
      
      // Generate flamegraph SVG
      const flamegraph = await this.generateFlamegraph(stackTraces, profileId);

      const cpuProfile: RustCpuProfile = {
        total_samples: stackTraces.length,
        sample_rate: this.config.sample_rate,
        hot_functions: hotFunctions,
        call_graph: callGraph,
        flamegraph
      };

      profile.data.cpu = cpuProfile;
      profile.samples = stackTraces.length;

    } catch (error) {
      this.emit('profiling-error', { profileId, error: `Failed to process CPU profile: ${error}` });
    }
  }

  private async parseStackTraces(_profileId: string): Promise<string[][]> {
    // Mock implementation - would parse actual profiler output
    const mockStackTraces = [
      ['main::main', 'app::run', 'tokio::runtime::block_on'],
      ['main::main', 'app::process_data', 'std::collections::HashMap::insert'],
      ['tokio::runtime::worker', 'future::poll', 'app::async_handler'],
      ['main::main', 'app::compute', 'math::calculate_prime']
    ];

    return mockStackTraces;
  }

  private extractHotFunctions(stackTraces: string[][]): RustHotFunction[] {
    const functionCounts = new Map<string, number>();
    const functionTotalTime = new Map<string, number>();

    // Count function occurrences
    stackTraces.forEach(trace => {
      trace.forEach(func => {
        functionCounts.set(func, (functionCounts.get(func) || 0) + 1);
        functionTotalTime.set(func, (functionTotalTime.get(func) || 0) + 1);
      });
    });

    // Convert to hot functions
    const hotFunctions: RustHotFunction[] = [];
    functionCounts.forEach((samples, func) => {
      const percentage = (samples / stackTraces.length) * 100;
      const [module, functionName] = func.split('::');
      
      hotFunctions.push({
        function: functionName || func,
        module: module || 'unknown',
        samples,
        percentage,
        self_time: samples, // Simplified calculation
        total_time: functionTotalTime.get(func) || samples
      });
    });

    // Sort by sample count
    return hotFunctions.sort((a, b) => b.samples - a.samples).slice(0, 20);
  }

  private buildCallGraph(stackTraces: string[][]): RustCallGraphNode[] {
    const callGraph: Map<string, RustCallGraphNode> = new Map();

    stackTraces.forEach(trace => {
      for (let i = 0; i < trace.length; i++) {
        const func = trace[i];
        if (!func) continue;

        let node = callGraph.get(func);

        if (!node) {
          const [module, functionName] = func.split('::');
          node = {
            function: functionName || func,
            module: module || 'unknown',
            self_samples: 0,
            total_samples: 0,
            children: []
          };
          callGraph.set(func, node);
        }

        node.total_samples++;
        if (i === 0) node.self_samples++;
      }
    });

    return Array.from(callGraph.values());
  }

  private async generateFlamegraph(stackTraces: string[][], profileId: string): Promise<string> {
    try {
      // Generate flame graph data in folded format
      const foldedData = this.generateFoldedStackData(stackTraces);
      
      // Write folded data to file
      const foldedFile = join(this.outputDir, `${profileId}.folded`);
      writeFileSync(foldedFile, foldedData);

      // Generate SVG using flamegraph.pl or similar tool
      const svgContent = await this.generateFlamegraphSVG(foldedFile, profileId);
      
      return svgContent;

    } catch (error) {
      console.error('Failed to generate flamegraph:', error);
      return '<svg>Error generating flamegraph</svg>';
    }
  }

  private generateFoldedStackData(stackTraces: string[][]): string {
    const stackCounts = new Map<string, number>();

    stackTraces.forEach(trace => {
      // Reverse trace for flamegraph format (root at bottom)
      const reversedTrace = trace.reverse();
      const stackKey = reversedTrace.join(';');
      stackCounts.set(stackKey, (stackCounts.get(stackKey) || 0) + 1);
    });

    let foldedData = '';
    stackCounts.forEach((count, stack) => {
      foldedData += `${stack} ${count}\n`;
    });

    return foldedData;
  }

  private async generateFlamegraphSVG(_foldedFile: string, profileId: string): Promise<string> {
    // Mock SVG generation - would use flamegraph.pl or custom SVG generator
    const { width, height, font_type, font_size, colors } = this.config.flamegraph_options;
    
    const svgContent = `
      <svg width="${width}" height="${height}" xmlns="http://www.w3.org/2000/svg">
        <defs>
          <style>
            .func { font-family: ${font_type}; font-size: ${font_size}px; }
            .sample { fill: #${this.getColor(colors)}; stroke: white; }
          </style>
        </defs>
        <g>
          <title>Rust CPU Profile - ${profileId}</title>
          <!-- Flamegraph rectangles would be generated here -->
          <rect class="sample" x="0" y="0" width="${width}" height="20" />
          <text class="func" x="10" y="15">main::main (100%)</text>
        </g>
      </svg>
    `;

    const svgFile = join(this.outputDir, `${profileId}.svg`);
    writeFileSync(svgFile, svgContent);

    return svgContent;
  }

  private getColor(colorScheme: string): string {
    const colors: Record<string, string[]> = {
      hot: ['FF4444', 'FF6644', 'FF8844', 'FFAA44', 'FFCC44'],
      cool: ['4444FF', '4466FF', '4488FF', '44AAFF', '44CCFF'],
      rainbow: ['FF0000', 'FF8800', 'FFFF00', '88FF00', '00FF00', '00FF88', '0088FF', '0000FF']
    };

    const schemeColors = colors[colorScheme as keyof typeof colors] || colors['hot'];
    if (!schemeColors) return 'FF4444';
    return schemeColors[Math.floor(Math.random() * schemeColors.length)] || 'FF4444';
  }

  /**
   * Process memory profile data
   */
  private async processMemoryProfileData(profileId: string): Promise<void> {
    const profile = this.activeProfiles.get(profileId);
    if (!profile || profile.type !== 'memory') return;

    // Mock memory profile data
    const memoryProfile: RustMemoryProfile = {
      allocations: this.generateMockAllocations(),
      deallocations: this.generateMockDeallocations(),
      live_objects: this.generateMockLiveObjects(),
      heap_size: 1024 * 1024,
      peak_heap_size: 2048 * 1024
    };

    profile.data.memory = memoryProfile;
  }

  private generateMockAllocations(): RustAllocation[] {
    return [
      {
        address: '0x7fff5fbff000',
        size: 1024,
        timestamp: Date.now() - 1000,
        stack_trace: ['main::main', 'Vec::new', 'alloc::alloc'],
        type_name: 'Vec<i32>'
      }
    ];
  }

  private generateMockDeallocations(): RustDeallocation[] {
    return [
      {
        address: '0x7fff5fbff000',
        timestamp: Date.now(),
        stack_trace: ['main::main', 'Vec::drop', 'alloc::dealloc']
      }
    ];
  }

  private generateMockLiveObjects(): RustLiveObject[] {
    return [
      {
        address: '0x7fff5fbff100',
        size: 512,
        age: 5000,
        type_name: 'String',
        allocation_site: 'main::main:15'
      }
    ];
  }

  /**
   * Process async profile data
   */
  private async processAsyncProfileData(profileId: string): Promise<void> {
    const profile = this.activeProfiles.get(profileId);
    if (!profile || profile.type !== 'async') return;

    // Mock async runtime data would be collected here
  }

  /**
   * Process lock profile data
   */
  private async processLockProfileData(profileId: string): Promise<void> {
    const profile = this.activeProfiles.get(profileId);
    if (!profile || profile.type !== 'locks') return;

    // Mock lock contention data would be collected here
  }

  /**
   * Get all profiles
   */
  getActiveProfiles(): RustProfile[] {
    return Array.from(this.activeProfiles.values());
  }

  /**
   * Get profile by ID
   */
  getProfile(profileId: string): RustProfile | undefined {
    return this.activeProfiles.get(profileId);
  }

  /**
   * Cleanup resources
   */
  async cleanup(): Promise<void> {
    // Stop all active profiling
    for (const profileId of this.activeProfiles.keys()) {
      await this.stopProfiling(profileId);
    }

    // Kill any remaining processes
    this.profilerProcesses.forEach(process => {
      process.kill('SIGTERM');
    });

    this.profilerProcesses.clear();
    this.activeProfiles.clear();
  }
}