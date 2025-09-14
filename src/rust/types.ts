/**
 * Comprehensive Rust Debugging Types and Interfaces
 * Advanced type definitions for Rust and Tauri debugging
 */

// Core Rust debugging types
export interface RustMemoryInfo {
  heap: {
    allocated: number;
    deallocated: number;
    current: number;
    peak: number;
    leaks: RustMemoryLeak[];
  };
  stack: {
    size: number;
    used: number;
    frames: number;
  };
  static: {
    size: number;
    variables: RustStaticVariable[];
  };
}

export interface RustMemoryLeak {
  address: string;
  size: number;
  allocation_site: string;
  lifetime: number;
  type?: string;
}

export interface RustStaticVariable {
  name: string;
  type: string;
  size: number;
  address: string;
  initialized: boolean;
}

export interface RustOwnership {
  type: 'owned' | 'borrowed' | 'mutable_borrowed' | 'moved';
  variable: string;
  lifetime?: string;
  borrower?: string;
  move_location?: string;
  scope_end?: string;
}

export interface RustLifetime {
  name: string;
  start_line: number;
  end_line: number;
  variables: string[];
  references: RustReference[];
  constraints: RustLifetimeConstraint[];
}

export interface RustReference {
  variable: string;
  target: string;
  type: 'shared' | 'mutable';
  lifetime: string;
}

export interface RustLifetimeConstraint {
  from: string;
  to: string;
  relation: 'outlives' | 'equals';
}

export interface RustAsyncTask {
  id: number;
  name: string;
  state: 'created' | 'running' | 'suspended' | 'completed' | 'cancelled';
  executor: string;
  spawn_location: string;
  poll_count: number;
  total_time: number;
  suspend_points: RustSuspendPoint[];
  children: number[];
  parent?: number;
}

export interface RustSuspendPoint {
  location: string;
  reason: string;
  duration: number;
  timestamp: number;
}

export interface RustMacroExpansion {
  name: string;
  location: string;
  expansion: string;
  nested_expansions: RustMacroExpansion[];
  generated_code: string;
  original_code: string;
}

export interface RustUnsafeBlock {
  id: string;
  location: string;
  code: string;
  justification?: string;
  operations: RustUnsafeOperation[];
  verified: boolean;
}

export interface RustUnsafeOperation {
  type: 'raw_pointer_deref' | 'unsafe_trait_impl' | 'asm' | 'union_field_access' | 'static_mut_access';
  location: string;
  description: string;
  risk_level: 'low' | 'medium' | 'high';
}

// Tauri-specific types
export interface TauriApp {
  name: string;
  version: string;
  identifier: string;
  windows: TauriWindow[];
  commands: TauriCommand[];
  events: TauriEvent[];
  plugins: TauriPlugin[];
  config: TauriConfig;
}

export interface TauriWindow {
  id: string;
  label: string;
  title: string;
  url: string;
  webview_version: string;
  state: 'creating' | 'created' | 'visible' | 'hidden' | 'minimized' | 'maximized' | 'closing' | 'closed';
  size: { width: number; height: number };
  position: { x: number; y: number };
  focused: boolean;
  resizable: boolean;
  decorations: boolean;
  transparent: boolean;
  always_on_top: boolean;
  menu?: TauriMenu;
}

export interface TauriCommand {
  name: string;
  handler: string;
  parameters: TauriCommandParameter[];
  return_type: string;
  permissions: string[];
  async: boolean;
  invocation_count: number;
  average_duration: number;
  errors: TauriCommandError[];
}

export interface TauriCommandParameter {
  name: string;
  type: string;
  optional: boolean;
  validation?: string;
}

export interface TauriCommandError {
  timestamp: number;
  error: string;
  parameters: Record<string, any>;
  stack_trace: string;
}

export interface TauriEvent {
  name: string;
  payload_type: string;
  listeners: number;
  emit_count: number;
  last_emit: number;
}

export interface TauriPlugin {
  name: string;
  version: string;
  loaded: boolean;
  commands: string[];
  permissions: string[];
}

export interface TauriConfig {
  build: TauriBuildConfig;
  package: TauriPackageConfig;
  tauri: TauriAppConfig;
}

export interface TauriBuildConfig {
  dev_path: string;
  dist_dir: string;
  with_global_tauri: boolean;
}

export interface TauriPackageConfig {
  product_name: string;
  version: string;
}

export interface TauriAppConfig {
  bundle: TauriBundleConfig;
  security: TauriSecurityConfig;
  updater: TauriUpdaterConfig;
  system_tray?: TauriSystemTrayConfig;
  windows: TauriWindowConfig[];
}

export interface TauriBundleConfig {
  active: boolean;
  targets: string[];
  identifier: string;
  icon: string[];
  resources: string[];
  external_bin: string[];
  copyright?: string;
  category?: string;
  short_description?: string;
  long_description?: string;
}

export interface TauriSecurityConfig {
  csp?: string;
  dev_csp?: string;
  freeze_prototype: boolean;
  dangerous_disable_asset_csp_modification: boolean;
}

export interface TauriUpdaterConfig {
  active: boolean;
  endpoints: string[];
  dialog: boolean;
  pubkey?: string;
}

export interface TauriSystemTrayConfig {
  icon_path: string;
  icon_as_template: boolean;
  menu_on_left_click: boolean;
}

export interface TauriWindowConfig {
  label: string;
  url: string;
  width: number;
  height: number;
  min_width?: number;
  min_height?: number;
  max_width?: number;
  max_height?: number;
  resizable: boolean;
  title: string;
  fullscreen: boolean;
  focus: boolean;
  transparent: boolean;
  maximized: boolean;
  visible: boolean;
  decorations: boolean;
  always_on_top: boolean;
  skip_taskbar: boolean;
}

export interface TauriMenu {
  items: TauriMenuItem[];
}

export interface TauriMenuItem {
  id: string;
  text: string;
  accelerator?: string;
  enabled: boolean;
  submenu?: TauriMenuItem[];
  action?: string;
}

export interface TauriIPCMessage {
  id: string;
  timestamp: number;
  direction: 'frontend_to_backend' | 'backend_to_frontend';
  type: 'command' | 'event' | 'response';
  command?: string;
  event?: string;
  payload: any;
  response?: any;
  error?: string;
  duration?: number;
  window_label: string;
}

// Cargo-specific types
export interface CargoDependency {
  name: string;
  version: string;
  source: 'registry' | 'git' | 'path' | 'local';
  registry?: string;
  git?: string;
  path?: string;
  features: string[];
  optional: boolean;
  default_features: boolean;
  kind: 'normal' | 'dev' | 'build';
}

export interface CargoWorkspace {
  root: string;
  members: string[];
  exclude: string[];
  resolver: '1' | '2';
  default_members: string[];
}

export interface CargoPackage {
  name: string;
  version: string;
  authors: string[];
  edition: string;
  description?: string;
  license?: string;
  repository?: string;
  homepage?: string;
  keywords: string[];
  categories: string[];
  publish: boolean;
  dependencies: CargoDependency[];
  dev_dependencies: CargoDependency[];
  build_dependencies: CargoDependency[];
  features: Record<string, string[]>;
  default_features: string[];
  bins: CargoBinary[];
  lib?: CargoLibrary;
  tests: CargoTest[];
  benches: CargoBenchmark[];
  examples: CargoExample[];
}

export interface CargoBinary {
  name: string;
  path: string;
  required_features: string[];
}

export interface CargoLibrary {
  name: string;
  path: string;
  crate_type: string[];
  required_features: string[];
}

export interface CargoTest {
  name: string;
  path: string;
  harness: boolean;
  required_features: string[];
}

export interface CargoBenchmark {
  name: string;
  path: string;
  harness: boolean;
  required_features: string[];
}

export interface CargoExample {
  name: string;
  path: string;
  crate_type: string[];
  required_features: string[];
}

// Profiling types
export interface RustProfile {
  type: 'cpu' | 'memory' | 'async' | 'locks';
  duration: number;
  start_time: number;
  end_time: number;
  samples: number;
  data: RustProfileData;
}

export interface RustProfileData {
  cpu?: RustCpuProfile;
  memory?: RustMemoryProfile;
  async?: RustAsyncProfile;
  locks?: RustLockProfile;
}

export interface RustCpuProfile {
  total_samples: number;
  sample_rate: number;
  hot_functions: RustHotFunction[];
  call_graph: RustCallGraphNode[];
  flamegraph: string; // SVG data
}

export interface RustHotFunction {
  function: string;
  module: string;
  samples: number;
  percentage: number;
  self_time: number;
  total_time: number;
}

export interface RustCallGraphNode {
  function: string;
  module: string;
  self_samples: number;
  total_samples: number;
  children: RustCallGraphNode[];
}

export interface RustMemoryProfile {
  allocations: RustAllocation[];
  deallocations: RustDeallocation[];
  live_objects: RustLiveObject[];
  heap_size: number;
  peak_heap_size: number;
}

export interface RustAllocation {
  address: string;
  size: number;
  timestamp: number;
  stack_trace: string[];
  type_name?: string;
}

export interface RustDeallocation {
  address: string;
  timestamp: number;
  stack_trace: string[];
}

export interface RustLiveObject {
  address: string;
  size: number;
  age: number;
  type_name?: string;
  allocation_site: string;
}

export interface RustAsyncProfile {
  tasks: RustAsyncTask[];
  runtime_stats: RustAsyncRuntimeStats;
  blocking_operations: RustBlockingOperation[];
}

export interface RustAsyncRuntimeStats {
  total_tasks: number;
  active_tasks: number;
  completed_tasks: number;
  cancelled_tasks: number;
  worker_threads: number;
  blocking_threads: number;
  queue_depth: number;
}

export interface RustBlockingOperation {
  task_id: number;
  operation: string;
  duration: number;
  timestamp: number;
}

export interface RustLockProfile {
  contentions: RustLockContention[];
  deadlocks: RustDeadlock[];
  lock_stats: RustLockStats[];
}

export interface RustLockContention {
  lock_id: string;
  contending_threads: number[];
  wait_time: number;
  timestamp: number;
  location: string;
}

export interface RustDeadlock {
  threads: number[];
  locks: string[];
  cycle: string[];
  timestamp: number;
}

export interface RustLockStats {
  lock_id: string;
  acquisitions: number;
  contentions: number;
  average_hold_time: number;
  max_hold_time: number;
}

// WASM-specific types
export interface RustWasmModule {
  name: string;
  size: number;
  functions: RustWasmFunction[];
  globals: RustWasmGlobal[];
  memory: RustWasmMemory;
  tables: RustWasmTable[];
  imports: RustWasmImport[];
  exports: RustWasmExport[];
}

export interface RustWasmFunction {
  index: number;
  name?: string;
  signature: string;
  locals: RustWasmLocal[];
  instructions: number;
}

export interface RustWasmLocal {
  index: number;
  type: string;
}

export interface RustWasmGlobal {
  index: number;
  type: string;
  mutable: boolean;
  value: any;
}

export interface RustWasmMemory {
  initial: number;
  maximum?: number;
  shared: boolean;
}

export interface RustWasmTable {
  index: number;
  element_type: string;
  initial: number;
  maximum?: number;
}

export interface RustWasmImport {
  module: string;
  name: string;
  type: 'function' | 'memory' | 'table' | 'global';
  signature?: string;
}

export interface RustWasmExport {
  name: string;
  type: 'function' | 'memory' | 'table' | 'global';
  index: number;
}

// Error and recovery types
export interface RustPanic {
  message: string;
  location: string;
  thread: string;
  backtrace: string[];
  payload: any;
  timestamp: number;
  recovered: boolean;
}

export interface RustSegfault {
  address: string;
  instruction_pointer: string;
  thread: string;
  signal: string;
  backtrace: string[];
  timestamp: number;
  context: Record<string, any>;
}

export interface RustStackOverflow {
  thread: string;
  stack_size: number;
  overflow_location: string;
  backtrace: string[];
  timestamp: number;
}

// Configuration types
export interface RustDebuggerConfig {
  debugger: 'gdb' | 'lldb' | 'codelldb' | 'lldb-dap' | 'rust-gdb' | 'rust-lldb';
  host: string;
  port: number;
  project_path: string;
  target: string;
  features: string[];
  profile: 'debug' | 'release';
  toolchain: string;
  enable_pretty_printing: boolean;
  enable_async_debugging: boolean;
  enable_ownership_tracking: boolean;
  enable_lifetime_analysis: boolean;
  enable_unsafe_tracking: boolean;
  enable_macro_debugging: boolean;
  enable_tauri_debugging: boolean;
  enable_profiling: boolean;
  enable_wasm_debugging: boolean;
  timeout: number;
  attach_mode: boolean;
  auto_restart: boolean;
}

export interface WasmDebuggerConfig {
  project_path: string;
  wasm_file: string;
  source_map?: string;
  host: string;
  port: number;
  enable_source_maps: boolean;
  enable_memory_inspection: boolean;
  enable_function_profiling: boolean;
  enable_browser_devtools: boolean;
  chrome_debugging_port: number;
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
  function_name: string;
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

export interface CargoBuildResult {
  success: boolean;
  output: string;
  errors: string;
  warnings: string[];
  duration: number;
  artifacts: string[];
}

export interface CargoIntegrationConfig {
  project_path: string;
  toolchain?: string;
  target?: string;
  features: string[];
  profile: 'debug' | 'release';
  workspace?: boolean;
}

// Variable inspection types
export interface RustVariableInfo {
  name: string;
  value: string;
  type: string;
  ownership: 'owned' | 'borrowed' | 'shared' | 'unknown';
  lifetime: string;
  memoryLocation: string;
  isMutable: boolean;
  isReference: boolean;
  size: string;
}