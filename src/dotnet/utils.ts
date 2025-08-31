import { existsSync } from 'fs';
import { readdir, readFile } from 'fs/promises';
import { join, basename, dirname } from 'path';
import { platform } from 'os';
import type { ProjectInfo } from './types.js';

/**
 * Utility functions for .NET debugging
 */

/**
 * Detects if a directory contains a .NET project
 */
export function isDotNetProject(projectPath: string): boolean {
  if (!existsSync(projectPath)) {
    return false;
  }

  try {
    const files = require('fs').readdirSync(projectPath);
    return files.some((file: string) => 
      file.endsWith('.csproj') || 
      file.endsWith('.fsproj') || 
      file.endsWith('.vbproj') ||
      file.endsWith('.sln')
    );
  } catch {
    return false;
  }
}

/**
 * Finds .NET project files in a directory
 */
export async function findProjectFiles(projectPath: string): Promise<string[]> {
  if (!existsSync(projectPath)) {
    return [];
  }

  try {
    const files = await readdir(projectPath);
    return files
      .filter(file => 
        file.endsWith('.csproj') || 
        file.endsWith('.fsproj') || 
        file.endsWith('.vbproj')
      )
      .map(file => join(projectPath, file));
  } catch {
    return [];
  }
}

/**
 * Parses a .csproj file to extract project information
 */
export async function parseProjectFile(projectFilePath: string): Promise<ProjectInfo | null> {
  if (!existsSync(projectFilePath)) {
    return null;
  }

  try {
    const content = await readFile(projectFilePath, 'utf-8');
    const projectName = basename(projectFilePath, '.csproj');
    
    // Simple XML parsing for basic project properties
    const targetFramework = extractXmlValue(content, 'TargetFramework') || 'net8.0';
    const outputType = (extractXmlValue(content, 'OutputType') as 'Exe' | 'Library' | 'WinExe') || 'Exe';
    const assemblyName = extractXmlValue(content, 'AssemblyName') || projectName;
    const rootNamespace = extractXmlValue(content, 'RootNamespace') || projectName;
    const nullable = extractXmlValue(content, 'Nullable') === 'enable';
    const implicitUsings = extractXmlValue(content, 'ImplicitUsings') === 'enable';
    
    // Extract package references
    const packageReferences = extractPackageReferences(content);
    
    // Determine output path
    const outputPath = join(dirname(projectFilePath), 'bin', 'Debug', targetFramework);

    return {
      name: projectName,
      targetFramework,
      outputType,
      projectFile: projectFilePath,
      outputPath,
      assemblyName,
      rootNamespace,
      nullable,
      implicitUsings,
      packageReferences
    };
  } catch {
    return null;
  }
}

/**
 * Gets the platform-specific executable extension
 */
export function getExecutableExtension(): string {
  return platform() === 'win32' ? '.exe' : '';
}

/**
 * Validates a .NET Framework version string
 */
export function isValidFrameworkVersion(version: string): boolean {
  const validPatterns = [
    /^net\d+\.\d+$/, // net6.0, net7.0, net8.0
    /^netcoreapp\d+\.\d+$/, // netcoreapp3.1
    /^netstandard\d+\.\d+$/, // netstandard2.0
    /^net\d+\d+$/, // net48, net472
  ];
  
  return validPatterns.some(pattern => pattern.test(version));
}

/**
 * Gets common .NET installation paths for different platforms
 */
export function getDotNetInstallPaths(): string[] {
  const paths: string[] = [];
  
  switch (platform()) {
    case 'win32':
      paths.push(
        'C:\\Program Files\\dotnet\\dotnet.exe',
        'C:\\Program Files (x86)\\dotnet\\dotnet.exe'
      );
      break;
    case 'darwin':
      paths.push(
        '/usr/local/share/dotnet/dotnet',
        '/opt/homebrew/bin/dotnet'
      );
      break;
    case 'linux':
      paths.push(
        '/usr/share/dotnet/dotnet',
        '/usr/bin/dotnet',
        '/usr/local/bin/dotnet'
      );
      break;
  }
  
  return paths;
}

/**
 * Checks if .NET is installed and accessible
 */
export async function isDotNetInstalled(): Promise<boolean> {
  const paths = getDotNetInstallPaths();
  
  for (const path of paths) {
    if (existsSync(path)) {
      return true;
    }
  }
  
  // Check if dotnet is in PATH
  try {
    const { spawn } = require('child_process');
    const child = spawn('dotnet', ['--version'], { stdio: 'pipe' });
    
    return new Promise((resolve) => {
      child.on('close', (code: number) => {
        resolve(code === 0);
      });
      child.on('error', () => {
        resolve(false);
      });
    });
  } catch {
    return false;
  }
}

// Helper function to extract XML values
function extractXmlValue(xml: string, tagName: string): string | undefined {
  const regex = new RegExp(`<${tagName}>(.*?)</${tagName}>`, 'i');
  const match = xml.match(regex);
  return match?.[1]?.trim();
}

// Helper function to extract package references
function extractPackageReferences(xml: string): Array<{ name: string; version: string }> {
  const packageReferences: Array<{ name: string; version: string }> = [];
  const regex = /<PackageReference\s+Include="([^"]+)"\s+Version="([^"]+)"\s*\/>/g;
  
  let match;
  while ((match = regex.exec(xml)) !== null) {
    if (match[1] && match[2]) {
      packageReferences.push({
        name: match[1],
        version: match[2]
      });
    }
  }
  
  return packageReferences;
}