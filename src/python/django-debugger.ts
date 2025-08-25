import { EventEmitter } from 'events';
import { PythonDebugger } from './python-debugger.js';

/**
 * Django Debugger - Specialized Django framework debugging
 * Provides Django-specific debugging capabilities including ORM, views, templates
 */

export interface DjangoRequest {
  id: string;
  method: string;
  path: string;
  view: string;
  timestamp: number;
  duration?: number;
  status?: number;
  user?: string;
  queryCount?: number;
  queries?: DjangoQuery[];
}

export interface DjangoQuery {
  id: string;
  sql: string;
  duration: number;
  stackTrace: string[];
  params?: any[];
}

export interface DjangoTemplate {
  name: string;
  path: string;
  context: Record<string, any>;
  renderTime: number;
  blocks: string[];
  extends?: string;
}

export interface DjangoModel {
  app: string;
  name: string;
  table: string;
  fields: DjangoField[];
  relations: DjangoRelation[];
}

export interface DjangoField {
  name: string;
  type: string;
  nullable: boolean;
  default?: any;
  maxLength?: number;
}

export interface DjangoRelation {
  name: string;
  type: 'ForeignKey' | 'OneToOneField' | 'ManyToManyField';
  relatedModel: string;
  relatedName?: string;
}

export interface DjangoMiddleware {
  name: string;
  order: number;
  enabled: boolean;
  processingTime?: number;
}

export interface DjangoSignal {
  name: string;
  sender: string;
  receiver: string;
  timestamp: number;
  args: any[];
  kwargs: Record<string, any>;
}

export class DjangoDebugger extends EventEmitter {
  private pythonDebugger: PythonDebugger;
  private requests: Map<string, DjangoRequest> = new Map();
  private queries: Map<string, DjangoQuery> = new Map();
  private templates: Map<string, DjangoTemplate> = new Map();
  private signals: DjangoSignal[] = [];
  private isTracking = false;

  constructor(pythonDebugger: PythonDebugger) {
    super();
    this.pythonDebugger = pythonDebugger;
    this.setupEventHandlers();
  }

  private setupEventHandlers(): void {
    this.pythonDebugger.on('django-initialized', (djangoInfo) => {
      this.emit('django-ready', djangoInfo);
    });
  }

  /**
   * Start Django request tracking
   */
  async startRequestTracking(_sessionId: string): Promise<void> {
    if (this.isTracking) {
      return;
    }

    this.isTracking = true;
    this.emit('tracking-started', { type: 'requests', sessionId: _sessionId });

    // Mock request tracking - in real implementation, this would hook into Django middleware
    this.simulateRequestTracking();
  }

  /**
   * Stop Django request tracking
   */
  async stopRequestTracking(): Promise<void> {
    this.isTracking = false;
    this.emit('tracking-stopped', { type: 'requests' });
  }

  /**
   * Get Django requests
   */
  async getRequests(limit = 50): Promise<DjangoRequest[]> {
    const requests = Array.from(this.requests.values())
      .sort((a, b) => b.timestamp - a.timestamp)
      .slice(0, limit);

    return requests;
  }

  /**
   * Get Django queries for a request
   */
  async getQueriesForRequest(requestId: string): Promise<DjangoQuery[]> {
    const request = this.requests.get(requestId);
    if (!request || !request.queries) {
      return [];
    }

    return request.queries;
  }

  /**
   * Analyze Django ORM queries
   */
  async analyzeQueries(_sessionId: string): Promise<{
    totalQueries: number;
    slowQueries: DjangoQuery[];
    duplicateQueries: DjangoQuery[][];
    nPlusOneIssues: any[];
    recommendations: string[];
  }> {
    const allQueries = Array.from(this.queries.values());
    
    // Find slow queries (> 100ms)
    const slowQueries = allQueries.filter(q => q.duration > 100);
    
    // Find duplicate queries
    const queryGroups = new Map<string, DjangoQuery[]>();
    allQueries.forEach(query => {
      const key = query.sql.replace(/\$\d+/g, '?'); // Normalize parameters
      if (!queryGroups.has(key)) {
        queryGroups.set(key, []);
      }
      queryGroups.get(key)!.push(query);
    });
    
    const duplicateQueries = Array.from(queryGroups.values()).filter(group => group.length > 1);
    
    // Mock N+1 detection
    const nPlusOneIssues = [
      {
        pattern: 'SELECT * FROM myapp_user WHERE id = ?',
        count: 15,
        recommendation: 'Use select_related() or prefetch_related()'
      }
    ];

    const recommendations = [
      'Use select_related() for foreign key relationships',
      'Use prefetch_related() for many-to-many relationships',
      'Add database indexes for frequently queried fields',
      'Consider using only() and defer() to limit fields',
      'Use bulk operations for multiple inserts/updates'
    ];

    return {
      totalQueries: allQueries.length,
      slowQueries,
      duplicateQueries,
      nPlusOneIssues,
      recommendations
    };
  }

  /**
   * Get Django models information
   */
  async getModels(appName?: string): Promise<DjangoModel[]> {
    // Mock Django models - in real implementation, this would introspect Django models
    const models: DjangoModel[] = [
      {
        app: 'myapp',
        name: 'User',
        table: 'myapp_user',
        fields: [
          { name: 'id', type: 'AutoField', nullable: false },
          { name: 'username', type: 'CharField', nullable: false, maxLength: 150 },
          { name: 'email', type: 'EmailField', nullable: false, maxLength: 254 },
          { name: 'first_name', type: 'CharField', nullable: true, maxLength: 30 },
          { name: 'last_name', type: 'CharField', nullable: true, maxLength: 30 },
          { name: 'is_active', type: 'BooleanField', nullable: false, default: true },
          { name: 'date_joined', type: 'DateTimeField', nullable: false }
        ],
        relations: [
          { name: 'profile', type: 'OneToOneField', relatedModel: 'UserProfile', relatedName: 'user' },
          { name: 'posts', type: 'ForeignKey', relatedModel: 'Post', relatedName: 'author' }
        ]
      },
      {
        app: 'myapp',
        name: 'Post',
        table: 'myapp_post',
        fields: [
          { name: 'id', type: 'AutoField', nullable: false },
          { name: 'title', type: 'CharField', nullable: false, maxLength: 200 },
          { name: 'content', type: 'TextField', nullable: false },
          { name: 'created_at', type: 'DateTimeField', nullable: false },
          { name: 'updated_at', type: 'DateTimeField', nullable: false }
        ],
        relations: [
          { name: 'author', type: 'ForeignKey', relatedModel: 'User', relatedName: 'posts' },
          { name: 'tags', type: 'ManyToManyField', relatedModel: 'Tag', relatedName: 'posts' }
        ]
      }
    ];

    if (appName) {
      return models.filter(model => model.app === appName);
    }

    return models;
  }

  /**
   * Get Django URL patterns
   */
  async getUrlPatterns(): Promise<Array<{
    pattern: string;
    name?: string;
    view: string;
    namespace?: string;
    app?: string;
  }>> {
    // Mock URL patterns - in real implementation, this would introspect Django URLs
    return [
      { pattern: '^admin/', view: 'django.contrib.admin.site.urls', namespace: 'admin' },
      { pattern: '^api/users/$', name: 'user-list', view: 'myapp.views.UserListView', app: 'myapp' },
      { pattern: '^api/users/(?P<pk>\\d+)/$', name: 'user-detail', view: 'myapp.views.UserDetailView', app: 'myapp' },
      { pattern: '^api/posts/$', name: 'post-list', view: 'myapp.views.PostListView', app: 'myapp' },
      { pattern: '^$', name: 'home', view: 'myapp.views.HomeView', app: 'myapp' }
    ];
  }

  /**
   * Get Django middleware information
   */
  async getMiddleware(): Promise<DjangoMiddleware[]> {
    // Mock middleware - in real implementation, this would introspect Django middleware
    return [
      { name: 'django.middleware.security.SecurityMiddleware', order: 1, enabled: true, processingTime: 0.5 },
      { name: 'django.contrib.sessions.middleware.SessionMiddleware', order: 2, enabled: true, processingTime: 1.2 },
      { name: 'django.middleware.common.CommonMiddleware', order: 3, enabled: true, processingTime: 0.8 },
      { name: 'django.middleware.csrf.CsrfViewMiddleware', order: 4, enabled: true, processingTime: 0.3 },
      { name: 'django.contrib.auth.middleware.AuthenticationMiddleware', order: 5, enabled: true, processingTime: 2.1 },
      { name: 'django.contrib.messages.middleware.MessageMiddleware', order: 6, enabled: true, processingTime: 0.4 }
    ];
  }

  /**
   * Get Django signals
   */
  async getSignals(limit = 100): Promise<DjangoSignal[]> {
    return this.signals
      .sort((a, b) => b.timestamp - a.timestamp)
      .slice(0, limit);
  }

  /**
   * Analyze Django templates
   */
  async analyzeTemplates(): Promise<{
    templates: DjangoTemplate[];
    slowTemplates: DjangoTemplate[];
    recommendations: string[];
  }> {
    const templates = Array.from(this.templates.values());
    const slowTemplates = templates.filter(t => t.renderTime > 50); // > 50ms

    const recommendations = [
      'Use template fragment caching for expensive operations',
      'Minimize database queries in templates',
      'Use template inheritance to reduce duplication',
      'Consider using template tags for complex logic',
      'Optimize template context to include only necessary data'
    ];

    return {
      templates,
      slowTemplates,
      recommendations
    };
  }

  /**
   * Set Django-specific breakpoint
   */
  async setDjangoBreakpoint(type: 'view' | 'model' | 'template' | 'signal', target: string, condition?: string): Promise<any> {
    // Mock Django breakpoint - in real implementation, this would set breakpoints in Django code
    const breakpoint = {
      id: `django-${type}-${target}-${Date.now()}`,
      type,
      target,
      condition,
      verified: true,
      timestamp: Date.now()
    };

    this.emit('django-breakpoint-set', breakpoint);
    return breakpoint;
  }

  /**
   * Simulate request tracking for demo purposes
   */
  private simulateRequestTracking(): void {
    if (!this.isTracking) return;

    // Simulate a request every 5-10 seconds
    setTimeout(() => {
      if (this.isTracking) {
        this.simulateRequest();
        this.simulateRequestTracking();
      }
    }, Math.random() * 5000 + 5000);
  }

  /**
   * Simulate a Django request
   */
  private simulateRequest(): void {
    const requestId = `req-${Date.now()}`;
    const paths = ['/api/users/', '/api/posts/', '/admin/', '/', '/api/users/1/'];
    const methods = ['GET', 'POST', 'PUT', 'DELETE'];
    const views = ['UserListView', 'PostListView', 'AdminView', 'HomeView', 'UserDetailView'];

    const method = methods[Math.floor(Math.random() * methods.length)];
    const path = paths[Math.floor(Math.random() * paths.length)];
    const view = views[Math.floor(Math.random() * views.length)];

    if (!method || !path || !view) return;

    const request: DjangoRequest = {
      id: requestId,
      method,
      path,
      view,
      timestamp: Date.now(),
      duration: Math.floor(Math.random() * 500) + 50,
      status: Math.random() > 0.1 ? 200 : 500,
      user: Math.random() > 0.5 ? 'user123' : 'anonymous',
      queryCount: Math.floor(Math.random() * 10) + 1,
      queries: []
    };

    // Simulate queries for this request
    for (let i = 0; i < request.queryCount!; i++) {
      const queryId = `${requestId}-q${i}`;
      const query: DjangoQuery = {
        id: queryId,
        sql: `SELECT * FROM myapp_user WHERE id = $${i + 1}`,
        duration: Math.floor(Math.random() * 100) + 5,
        stackTrace: ['views.py:25', 'models.py:45'],
        params: [i + 1]
      };

      this.queries.set(queryId, query);
      request.queries!.push(query);
    }

    this.requests.set(requestId, request);
    this.emit('django-request', request);

    // Simulate a signal
    const signal: DjangoSignal = {
      name: 'post_save',
      sender: 'User',
      receiver: 'update_user_profile',
      timestamp: Date.now(),
      args: [],
      kwargs: { instance: 'User(id=1)', created: false }
    };

    this.signals.push(signal);
    this.emit('django-signal', signal);
  }
}
