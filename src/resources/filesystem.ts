import { promises as fs } from 'fs';
import { join, resolve, relative, basename, dirname } from 'path';
import { minimatch } from 'minimatch';
import type { Logger } from '@/utils/logger.js';
import type { FilesystemConfig } from '@/types/config.js';
import { ErrorType, RixaError } from '@/types/common.js';
import type { McpResource } from '@/types/mcp.js';

/**
 * File system entry
 */
export interface FileSystemEntry {
  name: string;
  path: string;
  type: 'file' | 'directory';
  size?: number;
  mtime?: Date;
  isSymlink?: boolean;
}

/**
 * File content result
 */
export interface FileContent {
  uri: string;
  mimeType: string;
  content: string;
  encoding: 'utf8' | 'base64';
  size: number;
  mtime: Date;
}

/**
 * Directory listing options
 */
export interface ListDirectoryOptions {
  recursive?: boolean;
  maxDepth?: number;
  includeHidden?: boolean;
  pattern?: string;
}

/**
 * Safe filesystem resource provider with security constraints
 */
export class FilesystemResourceProvider {
  private allowedPaths: Set<string>;
  private excludePatterns: string[];

  constructor(
    private config: FilesystemConfig,
    private logger: Logger
  ) {
    // Resolve and normalize allowed paths
    this.allowedPaths = new Set(
      config.allowedPaths.map(path => resolve(path))
    );

    this.excludePatterns = config.excludePatterns;

    this.logger.info('Filesystem resource provider initialized', {
      allowedPaths: Array.from(this.allowedPaths),
      excludePatterns: this.excludePatterns,
      readOnly: config.readOnly,
      maxFileSize: config.maxFileSize,
    });
  }

  /**
   * List available resources (directories and files)
   */
  async listResources(): Promise<McpResource[]> {
    const resources: McpResource[] = [];

    for (const allowedPath of this.allowedPaths) {
      try {
        const entries = await this.listDirectory(allowedPath, {
          recursive: true,
          maxDepth: 3,
          includeHidden: false,
        });

        for (const entry of entries) {
          if (entry.type === 'file') {
            resources.push({
              uri: `file://${entry.path}`,
              name: relative(allowedPath, entry.path) || basename(entry.path),
              description: `File: ${entry.path}`,
              mimeType: this.getMimeType(entry.path),
            });
          } else {
            resources.push({
              uri: `file://${entry.path}/`,
              name: relative(allowedPath, entry.path) || basename(entry.path),
              description: `Directory: ${entry.path}`,
              mimeType: 'inode/directory',
            });
          }
        }
      } catch (error) {
        this.logger.warn('Failed to list directory', {
          path: allowedPath,
          error: error instanceof Error ? error.message : String(error),
        });
      }
    }

    return resources;
  }

  /**
   * Read file content
   */
  async readFile(uri: string): Promise<FileContent> {
    const filePath = this.uriToPath(uri);
    this.validatePath(filePath);

    try {
      const stats = await fs.stat(filePath);

      if (!stats.isFile()) {
        throw new RixaError(ErrorType.FILESYSTEM_ERROR, 'Path is not a file', {
          details: { path: filePath },
        });
      }

      if (stats.size > this.config.maxFileSize) {
        throw new RixaError(ErrorType.FILESYSTEM_ERROR, 'File too large', {
          details: {
            details: { path: filePath },
            size: stats.size,
            maxSize: this.config.maxFileSize,
          },
        });
      }

      const mimeType = this.getMimeType(filePath);
      const isBinary = this.isBinaryMimeType(mimeType);

      let content: string;
      let encoding: 'utf8' | 'base64';

      if (isBinary) {
        const buffer = await fs.readFile(filePath);
        content = buffer.toString('base64');
        encoding = 'base64';
      } else {
        content = await fs.readFile(filePath, 'utf8');
        encoding = 'utf8';
      }

      this.logger.debug('File read successfully', {
        details: { path: filePath },
        size: stats.size,
        encoding,
        mimeType,
      });

      return {
        uri,
        mimeType,
        content,
        encoding,
        size: stats.size,
        mtime: stats.mtime,
      };
    } catch (error) {
      if (error instanceof RixaError) {
        throw error;
      }

      throw new RixaError(ErrorType.FILESYSTEM_ERROR, 'Failed to read file', {
        details: { path: filePath },
        cause: error instanceof Error ? error : new Error(String(error)),
      });
    }
  }

  /**
   * Write file content (if not read-only)
   */
  async writeFile(uri: string, content: string, encoding: 'utf8' | 'base64' = 'utf8'): Promise<void> {
    if (this.config.readOnly) {
      throw new RixaError(ErrorType.FILESYSTEM_ERROR, 'Filesystem is read-only');
    }

    const filePath = this.uriToPath(uri);
    this.validatePath(filePath);

    try {
      // Ensure directory exists
      const dir = dirname(filePath);
      await fs.mkdir(dir, { recursive: true });

      if (encoding === 'base64') {
        const buffer = Buffer.from(content, 'base64');
        await fs.writeFile(filePath, buffer);
      } else {
        await fs.writeFile(filePath, content, 'utf8');
      }

      this.logger.info('File written successfully', {
        details: { path: filePath },
        encoding,
        size: content.length,
      });
    } catch (error) {
      throw new RixaError(ErrorType.FILESYSTEM_ERROR, 'Failed to write file', {
        details: { path: filePath },
        cause: error instanceof Error ? error : new Error(String(error)),
      });
    }
  }

  /**
   * List directory contents
   */
  async listDirectory(
    dirPath: string,
    options: ListDirectoryOptions = {}
  ): Promise<FileSystemEntry[]> {
    const {
      recursive = false,
      maxDepth = 10,
      includeHidden = false,
      pattern,
    } = options;

    this.validatePath(dirPath);

    const entries: FileSystemEntry[] = [];

    try {
      await this.listDirectoryRecursive(
        dirPath,
        entries,
        0,
        maxDepth,
        recursive,
        includeHidden,
        pattern
      );

      return entries;
    } catch (error) {
      throw new RixaError(ErrorType.FILESYSTEM_ERROR, 'Failed to list directory', {
        details: { path: dirPath },
        cause: error instanceof Error ? error : new Error(String(error)),
      });
    }
  }

  private async listDirectoryRecursive(
    dirPath: string,
    entries: FileSystemEntry[],
    currentDepth: number,
    maxDepth: number,
    recursive: boolean,
    includeHidden: boolean,
    pattern?: string
  ): Promise<void> {
    if (currentDepth > maxDepth) {
      return;
    }

    const items = await fs.readdir(dirPath, { withFileTypes: true });

    for (const item of items) {
      const itemPath = join(dirPath, item.name);

      // Skip hidden files if not included
      if (!includeHidden && item.name.startsWith('.')) {
        continue;
      }

      // Check exclude patterns
      if (this.isExcluded(itemPath)) {
        continue;
      }

      // Check pattern match
      if (pattern && !minimatch(item.name, pattern)) {
        continue;
      }

      try {
        const stats = await fs.stat(itemPath);
        const entry: FileSystemEntry = {
          name: item.name,
          path: itemPath,
          type: item.isDirectory() ? 'directory' : 'file',
          ...(item.isFile() && { size: stats.size }),
          mtime: stats.mtime,
          isSymlink: item.isSymbolicLink(),
        };

        entries.push(entry);

        // Recurse into directories
        if (recursive && item.isDirectory() && !item.isSymbolicLink()) {
          await this.listDirectoryRecursive(
            itemPath,
            entries,
            currentDepth + 1,
            maxDepth,
            recursive,
            includeHidden,
            pattern
          );
        }
      } catch (error) {
        this.logger.warn('Failed to stat file', {
          path: itemPath,
          error: error instanceof Error ? error.message : String(error),
        });
      }
    }
  }

  private validatePath(filePath: string): void {
    const resolvedPath = resolve(filePath);

    // Check if path is within allowed paths
    let isAllowed = false;
    for (const allowedPath of this.allowedPaths) {
      if (resolvedPath.startsWith(allowedPath)) {
        isAllowed = true;
        break;
      }
    }

    if (!isAllowed) {
      throw new RixaError(ErrorType.FILESYSTEM_ERROR, 'Path not allowed', {
        details: {
          path: resolvedPath,
          allowedPaths: Array.from(this.allowedPaths),
        },
      });
    }

    // Check exclude patterns
    if (this.isExcluded(resolvedPath)) {
      throw new RixaError(ErrorType.FILESYSTEM_ERROR, 'Path excluded by pattern', {
        details: {
          path: resolvedPath,
          excludePatterns: this.excludePatterns,
        },
      });
    }
  }

  private isExcluded(filePath: string): boolean {
    const fileName = filePath.split('/').pop() || '';

    return this.excludePatterns.some(pattern => {
      // Direct file path match
      if (minimatch(filePath, pattern)) return true;

      // File name match (for patterns like "*.log")
      if (minimatch(fileName, pattern)) return true;

      // Directory name match (for patterns like "node_modules/**")
      if (pattern.includes('/**')) {
        const dirPattern = pattern.replace('/**', '');
        if (fileName === dirPattern || filePath.includes(`/${dirPattern}/`)) return true;
      }

      return false;
    });
  }

  private uriToPath(uri: string): string {
    if (uri.startsWith('file://')) {
      return uri.slice(7);
    }
    return uri;
  }

  private getMimeType(filePath: string): string {
    const ext = basename(filePath).split('.').pop()?.toLowerCase();

    const mimeTypes: Record<string, string> = {
      // Text files
      txt: 'text/plain',
      md: 'text/markdown',
      json: 'application/json',
      xml: 'application/xml',
      yaml: 'application/yaml',
      yml: 'application/yaml',
      
      // Code files
      js: 'application/javascript',
      ts: 'application/typescript',
      jsx: 'application/javascript',
      tsx: 'application/typescript',
      py: 'text/x-python',
      java: 'text/x-java-source',
      c: 'text/x-c',
      cpp: 'text/x-c++',
      h: 'text/x-c',
      hpp: 'text/x-c++',
      cs: 'text/x-csharp',
      php: 'text/x-php',
      rb: 'text/x-ruby',
      go: 'text/x-go',
      rs: 'text/x-rust',
      
      // Web files
      html: 'text/html',
      htm: 'text/html',
      css: 'text/css',
      scss: 'text/x-scss',
      sass: 'text/x-sass',
      less: 'text/x-less',
      
      // Config files
      ini: 'text/plain',
      cfg: 'text/plain',
      conf: 'text/plain',
      env: 'text/plain',
      
      // Images
      png: 'image/png',
      jpg: 'image/jpeg',
      jpeg: 'image/jpeg',
      gif: 'image/gif',
      svg: 'image/svg+xml',
      
      // Archives
      zip: 'application/zip',
      tar: 'application/x-tar',
      gz: 'application/gzip',
      
      // Binary
      exe: 'application/octet-stream',
      bin: 'application/octet-stream',
      so: 'application/octet-stream',
      dll: 'application/octet-stream',
    };

    return mimeTypes[ext || ''] || 'application/octet-stream';
  }

  private isBinaryMimeType(mimeType: string): boolean {
    return !mimeType.startsWith('text/') && 
           !mimeType.includes('json') && 
           !mimeType.includes('xml') && 
           !mimeType.includes('yaml') && 
           !mimeType.includes('javascript') && 
           !mimeType.includes('typescript');
  }
}
