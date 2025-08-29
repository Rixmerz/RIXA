# Phase 2: Framework-Specific Support

## Overview

This phase extends the core .NET debugging capabilities to support specific frameworks including ASP.NET Core, Blazor, Entity Framework Core, and other .NET ecosystem frameworks. This enables advanced debugging scenarios specific to web applications, component-based architectures, and data access layers.

## Objectives

- Implement ASP.NET Core debugging with middleware inspection
- Add Blazor WebAssembly and Server debugging support
- Enable Entity Framework Core query analysis
- Support dependency injection container debugging
- Implement Hot Reload functionality

## Framework Support Matrix

| Framework | Priority | Features | Complexity |
|-----------|----------|----------|------------|
| ASP.NET Core | High | Middleware, Routing, DI, Request/Response | Medium |
| Blazor Server | High | Components, State, SignalR | High |
| Blazor WebAssembly | Medium | Browser debugging, JS Interop | High |
| Entity Framework Core | High | Query inspection, Change tracking | Medium |
| Minimal APIs | Medium | Endpoint debugging | Low |
| gRPC Services | Low | Service debugging, Streaming | Medium |
| MAUI | Future | Mobile debugging | Very High |

## Implementation Details

### 1. ASP.NET Core Debugger (`aspnet-debugger.ts`)

```typescript
import { DotNetDebugger } from './dotnet-debugger.js';
import type { DotNetDebuggerConfig } from './types.js';

export interface AspNetCoreConfig extends DotNetDebuggerConfig {
  applicationUrl?: string;
  environment?: string;
  launchBrowser?: boolean;
  inspectMiddleware?: boolean;
  trackRequests?: boolean;
}

export interface HttpRequestInfo {
  id: string;
  method: string;
  path: string;
  queryString?: string;
  headers: Record<string, string>;
  body?: any;
  timestamp: Date;
  traceIdentifier: string;
}

export interface HttpResponseInfo {
  statusCode: number;
  headers: Record<string, string>;
  body?: any;
  duration: number;
}

export interface MiddlewareInfo {
  name: string;
  type: string;
  order: number;
  executionTime?: number;
  state?: any;
}

export interface EndpointInfo {
  pattern: string;
  httpMethods: string[];
  handler: string;
  metadata: Record<string, any>;
}

export class AspNetCoreDebugger extends DotNetDebugger {
  private activeRequests: Map<string, HttpRequestInfo> = new Map();
  private middlewarePipeline: MiddlewareInfo[] = [];
  private endpoints: EndpointInfo[] = [];
  private services: Map<string, any> = new Map();

  constructor(config: AspNetCoreConfig) {
    super(config);
    this.setupAspNetCoreHandlers();
  }

  private setupAspNetCoreHandlers(): void {
    // Set up event handlers for ASP.NET Core specific events
    this.on('middleware-executing', (middleware: MiddlewareInfo) => {
      this.trackMiddleware(middleware);
    });

    this.on('request-starting', (request: HttpRequestInfo) => {
      this.trackRequest(request);
    });

    this.on('response-completed', (response: HttpResponseInfo) => {
      this.completeRequest(response);
    });
  }

  async inspectMiddlewarePipeline(): Promise<MiddlewareInfo[]> {
    // Evaluate expression to get middleware pipeline
    const expression = `
      app.GetType()
        .GetField("_components", System.Reflection.BindingFlags.NonPublic | System.Reflection.BindingFlags.Instance)
        ?.GetValue(app) as List<Func<RequestDelegate, RequestDelegate>>
    `;
    
    const result = await this.evaluate(expression);
    return this.parseMiddlewarePipeline(result);
  }

  async inspectDependencyInjection(): Promise<Map<string, any>> {
    // Inspect the DI container
    const expression = `
      app.Services.GetType()
        .GetProperty("ServiceDescriptors")
        ?.GetValue(app.Services)
    `;
    
    const result = await this.evaluate(expression);
    return this.parseServices(result);
  }

  async inspectRouting(): Promise<EndpointInfo[]> {
    // Get routing information
    const expression = `
      app.Services.GetService<IEndpointRouteBuilder>()
        ?.DataSources
        .SelectMany(ds => ds.Endpoints)
    `;
    
    const result = await this.evaluate(expression);
    return this.parseEndpoints(result);
  }

  async trackHttpRequest(breakOnRequest: boolean = false): Promise<void> {
    // Set a breakpoint in the request pipeline
    if (breakOnRequest) {
      await this.setBreakpoint(
        'Microsoft.AspNetCore.Server.Kestrel.Core.Internal.Http.HttpProtocol',
        -1, // Function breakpoint
        'ProcessRequests'
      );
    }
  }

  async inspectHttpContext(): Promise<any> {
    // Get current HttpContext
    const expression = `
      System.Threading.Thread.CurrentThread
        .GetType()
        .GetProperty("ExecutionContext")
        ?.GetValue(System.Threading.Thread.CurrentThread)
        ?.GetType()
        .GetField("_localValues")
        ?.GetValue(...)
        ?.GetType()
        .GetMethod("TryGetValue")
        ?.Invoke(..., new object[] { "HttpContext" })
    `;
    
    return await this.evaluate(expression);
  }

  async getModelState(): Promise<any> {
    // Inspect ModelState for validation errors
    const expression = 'HttpContext.Items["__ModelState"]';
    return await this.evaluate(expression);
  }

  async inspectSession(): Promise<any> {
    // Get session data
    const expression = 'HttpContext.Session';
    return await this.evaluate(expression);
  }

  async inspectAuthentication(): Promise<any> {
    // Get authentication/authorization info
    const expression = `
      new {
        User = HttpContext.User,
        IsAuthenticated = HttpContext.User.Identity.IsAuthenticated,
        Claims = HttpContext.User.Claims.Select(c => new { c.Type, c.Value }),
        AuthenticationScheme = HttpContext.Authentication?.Scheme
      }
    `;
    
    return await this.evaluate(expression);
  }

  private trackMiddleware(middleware: MiddlewareInfo): void {
    this.middlewarePipeline.push(middleware);
    this.emit('middleware-tracked', middleware);
  }

  private trackRequest(request: HttpRequestInfo): void {
    this.activeRequests.set(request.id, request);
    this.emit('request-tracked', request);
  }

  private completeRequest(response: HttpResponseInfo): void {
    // Match response to request and emit completion event
    this.emit('request-completed', response);
  }

  private parseMiddlewarePipeline(result: any): MiddlewareInfo[] {
    // Parse the middleware pipeline from evaluation result
    return [];
  }

  private parseServices(result: any): Map<string, any> {
    // Parse DI services from evaluation result
    return new Map();
  }

  private parseEndpoints(result: any): EndpointInfo[] {
    // Parse endpoints from evaluation result
    return [];
  }
}
```

### 2. Blazor Debugger (`blazor-debugger.ts`)

```typescript
import { DotNetDebugger } from './dotnet-debugger.js';
import type { DotNetDebuggerConfig } from './types.js';

export interface BlazorConfig extends DotNetDebuggerConfig {
  mode: 'Server' | 'WebAssembly';
  browserDebugging?: boolean;
  jsInteropTracking?: boolean;
}

export interface ComponentInfo {
  id: string;
  type: string;
  state: Record<string, any>;
  parameters: Record<string, any>;
  renderCount: number;
  parentId?: string;
  children: string[];
}

export interface RenderTreeItem {
  sequence: number;
  type: 'component' | 'element' | 'text' | 'attribute';
  componentId?: number;
  elementName?: string;
  textContent?: string;
  attributeName?: string;
  attributeValue?: any;
}

export class BlazorDebugger extends DotNetDebugger {
  private components: Map<string, ComponentInfo> = new Map();
  private renderTree: RenderTreeItem[] = [];
  private jsInteropCalls: any[] = [];

  constructor(config: BlazorConfig) {
    super(config);
    this.setupBlazorHandlers();
  }

  private setupBlazorHandlers(): void {
    this.on('component-rendered', (component: ComponentInfo) => {
      this.trackComponent(component);
    });

    this.on('js-interop', (call: any) => {
      this.trackJsInterop(call);
    });
  }

  async getComponentTree(): Promise<ComponentInfo[]> {
    // Get the component hierarchy
    const expression = `
      typeof(Microsoft.AspNetCore.Components.RenderTree.Renderer)
        .GetField("_componentStateById", System.Reflection.BindingFlags.NonPublic | System.Reflection.BindingFlags.Instance)
        ?.GetValue(renderer)
    `;
    
    const result = await this.evaluate(expression);
    return this.parseComponentTree(result);
  }

  async inspectComponent(componentId: string): Promise<ComponentInfo> {
    // Get detailed component information
    const expression = `
      renderer.GetComponentState(${componentId})
    `;
    
    const result = await this.evaluate(expression);
    return this.parseComponentInfo(result);
  }

  async getRenderTree(): Promise<RenderTreeItem[]> {
    // Get the current render tree
    const expression = `
      typeof(Microsoft.AspNetCore.Components.RenderTree.Renderer)
        .GetMethod("GetCurrentRenderTree", System.Reflection.BindingFlags.NonPublic | System.Reflection.BindingFlags.Instance)
        ?.Invoke(renderer, null)
    `;
    
    const result = await this.evaluate(expression);
    return this.parseRenderTree(result);
  }

  async setComponentBreakpoint(componentType: string, lifecycle: string): Promise<void> {
    // Set breakpoint on component lifecycle method
    await this.setBreakpoint(
      componentType,
      -1,
      lifecycle // OnInitialized, OnParametersSet, OnAfterRender, etc.
    );
  }

  async inspectStateHasChanged(componentId: string): Promise<void> {
    // Track when StateHasChanged is called
    const expression = `
      component.StateHasChanged += () => Console.WriteLine($"StateHasChanged: {componentId}")
    `;
    
    await this.evaluate(expression);
  }

  async getJsInteropCalls(): Promise<any[]> {
    // Get JavaScript interop calls
    const expression = `
      typeof(Microsoft.JSInterop.JSRuntime)
        .GetField("_pendingTasks", System.Reflection.BindingFlags.NonPublic | System.Reflection.BindingFlags.Instance)
        ?.GetValue(jsRuntime)
    `;
    
    const result = await this.evaluate(expression);
    return this.parseJsInteropCalls(result);
  }

  async inspectSignalRConnection(): Promise<any> {
    // For Blazor Server, inspect SignalR connection
    if (this.config.mode === 'Server') {
      const expression = `
        circuitHost.Circuit.Connections.First()
      `;
      
      return await this.evaluate(expression);
    }
    return null;
  }

  async getCircuitInfo(): Promise<any> {
    // Get Blazor Server circuit information
    if (this.config.mode === 'Server') {
      const expression = `
        new {
          CircuitId = circuit.Id,
          IsConnected = circuit.IsConnected,
          ConnectionCount = circuit.Connections.Count,
          ComponentCount = circuit.Components.Count
        }
      `;
      
      return await this.evaluate(expression);
    }
    return null;
  }

  async inspectValidation(): Promise<any> {
    // Inspect form validation state
    const expression = `
      editContext.GetValidationMessages()
    `;
    
    return await this.evaluate(expression);
  }

  private trackComponent(component: ComponentInfo): void {
    this.components.set(component.id, component);
    this.emit('component-tracked', component);
  }

  private trackJsInterop(call: any): void {
    this.jsInteropCalls.push(call);
    this.emit('js-interop-tracked', call);
  }

  private parseComponentTree(result: any): ComponentInfo[] {
    // Parse component tree from evaluation result
    return [];
  }

  private parseComponentInfo(result: any): ComponentInfo {
    // Parse component info from evaluation result
    return {} as ComponentInfo;
  }

  private parseRenderTree(result: any): RenderTreeItem[] {
    // Parse render tree from evaluation result
    return [];
  }

  private parseJsInteropCalls(result: any): any[] {
    // Parse JS interop calls from evaluation result
    return [];
  }
}
```

### 3. Entity Framework Core Integration

```typescript
export interface EFCoreDebugger {
  async inspectDbContext(): Promise<any> {
    // Get DbContext information
    const expression = `
      dbContext.GetType()
        .GetProperties()
        .Where(p => p.PropertyType.IsGenericType && 
                   p.PropertyType.GetGenericTypeDefinition() == typeof(DbSet<>))
        .Select(p => new { 
          Name = p.Name, 
          EntityType = p.PropertyType.GetGenericArguments()[0].Name 
        })
    `;
    
    return await this.evaluate(expression);
  }

  async getChangeTracker(): Promise<any> {
    // Inspect change tracker
    const expression = `
      dbContext.ChangeTracker.Entries()
        .Select(e => new {
          Entity = e.Entity.GetType().Name,
          State = e.State.ToString(),
          OriginalValues = e.OriginalValues.Properties,
          CurrentValues = e.CurrentValues.Properties,
          ModifiedProperties = e.Properties.Where(p => p.IsModified).Select(p => p.Metadata.Name)
        })
    `;
    
    return await this.evaluate(expression);
  }

  async inspectQuery(queryable: string): Promise<any> {
    // Get generated SQL for a query
    const expression = `
      ${queryable}.ToQueryString()
    `;
    
    return await this.evaluate(expression);
  }

  async getExecutedQueries(): Promise<any> {
    // Get recently executed queries (requires logging enabled)
    const expression = `
      Microsoft.EntityFrameworkCore.Infrastructure.Internal.DiagnosticsLogger
        .GetExecutedCommands()
    `;
    
    return await this.evaluate(expression);
  }

  async inspectModelMetadata(): Promise<any> {
    // Get model metadata
    const expression = `
      dbContext.Model.GetEntityTypes()
        .Select(e => new {
          Name = e.Name,
          Properties = e.GetProperties().Select(p => new {
            Name = p.Name,
            Type = p.ClrType.Name,
            IsKey = p.IsKey(),
            IsForeignKey = p.IsForeignKey(),
            IsRequired = !p.IsNullable
          }),
          Relationships = e.GetNavigations().Select(n => new {
            Name = n.Name,
            TargetEntity = n.TargetEntityType.Name,
            IsCollection = n.IsCollection
          })
        })
    `;
    
    return await this.evaluate(expression);
  }
}
```

### 4. Hot Reload Support

```typescript
export interface HotReloadSupport {
  async enableHotReload(): Promise<void> {
    // Enable .NET Hot Reload
    const expression = `
      System.Environment.SetEnvironmentVariable("DOTNET_WATCH_RESTART_ON_RUDE_EDIT", "true");
      System.Environment.SetEnvironmentVariable("DOTNET_USE_POLLING_FILE_WATCHER", "true");
    `;
    
    await this.evaluate(expression);
  }

  async applyCodeChanges(changes: any[]): Promise<void> {
    // Apply hot reload changes
    const request = {
      command: 'hotReload',
      arguments: {
        changes: changes
      }
    };
    
    await this.dapClient.sendRequest(request.command, request.arguments);
  }

  async getHotReloadCapabilities(): Promise<any> {
    // Check what hot reload operations are supported
    const expression = `
      System.Reflection.Metadata.MetadataUpdater.GetCapabilities()
    `;
    
    return await this.evaluate(expression);
  }
}
```

## Implementation Steps

### Step 1: ASP.NET Core Support (Day 1-4)
1. Implement middleware inspection
2. Add request/response tracking
3. Implement DI container inspection
4. Add routing analysis
5. Test with sample ASP.NET Core app

### Step 2: Blazor Support (Day 5-8)
1. Implement component tree inspection
2. Add render tree analysis
3. Implement JS interop tracking
4. Add SignalR debugging (Server)
5. Test with Blazor Server and WebAssembly apps

### Step 3: Entity Framework Core (Day 9-10)
1. Implement DbContext inspection
2. Add change tracker analysis
3. Implement query inspection
4. Add model metadata viewing

### Step 4: Hot Reload (Day 11-12)
1. Implement hot reload detection
2. Add code change application
3. Test with various change types

### Step 5: Integration Testing (Day 13-14)
1. Test with real-world applications
2. Performance testing
3. Edge case handling
4. Documentation

## Testing Requirements

### ASP.NET Core Tests
- Middleware pipeline inspection
- Request/response tracking
- DI container inspection
- Authentication/authorization debugging
- Session and state management

### Blazor Tests
- Component lifecycle debugging
- State management inspection
- Render tree analysis
- JS interop tracking
- SignalR connection (Server)

### Entity Framework Tests
- Query inspection and SQL generation
- Change tracker analysis
- Migration debugging
- Performance analysis

## Success Metrics

- [ ] ASP.NET Core middleware inspection working
- [ ] Blazor component debugging functional
- [ ] EF Core query analysis operational
- [ ] Hot Reload support enabled
- [ ] All framework tests passing
- [ ] Documentation complete

## Known Challenges

1. **Browser Integration**: Blazor WebAssembly requires browser debugging coordination
2. **SignalR Complexity**: Real-time connection debugging is complex
3. **Performance Impact**: Framework inspection may impact app performance
4. **Version Differences**: Different .NET versions have different capabilities

## Next Steps

After completing Phase 2:
- Proceed to [Phase 3: Integration & MCP Tools](./phase3-integration-mcp.md)
- Begin performance optimization
- Create framework-specific guides

---

*Document Version: 1.0*  
*Last Updated: 2025-08-29*  
*Status: Draft*