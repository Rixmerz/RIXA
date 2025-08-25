/**
 * Electron Security Debugger - Handles security context debugging
 * 
 * This debugger provides security analysis, context validation,
 * and permission debugging for Electron applications.
 */

import { EventEmitter } from 'events';
import type { Logger } from '../utils/logger.js';
import type {
  ElectronDebugSession,
  ElectronSecurityContext,
  ElectronProcessType
} from './types.js';
import { ElectronDebugError, ElectronErrorType } from './types.js';

/**
 * Security debugging session info
 */
interface SecurityDebugSession {
  sessionId: string;
  session: ElectronDebugSession;
  securityContexts: Map<string, ElectronSecurityContext>;
  violations: SecurityViolation[];
  isMonitoring: boolean;
}

/**
 * Security violation
 */
interface SecurityViolation {
  id: string;
  type: 'csp' | 'permission' | 'context' | 'protocol' | 'file-access';
  severity: 'low' | 'medium' | 'high' | 'critical';
  processId: string;
  processType: ElectronProcessType;
  timestamp: Date;
  description: string;
  details: any;
  recommendation?: string;
}

/**
 * Electron Security Debugger class
 */
export class ElectronSecurityDebugger extends EventEmitter {
  private logger: Logger;
  private activeSessions: Map<string, SecurityDebugSession> = new Map();

  constructor(logger: Logger) {
    super();
    this.logger = logger;
  }

  /**
   * Initialize security debugging for a session
   */
  async initialize(session: ElectronDebugSession): Promise<void> {
    this.logger.info('Initializing Electron security debugging', { sessionId: session.sessionId });

    try {
      const securitySession: SecurityDebugSession = {
        sessionId: session.sessionId,
        session,
        securityContexts: new Map(),
        violations: [],
        isMonitoring: false
      };

      this.activeSessions.set(session.sessionId, securitySession);

      // Analyze initial security contexts
      await this.analyzeSecurityContexts(securitySession);

      // Start security monitoring
      await this.startSecurityMonitoring(securitySession);

      this.logger.info('Successfully initialized Electron security debugging', {
        sessionId: session.sessionId,
        contextsFound: securitySession.securityContexts.size
      });
    } catch (error) {
      const debugError = new ElectronDebugError(
        ElectronErrorType.SECURITY_ERROR,
        `Failed to initialize security debugging: ${error instanceof Error ? error.message : String(error)}`,
        { sessionId: session.sessionId, originalError: error }
      );
      this.logger.error('Security debugging initialization failed', { error: debugError });
      throw debugError;
    }
  }

  /**
   * Cleanup security debugging for a session
   */
  async cleanup(sessionId: string): Promise<void> {
    this.logger.info('Cleaning up Electron security debugging', { sessionId });

    try {
      const securitySession = this.activeSessions.get(sessionId);
      if (securitySession) {
        // Stop monitoring
        securitySession.isMonitoring = false;

        // Clear session data
        this.activeSessions.delete(sessionId);
      }

      this.logger.info('Successfully cleaned up Electron security debugging', { sessionId });
    } catch (error) {
      const debugError = new ElectronDebugError(
        ElectronErrorType.SECURITY_ERROR,
        `Failed to cleanup security debugging: ${error instanceof Error ? error.message : String(error)}`,
        { sessionId, originalError: error }
      );
      this.logger.error('Security debugging cleanup failed', { error: debugError });
      throw debugError;
    }
  }

  /**
   * Get active sessions
   */
  getActiveSessions(): ElectronDebugSession[] {
    return Array.from(this.activeSessions.values()).map(ss => ss.session);
  }

  /**
   * Check if session is active
   */
  isSessionActive(sessionId: string): boolean {
    return this.activeSessions.has(sessionId);
  }

  /**
   * Get security context for a process
   */
  async getSecurityContext(sessionId: string, processId?: string): Promise<ElectronSecurityContext> {
    const securitySession = this.activeSessions.get(sessionId);
    if (!securitySession) {
      throw new ElectronDebugError(ElectronErrorType.SECURITY_ERROR, `Session not found: ${sessionId}`);
    }

    const targetProcessId = processId || securitySession.session.mainProcess?.id || 'unknown';

    let context = securitySession.securityContexts.get(targetProcessId);
    if (!context) {
      context = await this.analyzeProcessSecurity(securitySession, targetProcessId);
      securitySession.securityContexts.set(targetProcessId, context);
    }

    return context;
  }

  /**
   * Validate security configuration
   */
  async validateSecurity(sessionId: string): Promise<any> {
    const securitySession = this.activeSessions.get(sessionId);
    if (!securitySession) {
      throw new ElectronDebugError(ElectronErrorType.SECURITY_ERROR, `Session not found: ${sessionId}`);
    }

    const results = {
      overall: 'unknown' as 'secure' | 'warning' | 'critical' | 'unknown',
      score: 0,
      maxScore: 100,
      checks: [] as any[],
      violations: securitySession.violations.length,
      recommendations: [] as string[]
    };

    // Analyze each security context
    for (const [processId, context] of securitySession.securityContexts) {
      const processType = this.getProcessType(securitySession.session, processId);
      const checks = await this.performSecurityChecks(context, processType);
      results.checks.push(...checks);
    }

    // Calculate score
    const passedChecks = results.checks.filter(check => check.passed).length;
    results.score = Math.round((passedChecks / results.checks.length) * 100) || 0;

    // Determine overall status
    if (results.score >= 90) {
      results.overall = 'secure';
    } else if (results.score >= 70) {
      results.overall = 'warning';
    } else {
      results.overall = 'critical';
    }

    // Generate recommendations
    results.recommendations = this.generateSecurityRecommendations(results.checks, securitySession.violations);

    return results;
  }

  /**
   * Get security violations
   */
  getSecurityViolations(sessionId: string, severity?: 'low' | 'medium' | 'high' | 'critical'): SecurityViolation[] {
    const securitySession = this.activeSessions.get(sessionId);
    if (!securitySession) {
      throw new ElectronDebugError(ElectronErrorType.SECURITY_ERROR, `Session not found: ${sessionId}`);
    }

    let violations = securitySession.violations;

    if (severity) {
      violations = violations.filter(v => v.severity === severity);
    }

    return violations.sort((a, b) => b.timestamp.getTime() - a.timestamp.getTime());
  }

  /**
   * Add security violation
   */
  addSecurityViolation(sessionId: string, violation: Omit<SecurityViolation, 'id' | 'timestamp'>): void {
    const securitySession = this.activeSessions.get(sessionId);
    if (!securitySession) {
      return;
    }

    const fullViolation: SecurityViolation = {
      ...violation,
      id: `violation-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
      timestamp: new Date()
    };

    securitySession.violations.push(fullViolation);

    // Keep only last 1000 violations
    if (securitySession.violations.length > 1000) {
      securitySession.violations = securitySession.violations.slice(-1000);
    }

    this.logger.warn('Security violation detected', {
      sessionId,
      type: violation.type,
      severity: violation.severity,
      processId: violation.processId
    });

    this.emit('violation', fullViolation);
  }

  /**
   * Analyze security contexts for all processes
   */
  private async analyzeSecurityContexts(securitySession: SecurityDebugSession): Promise<void> {
    const session = securitySession.session;

    // Analyze main process
    if (session.mainProcess) {
      const context = await this.analyzeProcessSecurity(securitySession, session.mainProcess.id);
      securitySession.securityContexts.set(session.mainProcess.id, context);
    }

    // Analyze renderer processes
    for (const [processId] of session.rendererProcesses) {
      const context = await this.analyzeProcessSecurity(securitySession, processId);
      securitySession.securityContexts.set(processId, context);
    }
  }

  /**
   * Analyze security for a specific process
   */
  private async analyzeProcessSecurity(securitySession: SecurityDebugSession, processId: string): Promise<ElectronSecurityContext> {
    const processType = this.getProcessType(securitySession.session, processId);

    // Simulate security context analysis
    const csp = processType === 'renderer' ? "default-src 'self'; script-src 'self' 'unsafe-inline'" : undefined;
    const origin = processType === 'renderer' ? 'file://' : undefined;

    const context: ElectronSecurityContext = {
      processId,
      processType,
      nodeIntegration: processType === 'main' ? true : Math.random() > 0.7,
      contextIsolation: processType === 'renderer' ? Math.random() > 0.3 : false,
      sandbox: processType === 'renderer' ? Math.random() > 0.5 : false,
      webSecurity: processType === 'renderer' ? Math.random() > 0.2 : true,
      allowRunningInsecureContent: Math.random() > 0.8,
      experimentalFeatures: Math.random() > 0.9,
      preloadScripts: processType === 'renderer' ? ['preload.js'] : [],
      permissions: this.generatePermissions(processType),
      ...(csp && { csp }),
      ...(origin && { origin })
    };

    return context;
  }

  /**
   * Start security monitoring
   */
  private async startSecurityMonitoring(securitySession: SecurityDebugSession): Promise<void> {
    securitySession.isMonitoring = true;

    // Simulate periodic security checks
    const checkInterval = setInterval(() => {
      if (!securitySession.isMonitoring) {
        clearInterval(checkInterval);
        return;
      }

      this.performPeriodicSecurityChecks(securitySession);
    }, 30000); // Check every 30 seconds
  }

  /**
   * Perform periodic security checks
   */
  private async performPeriodicSecurityChecks(securitySession: SecurityDebugSession): Promise<void> {
    // Simulate random security violations
    if (Math.random() > 0.95) { // 5% chance of violation
      const violationTypes = ['csp', 'permission', 'context', 'protocol', 'file-access'] as const;
      const severities = ['low', 'medium', 'high', 'critical'] as const;
      const processIds = Array.from(securitySession.securityContexts.keys());

      if (processIds.length > 0) {
        const processId = processIds[Math.floor(Math.random() * processIds.length)];
        if (processId) {
          const processType = this.getProcessType(securitySession.session, processId);
          const violationType = violationTypes[Math.floor(Math.random() * violationTypes.length)];
          const severity = severities[Math.floor(Math.random() * severities.length)];

          if (violationType && severity) {
            this.addSecurityViolation(securitySession.sessionId, {
              type: violationType,
              severity: severity,
              processId,
              processType,
              description: 'Simulated security violation for testing',
              details: { simulated: true },
              recommendation: 'Review security configuration'
            });
          }
        }
      }
    }
  }

  /**
   * Perform security checks on a context
   */
  private async performSecurityChecks(context: ElectronSecurityContext, processType: ElectronProcessType): Promise<any[]> {
    const checks = [];

    if (processType === 'renderer') {
      checks.push({
        name: 'Context Isolation',
        description: 'Renderer process should have context isolation enabled',
        passed: context.contextIsolation,
        severity: context.contextIsolation ? 'info' : 'high',
        recommendation: context.contextIsolation ? null : 'Enable context isolation for better security'
      });

      checks.push({
        name: 'Node Integration',
        description: 'Renderer process should not have Node.js integration enabled',
        passed: !context.nodeIntegration,
        severity: context.nodeIntegration ? 'critical' : 'info',
        recommendation: context.nodeIntegration ? 'Disable Node.js integration in renderer processes' : null
      });

      checks.push({
        name: 'Sandbox',
        description: 'Renderer process should be sandboxed',
        passed: context.sandbox,
        severity: context.sandbox ? 'info' : 'medium',
        recommendation: context.sandbox ? null : 'Enable sandbox mode for renderer processes'
      });

      checks.push({
        name: 'Web Security',
        description: 'Web security should be enabled',
        passed: context.webSecurity,
        severity: context.webSecurity ? 'info' : 'high',
        recommendation: context.webSecurity ? null : 'Enable web security'
      });

      checks.push({
        name: 'Content Security Policy',
        description: 'CSP should be configured',
        passed: !!context.csp,
        severity: context.csp ? 'info' : 'medium',
        recommendation: context.csp ? null : 'Configure Content Security Policy'
      });
    }

    checks.push({
      name: 'Insecure Content',
      description: 'Should not allow running insecure content',
      passed: !context.allowRunningInsecureContent,
      severity: context.allowRunningInsecureContent ? 'high' : 'info',
      recommendation: context.allowRunningInsecureContent ? 'Disable allowRunningInsecureContent' : null
    });

    checks.push({
      name: 'Experimental Features',
      description: 'Should not enable experimental features in production',
      passed: !context.experimentalFeatures,
      severity: context.experimentalFeatures ? 'medium' : 'info',
      recommendation: context.experimentalFeatures ? 'Disable experimental features in production' : null
    });

    return checks;
  }

  /**
   * Generate security recommendations
   */
  private generateSecurityRecommendations(checks: any[], violations: SecurityViolation[]): string[] {
    const recommendations = new Set<string>();

    // Add recommendations from failed checks
    checks.forEach(check => {
      if (!check.passed && check.recommendation) {
        recommendations.add(check.recommendation);
      }
    });

    // Add recommendations based on violations
    const criticalViolations = violations.filter(v => v.severity === 'critical').length;
    const highViolations = violations.filter(v => v.severity === 'high').length;

    if (criticalViolations > 0) {
      recommendations.add('Address critical security violations immediately');
    }

    if (highViolations > 0) {
      recommendations.add('Review and fix high-severity security issues');
    }

    if (violations.length > 10) {
      recommendations.add('Implement comprehensive security monitoring');
    }

    return Array.from(recommendations);
  }

  /**
   * Generate permissions for process type
   */
  private generatePermissions(processType: ElectronProcessType): string[] {
    const basePermissions = ['clipboard-read', 'clipboard-write'];

    if (processType === 'main') {
      return [
        ...basePermissions,
        'file-system-access',
        'network-access',
        'system-info',
        'notifications',
        'power-management'
      ];
    } else if (processType === 'renderer') {
      return [
        ...basePermissions,
        'media-access',
        'geolocation',
        'notifications'
      ];
    }

    return basePermissions;
  }

  /**
   * Get process type from session
   */
  private getProcessType(session: ElectronDebugSession, processId: string): ElectronProcessType {
    if (session.mainProcess?.id === processId) {
      return 'main';
    }

    if (session.rendererProcesses.has(processId)) {
      return 'renderer';
    }

    if (session.workerProcesses.has(processId)) {
      return 'worker';
    }

    return 'main'; // Default fallback
  }
}
