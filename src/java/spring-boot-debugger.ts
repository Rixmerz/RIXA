import { EventEmitter } from 'events';
import type { JavaDebugger } from './java-debugger.js';

/**
 * Spring Boot Debugger - Specialized debugging for Spring Boot applications
 * Provides Spring Boot-specific debugging capabilities including actuator endpoints,
 * profiles, microservices, and Spring-specific features
 */

export interface SpringBootDebuggerConfig {
  javaDebugger: JavaDebugger;
  enableActuatorDebugging?: boolean;
  enableProfileDebugging?: boolean;
  enableMicroserviceDebugging?: boolean;
  enableSecurityDebugging?: boolean;
  enableDataDebugging?: boolean;
  actuatorPort?: number;
  managementContextPath?: string;
}

export interface SpringBootInfo {
  version: string;
  profiles: {
    active: string[];
    default: string[];
  };
  properties: Record<string, any>;
  beans: SpringBean[];
  endpoints: ActuatorEndpoint[];
  health: HealthStatus;
  metrics: SpringMetrics;
}

export interface SpringBean {
  name: string;
  type: string;
  scope: string;
  dependencies: string[];
  aliases: string[];
  resource?: string;
}

export interface ActuatorEndpoint {
  id: string;
  enabled: boolean;
  sensitive: boolean;
  path: string;
  methods: string[];
  produces?: string[];
}

export interface HealthStatus {
  status: 'UP' | 'DOWN' | 'OUT_OF_SERVICE' | 'UNKNOWN';
  components: Record<string, {
    status: string;
    details?: Record<string, any>;
  }>;
  details?: Record<string, any>;
}

export interface SpringMetrics {
  jvm: {
    memory: {
      used: number;
      committed: number;
      max: number;
    };
    gc: {
      collections: number;
      time: number;
    };
    threads: {
      live: number;
      daemon: number;
      peak: number;
    };
  };
  http: {
    requests: {
      total: number;
      active: number;
      duration: {
        max: number;
        mean: number;
      };
    };
  };
  database: {
    connections: {
      active: number;
      idle: number;
      max: number;
      min: number;
    };
  };
}

export interface SpringBootRequest {
  id: string;
  method: string;
  uri: string;
  headers: Record<string, string>;
  parameters: Record<string, string>;
  body?: string;
  timestamp: number;
  duration?: number;
  status?: number;
  controller?: string;
  handler?: string;
  profile?: string;
}

export interface SpringBootProfile {
  name: string;
  active: boolean;
  properties: Record<string, any>;
  beans: string[];
  configurations: string[];
}

export interface MicroserviceInfo {
  serviceName: string;
  instanceId: string;
  port: number;
  healthUrl: string;
  dependencies: Array<{
    name: string;
    url: string;
    status: 'UP' | 'DOWN' | 'UNKNOWN';
  }>;
  circuitBreakers?: Array<{
    name: string;
    state: 'CLOSED' | 'OPEN' | 'HALF_OPEN';
    failureRate: number;
  }>;
}

export interface SpringSecurityInfo {
  authentication: {
    type: string;
    principal?: string;
    authorities: string[];
  };
  sessions: Array<{
    id: string;
    principal: string;
    lastRequest: number;
    maxInactiveInterval: number;
  }>;
  csrf: {
    enabled: boolean;
    token?: string;
  };
}

export interface SpringDataQuery {
  id: string;
  repository: string;
  method: string;
  query: string;
  parameters: any[];
  executionTime: number;
  resultCount?: number;
  timestamp: number;
  stackTrace?: string[];
}

export class SpringBootDebugger extends EventEmitter {
  private config: SpringBootDebuggerConfig;
  private requests: SpringBootRequest[] = [];
  private queries: SpringDataQuery[] = [];
  private isTracking = false;

  constructor(config: SpringBootDebuggerConfig) {
    super();
    this.config = {
      enableActuatorDebugging: true,
      enableProfileDebugging: true,
      enableMicroserviceDebugging: true,
      enableSecurityDebugging: true,
      enableDataDebugging: true,
      actuatorPort: 8080,
      managementContextPath: '/actuator',
      ...config
    };

    this.setupEventHandlers();
  }

  private setupEventHandlers(): void {
    // Listen to Java debugger events
    this.config.javaDebugger.on('connected', () => {
      this.emit('springBootConnected');
    });

    this.config.javaDebugger.on('disconnected', () => {
      this.emit('springBootDisconnected');
    });
  }

  /**
   * Start Spring Boot-specific debugging
   */
  async startDebugging(): Promise<void> {
    if (!this.config.javaDebugger.isConnectedToJava()) {
      throw new Error('Java debugger not connected');
    }

    this.isTracking = true;
    this.requests = [];
    this.queries = [];

    // Initialize Spring Boot debugging components
    if (this.config.enableActuatorDebugging) {
      await this.initializeActuatorDebugging();
    }

    if (this.config.enableDataDebugging) {
      await this.initializeDataDebugging();
    }

    if (this.config.enableSecurityDebugging) {
      await this.initializeSecurityDebugging();
    }

    this.emit('debuggingStarted');
  }

  /**
   * Stop Spring Boot debugging
   */
  async stopDebugging(): Promise<void> {
    this.isTracking = false;
    this.emit('debuggingStopped');
  }

  /**
   * Initialize Actuator debugging
   */
  private async initializeActuatorDebugging(): Promise<void> {
    // Mock Actuator debugging initialization
    this.emit('actuatorDebuggingInitialized');
  }

  /**
   * Initialize Spring Data debugging
   */
  private async initializeDataDebugging(): Promise<void> {
    // Mock Spring Data debugging initialization
    this.emit('dataDebuggingInitialized');
  }

  /**
   * Initialize Spring Security debugging
   */
  private async initializeSecurityDebugging(): Promise<void> {
    // Mock Spring Security debugging initialization
    this.emit('securityDebuggingInitialized');
  }

  /**
   * Get Spring Boot application information
   */
  async getSpringBootInfo(): Promise<SpringBootInfo> {
    // Mock Spring Boot info
    return {
      version: '3.1.0',
      profiles: {
        active: ['dev', 'local'],
        default: ['default']
      },
      properties: {
        'server.port': 8080,
        'spring.datasource.url': 'jdbc:mysql://localhost:3306/mydb',
        'spring.jpa.hibernate.ddl-auto': 'update',
        'logging.level.com.example': 'DEBUG'
      },
      beans: [
        {
          name: 'userController',
          type: 'com.example.controller.UserController',
          scope: 'singleton',
          dependencies: ['userService'],
          aliases: []
        },
        {
          name: 'userService',
          type: 'com.example.service.UserService',
          scope: 'singleton',
          dependencies: ['userRepository'],
          aliases: []
        }
      ],
      endpoints: [
        { id: 'health', enabled: true, sensitive: false, path: '/actuator/health', methods: ['GET'] },
        { id: 'info', enabled: true, sensitive: false, path: '/actuator/info', methods: ['GET'] },
        { id: 'metrics', enabled: true, sensitive: true, path: '/actuator/metrics', methods: ['GET'] },
        { id: 'beans', enabled: true, sensitive: true, path: '/actuator/beans', methods: ['GET'] }
      ],
      health: {
        status: 'UP',
        components: {
          db: { status: 'UP', details: { database: 'MySQL', validationQuery: 'isValid()' } },
          diskSpace: { status: 'UP', details: { total: 499963174912, free: 91943821312, threshold: 10485760 } }
        }
      },
      metrics: {
        jvm: {
          memory: { used: 256000000, committed: 512000000, max: 1024000000 },
          gc: { collections: 15, time: 125 },
          threads: { live: 25, daemon: 18, peak: 30 }
        },
        http: {
          requests: {
            total: 1250,
            active: 3,
            duration: { max: 2.5, mean: 0.125 }
          }
        },
        database: {
          connections: { active: 2, idle: 8, max: 10, min: 5 }
        }
      }
    };
  }

  /**
   * Get Spring Boot profiles
   */
  async getProfiles(): Promise<SpringBootProfile[]> {
    // Mock profiles
    return [
      {
        name: 'dev',
        active: true,
        properties: {
          'logging.level.com.example': 'DEBUG',
          'spring.datasource.url': 'jdbc:mysql://localhost:3306/mydb_dev'
        },
        beans: ['devDataSource', 'devMailSender'],
        configurations: ['DevConfig', 'DatabaseDevConfig']
      },
      {
        name: 'prod',
        active: false,
        properties: {
          'logging.level.com.example': 'INFO',
          'spring.datasource.url': 'jdbc:mysql://prod-server:3306/mydb_prod'
        },
        beans: ['prodDataSource', 'prodMailSender'],
        configurations: ['ProdConfig', 'DatabaseProdConfig']
      }
    ];
  }

  /**
   * Get actuator endpoints
   */
  async getActuatorEndpoints(): Promise<ActuatorEndpoint[]> {
    const info = await this.getSpringBootInfo();
    return info.endpoints;
  }

  /**
   * Get health status
   */
  async getHealthStatus(): Promise<HealthStatus> {
    const info = await this.getSpringBootInfo();
    return info.health;
  }

  /**
   * Get Spring Boot metrics
   */
  async getMetrics(): Promise<SpringMetrics> {
    const info = await this.getSpringBootInfo();
    return info.metrics;
  }

  /**
   * Get Spring beans
   */
  async getBeans(): Promise<SpringBean[]> {
    const info = await this.getSpringBootInfo();
    return info.beans;
  }

  /**
   * Get Spring Boot requests
   */
  getRequests(limit = 100): SpringBootRequest[] {
    return this.requests.slice(-limit);
  }

  /**
   * Get Spring Data queries
   */
  getDataQueries(limit = 100): SpringDataQuery[] {
    return this.queries.slice(-limit);
  }

  /**
   * Analyze Spring Data queries for performance issues
   */
  async analyzeDataQueries(): Promise<Array<SpringDataQuery & { issues: string[] }>> {
    const queries = this.getDataQueries();
    
    return queries.map(query => {
      const issues: string[] = [];
      
      // Check for slow queries
      if (query.executionTime > 1000) {
        issues.push(`Slow query - ${query.executionTime}ms execution time`);
      }
      
      // Check for N+1 queries
      if (query.query.includes('SELECT') && !query.query.includes('JOIN')) {
        issues.push('Potential N+1 query - consider using JOIN or fetch strategies');
      }
      
      // Check for large result sets
      if (query.resultCount && query.resultCount > 1000) {
        issues.push(`Large result set - ${query.resultCount} records returned`);
      }
      
      return { ...query, issues };
    });
  }

  /**
   * Get microservice information
   */
  async getMicroserviceInfo(): Promise<MicroserviceInfo> {
    // Mock microservice info
    return {
      serviceName: 'user-service',
      instanceId: 'user-service-1',
      port: 8080,
      healthUrl: 'http://localhost:8080/actuator/health',
      dependencies: [
        { name: 'order-service', url: 'http://order-service:8081', status: 'UP' },
        { name: 'notification-service', url: 'http://notification-service:8082', status: 'UP' },
        { name: 'database', url: 'jdbc:mysql://db:3306/userdb', status: 'UP' }
      ],
      circuitBreakers: [
        { name: 'orderServiceCircuitBreaker', state: 'CLOSED', failureRate: 0.05 },
        { name: 'notificationServiceCircuitBreaker', state: 'CLOSED', failureRate: 0.02 }
      ]
    };
  }

  /**
   * Get Spring Security information
   */
  async getSecurityInfo(): Promise<SpringSecurityInfo> {
    // Mock security info
    return {
      authentication: {
        type: 'JWT',
        principal: 'user@example.com',
        authorities: ['ROLE_USER', 'ROLE_ADMIN']
      },
      sessions: [
        {
          id: 'session-123',
          principal: 'user@example.com',
          lastRequest: Date.now() - 300000,
          maxInactiveInterval: 1800
        }
      ],
      csrf: {
        enabled: true,
        token: 'csrf-token-abc123'
      }
    };
  }

  /**
   * Set breakpoint on Spring Boot controller method
   */
  async setControllerBreakpoint(controllerClass: string, method: string, condition?: string): Promise<void> {
    // Mock setting breakpoint on controller method
    this.emit('controllerBreakpointSet', { controllerClass, method, condition });
  }

  /**
   * Set breakpoint on Spring Boot service method
   */
  async setServiceBreakpoint(serviceClass: string, method: string, condition?: string): Promise<void> {
    // Mock setting breakpoint on service method
    this.emit('serviceBreakpointSet', { serviceClass, method, condition });
  }

  /**
   * Check if Spring Boot debugging is active
   */
  isDebuggingActive(): boolean {
    return this.isTracking;
  }
}
