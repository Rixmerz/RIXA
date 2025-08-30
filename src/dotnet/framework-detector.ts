/**
 * .NET Framework Detection Utilities
 */

import { existsSync, readFileSync, readdirSync } from 'fs';
import { join, extname } from 'path';
import type { 
  DotNetFramework, 
  DotNetFrameworkDetection, 
  DotNetFrameworkCapabilities,
  DotNetProcessInfo 
} from './types.js';

export class DotNetFrameworkDetector {
  private static instance: DotNetFrameworkDetector;
  private detectionCache = new Map<string, DotNetFrameworkDetection>();

  static getInstance(): DotNetFrameworkDetector {
    if (!DotNetFrameworkDetector.instance) {
      DotNetFrameworkDetector.instance = new DotNetFrameworkDetector();
    }
    return DotNetFrameworkDetector.instance;
  }

  /**
   * Detect framework from process information
   */
  async detectFramework(processInfo: Partial<DotNetProcessInfo>): Promise<DotNetFrameworkDetection> {
    const cacheKey = `${processInfo.pid}-${processInfo.name}-${processInfo.workingDirectory}`;
    
    if (this.detectionCache.has(cacheKey)) {
      return this.detectionCache.get(cacheKey)!;
    }

    const detectionMethods = [
      () => this.detectFromAssemblies(processInfo.assemblies || []),
      () => this.detectFromWorkingDirectory(processInfo.workingDirectory || ''),
      () => this.detectFromProcessName(processInfo.name || ''),
      () => this.detectFromCommandLine(processInfo.commandLine || '')
    ];

    let bestDetection: DotNetFrameworkDetection = {
      framework: 'console',
      version: '1.0.0',
      confidence: 0.1,
      indicators: ['fallback'],
      capabilities: this.getFrameworkCapabilities('console')
    };

    for (const method of detectionMethods) {
      try {
        const detection = await method();
        if (detection.confidence > bestDetection.confidence) {
          bestDetection = detection;
        }
      } catch (error) {
        // Continue to next method
      }
    }

    this.detectionCache.set(cacheKey, bestDetection);
    return bestDetection;
  }

  /**
   * Detect framework from loaded assemblies
   */
  private async detectFromAssemblies(assemblies: any[]): Promise<DotNetFrameworkDetection> {
    const indicators: string[] = [];
    let framework: DotNetFramework = 'console';
    let confidence = 0.1;
    let version = '1.0.0';

    // ASP.NET Core detection
    const aspNetCoreAssemblies = [
      'Microsoft.AspNetCore',
      'Microsoft.AspNetCore.Hosting',
      'Microsoft.AspNetCore.Mvc',
      'Microsoft.Extensions.Hosting'
    ];

    const foundAspNetCore = aspNetCoreAssemblies.some(name => 
      assemblies.some(asm => asm.name?.includes(name))
    );

    if (foundAspNetCore) {
      framework = 'aspnetcore';
      confidence = 0.9;
      indicators.push('ASP.NET Core assemblies detected');
      
      // Detect if it's Blazor
      const blazorAssemblies = ['Microsoft.AspNetCore.Blazor', 'Microsoft.AspNetCore.Components'];
      const foundBlazor = blazorAssemblies.some(name => 
        assemblies.some(asm => asm.name?.includes(name))
      );
      
      if (foundBlazor) {
        // Check for Blazor Server vs WebAssembly
        const blazorServerAssemblies = ['Microsoft.AspNetCore.Components.Server'];
        const blazorWasmAssemblies = ['Microsoft.AspNetCore.Components.WebAssembly'];
        
        if (blazorServerAssemblies.some(name => assemblies.some(asm => asm.name?.includes(name)))) {
          framework = 'blazor-server';
          indicators.push('Blazor Server assemblies detected');
        } else if (blazorWasmAssemblies.some(name => assemblies.some(asm => asm.name?.includes(name)))) {
          framework = 'blazor-wasm';
          indicators.push('Blazor WebAssembly assemblies detected');
        }
      }
    }

    // WPF detection
    const wpfAssemblies = [
      'PresentationFramework',
      'PresentationCore',
      'WindowsBase',
      'System.Windows.Forms'
    ];

    const foundWpf = wpfAssemblies.some(name => 
      assemblies.some(asm => asm.name?.includes(name))
    );

    if (foundWpf && confidence < 0.9) {
      framework = 'wpf';
      confidence = 0.85;
      indicators.push('WPF assemblies detected');
    }

    // WinForms detection
    const winFormsAssemblies = [
      'System.Windows.Forms',
      'System.Drawing'
    ];

    const foundWinForms = winFormsAssemblies.some(name => 
      assemblies.some(asm => asm.name?.includes(name))
    );

    if (foundWinForms && confidence < 0.85) {
      framework = 'winforms';
      confidence = 0.8;
      indicators.push('WinForms assemblies detected');
    }

    // MAUI detection
    const mauiAssemblies = [
      'Microsoft.Maui',
      'Microsoft.Maui.Controls',
      'Microsoft.Maui.Essentials'
    ];

    const foundMaui = mauiAssemblies.some(name => 
      assemblies.some(asm => asm.name?.includes(name))
    );

    if (foundMaui) {
      framework = 'maui';
      confidence = 0.95;
      indicators.push('MAUI assemblies detected');
    }

    // Unity detection
    const unityAssemblies = [
      'UnityEngine',
      'UnityEditor',
      'Assembly-CSharp'
    ];

    const foundUnity = unityAssemblies.some(name => 
      assemblies.some(asm => asm.name?.includes(name))
    );

    if (foundUnity) {
      framework = 'unity';
      confidence = 0.95;
      indicators.push('Unity assemblies detected');
    }

    return {
      framework,
      version,
      confidence,
      indicators,
      capabilities: this.getFrameworkCapabilities(framework)
    };
  }

  /**
   * Detect framework from working directory
   */
  private async detectFromWorkingDirectory(workingDir: string): Promise<DotNetFrameworkDetection> {
    if (!workingDir || !existsSync(workingDir)) {
      return {
        framework: 'console',
        version: '1.0.0',
        confidence: 0.0,
        indicators: [],
        capabilities: this.getFrameworkCapabilities('console')
      };
    }

    const indicators: string[] = [];
    let framework: DotNetFramework = 'console';
    let confidence = 0.1;
    let version = '1.0.0';

    try {
      // Check for project files
      const files = readdirSync(workingDir);
      
      // Look for specific project types
      const projectFiles = files.filter(f => ['.csproj', '.vbproj', '.fsproj'].includes(extname(f)));
      
      for (const projectFile of projectFiles) {
        const projectPath = join(workingDir, projectFile);
        const content = readFileSync(projectPath, 'utf-8');
        
        // ASP.NET Core detection
        if (content.includes('Microsoft.AspNetCore') || content.includes('Web.config')) {
          framework = 'aspnetcore';
          confidence = 0.8;
          indicators.push(`ASP.NET Core project file: ${projectFile}`);
          
          // Check for Blazor
          if (content.includes('Microsoft.AspNetCore.Blazor') || content.includes('Microsoft.AspNetCore.Components')) {
            if (content.includes('Components.Server')) {
              framework = 'blazor-server';
              indicators.push('Blazor Server project detected');
            } else if (content.includes('Components.WebAssembly')) {
              framework = 'blazor-wasm';
              indicators.push('Blazor WebAssembly project detected');
            }
          }
        }
        
        // WPF detection
        if (content.includes('UseWPF') || content.includes('PresentationFramework')) {
          framework = 'wpf';
          confidence = 0.85;
          indicators.push(`WPF project file: ${projectFile}`);
        }
        
        // WinForms detection
        if (content.includes('UseWindowsForms') || content.includes('System.Windows.Forms')) {
          framework = 'winforms';
          confidence = 0.8;
          indicators.push(`WinForms project file: ${projectFile}`);
        }
        
        // MAUI detection
        if (content.includes('Microsoft.Maui') || content.includes('UseMaui')) {
          framework = 'maui';
          confidence = 0.9;
          indicators.push(`MAUI project file: ${projectFile}`);
        }
      }

      // Check for Unity-specific files
      const unityFiles = ['Assets', 'ProjectSettings', 'Library'].filter(f => 
        existsSync(join(workingDir, f))
      );
      
      if (unityFiles.length >= 2) {
        framework = 'unity';
        confidence = 0.9;
        indicators.push(`Unity project structure detected: ${unityFiles.join(', ')}`);
      }

      // Check for web.config (ASP.NET Framework)
      if (existsSync(join(workingDir, 'web.config')) || existsSync(join(workingDir, 'Web.config'))) {
        if (framework === 'console') {
          framework = 'aspnetcore';
          confidence = 0.7;
          indicators.push('web.config detected');
        }
      }

      // Check for appsettings.json (ASP.NET Core)
      if (existsSync(join(workingDir, 'appsettings.json'))) {
        if (framework === 'console') {
          framework = 'aspnetcore';
          confidence = 0.6;
          indicators.push('appsettings.json detected');
        }
      }

    } catch (error) {
      // Directory read failed
    }

    return {
      framework,
      version,
      confidence,
      indicators,
      capabilities: this.getFrameworkCapabilities(framework)
    };
  }

  /**
   * Detect framework from process name
   */
  private async detectFromProcessName(processName: string): Promise<DotNetFrameworkDetection> {
    const processPatterns = [
      { pattern: /w3wp\.exe/i, framework: 'aspnetcore' as DotNetFramework, confidence: 0.7, indicator: 'IIS worker process' },
      { pattern: /iisexpress\.exe/i, framework: 'aspnetcore' as DotNetFramework, confidence: 0.7, indicator: 'IIS Express' },
      { pattern: /dotnet\.exe/i, framework: 'console' as DotNetFramework, confidence: 0.5, indicator: 'dotnet CLI process' },
      { pattern: /unity\.exe/i, framework: 'unity' as DotNetFramework, confidence: 0.9, indicator: 'Unity Editor' },
      { pattern: /unityplayer\.exe/i, framework: 'unity' as DotNetFramework, confidence: 0.9, indicator: 'Unity Player' }
    ];

    for (const { pattern, framework, confidence, indicator } of processPatterns) {
      if (pattern.test(processName)) {
        return {
          framework,
          version: '1.0.0',
          confidence,
          indicators: [indicator],
          capabilities: this.getFrameworkCapabilities(framework)
        };
      }
    }

    return {
      framework: 'console',
      version: '1.0.0',
      confidence: 0.1,
      indicators: ['unknown process name'],
      capabilities: this.getFrameworkCapabilities('console')
    };
  }

  /**
   * Detect framework from command line
   */
  private async detectFromCommandLine(commandLine: string): Promise<DotNetFrameworkDetection> {
    const indicators: string[] = [];
    let framework: DotNetFramework = 'console';
    let confidence = 0.1;

    // ASP.NET Core patterns
    if (commandLine.includes('Microsoft.AspNetCore') || commandLine.includes('Kestrel')) {
      framework = 'aspnetcore';
      confidence = 0.8;
      indicators.push('ASP.NET Core in command line');
    }

    // Unity patterns
    if (commandLine.includes('Unity.exe') || commandLine.includes('-projectPath')) {
      framework = 'unity';
      confidence = 0.9;
      indicators.push('Unity command line detected');
    }

    // IIS patterns
    if (commandLine.includes('w3wp.exe') || commandLine.includes('iisexpress.exe')) {
      framework = 'aspnetcore';
      confidence = 0.7;
      indicators.push('IIS process detected');
    }

    return {
      framework,
      version: '1.0.0',
      confidence,
      indicators,
      capabilities: this.getFrameworkCapabilities(framework)
    };
  }

  /**
   * Get framework capabilities
   */
  getFrameworkCapabilities(framework: DotNetFramework): DotNetFrameworkCapabilities {
    const capabilitiesMap: Record<DotNetFramework, DotNetFrameworkCapabilities> = {
      'aspnetcore': {
        supportsHotReload: true,
        supportsAsyncDebugging: true,
        supportsLinqDebugging: true,
        supportsRemoteDebugging: true,
        supportsAttachToProcess: true,
        supportedDebuggers: ['vsdbg', 'netcoredbg']
      },
      'wpf': {
        supportsHotReload: true,
        supportsAsyncDebugging: true,
        supportsLinqDebugging: true,
        supportsRemoteDebugging: false,
        supportsAttachToProcess: true,
        supportedDebuggers: ['vsdbg']
      },
      'winforms': {
        supportsHotReload: false,
        supportsAsyncDebugging: true,
        supportsLinqDebugging: true,
        supportsRemoteDebugging: false,
        supportsAttachToProcess: true,
        supportedDebuggers: ['vsdbg']
      },
      'blazor-server': {
        supportsHotReload: true,
        supportsAsyncDebugging: true,
        supportsLinqDebugging: true,
        supportsRemoteDebugging: true,
        supportsAttachToProcess: true,
        supportedDebuggers: ['vsdbg', 'netcoredbg']
      },
      'blazor-wasm': {
        supportsHotReload: true,
        supportsAsyncDebugging: false,
        supportsLinqDebugging: false,
        supportsRemoteDebugging: true,
        supportsAttachToProcess: false,
        supportedDebuggers: ['browser-debugger']
      },
      'maui': {
        supportsHotReload: true,
        supportsAsyncDebugging: true,
        supportsLinqDebugging: true,
        supportsRemoteDebugging: false,
        supportsAttachToProcess: true,
        supportedDebuggers: ['vsdbg']
      },
      'unity': {
        supportsHotReload: false,
        supportsAsyncDebugging: true,
        supportsLinqDebugging: true,
        supportsRemoteDebugging: true,
        supportsAttachToProcess: true,
        supportedDebuggers: ['unity-debugger', 'mono']
      },
      'console': {
        supportsHotReload: true,
        supportsAsyncDebugging: true,
        supportsLinqDebugging: true,
        supportsRemoteDebugging: true,
        supportsAttachToProcess: true,
        supportedDebuggers: ['vsdbg', 'netcoredbg']
      },
      'library': {
        supportsHotReload: false,
        supportsAsyncDebugging: true,
        supportsLinqDebugging: true,
        supportsRemoteDebugging: false,
        supportsAttachToProcess: false,
        supportedDebuggers: ['vsdbg', 'netcoredbg']
      }
    };

    return capabilitiesMap[framework];
  }

  /**
   * Get all supported frameworks
   */
  getSupportedFrameworks(): DotNetFramework[] {
    return ['aspnetcore', 'wpf', 'winforms', 'blazor-server', 'blazor-wasm', 'maui', 'unity', 'console', 'library'];
  }

  /**
   * Check if framework supports specific feature
   */
  supportsFeature(framework: DotNetFramework, feature: keyof DotNetFrameworkCapabilities): boolean {
    const capabilities = this.getFrameworkCapabilities(framework);
    return capabilities[feature] as boolean;
  }
}
