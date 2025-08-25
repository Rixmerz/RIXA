import { EventEmitter } from 'events';
import { GoDebugger } from './go-debugger.js';

/**
 * Gin Debugger - Specialized Gin framework debugging
 * Provides Gin-specific debugging capabilities including routes, middleware, handlers
 */

export interface GinRoute {
  method: string;
  path: string;
  handler: string;
  middleware: string[];
  params?: string[];
}

export interface GinRequest {
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
  middleware?: GinMiddlewareExecution[];
}

export interface GinMiddlewareExecution {
  name: string;
  duration: number;
  order: number;
  aborted?: boolean;
  error?: string;
}

export interface GinContext {
  request: {
    method: string;
    url: string;
    headers: Record<string, string>;
    params: Record<string, string>;
    query: Record<string, string>;
    body?: any;
  };
  response: {
    status: number;
    headers: Record<string, string>;
    body?: any;
  };
  keys: Record<string, any>;
  errors: any[];
  accepted: string[];
}

export interface GinMiddleware {
  name: string;
  function: string;
  order: number;
  global: boolean;
  routes?: string[];
}

export interface GinPerformanceMetrics {
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
}

export class GinDebugger extends EventEmitter {
  private goDebugger: GoDebugger;
  private routes: Map<string, GinRoute> = new Map();
  private requests: Map<string, GinRequest> = new Map();
  private middleware: Map<string, GinMiddleware> = new Map();
  private isTracking = false;

  constructor(goDebugger: GoDebugger) {
    super();
    this.goDebugger = goDebugger;
    this.setupEventHandlers();
  }

  private setupEventHandlers(): void {
    this.goDebugger.on('connected', () => {
      this.emit('gin-ready');
    });
  }

  /**
   * Start Gin request tracking
   */
  async startRequestTracking(sessionId: string): Promise<void> {
    if (this.isTracking) {
      return;
    }

    this.isTracking = true;
    this.emit('tracking-started', { type: 'requests', sessionId });

    // Mock request tracking - in real implementation, this would hook into Gin middleware
    this.simulateRequestTracking();
  }

  /**
   * Stop Gin request tracking
   */
  async stopRequestTracking(): Promise<void> {
    this.isTracking = false;
    this.emit('tracking-stopped', { type: 'requests' });
  }

  /**
   * Get Gin routes
   */
  async getRoutes(): Promise<GinRoute[]> {
    // Mock Gin routes - in real implementation, this would introspect Gin router
    const routes: GinRoute[] = [
      {
        method: 'GET',
        path: '/api/users',
        handler: 'main.getUsersHandler',
        middleware: ['gin.Logger()', 'gin.Recovery()', 'authMiddleware()'],
        params: []
      },
      {
        method: 'POST',
        path: '/api/users',
        handler: 'main.createUserHandler',
        middleware: ['gin.Logger()', 'gin.Recovery()', 'authMiddleware()'],
        params: []
      },
      {
        method: 'GET',
        path: '/api/users/:id',
        handler: 'main.getUserHandler',
        middleware: ['gin.Logger()', 'gin.Recovery()', 'authMiddleware()'],
        params: ['id']
      },
      {
        method: 'PUT',
        path: '/api/users/:id',
        handler: 'main.updateUserHandler',
        middleware: ['gin.Logger()', 'gin.Recovery()', 'authMiddleware()'],
        params: ['id']
      },
      {
        method: 'DELETE',
        path: '/api/users/:id',
        handler: 'main.deleteUserHandler',
        middleware: ['gin.Logger()', 'gin.Recovery()', 'authMiddleware()'],
        params: ['id']
      },
      {
        method: 'GET',
        path: '/health',
        handler: 'main.healthHandler',
        middleware: ['gin.Logger()', 'gin.Recovery()'],
        params: []
      }
    ];

    routes.forEach(route => {
      const key = `${route.method}:${route.path}`;
      this.routes.set(key, route);
    });

    return routes;
  }

  /**
   * Get Gin requests
   */
  async getRequests(limit = 50): Promise<GinRequest[]> {
    const requests = Array.from(this.requests.values())
      .sort((a, b) => b.timestamp - a.timestamp)
      .slice(0, limit);

    return requests;
  }

  /**
   * Get Gin middleware
   */
  async getMiddleware(): Promise<GinMiddleware[]> {
    // Mock Gin middleware - in real implementation, this would introspect Gin middleware
    const middleware: GinMiddleware[] = [
      {
        name: 'gin.Logger()',
        function: 'gin.LoggerWithFormatter',
        order: 1,
        global: true
      },
      {
        name: 'gin.Recovery()',
        function: 'gin.RecoveryWithWriter',
        order: 2,
        global: true
      },
      {
        name: 'authMiddleware()',
        function: 'main.authMiddleware',
        order: 3,
        global: false,
        routes: ['/api/users', '/api/users/:id']
      },
      {
        name: 'corsMiddleware()',
        function: 'main.corsMiddleware',
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
   * Analyze Gin performance
   */
  async analyzePerformance(): Promise<GinPerformanceMetrics> {
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
      averageTime: Math.random() * 10 + 1, // Mock data
      callCount: Math.floor(Math.random() * 1000) + 100
    }));

    return {
      totalRequests,
      averageResponseTime,
      requestsPerSecond,
      slowestRoutes,
      errorRates,
      middlewarePerformance
    };
  }

  /**
   * Get Gin context for a request
   */
  async getContext(requestId: string): Promise<GinContext | null> {
    const request = this.requests.get(requestId);
    if (!request) {
      return null;
    }

    // Mock Gin context - in real implementation, this would capture actual context
    return {
      request: {
        method: request.method,
        url: request.path,
        headers: {
          'Content-Type': 'application/json',
          'User-Agent': request.userAgent || 'Unknown',
          'Accept': 'application/json'
        },
        params: { id: '123' },
        query: { page: '1', limit: '10' },
        body: request.method === 'POST' ? { name: 'John Doe', email: 'john@example.com' } : undefined
      },
      response: {
        status: request.status || 200,
        headers: {
          'Content-Type': 'application/json',
          'X-Response-Time': `${request.duration}ms`
        },
        body: { success: true, data: {} }
      },
      keys: {
        userId: 123,
        sessionId: 'sess_abc123'
      },
      errors: [],
      accepted: ['application/json', 'text/html']
    };
  }

  /**
   * Set Gin-specific breakpoint
   */
  async setGinBreakpoint(type: 'handler' | 'middleware' | 'route', target: string, condition?: string): Promise<any> {
    // Mock Gin breakpoint - in real implementation, this would set breakpoints in Gin code
    const breakpoint = {
      id: `gin-${type}-${target}-${Date.now()}`,
      type,
      target,
      condition,
      verified: true,
      timestamp: Date.now()
    };

    this.emit('gin-breakpoint-set', breakpoint);
    return breakpoint;
  }

  /**
   * Simulate request tracking for demo purposes
   */
  private simulateRequestTracking(): void {
    if (!this.isTracking) return;

    // Simulate a request every 3-8 seconds
    setTimeout(() => {
      if (this.isTracking) {
        this.simulateRequest();
        this.simulateRequestTracking();
      }
    }, Math.random() * 5000 + 3000);
  }

  /**
   * Simulate a Gin request
   */
  private simulateRequest(): void {
    const requestId = `req-${Date.now()}`;
    const routes = [
      { method: 'GET', path: '/api/users', handler: 'getUsersHandler' },
      { method: 'POST', path: '/api/users', handler: 'createUserHandler' },
      { method: 'GET', path: '/api/users/123', handler: 'getUserHandler' },
      { method: 'PUT', path: '/api/users/123', handler: 'updateUserHandler' },
      { method: 'GET', path: '/health', handler: 'healthHandler' }
    ];

    const route = routes[Math.floor(Math.random() * routes.length)];
    const userAgents = ['curl/7.68.0', 'PostmanRuntime/7.28.4', 'Go-http-client/1.1'];

    if (!route) return;

    const request: GinRequest = {
      id: requestId,
      method: route.method,
      path: route.path,
      handler: route.handler,
      timestamp: Date.now(),
      duration: Math.floor(Math.random() * 200) + 10,
      status: Math.random() > 0.1 ? 200 : (Math.random() > 0.5 ? 404 : 500),
      clientIP: `192.168.1.${Math.floor(Math.random() * 255)}`,
      userAgent: userAgents[Math.floor(Math.random() * userAgents.length)] || 'unknown',
      requestSize: Math.floor(Math.random() * 1000) + 100,
      responseSize: Math.floor(Math.random() * 5000) + 500,
      middleware: [
        { name: 'gin.Logger()', duration: Math.random() * 2, order: 1 },
        { name: 'gin.Recovery()', duration: Math.random() * 1, order: 2 },
        { name: 'authMiddleware()', duration: Math.random() * 5, order: 3 }
      ]
    };

    this.requests.set(requestId, request);
    this.emit('gin-request', request);
  }
}
