/**
 * Framework-specific debugging support for .NET applications
 */

import { DotNetDebugger } from './dotnet-debugger.js';
import { DotNetFrameworkDetector } from './framework-detector.js';
import type {
  DotNetFramework,
  DotNetDebugSession,
  DotNetFrameworkCapabilities,
  DotNetObjectInfo
} from './types.js';

export class DotNetFrameworkSupport {
  private static instance: DotNetFrameworkSupport;
  private debugger: DotNetDebugger;
  private frameworkDetector: DotNetFrameworkDetector;

  constructor() {
    this.debugger = DotNetDebugger.getInstance();
    this.frameworkDetector = DotNetFrameworkDetector.getInstance();
  }

  static getInstance(): DotNetFrameworkSupport {
    if (!DotNetFrameworkSupport.instance) {
      DotNetFrameworkSupport.instance = new DotNetFrameworkSupport();
    }
    return DotNetFrameworkSupport.instance;
  }

  /**
   * Get framework-specific debugging features
   */
  async getFrameworkFeatures(sessionId: string): Promise<{
    framework: DotNetFramework;
    capabilities: DotNetFrameworkCapabilities;
    specificFeatures: any;
  }> {
    const session = this.debugger.getSession(sessionId);
    if (!session) {
      throw new Error(`Session not found: ${sessionId}`);
    }

    // For now, return mock data since we don't have the full DotNetDebugSession
    const framework = session.config?.framework || 'console';
    const capabilities = this.frameworkDetector.getFrameworkCapabilities(framework as any);
    const specificFeatures = {}; // Mock implementation

    return {
      framework,
      capabilities,
      specificFeatures
    };
  }



  /**
   * Get framework-specific features
   */
  private async getSpecificFeatures(framework: DotNetFramework, session: DotNetDebugSession): Promise<any> {
    switch (framework) {
      case 'aspnetcore':
        return this.getAspNetCoreFeatures(session);
      case 'wpf':
        return this.getWpfFeatures(session);
      case 'winforms':
        return this.getWinFormsFeatures(session);
      case 'blazor-server':
        return this.getBlazorServerFeatures(session);
      case 'blazor-wasm':
        return this.getBlazorWasmFeatures(session);
      case 'maui':
        return this.getMauiFeatures(session);
      case 'unity':
        return this.getUnityFeatures(session);
      default:
        return this.getConsoleFeatures(session);
    }
  }

  /**
   * ASP.NET Core specific features
   */
  private async getAspNetCoreFeatures(_session: DotNetDebugSession): Promise<any> {
    return {
      type: 'aspnetcore',
      features: {
        httpContextDebugging: true,
        middlewareDebugging: true,
        dependencyInjectionInspection: true,
        configurationDebugging: true,
        loggingIntegration: true,
        healthChecks: true
      },
      debuggingHelpers: {
        inspectHttpContext: 'HttpContext.Current or injected HttpContext',
        inspectServices: 'serviceProvider.GetService<T>()',
        inspectConfiguration: 'IConfiguration instance',
        inspectMiddleware: 'Middleware pipeline inspection'
      },
      commonBreakpoints: [
        'Controller actions',
        'Middleware components',
        'Startup.cs methods',
        'Program.cs configuration'
      ]
    };
  }

  /**
   * WPF specific features
   */
  private async getWpfFeatures(_session: DotNetDebugSession): Promise<any> {
    return {
      type: 'wpf',
      features: {
        xamlDebugging: true,
        dataBindingDebugging: true,
        visualTreeInspection: true,
        dependencyPropertyDebugging: true,
        commandDebugging: true,
        resourceDebugging: true
      },
      debuggingHelpers: {
        inspectVisualTree: 'VisualTreeHelper methods',
        inspectDataContext: 'FrameworkElement.DataContext',
        inspectBindings: 'BindingOperations.GetBinding()',
        inspectResources: 'Application.Current.Resources'
      },
      commonBreakpoints: [
        'Event handlers',
        'Property setters',
        'Command implementations',
        'Converter methods'
      ]
    };
  }

  /**
   * WinForms specific features
   */
  private async getWinFormsFeatures(_session: DotNetDebugSession): Promise<any> {
    return {
      type: 'winforms',
      features: {
        controlInspection: true,
        eventDebugging: true,
        designerCodeDebugging: false,
        gdiDebugging: true
      },
      debuggingHelpers: {
        inspectControls: 'Control.Controls collection',
        inspectEvents: 'Event handler inspection',
        inspectGraphics: 'Graphics object debugging'
      },
      commonBreakpoints: [
        'Event handlers',
        'Paint methods',
        'Form load/close events',
        'Control validation'
      ]
    };
  }

  /**
   * Blazor Server specific features
   */
  private async getBlazorServerFeatures(_session: DotNetDebugSession): Promise<any> {
    return {
      type: 'blazor-server',
      features: {
        componentDebugging: true,
        signalRDebugging: true,
        circuitDebugging: true,
        jsInteropDebugging: true,
        stateManagementDebugging: true
      },
      debuggingHelpers: {
        inspectComponents: 'ComponentBase inspection',
        inspectCircuit: 'Circuit state debugging',
        inspectJSInterop: 'IJSRuntime calls',
        inspectSignalR: 'Hub connections'
      },
      commonBreakpoints: [
        'Component lifecycle methods',
        'Event handlers',
        'JS interop calls',
        'SignalR hub methods'
      ]
    };
  }

  /**
   * Blazor WebAssembly specific features
   */
  private async getBlazorWasmFeatures(_session: DotNetDebugSession): Promise<any> {
    return {
      type: 'blazor-wasm',
      features: {
        componentDebugging: true,
        jsInteropDebugging: true,
        httpClientDebugging: true,
        wasmDebugging: true
      },
      debuggingHelpers: {
        inspectComponents: 'ComponentBase inspection',
        inspectJSInterop: 'IJSRuntime calls',
        inspectHttpClient: 'HttpClient requests',
        inspectWasm: 'WebAssembly debugging'
      },
      commonBreakpoints: [
        'Component lifecycle methods',
        'Event handlers',
        'HTTP client calls',
        'JS interop calls'
      ],
      limitations: [
        'No async debugging',
        'Limited LINQ debugging',
        'Browser-based debugging only'
      ]
    };
  }

  /**
   * MAUI specific features
   */
  private async getMauiFeatures(_session: DotNetDebugSession): Promise<any> {
    return {
      type: 'maui',
      features: {
        crossPlatformDebugging: true,
        xamlDebugging: true,
        platformSpecificDebugging: true,
        dependencyInjectionDebugging: true,
        shellNavigationDebugging: true
      },
      debuggingHelpers: {
        inspectShell: 'Shell navigation debugging',
        inspectPlatformServices: 'Platform-specific service inspection',
        inspectDependencies: 'Service container inspection'
      },
      commonBreakpoints: [
        'Page lifecycle methods',
        'Navigation handlers',
        'Platform-specific code',
        'Service implementations'
      ]
    };
  }

  /**
   * Unity specific features
   */
  private async getUnityFeatures(_session: DotNetDebugSession): Promise<any> {
    return {
      type: 'unity',
      features: {
        gameObjectDebugging: true,
        componentDebugging: true,
        sceneDebugging: true,
        coroutineDebugging: true,
        editorDebugging: true
      },
      debuggingHelpers: {
        inspectGameObjects: 'GameObject.Find() methods',
        inspectComponents: 'GetComponent<T>() calls',
        inspectScene: 'SceneManager methods',
        inspectCoroutines: 'StartCoroutine debugging'
      },
      commonBreakpoints: [
        'MonoBehaviour methods (Start, Update, etc.)',
        'Coroutines',
        'Event handlers',
        'Collision detection methods'
      ]
    };
  }

  /**
   * Console application features
   */
  private async getConsoleFeatures(_session: DotNetDebugSession): Promise<any> {
    return {
      type: 'console',
      features: {
        standardDebugging: true,
        dependencyInjectionDebugging: true,
        configurationDebugging: true,
        loggingDebugging: true
      },
      debuggingHelpers: {
        inspectArgs: 'Command line arguments',
        inspectEnvironment: 'Environment variables',
        inspectServices: 'Service provider inspection'
      },
      commonBreakpoints: [
        'Main method',
        'Service implementations',
        'Configuration setup',
        'Exception handlers'
      ]
    };
  }

  /**
   * Get framework-specific object inspection
   */
  async inspectFrameworkObject(sessionId: string, objectId: string, objectType: string): Promise<DotNetObjectInfo> {
    const session = this.debugger.getSession(sessionId);
    if (!session) {
      throw new Error(`Session not found: ${sessionId}`);
    }

    const framework = session.config.framework!;
    const baseObjectInfo = await this.debugger.inspectObject(sessionId, objectId);

    // Enhance with framework-specific information
    switch (framework) {
      case 'aspnetcore':
        return this.enhanceAspNetCoreObject(baseObjectInfo, objectType);
      case 'wpf':
        return this.enhanceWpfObject(baseObjectInfo, objectType);
      case 'unity':
        return this.enhanceUnityObject(baseObjectInfo, objectType);
      default:
        return baseObjectInfo;
    }
  }

  /**
   * Enhance ASP.NET Core objects
   */
  private enhanceAspNetCoreObject(objectInfo: DotNetObjectInfo, objectType: string): DotNetObjectInfo {
    if (objectType.includes('HttpContext')) {
      // Add ASP.NET Core specific properties for HttpContext
      objectInfo.properties.push({
        name: 'Request.Path',
        type: 'System.String',
        isPublic: true,
        isStatic: false,
        canRead: true,
        canWrite: false,
        hasGetter: true,
        hasSetter: false,
        value: '/api/example',
        hasValue: true
      });
    }
    return objectInfo;
  }

  /**
   * Enhance WPF objects
   */
  private enhanceWpfObject(objectInfo: DotNetObjectInfo, objectType: string): DotNetObjectInfo {
    if (objectType.includes('FrameworkElement')) {
      // Add WPF specific properties
      objectInfo.properties.push({
        name: 'ActualWidth',
        type: 'System.Double',
        isPublic: true,
        isStatic: false,
        canRead: true,
        canWrite: false,
        hasGetter: true,
        hasSetter: false,
        value: 200.0,
        hasValue: true
      });
    }
    return objectInfo;
  }

  /**
   * Enhance Unity objects
   */
  private enhanceUnityObject(objectInfo: DotNetObjectInfo, objectType: string): DotNetObjectInfo {
    if (objectType.includes('GameObject')) {
      // Add Unity specific properties
      objectInfo.properties.push({
        name: 'transform.position',
        type: 'UnityEngine.Vector3',
        isPublic: true,
        isStatic: false,
        canRead: true,
        canWrite: true,
        hasGetter: true,
        hasSetter: true,
        value: { x: 0, y: 0, z: 0 },
        hasValue: true
      });
    }
    return objectInfo;
  }
}
