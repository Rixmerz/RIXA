import { EventEmitter } from 'events';
import type { LanguageDispatcher } from './language-dispatcher.js';

/**
 * Component Debugger - Specialized debugging for individual components
 * Allows debugging of backend, frontend, and middleware components separately
 * without requiring the full stack to be running
 */

export interface ComponentDebuggerConfig {
  languageDispatcher: LanguageDispatcher;
  projectPath: string;
  enableMockServices?: boolean;
  enableStubbing?: boolean;
  enableIsolatedTesting?: boolean;
}

export interface ComponentInfo {
  name: string;
  type: 'backend' | 'frontend' | 'middleware' | 'service' | 'api';
  language: string;
  framework?: string;
  port?: number;
  dependencies: ComponentDependency[];
  endpoints?: ComponentEndpoint[];
  status: 'running' | 'stopped' | 'error' | 'mocked';
}

export interface ComponentDependency {
  name: string;
  type: 'database' | 'service' | 'api' | 'cache' | 'queue';
  url?: string;
  required: boolean;
  mockable: boolean;
  status: 'available' | 'unavailable' | 'mocked';
}

export interface ComponentEndpoint {
  path: string;
  method: string;
  description?: string;
  parameters?: Array<{
    name: string;
    type: string;
    required: boolean;
  }>;
  responses?: Array<{
    status: number;
    description: string;
    schema?: any;
  }>;
}

export interface MockService {
  name: string;
  type: string;
  port: number;
  endpoints: Array<{
    path: string;
    method: string;
    response: any;
    delay?: number;
  }>;
  status: 'running' | 'stopped';
}

export interface IsolatedTestConfig {
  component: string;
  mocks: string[];
  stubs: string[];
  testData?: Record<string, any>;
  environment?: Record<string, string>;
}

export interface ComponentSession {
  sessionId: string;
  component: ComponentInfo;
  mocks: MockService[];
  debugSession?: any;
  testConfig?: IsolatedTestConfig;
}

export class ComponentDebugger extends EventEmitter {
  private config: ComponentDebuggerConfig;
  private sessions: Map<string, ComponentSession> = new Map();
  private mockServices: Map<string, MockService> = new Map();

  constructor(config: ComponentDebuggerConfig) {
    super();
    this.config = {
      enableMockServices: true,
      enableStubbing: true,
      enableIsolatedTesting: true,
      ...config
    };
  }

  /**
   * Analyze project structure and detect components
   */
  async analyzeProject(): Promise<ComponentInfo[]> {
    // Mock component analysis - in real implementation, this would scan the project
    return [
      {
        name: 'user-api',
        type: 'backend',
        language: 'java',
        framework: 'spring-boot',
        port: 8080,
        dependencies: [
          { name: 'mysql-db', type: 'database', url: 'jdbc:mysql://localhost:3306/userdb', required: true, mockable: true, status: 'available' },
          { name: 'redis-cache', type: 'cache', url: 'redis://localhost:6379', required: false, mockable: true, status: 'available' },
          { name: 'notification-service', type: 'service', url: 'http://localhost:8081', required: false, mockable: true, status: 'unavailable' }
        ],
        endpoints: [
          {
            path: '/api/users',
            method: 'GET',
            description: 'Get all users',
            responses: [{ status: 200, description: 'List of users' }]
          },
          {
            path: '/api/users',
            method: 'POST',
            description: 'Create user',
            parameters: [
              { name: 'name', type: 'string', required: true },
              { name: 'email', type: 'string', required: true }
            ],
            responses: [{ status: 201, description: 'User created' }]
          }
        ],
        status: 'stopped'
      },
      {
        name: 'user-frontend',
        type: 'frontend',
        language: 'typescript',
        framework: 'react',
        port: 3000,
        dependencies: [
          { name: 'user-api', type: 'api', url: 'http://localhost:8080', required: true, mockable: true, status: 'unavailable' }
        ],
        status: 'stopped'
      },
      {
        name: 'api-gateway',
        type: 'middleware',
        language: 'node',
        framework: 'express',
        port: 8000,
        dependencies: [
          { name: 'user-api', type: 'service', url: 'http://localhost:8080', required: true, mockable: true, status: 'unavailable' },
          { name: 'auth-service', type: 'service', url: 'http://localhost:8082', required: true, mockable: true, status: 'unavailable' }
        ],
        endpoints: [
          {
            path: '/api/*',
            method: 'ALL',
            description: 'Proxy to backend services'
          }
        ],
        status: 'stopped'
      }
    ];
  }

  /**
   * Start debugging a specific component in isolation
   */
  async startComponentDebugging(componentName: string, options: {
    mockDependencies?: boolean;
    testMode?: boolean;
    customMocks?: Record<string, any>;
  } = {}): Promise<ComponentSession> {
    const components = await this.analyzeProject();
    const component = components.find(c => c.name === componentName);
    
    if (!component) {
      throw new Error(`Component ${componentName} not found`);
    }

    const sessionId = `component-${componentName}-${Date.now()}`;
    
    // Create mock services for unavailable dependencies
    const mocks: MockService[] = [];
    if (options.mockDependencies !== false) {
      for (const dep of component.dependencies) {
        if (dep.status === 'unavailable' && dep.mockable) {
          const mockService = await this.createMockService(dep, options.customMocks);
          mocks.push(mockService);
        }
      }
    }

    // Start the component's debug session
    let debugSession;
    try {
      const connectionOptions: any = {
        language: component.language as any,
        host: 'localhost',
        enableFrameworkTools: true
      };

      if (component.port) {
        connectionOptions.port = component.port;
      }

      debugSession = await this.config.languageDispatcher.connect(connectionOptions);
    } catch (error) {
      // If direct connection fails, we'll work in mock mode
      console.warn(`Could not connect to ${componentName}, working in mock mode:`, error);
    }

    const testConfig: IsolatedTestConfig | undefined = options.testMode ? {
      component: componentName,
      mocks: mocks.map(m => m.name),
      stubs: [],
      environment: this.generateTestEnvironment(component, mocks)
    } : undefined;

    const session: ComponentSession = {
      sessionId,
      component,
      mocks,
      debugSession
    };

    if (testConfig) {
      session.testConfig = testConfig;
    }

    this.sessions.set(sessionId, session);
    this.emit('componentDebuggingStarted', { sessionId, component: componentName });

    return session;
  }

  /**
   * Stop component debugging session
   */
  async stopComponentDebugging(sessionId: string): Promise<void> {
    const session = this.sessions.get(sessionId);
    if (!session) {
      throw new Error(`Session ${sessionId} not found`);
    }

    // Stop mock services
    for (const mock of session.mocks) {
      await this.stopMockService(mock.name);
    }

    // Disconnect debug session
    if (session.debugSession) {
      try {
        await this.config.languageDispatcher.disconnect(session.debugSession.sessionId);
      } catch (error) {
        console.warn('Error disconnecting debug session:', error);
      }
    }

    this.sessions.delete(sessionId);
    this.emit('componentDebuggingStopped', { sessionId, component: session.component.name });
  }

  /**
   * Create a mock service for a dependency
   */
  private async createMockService(dependency: ComponentDependency, customMocks?: Record<string, any>): Promise<MockService> {
    const mockService: MockService = {
      name: dependency.name,
      type: dependency.type,
      port: this.getAvailablePort(),
      endpoints: this.generateMockEndpoints(dependency, customMocks),
      status: 'running'
    };

    // Start the mock service (in real implementation, this would start an actual HTTP server)
    this.mockServices.set(mockService.name, mockService);
    this.emit('mockServiceStarted', mockService);

    return mockService;
  }

  /**
   * Stop a mock service
   */
  private async stopMockService(serviceName: string): Promise<void> {
    const mockService = this.mockServices.get(serviceName);
    if (mockService) {
      mockService.status = 'stopped';
      this.mockServices.delete(serviceName);
      this.emit('mockServiceStopped', { name: serviceName });
    }
  }

  /**
   * Generate mock endpoints for a dependency
   */
  private generateMockEndpoints(dependency: ComponentDependency, customMocks?: Record<string, any>): Array<{
    path: string;
    method: string;
    response: any;
    delay?: number;
  }> {
    const endpoints = [];

    switch (dependency.type) {
      case 'service':
      case 'api':
        // Generate common REST endpoints
        endpoints.push(
          { path: '/health', method: 'GET', response: { status: 'UP' } },
          { path: '/api/users', method: 'GET', response: customMocks?.['users'] || [{ id: 1, name: 'Mock User', email: 'mock@example.com' }] },
          { path: '/api/users/:id', method: 'GET', response: customMocks?.['user'] || { id: 1, name: 'Mock User', email: 'mock@example.com' } },
          { path: '/api/users', method: 'POST', response: { id: 2, name: 'New Mock User', email: 'new@example.com' } }
        );
        break;
      
      case 'database':
        // For database mocks, we might return structured data
        endpoints.push(
          { path: '/query', method: 'POST', response: { rows: customMocks?.['dbRows'] || [], count: 0 } }
        );
        break;

      case 'cache':
        endpoints.push(
          { path: '/get/:key', method: 'GET', response: customMocks?.['cacheValue'] || null },
          { path: '/set', method: 'POST', response: { success: true } }
        );
        break;
    }

    return endpoints;
  }

  /**
   * Generate test environment variables for isolated testing
   */
  private generateTestEnvironment(_component: ComponentInfo, mocks: MockService[]): Record<string, string> {
    const env: Record<string, string> = {
      NODE_ENV: 'test',
      SPRING_PROFILES_ACTIVE: 'test',
      TEST_MODE: 'true'
    };

    // Add mock service URLs to environment
    for (const mock of mocks) {
      const envKey = `${mock.name.toUpperCase().replace('-', '_')}_URL`;
      env[envKey] = `http://localhost:${mock.port}`;
    }

    return env;
  }

  /**
   * Get an available port for mock services
   */
  private getAvailablePort(): number {
    // Simple port allocation - in real implementation, this would check for available ports
    const usedPorts = Array.from(this.mockServices.values()).map(m => m.port);
    let port = 9000;
    while (usedPorts.includes(port)) {
      port++;
    }
    return port;
  }

  /**
   * Get all active component sessions
   */
  getActiveSessions(): ComponentSession[] {
    return Array.from(this.sessions.values());
  }

  /**
   * Get active mock services
   */
  getActiveMockServices(): MockService[] {
    return Array.from(this.mockServices.values());
  }

  /**
   * Run isolated tests for a component
   */
  async runIsolatedTests(sessionId: string, _testSuite?: string): Promise<{
    success: boolean;
    results: Array<{
      name: string;
      status: 'passed' | 'failed' | 'skipped';
      duration: number;
      error?: string;
    }>;
  }> {
    const session = this.sessions.get(sessionId);
    if (!session) {
      throw new Error(`Session ${sessionId} not found`);
    }

    // Mock test execution
    return {
      success: true,
      results: [
        { name: 'Component initialization', status: 'passed', duration: 125 },
        { name: 'Mock service connectivity', status: 'passed', duration: 50 },
        { name: 'API endpoint tests', status: 'passed', duration: 300 },
        { name: 'Error handling tests', status: 'passed', duration: 200 }
      ]
    };
  }

  /**
   * Get component debugging recommendations
   */
  async getDebuggingRecommendations(componentName: string): Promise<Array<{
    type: 'performance' | 'dependency' | 'testing' | 'configuration';
    severity: 'low' | 'medium' | 'high';
    message: string;
    action?: string;
  }>> {
    const components = await this.analyzeProject();
    const component = components.find(c => c.name === componentName);
    
    if (!component) {
      return [];
    }

    const recommendations = [];

    // Check for unavailable dependencies
    const unavailableDeps = component.dependencies.filter(d => d.status === 'unavailable');
    if (unavailableDeps.length > 0) {
      recommendations.push({
        type: 'dependency' as const,
        severity: 'high' as const,
        message: `${unavailableDeps.length} dependencies are unavailable: ${unavailableDeps.map(d => d.name).join(', ')}`,
        action: 'Consider using mock services for isolated debugging'
      });
    }

    // Check for required dependencies
    const requiredUnavailable = component.dependencies.filter(d => d.required && d.status === 'unavailable');
    if (requiredUnavailable.length > 0) {
      recommendations.push({
        type: 'configuration' as const,
        severity: 'high' as const,
        message: `Required dependencies are unavailable: ${requiredUnavailable.map(d => d.name).join(', ')}`,
        action: 'Start required services or enable mocking'
      });
    }

    // Suggest isolated testing
    recommendations.push({
      type: 'testing' as const,
      severity: 'medium' as const,
      message: 'Component can be tested in isolation',
      action: 'Use isolated testing mode for faster development cycles'
    });

    return recommendations;
  }
}
