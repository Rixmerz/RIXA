/**
 * Cargo Integration Module
 * Provides comprehensive Cargo workspace support, test debugging,
 * benchmark analysis, and build system integration
 */

import { EventEmitter } from 'events';
import { existsSync, readFileSync } from 'fs';
import { join } from 'path';
import { spawn, ChildProcess } from 'child_process';
import { promisify } from 'util';
import { exec } from 'child_process';
import type {
  CargoPackage,
  CargoDependency,
  CargoWorkspace
} from './types.js';

const execAsync = promisify(exec);

export interface CargoIntegrationConfig {
  project_path: string;
  toolchain?: string;
  target?: string;
  features: string[];
  profile: 'debug' | 'release';
  enable_test_debugging: boolean;
  enable_bench_profiling: boolean;
  enable_example_debugging: boolean;
  timeout: number;
}

export interface CargoTestResult {
  name: string;
  status: 'passed' | 'failed' | 'ignored' | 'timeout';
  duration: number;
  output?: string;
  error?: string;
  location?: string;
}

export interface CargoBenchResult {
  name: string;
  throughput?: number;
  latency?: number;
  memory_usage?: number;
  output: string;
  iterations: number;
}

export interface CargoBuildResult {
  success: boolean;
  duration: number;
  artifacts: string[];
  warnings: CargoWarning[];
  errors: CargoError[];
  output: string;
}

export interface CargoWarning {
  message: string;
  file?: string;
  line?: number;
  column?: number;
  code?: string;
}

export interface CargoError {
  message: string;
  file?: string;
  line?: number;
  column?: number;
  code?: string;
  suggestion?: string;
}

export class CargoIntegration extends EventEmitter {
  private config: CargoIntegrationConfig;
  private cargoToml?: CargoPackage;
  private workspace?: CargoWorkspace;
  private runningProcesses: Map<string, ChildProcess> = new Map();

  constructor(config: CargoIntegrationConfig) {
    super();
    this.config = {
      features: config.features || [],
      profile: config.profile || 'debug',
      enable_test_debugging: config.enable_test_debugging !== false,
      enable_bench_profiling: config.enable_bench_profiling !== false,
      enable_example_debugging: config.enable_example_debugging !== false,
      timeout: config.timeout || 300000, // 5 minutes
      project_path: config.project_path,
      ...(config.target && { target: config.target }),
      ...(config.toolchain && { toolchain: config.toolchain })
    };
  }

  /**
   * Initialize Cargo integration
   */
  async initialize(): Promise<void> {
    try {
      // Check if cargo is available
      await this.checkCargoAvailability();

      // Load Cargo.toml
      await this.loadCargoToml();

      // Load workspace if it exists
      await this.loadWorkspace();

      // Analyze dependencies
      await this.analyzeDependencies();

      this.emit('cargo-initialized');
    } catch (error) {
      this.emit('cargo-error', error);
      throw error;
    }
  }

  /**
   * Check if Cargo is available
   */
  private async checkCargoAvailability(): Promise<void> {
    try {
      const toolchain = this.config.toolchain ? `+${this.config.toolchain}` : '';
      await execAsync(`cargo ${toolchain} --version`);
    } catch (error) {
      throw new Error(`Cargo not available: ${error}`);
    }
  }

  /**
   * Load and parse Cargo.toml
   */
  private async loadCargoToml(): Promise<void> {
    const cargoTomlPath = join(this.config.project_path, 'Cargo.toml');
    
    if (!existsSync(cargoTomlPath)) {
      throw new Error('Cargo.toml not found');
    }

    try {
      const cargoTomlContent = readFileSync(cargoTomlPath, 'utf-8');
      this.cargoToml = this.parseCargoToml(cargoTomlContent);
      
      this.emit('cargo-toml-loaded', this.cargoToml);
    } catch (error) {
      throw new Error(`Failed to parse Cargo.toml: ${error}`);
    }
  }

  /**
   * Parse Cargo.toml content
   */
  private parseCargoToml(content: string): CargoPackage {
    // Simplified TOML parsing - in production, use a proper TOML parser
    const lines = content.split('\n');
    
    const packageConfig: Partial<CargoPackage> = {
      dependencies: [],
      dev_dependencies: [],
      build_dependencies: [],
      features: {},
      default_features: [],
      bins: [],
      tests: [],
      benches: [],
      examples: [],
      keywords: [],
      categories: []
    };

    let currentSection = '';
    
    for (const line of lines) {
      const trimmedLine = line.trim();
      
      if (trimmedLine.startsWith('[') && trimmedLine.endsWith(']')) {
        currentSection = trimmedLine.slice(1, -1);
        continue;
      }

      if (currentSection === 'package') {
        this.parsePackageSection(trimmedLine, packageConfig);
      } else if (currentSection === 'dependencies') {
        this.parseDependencySection(trimmedLine, packageConfig.dependencies!);
      } else if (currentSection === 'dev-dependencies') {
        this.parseDependencySection(trimmedLine, packageConfig.dev_dependencies!);
      } else if (currentSection === 'build-dependencies') {
        this.parseDependencySection(trimmedLine, packageConfig.build_dependencies!);
      } else if (currentSection.startsWith('features')) {
        this.parseFeaturesSection(trimmedLine, packageConfig.features!);
      }
    }

    return packageConfig as CargoPackage;
  }

  private parsePackageSection(line: string, packageConfig: Partial<CargoPackage>): void {
    const [key, value] = line.split('=').map(s => s.trim());
    if (!key || !value) return;

    const cleanValue = value.replace(/['"]/g, '');

    switch (key) {
      case 'name':
        packageConfig.name = cleanValue;
        break;
      case 'version':
        packageConfig.version = cleanValue;
        break;
      case 'edition':
        packageConfig.edition = cleanValue;
        break;
      case 'description':
        packageConfig.description = cleanValue;
        break;
      case 'license':
        packageConfig.license = cleanValue;
        break;
      case 'repository':
        packageConfig.repository = cleanValue;
        break;
      case 'homepage':
        packageConfig.homepage = cleanValue;
        break;
    }
  }

  private parseDependencySection(line: string, dependencies: CargoDependency[]): void {
    const [name, spec] = line.split('=').map(s => s.trim());
    if (!name || !spec) return;

    const dependency: CargoDependency = {
      name,
      version: spec.replace(/['"]/g, ''),
      source: 'registry',
      features: [],
      optional: false,
      default_features: true,
      kind: 'normal'
    };

    dependencies.push(dependency);
  }

  private parseFeaturesSection(line: string, features: Record<string, string[]>): void {
    const [feature, deps] = line.split('=').map(s => s.trim());
    if (!feature || !deps) return;

    const cleanDeps = deps.replace(/[\[\]"']/g, '').split(',').map(s => s.trim());
    features[feature] = cleanDeps;
  }

  /**
   * Load workspace information
   */
  private async loadWorkspace(): Promise<void> {
    const workspaceTomlPath = join(this.config.project_path, 'Cargo.toml');
    
    if (existsSync(workspaceTomlPath)) {
      const content = readFileSync(workspaceTomlPath, 'utf-8');
      
      if (content.includes('[workspace]')) {
        this.workspace = this.parseWorkspace(content);
        this.emit('workspace-loaded', this.workspace);
      }
    }
  }

  private parseWorkspace(content: string): CargoWorkspace {
    // Simplified workspace parsing
    const workspace: CargoWorkspace = {
      root: this.config.project_path,
      members: [],
      exclude: [],
      resolver: '2',
      default_members: []
    };

    const lines = content.split('\n');
    let inWorkspaceSection = false;

    for (const line of lines) {
      const trimmedLine = line.trim();
      
      if (trimmedLine === '[workspace]') {
        inWorkspaceSection = true;
        continue;
      }

      if (trimmedLine.startsWith('[') && trimmedLine !== '[workspace]') {
        inWorkspaceSection = false;
        continue;
      }

      if (inWorkspaceSection && trimmedLine.startsWith('members')) {
        const membersMatch = trimmedLine.match(/members\s*=\s*\[(.*?)\]/);
        if (membersMatch && membersMatch[1]) {
          workspace.members = membersMatch[1]
            .split(',')
            .map(s => s.trim().replace(/['"]/g, ''));
        }
      }
    }

    return workspace;
  }

  /**
   * Analyze dependencies
   */
  private async analyzeDependencies(): Promise<void> {
    try {
      const { stdout } = await execAsync('cargo tree --format "{p} {f}"', {
        cwd: this.config.project_path
      });

      // Parse dependency tree
      this.parseDependencyTree(stdout);
      this.emit('dependencies-analyzed');
    } catch (error) {
      console.warn('Failed to analyze dependencies:', error);
    }
  }

  private parseDependencyTree(treeOutput: string): void {
    // Parse cargo tree output to enhance dependency information
    const lines = treeOutput.split('\n');
    
    for (const line of lines) {
      if (line.trim()) {
        // Parse each dependency line (implementation pending)
        // const [packageInfo, features] = line.split(' {');
        // Update dependency information with actual versions and features
      }
    }
  }

  /**
   * Build project
   */
  async build(options: {
    profile?: 'debug' | 'release';
    features?: string[];
    target?: string;
    verbose?: boolean;
  } = {}): Promise<CargoBuildResult> {
    const startTime = Date.now();
    const buildId = `build-${startTime}`;

    try {
      const args = this.buildCargoArgs('build', options);
      const process = spawn('cargo', args, {
        cwd: this.config.project_path,
        stdio: ['pipe', 'pipe', 'pipe']
      });

      this.runningProcesses.set(buildId, process);

      let output = '';
      let errors = '';

      process.stdout?.on('data', (data) => {
        output += data.toString();
        this.emit('build-output', data.toString());
      });

      process.stderr?.on('data', (data) => {
        errors += data.toString();
        this.emit('build-error', data.toString());
      });

      const exitCode = await this.waitForProcess(process);
      const duration = Date.now() - startTime;

      const result: CargoBuildResult = {
        success: exitCode === 0,
        duration,
        artifacts: this.extractArtifacts(output),
        warnings: this.parseWarnings(errors),
        errors: this.parseErrors(errors),
        output: output + errors
      };

      this.runningProcesses.delete(buildId);
      this.emit('build-completed', result);

      return result;

    } catch (error) {
      this.runningProcesses.delete(buildId);
      throw new Error(`Build failed: ${error}`);
    }
  }

  /**
   * Run tests
   */
  async runTests(options: {
    test_name?: string;
    features?: string[];
    profile?: 'debug' | 'release';
    nocapture?: boolean;
  } = {}): Promise<CargoTestResult[]> {
    const testId = `test-${Date.now()}`;

    try {
      const args = this.buildCargoArgs('test', options);
      if (options.nocapture) {
        args.push('--', '--nocapture');
      }

      const process = spawn('cargo', args, {
        cwd: this.config.project_path,
        stdio: ['pipe', 'pipe', 'pipe']
      });

      this.runningProcesses.set(testId, process);

      let output = '';
      process.stdout?.on('data', (data) => {
        output += data.toString();
        this.emit('test-output', data.toString());
      });

      process.stderr?.on('data', (data) => {
        output += data.toString();
        this.emit('test-error', data.toString());
      });

      const exitCode = await this.waitForProcess(process);
      const results = this.parseTestResults(output);

      this.runningProcesses.delete(testId);
      this.emit('tests-completed', { results, exitCode });

      return results;

    } catch (error) {
      this.runningProcesses.delete(testId);
      throw new Error(`Test run failed: ${error}`);
    }
  }

  /**
   * Run benchmarks
   */
  async runBenchmarks(options: {
    bench_name?: string;
    features?: string[];
  } = {}): Promise<CargoBenchResult[]> {
    const benchId = `bench-${Date.now()}`;

    try {
      const args = this.buildCargoArgs('bench', options);
      
      const process = spawn('cargo', args, {
        cwd: this.config.project_path,
        stdio: ['pipe', 'pipe', 'pipe']
      });

      this.runningProcesses.set(benchId, process);

      let output = '';
      process.stdout?.on('data', (data) => {
        output += data.toString();
        this.emit('bench-output', data.toString());
      });

      const exitCode = await this.waitForProcess(process);
      const results = this.parseBenchResults(output);

      this.runningProcesses.delete(benchId);
      this.emit('benchmarks-completed', { results, exitCode });

      return results;

    } catch (error) {
      this.runningProcesses.delete(benchId);
      throw new Error(`Benchmark run failed: ${error}`);
    }
  }

  /**
   * Run example
   */
  async runExample(exampleName: string, args: string[] = []): Promise<void> {
    const exampleId = `example-${exampleName}-${Date.now()}`;

    try {
      const cargoArgs = ['run', '--example', exampleName];
      if (args.length > 0) {
        cargoArgs.push('--', ...args);
      }

      const process = spawn('cargo', cargoArgs, {
        cwd: this.config.project_path,
        stdio: ['pipe', 'pipe', 'pipe']
      });

      this.runningProcesses.set(exampleId, process);

      process.stdout?.on('data', (data) => {
        this.emit('example-output', { example: exampleName, data: data.toString() });
      });

      process.stderr?.on('data', (data) => {
        this.emit('example-error', { example: exampleName, data: data.toString() });
      });

      const exitCode = await this.waitForProcess(process);
      this.runningProcesses.delete(exampleId);
      
      this.emit('example-completed', { example: exampleName, exitCode });

    } catch (error) {
      this.runningProcesses.delete(exampleId);
      throw new Error(`Example run failed: ${error}`);
    }
  }

  /**
   * Get package metadata
   */
  async getMetadata(): Promise<any> {
    try {
      const { stdout } = await execAsync('cargo metadata --format-version 1', {
        cwd: this.config.project_path
      });

      return JSON.parse(stdout);
    } catch (error) {
      throw new Error(`Failed to get metadata: ${error}`);
    }
  }

  /**
   * Check for outdated dependencies
   */
  async checkOutdated(): Promise<any[]> {
    try {
      const { stdout } = await execAsync('cargo outdated --format json', {
        cwd: this.config.project_path
      });

      return JSON.parse(stdout);
    } catch (error) {
      console.warn('cargo-outdated not available or failed:', error);
      return [];
    }
  }

  /**
   * Run clippy (linter)
   */
  async runClippy(options: { fix?: boolean } = {}): Promise<CargoError[]> {
    try {
      const args = ['clippy'];
      if (options.fix) {
        args.push('--fix');
      }

      const { stdout, stderr } = await execAsync(`cargo ${args.join(' ')}`, {
        cwd: this.config.project_path
      });

      return this.parseClippyOutput(stdout + stderr);
    } catch (error) {
      // Clippy may exit with non-zero code even on warnings
      if (error && typeof error === 'object' && 'stdout' in error && 'stderr' in error) {
        return this.parseClippyOutput((error as any).stdout + (error as any).stderr);
      }
      throw error;
    }
  }

  /**
   * Format code
   */
  async formatCode(check: boolean = false): Promise<boolean> {
    try {
      const args = ['fmt'];
      if (check) {
        args.push('--check');
      }

      await execAsync(`cargo ${args.join(' ')}`, {
        cwd: this.config.project_path
      });

      return true;
    } catch (error) {
      if (check) {
        // In check mode, non-zero exit means formatting needed
        return false;
      }
      throw error;
    }
  }

  /**
   * Build Cargo command arguments
   */
  private buildCargoArgs(command: string, options: any): string[] {
    const args = [command];

    if (this.config.toolchain) {
      args.unshift(`+${this.config.toolchain}`);
    }

    if (options.profile === 'release') {
      args.push('--release');
    }

    if (options.features && options.features.length > 0) {
      args.push('--features', options.features.join(','));
    }

    if (options.target) {
      args.push('--target', options.target);
    }

    if (options.test_name) {
      args.push(options.test_name);
    }

    if (options.bench_name) {
      args.push(options.bench_name);
    }

    if (options.verbose) {
      args.push('--verbose');
    }

    return args;
  }

  /**
   * Wait for process to complete
   */
  private waitForProcess(process: ChildProcess): Promise<number> {
    return new Promise((resolve, reject) => {
      const timeout = setTimeout(() => {
        process.kill('SIGTERM');
        reject(new Error('Process timeout'));
      }, this.config.timeout);

      process.on('exit', (code) => {
        clearTimeout(timeout);
        resolve(code || 0);
      });

      process.on('error', (error) => {
        clearTimeout(timeout);
        reject(error);
      });
    });
  }

  /**
   * Extract build artifacts
   */
  private extractArtifacts(output: string): string[] {
    const artifacts: string[] = [];
    const lines = output.split('\n');

    for (const line of lines) {
      if (line.includes('Finished') && line.includes('target')) {
        const match = line.match(/target\/[^\s]+/);
        if (match) {
          artifacts.push(match[0]);
        }
      }
    }

    return artifacts;
  }

  /**
   * Parse compiler warnings
   */
  private parseWarnings(output: string): CargoWarning[] {
    const warnings: CargoWarning[] = [];
    const lines = output.split('\n');

    for (let i = 0; i < lines.length; i++) {
      const line = lines[i];
      if (line && line.includes('warning:')) {
        const warning: CargoWarning = {
          message: line.replace(/^warning:\s*/, '')
        };

        // Look for file location
        if (i > 0 && lines[i - 1] && lines[i - 1]!.includes('-->')) {
          const locationMatch = lines[i - 1]!.match(/-->\s*([^:]+):(\d+):(\d+)/);
          if (locationMatch && locationMatch[1] && locationMatch[2] && locationMatch[3]) {
            warning.file = locationMatch[1];
            warning.line = parseInt(locationMatch[2]);
            warning.column = parseInt(locationMatch[3]);
          }
        }

        warnings.push(warning);
      }
    }

    return warnings;
  }

  /**
   * Parse compiler errors
   */
  private parseErrors(output: string): CargoError[] {
    const errors: CargoError[] = [];
    const lines = output.split('\n');

    for (let i = 0; i < lines.length; i++) {
      const line = lines[i];
      if (line && (line.includes('error:') || line.includes('error['))) {
        const error: CargoError = {
          message: line.replace(/^error(\[[^\]]+\])?\s*:\s*/, '')
        };

        // Extract error code
        const codeMatch = line.match(/error\[([^\]]+)\]/);
        if (codeMatch && codeMatch[1]) {
          error.code = codeMatch[1];
        }

        // Look for file location
        if (i > 0 && lines[i - 1] && lines[i - 1]!.includes('-->')) {
          const locationMatch = lines[i - 1]!.match(/-->\s*([^:]+):(\d+)/);
          if (locationMatch && locationMatch[1] && locationMatch[2] && locationMatch[3]) {
            error.file = locationMatch[1];
            error.line = parseInt(locationMatch[2]);
            error.column = parseInt(locationMatch[3]);
          }
        }

        errors.push(error);
      }
    }

    return errors;
  }

  /**
   * Parse test results
   */
  private parseTestResults(output: string): CargoTestResult[] {
    const results: CargoTestResult[] = [];
    const lines = output.split('\n');

    for (const line of lines) {
      const testMatch = line.match(/test\s+([^\s]+)\s+\.\.\.\s+(ok|FAILED|ignored)\s*(?:\(([^)]+)\))?/);
      if (testMatch && testMatch[1] && testMatch[2]) {
        const result: CargoTestResult = {
          name: testMatch[1],
          status: testMatch[2].toLowerCase() as any,
          duration: 0
        };

        if (testMatch[3]) {
          // Parse duration
          const durationMatch = testMatch[3].match(/([\d.]+)ms/);
          if (durationMatch && durationMatch[1]) {
            result.duration = parseFloat(durationMatch[1]);
          }
        }

        results.push(result);
      }
    }

    return results;
  }

  /**
   * Parse benchmark results
   */
  private parseBenchResults(output: string): CargoBenchResult[] {
    const results: CargoBenchResult[] = [];
    const lines = output.split('\n');

    for (const line of lines) {
      const benchMatch = line.match(/test\s+([^\s]+)\s+\.\.\.\s+bench:\s+([\d,]+)\s+ns\/iter\s*\(\+\/\-\s*([\d,]+)\)/);
      if (benchMatch && benchMatch[1] && benchMatch[2]) {
        const result: CargoBenchResult = {
          name: benchMatch[1],
          latency: parseInt(benchMatch[2].replace(/,/g, '')),
          output: line,
          iterations: 1
        };

        results.push(result);
      }
    }

    return results;
  }

  /**
   * Parse clippy output
   */
  private parseClippyOutput(output: string): CargoError[] {
    // Similar to parseErrors but for clippy-specific format
    return this.parseErrors(output);
  }

  /**
   * Get package information
   */
  getPackage(): CargoPackage | undefined {
    return this.cargoToml;
  }

  /**
   * Get workspace information
   */
  getWorkspace(): CargoWorkspace | undefined {
    return this.workspace;
  }

  /**
   * Stop all running processes
   */
  async stopAll(): Promise<void> {
    const processes = Array.from(this.runningProcesses.values());
    
    for (const process of processes) {
      process.kill('SIGTERM');
    }

    this.runningProcesses.clear();
    this.emit('all-processes-stopped');
  }

  /**
   * Cleanup resources
   */
  async cleanup(): Promise<void> {
    await this.stopAll();
  }
}