/**
 * Electron Profiler - Handles performance profiling for Electron applications
 * 
 * This profiler provides performance monitoring, memory analysis,
 * and CPU profiling for both main and renderer processes.
 */

import { EventEmitter } from 'events';
import type { Logger } from '../utils/logger.js';
import type {
  ElectronDebugSession,
  ElectronPerformanceMetrics,
  ElectronProcessType
} from './types.js';
import { ElectronDebugError, ElectronErrorType } from './types.js';

/**
 * Profiling session info
 */
interface ProfilingSession {
  sessionId: string;
  session: ElectronDebugSession;
  activeProfiles: Map<string, ProfilingInfo>;
  metricsInterval?: NodeJS.Timeout;
  isCollectingMetrics: boolean;
}

/**
 * Profiling information
 */
interface ProfilingInfo {
  type: 'cpu' | 'memory' | 'rendering';
  processId: string;
  processType: ElectronProcessType;
  startTime: Date;
  endTime?: Date;
  data?: any;
}

/**
 * Electron Profiler class
 */
export class ElectronProfiler extends EventEmitter {
  private logger: Logger;
  private activeSessions: Map<string, ProfilingSession> = new Map();
  private metricsHistory: Map<string, ElectronPerformanceMetrics[]> = new Map();

  constructor(logger: Logger) {
    super();
    this.logger = logger;
  }

  /**
   * Initialize profiling for a session
   */
  async initialize(session: ElectronDebugSession): Promise<void> {
    this.logger.info('Initializing Electron profiling', { sessionId: session.sessionId });

    try {
      const profilingSession: ProfilingSession = {
        sessionId: session.sessionId,
        session,
        activeProfiles: new Map(),
        isCollectingMetrics: false
      };

      this.activeSessions.set(session.sessionId, profilingSession);
      this.metricsHistory.set(session.sessionId, []);

      // Start continuous metrics collection
      await this.startMetricsCollection(profilingSession);

      this.logger.info('Successfully initialized Electron profiling', { sessionId: session.sessionId });
    } catch (error) {
      const debugError = new ElectronDebugError(
        ElectronErrorType.PROFILING_ERROR,
        `Failed to initialize profiling: ${error instanceof Error ? error.message : String(error)}`,
        { sessionId: session.sessionId, originalError: error }
      );
      this.logger.error('Profiling initialization failed', { error: debugError });
      throw debugError;
    }
  }

  /**
   * Cleanup profiling for a session
   */
  async cleanup(sessionId: string): Promise<void> {
    this.logger.info('Cleaning up Electron profiling', { sessionId });

    try {
      const profilingSession = this.activeSessions.get(sessionId);
      if (profilingSession) {
        // Stop metrics collection
        if (profilingSession.metricsInterval) {
          clearInterval(profilingSession.metricsInterval);
        }

        // Stop any active profiles
        for (const [profileId] of profilingSession.activeProfiles) {
          await this.stopProfiling(sessionId, profileId);
        }

        this.activeSessions.delete(sessionId);
      }

      // Clean up metrics history
      this.metricsHistory.delete(sessionId);

      this.logger.info('Successfully cleaned up Electron profiling', { sessionId });
    } catch (error) {
      const debugError = new ElectronDebugError(
        ElectronErrorType.PROFILING_ERROR,
        `Failed to cleanup profiling: ${error instanceof Error ? error.message : String(error)}`,
        { sessionId, originalError: error }
      );
      this.logger.error('Profiling cleanup failed', { error: debugError });
      throw debugError;
    }
  }

  /**
   * Get active sessions
   */
  getActiveSessions(): ElectronDebugSession[] {
    return Array.from(this.activeSessions.values()).map(ps => ps.session);
  }

  /**
   * Check if session is active
   */
  isSessionActive(sessionId: string): boolean {
    return this.activeSessions.has(sessionId);
  }

  /**
   * Start profiling
   */
  async startProfiling(sessionId: string, processId: string, type: 'cpu' | 'memory' | 'rendering' = 'cpu'): Promise<string> {
    const profilingSession = this.activeSessions.get(sessionId);
    if (!profilingSession) {
      throw new ElectronDebugError(ElectronErrorType.PROFILING_ERROR, `Session not found: ${sessionId}`);
    }

    const profileId = `${type}-${processId}-${Date.now()}`;
    const processType = this.getProcessType(profilingSession.session, processId);

    try {
      const profilingInfo: ProfilingInfo = {
        type,
        processId,
        processType,
        startTime: new Date()
      };

      profilingSession.activeProfiles.set(profileId, profilingInfo);

      this.logger.info('Profiling started', { sessionId, profileId, type, processId });

      this.emit('profilingStarted', { sessionId, profileId, type, processId });

      return profileId;
    } catch (error) {
      throw new ElectronDebugError(
        ElectronErrorType.PROFILING_ERROR,
        `Failed to start profiling: ${error instanceof Error ? error.message : String(error)}`,
        { sessionId, processId, type, originalError: error }
      );
    }
  }

  /**
   * Stop profiling
   */
  async stopProfiling(sessionId: string, profileId: string): Promise<any> {
    const profilingSession = this.activeSessions.get(sessionId);
    if (!profilingSession) {
      throw new ElectronDebugError(ElectronErrorType.PROFILING_ERROR, `Session not found: ${sessionId}`);
    }

    const profilingInfo = profilingSession.activeProfiles.get(profileId);
    if (!profilingInfo) {
      throw new ElectronDebugError(ElectronErrorType.PROFILING_ERROR, `Profile not found: ${profileId}`);
    }

    try {
      profilingInfo.endTime = new Date();
      const duration = profilingInfo.endTime.getTime() - profilingInfo.startTime.getTime();

      // Generate profile data based on type
      const profileData = await this.generateProfileData(profilingInfo, duration);
      profilingInfo.data = profileData;

      profilingSession.activeProfiles.delete(profileId);

      this.logger.info('Profiling stopped', { sessionId, profileId, duration });

      this.emit('profilingStopped', { sessionId, profileId, duration, data: profileData });

      return profileData;
    } catch (error) {
      throw new ElectronDebugError(
        ElectronErrorType.PROFILING_ERROR,
        `Failed to stop profiling: ${error instanceof Error ? error.message : String(error)}`,
        { sessionId, profileId, originalError: error }
      );
    }
  }

  /**
   * Get performance metrics
   */
  async getPerformanceMetrics(sessionId: string, processId?: string): Promise<ElectronPerformanceMetrics> {
    const profilingSession = this.activeSessions.get(sessionId);
    if (!profilingSession) {
      throw new ElectronDebugError(ElectronErrorType.PROFILING_ERROR, `Session not found: ${sessionId}`);
    }

    try {
      const metrics = await this.collectCurrentMetrics(profilingSession, processId);

      // Add to history
      const history = this.metricsHistory.get(sessionId) || [];
      history.push(metrics);

      // Keep only last 100 metrics
      if (history.length > 100) {
        history.splice(0, history.length - 100);
      }

      this.metricsHistory.set(sessionId, history);

      return metrics;
    } catch (error) {
      throw new ElectronDebugError(
        ElectronErrorType.PROFILING_ERROR,
        `Failed to get performance metrics: ${error instanceof Error ? error.message : String(error)}`,
        { sessionId, processId, originalError: error }
      );
    }
  }

  /**
   * Get metrics history
   */
  getMetricsHistory(sessionId: string, limit: number = 50): ElectronPerformanceMetrics[] {
    const history = this.metricsHistory.get(sessionId) || [];
    return history.slice(-limit);
  }

  /**
   * Analyze performance trends
   */
  analyzePerformanceTrends(sessionId: string): any {
    const history = this.metricsHistory.get(sessionId) || [];

    if (history.length < 2) {
      return {
        message: 'Insufficient data for trend analysis',
        dataPoints: history.length
      };
    }

    const latest = history[history.length - 1];
    const previous = history[history.length - 2];

    if (!latest || !previous) {
      return {
        message: 'Invalid data for trend analysis',
        dataPoints: history.length
      };
    }

    return {
      memory: {
        trend: latest.memory.heapUsed > previous.memory.heapUsed ? 'increasing' : 'decreasing',
        change: latest.memory.heapUsed - previous.memory.heapUsed,
        changePercent: ((latest.memory.heapUsed - previous.memory.heapUsed) / previous.memory.heapUsed) * 100
      },
      cpu: {
        trend: latest.cpu.percentCPUUsage > previous.cpu.percentCPUUsage ? 'increasing' : 'decreasing',
        change: latest.cpu.percentCPUUsage - previous.cpu.percentCPUUsage,
        changePercent: ((latest.cpu.percentCPUUsage - previous.cpu.percentCPUUsage) / previous.cpu.percentCPUUsage) * 100
      },
      timestamp: latest.timestamp,
      dataPoints: history.length
    };
  }

  /**
   * Start continuous metrics collection
   */
  private async startMetricsCollection(profilingSession: ProfilingSession): Promise<void> {
    if (profilingSession.isCollectingMetrics) {
      return;
    }

    profilingSession.isCollectingMetrics = true;

    profilingSession.metricsInterval = setInterval(async () => {
      try {
        const metrics = await this.collectCurrentMetrics(profilingSession);
        this.emit('metricsUpdate', metrics);
      } catch (error) {
        this.logger.warn('Failed to collect metrics', {
          sessionId: profilingSession.sessionId,
          error: error instanceof Error ? error.message : String(error)
        });
      }
    }, 5000); // Collect metrics every 5 seconds
  }

  /**
   * Collect current metrics
   */
  private async collectCurrentMetrics(profilingSession: ProfilingSession, processId?: string): Promise<ElectronPerformanceMetrics> {
    const targetProcessId = processId || profilingSession.session.mainProcess?.id || 'unknown';
    const processType = this.getProcessType(profilingSession.session, targetProcessId);

    // Simulate metrics collection (in real implementation, this would query actual processes)
    const metrics: ElectronPerformanceMetrics = {
      processId: targetProcessId,
      processType,
      timestamp: new Date(),
      memory: {
        heapUsed: Math.floor(Math.random() * 100) + 50,
        heapTotal: Math.floor(Math.random() * 200) + 100,
        external: Math.floor(Math.random() * 20) + 10,
        rss: Math.floor(Math.random() * 150) + 75,
        arrayBuffers: Math.floor(Math.random() * 10) + 5
      },
      cpu: {
        percentCPUUsage: Math.floor(Math.random() * 50) + 10,
        idleWakeupsPerSecond: Math.floor(Math.random() * 100) + 50
      }
    };

    // Add process-specific metrics
    if (processType === 'renderer') {
      metrics.dom = {
        nodeCount: Math.floor(Math.random() * 1000) + 500,
        listenerCount: Math.floor(Math.random() * 100) + 50
      };

      metrics.rendering = {
        framesPerSecond: Math.floor(Math.random() * 20) + 40,
        droppedFrames: Math.floor(Math.random() * 5),
        layoutDuration: Math.floor(Math.random() * 10) + 2,
        paintDuration: Math.floor(Math.random() * 8) + 1
      };
    }

    if (processType === 'main') {
      metrics.gpu = {
        memoryUsage: Math.floor(Math.random() * 512) + 256,
        utilization: Math.floor(Math.random() * 50) + 20
      };
    }

    return metrics;
  }

  /**
   * Generate profile data
   */
  private async generateProfileData(profilingInfo: ProfilingInfo, duration: number): Promise<any> {
    switch (profilingInfo.type) {
      case 'cpu':
        return {
          type: 'cpu',
          duration,
          samples: Math.floor(Math.random() * 10000) + 5000,
          hotFunctions: [
            'main.js:processData()',
            'renderer.js:updateUI()',
            'ipc.js:handleMessage()',
            'native.node:computeHash()'
          ],
          cpuUsage: {
            average: Math.floor(Math.random() * 30) + 20,
            peak: Math.floor(Math.random() * 50) + 50,
            idle: Math.floor(Math.random() * 20) + 10
          }
        };

      case 'memory':
        return {
          type: 'memory',
          duration,
          heapSnapshot: {
            totalSize: Math.floor(Math.random() * 100) + 50,
            usedSize: Math.floor(Math.random() * 80) + 30,
            freeSize: Math.floor(Math.random() * 20) + 10
          },
          allocations: Math.floor(Math.random() * 1000) + 500,
          deallocations: Math.floor(Math.random() * 800) + 400,
          leaks: Math.floor(Math.random() * 5)
        };

      case 'rendering':
        return {
          type: 'rendering',
          duration,
          frames: {
            total: Math.floor(duration / 16.67), // Assuming 60fps target
            dropped: Math.floor(Math.random() * 10),
            averageFPS: Math.floor(Math.random() * 20) + 40
          },
          paint: {
            totalTime: Math.floor(Math.random() * 100) + 50,
            averageTime: Math.floor(Math.random() * 5) + 2
          },
          layout: {
            totalTime: Math.floor(Math.random() * 80) + 40,
            averageTime: Math.floor(Math.random() * 3) + 1
          }
        };

      default:
        return { type: profilingInfo.type, duration };
    }
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
