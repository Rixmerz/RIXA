/**
 * .NET Version Detection Utilities
 */

import { exec } from 'child_process';
import { promisify } from 'util';
import { existsSync, readFileSync } from 'fs';
import { join } from 'path';
import type { DotNetVersion, DotNetRuntime, DotNetProcessInfo } from './types.js';

const execAsync = promisify(exec);

export class DotNetVersionDetector {
  private static instance: DotNetVersionDetector;
  private versionCache = new Map<string, DotNetVersion>();
  private runtimeCache = new Map<string, DotNetRuntime>();

  static getInstance(): DotNetVersionDetector {
    if (!DotNetVersionDetector.instance) {
      DotNetVersionDetector.instance = new DotNetVersionDetector();
    }
    return DotNetVersionDetector.instance;
  }

  /**
   * Detect .NET version from process information
   */
  async detectVersionFromProcess(processInfo: Partial<DotNetProcessInfo>): Promise<{
    version: DotNetVersion;
    runtime: DotNetRuntime;
    confidence: number;
  }> {
    const cacheKey = `${processInfo.pid}-${processInfo.name}`;
    
    if (this.versionCache.has(cacheKey)) {
      return {
        version: this.versionCache.get(cacheKey)!,
        runtime: this.runtimeCache.get(cacheKey)!,
        confidence: 1.0
      };
    }

    // Try multiple detection methods
    const detectionMethods = [
      () => this.detectFromCommandLine(processInfo.commandLine || ''),
      () => this.detectFromWorkingDirectory(processInfo.workingDirectory || ''),
      () => this.detectFromProcessName(processInfo.name || ''),
      () => this.detectFromSystemInfo()
    ];

    for (const method of detectionMethods) {
      try {
        const result = await method();
        if (result.confidence > 0.7) {
          this.versionCache.set(cacheKey, result.version);
          this.runtimeCache.set(cacheKey, result.runtime);
          return result;
        }
      } catch (error) {
        // Continue to next method
      }
    }

    // Fallback to default
    return {
      version: 'net8.0',
      runtime: 'core',
      confidence: 0.1
    };
  }

  /**
   * Detect version from command line arguments
   */
  private async detectFromCommandLine(commandLine: string): Promise<{
    version: DotNetVersion;
    runtime: DotNetRuntime;
    confidence: number;
  }> {
    // Check for .NET Core/5+ patterns
    const corePatterns = [
      /dotnet.*--fx-version\s+(\d+\.\d+\.\d+)/,
      /dotnet.*--runtime-version\s+(\d+\.\d+\.\d+)/,
      /Microsoft\.NETCore\.App[\/\\](\d+\.\d+\.\d+)/,
      /net(\d+\.\d+)/
    ];

    for (const pattern of corePatterns) {
      const match = commandLine.match(pattern);
      if (match) {
        const versionStr = match[1];
        const version = this.parseVersionString(versionStr || '');
        return {
          version,
          runtime: version.startsWith('netframework') ? 'framework' : 'core',
          confidence: 0.9
        };
      }
    }

    // Check for .NET Framework patterns
    const frameworkPatterns = [
      /Microsoft\.NET[\/\\]Framework[\/\\]v(\d+\.\d+)/,
      /Framework64[\/\\]v(\d+\.\d+)/,
      /mscorlib.*Version=(\d+\.\d+)/
    ];

    for (const pattern of frameworkPatterns) {
      const match = commandLine.match(pattern);
      if (match) {
        const versionStr = match[1];
        const version = this.parseFrameworkVersion(versionStr || '');
        return {
          version,
          runtime: 'framework',
          confidence: 0.9
        };
      }
    }

    return { version: 'net8.0', runtime: 'core', confidence: 0.1 };
  }

  /**
   * Detect version from working directory (project files)
   */
  private async detectFromWorkingDirectory(workingDir: string): Promise<{
    version: DotNetVersion;
    runtime: DotNetRuntime;
    confidence: number;
  }> {
    if (!workingDir || !existsSync(workingDir)) {
      return { version: 'net8.0', runtime: 'core', confidence: 0.0 };
    }

    // Look for project files
    const projectFiles = [
      join(workingDir, '*.csproj'),
      join(workingDir, '*.vbproj'),
      join(workingDir, '*.fsproj'),
      join(workingDir, 'global.json'),
      join(workingDir, 'Directory.Build.props')
    ];

    for (const pattern of projectFiles) {
      try {
        const result = await this.analyzeProjectFile(pattern);
        if (result.confidence > 0.5) {
          return result;
        }
      } catch (error) {
        // Continue to next file
      }
    }

    return { version: 'net8.0', runtime: 'core', confidence: 0.1 };
  }

  /**
   * Analyze project file for version information
   */
  private async analyzeProjectFile(filePath: string): Promise<{
    version: DotNetVersion;
    runtime: DotNetRuntime;
    confidence: number;
  }> {
    if (!existsSync(filePath)) {
      return { version: 'net8.0', runtime: 'core', confidence: 0.0 };
    }

    const content = readFileSync(filePath, 'utf-8');

    // Check for TargetFramework
    const targetFrameworkMatch = content.match(/<TargetFramework[^>]*>([^<]+)<\/TargetFramework>/);
    if (targetFrameworkMatch) {
      const framework = targetFrameworkMatch[1]?.trim() || '';
      const version = this.parseTargetFramework(framework);
      const runtime = framework.startsWith('net4') ? 'framework' : 'core';
      return { version, runtime, confidence: 0.95 };
    }

    // Check for TargetFrameworks (multiple)
    const targetFrameworksMatch = content.match(/<TargetFrameworks[^>]*>([^<]+)<\/TargetFrameworks>/);
    if (targetFrameworksMatch) {
      const frameworks = targetFrameworksMatch[1]?.split(';').map(f => f.trim()) || [];
      // Use the highest version found
      const versions = frameworks.map(f => this.parseTargetFramework(f));
      const latestVersion = this.getLatestVersion(versions);
      const runtime = frameworks.some(f => f.startsWith('net4')) ? 'framework' : 'core';
      return { version: latestVersion, runtime, confidence: 0.9 };
    }

    // Check for RuntimeFrameworkVersion
    const runtimeVersionMatch = content.match(/<RuntimeFrameworkVersion[^>]*>([^<]+)<\/RuntimeFrameworkVersion>/);
    if (runtimeVersionMatch) {
      const versionStr = runtimeVersionMatch[1]?.trim() || '';
      const version = this.parseVersionString(versionStr);
      return { version, runtime: 'core', confidence: 0.8 };
    }

    return { version: 'net8.0', runtime: 'core', confidence: 0.1 };
  }

  /**
   * Detect version from process name
   */
  private async detectFromProcessName(processName: string): Promise<{
    version: DotNetVersion;
    runtime: DotNetRuntime;
    confidence: number;
  }> {
    const processPatterns = [
      { pattern: /dotnet\.exe/, version: 'net8.0' as DotNetVersion, runtime: 'core' as DotNetRuntime, confidence: 0.6 },
      { pattern: /w3wp\.exe/, version: 'netframework4.8' as DotNetVersion, runtime: 'framework' as DotNetRuntime, confidence: 0.7 },
      { pattern: /iisexpress\.exe/, version: 'netframework4.8' as DotNetVersion, runtime: 'framework' as DotNetRuntime, confidence: 0.7 },
      { pattern: /devenv\.exe/, version: 'netframework4.8' as DotNetVersion, runtime: 'framework' as DotNetRuntime, confidence: 0.5 }
    ];

    for (const { pattern, version, runtime, confidence } of processPatterns) {
      if (pattern.test(processName)) {
        return { version, runtime, confidence };
      }
    }

    return { version: 'net8.0', runtime: 'core', confidence: 0.1 };
  }

  /**
   * Detect version from system information
   */
  private async detectFromSystemInfo(): Promise<{
    version: DotNetVersion;
    runtime: DotNetRuntime;
    confidence: number;
  }> {
    try {
      // Try dotnet --version
      const { stdout } = await execAsync('dotnet --version');
      const versionStr = stdout.trim();
      const version = this.parseVersionString(versionStr);
      return { version, runtime: 'core', confidence: 0.8 };
    } catch (error) {
      // Fallback to checking registry or known paths
      return this.detectFromRegistry();
    }
  }

  /**
   * Detect from Windows registry (Windows only)
   */
  private async detectFromRegistry(): Promise<{
    version: DotNetVersion;
    runtime: DotNetRuntime;
    confidence: number;
  }> {
    if (process.platform !== 'win32') {
      return { version: 'net8.0', runtime: 'core', confidence: 0.1 };
    }

    try {
      // Check for .NET Framework versions
      const { stdout } = await execAsync('reg query "HKEY_LOCAL_MACHINE\\SOFTWARE\\Microsoft\\NET Framework Setup\\NDP" /s /v Release');
      const releases = stdout.match(/Release\s+REG_DWORD\s+0x([0-9a-fA-F]+)/g);
      
      if (releases && releases.length > 0) {
        const latestRelease = Math.max(...releases.map(r => parseInt(r.split('0x')[1] || '0', 16)));
        const version = this.mapReleaseToVersion(latestRelease);
        return { version, runtime: 'framework', confidence: 0.7 };
      }
    } catch (error) {
      // Registry query failed
    }

    return { version: 'net8.0', runtime: 'core', confidence: 0.1 };
  }

  /**
   * Parse version string to DotNetVersion
   */
  private parseVersionString(versionStr: string): DotNetVersion {
    const version = versionStr.split('.').slice(0, 2).join('.');
    
    const versionMap: Record<string, DotNetVersion> = {
      '3.1': 'netcore3.1',
      '5.0': 'net5.0',
      '6.0': 'net6.0',
      '7.0': 'net7.0',
      '8.0': 'net8.0',
      '9.0': 'net9.0'
    };

    return versionMap[version] || 'net8.0';
  }

  /**
   * Parse target framework to DotNetVersion
   */
  private parseTargetFramework(framework: string): DotNetVersion {
    const frameworkMap: Record<string, DotNetVersion> = {
      'net40': 'netframework4.0',
      'net45': 'netframework4.5',
      'net46': 'netframework4.6',
      'net47': 'netframework4.7',
      'net48': 'netframework4.8',
      'netcoreapp3.1': 'netcore3.1',
      'net5.0': 'net5.0',
      'net6.0': 'net6.0',
      'net7.0': 'net7.0',
      'net8.0': 'net8.0',
      'net9.0': 'net9.0'
    };

    return frameworkMap[framework] || 'net8.0';
  }

  /**
   * Parse .NET Framework version
   */
  private parseFrameworkVersion(versionStr: string): DotNetVersion {
    const versionMap: Record<string, DotNetVersion> = {
      '4.0': 'netframework4.0',
      '4.5': 'netframework4.5',
      '4.6': 'netframework4.6',
      '4.7': 'netframework4.7',
      '4.8': 'netframework4.8'
    };

    return versionMap[versionStr] || 'netframework4.8';
  }

  /**
   * Map .NET Framework release number to version
   */
  private mapReleaseToVersion(release: number): DotNetVersion {
    if (release >= 528040) return 'netframework4.8';
    if (release >= 461808) return 'netframework4.7';
    if (release >= 394802) return 'netframework4.6';
    if (release >= 378389) return 'netframework4.5';
    return 'netframework4.0';
  }

  /**
   * Get the latest version from a list
   */
  private getLatestVersion(versions: DotNetVersion[]): DotNetVersion {
    const versionOrder = [
      'netframework4.0', 'netframework4.5', 'netframework4.6', 'netframework4.7', 'netframework4.8',
      'netcore3.1', 'net5.0', 'net6.0', 'net7.0', 'net8.0', 'net9.0'
    ];

    return versions.reduce((latest, current) => {
      const latestIndex = versionOrder.indexOf(latest);
      const currentIndex = versionOrder.indexOf(current);
      return currentIndex > latestIndex ? current : latest;
    }, versions[0] || 'net8.0');
  }

  /**
   * Get all installed .NET versions
   */
  async getInstalledVersions(): Promise<{
    framework: DotNetVersion[];
    core: DotNetVersion[];
  }> {
    const result = { framework: [] as DotNetVersion[], core: [] as DotNetVersion[] };

    try {
      // Get .NET Core/5+ versions
      const { stdout: coreVersions } = await execAsync('dotnet --list-runtimes');
      const coreMatches = coreVersions.match(/Microsoft\.NETCore\.App (\d+\.\d+\.\d+)/g);
      if (coreMatches) {
        result.core = [...new Set(coreMatches.map(match => {
          const version = match.split(' ')[1];
          return this.parseVersionString(version || '');
        }))];
      }
    } catch (error) {
      // dotnet CLI not available
    }

    try {
      // Get .NET Framework versions (Windows only)
      if (process.platform === 'win32') {
        const frameworkVersions = await this.detectFromRegistry();
        if (frameworkVersions.runtime === 'framework') {
          result.framework.push(frameworkVersions.version);
        }
      }
    } catch (error) {
      // Registry query failed
    }

    return result;
  }
}
