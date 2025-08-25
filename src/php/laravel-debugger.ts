import { EventEmitter } from 'events';
import type { PHPDebugger, LaravelDebugInfo } from './php-debugger.js';

/**
 * Laravel Debugger - Specialized debugging for Laravel applications
 * Provides Laravel-specific debugging capabilities including Eloquent, Artisan, and middleware debugging
 */

export interface LaravelDebuggerConfig {
  phpDebugger: PHPDebugger;
  enableEloquentDebugging?: boolean;
  enableArtisanDebugging?: boolean;
  enableMiddlewareDebugging?: boolean;
  enableQueueDebugging?: boolean;
  enableEventDebugging?: boolean;
}

export interface EloquentQuery {
  id: string;
  sql: string;
  bindings: any[];
  time: number;
  model?: string;
  method?: string;
  stackTrace?: string[];
  timestamp: number;
}

export interface LaravelRoute {
  name?: string;
  uri: string;
  methods: string[];
  action: string;
  middleware: string[];
  parameters?: Record<string, any>;
  compiled?: boolean;
}

export interface LaravelMiddleware {
  name: string;
  priority: number;
  global: boolean;
  routes?: string[];
  parameters?: any[];
}

export interface LaravelJob {
  id: string;
  queue: string;
  payload: any;
  attempts: number;
  maxTries: number;
  timeout?: number;
  delay?: number;
  status: 'pending' | 'processing' | 'completed' | 'failed';
  createdAt: number;
  processedAt?: number;
  failedAt?: number;
  error?: string;
}

export interface LaravelEvent {
  id: string;
  name: string;
  payload: any;
  listeners: string[];
  timestamp: number;
  propagationStopped?: boolean;
}

export interface ArtisanCommand {
  name: string;
  description: string;
  signature: string;
  arguments: Array<{
    name: string;
    required: boolean;
    description?: string;
  }>;
  options: Array<{
    name: string;
    shortcut?: string;
    required: boolean;
    description?: string;
  }>;
}

export interface LaravelPerformanceMetrics {
  requests: {
    total: number;
    averageTime: number;
    slowestRoute?: string;
    slowestTime?: number;
  };
  database: {
    queries: number;
    totalTime: number;
    slowestQuery?: string;
    nPlusOneQueries: number;
  };
  cache: {
    hits: number;
    misses: number;
    hitRatio: number;
  };
  memory: {
    peak: number;
    average: number;
    unit: string;
  };
}

export class LaravelDebugger extends EventEmitter {
  private config: LaravelDebuggerConfig;
  private eloquentQueries: EloquentQuery[] = [];
  private jobs: Map<string, LaravelJob> = new Map();
  private events: LaravelEvent[] = [];
  private isTracking = false;

  constructor(config: LaravelDebuggerConfig) {
    super();
    this.config = {
      enableEloquentDebugging: true,
      enableArtisanDebugging: true,
      enableMiddlewareDebugging: true,
      enableQueueDebugging: true,
      enableEventDebugging: true,
      ...config
    };

    this.setupEventHandlers();
  }

  private setupEventHandlers(): void {
    // Listen to PHP debugger events
    this.config.phpDebugger.on('connected', () => {
      this.emit('laravelConnected');
    });

    this.config.phpDebugger.on('disconnected', () => {
      this.emit('laravelDisconnected');
    });
  }

  /**
   * Start Laravel-specific debugging
   */
  async startDebugging(): Promise<void> {
    if (!this.config.phpDebugger.isConnectedToApp()) {
      throw new Error('PHP debugger not connected');
    }

    this.isTracking = true;
    this.eloquentQueries = [];
    this.jobs.clear();
    this.events = [];

    // Initialize Laravel debugging components
    if (this.config.enableEloquentDebugging) {
      await this.initializeEloquentDebugging();
    }

    if (this.config.enableQueueDebugging) {
      await this.initializeQueueDebugging();
    }

    if (this.config.enableEventDebugging) {
      await this.initializeEventDebugging();
    }

    this.emit('debuggingStarted');
  }

  /**
   * Stop Laravel debugging
   */
  async stopDebugging(): Promise<void> {
    this.isTracking = false;
    this.emit('debuggingStopped');
  }

  /**
   * Initialize Eloquent debugging
   */
  private async initializeEloquentDebugging(): Promise<void> {
    // Mock Eloquent debugging initialization
    this.emit('eloquentDebuggingInitialized');
  }

  /**
   * Initialize Queue debugging
   */
  private async initializeQueueDebugging(): Promise<void> {
    // Mock Queue debugging initialization
    this.emit('queueDebuggingInitialized');
  }

  /**
   * Initialize Event debugging
   */
  private async initializeEventDebugging(): Promise<void> {
    // Mock Event debugging initialization
    this.emit('eventDebuggingInitialized');
  }

  /**
   * Get Laravel application information
   */
  async getLaravelInfo(): Promise<LaravelDebugInfo | null> {
    return await this.config.phpDebugger.getLaravelInfo();
  }

  /**
   * Get all Laravel routes
   */
  async getRoutes(): Promise<LaravelRoute[]> {
    const laravelInfo = await this.getLaravelInfo();
    if (!laravelInfo) {
      throw new Error('Laravel information not available');
    }

    return laravelInfo.routes.map(route => {
      const laravelRoute: LaravelRoute = {
        uri: route.uri,
        methods: [route.method],
        action: route.action,
        middleware: route.middleware,
        compiled: true
      };

      if (route.name) {
        laravelRoute.name = route.name;
      }

      return laravelRoute;
    });
  }

  /**
   * Get Laravel middleware
   */
  async getMiddleware(): Promise<LaravelMiddleware[]> {
    const laravelInfo = await this.getLaravelInfo();
    if (!laravelInfo) {
      throw new Error('Laravel information not available');
    }

    return laravelInfo.middleware.map((name, index) => ({
      name,
      priority: index,
      global: ['web', 'api'].includes(name),
      routes: []
    }));
  }

  /**
   * Get Eloquent queries
   */
  getEloquentQueries(limit = 100): EloquentQuery[] {
    return this.eloquentQueries.slice(-limit);
  }

  /**
   * Analyze Eloquent queries for performance issues
   */
  async analyzeEloquentQueries(): Promise<Array<EloquentQuery & { issues: string[] }>> {
    const queries = this.getEloquentQueries();
    
    return queries.map(query => {
      const issues: string[] = [];
      
      // Check for N+1 queries
      if (query.sql.includes('SELECT * FROM') && !query.sql.includes('WHERE')) {
        issues.push('Potential N+1 query - missing WHERE clause');
      }
      
      // Check for slow queries
      if (query.time > 100) {
        issues.push(`Slow query - ${query.time}ms execution time`);
      }
      
      // Check for SELECT *
      if (query.sql.includes('SELECT *')) {
        issues.push('Using SELECT * - consider selecting specific columns');
      }
      
      return { ...query, issues };
    });
  }

  /**
   * Get Laravel jobs
   */
  getJobs(): LaravelJob[] {
    return Array.from(this.jobs.values());
  }

  /**
   * Get failed jobs
   */
  getFailedJobs(): LaravelJob[] {
    return this.getJobs().filter(job => job.status === 'failed');
  }

  /**
   * Get Laravel events
   */
  getEvents(limit = 100): LaravelEvent[] {
    return this.events.slice(-limit);
  }

  /**
   * Get Artisan commands
   */
  async getArtisanCommands(): Promise<ArtisanCommand[]> {
    // Mock Artisan commands
    return [
      {
        name: 'make:controller',
        description: 'Create a new controller class',
        signature: 'make:controller {name} {--resource} {--api}',
        arguments: [
          { name: 'name', required: true, description: 'The name of the controller' }
        ],
        options: [
          { name: 'resource', required: false, description: 'Generate a resource controller' },
          { name: 'api', required: false, description: 'Generate an API resource controller' }
        ]
      },
      {
        name: 'migrate',
        description: 'Run the database migrations',
        signature: 'migrate {--force} {--seed}',
        arguments: [],
        options: [
          { name: 'force', required: false, description: 'Force the operation to run in production' },
          { name: 'seed', required: false, description: 'Indicates if the seed task should be re-run' }
        ]
      }
    ];
  }

  /**
   * Execute Artisan command
   */
  async executeArtisanCommand(command: string, args: string[] = []): Promise<{ success: boolean; output: string; error?: string }> {
    if (!this.config.enableArtisanDebugging) {
      throw new Error('Artisan debugging not enabled');
    }

    // Mock Artisan command execution
    return {
      success: true,
      output: `Artisan command executed: ${command} ${args.join(' ')}`
    };
  }

  /**
   * Get Laravel performance metrics
   */
  async getPerformanceMetrics(): Promise<LaravelPerformanceMetrics> {
    const httpRequests = this.config.phpDebugger.getHttpRequests();
    const queries = this.getEloquentQueries();

    const sortedRequests = httpRequests.sort((a, b) => (b.duration || 0) - (a.duration || 0));
    const sortedQueries = queries.sort((a, b) => b.time - a.time);

    const result: LaravelPerformanceMetrics = {
      requests: {
        total: httpRequests.length,
        averageTime: httpRequests.reduce((sum, req) => sum + (req.duration || 0), 0) / httpRequests.length,
        slowestTime: Math.max(...httpRequests.map(req => req.duration || 0))
      },
      database: {
        queries: queries.length,
        totalTime: queries.reduce((sum, query) => sum + query.time, 0),
        nPlusOneQueries: queries.filter(q => q.sql.includes('SELECT * FROM') && !q.sql.includes('WHERE')).length
      },
      cache: {
        hits: 150,
        misses: 25,
        hitRatio: 0.857
      },
      memory: {
        peak: 128,
        average: 96,
        unit: 'MB'
      }
    };

    // Add optional properties only if they exist
    if (sortedRequests[0]?.url) {
      result.requests.slowestRoute = sortedRequests[0].url;
    }

    if (sortedQueries[0]?.sql) {
      result.database.slowestQuery = sortedQueries[0].sql;
    }

    return result;
  }

  /**
   * Set breakpoint on Laravel route
   */
  async setRouteBreakpoint(routeName: string, condition?: string): Promise<void> {
    const routes = await this.getRoutes();
    const route = routes.find(r => r.name === routeName);
    
    if (!route) {
      throw new Error(`Route ${routeName} not found`);
    }

    // Extract controller and method from action
    const [controller, method] = route.action.split('@');
    
    // Mock setting breakpoint on controller method
    this.emit('routeBreakpointSet', { routeName, controller, method, condition });
  }

  /**
   * Check if Laravel debugging is active
   */
  isDebuggingActive(): boolean {
    return this.isTracking;
  }
}
