import { EventEmitter } from 'events';
import { analyzeJavaProject } from './enhanced-detection.js';
import { PortManager } from './port-manager.js';
import { ConnectionManager } from './connection-manager.js';
// import { AdvancedErrorRecovery } from './error-recovery.js';
import type { JavaProjectInfo } from './enhanced-detection.js';
import type { PortInfo } from './port-manager.js';

/**
 * Interactive Troubleshooter
 * Step-by-step diagnostic and problem resolution assistant
 */

export interface TroubleshootingStep {
  id: string;
  title: string;
  description: string;
  type: 'check' | 'action' | 'question' | 'recommendation';
  status: 'pending' | 'running' | 'completed' | 'failed' | 'skipped';
  result?: any;
  error?: string;
  nextSteps?: string[];
  autoExecute?: boolean;
}

export interface TroubleshootingSession {
  id: string;
  problem: string;
  startTime: Date;
  currentStep: number;
  steps: TroubleshootingStep[];
  context: {
    workspaceRoot: string;
    projectInfo?: JavaProjectInfo;
    portInfo?: PortInfo[];
    targetPort?: number;
    applicationUrl?: string;
  };
  recommendations: string[];
  resolution?: {
    success: boolean;
    method: string;
    details: string;
  };
}

export interface DiagnosticResult {
  category: 'environment' | 'connection' | 'configuration' | 'application';
  severity: 'info' | 'warning' | 'error' | 'critical';
  title: string;
  description: string;
  impact: string;
  solution: string;
  autoFixable: boolean;
}

/**
 * Interactive Troubleshooter Class
 */
export class InteractiveTroubleshooter extends EventEmitter {
  private sessions: Map<string, TroubleshootingSession> = new Map();
  private portManager: PortManager;
  private connectionManager: ConnectionManager;
  // private errorRecovery: AdvancedErrorRecovery;
  private sessionCounter = 0;

  constructor() {
    super();
    this.portManager = new PortManager();
    this.connectionManager = new ConnectionManager();
    // this.errorRecovery = new AdvancedErrorRecovery();
  }

  /**
   * Start a new troubleshooting session
   */
  async startTroubleshooting(
    problem: string, 
    workspaceRoot: string, 
    targetPort?: number
  ): Promise<TroubleshootingSession> {
    const sessionId = `troubleshoot-${++this.sessionCounter}-${Date.now()}`;
    
    const session: TroubleshootingSession = {
      id: sessionId,
      problem,
      startTime: new Date(),
      currentStep: 0,
      steps: [],
      context: {
        workspaceRoot,
        ...(targetPort && { targetPort })
      },
      recommendations: []
    };

    this.sessions.set(sessionId, session);
    this.emit('session-started', session);

    // Generate troubleshooting steps based on the problem
    session.steps = await this.generateTroubleshootingSteps(problem, session.context);
    
    // Start executing steps
    await this.executeNextStep(sessionId);
    
    return session;
  }

  /**
   * Generate troubleshooting steps based on the problem
   */
  private async generateTroubleshootingSteps(
    problem: string, 
    context: TroubleshootingSession['context']
  ): Promise<TroubleshootingStep[]> {
    const steps: TroubleshootingStep[] = [];

    // Common initial steps
    steps.push({
      id: 'analyze-project',
      title: 'Analyze Java Project',
      description: 'Analyzing project structure and configuration',
      type: 'check',
      status: 'pending',
      autoExecute: true
    });

    steps.push({
      id: 'scan-ports',
      title: 'Scan Debug Ports',
      description: 'Scanning for active debug agents and port conflicts',
      type: 'check',
      status: 'pending',
      autoExecute: true
    });

    // Problem-specific steps
    if (problem.toLowerCase().includes('connection') || problem.toLowerCase().includes('attach')) {
      steps.push(...this.generateConnectionSteps(context));
    }

    if (problem.toLowerCase().includes('configuration') || problem.toLowerCase().includes('setup')) {
      steps.push(...this.generateConfigurationSteps(context));
    }

    if (problem.toLowerCase().includes('performance') || problem.toLowerCase().includes('slow')) {
      steps.push(...this.generatePerformanceSteps(context));
    }

    // Always add final recommendation step
    steps.push({
      id: 'generate-recommendations',
      title: 'Generate Recommendations',
      description: 'Analyzing results and generating personalized recommendations',
      type: 'recommendation',
      status: 'pending',
      autoExecute: true
    });

    return steps;
  }

  /**
   * Generate connection-specific troubleshooting steps
   */
  private generateConnectionSteps(context: TroubleshootingSession['context']): TroubleshootingStep[] {
    return [
      {
        id: 'validate-jdwp',
        title: 'Validate JDWP Connection',
        description: `Testing JDWP connection to port ${context.targetPort || 5005}`,
        type: 'check',
        status: 'pending',
        autoExecute: true
      },
      {
        id: 'check-conflicts',
        title: 'Check Port Conflicts',
        description: 'Checking for existing debug clients and port conflicts',
        type: 'check',
        status: 'pending',
        autoExecute: true
      },
      {
        id: 'suggest-alternatives',
        title: 'Suggest Connection Alternatives',
        description: 'Finding alternative connection methods and ports',
        type: 'action',
        status: 'pending',
        autoExecute: true
      }
    ];
  }

  /**
   * Generate configuration-specific troubleshooting steps
   */
  private generateConfigurationSteps(_context: TroubleshootingSession['context']): TroubleshootingStep[] {
    return [
      {
        id: 'detect-main-class',
        title: 'Detect Main Class',
        description: 'Auto-detecting Spring Boot main class and entry point',
        type: 'check',
        status: 'pending',
        autoExecute: true
      },
      {
        id: 'validate-classpath',
        title: 'Validate Classpath',
        description: 'Checking classpath configuration and dependencies',
        type: 'check',
        status: 'pending',
        autoExecute: true
      },
      {
        id: 'check-debug-agent',
        title: 'Check Debug Agent Configuration',
        description: 'Verifying debug agent setup and JVM arguments',
        type: 'check',
        status: 'pending',
        autoExecute: true
      }
    ];
  }

  /**
   * Generate performance-specific troubleshooting steps
   */
  private generatePerformanceSteps(_context: TroubleshootingSession['context']): TroubleshootingStep[] {
    return [
      {
        id: 'test-api-performance',
        title: 'Test API Performance',
        description: 'Testing application API response times and health',
        type: 'check',
        status: 'pending',
        autoExecute: true
      },
      {
        id: 'analyze-logs',
        title: 'Analyze Application Logs',
        description: 'Scanning logs for performance issues and errors',
        type: 'check',
        status: 'pending',
        autoExecute: true
      }
    ];
  }

  /**
   * Execute the next step in the troubleshooting session
   */
  async executeNextStep(sessionId: string): Promise<boolean> {
    const session = this.sessions.get(sessionId);
    if (!session) {
      return false;
    }

    const currentStep = session.steps[session.currentStep];
    if (!currentStep) {
      // All steps completed
      await this.completeTroubleshooting(sessionId);
      return true;
    }

    if (!currentStep.autoExecute) {
      // Wait for manual execution
      return true;
    }

    currentStep.status = 'running';
    this.emit('step-started', { session, step: currentStep });

    try {
      const result = await this.executeStep(currentStep, session);
      currentStep.result = result;
      currentStep.status = 'completed';
      
      this.emit('step-completed', { session, step: currentStep, result });
      
      // Move to next step
      session.currentStep++;
      return this.executeNextStep(sessionId);

    } catch (error) {
      currentStep.error = error instanceof Error ? error.message : String(error);
      currentStep.status = 'failed';
      
      this.emit('step-failed', { session, step: currentStep, error });
      
      // Continue with next step even if this one failed
      session.currentStep++;
      return this.executeNextStep(sessionId);
    }
  }

  /**
   * Execute a specific troubleshooting step
   */
  private async executeStep(step: TroubleshootingStep, session: TroubleshootingSession): Promise<any> {
    switch (step.id) {
      case 'analyze-project':
        const projectInfo = analyzeJavaProject(session.context.workspaceRoot);
        session.context.projectInfo = projectInfo;
        return projectInfo;

      case 'scan-ports':
        const portInfo = await this.portManager.scanPorts();
        session.context.portInfo = portInfo;
        return portInfo;

      case 'validate-jdwp':
        const targetPort = session.context.targetPort || 5005;
        const connectionResult = await this.connectionManager.createConnection({
          port: targetPort,
          type: 'jdwp',
          handleConflicts: false
        });
        return connectionResult;

      case 'check-conflicts':
        const conflicts = await this.portManager.suggestConflictResolution(
          session.context.targetPort || 5005
        );
        return conflicts;

      case 'suggest-alternatives':
        const alternatives = await this.portManager.findAvailableDebugPorts(3);
        return { availablePorts: alternatives };

      case 'detect-main-class':
        return {
          mainClass: session.context.projectInfo?.mainClass,
          detected: !!session.context.projectInfo?.mainClass
        };

      case 'validate-classpath':
        return {
          classPaths: session.context.projectInfo?.classPaths || [],
          count: session.context.projectInfo?.classPaths.length || 0
        };

      case 'check-debug-agent':
        const debugPorts = session.context.portInfo?.filter(p => p.status === 'debug_agent') || [];
        return {
          debugAgentsFound: debugPorts.length,
          ports: debugPorts.map(p => p.port)
        };

      case 'test-api-performance':
        // This would integrate with hybrid debugger for API testing
        return { message: 'API performance testing would be implemented here' };

      case 'analyze-logs':
        // This would integrate with log analysis
        return { message: 'Log analysis would be implemented here' };

      case 'generate-recommendations':
        const recommendations = await this.generateFinalRecommendations(session);
        session.recommendations = recommendations;
        return recommendations;

      default:
        throw new Error(`Unknown step: ${step.id}`);
    }
  }

  /**
   * Generate final recommendations based on all collected data
   */
  private async generateFinalRecommendations(session: TroubleshootingSession): Promise<string[]> {
    const recommendations: string[] = [];
    const { projectInfo, portInfo, targetPort } = session.context;

    // Project-based recommendations
    if (projectInfo) {
      if (projectInfo.mainClass) {
        recommendations.push(`✅ Main class detected: ${projectInfo.mainClass}`);
      } else {
        recommendations.push('⚠️ Main class not detected - specify manually in debug configuration');
      }

      if (projectInfo.classPaths.length > 0) {
        recommendations.push(`✅ Classpath configured with ${projectInfo.classPaths.length} entries`);
      } else {
        recommendations.push('⚠️ Classpath appears empty - check build configuration');
      }
    }

    // Port-based recommendations
    if (portInfo) {
      const debugAgents = portInfo.filter(p => p.status === 'debug_agent');
      const targetPortInfo = portInfo.find(p => p.port === (targetPort || 5005));

      if (debugAgents.length > 0) {
        recommendations.push(`✅ Found ${debugAgents.length} debug agent(s) on ports: ${debugAgents.map(p => p.port).join(', ')}`);
      } else {
        recommendations.push('⚠️ No debug agents detected - start your application with debug enabled');
        recommendations.push(`   java -agentlib:jdwp=transport=dt_socket,server=y,suspend=n,address=${targetPort || 5005} YourApp`);
      }

      if (targetPortInfo?.debugInfo?.hasActiveClient) {
        recommendations.push('🔄 Use hybrid debugging mode to avoid conflicts with existing debug client');
        recommendations.push('   debug_startHybridDebugging() for non-invasive debugging');
      }
    }

    // Problem-specific recommendations
    if (session.problem.toLowerCase().includes('connection')) {
      recommendations.push('🔧 For connection issues:');
      recommendations.push('   1. Try debug_validateJDWPConnection() to test connectivity');
      recommendations.push('   2. Use debug_attemptErrorRecovery() for automatic resolution');
      recommendations.push('   3. Consider hybrid debugging as fallback');
    }

    return recommendations;
  }

  /**
   * Complete troubleshooting session
   */
  private async completeTroubleshooting(sessionId: string): Promise<void> {
    const session = this.sessions.get(sessionId);
    if (!session) {
      return;
    }

    const successfulSteps = session.steps.filter(s => s.status === 'completed').length;
    const totalSteps = session.steps.length;

    session.resolution = {
      success: successfulSteps > totalSteps * 0.7, // 70% success rate
      method: 'interactive-troubleshooting',
      details: `Completed ${successfulSteps}/${totalSteps} diagnostic steps`
    };

    this.emit('session-completed', session);
  }

  /**
   * Get troubleshooting session
   */
  getTroubleshootingSession(sessionId: string): TroubleshootingSession | null {
    return this.sessions.get(sessionId) || null;
  }

  /**
   * Get all active troubleshooting sessions
   */
  getActiveSessions(): TroubleshootingSession[] {
    return Array.from(this.sessions.values());
  }

  /**
   * Run comprehensive diagnostics
   */
  async runComprehensiveDiagnostics(workspaceRoot: string): Promise<DiagnosticResult[]> {
    const diagnostics: DiagnosticResult[] = [];

    try {
      // Environment diagnostics
      const projectInfo = analyzeJavaProject(workspaceRoot);
      
      if (!projectInfo.mainClass) {
        diagnostics.push({
          category: 'configuration',
          severity: 'warning',
          title: 'Main Class Not Detected',
          description: 'Could not automatically detect the main class for your application',
          impact: 'Debug configuration may require manual setup',
          solution: 'Specify main class in pom.xml or use @SpringBootApplication annotation',
          autoFixable: false
        });
      }

      if (projectInfo.classPaths.length === 0) {
        diagnostics.push({
          category: 'configuration',
          severity: 'error',
          title: 'Empty Classpath',
          description: 'No classpath entries detected',
          impact: 'Debugging will fail due to missing dependencies',
          solution: 'Run mvn compile or gradle build to generate classpath',
          autoFixable: true
        });
      }

      // Port diagnostics
      const portInfo = await this.portManager.scanPorts();
      const debugAgents = portInfo.filter(p => p.status === 'debug_agent');

      if (debugAgents.length === 0) {
        diagnostics.push({
          category: 'connection',
          severity: 'warning',
          title: 'No Debug Agents Found',
          description: 'No active debug agents detected on common ports',
          impact: 'Cannot establish debug connections',
          solution: 'Start application with debug agent enabled',
          autoFixable: false
        });
      }

      const conflictedAgents = debugAgents.filter(p => p.debugInfo?.hasActiveClient);
      if (conflictedAgents.length > 0) {
        diagnostics.push({
          category: 'connection',
          severity: 'info',
          title: 'Debug Agents Have Active Clients',
          description: `${conflictedAgents.length} debug agent(s) already have connected clients`,
          impact: 'New debug connections may be rejected',
          solution: 'Use observer mode or hybrid debugging',
          autoFixable: true
        });
      }

    } catch (error) {
      diagnostics.push({
        category: 'environment',
        severity: 'critical',
        title: 'Diagnostic Error',
        description: `Failed to run diagnostics: ${error}`,
        impact: 'Cannot assess debugging readiness',
        solution: 'Check workspace path and permissions',
        autoFixable: false
      });
    }

    return diagnostics;
  }
}
