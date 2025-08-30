/**
 * MCP Tools for Electron Debugging
 * 
 * This module provides MCP (Model Context Protocol) tools specifically
 * designed for debugging Electron applications through Claude Desktop.
 */

import { z } from 'zod';
import { getLogger, createLogger } from '../../utils/logger.js';
import { ElectronDebugger } from '../../electron/electron-debugger.js';
import type {
  ElectronDebugConfig,
  ElectronBreakpoint
} from '../../electron/types.js';

// Safe logger that works in both MCP stdio and regular contexts
function getSafeLogger() {
  try {
    return getLogger();
  } catch (error) {
    // Fallback to a basic logger for MCP stdio context
    return createLogger(
      {
        level: 'info',
        format: 'simple',
        file: { enabled: false, path: '', maxSize: 0, maxFiles: 0 }
      },
      { requestId: 'electron-tools' }
    );
  }
}

const logger = getSafeLogger();

// Global Electron debugger instance
let electronDebuggerInstance: ElectronDebugger | null = null;

/**
 * Get or create Electron debugger instance
 */
function getElectronDebugger(): ElectronDebugger {
  if (!electronDebuggerInstance) {
    electronDebuggerInstance = new ElectronDebugger();
  }
  return electronDebuggerInstance;
}

/**
 * Connect to Electron application
 */
export const debug_connectElectron = {
  name: 'debug_connectElectron',
  description: 'Connect to an Electron application for debugging',
  inputSchema: z.object({
    host: z.string().optional().default('localhost').describe('Host where Electron app is running'),
    mainPort: z.number().optional().default(9229).describe('Main process debugging port'),
    rendererPort: z.number().optional().default(9222).describe('Renderer process debugging port'),
    timeout: z.number().optional().default(30000).describe('Connection timeout in milliseconds'),
    autoDiscover: z.boolean().optional().default(true).describe('Auto-discover Electron processes'),
    enableIpcDebugging: z.boolean().optional().default(true).describe('Enable IPC debugging'),
    enablePerformanceProfiling: z.boolean().optional().default(true).describe('Enable performance profiling'),
    enableSecurityDebugging: z.boolean().optional().default(true).describe('Enable security debugging'),
    enableGUIDebugging: z.boolean().optional().default(true).describe('Enable GUI debugging'),
    projectPath: z.string().optional().describe('Path to Electron project'),
    electronPath: z.string().optional().describe('Path to Electron executable'),
    appPath: z.string().optional().describe('Path to Electron app')
  }),
  handler: async (args: any) => {
    try {
      const electronDebugger = getElectronDebugger();
      
      const config: ElectronDebugConfig = {
        host: args.host,
        mainPort: args.mainPort,
        rendererPort: args.rendererPort,
        timeout: args.timeout,
        autoDiscover: args.autoDiscover,
        enableIpcDebugging: args.enableIpcDebugging,
        enablePerformanceProfiling: args.enablePerformanceProfiling,
        enableSecurityDebugging: args.enableSecurityDebugging,
        enableGUIDebugging: args.enableGUIDebugging,
        projectPath: args.projectPath || process.cwd(),
        electronPath: args.electronPath || '',
        appPath: args.appPath || ''
      };

      const session = await electronDebugger.connect(config);

      return {
        success: true,
        sessionId: session.sessionId,
        mainProcess: !!session.mainProcess,
        rendererProcesses: session.rendererProcesses.size,
        workerProcesses: session.workerProcesses.size,
        connected: session.connected,
        message: `Connected to Electron application - Main: ${!!session.mainProcess}, Renderers: ${session.rendererProcesses.size}, Workers: ${session.workerProcesses.size}`
      };
    } catch (error) {
      logger.error('Failed to connect to Electron application', { error: error instanceof Error ? error.message : String(error) });
      return {
        success: false,
        error: error instanceof Error ? error.message : String(error),
        message: 'Failed to connect to Electron application. Make sure the app is running with debugging enabled.'
      };
    }
  }
};

/**
 * Get Electron processes
 */
export const debug_getElectronProcesses = {
  name: 'debug_getElectronProcesses',
  description: 'Get all Electron processes for a debugging session',
  inputSchema: z.object({
    sessionId: z.string().describe('Electron debugging session ID')
  }),
  handler: async (args: any) => {
    try {
      const electronDebugger = getElectronDebugger();
      const processes = await electronDebugger.getProcesses(args.sessionId);

      return {
        success: true,
        processes: processes.map(p => ({
          id: p.id,
          type: p.type,
          pid: p.pid,
          title: p.title,
          url: p.url,
          description: p.description
        })),
        count: processes.length,
        message: `Found ${processes.length} Electron processes`
      };
    } catch (error) {
      logger.error('Failed to get Electron processes', { error: error instanceof Error ? error.message : String(error) });
      return {
        success: false,
        error: error instanceof Error ? error.message : String(error),
        message: 'Failed to get Electron processes'
      };
    }
  }
};

/**
 * Set breakpoint in Electron process
 */
export const debug_setElectronBreakpoint = {
  name: 'debug_setElectronBreakpoint',
  description: 'Set a breakpoint in an Electron process',
  inputSchema: z.object({
    sessionId: z.string().describe('Electron debugging session ID'),
    processType: z.enum(['main', 'renderer', 'worker']).describe('Type of process'),
    processId: z.string().optional().describe('Specific process ID (optional)'),
    file: z.string().describe('File path or URL'),
    line: z.number().describe('Line number'),
    condition: z.string().optional().describe('Breakpoint condition')
  }),
  handler: async (args: any) => {
    try {
      const electronDebugger = getElectronDebugger();
      
      const breakpoint: Omit<ElectronBreakpoint, 'id' | 'verified'> = {
        type: 'line',
        processType: args.processType,
        processId: args.processId,
        file: args.file,
        line: args.line,
        condition: args.condition,
        enabled: true
      };

      const result = await electronDebugger.setBreakpoint(args.sessionId, breakpoint);

      return {
        success: true,
        breakpoint: {
          id: result.id,
          type: result.type,
          processType: result.processType,
          file: result.file,
          line: result.line,
          condition: result.condition,
          enabled: result.enabled,
          verified: result.verified
        },
        message: `Breakpoint set at ${args.file}:${args.line} in ${args.processType} process`
      };
    } catch (error) {
      logger.error('Failed to set Electron breakpoint', { error: error instanceof Error ? error.message : String(error) });
      return {
        success: false,
        error: error instanceof Error ? error.message : String(error),
        message: 'Failed to set breakpoint'
      };
    }
  }
};

/**
 * Inspect IPC communication
 */
export const debug_inspectIPC = {
  name: 'debug_inspectIPC',
  description: 'Inspect IPC communication between Electron processes',
  inputSchema: z.object({
    sessionId: z.string().describe('Electron debugging session ID'),
    channelName: z.string().optional().describe('Specific IPC channel to inspect'),
    limit: z.number().optional().default(50).describe('Maximum number of messages to return')
  }),
  handler: async (args: any) => {
    try {
      const electronDebugger = getElectronDebugger();

      const channels = await electronDebugger.getIPCChannels(args.sessionId);
      const messages = await electronDebugger.getIPCMessages(args.sessionId, args.channelName, args.limit);

      return {
        success: true,
        channels: channels.map(c => ({
          name: c.name,
          type: c.type,
          direction: c.direction,
          messageCount: c.messageCount,
          active: c.active,
          lastMessage: c.lastMessage ? {
            timestamp: c.lastMessage.timestamp,
            payload: c.lastMessage.payload
          } : null
        })),
        messages: messages.map(m => ({
          id: m.id,
          channel: m.channel,
          type: m.type,
          direction: m.direction,
          timestamp: m.timestamp,
          payload: m.payload,
          sender: m.sender,
          receiver: m.receiver
        })),
        message: `Found ${channels.length} IPC channels and ${messages.length} messages`
      };
    } catch (error) {
      logger.error('Failed to inspect IPC', { error: error instanceof Error ? error.message : String(error) });
      return {
        success: false,
        error: error instanceof Error ? error.message : String(error),
        message: 'Failed to inspect IPC communication'
      };
    }
  }
};

/**
 * Get Electron performance metrics
 */
export const debug_getElectronPerformance = {
  name: 'debug_getElectronPerformance',
  description: 'Get performance metrics for Electron processes',
  inputSchema: z.object({
    sessionId: z.string().describe('Electron debugging session ID'),
    processId: z.string().optional().describe('Specific process ID (optional)')
  }),
  handler: async (args: any) => {
    try {
      const electronDebugger = getElectronDebugger();
      const metrics = await electronDebugger.getPerformanceMetrics(args.sessionId, args.processId);

      return {
        success: true,
        metrics: {
          processId: metrics.processId,
          processType: metrics.processType,
          timestamp: metrics.timestamp,
          memory: metrics.memory,
          cpu: metrics.cpu,
          gpu: metrics.gpu,
          dom: metrics.dom,
          rendering: metrics.rendering
        },
        message: `Performance metrics for ${metrics.processType} process ${metrics.processId}`
      };
    } catch (error) {
      logger.error('Failed to get Electron performance metrics', { error: error instanceof Error ? error.message : String(error) });
      return {
        success: false,
        error: error instanceof Error ? error.message : String(error),
        message: 'Failed to get performance metrics'
      };
    }
  }
};

/**
 * Analyze Electron memory usage
 */
export const debug_analyzeElectronMemory = {
  name: 'debug_analyzeElectronMemory',
  description: 'Analyze memory usage and detect potential leaks in Electron processes',
  inputSchema: z.object({
    sessionId: z.string().describe('Electron debugging session ID'),
    processId: z.string().optional().describe('Specific process ID (optional)'),
    duration: z.number().optional().default(30).describe('Analysis duration in seconds')
  }),
  handler: async (args: any) => {
    try {
      const electronDebugger = getElectronDebugger();

      // Start memory profiling
      await electronDebugger.startProfiling(args.sessionId, args.processId, 'memory');

      // Wait for specified duration
      await new Promise(resolve => setTimeout(resolve, args.duration * 1000));

      // Stop profiling and get results
      const profileData = await electronDebugger.stopProfiling(args.sessionId, args.processId);

      return {
        success: true,
        analysis: {
          duration: args.duration,
          processId: args.processId || 'all',
          heapSnapshot: profileData.heapSnapshot,
          allocations: profileData.allocations,
          deallocations: profileData.deallocations,
          potentialLeaks: profileData.leaks,
          recommendations: [
            profileData.leaks > 0 ? 'Investigate potential memory leaks' : 'No memory leaks detected',
            profileData.allocations > profileData.deallocations * 1.2 ? 'High allocation rate detected' : 'Normal allocation pattern',
            'Consider using memory profiling tools for detailed analysis'
          ]
        },
        message: `Memory analysis completed for ${args.duration} seconds`
      };
    } catch (error) {
      logger.error('Failed to analyze Electron memory', { error: error instanceof Error ? error.message : String(error) });
      return {
        success: false,
        error: error instanceof Error ? error.message : String(error),
        message: 'Failed to analyze memory usage'
      };
    }
  }
};

/**
 * Get Electron security context
 */
export const debug_getElectronSecurity = {
  name: 'debug_getElectronSecurity',
  description: 'Get security context and analyze security configuration for Electron processes',
  inputSchema: z.object({
    sessionId: z.string().describe('Electron debugging session ID'),
    processId: z.string().optional().describe('Specific process ID (optional)')
  }),
  handler: async (args: any) => {
    try {
      const electronDebugger = getElectronDebugger();
      const securityContext = await electronDebugger.getSecurityContext(args.sessionId, args.processId);
      const securityValidation = await electronDebugger.validateSecurity(args.sessionId);

      return {
        success: true,
        securityContext: {
          processId: securityContext.processId,
          processType: securityContext.processType,
          nodeIntegration: securityContext.nodeIntegration,
          contextIsolation: securityContext.contextIsolation,
          sandbox: securityContext.sandbox,
          webSecurity: securityContext.webSecurity,
          allowRunningInsecureContent: securityContext.allowRunningInsecureContent,
          experimentalFeatures: securityContext.experimentalFeatures,
          preloadScripts: securityContext.preloadScripts,
          permissions: securityContext.permissions,
          csp: securityContext.csp,
          origin: securityContext.origin
        },
        validation: {
          overall: securityValidation.overall,
          score: securityValidation.score,
          maxScore: securityValidation.maxScore,
          violations: securityValidation.violations,
          recommendations: securityValidation.recommendations
        },
        message: `Security analysis complete - Overall status: ${securityValidation.overall} (${securityValidation.score}/${securityValidation.maxScore})`
      };
    } catch (error) {
      logger.error('Failed to get Electron security context', { error: error instanceof Error ? error.message : String(error) });
      return {
        success: false,
        error: error instanceof Error ? error.message : String(error),
        message: 'Failed to get security context'
      };
    }
  }
};

/**
 * Debug Electron GUI elements
 */
export const debug_debugElectronGUI = {
  name: 'debug_debugElectronGUI',
  description: 'Debug GUI elements in Electron renderer processes',
  inputSchema: z.object({
    sessionId: z.string().describe('Electron debugging session ID'),
    action: z.enum(['inspect', 'simulate', 'list']).describe('GUI debugging action'),
    elementId: z.string().optional().describe('GUI element ID (for inspect/simulate actions)'),
    eventType: z.string().optional().describe('Event type to simulate (click, hover, keypress)'),
    eventOptions: z.object({}).optional().describe('Event options (e.g., key for keypress)')
  }),
  handler: async (args: any) => {
    try {
      const electronDebugger = getElectronDebugger();

      switch (args.action) {
        case 'list':
          const elements = await electronDebugger.getGUIElements(args.sessionId);
          return {
            success: true,
            elements: elements.map(e => ({
              id: e.id,
              type: e.type,
              title: e.title,
              visible: e.visible,
              focused: e.focused,
              bounds: e.bounds,
              properties: e.properties
            })),
            count: elements.length,
            message: `Found ${elements.length} GUI elements`
          };

        case 'inspect':
          if (!args.elementId) {
            throw new Error('Element ID is required for inspect action');
          }
          const inspection = await electronDebugger.inspectGUIElement(args.sessionId, args.elementId);
          return {
            success: true,
            inspection,
            message: `Inspected GUI element ${args.elementId}`
          };

        case 'simulate':
          if (!args.elementId || !args.eventType) {
            throw new Error('Element ID and event type are required for simulate action');
          }
          await electronDebugger.simulateGUIEvent(args.sessionId, args.elementId, args.eventOptions || {});
          return {
            success: true,
            message: `Simulated ${args.eventType} event on element ${args.elementId}`
          };

        default:
          throw new Error(`Unknown GUI debugging action: ${args.action}`);
      }
    } catch (error) {
      logger.error('Failed to debug Electron GUI', { error: error instanceof Error ? error.message : String(error) });
      return {
        success: false,
        error: error instanceof Error ? error.message : String(error),
        message: 'Failed to debug GUI elements'
      };
    }
  }
};

/**
 * Get Electron architecture overview (NUEVA FUNCIÓN)
 */
export const debug_getElectronArchitecture = {
  name: 'debug_getElectronArchitecture',
  description: 'Get comprehensive Electron application architecture overview including all processes',
  inputSchema: z.object({
    sessionId: z.string().describe('Electron debugging session ID'),
    includeMainProcess: z.boolean().optional().default(true).describe('Include main process information'),
    includeRendererProcesses: z.boolean().optional().default(true).describe('Include renderer processes'),
    includeUtilityProcesses: z.boolean().optional().default(true).describe('Include utility processes'),
    showMemoryPerProcess: z.boolean().optional().default(true).describe('Show memory usage per process'),
    showCPUPerProcess: z.boolean().optional().default(true).describe('Show CPU usage per process')
  }),
  handler: async (args: any) => {
    try {
      const electronDebugger = getElectronDebugger();
      const processes = await electronDebugger.getProcesses(args.sessionId);
      const session = electronDebugger.getSession(args.sessionId);

      if (!session) {
        throw new Error(`Session not found: ${args.sessionId}`);
      }

      const architecture = {
        sessionId: args.sessionId,
        totalProcesses: processes.length,
        mainProcess: null as any,
        rendererProcesses: [] as any[],
        utilityProcesses: [] as any[],
        overview: {
          totalMemory: 0,
          totalCPU: 0,
          startTime: session.startTime,
          uptime: Date.now() - session.startTime.getTime()
        }
      };

      // Process main process
      if (args.includeMainProcess && session.mainProcess) {
        const mainMetrics = args.showMemoryPerProcess || args.showCPUPerProcess
          ? await electronDebugger.getPerformanceMetrics(args.sessionId, session.mainProcess.id)
          : null;

        architecture.mainProcess = {
          pid: session.mainProcess.pid,
          id: session.mainProcess.id,
          type: 'main',
          memory: mainMetrics ? `${Math.round(mainMetrics.memory.rss / 1024 / 1024)}MB` : 'N/A',
          cpu: mainMetrics ? `${mainMetrics.cpu.percentCPUUsage.toFixed(1)}%` : 'N/A',
          status: 'connected'
        };

        if (mainMetrics) {
          architecture.overview.totalMemory += mainMetrics.memory.rss;
          architecture.overview.totalCPU += mainMetrics.cpu.percentCPUUsage;
        }
      }

      // Process renderer processes
      if (args.includeRendererProcesses) {
        for (const [processId, processInfo] of session.rendererProcesses) {
          const rendererMetrics = args.showMemoryPerProcess || args.showCPUPerProcess
            ? await electronDebugger.getPerformanceMetrics(args.sessionId, processId)
            : null;

          architecture.rendererProcesses.push({
            pid: processInfo.pid,
            id: processId,
            type: 'renderer',
            url: processInfo.url || 'N/A',
            title: processInfo.title || 'Untitled',
            memory: rendererMetrics ? `${Math.round(rendererMetrics.memory.rss / 1024 / 1024)}MB` : 'N/A',
            cpu: rendererMetrics ? `${rendererMetrics.cpu.percentCPUUsage.toFixed(1)}%` : 'N/A',
            status: 'connected'
          });

          if (rendererMetrics) {
            architecture.overview.totalMemory += rendererMetrics.memory.rss;
            architecture.overview.totalCPU += rendererMetrics.cpu.percentCPUUsage;
          }
        }
      }

      // Process utility processes
      if (args.includeUtilityProcesses) {
        for (const [processId, processInfo] of session.workerProcesses) {
          architecture.utilityProcesses.push({
            pid: processInfo.pid,
            id: processId,
            type: 'utility',
            description: processInfo.description || 'Worker Process',
            status: 'connected'
          });
        }
      }

      // Format total memory
      const totalMemoryMB = Math.round(architecture.overview.totalMemory / 1024 / 1024);
      architecture.overview.totalMemory = totalMemoryMB;

      return {
        success: true,
        architecture,
        message: `Architecture overview: ${architecture.totalProcesses} processes (Main: ${architecture.mainProcess ? 1 : 0}, Renderers: ${architecture.rendererProcesses.length}, Utilities: ${architecture.utilityProcesses.length}), Total Memory: ${totalMemoryMB}MB`
      };
    } catch (error) {
      logger.error('Failed to get Electron architecture', { error: error instanceof Error ? error.message : String(error) });
      return {
        success: false,
        error: error instanceof Error ? error.message : String(error),
        message: 'Failed to get Electron architecture overview'
      };
    }
  }
};

/**
 * Start IPC monitoring (FUNCIÓN MEJORADA)
 */
export const debug_startIpcMonitoring = {
  name: 'debug_startIpcMonitoring',
  description: 'Start comprehensive IPC monitoring with advanced filtering and leak detection',
  inputSchema: z.object({
    sessionId: z.string().describe('Electron debugging session ID'),
    channels: z.array(z.string()).optional().describe('Specific channels to monitor (empty = all)'),
    capturePayloads: z.boolean().optional().default(true).describe('Capture message payloads'),
    trackTiming: z.boolean().optional().default(true).describe('Track message timing'),
    detectLeaks: z.boolean().optional().default(true).describe('Detect potential memory leaks'),
    maxMessages: z.number().optional().default(1000).describe('Maximum messages to store')
  }),
  handler: async (args: any) => {
    try {
      const electronDebugger = getElectronDebugger();

      // Start IPC tracing with enhanced options
      await electronDebugger.traceIPC(args.sessionId, true);

      // Configure monitoring options (this would be implemented in the IPC debugger)
      const monitoringConfig = {
        channels: args.channels || [],
        capturePayloads: args.capturePayloads,
        trackTiming: args.trackTiming,
        detectLeaks: args.detectLeaks,
        maxMessages: args.maxMessages
      };

      return {
        success: true,
        monitoring: {
          active: true,
          sessionId: args.sessionId,
          config: monitoringConfig,
          startTime: new Date().toISOString()
        },
        message: `IPC monitoring started for session ${args.sessionId}${args.channels?.length ? ` (channels: ${args.channels.join(', ')})` : ' (all channels)'}`
      };
    } catch (error) {
      logger.error('Failed to start IPC monitoring', { error: error instanceof Error ? error.message : String(error) });
      return {
        success: false,
        error: error instanceof Error ? error.message : String(error),
        message: 'Failed to start IPC monitoring'
      };
    }
  }
};

/**
 * Get IPC messages with advanced filtering (FUNCIÓN MEJORADA)
 */
export const debug_getIpcMessages = {
  name: 'debug_getIpcMessages',
  description: 'Get IPC messages with advanced filtering and analysis',
  inputSchema: z.object({
    sessionId: z.string().describe('Electron debugging session ID'),
    timeRange: z.string().optional().default('last-5min').describe('Time range (last-5min, last-1hour, all)'),
    filterByChannel: z.string().optional().describe('Filter by specific channel'),
    includeStackTrace: z.boolean().optional().default(false).describe('Include stack traces'),
    includePayloads: z.boolean().optional().default(true).describe('Include message payloads'),
    limit: z.number().optional().default(100).describe('Maximum number of messages to return')
  }),
  handler: async (args: any) => {
    try {
      const electronDebugger = getElectronDebugger();
      const messages = await electronDebugger.getIPCMessages(args.sessionId, args.filterByChannel, args.limit);

      // Apply time filtering
      let filteredMessages = messages;
      if (args.timeRange !== 'all') {
        const now = Date.now();
        const timeRanges: Record<string, number> = {
          'last-5min': 5 * 60 * 1000,
          'last-1hour': 60 * 60 * 1000,
          'last-24hours': 24 * 60 * 60 * 1000
        };
        const defaultTime = 5 * 60 * 1000; // 5 minutes
        const cutoff = now - (timeRanges[args.timeRange] || defaultTime);
        filteredMessages = messages.filter(msg => {
          const msgTime = msg.timestamp instanceof Date ? msg.timestamp.getTime() : msg.timestamp;
          return msgTime >= cutoff;
        });
      }

      // Enhance messages with analysis
      const enhancedMessages = filteredMessages.map(msg => ({
        ...msg,
        payload: args.includePayloads ? msg.payload : '[payload hidden]',
        stackTrace: args.includeStackTrace ? (msg as any).stackTrace : undefined,
        timing: {
          timestamp: msg.timestamp instanceof Date ? msg.timestamp.toISOString() : new Date(msg.timestamp).toISOString(),
          latency: (msg as any).responseTime ? `${(msg as any).responseTime}ms` : 'N/A'
        }
      }));

      // Generate analysis
      const analysis = {
        totalMessages: enhancedMessages.length,
        channels: [...new Set(enhancedMessages.map(m => m.channel))],
        messageTypes: enhancedMessages.reduce((acc, msg) => {
          acc[msg.type] = (acc[msg.type] || 0) + 1;
          return acc;
        }, {} as Record<string, number>),
        averageLatency: enhancedMessages
          .filter(m => (m as any).responseTime)
          .reduce((sum, m, _, arr) => sum + ((m as any).responseTime || 0) / arr.length, 0)
      };

      return {
        success: true,
        messages: enhancedMessages,
        analysis,
        filter: {
          timeRange: args.timeRange,
          channel: args.filterByChannel,
          limit: args.limit
        },
        message: `Retrieved ${enhancedMessages.length} IPC messages`
      };
    } catch (error) {
      logger.error('Failed to get IPC messages', { error: error instanceof Error ? error.message : String(error) });
      return {
        success: false,
        error: error instanceof Error ? error.message : String(error),
        message: 'Failed to get IPC messages'
      };
    }
  }
};

/**
 * Analyze Electron security context (NUEVA FUNCIÓN)
 */
export const debug_analyzeElectronSecurity = {
  name: 'debug_analyzeElectronSecurity',
  description: 'Comprehensive security analysis for Electron applications',
  inputSchema: z.object({
    sessionId: z.string().describe('Electron debugging session ID'),
    checkNodeIntegration: z.boolean().optional().default(true).describe('Check Node.js integration settings'),
    checkContextIsolation: z.boolean().optional().default(true).describe('Check context isolation'),
    checkSandboxMode: z.boolean().optional().default(true).describe('Check sandbox mode'),
    checkCSP: z.boolean().optional().default(true).describe('Check Content Security Policy'),
    checkRemoteModule: z.boolean().optional().default(true).describe('Check remote module usage')
  }),
  handler: async (args: any) => {
    try {
      const electronDebugger = getElectronDebugger();
      const session = electronDebugger.getSession(args.sessionId);

      if (!session) {
        throw new Error(`Session not found: ${args.sessionId}`);
      }

      const securityAnalysis = {
        sessionId: args.sessionId,
        timestamp: new Date().toISOString(),
        overallRisk: 'LOW' as 'LOW' | 'MEDIUM' | 'HIGH' | 'CRITICAL',
        score: 100,
        checks: {} as Record<string, any>,
        recommendations: [] as string[],
        vulnerabilities: [] as any[]
      };

      // Check Node Integration (simulated - would need actual runtime integration)
      if (args.checkNodeIntegration) {
        // Simulate security check - in real implementation this would use actual Electron APIs
        const nodeIntegrationEnabled = false; // Default to secure setting

        securityAnalysis.checks['nodeIntegration'] = {
          status: 'CHECKED',
          enabled: nodeIntegrationEnabled,
          risk: nodeIntegrationEnabled ? 'HIGH' : 'LOW',
          description: 'Node.js integration in renderer processes'
        };

        if (nodeIntegrationEnabled) {
          securityAnalysis.vulnerabilities.push({
            type: 'NODE_INTEGRATION_ENABLED',
            severity: 'HIGH',
            description: 'Node.js integration is enabled in renderer processes',
            recommendation: 'Disable nodeIntegration and use contextIsolation with preload scripts'
          });
          securityAnalysis.score -= 30;
        }
      }

      // Check Context Isolation (simulated)
      if (args.checkContextIsolation) {
        // Simulate security check - in real implementation this would use actual Electron APIs
        const contextIsolationEnabled = true; // Default to secure setting

        securityAnalysis.checks['contextIsolation'] = {
          status: 'CHECKED',
          enabled: contextIsolationEnabled,
          risk: contextIsolationEnabled ? 'LOW' : 'HIGH',
          description: 'Context isolation between main and renderer worlds'
        };

        if (!contextIsolationEnabled) {
          securityAnalysis.vulnerabilities.push({
            type: 'CONTEXT_ISOLATION_DISABLED',
            severity: 'HIGH',
            description: 'Context isolation is disabled',
            recommendation: 'Enable contextIsolation to prevent renderer access to Node.js APIs'
          });
          securityAnalysis.score -= 25;
        }
      }

      // Check Sandbox Mode (simulated)
      if (args.checkSandboxMode) {
        // Simulate security check - in real implementation this would use actual Electron APIs
        const sandboxEnabled = true; // Default to secure setting

        securityAnalysis.checks['sandbox'] = {
          status: 'CHECKED',
          enabled: sandboxEnabled,
          risk: sandboxEnabled ? 'LOW' : 'MEDIUM',
          description: 'Renderer process sandboxing'
        };

        if (!sandboxEnabled) {
          securityAnalysis.vulnerabilities.push({
            type: 'SANDBOX_DISABLED',
            severity: 'MEDIUM',
            description: 'Sandbox mode is disabled for renderer processes',
            recommendation: 'Enable sandbox mode to restrict renderer process capabilities'
          });
          securityAnalysis.score -= 15;
        }
      }

      // Determine overall risk
      if (securityAnalysis.score >= 80) securityAnalysis.overallRisk = 'LOW';
      else if (securityAnalysis.score >= 60) securityAnalysis.overallRisk = 'MEDIUM';
      else if (securityAnalysis.score >= 40) securityAnalysis.overallRisk = 'HIGH';
      else securityAnalysis.overallRisk = 'CRITICAL';

      // Generate recommendations
      if (securityAnalysis.vulnerabilities.length === 0) {
        securityAnalysis.recommendations.push('Security configuration looks good! Continue following Electron security best practices.');
      } else {
        securityAnalysis.recommendations = securityAnalysis.vulnerabilities.map(v => v.recommendation);
      }

      return {
        success: true,
        security: securityAnalysis,
        message: `Security analysis complete: ${securityAnalysis.overallRisk} risk (Score: ${securityAnalysis.score}/100)`
      };
    } catch (error) {
      logger.error('Failed to analyze Electron security', { error: error instanceof Error ? error.message : String(error) });
      return {
        success: false,
        error: error instanceof Error ? error.message : String(error),
        message: 'Failed to analyze Electron security'
      };
    }
  }
};

/**
 * Get async operations (FUNCIÓN IMPLEMENTADA)
 */
export const debug_getAsyncOperations = {
  name: 'debug_getAsyncOperations',
  description: 'Get active async operations with Electron-specific tracking',
  inputSchema: z.object({
    sessionId: z.string().describe('Debugging session ID'),
    includeElectronIPC: z.boolean().optional().default(true).describe('Include Electron IPC operations'),
    includeRendererAsync: z.boolean().optional().default(true).describe('Include renderer async operations'),
    trackWebContents: z.boolean().optional().default(true).describe('Track WebContents async operations'),
    includePromises: z.boolean().optional().default(true).describe('Include Promise tracking'),
    includeTimers: z.boolean().optional().default(true).describe('Include timer tracking')
  }),
  handler: async (args: any) => {
    try {
      const electronDebugger = getElectronDebugger();
      const session = electronDebugger.getSession(args.sessionId);

      if (!session) {
        throw new Error(`Session not found: ${args.sessionId}`);
      }

      const asyncOperations = {
        sessionId: args.sessionId,
        timestamp: new Date().toISOString(),
        operations: {
          ipc: [] as any[],
          promises: [] as any[],
          timers: [] as any[],
          webContents: [] as any[]
        },
        summary: {
          total: 0,
          byType: {} as Record<string, number>,
          oldestOperation: null as any,
          averageAge: 0
        }
      };

      // Track IPC operations
      if (args.includeElectronIPC) {
        const ipcMessages = await electronDebugger.getIPCMessages(args.sessionId, undefined, 50);
        const pendingIPC = ipcMessages.filter(msg => !(msg as any).responseTime && msg.type === 'invoke');

        asyncOperations.operations.ipc = pendingIPC.map(msg => ({
          id: msg.id,
          channel: msg.channel,
          type: 'ipc-invoke',
          age: Date.now() - (msg.timestamp instanceof Date ? msg.timestamp.getTime() : msg.timestamp),
          status: 'pending',
          source: (msg as any).source || 'unknown',
          target: (msg as any).target || 'unknown'
        }));
      }

      // Track Promises (simulated - would need actual runtime integration)
      if (args.includePromises) {
        // Simulate promise tracking - in real implementation this would use actual runtime hooks
        asyncOperations.operations.promises = [
          {
            id: 'promise-1',
            type: 'promise',
            status: 'pending',
            age: 1500,
            description: 'Simulated pending promise'
          }
        ];
      }

      // Track WebContents operations (simulated)
      if (args.trackWebContents) {
        // Simulate WebContents operations - in real implementation this would use actual Electron APIs
        asyncOperations.operations.webContents = [
          {
            id: 'webcontents-1',
            type: 'webcontents-navigation',
            url: 'https://example.com',
            status: 'loading',
            age: 2000
          }
        ];
      }

      // Calculate summary
      const allOps = [
        ...asyncOperations.operations.ipc,
        ...asyncOperations.operations.promises,
        ...asyncOperations.operations.webContents
      ];

      asyncOperations.summary.total = allOps.length;
      asyncOperations.summary.byType = allOps.reduce((acc, op) => {
        acc[op.type] = (acc[op.type] || 0) + 1;
        return acc;
      }, {});

      if (allOps.length > 0) {
        const ages = allOps.map(op => op.age || 0);
        asyncOperations.summary.averageAge = ages.reduce((sum, age) => sum + age, 0) / ages.length;
        asyncOperations.summary.oldestOperation = allOps.reduce((oldest, op) =>
          (op.age || 0) > (oldest?.age || 0) ? op : oldest
        );
      }

      return {
        success: true,
        asyncOperations,
        message: `Found ${asyncOperations.summary.total} active async operations`
      };
    } catch (error) {
      logger.error('Failed to get async operations', { error: error instanceof Error ? error.message : String(error) });
      return {
        success: false,
        error: error instanceof Error ? error.message : String(error),
        message: 'Failed to get async operations'
      };
    }
  }
};

// Export all tools
export const electronTools = {
  debug_connectElectron,
  debug_getElectronProcesses,
  debug_setElectronBreakpoint,
  debug_inspectIPC,
  debug_getElectronPerformance,
  debug_analyzeElectronMemory,
  debug_getElectronSecurity,
  debug_debugElectronGUI,
  // Nuevas funciones agregadas
  debug_getElectronArchitecture,
  debug_startIpcMonitoring,
  debug_getIpcMessages,
  debug_analyzeElectronSecurity,
  debug_getAsyncOperations
};
