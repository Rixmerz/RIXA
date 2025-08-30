/**
 * Tests for .NET/C# debugging functionality
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { DotNetDebugger } from '../dotnet/dotnet-debugger.js';
import { DotNetVersionDetector } from '../dotnet/version-detector.js';
import { DotNetFrameworkDetector } from '../dotnet/framework-detector.js';
import { DotNetFrameworkSupport } from '../dotnet/framework-support.js';
import { DotNetAdvancedDebugging } from '../dotnet/advanced-debugging.js';
import type { DotNetDebugConfig, DotNetProcessInfo } from '../dotnet/types.js';

// Mock child_process
vi.mock('child_process', () => ({
  spawn: vi.fn(),
  exec: vi.fn()
}));

// Mock fs
vi.mock('fs', () => ({
  existsSync: vi.fn(() => true),
  readFileSync: vi.fn(() => '<TargetFramework>net8.0</TargetFramework>'),
  readdirSync: vi.fn(() => ['test.csproj'])
}));

describe('DotNet Debugging', () => {
  let debugger: DotNetDebugger;
  let versionDetector: DotNetVersionDetector;
  let frameworkDetector: DotNetFrameworkDetector;
  let frameworkSupport: DotNetFrameworkSupport;
  let advancedDebugging: DotNetAdvancedDebugging;

  beforeEach(() => {
    debugger = DotNetDebugger.getInstance();
    versionDetector = DotNetVersionDetector.getInstance();
    frameworkDetector = DotNetFrameworkDetector.getInstance();
    frameworkSupport = DotNetFrameworkSupport.getInstance();
    advancedDebugging = DotNetAdvancedDebugging.getInstance();
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  describe('DotNetVersionDetector', () => {
    it('should detect .NET version from process info', async () => {
      const processInfo: Partial<DotNetProcessInfo> = {
        pid: 1234,
        name: 'dotnet.exe',
        commandLine: 'dotnet --fx-version 8.0.0 myapp.dll',
        workingDirectory: '/path/to/project'
      };

      const result = await versionDetector.detectVersionFromProcess(processInfo);

      expect(result).toBeDefined();
      expect(result.version).toBe('net8.0');
      expect(result.runtime).toBe('core');
      expect(result.confidence).toBeGreaterThan(0.5);
    });

    it('should parse target framework correctly', async () => {
      const result = await versionDetector.detectVersionFromProcess({
        workingDirectory: '/test/project'
      });

      expect(result).toBeDefined();
      expect(result.version).toBe('net8.0');
    });

    it('should get installed versions', async () => {
      const versions = await versionDetector.getInstalledVersions();

      expect(versions).toBeDefined();
      expect(versions.framework).toBeInstanceOf(Array);
      expect(versions.core).toBeInstanceOf(Array);
    });
  });

  describe('DotNetFrameworkDetector', () => {
    it('should detect ASP.NET Core framework', async () => {
      const processInfo: Partial<DotNetProcessInfo> = {
        assemblies: [
          { name: 'Microsoft.AspNetCore.Hosting' } as any
        ],
        workingDirectory: '/aspnet/project'
      };

      const result = await frameworkDetector.detectFramework(processInfo);

      expect(result.framework).toBe('aspnetcore');
      expect(result.confidence).toBeGreaterThan(0.8);
      expect(result.indicators).toContain('ASP.NET Core assemblies detected');
    });

    it('should detect WPF framework', async () => {
      const processInfo: Partial<DotNetProcessInfo> = {
        assemblies: [
          { name: 'PresentationFramework' } as any
        ]
      };

      const result = await frameworkDetector.detectFramework(processInfo);

      expect(result.framework).toBe('wpf');
      expect(result.capabilities.supportsHotReload).toBe(true);
    });

    it('should detect Unity framework', async () => {
      const processInfo: Partial<DotNetProcessInfo> = {
        assemblies: [
          { name: 'UnityEngine' } as any
        ]
      };

      const result = await frameworkDetector.detectFramework(processInfo);

      expect(result.framework).toBe('unity');
      expect(result.capabilities.supportsRemoteDebugging).toBe(true);
    });

    it('should get supported frameworks', () => {
      const frameworks = frameworkDetector.getSupportedFrameworks();

      expect(frameworks).toContain('aspnetcore');
      expect(frameworks).toContain('wpf');
      expect(frameworks).toContain('unity');
      expect(frameworks).toContain('blazor-server');
    });
  });

  describe('DotNetDebugger', () => {
    it('should connect to .NET process', async () => {
      const config: DotNetDebugConfig = {
        processId: 1234,
        dotnetVersion: 'net8.0',
        framework: 'console',
        runtime: 'core'
      };

      // Mock process info
      vi.spyOn(debugger, 'getProcessInfo').mockResolvedValue({
        pid: 1234,
        name: 'test.exe',
        version: 'net8.0',
        runtime: 'core',
        framework: 'console',
        architecture: 'x64',
        startTime: new Date(),
        workingDirectory: '/test',
        commandLine: 'test.exe',
        assemblies: [],
        isDebuggable: true
      });

      const sessionId = await debugger.connect(config);

      expect(sessionId).toBeDefined();
      expect(sessionId).toMatch(/^dotnet-/);

      const session = debugger.getSession(sessionId);
      expect(session).toBeDefined();
      expect(session?.processInfo.pid).toBe(1234);
    });

    it('should set breakpoint', async () => {
      const config: DotNetDebugConfig = {
        processId: 1234,
        framework: 'console'
      };

      vi.spyOn(debugger, 'getProcessInfo').mockResolvedValue({
        pid: 1234,
        name: 'test.exe',
        version: 'net8.0',
        runtime: 'core',
        framework: 'console',
        architecture: 'x64',
        startTime: new Date(),
        workingDirectory: '/test',
        commandLine: 'test.exe',
        assemblies: [],
        isDebuggable: true
      });

      const sessionId = await debugger.connect(config);
      const breakpoint = await debugger.setBreakpoint(sessionId, 'Program.cs', 10);

      expect(breakpoint).toBeDefined();
      expect(breakpoint.file).toBe('Program.cs');
      expect(breakpoint.line).toBe(10);
      expect(breakpoint.verified).toBe(true);
    });

    it('should evaluate expression', async () => {
      const config: DotNetDebugConfig = {
        processId: 1234,
        framework: 'console'
      };

      vi.spyOn(debugger, 'getProcessInfo').mockResolvedValue({
        pid: 1234,
        name: 'test.exe',
        version: 'net8.0',
        runtime: 'core',
        framework: 'console',
        architecture: 'x64',
        startTime: new Date(),
        workingDirectory: '/test',
        commandLine: 'test.exe',
        assemblies: [],
        isDebuggable: true
      });

      const sessionId = await debugger.connect(config);
      const result = await debugger.evaluateExpression(sessionId, 'myVariable.ToString()');

      expect(result).toBeDefined();
      expect(result.success).toBe(true);
      expect(result.type).toBe('string');
      expect(result.executionTime).toBeGreaterThan(0);
    });

    it('should inspect object', async () => {
      const config: DotNetDebugConfig = {
        processId: 1234,
        framework: 'console'
      };

      vi.spyOn(debugger, 'getProcessInfo').mockResolvedValue({
        pid: 1234,
        name: 'test.exe',
        version: 'net8.0',
        runtime: 'core',
        framework: 'console',
        architecture: 'x64',
        startTime: new Date(),
        workingDirectory: '/test',
        commandLine: 'test.exe',
        assemblies: [],
        isDebuggable: true
      });

      const sessionId = await debugger.connect(config);
      const objectInfo = await debugger.inspectObject(sessionId, 'obj-123');

      expect(objectInfo).toBeDefined();
      expect(objectInfo.id).toBe('obj-123');
      expect(objectInfo.type).toBe('System.Object');
      expect(objectInfo.properties).toBeInstanceOf(Array);
      expect(objectInfo.methods).toBeInstanceOf(Array);
    });

    it('should get assemblies', async () => {
      const config: DotNetDebugConfig = {
        processId: 1234,
        framework: 'console'
      };

      vi.spyOn(debugger, 'getProcessInfo').mockResolvedValue({
        pid: 1234,
        name: 'test.exe',
        version: 'net8.0',
        runtime: 'core',
        framework: 'console',
        architecture: 'x64',
        startTime: new Date(),
        workingDirectory: '/test',
        commandLine: 'test.exe',
        assemblies: [],
        isDebuggable: true
      });

      const sessionId = await debugger.connect(config);
      const assemblies = await debugger.getAssemblies(sessionId);

      expect(assemblies).toBeInstanceOf(Array);
      expect(assemblies.length).toBeGreaterThan(0);
      expect(assemblies[0]).toHaveProperty('name');
      expect(assemblies[0]).toHaveProperty('version');
    });

    it('should check health', async () => {
      const health = await debugger.checkHealth();

      expect(health).toBeDefined();
      expect(health.status).toMatch(/^(healthy|degraded|unhealthy)$/);
      expect(health.activeSessions).toBeGreaterThanOrEqual(0);
      expect(health.availableDebuggers).toBeInstanceOf(Array);
      expect(health.installedVersions).toBeDefined();
    });
  });

  describe('DotNetFrameworkSupport', () => {
    it('should get ASP.NET Core features', async () => {
      const config: DotNetDebugConfig = {
        processId: 1234,
        framework: 'aspnetcore'
      };

      vi.spyOn(debugger, 'getProcessInfo').mockResolvedValue({
        pid: 1234,
        name: 'test.exe',
        version: 'net8.0',
        runtime: 'core',
        framework: 'aspnetcore',
        architecture: 'x64',
        startTime: new Date(),
        workingDirectory: '/test',
        commandLine: 'test.exe',
        assemblies: [],
        isDebuggable: true
      });

      const sessionId = await debugger.connect(config);
      const features = await frameworkSupport.getFrameworkFeatures(sessionId);

      expect(features.framework).toBe('aspnetcore');
      expect(features.capabilities.supportsHotReload).toBe(true);
      expect(features.specificFeatures.type).toBe('aspnetcore');
      expect(features.specificFeatures.features.httpContextDebugging).toBe(true);
    });

    it('should enhance framework-specific objects', async () => {
      const config: DotNetDebugConfig = {
        processId: 1234,
        framework: 'wpf'
      };

      vi.spyOn(debugger, 'getProcessInfo').mockResolvedValue({
        pid: 1234,
        name: 'test.exe',
        version: 'net8.0',
        runtime: 'core',
        framework: 'wpf',
        architecture: 'x64',
        startTime: new Date(),
        workingDirectory: '/test',
        commandLine: 'test.exe',
        assemblies: [],
        isDebuggable: true
      });

      const sessionId = await debugger.connect(config);
      const objectInfo = await frameworkSupport.inspectFrameworkObject(
        sessionId, 
        'obj-123', 
        'System.Windows.FrameworkElement'
      );

      expect(objectInfo).toBeDefined();
      expect(objectInfo.properties.some(p => p.name === 'ActualWidth')).toBe(true);
    });
  });

  describe('DotNetAdvancedDebugging', () => {
    it('should enable async debugging', async () => {
      const result = await advancedDebugging.enableAsyncDebugging('session-123');

      expect(result.enabled).toBe(true);
      expect(result.features).toContain('Async method stepping');
      expect(result.features).toContain('Task state inspection');
      expect(result.asyncOperations).toBeInstanceOf(Array);
    });

    it('should enable LINQ debugging', async () => {
      const result = await advancedDebugging.enableLinqDebugging('session-123');

      expect(result.enabled).toBe(true);
      expect(result.features).toContain('Query execution visualization');
      expect(result.supportedOperators).toContain('Where');
      expect(result.supportedOperators).toContain('Select');
    });

    it('should debug LINQ query', async () => {
      await advancedDebugging.enableLinqDebugging('session-123');
      const query = await advancedDebugging.debugLinqQuery(
        'session-123',
        'items.Where(x => x.IsActive).Select(x => x.Name)'
      );

      expect(query).toBeDefined();
      expect(query.expression).toContain('Where');
      expect(query.expression).toContain('Select');
      expect(query.executionPlan).toBeInstanceOf(Array);
      expect(query.executionPlan.length).toBeGreaterThan(0);
    });

    it('should enable hot reload', async () => {
      const result = await advancedDebugging.enableHotReload('session-123');

      expect(result.supported).toBe(true);
      expect(result.enabled).toBe(true);
      expect(result.changedFiles).toBeInstanceOf(Array);
      expect(result.appliedChanges).toBeInstanceOf(Array);
    });

    it('should handle exceptions', async () => {
      const exception = {
        type: 'System.NullReferenceException',
        message: 'Object reference not set to an instance of an object',
        stackTrace: [],
        data: {}
      };

      const result = await advancedDebugging.handleException('session-123', exception);

      expect(result.handled).toBe(true);
      expect(result.analysis.isCommon).toBe(true);
      expect(result.suggestions).toContain('Add null checks before accessing objects');
    });

    it('should start performance profiling', async () => {
      const result = await advancedDebugging.startPerformanceProfiling('session-123');

      expect(result.started).toBe(true);
      expect(result.profileId).toMatch(/^profile-/);
      expect(result.features).toContain('Method execution timing');
    });
  });

  describe('DotNet MCP Tools', () => {
    let dotnetTools: any;

    beforeEach(async () => {
      const module = await import('../mcp/tools/dotnet-tools.js');
      dotnetTools = module.dotnetTools;
    });

    describe('debug_connectDotNet', () => {
      it('should connect to .NET process successfully', async () => {
        const args = {
          processId: 1234,
          enableHotReload: true,
          enableAsyncDebugging: true,
          timeout: 30000
        };

        vi.spyOn(debugger, 'getProcessInfo').mockResolvedValue({
          pid: 1234,
          name: 'test.exe',
          version: 'net8.0',
          runtime: 'core',
          framework: 'console',
          architecture: 'x64',
          startTime: new Date(),
          workingDirectory: '/test',
          commandLine: 'test.exe',
          assemblies: [],
          isDebuggable: true
        });

        const result = await dotnetTools.debug_connectDotNet.handler(args);

        expect(result.success).toBe(true);
        expect(result.sessionId).toBeDefined();
        expect(result.detectedVersion).toBe('net8.0');
        expect(result.detectedFramework).toBe('console');
        expect(result.capabilities.hotReload).toBe(true);
      });

      it('should handle connection failure', async () => {
        const args = {
          processId: 9999 // Non-existent process
        };

        const result = await dotnetTools.debug_connectDotNet.handler(args);

        expect(result.success).toBe(false);
        expect(result.error).toBeDefined();
        expect(result.message).toContain('Failed to connect');
      });

      it('should validate required parameters', async () => {
        const args = {}; // Missing processId and processName

        const result = await dotnetTools.debug_connectDotNet.handler(args);

        expect(result.success).toBe(false);
        expect(result.error).toContain('Either processId or processName must be specified');
      });
    });

    describe('debug_getDotNetProcesses', () => {
      it('should get all .NET processes', async () => {
        vi.spyOn(debugger, 'getAllDotNetProcesses').mockResolvedValue([
          {
            pid: 1234,
            name: 'dotnet.exe',
            version: 'net8.0',
            runtime: 'core',
            framework: 'aspnetcore',
            architecture: 'x64',
            startTime: new Date(),
            workingDirectory: '/test',
            commandLine: 'dotnet test.dll',
            assemblies: [],
            isDebuggable: true
          },
          {
            pid: 5678,
            name: 'MyApp.exe',
            version: 'netframework4.8',
            runtime: 'framework',
            framework: 'wpf',
            architecture: 'x64',
            startTime: new Date(),
            workingDirectory: '/app',
            commandLine: 'MyApp.exe',
            assemblies: [],
            isDebuggable: true
          }
        ]);

        const result = await dotnetTools.debug_getDotNetProcesses.handler({});

        expect(result.success).toBe(true);
        expect(result.processes).toHaveLength(2);
        expect(result.groupedByFramework).toHaveProperty('aspnetcore');
        expect(result.groupedByFramework).toHaveProperty('wpf');
        expect(result.summary.total).toBe(2);
      });

      it('should filter processes by framework', async () => {
        vi.spyOn(debugger, 'getAllDotNetProcesses').mockResolvedValue([
          {
            pid: 1234,
            name: 'dotnet.exe',
            version: 'net8.0',
            runtime: 'core',
            framework: 'aspnetcore',
            architecture: 'x64',
            startTime: new Date(),
            workingDirectory: '/test',
            commandLine: 'dotnet test.dll',
            assemblies: [],
            isDebuggable: true
          }
        ]);

        const result = await dotnetTools.debug_getDotNetProcesses.handler({
          filterByFramework: 'aspnetcore'
        });

        expect(result.success).toBe(true);
        expect(result.processes).toHaveLength(1);
        expect(result.processes[0].framework).toBe('aspnetcore');
      });
    });

    describe('debug_inspectDotNetObject', () => {
      it('should inspect .NET object', async () => {
        const args = {
          sessionId: 'session-123',
          objectId: 'obj-456',
          includePrivateMembers: false,
          maxDepth: 3
        };

        vi.spyOn(debugger, 'getSession').mockReturnValue({
          sessionId: 'session-123',
          processInfo: {} as any,
          config: {},
          connected: true,
          startTime: new Date(),
          breakpoints: new Map(),
          watchedExpressions: new Map(),
          callStack: [],
          variables: new Map(),
          isRunning: true,
          isPaused: false
        });

        const result = await dotnetTools.debug_inspectDotNetObject.handler(args);

        expect(result.success).toBe(true);
        expect(result.objectInfo).toBeDefined();
        expect(result.analysis).toBeDefined();
        expect(result.analysis.memberCounts).toBeDefined();
        expect(result.options.maxDepth).toBe(3);
      });
    });

    describe('debug_evaluateCSharpExpression', () => {
      it('should evaluate C# expression', async () => {
        const args = {
          sessionId: 'session-123',
          expression: 'myVariable.ToString()',
          timeout: 5000,
          enableLinqDebugging: true
        };

        vi.spyOn(debugger, 'getSession').mockReturnValue({
          sessionId: 'session-123',
          processInfo: {} as any,
          config: {},
          connected: true,
          startTime: new Date(),
          breakpoints: new Map(),
          watchedExpressions: new Map(),
          callStack: [],
          variables: new Map(),
          isRunning: true,
          isPaused: false
        });

        const result = await dotnetTools.debug_evaluateCSharpExpression.handler(args);

        expect(result.success).toBe(true);
        expect(result.result).toBeDefined();
        expect(result.result.analysis).toBeDefined();
        expect(result.expression).toBe('myVariable.ToString()');
      });

      it('should analyze LINQ expressions', async () => {
        const args = {
          sessionId: 'session-123',
          expression: 'items.Where(x => x.IsActive).Select(x => x.Name)',
          enableLinqDebugging: true
        };

        vi.spyOn(debugger, 'getSession').mockReturnValue({
          sessionId: 'session-123',
          processInfo: {} as any,
          config: {},
          connected: true,
          startTime: new Date(),
          breakpoints: new Map(),
          watchedExpressions: new Map(),
          callStack: [],
          variables: new Map(),
          isRunning: true,
          isPaused: false
        });

        const result = await dotnetTools.debug_evaluateCSharpExpression.handler(args);

        expect(result.success).toBe(true);
        expect(result.result.analysis.isLinqQuery).toBe(true);
        expect(result.result.analysis.hasLambda).toBe(true);
      });
    });

    describe('debug_getDotNetAssemblies', () => {
      it('should get loaded assemblies', async () => {
        const args = {
          sessionId: 'session-123',
          includeSystemAssemblies: false,
          includeTypeInformation: true
        };

        vi.spyOn(debugger, 'getSession').mockReturnValue({
          sessionId: 'session-123',
          processInfo: {} as any,
          config: {},
          connected: true,
          startTime: new Date(),
          breakpoints: new Map(),
          watchedExpressions: new Map(),
          callStack: [],
          variables: new Map(),
          isRunning: true,
          isPaused: false
        });

        const result = await dotnetTools.debug_getDotNetAssemblies.handler(args);

        expect(result.success).toBe(true);
        expect(result.assemblies).toBeInstanceOf(Array);
        expect(result.summary).toBeDefined();
        expect(result.summary.total).toBeGreaterThanOrEqual(0);
      });
    });

    describe('debug_setDotNetBreakpoint', () => {
      it('should set advanced breakpoint', async () => {
        const args = {
          sessionId: 'session-123',
          file: 'Program.cs',
          line: 25,
          condition: 'x > 10',
          breakOnAsyncException: true
        };

        vi.spyOn(debugger, 'getSession').mockReturnValue({
          sessionId: 'session-123',
          processInfo: {} as any,
          config: {},
          connected: true,
          startTime: new Date(),
          breakpoints: new Map(),
          watchedExpressions: new Map(),
          callStack: [],
          variables: new Map(),
          isRunning: true,
          isPaused: false
        });

        const result = await dotnetTools.debug_setDotNetBreakpoint.handler(args);

        expect(result.success).toBe(true);
        expect(result.breakpoint).toBeDefined();
        expect(result.breakpoint.file).toBe('Program.cs');
        expect(result.breakpoint.line).toBe(25);
        expect(result.features.conditional).toBe(true);
        expect(result.features.asyncSupport).toBe(true);
      });
    });

    describe('debug_enableDotNetHotReload', () => {
      it('should enable hot reload', async () => {
        const args = {
          sessionId: 'session-123',
          enableAutoReload: true,
          reloadTimeout: 5000
        };

        vi.spyOn(debugger, 'getSession').mockReturnValue({
          sessionId: 'session-123',
          processInfo: {} as any,
          config: { framework: 'aspnetcore' },
          connected: true,
          startTime: new Date(),
          breakpoints: new Map(),
          watchedExpressions: new Map(),
          callStack: [],
          variables: new Map(),
          isRunning: true,
          isPaused: false
        });

        const result = await dotnetTools.debug_enableDotNetHotReload.handler(args);

        expect(result.success).toBe(true);
        expect(result.hotReloadInfo.supported).toBe(true);
        expect(result.configuration.enableAutoReload).toBe(true);
        expect(result.capabilities.autoReload).toBe(true);
      });
    });
  });
});
