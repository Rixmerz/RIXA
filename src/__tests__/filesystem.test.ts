import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { promises as fs } from 'fs';
import { join, resolve } from 'path';
import { FilesystemResourceProvider } from '@/resources/filesystem.js';
import { createLogger } from '@/utils/logger.js';
import type { FilesystemConfig } from '@/types/config.js';
import { ErrorType, RixaError } from '@/types/common.js';

// Mock fs module
vi.mock('fs', () => ({
  promises: {
    stat: vi.fn(),
    readFile: vi.fn(),
    writeFile: vi.fn(),
    mkdir: vi.fn(),
    readdir: vi.fn(),
  },
}));

const mockFs = vi.mocked(fs);

// Mock logger
const mockLogger = createLogger(
  { level: 'debug', format: 'json', file: { enabled: false, path: '', maxSize: 0, maxFiles: 0 } },
  { requestId: 'test-request' }
);

describe('FilesystemResourceProvider', () => {
  let provider: FilesystemResourceProvider;
  let config: FilesystemConfig;

  beforeEach(() => {
    config = {
      readOnly: false,
      allowedPaths: ['/allowed/path', '/another/allowed'],
      maxFileSize: 1024 * 1024, // 1MB
      excludePatterns: ['node_modules/**', '*.log', '.git/**'],
    };

    provider = new FilesystemResourceProvider(config, mockLogger);
    vi.clearAllMocks();
  });

  afterEach(() => {
    vi.resetAllMocks();
  });

  describe('readFile', () => {
    it('should read text file successfully', async () => {
      const filePath = '/allowed/path/test.js';
      const fileContent = 'console.log("Hello, World!");';

      mockFs.stat.mockResolvedValue({
        isFile: () => true,
        size: fileContent.length,
        mtime: new Date(),
      } as any);

      mockFs.readFile.mockResolvedValue(fileContent);

      const result = await provider.readFile(`file://${filePath}`);

      expect(result).toMatchObject({
        uri: `file://${filePath}`,
        mimeType: 'application/javascript',
        content: fileContent,
        encoding: 'utf8',
        size: fileContent.length,
      });

      expect(mockFs.readFile).toHaveBeenCalledWith(filePath, 'utf8');
    });

    it('should read binary file as base64', async () => {
      const filePath = '/allowed/path/image.png';
      const binaryData = Buffer.from([0x89, 0x50, 0x4e, 0x47]); // PNG header

      mockFs.stat.mockResolvedValue({
        isFile: () => true,
        size: binaryData.length,
        mtime: new Date(),
      } as any);

      mockFs.readFile.mockResolvedValue(binaryData);

      const result = await provider.readFile(`file://${filePath}`);

      expect(result).toMatchObject({
        uri: `file://${filePath}`,
        mimeType: 'image/png',
        content: binaryData.toString('base64'),
        encoding: 'base64',
        size: binaryData.length,
      });

      expect(mockFs.readFile).toHaveBeenCalledWith(filePath);
    });

    it('should reject files outside allowed paths', async () => {
      const filePath = '/forbidden/path/test.js';

      await expect(provider.readFile(`file://${filePath}`)).rejects.toThrow(RixaError);
      await expect(provider.readFile(`file://${filePath}`)).rejects.toThrow('Path not allowed');
    });

    it('should reject files matching exclude patterns', async () => {
      const filePath = '/allowed/path/node_modules/package.json';

      await expect(provider.readFile(`file://${filePath}`)).rejects.toThrow(RixaError);
      await expect(provider.readFile(`file://${filePath}`)).rejects.toThrow('Path excluded by pattern');
    });

    it('should reject files that are too large', async () => {
      const filePath = '/allowed/path/large.txt';

      mockFs.stat.mockResolvedValue({
        isFile: () => true,
        size: config.maxFileSize + 1,
        mtime: new Date(),
      } as any);

      await expect(provider.readFile(`file://${filePath}`)).rejects.toThrow(RixaError);
      await expect(provider.readFile(`file://${filePath}`)).rejects.toThrow('File too large');
    });

    it('should reject directories', async () => {
      const dirPath = '/allowed/path/directory';

      mockFs.stat.mockResolvedValue({
        isFile: () => false,
        isDirectory: () => true,
        size: 0,
        mtime: new Date(),
      } as any);

      await expect(provider.readFile(`file://${dirPath}`)).rejects.toThrow(RixaError);
      await expect(provider.readFile(`file://${dirPath}`)).rejects.toThrow('Path is not a file');
    });
  });

  describe('writeFile', () => {
    it('should write text file successfully', async () => {
      const filePath = '/allowed/path/output.txt';
      const content = 'Hello, World!';

      mockFs.mkdir.mockResolvedValue(undefined);
      mockFs.writeFile.mockResolvedValue(undefined);

      await provider.writeFile(`file://${filePath}`, content, 'utf8');

      expect(mockFs.mkdir).toHaveBeenCalledWith('/allowed/path', { recursive: true });
      expect(mockFs.writeFile).toHaveBeenCalledWith(filePath, content, 'utf8');
    });

    it('should write binary file from base64', async () => {
      const filePath = '/allowed/path/image.png';
      const base64Content = 'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8/5+hHgAHggJ/PchI7wAAAABJRU5ErkJggg==';

      mockFs.mkdir.mockResolvedValue(undefined);
      mockFs.writeFile.mockResolvedValue(undefined);

      await provider.writeFile(`file://${filePath}`, base64Content, 'base64');

      expect(mockFs.writeFile).toHaveBeenCalledWith(
        filePath,
        Buffer.from(base64Content, 'base64')
      );
    });

    it('should reject writes when read-only', async () => {
      const readOnlyProvider = new FilesystemResourceProvider(
        { ...config, readOnly: true },
        mockLogger
      );

      await expect(
        readOnlyProvider.writeFile('file:///allowed/path/test.txt', 'content')
      ).rejects.toThrow(RixaError);
      await expect(
        readOnlyProvider.writeFile('file:///allowed/path/test.txt', 'content')
      ).rejects.toThrow('Filesystem is read-only');
    });

    it('should reject writes outside allowed paths', async () => {
      const filePath = '/forbidden/path/test.txt';

      await expect(provider.writeFile(`file://${filePath}`, 'content')).rejects.toThrow(RixaError);
      await expect(provider.writeFile(`file://${filePath}`, 'content')).rejects.toThrow(
        'Path not allowed'
      );
    });
  });

  describe('listDirectory', () => {
    it('should list directory contents', async () => {
      const dirPath = '/allowed/path';

      mockFs.readdir.mockResolvedValue([
        { name: 'file1.js', isDirectory: () => false, isFile: () => true, isSymbolicLink: () => false },
        { name: 'file2.txt', isDirectory: () => false, isFile: () => true, isSymbolicLink: () => false },
        { name: 'subdir', isDirectory: () => true, isFile: () => false, isSymbolicLink: () => false },
      ] as any);

      mockFs.stat.mockImplementation((path: string) => {
        const name = path.split('/').pop();
        return Promise.resolve({
          size: name?.includes('file') ? 100 : undefined,
          mtime: new Date(),
        } as any);
      });

      const result = await provider.listDirectory(dirPath);

      expect(result).toHaveLength(3);
      expect(result[0]).toMatchObject({
        name: 'file1.js',
        path: join(dirPath, 'file1.js'),
        type: 'file',
        size: 100,
      });
      expect(result[2]).toMatchObject({
        name: 'subdir',
        path: join(dirPath, 'subdir'),
        type: 'directory',
      });
    });

    it('should filter hidden files when not included', async () => {
      const dirPath = '/allowed/path';

      mockFs.readdir.mockResolvedValue([
        { name: 'visible.js', isDirectory: () => false, isFile: () => true, isSymbolicLink: () => false },
        { name: '.hidden', isDirectory: () => false, isFile: () => true, isSymbolicLink: () => false },
      ] as any);

      mockFs.stat.mockResolvedValue({
        size: 100,
        mtime: new Date(),
      } as any);

      const result = await provider.listDirectory(dirPath, { includeHidden: false });

      expect(result).toHaveLength(1);
      expect(result[0].name).toBe('visible.js');
    });

    it('should apply exclude patterns', async () => {
      const dirPath = '/allowed/path';

      mockFs.readdir.mockResolvedValue([
        { name: 'app.js', isDirectory: () => false, isFile: () => true, isSymbolicLink: () => false },
        { name: 'debug.log', isDirectory: () => false, isFile: () => true, isSymbolicLink: () => false },
        { name: 'node_modules', isDirectory: () => true, isFile: () => false, isSymbolicLink: () => false },
      ] as any);

      mockFs.stat.mockResolvedValue({
        size: 100,
        mtime: new Date(),
      } as any);

      const result = await provider.listDirectory(dirPath);

      expect(result).toHaveLength(1);
      expect(result[0].name).toBe('app.js');
    });

    it('should handle recursive listing with depth limit', async () => {
      const dirPath = '/allowed/path';

      // Mock first level
      mockFs.readdir.mockImplementation((path: string) => {
        if (path === dirPath) {
          return Promise.resolve([
            { name: 'file.js', isDirectory: () => false, isFile: () => true, isSymbolicLink: () => false },
            { name: 'subdir', isDirectory: () => true, isFile: () => false, isSymbolicLink: () => false },
          ] as any);
        } else if (path === join(dirPath, 'subdir')) {
          return Promise.resolve([
            { name: 'nested.txt', isDirectory: () => false, isFile: () => true, isSymbolicLink: () => false },
          ] as any);
        }
        return Promise.resolve([]);
      });

      mockFs.stat.mockResolvedValue({
        size: 100,
        mtime: new Date(),
      } as any);

      const result = await provider.listDirectory(dirPath, {
        recursive: true,
        maxDepth: 2,
      });

      expect(result).toHaveLength(3);
      expect(result.map(r => r.name)).toContain('file.js');
      expect(result.map(r => r.name)).toContain('subdir');
      expect(result.map(r => r.name)).toContain('nested.txt');
    });
  });

  describe('listResources', () => {
    it('should list resources from all allowed paths', async () => {
      mockFs.readdir.mockImplementation((path: string) => {
        if (path === '/allowed/path') {
          return Promise.resolve([
            { name: 'app.js', isDirectory: () => false, isFile: () => true, isSymbolicLink: () => false },
          ] as any);
        } else if (path === '/another/allowed') {
          return Promise.resolve([
            { name: 'config.json', isDirectory: () => false, isFile: () => true, isSymbolicLink: () => false },
          ] as any);
        }
        return Promise.resolve([]);
      });

      mockFs.stat.mockResolvedValue({
        size: 100,
        mtime: new Date(),
      } as any);

      const result = await provider.listResources();

      expect(result).toHaveLength(2);
      expect(result[0]).toMatchObject({
        uri: 'file:///allowed/path/app.js',
        name: 'app.js',
        mimeType: 'application/javascript',
      });
      expect(result[1]).toMatchObject({
        uri: 'file:///another/allowed/config.json',
        name: 'config.json',
        mimeType: 'application/json',
      });
    });
  });

  describe('MIME type detection', () => {
    it('should detect common file types correctly', async () => {
      const testCases = [
        { file: 'app.js', expected: 'application/javascript' },
        { file: 'style.css', expected: 'text/css' },
        { file: 'data.json', expected: 'application/json' },
        { file: 'readme.md', expected: 'text/markdown' },
        { file: 'image.png', expected: 'image/png' },
        { file: 'unknown.xyz', expected: 'application/octet-stream' },
      ];

      for (const testCase of testCases) {
        const filePath = `/allowed/path/${testCase.file}`;

        mockFs.stat.mockResolvedValue({
          isFile: () => true,
          size: 100,
          mtime: new Date(),
        } as any);

        mockFs.readFile.mockResolvedValue('test content');

        const result = await provider.readFile(`file://${filePath}`);
        expect(result.mimeType).toBe(testCase.expected);
      }
    });
  });
});
