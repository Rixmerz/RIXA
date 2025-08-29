# Phase 3: Integration & MCP Tools

## Overview

This phase integrates the .NET debugging functionality into RIXA's existing infrastructure, updates the language dispatcher, and exposes debugging capabilities through MCP (Model Context Protocol) tools for Claude AI integration.

## Objectives

- Update the language dispatcher to route .NET debugging requests
- Implement .NET-specific MCP tools
- Add project detection and analysis capabilities
- Integrate with session management
- Implement error handling and recovery mechanisms

## Integration Architecture

```
┌──────────────────┐
│   MCP Client     │
│   (Claude AI)    │
└────────┬─────────┘
         │
    MCP Protocol
         │
┌────────▼─────────┐
│   MCP Tools      │
│  (.NET-specific) │
└────────┬─────────┘
         │
┌────────▼─────────┐
│Language Dispatcher│
│  (Updated for    │
│   .NET routing)  │
└────────┬─────────┘
         │
┌────────▼─────────┐
│ DotNetDebugger   │
│   Instance       │
└──────────────────┘
```

## Implementation Details

### 1. Language Dispatcher Updates (`src/core/language-dispatcher.ts`)

Replace the placeholder methods (lines 848-850, 2708-2709) with actual implementations:

```typescript
// Update the imports section
import { DotNetDebugger } from '../dotnet/dotnet-debugger.js';
import { AspNetCoreDebugger } from '../dotnet/aspnet-debugger.js';
import { BlazorDebugger } from '../dotnet/blazor-debugger.js';

// Update the connectToDotNet method (line 848)
private async connectToDotNet(options: any): Promise<any> {
  const { host = 'localhost', port = 4711, framework, projectPath } = options;
  
  this.logger.info('Connecting to .NET debugger', { host, port, framework });
  
  let debugger: DotNetDebugger;
  
  // Detect framework and instantiate appropriate debugger
  if (framework === 'aspnetcore' || await this.isAspNetCore(projectPath)) {
    debugger = new AspNetCoreDebugger({
      host,
      port,
      projectPath,
      enableHotReload: true,
      inspectMiddleware: true,
      trackRequests: true
    });
  } else if (framework === 'blazor' || await this.isBlazor(projectPath)) {
    const mode = await this.detectBlazorMode(projectPath);
    debugger = new BlazorDebugger({
      host,
      port,
      projectPath,
      mode,
      browserDebugging: mode === 'WebAssembly',
      jsInteropTracking: true
    });
  } else {
    // Default to base .NET debugger
    debugger = new DotNetDebugger({
      host,
      port,
      projectPath,
      adapter: 'auto',
      enableHotReload: true
    });
  }
  
  // Connect to the debugger
  const connectionResult = await debugger.connect();
  
  if (connectionResult.success) {
    // Store the debugger instance
    const session: LanguageDebugSession = {
      sessionId: connectionResult.sessionId,
      language: 'dotnet',
      framework: framework || 'dotnet',
      debugger,
      metadata: {
        connectionInfo: connectionResult.connectionInfo,
        projectPath,
        framework
      }
    };
    
    this.sessions.set(connectionResult.sessionId, session);
    this.debuggers.set('dotnet', debugger);
    
    return {
      sessionId: connectionResult.sessionId,
      connection: connectionResult.connectionInfo,
      capabilities: await this.getDotNetCapabilities(debugger)
    };
  }
  
  throw new Error('Failed to connect to .NET debugger');
}

// Update the executeDotNetOperation method (line 2708)
private async executeDotNetOperation(
  session: LanguageDebugSession,
  operation: string,
  params: any
): Promise<any> {
  const debugger = session.debugger as DotNetDebugger;
  
  switch (operation) {
    case 'setBreakpoint':
      return await debugger.setBreakpoint(
        params.file,
        params.line,
        params.condition
      );
      
    case 'removeBreakpoint':
      return await debugger.removeBreakpoint(params.breakpointId);
      
    case 'continue':
      return await debugger.continue(params.threadId);
      
    case 'stepOver':
      return await debugger.stepOver(params.threadId);
      
    case 'stepIn':
      return await debugger.stepIn(params.threadId);
      
    case 'stepOut':
      return await debugger.stepOut(params.threadId);
      
    case 'getThreads':
      return await debugger.getThreads();
      
    case 'getStackTrace':
      return await debugger.getStackTrace(params.threadId);
      
    case 'getVariables':
      return await debugger.getVariables(params.variablesReference);
      
    case 'evaluate':
      return await debugger.evaluate(params.expression, params.frameId);
      
    // Framework-specific operations
    case 'inspectMiddleware':
      if (debugger instanceof AspNetCoreDebugger) {
        return await debugger.inspectMiddlewarePipeline();
      }
      break;
      
    case 'inspectComponents':
      if (debugger instanceof BlazorDebugger) {
        return await debugger.getComponentTree();
      }
      break;
      
    case 'inspectDbContext':
      return await this.inspectEntityFramework(debugger, params);
      
    case 'enableHotReload':
      return await debugger.enableHotReload();
      
    default:
      throw new Error(`Unsupported .NET operation: ${operation}`);
  }
}

// Add helper methods
private async isAspNetCore(projectPath?: string): Promise<boolean> {
  if (!projectPath) return false;
  
  const csprojPath = await this.findProjectFile(projectPath);
  if (!csprojPath) return false;
  
  const content = await fs.readFile(csprojPath, 'utf-8');
  return content.includes('<Project Sdk="Microsoft.NET.Sdk.Web">') ||
         content.includes('Microsoft.AspNetCore');
}

private async isBlazor(projectPath?: string): Promise<boolean> {
  if (!projectPath) return false;
  
  const csprojPath = await this.findProjectFile(projectPath);
  if (!csprojPath) return false;
  
  const content = await fs.readFile(csprojPath, 'utf-8');
  return content.includes('Microsoft.AspNetCore.Components') ||
         content.includes('<Project Sdk="Microsoft.NET.Sdk.BlazorWebAssembly">');
}

private async detectBlazorMode(projectPath: string): Promise<'Server' | 'WebAssembly'> {
  const csprojPath = await this.findProjectFile(projectPath);
  if (!csprojPath) return 'Server';
  
  const content = await fs.readFile(csprojPath, 'utf-8');
  return content.includes('BlazorWebAssembly') ? 'WebAssembly' : 'Server';
}

private async getDotNetCapabilities(debugger: DotNetDebugger): Promise<any> {
  return {
    supportsConditionalBreakpoints: true,
    supportsHitConditionalBreakpoints: true,
    supportsFunctionBreakpoints: true,
    supportsExceptionBreakpoints: true,
    supportsStepBack: false,
    supportsSetVariable: true,
    supportsRestartFrame: false,
    supportsGotoTargetsRequest: false,
    supportsStepInTargetsRequest: true,
    supportsCompletionsRequest: true,
    supportsModulesRequest: true,
    supportsValueFormattingOptions: true,
    supportsHotReload: true,
    frameworkSpecific: debugger instanceof AspNetCoreDebugger ? {
      middleware: true,
      routing: true,
      dependencyInjection: true
    } : debugger instanceof BlazorDebugger ? {
      components: true,
      renderTree: true,
      jsInterop: true
    } : {}
  };
}
```

### 2. MCP Tools Implementation (`src/mcp-stdio.ts`)

Add .NET-specific tools after line 349:

```typescript
// .NET/C# Specific Tools
{ 
  name: 'debug_setDotNetBreakpoint',
  description: 'Set breakpoint in .NET/C# file',
  inputSchema: {
    type: 'object',
    properties: {
      sessionId: { type: 'string' },
      file: { type: 'string' },
      line: { type: 'number' },
      column: { type: 'number' },
      condition: { type: 'string' },
      hitCondition: { type: 'string' },
      logMessage: { type: 'string' }
    },
    required: ['sessionId', 'file', 'line']
  }
},
{
  name: 'debug_getDotNetThreads',
  description: 'Get .NET application threads',
  inputSchema: {
    type: 'object',
    properties: {
      sessionId: { type: 'string' }
    },
    required: ['sessionId']
  }
},
{
  name: 'debug_getDotNetStackTrace',
  description: 'Get .NET stack trace for thread',
  inputSchema: {
    type: 'object',
    properties: {
      sessionId: { type: 'string' },
      threadId: { type: 'number' },
      includeAsync: { type: 'boolean' }
    },
    required: ['sessionId']
  }
},
{
  name: 'debug_evaluateDotNetExpression',
  description: 'Evaluate C# expression in debug context',
  inputSchema: {
    type: 'object',
    properties: {
      sessionId: { type: 'string' },
      expression: { type: 'string' },
      frameId: { type: 'number' },
      format: { type: 'string', enum: ['json', 'string', 'xml'] }
    },
    required: ['sessionId', 'expression']
  }
},
{
  name: 'debug_getDotNetPerformanceMetrics',
  description: 'Get .NET application performance metrics (GC, memory, JIT)',
  inputSchema: {
    type: 'object',
    properties: {
      sessionId: { type: 'string' },
      metricsType: { type: 'string', enum: ['general', 'memory', 'gc', 'jit', 'threads'] }
    },
    required: ['sessionId']
  }
},

// ASP.NET Core Specific Tools
{
  name: 'debug_getAspNetCoreInfo',
  description: 'Get ASP.NET Core application information (middleware, routing, DI)',
  inputSchema: {
    type: 'object',
    properties: {
      sessionId: { type: 'string' },
      infoType: { type: 'string', enum: ['middleware', 'routing', 'services', 'configuration'] }
    },
    required: ['sessionId']
  }
},
{
  name: 'debug_inspectHttpContext',
  description: 'Inspect current HTTP context in ASP.NET Core',
  inputSchema: {
    type: 'object',
    properties: {
      sessionId: { type: 'string' },
      includeHeaders: { type: 'boolean' },
      includeSession: { type: 'boolean' },
      includeUser: { type: 'boolean' }
    },
    required: ['sessionId']
  }
},
{
  name: 'debug_trackAspNetCoreRequests',
  description: 'Track HTTP requests in ASP.NET Core application',
  inputSchema: {
    type: 'object',
    properties: {
      sessionId: { type: 'string' },
      enable: { type: 'boolean' },
      breakOnRequest: { type: 'boolean' },
      filter: { type: 'string' }
    },
    required: ['sessionId', 'enable']
  }
},

// Blazor Specific Tools
{
  name: 'debug_getBlazorComponents',
  description: 'Get Blazor component tree and state',
  inputSchema: {
    type: 'object',
    properties: {
      sessionId: { type: 'string' },
      componentId: { type: 'string' },
      includeState: { type: 'boolean' },
      includeParameters: { type: 'boolean' }
    },
    required: ['sessionId']
  }
},
{
  name: 'debug_inspectBlazorRenderTree',
  description: 'Inspect Blazor render tree',
  inputSchema: {
    type: 'object',
    properties: {
      sessionId: { type: 'string' },
      componentId: { type: 'string' }
    },
    required: ['sessionId']
  }
},
{
  name: 'debug_trackBlazorJsInterop',
  description: 'Track JavaScript interop calls in Blazor',
  inputSchema: {
    type: 'object',
    properties: {
      sessionId: { type: 'string' },
      enable: { type: 'boolean' }
    },
    required: ['sessionId', 'enable']
  }
},

// Entity Framework Core Tools
{
  name: 'debug_analyzeEntityFrameworkQueries',
  description: 'Analyze Entity Framework Core queries and performance',
  inputSchema: {
    type: 'object',
    properties: {
      sessionId: { type: 'string' },
      includeSQL: { type: 'boolean' },
      includeExecutionPlan: { type: 'boolean' }
    },
    required: ['sessionId']
  }
},
{
  name: 'debug_inspectDbContext',
  description: 'Inspect Entity Framework DbContext state and change tracker',
  inputSchema: {
    type: 'object',
    properties: {
      sessionId: { type: 'string' },
      contextName: { type: 'string' },
      includeChangeTracker: { type: 'boolean' },
      includeModel: { type: 'boolean' }
    },
    required: ['sessionId']
  }
},

// .NET Hot Reload
{
  name: 'debug_enableDotNetHotReload',
  description: 'Enable .NET Hot Reload for live code changes',
  inputSchema: {
    type: 'object',
    properties: {
      sessionId: { type: 'string' },
      enable: { type: 'boolean' }
    },
    required: ['sessionId', 'enable']
  }
},
{
  name: 'debug_applyDotNetCodeChanges',
  description: 'Apply hot reload code changes to running .NET application',
  inputSchema: {
    type: 'object',
    properties: {
      sessionId: { type: 'string' },
      changes: { type: 'array', items: { type: 'object' } }
    },
    required: ['sessionId', 'changes']
  }
}
```

### 3. Tool Handlers Implementation

Add handlers for the .NET-specific tools:

```typescript
// In the toolHandlers object, add:

async debug_setDotNetBreakpoint(args: any) {
  const { sessionId, file, line, column, condition, hitCondition, logMessage } = args;
  
  const session = sessionManager.getSession(sessionId);
  if (!session || !['csharp', 'dotnet'].includes(session.language)) {
    throw new Error('Invalid .NET debug session');
  }
  
  const result = await languageDispatcher.executeOperation(sessionId, 'setBreakpoint', {
    file,
    line,
    column,
    condition,
    hitCondition,
    logMessage
  });
  
  return {
    content: [{
      type: 'text',
      text: `Breakpoint set in ${file}:${line}\nID: ${result.id}\nVerified: ${result.verified}`
    }]
  };
},

async debug_getDotNetThreads(args: any) {
  const { sessionId } = args;
  
  const session = sessionManager.getSession(sessionId);
  if (!session || !['csharp', 'dotnet'].includes(session.language)) {
    throw new Error('Invalid .NET debug session');
  }
  
  const threads = await languageDispatcher.executeOperation(sessionId, 'getThreads', {});
  
  return {
    content: [{
      type: 'text',
      text: `Found ${threads.length} threads:\n${threads.map((t: any) => 
        `Thread ${t.id}: ${t.name} (${t.state})`
      ).join('\n')}`
    }]
  };
},

async debug_getDotNetStackTrace(args: any) {
  const { sessionId, threadId, includeAsync } = args;
  
  const session = sessionManager.getSession(sessionId);
  if (!session || !['csharp', 'dotnet'].includes(session.language)) {
    throw new Error('Invalid .NET debug session');
  }
  
  const stackTrace = await languageDispatcher.executeOperation(sessionId, 'getStackTrace', {
    threadId: threadId || 1,
    includeAsync
  });
  
  return {
    content: [{
      type: 'text',
      text: formatStackTrace(stackTrace)
    }]
  };
},

async debug_evaluateDotNetExpression(args: any) {
  const { sessionId, expression, frameId, format } = args;
  
  const session = sessionManager.getSession(sessionId);
  if (!session || !['csharp', 'dotnet'].includes(session.language)) {
    throw new Error('Invalid .NET debug session');
  }
  
  const result = await languageDispatcher.executeOperation(sessionId, 'evaluate', {
    expression,
    frameId,
    format: format || 'string'
  });
  
  return {
    content: [{
      type: 'text',
      text: `Expression: ${expression}\nResult: ${formatEvaluationResult(result, format)}`
    }]
  };
},

async debug_getAspNetCoreInfo(args: any) {
  const { sessionId, infoType } = args;
  
  const session = sessionManager.getSession(sessionId);
  if (!session || session.framework !== 'aspnetcore') {
    throw new Error('Not an ASP.NET Core debug session');
  }
  
  let result;
  switch (infoType) {
    case 'middleware':
      result = await languageDispatcher.executeOperation(sessionId, 'inspectMiddleware', {});
      break;
    case 'routing':
      result = await languageDispatcher.executeOperation(sessionId, 'inspectRouting', {});
      break;
    case 'services':
      result = await languageDispatcher.executeOperation(sessionId, 'inspectServices', {});
      break;
    case 'configuration':
      result = await languageDispatcher.executeOperation(sessionId, 'inspectConfiguration', {});
      break;
  }
  
  return {
    content: [{
      type: 'text',
      text: formatAspNetCoreInfo(infoType, result)
    }]
  };
}

// Continue with other handlers...
```

### 4. Project Detection (`src/dotnet/project-analyzer.ts`)

```typescript
import { readFile, readdir } from 'fs/promises';
import { join, basename } from 'path';
import { XMLParser } from 'fast-xml-parser';

export interface DotNetProject {
  name: string;
  projectFile: string;
  targetFramework: string;
  outputType: string;
  isWebProject: boolean;
  isBlazorProject: boolean;
  packages: PackageReference[];
  launchProfiles?: LaunchProfile[];
}

export interface PackageReference {
  name: string;
  version: string;
}

export interface LaunchProfile {
  name: string;
  commandName: string;
  launchBrowser?: boolean;
  applicationUrl?: string;
  environmentVariables?: Record<string, string>;
}

export class ProjectAnalyzer {
  private xmlParser: XMLParser;

  constructor() {
    this.xmlParser = new XMLParser({
      ignoreAttributes: false,
      attributeNamePrefix: '@_'
    });
  }

  async analyzeProject(projectPath: string): Promise<DotNetProject> {
    const csprojFile = await this.findProjectFile(projectPath);
    if (!csprojFile) {
      throw new Error('No .csproj file found');
    }

    const content = await readFile(csprojFile, 'utf-8');
    const parsed = this.xmlParser.parse(content);
    const project = parsed.Project;

    const targetFramework = this.extractTargetFramework(project);
    const outputType = project.PropertyGroup?.OutputType || 'Library';
    const packages = this.extractPackages(project);
    const isWebProject = this.isWebProject(project, packages);
    const isBlazorProject = this.isBlazorProject(packages);

    // Try to load launch profiles
    const launchProfiles = await this.loadLaunchProfiles(projectPath);

    return {
      name: basename(csprojFile, '.csproj'),
      projectFile: csprojFile,
      targetFramework,
      outputType,
      isWebProject,
      isBlazorProject,
      packages,
      launchProfiles
    };
  }

  private async findProjectFile(projectPath: string): Promise<string | null> {
    const files = await readdir(projectPath);
    const csprojFile = files.find(f => f.endsWith('.csproj'));
    
    if (csprojFile) {
      return join(projectPath, csprojFile);
    }
    
    return null;
  }

  private extractTargetFramework(project: any): string {
    const propertyGroup = project.PropertyGroup;
    
    if (Array.isArray(propertyGroup)) {
      for (const pg of propertyGroup) {
        if (pg.TargetFramework) return pg.TargetFramework;
        if (pg.TargetFrameworks) return pg.TargetFrameworks.split(';')[0];
      }
    } else if (propertyGroup) {
      if (propertyGroup.TargetFramework) return propertyGroup.TargetFramework;
      if (propertyGroup.TargetFrameworks) return propertyGroup.TargetFrameworks.split(';')[0];
    }
    
    return 'net6.0'; // Default
  }

  private extractPackages(project: any): PackageReference[] {
    const packages: PackageReference[] = [];
    const itemGroups = Array.isArray(project.ItemGroup) ? project.ItemGroup : [project.ItemGroup];
    
    for (const itemGroup of itemGroups) {
      if (!itemGroup) continue;
      
      const packageRefs = Array.isArray(itemGroup.PackageReference) 
        ? itemGroup.PackageReference 
        : [itemGroup.PackageReference];
      
      for (const ref of packageRefs) {
        if (!ref) continue;
        
        packages.push({
          name: ref['@_Include'] || '',
          version: ref['@_Version'] || ref.Version || 'latest'
        });
      }
    }
    
    return packages;
  }

  private isWebProject(project: any, packages: PackageReference[]): boolean {
    // Check SDK
    if (project['@_Sdk']?.includes('Web')) return true;
    
    // Check packages
    return packages.some(p => 
      p.name.startsWith('Microsoft.AspNetCore') ||
      p.name === 'Microsoft.NET.Sdk.Web'
    );
  }

  private isBlazorProject(packages: PackageReference[]): boolean {
    return packages.some(p => 
      p.name.includes('Blazor') ||
      p.name.includes('Components.WebAssembly')
    );
  }

  private async loadLaunchProfiles(projectPath: string): Promise<LaunchProfile[]> {
    try {
      const launchSettingsPath = join(projectPath, 'Properties', 'launchSettings.json');
      const content = await readFile(launchSettingsPath, 'utf-8');
      const settings = JSON.parse(content);
      
      const profiles: LaunchProfile[] = [];
      
      for (const [name, profile] of Object.entries(settings.profiles || {})) {
        profiles.push({
          name,
          commandName: (profile as any).commandName,
          launchBrowser: (profile as any).launchBrowser,
          applicationUrl: (profile as any).applicationUrl,
          environmentVariables: (profile as any).environmentVariables
        });
      }
      
      return profiles;
    } catch {
      return [];
    }
  }
}
```

## Error Handling and Recovery

### 1. Connection Error Recovery

```typescript
class ConnectionErrorHandler {
  async handleConnectionError(error: Error, config: DotNetDebuggerConfig): Promise<void> {
    if (error.message.includes('vsdbg not found')) {
      // Try to download vsdbg
      await this.downloadVsDbg();
      
      // If that fails, try netcoredbg
      if (!await this.tryNetCoreDbg(config)) {
        throw new Error('No .NET debugger available. Please install vsdbg or netcoredbg.');
      }
    } else if (error.message.includes('port in use')) {
      // Suggest alternative port
      const alternativePort = await this.findFreePort(config.port);
      throw new Error(`Port ${config.port} is in use. Try port ${alternativePort}.`);
    } else if (error.message.includes('timeout')) {
      // Increase timeout and retry
      config.timeout = (config.timeout || 30000) * 2;
      throw new Error('Connection timeout. Retrying with increased timeout.');
    }
  }
}
```

### 2. Adapter Fallback Strategy

```typescript
class AdapterFallback {
  async selectAdapter(preferred: string): Promise<string> {
    const adapters = ['vsdbg', 'netcoredbg'];
    
    for (const adapter of adapters) {
      if (await this.isAdapterAvailable(adapter)) {
        if (adapter !== preferred) {
          console.warn(`Preferred adapter ${preferred} not available, using ${adapter}`);
        }
        return adapter;
      }
    }
    
    throw new Error('No .NET debug adapter available');
  }
}
```

## Testing Requirements

### Integration Tests
- Test language dispatcher routing
- Test MCP tool handlers
- Test project detection
- Test error recovery

### End-to-End Tests
- Complete debugging session via MCP
- Framework detection and routing
- Multi-session management

## Success Metrics

- [ ] Language dispatcher routes .NET requests correctly
- [ ] All MCP tools functional
- [ ] Project detection accurate
- [ ] Error handling robust
- [ ] Integration tests passing

## Next Steps

After completing Phase 3:
- Proceed to [Phase 4: Testing & Documentation](./phase4-testing-documentation.md)
- Begin user acceptance testing
- Prepare for release

---

*Document Version: 1.0*  
*Last Updated: 2025-08-29*  
*Status: Draft*