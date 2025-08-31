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