import { EventEmitter } from 'events';
import { RustDebugger } from './rust-debugger.js';

/**
 * Actix Debugger - Specialized Actix-web framework debugging
 * Provides Actix-specific debugging capabilities including routes, middleware, handlers
 */

export interface ActixRoute {
  method: string;
  path: string;
  handler: string;
  middleware: string[];
  guards?: string[];
}

export interface ActixRequest {
  id: string;
  method: string;
  path: string;
  handler: string;
  timestamp: number;
  duration?: number;
  status?: number;
  clientIP?: string;
  userAgent?: string;
  requestSize?: number;
  responseSize?: number;
  middleware?: ActixMiddlewareExecution[];
}

export interface ActixMiddlewareExecution {
  name: string;
  duration: number;
  order: number;
  error?: string;
}

export interface ActixExtractor {
  name: string;
  type: string;
  value?: any;
  error?: string;
}

export interface ActixHandler {
  name: string;
  function: string;
  extractors: ActixExtractor[];
  returnType: string;
  isAsync: boolean;
}

export interface ActixMiddleware {
  name: string;
  function: string;
  order: number;
  global: boolean;
  routes?: string[];
}

export interface ActixPerformanceMetrics {
  totalRequests: number;
  averageResponseTime: number;
  requestsPerSecond: number;
  slowestRoutes: Array<{
    route: string;
    averageTime: number;
    requestCount: number;
  }>;
  errorRates: Record<number, number>;
  middlewarePerformance: Array<{
    name: string;
    averageTime: number;
    callCount: number;
  }>;
  extractorPerformance: Array<{
    name: string;
    averageTime: number;
    successRate: number;
  }>;
}

export interface ActixApp {
  name: string;
  prefix?: string;
  routes: ActixRoute[];
  middleware: ActixMiddleware[];
  services: ActixService[];
}

export interface ActixService {
  name: string;
  path: string;
  type: 'resource' | 'scope' | 'service';
  routes: ActixRoute[];
}

export class ActixDebugger extends EventEmitter {
  private rustDebugger: RustDebugger;
  private routes: Map<string, ActixRoute> = new Map();
  private requests: Map<string, ActixRequest> = new Map();
  private middleware: Map<string, ActixMiddleware> = new Map();
  private handlers: Map<string, ActixHandler> = new Map();
  private isTracking = false;

  constructor(rustDebugger: RustDebugger) {
    super();
    this.rustDebugger = rustDebugger;
    this.setupEventHandlers();
  }

  private setupEventHandlers(): void {
    this.rustDebugger.on('connected', () => {
      this.emit('actix-ready');
    });
  }

  /**
   * Start Actix request tracking
   */
  async startRequestTracking(sessionId: string): Promise<void> {
    if (this.isTracking) {
      return;
    }

    this.isTracking = true;
    this.emit('tracking-started', { type: 'requests', sessionId });

    // Mock request tracking - in real implementation, this would hook into Actix middleware
    this.simulateRequestTracking();
  }

  /**
   * Stop Actix request tracking
   */
  async stopRequestTracking(): Promise<void> {
    this.isTracking = false;
    this.emit('tracking-stopped', { type: 'requests' });
  }

  /**
   * Get Actix routes
   */
  async getRoutes(): Promise<ActixRoute[]> {
    // Mock Actix routes - in real implementation, this would introspect Actix app
    const routes: ActixRoute[] = [
      {
        method: 'GET',
        path: '/api/users',
        handler: 'handlers::get_users',
        middleware: ['Logger', 'DefaultHeaders', 'auth_middleware'],
        guards: ['ContentTypeGuard']
      },
      {
        method: 'POST',
        path: '/api/users',
        handler: 'handlers::create_user',
        middleware: ['Logger', 'DefaultHeaders', 'auth_middleware'],
        guards: ['ContentTypeGuard']
      },
      {
        method: 'GET',
        path: '/api/users/{id}',
        handler: 'handlers::get_user',
        middleware: ['Logger', 'DefaultHeaders', 'auth_middleware'],
        guards: []
      },
      {
        method: 'PUT',
        path: '/api/users/{id}',
        handler: 'handlers::update_user',
        middleware: ['Logger', 'DefaultHeaders', 'auth_middleware'],
        guards: ['ContentTypeGuard']
      },
      {
        method: 'DELETE',
        path: '/api/users/{id}',
        handler: 'handlers::delete_user',
        middleware: ['Logger', 'DefaultHeaders', 'auth_middleware'],
        guards: []
      },
      {
        method: 'GET',
        path: '/health',
        handler: 'handlers::health_check',
        middleware: ['Logger'],
        guards: []
      }
    ];

    routes.forEach(route => {
      const key = `${route.method}:${route.path}`;
      this.routes.set(key, route);
    });

    return routes;
  }

  /**
   * Get Actix requests
   */
  async getRequests(limit = 50): Promise<ActixRequest[]> {
    const requests = Array.from(this.requests.values())
      .sort((a, b) => b.timestamp - a.timestamp)
      .slice(0, limit);

    return requests;
  }

  /**
   * Get Actix middleware
   */
  async getMiddleware(): Promise<ActixMiddleware[]> {
    // Mock Actix middleware - in real implementation, this would introspect Actix middleware
    const middleware: ActixMiddleware[] = [
      {
        name: 'Logger',
        function: 'actix_web::middleware::Logger',
        order: 1,
        global: true
      },
      {
        name: 'DefaultHeaders',
        function: 'actix_web::middleware::DefaultHeaders',
        order: 2,
        global: true
      },
      {
        name: 'auth_middleware',
        function: 'middleware::auth_middleware',
        order: 3,
        global: false,
        routes: ['/api/users', '/api/users/{id}']
      },
      {
        name: 'Cors',
        function: 'actix_cors::Cors',
        order: 4,
        global: true
      }
    ];

    middleware.forEach(mw => {
      this.middleware.set(mw.name, mw);
    });

    return middleware;
  }

  /**
   * Get Actix handlers
   */
  async getHandlers(): Promise<ActixHandler[]> {
    // Mock Actix handlers - in real implementation, this would introspect Actix handlers
    const handlers: ActixHandler[] = [
      {
        name: 'get_users',
        function: 'handlers::get_users',
        extractors: [
          { name: 'Query', type: 'Query<UserQuery>', value: { page: 1, limit: 10 } },
          { name: 'Data', type: 'Data<AppState>' }
        ],
        returnType: 'Result<Json<Vec<User>>, Error>',
        isAsync: true
      },
      {
        name: 'create_user',
        function: 'handlers::create_user',
        extractors: [
          { name: 'Json', type: 'Json<CreateUserRequest>' },
          { name: 'Data', type: 'Data<AppState>' }
        ],
        returnType: 'Result<Json<User>, Error>',
        isAsync: true
      },
      {
        name: 'get_user',
        function: 'handlers::get_user',
        extractors: [
          { name: 'Path', type: 'Path<u64>', value: 123 },
          { name: 'Data', type: 'Data<AppState>' }
        ],
        returnType: 'Result<Json<User>, Error>',
        isAsync: true
      }
    ];

    handlers.forEach(handler => {
      this.handlers.set(handler.name, handler);
    });

    return handlers;
  }

  /**
   * Analyze Actix performance
   */
  async analyzePerformance(): Promise<ActixPerformanceMetrics> {
    const requests = Array.from(this.requests.values());
    
    const totalRequests = requests.length;
    const averageResponseTime = requests.reduce((sum, req) => sum + (req.duration || 0), 0) / totalRequests;
    
    // Calculate requests per second (last minute)
    const oneMinuteAgo = Date.now() - 60000;
    const recentRequests = requests.filter(req => req.timestamp > oneMinuteAgo);
    const requestsPerSecond = recentRequests.length / 60;

    // Find slowest routes
    const routePerformance = new Map<string, { totalTime: number; count: number }>();
    requests.forEach(req => {
      const route = `${req.method} ${req.path}`;
      const existing = routePerformance.get(route) || { totalTime: 0, count: 0 };
      existing.totalTime += req.duration || 0;
      existing.count += 1;
      routePerformance.set(route, existing);
    });

    const slowestRoutes = Array.from(routePerformance.entries())
      .map(([route, perf]) => ({
        route,
        averageTime: perf.totalTime / perf.count,
        requestCount: perf.count
      }))
      .sort((a, b) => b.averageTime - a.averageTime)
      .slice(0, 5);

    // Calculate error rates
    const errorRates: Record<number, number> = {};
    requests.forEach(req => {
      if (req.status && req.status >= 400) {
        errorRates[req.status] = (errorRates[req.status] || 0) + 1;
      }
    });

    // Middleware performance
    const middlewarePerformance = Array.from(this.middleware.values()).map(mw => ({
      name: mw.name,
      averageTime: Math.random() * 5 + 1, // Mock data
      callCount: Math.floor(Math.random() * 1000) + 100
    }));

    // Extractor performance
    const extractorPerformance = [
      { name: 'Json', averageTime: Math.random() * 2 + 0.5, successRate: 0.98 },
      { name: 'Query', averageTime: Math.random() * 1 + 0.2, successRate: 0.99 },
      { name: 'Path', averageTime: Math.random() * 0.5 + 0.1, successRate: 0.995 },
      { name: 'Data', averageTime: Math.random() * 0.2 + 0.05, successRate: 1.0 }
    ];

    return {
      totalRequests,
      averageResponseTime,
      requestsPerSecond,
      slowestRoutes,
      errorRates,
      middlewarePerformance,
      extractorPerformance
    };
  }

  /**
   * Get Actix app structure
   */
  async getAppStructure(): Promise<ActixApp[]> {
    // Mock Actix app structure - in real implementation, this would introspect Actix app
    return [
      {
        name: 'main_app',
        prefix: '/api',
        routes: await this.getRoutes(),
        middleware: await this.getMiddleware(),
        services: [
          {
            name: 'users_service',
            path: '/users',
            type: 'scope',
            routes: [
              {
                method: 'GET',
                path: '',
                handler: 'handlers::get_users',
                middleware: ['auth_middleware']
              },
              {
                method: 'POST',
                path: '',
                handler: 'handlers::create_user',
                middleware: ['auth_middleware']
              }
            ]
          },
          {
            name: 'health_service',
            path: '/health',
            type: 'resource',
            routes: [
              {
                method: 'GET',
                path: '',
                handler: 'handlers::health_check',
                middleware: []
              }
            ]
          }
        ]
      }
    ];
  }

  /**
   * Set Actix-specific breakpoint
   */
  async setActixBreakpoint(type: 'handler' | 'middleware' | 'extractor', target: string, condition?: string): Promise<any> {
    // Mock Actix breakpoint - in real implementation, this would set breakpoints in Actix code
    const breakpoint = {
      id: `actix-${type}-${target}-${Date.now()}`,
      type,
      target,
      condition,
      verified: true,
      timestamp: Date.now()
    };

    this.emit('actix-breakpoint-set', breakpoint);
    return breakpoint;
  }

  /**
   * Simulate request tracking for demo purposes
   */
  private simulateRequestTracking(): void {
    if (!this.isTracking) return;

    // Simulate a request every 4-9 seconds
    setTimeout(() => {
      if (this.isTracking) {
        this.simulateRequest();
        this.simulateRequestTracking();
      }
    }, Math.random() * 5000 + 4000);
  }

  /**
   * Simulate an Actix request
   */
  private simulateRequest(): void {
    const requestId = `req-${Date.now()}`;
    const routes = [
      { method: 'GET', path: '/api/users', handler: 'get_users' },
      { method: 'POST', path: '/api/users', handler: 'create_user' },
      { method: 'GET', path: '/api/users/123', handler: 'get_user' },
      { method: 'PUT', path: '/api/users/123', handler: 'update_user' },
      { method: 'GET', path: '/health', handler: 'health_check' }
    ];

    const route = routes[Math.floor(Math.random() * routes.length)];
    const userAgents = ['curl/7.68.0', 'reqwest/0.11', 'actix-client/3.0'];

    if (!route) return;

    const request: ActixRequest = {
      id: requestId,
      method: route.method,
      path: route.path,
      handler: route.handler,
      timestamp: Date.now(),
      duration: Math.floor(Math.random() * 150) + 5,
      status: Math.random() > 0.1 ? 200 : (Math.random() > 0.5 ? 404 : 500),
      clientIP: `192.168.1.${Math.floor(Math.random() * 255)}`,
      userAgent: userAgents[Math.floor(Math.random() * userAgents.length)] || 'unknown',
      requestSize: Math.floor(Math.random() * 2000) + 200,
      responseSize: Math.floor(Math.random() * 8000) + 1000,
      middleware: [
        { name: 'Logger', duration: Math.random() * 1, order: 1 },
        { name: 'DefaultHeaders', duration: Math.random() * 0.5, order: 2 },
        { name: 'auth_middleware', duration: Math.random() * 3, order: 3 }
      ]
    };

    this.requests.set(requestId, request);
    this.emit('actix-request', request);
  }
}
