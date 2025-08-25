import { EventEmitter } from 'events';
import type { LanguageDispatcher } from './language-dispatcher.js';

/**
 * Docker Debugger - Specialized debugging for Docker containers and remote applications
 * Provides Docker-specific debugging capabilities including container inspection,
 * port forwarding, network debugging, and remote debugging setup
 */

export interface DockerDebuggerConfig {
  languageDispatcher: LanguageDispatcher;
  dockerHost?: string;
  enablePortForwarding?: boolean;
  enableNetworkDebugging?: boolean;
  enableContainerInspection?: boolean;
}

export interface ContainerInfo {
  id: string;
  name: string;
  image: string;
  status: 'running' | 'stopped' | 'paused' | 'restarting';
  ports: PortMapping[];
  networks: NetworkInfo[];
  volumes: VolumeMapping[];
  environment: Record<string, string>;
  labels: Record<string, string>;
  created: number;
  started?: number;
}

export interface PortMapping {
  containerPort: number;
  hostPort?: number;
  protocol: 'tcp' | 'udp';
  hostIP?: string;
}

export interface NetworkInfo {
  name: string;
  driver: string;
  ipAddress: string;
  gateway: string;
  subnet: string;
}

export interface VolumeMapping {
  source: string;
  destination: string;
  mode: 'ro' | 'rw';
  type: 'bind' | 'volume' | 'tmpfs';
}

export interface DockerComposeService {
  name: string;
  image: string;
  build?: {
    context: string;
    dockerfile?: string;
  };
  ports: string[];
  environment: Record<string, string>;
  volumes: string[];
  depends_on: string[];
  networks: string[];
  status: 'running' | 'stopped' | 'error';
  containerId?: string;
}

export interface RemoteDebugConfig {
  host: string;
  port: number;
  language: string;
  framework?: string;
  containerName?: string;
  debugPort?: number;
  sshTunnel?: {
    host: string;
    port: number;
    username: string;
    keyPath?: string;
  };
}

export interface PortForwardRule {
  id: string;
  localPort: number;
  remoteHost: string;
  remotePort: number;
  protocol: 'tcp' | 'udp';
  status: 'active' | 'inactive' | 'error';
  containerId?: string;
}

export interface NetworkDiagnostic {
  containerName: string;
  connectivity: Array<{
    target: string;
    port: number;
    status: 'reachable' | 'unreachable' | 'timeout';
    latency?: number;
  }>;
  dns: Array<{
    hostname: string;
    resolved: boolean;
    ip?: string;
  }>;
  routes: Array<{
    destination: string;
    gateway: string;
    interface: string;
  }>;
}

export class DockerDebugger extends EventEmitter {
  private config: DockerDebuggerConfig;
  private portForwards: Map<string, PortForwardRule> = new Map();
  private activeConnections: Map<string, any> = new Map();

  constructor(config: DockerDebuggerConfig) {
    super();
    this.config = {
      dockerHost: 'unix:///var/run/docker.sock',
      enablePortForwarding: true,
      enableNetworkDebugging: true,
      enableContainerInspection: true,
      ...config
    };
  }

  /**
   * List all Docker containers
   */
  async listContainers(_includeAll = false): Promise<ContainerInfo[]> {
    // Mock container listing - in real implementation, this would use Docker API
    return [
      {
        id: 'abc123def456',
        name: 'user-service',
        image: 'user-service:latest',
        status: 'running',
        ports: [
          { containerPort: 8080, hostPort: 8080, protocol: 'tcp' },
          { containerPort: 5005, hostPort: 5005, protocol: 'tcp' } // Debug port
        ],
        networks: [
          {
            name: 'app-network',
            driver: 'bridge',
            ipAddress: '172.20.0.2',
            gateway: '172.20.0.1',
            subnet: '172.20.0.0/16'
          }
        ],
        volumes: [
          { source: '/host/logs', destination: '/app/logs', mode: 'rw', type: 'bind' }
        ],
        environment: {
          'SPRING_PROFILES_ACTIVE': 'docker',
          'JAVA_TOOL_OPTIONS': '-agentlib:jdwp=transport=dt_socket,server=y,suspend=n,address=*:5005'
        },
        labels: {
          'com.docker.compose.service': 'user-service',
          'com.docker.compose.project': 'myapp'
        },
        created: Date.now() - 3600000,
        started: Date.now() - 3600000
      },
      {
        id: 'def456ghi789',
        name: 'frontend-app',
        image: 'frontend-app:latest',
        status: 'running',
        ports: [
          { containerPort: 3000, hostPort: 3000, protocol: 'tcp' },
          { containerPort: 9229, hostPort: 9229, protocol: 'tcp' } // Node.js debug port
        ],
        networks: [
          {
            name: 'app-network',
            driver: 'bridge',
            ipAddress: '172.20.0.3',
            gateway: '172.20.0.1',
            subnet: '172.20.0.0/16'
          }
        ],
        volumes: [],
        environment: {
          'NODE_ENV': 'development',
          'REACT_APP_API_URL': 'http://user-service:8080'
        },
        labels: {
          'com.docker.compose.service': 'frontend',
          'com.docker.compose.project': 'myapp'
        },
        created: Date.now() - 3600000,
        started: Date.now() - 3600000
      }
    ];
  }

  /**
   * Get Docker Compose services
   */
  async getComposeServices(_projectPath: string): Promise<DockerComposeService[]> {
    // Mock Docker Compose service listing
    return [
      {
        name: 'user-service',
        image: 'user-service:latest',
        build: {
          context: './backend',
          dockerfile: 'Dockerfile'
        },
        ports: ['8080:8080', '5005:5005'],
        environment: {
          'SPRING_PROFILES_ACTIVE': 'docker',
          'DATABASE_URL': 'jdbc:mysql://db:3306/userdb'
        },
        volumes: ['./logs:/app/logs'],
        depends_on: ['db'],
        networks: ['app-network'],
        status: 'running',
        containerId: 'abc123def456'
      },
      {
        name: 'frontend',
        image: 'frontend-app:latest',
        build: {
          context: './frontend',
          dockerfile: 'Dockerfile'
        },
        ports: ['3000:3000', '9229:9229'],
        environment: {
          'REACT_APP_API_URL': 'http://user-service:8080'
        },
        volumes: [],
        depends_on: ['user-service'],
        networks: ['app-network'],
        status: 'running',
        containerId: 'def456ghi789'
      },
      {
        name: 'db',
        image: 'mysql:8.0',
        ports: ['3306:3306'],
        environment: {
          'MYSQL_ROOT_PASSWORD': 'rootpass',
          'MYSQL_DATABASE': 'userdb'
        },
        volumes: ['db-data:/var/lib/mysql'],
        depends_on: [],
        networks: ['app-network'],
        status: 'running',
        containerId: 'ghi789jkl012'
      }
    ];
  }

  /**
   * Connect to a containerized application for debugging
   */
  async connectToContainer(containerName: string, debugConfig: {
    language: string;
    debugPort?: number;
    autoDetectPort?: boolean;
  }): Promise<{ sessionId: string; connectionInfo: any }> {
    const containers = await this.listContainers();
    const container = containers.find(c => c.name === containerName || c.id === containerName);
    
    if (!container) {
      throw new Error(`Container ${containerName} not found`);
    }

    if (container.status !== 'running') {
      throw new Error(`Container ${containerName} is not running (status: ${container.status})`);
    }

    // Find debug port
    let debugPort = debugConfig.debugPort;
    if (!debugPort && debugConfig.autoDetectPort) {
      debugPort = this.detectDebugPort(container, debugConfig.language);
    }

    if (!debugPort) {
      throw new Error(`Debug port not found for container ${containerName}`);
    }

    // Find host port mapping
    const portMapping = container.ports.find(p => p.containerPort === debugPort);
    const hostPort = portMapping?.hostPort || debugPort;

    // Connect using language dispatcher
    const connection = await this.config.languageDispatcher.connect({
      language: debugConfig.language as any,
      host: 'localhost',
      port: hostPort,
      enableFrameworkTools: true
    });

    if (connection.sessionId) {
      this.activeConnections.set(connection.sessionId, {
        containerId: container.id,
        containerName: container.name,
        debugPort,
        hostPort
      });

      this.emit('containerConnected', {
        sessionId: connection.sessionId,
        containerName,
        debugPort,
        hostPort
      });
    }

    return {
      sessionId: connection.sessionId || `docker-${Date.now()}`,
      connectionInfo: connection
    };
  }

  /**
   * Setup remote debugging for a container
   */
  async setupRemoteDebugging(config: RemoteDebugConfig): Promise<{
    sessionId: string;
    localPort: number;
    instructions: string[];
  }> {
    const localPort = await this.getAvailablePort();
    
    // Create port forward rule
    const portForwardId = `remote-${Date.now()}`;
    const portForward: PortForwardRule = {
      id: portForwardId,
      localPort,
      remoteHost: config.host,
      remotePort: config.port,
      protocol: 'tcp',
      status: 'active'
    };

    if (config.containerName) {
      portForward.containerId = config.containerName;
    }

    this.portForwards.set(portForwardId, portForward);

    // Setup SSH tunnel if configured
    if (config.sshTunnel) {
      await this.setupSSHTunnel(config.sshTunnel, localPort, config.host, config.port);
    }

    // Connect to the forwarded port
    const connectionOptions: any = {
      language: config.language as any,
      host: 'localhost',
      port: localPort,
      enableFrameworkTools: true
    };

    if (config.framework) {
      connectionOptions.framework = config.framework;
    }

    const connection = await this.config.languageDispatcher.connect(connectionOptions);

    const instructions = this.generateRemoteDebuggingInstructions(config, localPort);

    return {
      sessionId: connection.sessionId || `remote-${Date.now()}`,
      localPort,
      instructions
    };
  }

  /**
   * Create port forwarding rule
   */
  async createPortForward(localPort: number, containerName: string, containerPort: number): Promise<PortForwardRule> {
    const containers = await this.listContainers();
    const container = containers.find(c => c.name === containerName);
    
    if (!container) {
      throw new Error(`Container ${containerName} not found`);
    }

    const portForwardId = `forward-${Date.now()}`;
    const portForward: PortForwardRule = {
      id: portForwardId,
      localPort,
      remoteHost: container.networks[0]?.ipAddress || 'localhost',
      remotePort: containerPort,
      protocol: 'tcp',
      status: 'active',
      containerId: container.id
    };

    this.portForwards.set(portForwardId, portForward);
    this.emit('portForwardCreated', portForward);

    return portForward;
  }

  /**
   * Remove port forwarding rule
   */
  async removePortForward(portForwardId: string): Promise<void> {
    const portForward = this.portForwards.get(portForwardId);
    if (portForward) {
      portForward.status = 'inactive';
      this.portForwards.delete(portForwardId);
      this.emit('portForwardRemoved', { id: portForwardId });
    }
  }

  /**
   * Run network diagnostics for a container
   */
  async runNetworkDiagnostics(containerName: string): Promise<NetworkDiagnostic> {
    const containers = await this.listContainers();
    const container = containers.find(c => c.name === containerName);
    
    if (!container) {
      throw new Error(`Container ${containerName} not found`);
    }

    // Mock network diagnostics
    return {
      containerName,
      connectivity: [
        { target: 'google.com', port: 80, status: 'reachable', latency: 25 },
        { target: 'localhost', port: 3306, status: 'reachable', latency: 1 },
        { target: 'external-api.com', port: 443, status: 'timeout' }
      ],
      dns: [
        { hostname: 'google.com', resolved: true, ip: '8.8.8.8' },
        { hostname: 'localhost', resolved: true, ip: '127.0.0.1' },
        { hostname: 'invalid-host.local', resolved: false }
      ],
      routes: [
        { destination: '0.0.0.0/0', gateway: '172.20.0.1', interface: 'eth0' },
        { destination: '172.20.0.0/16', gateway: '0.0.0.0', interface: 'eth0' }
      ]
    };
  }

  /**
   * Get container logs
   */
  async getContainerLogs(_containerName: string, options: {
    tail?: number;
    since?: string;
    follow?: boolean;
  } = {}): Promise<string[]> {
    // Mock container logs
    return [
      '2024-01-15 10:30:00 INFO  Starting application...',
      '2024-01-15 10:30:01 INFO  Connected to database',
      '2024-01-15 10:30:02 INFO  Debug agent listening on port 5005',
      '2024-01-15 10:30:03 INFO  Application started successfully',
      '2024-01-15 10:30:10 DEBUG Processing request: GET /api/users',
      '2024-01-15 10:30:11 DEBUG Query executed in 25ms',
      '2024-01-15 10:30:12 INFO  Request completed: 200 OK'
    ].slice(-(options.tail || 100));
  }

  /**
   * Execute command in container
   */
  async execInContainer(_containerName: string, command: string[]): Promise<{
    exitCode: number;
    stdout: string;
    stderr: string;
  }> {
    // Mock command execution
    return {
      exitCode: 0,
      stdout: `Executed: ${command.join(' ')}`,
      stderr: ''
    };
  }

  /**
   * Detect debug port for a container based on language
   */
  private detectDebugPort(container: ContainerInfo, language: string): number | undefined {
    const debugPorts: Record<string, number[]> = {
      java: [5005, 8000, 8787],
      node: [9229, 9230],
      python: [5678, 3000],
      go: [38697, 2345],
      php: [9003, 9000]
    };

    const possiblePorts = debugPorts[language] || [];
    
    for (const port of possiblePorts) {
      const mapping = container.ports.find(p => p.containerPort === port);
      if (mapping) {
        return port;
      }
    }

    // Check environment variables for debug configuration
    const javaDebugEnv = container.environment['JAVA_TOOL_OPTIONS'];
    if (javaDebugEnv && javaDebugEnv.includes('address=')) {
      const match = javaDebugEnv.match(/address=\*?:?(\d+)/);
      if (match && match[1]) {
        return parseInt(match[1]);
      }
    }

    return undefined;
  }

  /**
   * Setup SSH tunnel for remote debugging
   */
  private async setupSSHTunnel(sshConfig: any, localPort: number, remoteHost: string, remotePort: number): Promise<void> {
    // Mock SSH tunnel setup
    this.emit('sshTunnelCreated', {
      localPort,
      remoteHost,
      remotePort,
      sshHost: sshConfig.host
    });
  }

  /**
   * Generate remote debugging instructions
   */
  private generateRemoteDebuggingInstructions(config: RemoteDebugConfig, localPort: number): string[] {
    const instructions = [
      `Remote debugging setup completed for ${config.language} application`,
      `Local debug port: ${localPort}`,
      `Remote host: ${config.host}:${config.port}`,
      '',
      'To connect your IDE:',
      `1. Configure remote debugging to localhost:${localPort}`,
      `2. Set breakpoints in your code`,
      `3. Start debugging session`
    ];

    if (config.containerName) {
      instructions.push(`4. Container: ${config.containerName}`);
    }

    if (config.sshTunnel) {
      instructions.push(`5. SSH tunnel via ${config.sshTunnel.host}:${config.sshTunnel.port}`);
    }

    return instructions;
  }

  /**
   * Get available port for port forwarding
   */
  private async getAvailablePort(): Promise<number> {
    const usedPorts = Array.from(this.portForwards.values()).map(pf => pf.localPort);
    let port = 9000;
    while (usedPorts.includes(port)) {
      port++;
    }
    return port;
  }

  /**
   * Get active port forwards
   */
  getActivePortForwards(): PortForwardRule[] {
    return Array.from(this.portForwards.values()).filter(pf => pf.status === 'active');
  }

  /**
   * Get active connections
   */
  getActiveConnections(): Array<{ sessionId: string; containerName: string; debugPort: number; hostPort: number }> {
    return Array.from(this.activeConnections.entries()).map(([sessionId, info]) => ({
      sessionId,
      ...info
    }));
  }
}
