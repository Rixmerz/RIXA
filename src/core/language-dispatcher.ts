/**
 * Language Dispatcher - Central routing for language-specific debugging tools
 * 
 * This module provides a unified interface for debugging across different languages,
 * routing requests to the appropriate language-specific implementations.
 */

import type { Logger } from '../utils/logger.js';
import { BrowserDebugger } from '../typescript/browser-debugger.js';
import { ReactDebugger } from '../typescript/react-debugger.js';
import { NextJsDebugger } from '../typescript/nextjs-debugger.js';

export type SupportedLanguage = 
  | 'javascript' 
  | 'typescript' 
  | 'node' 
  | 'react' 
  | 'nextjs'
  | 'java' 
  | 'python' 
  | 'go' 
  | 'rust' 
  | 'csharp' 
  | 'dotnet';

export interface LanguageDebugSession {
  sessionId: string;
  language: SupportedLanguage;
  framework?: string | undefined;
  debugger?: any;
  metadata?: Record<string, any>;
}

export interface DebugConnectionOptions {
  language: SupportedLanguage;
  host?: string;
  port?: number;
  sessionId?: string;
  framework?: string;
  enableFrameworkTools?: boolean;
  [key: string]: any;
}

export interface DebugOperationResult {
  success: boolean;
  data?: any;
  error?: string;
  sessionId?: string;
  language: SupportedLanguage;
  operation: string;
}

/**
 * Central dispatcher for language-specific debugging operations
 */
export class LanguageDispatcher {
  private logger: Logger;
  private sessions: Map<string, LanguageDebugSession>;
  private debuggers: Map<SupportedLanguage, any>;

  constructor(logger: Logger) {
    this.logger = logger;
    this.sessions = new Map();
    this.debuggers = new Map();
  }

  /**
   * Connect to a debugging session for a specific language
   */
  async connect(options: DebugConnectionOptions): Promise<DebugOperationResult> {
    try {
      const { language, host = 'localhost', port, framework, enableFrameworkTools = true } = options;

      this.logger.info('Connecting to debug session', { language, host, port, framework });

      let debuggerInstance: any;
      let sessionInfo: any = {};

      switch (language) {
        case 'javascript':
        case 'typescript':
        case 'node':
          debuggerInstance = await this.connectToJavaScript({ host, port: port || 9229, enableFrameworkTools });
          break;

        case 'react':
          debuggerInstance = await this.connectToReact({ host, port: port || 9222, enableFrameworkTools });
          break;

        case 'nextjs':
          debuggerInstance = await this.connectToNextJs({ host, port: port || 9222, enableFrameworkTools });
          break;

        case 'java':
          debuggerInstance = await this.connectToJava({ host, port: port || 5005 });
          break;

        case 'python':
          debuggerInstance = await this.connectToPython({ host, port: port || 5678 });
          break;

        case 'go':
          debuggerInstance = await this.connectToGo({ host, port: port || 38697 });
          break;

        case 'rust':
          debuggerInstance = await this.connectToRust({ host, port: port || 2345 });
          break;

        case 'csharp':
        case 'dotnet':
          debuggerInstance = await this.connectToDotNet({ host, port: port || 4711 });
          break;

        default:
          throw new Error(`Unsupported language: ${language}`);
      }

      const sessionId = options.sessionId || `${language}-${Date.now()}`;
      const session: LanguageDebugSession = {
        sessionId,
        language,
        framework,
        debugger: debuggerInstance,
        metadata: sessionInfo
      };

      this.sessions.set(sessionId, session);
      this.debuggers.set(language, debuggerInstance);

      return {
        success: true,
        data: {
          sessionId,
          language,
          framework,
          connected: true,
          ...sessionInfo
        },
        sessionId,
        language,
        operation: 'connect'
      };

    } catch (error) {
      this.logger.error('Failed to connect to debug session', { 
        language: options.language, 
        error: error instanceof Error ? error.message : String(error) 
      });

      return {
        success: false,
        error: error instanceof Error ? error.message : String(error),
        language: options.language,
        operation: 'connect'
      };
    }
  }

  /**
   * Execute a debugging operation for a specific language
   */
  async executeOperation(
    sessionId: string, 
    operation: string, 
    params: Record<string, any> = {}
  ): Promise<DebugOperationResult> {
    try {
      const session = this.sessions.get(sessionId);
      if (!session) {
        throw new Error(`Session not found: ${sessionId}`);
      }

      this.logger.debug('Executing debug operation', { sessionId, operation, language: session.language });

      let result: any;

      switch (session.language) {
        case 'javascript':
        case 'typescript':
        case 'node':
          result = await this.executeJavaScriptOperation(session, operation, params);
          break;

        case 'react':
          result = await this.executeReactOperation(session, operation, params);
          break;

        case 'nextjs':
          result = await this.executeNextJsOperation(session, operation, params);
          break;

        case 'java':
          result = await this.executeJavaOperation(session, operation, params);
          break;

        case 'python':
          result = await this.executePythonOperation(session, operation, params);
          break;

        case 'go':
          result = await this.executeGoOperation(session, operation, params);
          break;

        case 'rust':
          result = await this.executeRustOperation(session, operation, params);
          break;

        case 'csharp':
        case 'dotnet':
          result = await this.executeDotNetOperation(session, operation, params);
          break;

        default:
          throw new Error(`Unsupported language: ${session.language}`);
      }

      return {
        success: true,
        data: result,
        sessionId,
        language: session.language,
        operation
      };

    } catch (error) {
      this.logger.error('Failed to execute debug operation', { 
        sessionId, 
        operation, 
        error: error instanceof Error ? error.message : String(error) 
      });

      const session = this.sessions.get(sessionId);
      return {
        success: false,
        error: error instanceof Error ? error.message : String(error),
        sessionId,
        language: session?.language || 'javascript',
        operation
      };
    }
  }

  /**
   * Get all active sessions
   */
  getSessions(): LanguageDebugSession[] {
    return Array.from(this.sessions.values());
  }

  /**
   * Get session by ID
   */
  getSession(sessionId: string): LanguageDebugSession | undefined {
    return this.sessions.get(sessionId);
  }

  /**
   * Disconnect and cleanup session
   */
  async disconnect(sessionId: string): Promise<DebugOperationResult> {
    try {
      const session = this.sessions.get(sessionId);
      if (!session) {
        throw new Error(`Session not found: ${sessionId}`);
      }

      // Cleanup language-specific resources
      if (session.debugger && typeof session.debugger.disconnect === 'function') {
        await session.debugger.disconnect();
      }

      this.sessions.delete(sessionId);

      return {
        success: true,
        data: { disconnected: true },
        sessionId,
        language: session.language,
        operation: 'disconnect'
      };

    } catch (error) {
      return {
        success: false,
        error: error instanceof Error ? error.message : String(error),
        sessionId,
        language: 'javascript',
        operation: 'disconnect'
      };
    }
  }

  // Language-specific connection methods
  private async connectToJavaScript(options: any): Promise<any> {
    const browserDebugger = new BrowserDebugger({
      host: options.host,
      port: options.port,
      enableReactDevTools: options.enableFrameworkTools,
      enableVueDevTools: options.enableFrameworkTools
    });

    const sessions = await browserDebugger.connect();
    return { browserDebugger, sessions };
  }

  private async connectToReact(options: any): Promise<any> {
    const browserDebugger = new BrowserDebugger({
      host: options.host,
      port: options.port,
      enableReactDevTools: true,
      enableVueDevTools: false
    });

    const sessions = await browserDebugger.connect();
    const reactDebugger = new ReactDebugger(browserDebugger);
    
    return { browserDebugger, reactDebugger, sessions };
  }

  private async connectToNextJs(options: any): Promise<any> {
    const browserDebugger = new BrowserDebugger({
      host: options.host,
      port: options.port,
      enableReactDevTools: true,
      enableVueDevTools: false
    });

    const sessions = await browserDebugger.connect();
    const reactDebugger = new ReactDebugger(browserDebugger);
    const nextJsDebugger = new NextJsDebugger(browserDebugger, reactDebugger);
    
    return { browserDebugger, reactDebugger, nextJsDebugger, sessions };
  }

  private async connectToJava(_options: any): Promise<any> {
    // Java connection logic (existing implementation)
    return { message: 'Java debugging connection - to be implemented' };
  }

  private async connectToPython(_options: any): Promise<any> {
    // Python connection logic
    return { message: 'Python debugging connection - to be implemented' };
  }

  private async connectToGo(_options: any): Promise<any> {
    // Go connection logic
    return { message: 'Go debugging connection - to be implemented' };
  }

  private async connectToRust(_options: any): Promise<any> {
    // Rust connection logic
    return { message: 'Rust debugging connection - to be implemented' };
  }

  private async connectToDotNet(_options: any): Promise<any> {
    // .NET connection logic
    return { message: '.NET debugging connection - to be implemented' };
  }

  // Language-specific operation methods will be implemented in the next part...
  private async executeJavaScriptOperation(session: LanguageDebugSession, operation: string, params: any): Promise<any> {
    const { browserDebugger } = session.debugger;
    
    switch (operation) {
      case 'setBreakpoint':
        return await browserDebugger.setBreakpoint(
          params.sessionId || session.sessionId,
          params.url,
          params.lineNumber,
          params.condition
        );
      
      case 'evaluate':
        return await browserDebugger.evaluateExpression(
          params.sessionId || session.sessionId,
          params.expression,
          params.contextId
        );
      
      default:
        throw new Error(`Unsupported JavaScript operation: ${operation}`);
    }
  }

  private async executeReactOperation(session: LanguageDebugSession, operation: string, params: any): Promise<any> {
    const { reactDebugger } = session.debugger;
    
    switch (operation) {
      case 'getComponents':
        return await reactDebugger.getComponentTree(params.sessionId || session.sessionId);
      
      case 'getComponentState':
        return await reactDebugger.getComponentState(
          params.sessionId || session.sessionId,
          params.componentName
        );
      
      case 'startProfiling':
        return await reactDebugger.startPerformanceProfiling(params.sessionId || session.sessionId);
      
      default:
        throw new Error(`Unsupported React operation: ${operation}`);
    }
  }

  private async executeNextJsOperation(session: LanguageDebugSession, operation: string, params: any): Promise<any> {
    const { nextJsDebugger } = session.debugger;
    
    switch (operation) {
      case 'getPageInfo':
        return await nextJsDebugger.getPageInfo(params.sessionId || session.sessionId);
      
      case 'getHydrationInfo':
        return await nextJsDebugger.getHydrationInfo(params.sessionId || session.sessionId);
      
      case 'analyzeHydrationMismatches':
        return await nextJsDebugger.analyzeHydrationMismatches(params.sessionId || session.sessionId);
      
      default:
        throw new Error(`Unsupported Next.js operation: ${operation}`);
    }
  }

  // Placeholder methods for other languages
  private async executeJavaOperation(_session: LanguageDebugSession, operation: string, _params: any): Promise<any> {
    throw new Error(`Java operations - to be implemented: ${operation}`);
  }

  private async executePythonOperation(_session: LanguageDebugSession, operation: string, _params: any): Promise<any> {
    throw new Error(`Python operations - to be implemented: ${operation}`);
  }

  private async executeGoOperation(_session: LanguageDebugSession, operation: string, _params: any): Promise<any> {
    throw new Error(`Go operations - to be implemented: ${operation}`);
  }

  private async executeRustOperation(_session: LanguageDebugSession, operation: string, _params: any): Promise<any> {
    throw new Error(`Rust operations - to be implemented: ${operation}`);
  }

  private async executeDotNetOperation(_session: LanguageDebugSession, operation: string, _params: any): Promise<any> {
    throw new Error(`.NET operations - to be implemented: ${operation}`);
  }
}
