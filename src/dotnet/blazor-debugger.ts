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
  private jsInteropCalls: any[] = [];
  private blazorConfig: BlazorConfig;

  constructor(config: BlazorConfig, logger: any) {
    super(config, logger);
    this.blazorConfig = config;
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

  async setComponentBreakpoint(componentType: string, _lifecycle: string): Promise<void> {
    // Set breakpoint on component lifecycle method
    await this.setBreakpoint(
      componentType,
      -1 // Function breakpoint
    );
  }

  async inspectStateHasChanged(componentId: string): Promise<void> {
    // Track when StateHasChanged is called
    const expression = `
      component.StateHasChanged += () => Console.WriteLine($"StateHasChanged: ${componentId}")
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
    if (this.blazorConfig.mode === 'Server') {
      const expression = `
        circuitHost.Circuit.Connections.First()
      `;
      
      return await this.evaluate(expression);
    }
    return null;
  }

  async getCircuitInfo(): Promise<any> {
    // Get Blazor Server circuit information
    if (this.blazorConfig.mode === 'Server') {
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

  private parseComponentTree(_result: any): ComponentInfo[] {
    // Parse component tree from evaluation result
    return [];
  }

  private parseComponentInfo(_result: any): ComponentInfo {
    // Parse component info from evaluation result
    return {} as ComponentInfo;
  }

  private parseRenderTree(_result: any): RenderTreeItem[] {
    // Parse render tree from evaluation result
    return [];
  }

  private parseJsInteropCalls(_result: any): any[] {
    // Parse JS interop calls from evaluation result
    return [];
  }
}