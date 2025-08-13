import { existsSync, readFileSync } from 'fs';
import { join } from 'path';
import { XMLParser } from 'fast-xml-parser';
import { sync as globSync } from 'glob';
import { execSync } from 'child_process';

/**
 * Enhanced Java Detection Module
 * Provides advanced auto-detection capabilities for Java/Spring Boot projects
 */

export interface JavaProjectInfo {
  projectType: 'maven' | 'gradle' | 'unknown';
  mainClass: string | null;
  classPaths: string[];
  sourcePaths: string[];
  dependencies: string[];
  springBootVersion?: string;
  javaVersion?: string;
  buildTool: string;
  activeDebugPorts: number[];
}

export interface SpringBootConfig {
  mainClass: string;
  applicationName: string;
  profiles: string[];
  port: number;
  contextPath: string;
}

/**
 * Detects Spring Boot main class from various sources
 */
export function detectSpringBootMainClass(workspaceRoot: string): string | null {
  // Try Maven pom.xml first
  const pomPath = join(workspaceRoot, 'pom.xml');
  if (existsSync(pomPath)) {
    const mainClass = extractMainClassFromPom(pomPath);
    if (mainClass) return mainClass;
  }

  // Try Gradle build.gradle
  const gradlePath = join(workspaceRoot, 'build.gradle');
  if (existsSync(gradlePath)) {
    const mainClass = extractMainClassFromGradle(gradlePath);
    if (mainClass) return mainClass;
  }

  // Try application.properties/yml
  const mainClass = extractMainClassFromProperties(workspaceRoot);
  if (mainClass) return mainClass;

  // Scan for @SpringBootApplication annotation
  return scanForSpringBootApplication(workspaceRoot);
}

/**
 * Extracts main class from Maven pom.xml
 */
function extractMainClassFromPom(pomPath: string): string | null {
  try {
    const pomContent = readFileSync(pomPath, 'utf-8');
    const parser = new XMLParser({
      ignoreAttributes: false,
      attributeNamePrefix: '@_'
    });
    
    const pomData = parser.parse(pomContent);
    
    // Check spring-boot-maven-plugin configuration
    const plugins = pomData?.project?.build?.plugins?.plugin;
    if (Array.isArray(plugins)) {
      for (const plugin of plugins) {
        if (plugin.artifactId === 'spring-boot-maven-plugin') {
          const mainClass = plugin.configuration?.mainClass;
          if (mainClass) return mainClass;
        }
      }
    }
    
    // Check properties
    const properties = pomData?.project?.properties;
    if (properties?.['start-class']) {
      return properties['start-class'];
    }
    
    if (properties?.mainClass) {
      return properties.mainClass;
    }
    
    return null;
  } catch (error) {
    console.warn('Failed to parse pom.xml:', error);
    return null;
  }
}

/**
 * Extracts main class from Gradle build.gradle
 */
function extractMainClassFromGradle(gradlePath: string): string | null {
  try {
    const gradleContent = readFileSync(gradlePath, 'utf-8');
    
    // Look for mainClass configuration
    const mainClassMatch = gradleContent.match(/mainClass\s*=\s*['"]([^'"]+)['"]/);
    if (mainClassMatch && mainClassMatch[1]) {
      return mainClassMatch[1];
    }

    // Look for bootJar mainClass
    const bootJarMatch = gradleContent.match(/bootJar\s*{[^}]*mainClass\s*=\s*['"]([^'"]+)['"]/s);
    if (bootJarMatch && bootJarMatch[1]) {
      return bootJarMatch[1];
    }
    
    return null;
  } catch (error) {
    console.warn('Failed to parse build.gradle:', error);
    return null;
  }
}

/**
 * Extracts main class from application properties
 */
function extractMainClassFromProperties(workspaceRoot: string): string | null {
  const propertyFiles = [
    'src/main/resources/application.properties',
    'src/main/resources/application.yml',
    'src/main/resources/application.yaml',
    'application.properties',
    'application.yml',
    'application.yaml'
  ];
  
  for (const file of propertyFiles) {
    const filePath = join(workspaceRoot, file);
    if (existsSync(filePath)) {
      try {
        const content = readFileSync(filePath, 'utf-8');
        
        // Look for main class property
        const mainClassMatch = content.match(/(?:main\.class|start-class)\s*[:=]\s*(.+)/);
        if (mainClassMatch && mainClassMatch[1]) {
          return mainClassMatch[1].trim();
        }
      } catch (error) {
        console.warn(`Failed to read ${file}:`, error);
      }
    }
  }
  
  return null;
}

/**
 * Scans source code for @SpringBootApplication annotation
 */
function scanForSpringBootApplication(workspaceRoot: string): string | null {
  try {
    const javaFiles = globSync('src/main/java/**/*.java', { cwd: workspaceRoot });
    
    for (const javaFile of javaFiles) {
      const filePath = join(workspaceRoot, javaFile);
      try {
        const content = readFileSync(filePath, 'utf-8');
        
        // Check for @SpringBootApplication annotation
        if (content.includes('@SpringBootApplication')) {
          // Extract package and class name
          const packageMatch = content.match(/package\s+([^;]+);/);
          const classMatch = content.match(/public\s+class\s+(\w+)/);
          
          if (packageMatch && classMatch) {
            return `${packageMatch[1]}.${classMatch[1]}`;
          }
        }
      } catch (error) {
        console.warn(`Failed to read ${javaFile}:`, error);
      }
    }
    
    return null;
  } catch (error) {
    console.warn('Failed to scan for Spring Boot application:', error);
    return null;
  }
}

/**
 * Builds complete classpath including dependencies
 */
export function buildCompleteClasspath(workspaceRoot: string): string[] {
  const classpaths: string[] = [];
  
  // Add standard build output directories
  const standardPaths = [
    'target/classes',
    'target/test-classes',
    'build/classes/java/main',
    'build/classes/java/test',
    'build/resources/main',
    'build/resources/test'
  ];
  
  for (const path of standardPaths) {
    const fullPath = join(workspaceRoot, path);
    if (existsSync(fullPath)) {
      classpaths.push(fullPath);
    }
  }
  
  // Add Maven dependencies
  const mavenDeps = getMavenDependencies(workspaceRoot);
  classpaths.push(...mavenDeps);
  
  // Add Gradle dependencies
  const gradleDeps = getGradleDependencies(workspaceRoot);
  classpaths.push(...gradleDeps);
  
  return classpaths;
}

/**
 * Gets Maven dependencies from target/dependency
 */
function getMavenDependencies(workspaceRoot: string): string[] {
  const dependencyDir = join(workspaceRoot, 'target/dependency');
  if (!existsSync(dependencyDir)) {
    return [];
  }
  
  try {
    const jarFiles = globSync('*.jar', { cwd: dependencyDir });
    return jarFiles.map(jar => join(dependencyDir, jar));
  } catch (error) {
    console.warn('Failed to get Maven dependencies:', error);
    return [];
  }
}

/**
 * Gets Gradle dependencies
 */
function getGradleDependencies(workspaceRoot: string): string[] {
  try {
    // Try to get dependencies from Gradle
    const result = execSync('gradle dependencies --configuration runtimeClasspath', {
      cwd: workspaceRoot,
      encoding: 'utf-8',
      timeout: 10000
    });
    
    // Parse Gradle output to extract JAR paths
    const jarPaths: string[] = [];
    const lines = result.split('\n');
    
    for (const line of lines) {
      const jarMatch = line.match(/([^/]+\.jar)$/);
      if (jarMatch && jarMatch[1]) {
        // This is a simplified approach - in reality, you'd need to resolve actual paths
        jarPaths.push(jarMatch[1]);
      }
    }
    
    return jarPaths;
  } catch (error) {
    console.warn('Failed to get Gradle dependencies:', error);
    return [];
  }
}

/**
 * Detects active debug ports on the system
 */
export function detectActiveDebugPorts(): number[] {
  try {
    const result = execSync('lsof -i -P -n | grep LISTEN', {
      encoding: 'utf-8',
      timeout: 5000
    });
    
    const debugPorts: number[] = [];
    const lines = result.split('\n');
    
    for (const line of lines) {
      // Look for Java processes with common debug ports
      if (line.includes('java') && line.includes('LISTEN')) {
        const portMatch = line.match(/:(\d+)\s+\(LISTEN\)/);
        if (portMatch && portMatch[1]) {
          const port = parseInt(portMatch[1]);
          // Common debug ports: 5005, 8000, 9999, etc.
          if (port >= 5000 && port <= 9999) {
            debugPorts.push(port);
          }
        }
      }
    }
    
    return debugPorts;
  } catch (error) {
    console.warn('Failed to detect active debug ports:', error);
    return [];
  }
}

/**
 * Analyzes complete Java project structure
 */
export function analyzeJavaProject(workspaceRoot: string): JavaProjectInfo {
  const projectInfo: JavaProjectInfo = {
    projectType: 'unknown',
    mainClass: null,
    classPaths: [],
    sourcePaths: [],
    dependencies: [],
    buildTool: 'none',
    activeDebugPorts: []
  };
  
  // Detect project type
  if (existsSync(join(workspaceRoot, 'pom.xml'))) {
    projectInfo.projectType = 'maven';
    projectInfo.buildTool = 'maven';
  } else if (existsSync(join(workspaceRoot, 'build.gradle'))) {
    projectInfo.projectType = 'gradle';
    projectInfo.buildTool = 'gradle';
  }
  
  // Detect main class
  projectInfo.mainClass = detectSpringBootMainClass(workspaceRoot);
  
  // Build classpath
  projectInfo.classPaths = buildCompleteClasspath(workspaceRoot);
  
  // Add source paths
  const sourcePaths = [
    'src/main/java',
    'src/test/java',
    'src/main/resources',
    'src/test/resources'
  ];
  
  for (const path of sourcePaths) {
    const fullPath = join(workspaceRoot, path);
    if (existsSync(fullPath)) {
      projectInfo.sourcePaths.push(fullPath);
    }
  }
  
  // Detect active debug ports
  projectInfo.activeDebugPorts = detectActiveDebugPorts();
  
  return projectInfo;
}
