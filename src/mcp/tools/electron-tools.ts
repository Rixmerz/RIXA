/**
 * MCP Tools for Electron Debugging
 * 
 * This module provides MCP (Model Context Protocol) tools specifically
 * designed for debugging Electron applications through Claude Desktop.
 */

import { z } from 'zod';
import { getLogger } from '../../utils/logger.js';
import { ElectronDebugger } from '../../electron/electron-debugger.js';
import type {
  ElectronDebugConfig,
  ElectronBreakpoint
} from '../../electron/types.js';

const logger = getLogger();

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

// Export all tools
export const electronTools = {
  debug_connectElectron,
  debug_getElectronProcesses,
  debug_setElectronBreakpoint,
  debug_inspectIPC,
  debug_getElectronPerformance,
  debug_analyzeElectronMemory,
  debug_getElectronSecurity,
  debug_debugElectronGUI
};
