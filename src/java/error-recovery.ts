import { EventEmitter } from 'events';
import { JDWPValidator } from './jdwp-validator.js';
import { HybridDebugger } from './hybrid-debugger.js';
import type { JDWPConnectionInfo } from './jdwp-validator.js';
import type { HybridDebugConfig } from './hybrid-debugger.js';
import type { JavaProjectInfo } from './enhanced-detection.js';

/**
 * Advanced Error Recovery System
 * Provides intelligent fallback strategies and self-healing capabilities
 */

export interface RecoveryStrategy {
  name: string;
  description: string;
  priority: number;
  applicable: (error: DebugError) => boolean;
  execute: (error: DebugError, context: RecoveryContext) => Promise<RecoveryResult>;
}

export interface DebugError {
  type: 'connection' | 'handshake' | 'configuration' | 'timeout' | 'unknown';
  message: string;
  code?: string;
  details?: any;
  timestamp: Date;
  retryCount: number;
}

export interface RecoveryContext {
  workspaceRoot: string;
  projectInfo: JavaProjectInfo;
  originalConfig: any;
  availablePorts: number[];
  jdwpAgents: JDWPConnectionInfo[];
}

export interface RecoveryResult {
  success: boolean;
  strategy: string;
  message: string;
  newConfig?: any;
  fallbackMethod?: 'hybrid' | 'manual' | 'alternative';
  recommendations: string[];
}

export interface TroubleshootingGuide {
  problem: string;
  symptoms: string[];
  solutions: TroubleshootingSolution[];
  preventionTips: string[];
}

export interface TroubleshootingSolution {
  title: string;
  description: string;
  steps: string[];
  difficulty: 'easy' | 'medium' | 'hard';
  estimatedTime: string;
}

/**
 * Advanced Error Recovery Class
 */
export class AdvancedErrorRecovery extends EventEmitter {
  private strategies: Map<string, RecoveryStrategy> = new Map();
  private recoveryHistory: DebugError[] = [];
  private isRecovering = false;
  private hybridDebugger?: HybridDebugger;

  constructor() {
    super();
    this.initializeStrategies();
  }

  /**
   * Initializes recovery strategies
   */
  private initializeStrategies(): void {
    // Strategy 1: Port Detection and Retry
    this.addStrategy({
      name: 'port-detection-retry',
      description: 'Detect active debug ports and retry connection',
      priority: 1,
      applicable: (error) => error.type === 'connection',
      execute: async (_error, context) => {
        const activeAgents = await this.scanForActiveAgents();

        if (activeAgents.length > 0) {
          const agent = activeAgents[0];
          if (agent) {
            return {
              success: true,
              strategy: 'port-detection-retry',
              message: `Found active JDWP agent on port ${agent.port}`,
              newConfig: {
                ...context.originalConfig,
                port: agent.port,
                host: agent.host
              },
              recommendations: [
                `Use port ${agent.port} for debugging`,
                'Verify application is running with debug agent enabled'
              ]
            };
          }
        }
        
        return {
          success: false,
          strategy: 'port-detection-retry',
          message: 'No active JDWP agents found',
          recommendations: [
            'Start your application with debug agent: -agentlib:jdwp=transport=dt_socket,server=y,suspend=n,address=5005',
            'Check if application is running',
            'Verify firewall settings'
          ]
        };
      }
    });

    // Strategy 2: Configuration Auto-Fix
    this.addStrategy({
      name: 'configuration-auto-fix',
      description: 'Automatically fix common configuration issues',
      priority: 2,
      applicable: (error) => error.type === 'configuration',
      execute: async (_error, context) => {
        const fixes: string[] = [];
        let newConfig = { ...context.originalConfig };
        
        // Fix missing main class
        if (!newConfig.mainClass && context.projectInfo.mainClass) {
          newConfig.mainClass = context.projectInfo.mainClass;
          fixes.push('Added detected main class');
        }
        
        // Fix classpath
        if (!newConfig.classPaths || newConfig.classPaths.length === 0) {
          newConfig.classPaths = context.projectInfo.classPaths;
          fixes.push('Added detected classpath');
        }
        
        // Fix source paths
        if (!newConfig.sourcePaths || newConfig.sourcePaths.length === 0) {
          newConfig.sourcePaths = context.projectInfo.sourcePaths;
          fixes.push('Added detected source paths');
        }
        
        return {
          success: fixes.length > 0,
          strategy: 'configuration-auto-fix',
          message: `Applied ${fixes.length} configuration fixes`,
          newConfig,
          recommendations: fixes
        };
      }
    });

    // Strategy 3: Hybrid Debugging Fallback
    this.addStrategy({
      name: 'hybrid-debugging-fallback',
      description: 'Fall back to hybrid debugging when traditional debugging fails',
      priority: 3,
      applicable: (error) => error.retryCount >= 2,
      execute: async (_error, context) => {
        try {
          const hybridConfig: HybridDebugConfig = {
            workspaceRoot: context.workspaceRoot,
            applicationUrl: 'http://localhost:8080',
            logFiles: [
              'logs/application.log',
              'target/spring.log',
              'application.log'
            ],
            apiEndpoints: [
              '/actuator/health',
              '/dictionarysupplier'
            ],
            enableLogWatching: true,
            enableApiTesting: true,
            enableBreakpointSimulation: true
          };
          
          this.hybridDebugger = new HybridDebugger(hybridConfig);
          await this.hybridDebugger.start();
          
          return {
            success: true,
            strategy: 'hybrid-debugging-fallback',
            message: 'Hybrid debugging activated successfully',
            fallbackMethod: 'hybrid',
            recommendations: [
              'Use log analysis for debugging',
              'Monitor API endpoints for behavior',
              'Set breakpoint simulations for key methods',
              'Check application logs in real-time'
            ]
          };
        } catch (hybridError) {
          return {
            success: false,
            strategy: 'hybrid-debugging-fallback',
            message: `Hybrid debugging failed: ${hybridError}`,
            fallbackMethod: 'manual',
            recommendations: [
              'Use traditional logging and debugging',
              'Add debug statements to your code',
              'Use IDE debugging features',
              'Check application configuration'
            ]
          };
        }
      }
    });

    // Strategy 4: Self-Healing Connection
    this.addStrategy({
      name: 'self-healing-connection',
      description: 'Attempt to restart debug agent and reconnect',
      priority: 4,
      applicable: (error) => error.type === 'timeout' || error.type === 'handshake',
      execute: async (_error, _context) => {
        // This would require integration with the application lifecycle
        // For now, provide guidance
        return {
          success: false,
          strategy: 'self-healing-connection',
          message: 'Self-healing requires manual intervention',
          recommendations: [
            'Restart your application with debug agent',
            'Check if debug port is not blocked',
            'Verify JDWP configuration',
            'Try a different debug port'
          ]
        };
      }
    });
  }

  /**
   * Adds a recovery strategy
   */
  addStrategy(strategy: RecoveryStrategy): void {
    this.strategies.set(strategy.name, strategy);
  }

  /**
   * Attempts to recover from a debug error
   */
  async attemptRecovery(error: DebugError, context: RecoveryContext): Promise<RecoveryResult> {
    if (this.isRecovering) {
      throw new Error('Recovery already in progress');
    }

    this.isRecovering = true;
    this.recoveryHistory.push(error);
    this.emit('recovery-started', error);

    try {
      // Sort strategies by priority
      const applicableStrategies = Array.from(this.strategies.values())
        .filter(strategy => strategy.applicable(error))
        .sort((a, b) => a.priority - b.priority);

      if (applicableStrategies.length === 0) {
        return {
          success: false,
          strategy: 'none',
          message: 'No applicable recovery strategies found',
          recommendations: this.getGenericRecommendations(error)
        };
      }

      // Try each strategy
      for (const strategy of applicableStrategies) {
        this.emit('strategy-attempt', strategy.name);
        
        try {
          const result = await strategy.execute(error, context);
          
          if (result.success) {
            this.emit('recovery-success', { strategy: strategy.name, result });
            return result;
          } else {
            this.emit('strategy-failed', { strategy: strategy.name, result });
          }
        } catch (strategyError) {
          this.emit('strategy-error', { strategy: strategy.name, error: strategyError });
        }
      }

      // If all strategies failed
      return {
        success: false,
        strategy: 'all-failed',
        message: 'All recovery strategies failed',
        fallbackMethod: 'manual',
        recommendations: this.getGenericRecommendations(error)
      };

    } finally {
      this.isRecovering = false;
      this.emit('recovery-completed');
    }
  }

  /**
   * Scans for active JDWP agents
   */
  private async scanForActiveAgents(): Promise<JDWPConnectionInfo[]> {
    const commonPorts = [5005, 8000, 8080, 9999];
    const activeAgents: JDWPConnectionInfo[] = [];

    for (const port of commonPorts) {
      const isActive = await JDWPValidator.quickValidate('localhost', port);
      if (isActive) {
        const info = await JDWPValidator.fullValidate('localhost', port);
        activeAgents.push(info);
      }
    }

    return activeAgents;
  }

  /**
   * Gets generic recommendations for error types
   */
  private getGenericRecommendations(error: DebugError): string[] {
    const recommendations: string[] = [];

    switch (error.type) {
      case 'connection':
        recommendations.push(
          'Verify application is running',
          'Check debug agent configuration',
          'Ensure port is not blocked by firewall',
          'Try a different debug port'
        );
        break;
      case 'handshake':
        recommendations.push(
          'Verify JDWP protocol compatibility',
          'Check Java version compatibility',
          'Restart debug agent',
          'Use different debug adapter'
        );
        break;
      case 'configuration':
        recommendations.push(
          'Check main class configuration',
          'Verify classpath settings',
          'Ensure source paths are correct',
          'Review project structure'
        );
        break;
      case 'timeout':
        recommendations.push(
          'Increase timeout values',
          'Check network connectivity',
          'Verify application responsiveness',
          'Try local debugging'
        );
        break;
      default:
        recommendations.push(
          'Check application logs',
          'Verify environment setup',
          'Try alternative debugging methods',
          'Consult documentation'
        );
    }

    return recommendations;
  }

  /**
   * Generates troubleshooting guide for common problems
   */
  generateTroubleshootingGuide(error: DebugError): TroubleshootingGuide {
    const guides: Record<string, TroubleshootingGuide> = {
      connection: {
        problem: 'Cannot connect to debug agent',
        symptoms: [
          'Connection refused error',
          'Timeout when connecting',
          'No response from debug port'
        ],
        solutions: [
          {
            title: 'Verify Debug Agent is Running',
            description: 'Ensure your application is started with debug agent enabled',
            steps: [
              'Add -agentlib:jdwp=transport=dt_socket,server=y,suspend=n,address=5005 to JVM args',
              'Start your application',
              'Look for "Listening for transport dt_socket at address: 5005" message'
            ],
            difficulty: 'easy',
            estimatedTime: '2 minutes'
          },
          {
            title: 'Check Port Availability',
            description: 'Verify the debug port is not blocked or in use',
            steps: [
              'Run: lsof -i:5005',
              'If port is in use by another process, kill it or use different port',
              'Check firewall settings',
              'Try telnet localhost 5005 to test connectivity'
            ],
            difficulty: 'medium',
            estimatedTime: '5 minutes'
          }
        ],
        preventionTips: [
          'Always start application with debug agent in development',
          'Use consistent debug port across environments',
          'Document debug configuration in project README'
        ]
      },
      configuration: {
        problem: 'Debug configuration is incorrect',
        symptoms: [
          'Main class not found',
          'Classpath errors',
          'Source files not found'
        ],
        solutions: [
          {
            title: 'Auto-detect Configuration',
            description: 'Let RIXA automatically detect project configuration',
            steps: [
              'Run debug_diagnoseJava() to analyze project',
              'Use detected main class and classpath',
              'Verify source paths are correct'
            ],
            difficulty: 'easy',
            estimatedTime: '1 minute'
          }
        ],
        preventionTips: [
          'Keep project structure standard',
          'Use Maven or Gradle for dependency management',
          'Document main class in pom.xml or build.gradle'
        ]
      }
    };

    return guides[error.type] || {
      problem: 'Unknown debugging issue',
      symptoms: ['Debugging not working as expected'],
      solutions: [
        {
          title: 'General Troubleshooting',
          description: 'Basic steps to diagnose debugging issues',
          steps: [
            'Check application logs',
            'Verify environment setup',
            'Try alternative debugging methods'
          ],
          difficulty: 'medium',
          estimatedTime: '10 minutes'
        }
      ],
      preventionTips: [
        'Keep debugging tools updated',
        'Follow best practices for development setup'
      ]
    };
  }

  /**
   * Gets recovery history
   */
  getRecoveryHistory(): DebugError[] {
    return [...this.recoveryHistory];
  }

  /**
   * Clears recovery history
   */
  clearRecoveryHistory(): void {
    this.recoveryHistory = [];
  }

  /**
   * Gets current recovery state
   */
  getState(): any {
    return {
      isRecovering: this.isRecovering,
      strategiesCount: this.strategies.size,
      historyCount: this.recoveryHistory.length,
      hybridDebuggerActive: this.hybridDebugger?.getState().isActive || false
    };
  }
}
