import { basename } from 'path';
import type { Logger } from '@/utils/logger.js';
import { FilesystemResourceProvider } from './filesystem.js';
import type { FilesystemConfig } from '@/types/config.js';
import type { McpResource } from '@/types/mcp.js';

/**
 * Project tree node
 */
export interface ProjectTreeNode {
  name: string;
  path: string;
  type: 'file' | 'directory';
  size?: number;
  mtime?: Date;
  children?: ProjectTreeNode[];
  isSymlink?: boolean;
  mimeType?: string;
}

/**
 * Project structure information
 */
export interface ProjectInfo {
  name: string;
  root: string;
  totalFiles: number;
  totalDirectories: number;
  languages: Record<string, number>;
  size: number;
}

/**
 * Enhanced project resource provider with tree structure and analysis
 */
export class ProjectResourceProvider extends FilesystemResourceProvider {
  constructor(config: FilesystemConfig, logger: Logger) {
    super(config, logger);
  }

  /**
   * Get project tree structure
   */
  async getProjectTree(rootPath: string, maxDepth: number = 5): Promise<ProjectTreeNode> {
    const entries = await this.listDirectory(rootPath, {
      recursive: true,
      maxDepth,
      includeHidden: false,
    });

    // Build tree structure
    const root: ProjectTreeNode = {
      name: basename(rootPath),
      path: rootPath,
      type: 'directory',
      children: [],
    };

    // Group entries by directory
    const nodeMap = new Map<string, ProjectTreeNode>();
    nodeMap.set(rootPath, root);

    // Sort entries by path depth to ensure parents are processed first
    entries.sort((a, b) => a.path.split('/').length - b.path.split('/').length);

    for (const entry of entries) {
      const node: ProjectTreeNode = {
        name: entry.name,
        path: entry.path,
        type: entry.type,
        ...(entry.size !== undefined && { size: entry.size }),
        ...(entry.mtime !== undefined && { mtime: entry.mtime }),
        ...(entry.isSymlink !== undefined && { isSymlink: entry.isSymlink }),
        ...(entry.type === 'file' && { mimeType: this.getMimeTypeFromPath(entry.path) }),
      };

      if (entry.type === 'directory') {
        node.children = [];
        nodeMap.set(entry.path, node);
      }

      // Find parent directory
      const parentPath = entry.path.substring(0, entry.path.lastIndexOf('/'));
      const parent = nodeMap.get(parentPath);

      if (parent && parent.children) {
        parent.children.push(node);
      }
    }

    return root;
  }

  /**
   * Get project information and statistics
   */
  async getProjectInfo(rootPath: string): Promise<ProjectInfo> {
    const entries = await this.listDirectory(rootPath, {
      recursive: true,
      maxDepth: 10,
      includeHidden: false,
    });

    let totalFiles = 0;
    let totalDirectories = 0;
    let totalSize = 0;
    const languages: Record<string, number> = {};

    for (const entry of entries) {
      if (entry.type === 'file') {
        totalFiles++;
        totalSize += entry.size || 0;

        // Count by language/extension
        const ext = entry.name.split('.').pop()?.toLowerCase();
        if (ext) {
          const language = this.getLanguageFromExtension(ext);
          languages[language] = (languages[language] || 0) + 1;
        }
      } else {
        totalDirectories++;
      }
    }

    return {
      name: basename(rootPath),
      root: rootPath,
      totalFiles,
      totalDirectories,
      languages,
      size: totalSize,
    };
  }

  /**
   * Search files by pattern or content
   */
  async searchFiles(
    rootPath: string,
    options: {
      pattern?: string;
      content?: string;
      extensions?: string[];
      maxResults?: number;
    }
  ): Promise<Array<{ path: string; matches?: Array<{ line: number; text: string }> }>> {
    const { pattern, content, extensions, maxResults = 100 } = options;
    const results: Array<{ path: string; matches?: Array<{ line: number; text: string }> }> = [];

    const entries = await this.listDirectory(rootPath, {
      recursive: true,
      maxDepth: 10,
      includeHidden: false,
      ...(pattern && { pattern }),
    });

    for (const entry of entries) {
      if (entry.type !== 'file') continue;
      if (results.length >= maxResults) break;

      // Filter by extension
      if (extensions && extensions.length > 0) {
        const ext = entry.name.split('.').pop()?.toLowerCase();
        if (!ext || !extensions.includes(ext)) continue;
      }

      if (content) {
        // Search file content
        try {
          const fileContent = await this.readFile(`file://${entry.path}`);
          if (fileContent.encoding === 'utf8') {
            const lines = fileContent.content.split('\n');
            const matches: Array<{ line: number; text: string }> = [];

            lines.forEach((line, index) => {
              if (line.toLowerCase().includes(content.toLowerCase())) {
                matches.push({
                  line: index + 1,
                  text: line.trim(),
                });
              }
            });

            if (matches.length > 0) {
              results.push({
                path: entry.path,
                matches,
              });
            }
          }
        } catch (error) {
          // Skip files that can't be read
          continue;
        }
      } else {
        // Just pattern matching
        results.push({ path: entry.path });
      }
    }

    return results;
  }

  /**
   * Get enhanced resources list with project structure
   */
  async getEnhancedResources(): Promise<McpResource[]> {
    const basicResources = await this.listResources();
    const enhancedResources: McpResource[] = [...basicResources];

    // Add project tree resources for each allowed path
    for (const allowedPath of this.getAllowedPaths()) {
      try {
        const projectInfo = await this.getProjectInfo(allowedPath);

        enhancedResources.push({
          uri: `project://tree/${encodeURIComponent(allowedPath)}`,
          name: `${projectInfo.name} (Project Tree)`,
          description: `Project tree structure for ${projectInfo.name} - ${projectInfo.totalFiles} files, ${projectInfo.totalDirectories} directories`,
          mimeType: 'application/json',
        });

        enhancedResources.push({
          uri: `project://info/${encodeURIComponent(allowedPath)}`,
          name: `${projectInfo.name} (Project Info)`,
          description: `Project information and statistics for ${projectInfo.name}`,
          mimeType: 'application/json',
        });

        enhancedResources.push({
          uri: `project://search/${encodeURIComponent(allowedPath)}`,
          name: `${projectInfo.name} (Search)`,
          description: `Search files and content in ${projectInfo.name}`,
          mimeType: 'application/json',
        });
      } catch (error) {
        // Skip projects that can't be analyzed
        continue;
      }
    }

    return enhancedResources;
  }

  /**
   * Read enhanced resource content
   */
  async readEnhancedResource(uri: string): Promise<{
    uri: string;
    mimeType: string;
    content: string;
    encoding: 'utf8';
  }> {
    if (uri.startsWith('project://tree/')) {
      const rootPath = decodeURIComponent(uri.replace('project://tree/', ''));
      const tree = await this.getProjectTree(rootPath);
      return {
        uri,
        mimeType: 'application/json',
        content: JSON.stringify(tree, null, 2),
        encoding: 'utf8',
      };
    }

    if (uri.startsWith('project://info/')) {
      const rootPath = decodeURIComponent(uri.replace('project://info/', ''));
      const info = await this.getProjectInfo(rootPath);
      return {
        uri,
        mimeType: 'application/json',
        content: JSON.stringify(info, null, 2),
        encoding: 'utf8',
      };
    }

    if (uri.startsWith('project://search/')) {
      // Return search template/instructions
      const searchInfo = {
        description: 'Use the project/search tool to search files and content',
        examples: [
          {
            pattern: '*.js',
            description: 'Find all JavaScript files',
          },
          {
            content: 'TODO',
            extensions: ['js', 'ts'],
            description: 'Find TODO comments in JS/TS files',
          },
          {
            pattern: 'test*',
            content: 'describe',
            description: 'Find test files containing describe blocks',
          },
        ],
      };

      return {
        uri,
        mimeType: 'application/json',
        content: JSON.stringify(searchInfo, null, 2),
        encoding: 'utf8',
      };
    }

    throw new Error(`Unknown enhanced resource URI: ${uri}`);
  }

  private getMimeTypeFromPath(filePath: string): string {
    const ext = basename(filePath).split('.').pop()?.toLowerCase();
    const mimeTypes: Record<string, string> = {
      js: 'application/javascript',
      ts: 'application/typescript',
      json: 'application/json',
      md: 'text/markdown',
      txt: 'text/plain',
      css: 'text/css',
      html: 'text/html',
      py: 'text/x-python',
      java: 'text/x-java-source',
      go: 'text/x-go',
      rs: 'text/x-rust',
      c: 'text/x-c',
      cpp: 'text/x-c++',
      h: 'text/x-c',
      hpp: 'text/x-c++',
    };
    return mimeTypes[ext || ''] || 'application/octet-stream';
  }

  private getLanguageFromExtension(ext: string): string {
    const languages: Record<string, string> = {
      js: 'JavaScript',
      jsx: 'JavaScript',
      ts: 'TypeScript',
      tsx: 'TypeScript',
      py: 'Python',
      java: 'Java',
      go: 'Go',
      rs: 'Rust',
      c: 'C',
      cpp: 'C++',
      cc: 'C++',
      cxx: 'C++',
      h: 'C/C++',
      hpp: 'C++',
      cs: 'C#',
      php: 'PHP',
      rb: 'Ruby',
      swift: 'Swift',
      kt: 'Kotlin',
      scala: 'Scala',
      clj: 'Clojure',
      hs: 'Haskell',
      ml: 'OCaml',
      fs: 'F#',
      elm: 'Elm',
      dart: 'Dart',
      lua: 'Lua',
      r: 'R',
      m: 'Objective-C',
      mm: 'Objective-C++',
      pl: 'Perl',
      sh: 'Shell',
      bash: 'Bash',
      zsh: 'Zsh',
      fish: 'Fish',
      ps1: 'PowerShell',
      bat: 'Batch',
      cmd: 'Batch',
      sql: 'SQL',
      html: 'HTML',
      htm: 'HTML',
      css: 'CSS',
      scss: 'SCSS',
      sass: 'Sass',
      less: 'Less',
      xml: 'XML',
      json: 'JSON',
      yaml: 'YAML',
      yml: 'YAML',
      toml: 'TOML',
      ini: 'INI',
      cfg: 'Config',
      conf: 'Config',
      md: 'Markdown',
      rst: 'reStructuredText',
      tex: 'LaTeX',
      dockerfile: 'Dockerfile',
      makefile: 'Makefile',
    };
    return languages[ext] || 'Other';
  }

  private getAllowedPaths(): string[] {
    // Access private property through type assertion
    return Array.from((this as any).allowedPaths);
  }
}
