/**
 * Next.js Framework Debugging Integration
 * 
 * This module provides comprehensive Next.js debugging capabilities
 * including SSR debugging, API route debugging, and performance analysis.
 */

import { EventEmitter } from 'events';
import { BrowserDebugger } from './browser-debugger.js';
import { ReactDebugger } from './react-debugger.js';
import type { Logger } from '../utils/logger.js';

// Simple logger implementation for TypeScript debugging
class SimpleLogger implements Logger {
  constructor(private name: string) {}

  error(message: string, meta?: Record<string, unknown>): void {
    console.error(`[${this.name}] ERROR: ${message}`, meta || '');
  }

  warn(message: string, meta?: Record<string, unknown>): void {
    console.warn(`[${this.name}] WARN: ${message}`, meta || '');
  }

  info(message: string, meta?: Record<string, unknown>): void {
    console.info(`[${this.name}] INFO: ${message}`, meta || '');
  }

  debug(message: string, meta?: Record<string, unknown>): void {
    console.debug(`[${this.name}] DEBUG: ${message}`, meta || '');
  }

  child(): Logger {
    return this;
  }
}

export interface NextJsPageInfo {
  route: string;
  isSSR: boolean;
  isSSG: boolean;
  isISR: boolean;
  props: any;
  query: any;
  buildId: string;
  hydrationTime?: number;
  renderTime?: number;
}

export interface NextJsApiRoute {
  route: string;
  method: string;
  handler: string;
  middleware: string[];
  responseTime?: number;
  statusCode?: number;
}

export interface NextJsHydrationInfo {
  pageRoute: string;
  hydrationStart: number;
  hydrationEnd: number;
  hydrationTime: number;
  errors: Array<{
    message: string;
    stack: string;
    component: string;
  }>;
  warnings: string[];
}

export interface NextJsPerformanceMetrics {
  pageLoadTime: number;
  hydrationTime: number;
  firstContentfulPaint: number;
  largestContentfulPaint: number;
  cumulativeLayoutShift: number;
  firstInputDelay: number;
  bundleSize: {
    total: number;
    javascript: number;
    css: number;
  };
  apiResponseTimes: Array<{
    route: string;
    time: number;
  }>;
}

export class NextJsDebugger extends EventEmitter {
  private logger: Logger;
  private browserDebugger: BrowserDebugger;

  constructor(browserDebugger: BrowserDebugger, _reactDebugger: ReactDebugger) {
    super();
    this.logger = new SimpleLogger('NextJsDebugger');
    this.browserDebugger = browserDebugger;
  }

  /**
   * Initialize Next.js debugging for a session
   */
  async initializeNextJsDebugging(sessionId: string): Promise<void> {
    try {
      // Inject Next.js debugging utilities
      await this.browserDebugger.evaluateExpression(sessionId, `
        (function() {
          if (window.__RIXA_NEXTJS_DEBUGGER__) return;
          
          window.__RIXA_NEXTJS_DEBUGGER__ = {
            pageInfo: null,
            apiCalls: [],
            hydrationInfo: null,
            performanceMetrics: {},
            
            // Initialize Next.js debugging
            initialize: function() {
              this.capturePageInfo();
              this.setupHydrationTracking();
              this.setupApiTracking();
              this.setupPerformanceTracking();
              return true;
            },
            
            // Capture Next.js page information
            capturePageInfo: function() {
              const nextData = window.__NEXT_DATA__;
              if (!nextData) return null;
              
              this.pageInfo = {
                route: nextData.page,
                isSSR: nextData.isFallback === false && nextData.gssp === true,
                isSSG: nextData.isFallback === false && nextData.gsp === true,
                isISR: nextData.isFallback === true,
                props: nextData.props,
                query: nextData.query,
                buildId: nextData.buildId
              };
              
              return this.pageInfo;
            },
            
            // Setup hydration tracking
            setupHydrationTracking: function() {
              const originalHydrate = window.React?.hydrate || window.ReactDOM?.hydrate;
              if (!originalHydrate) return;
              
              const self = this;
              const hydrationStart = performance.now();
              
              // Track hydration errors
              window.addEventListener('error', function(event) {
                if (event.error && event.error.message.includes('hydrat')) {
                  if (!self.hydrationInfo) {
                    self.hydrationInfo = {
                      pageRoute: self.pageInfo?.route || 'unknown',
                      hydrationStart,
                      hydrationEnd: 0,
                      hydrationTime: 0,
                      errors: [],
                      warnings: []
                    };
                  }
                  
                  self.hydrationInfo.errors.push({
                    message: event.error.message,
                    stack: event.error.stack,
                    component: 'unknown'
                  });
                }
              });
              
              // Track hydration completion
              setTimeout(() => {
                const hydrationEnd = performance.now();
                if (!self.hydrationInfo) {
                  self.hydrationInfo = {
                    pageRoute: self.pageInfo?.route || 'unknown',
                    hydrationStart,
                    hydrationEnd,
                    hydrationTime: hydrationEnd - hydrationStart,
                    errors: [],
                    warnings: []
                  };
                } else {
                  self.hydrationInfo.hydrationEnd = hydrationEnd;
                  self.hydrationInfo.hydrationTime = hydrationEnd - hydrationStart;
                }
              }, 0);
            },
            
            // Setup API call tracking
            setupApiTracking: function() {
              const originalFetch = window.fetch;
              const self = this;
              
              window.fetch = function(url, options) {
                const startTime = performance.now();
                const isApiRoute = typeof url === 'string' && url.startsWith('/api/');
                
                if (isApiRoute) {
                  return originalFetch.apply(this, arguments).then(response => {
                    const endTime = performance.now();
                    
                    self.apiCalls.push({
                      route: url,
                      method: options?.method || 'GET',
                      responseTime: endTime - startTime,
                      statusCode: response.status,
                      timestamp: Date.now()
                    });
                    
                    return response;
                  });
                }
                
                return originalFetch.apply(this, arguments);
              };
            },
            
            // Setup performance tracking
            setupPerformanceTracking: function() {
              const self = this;
              
              // Track Core Web Vitals
              if ('PerformanceObserver' in window) {
                // First Contentful Paint
                new PerformanceObserver((list) => {
                  for (const entry of list.getEntries()) {
                    if (entry.name === 'first-contentful-paint') {
                      self.performanceMetrics.firstContentfulPaint = entry.startTime;
                    }
                  }
                }).observe({ entryTypes: ['paint'] });
                
                // Largest Contentful Paint
                new PerformanceObserver((list) => {
                  const entries = list.getEntries();
                  const lastEntry = entries[entries.length - 1];
                  self.performanceMetrics.largestContentfulPaint = lastEntry.startTime;
                }).observe({ entryTypes: ['largest-contentful-paint'] });
                
                // Cumulative Layout Shift
                new PerformanceObserver((list) => {
                  let clsValue = 0;
                  for (const entry of list.getEntries()) {
                    if (!entry.hadRecentInput) {
                      clsValue += entry.value;
                    }
                  }
                  self.performanceMetrics.cumulativeLayoutShift = clsValue;
                }).observe({ entryTypes: ['layout-shift'] });
                
                // First Input Delay
                new PerformanceObserver((list) => {
                  for (const entry of list.getEntries()) {
                    self.performanceMetrics.firstInputDelay = entry.processingStart - entry.startTime;
                  }
                }).observe({ entryTypes: ['first-input'] });
              }
              
              // Track bundle size
              if (performance.getEntriesByType) {
                const resources = performance.getEntriesByType('resource');
                let totalSize = 0;
                let jsSize = 0;
                let cssSize = 0;
                
                resources.forEach(resource => {
                  if (resource.transferSize) {
                    totalSize += resource.transferSize;
                    
                    if (resource.name.endsWith('.js')) {
                      jsSize += resource.transferSize;
                    } else if (resource.name.endsWith('.css')) {
                      cssSize += resource.transferSize;
                    }
                  }
                });
                
                self.performanceMetrics.bundleSize = {
                  total: totalSize,
                  javascript: jsSize,
                  css: cssSize
                };
              }
            },
            
            // Get page information
            getPageInfo: function() {
              return this.pageInfo;
            },
            
            // Get hydration information
            getHydrationInfo: function() {
              return this.hydrationInfo;
            },
            
            // Get API call history
            getApiCalls: function() {
              return this.apiCalls;
            },
            
            // Get performance metrics
            getPerformanceMetrics: function() {
              return this.performanceMetrics;
            },
            
            // Debug SSR props
            debugSSRProps: function() {
              const nextData = window.__NEXT_DATA__;
              if (!nextData) return null;
              
              return {
                pageProps: nextData.props?.pageProps,
                staticProps: nextData.props?.staticProps,
                serverSideProps: nextData.props?.serverSideProps,
                query: nextData.query,
                locale: nextData.locale,
                locales: nextData.locales
              };
            },
            
            // Simulate server-side rendering
            simulateSSR: function(componentName) {
              // This would require more complex implementation
              // to actually render components server-side
              return {
                html: '<div>SSR simulation not fully implemented</div>',
                props: {},
                warnings: ['SSR simulation is limited in browser environment']
              };
            }
          };
          
          // Initialize
          return window.__RIXA_NEXTJS_DEBUGGER__.initialize();
        })()
      `);

      this.logger.info('Next.js debugging initialized', { sessionId });
    } catch (error) {
      this.logger.error('Failed to initialize Next.js debugging', { sessionId, error });
      throw error;
    }
  }

  /**
   * Get Next.js page information
   */
  async getPageInfo(sessionId: string): Promise<NextJsPageInfo | null> {
    try {
      const pageInfo = await this.browserDebugger.evaluateExpression(sessionId, `
        window.__RIXA_NEXTJS_DEBUGGER__.getPageInfo()
      `);

      return pageInfo;
    } catch (error) {
      this.logger.error('Failed to get page info', { sessionId, error });
      throw error;
    }
  }

  /**
   * Get hydration information
   */
  async getHydrationInfo(sessionId: string): Promise<NextJsHydrationInfo | null> {
    try {
      const hydrationInfo = await this.browserDebugger.evaluateExpression(sessionId, `
        window.__RIXA_NEXTJS_DEBUGGER__.getHydrationInfo()
      `);

      return hydrationInfo;
    } catch (error) {
      this.logger.error('Failed to get hydration info', { sessionId, error });
      throw error;
    }
  }

  /**
   * Get API call history
   */
  async getApiCalls(sessionId: string): Promise<any[]> {
    try {
      const apiCalls = await this.browserDebugger.evaluateExpression(sessionId, `
        window.__RIXA_NEXTJS_DEBUGGER__.getApiCalls()
      `);

      return apiCalls || [];
    } catch (error) {
      this.logger.error('Failed to get API calls', { sessionId, error });
      throw error;
    }
  }

  /**
   * Get performance metrics
   */
  async getPerformanceMetrics(sessionId: string): Promise<NextJsPerformanceMetrics | null> {
    try {
      const metrics = await this.browserDebugger.evaluateExpression(sessionId, `
        window.__RIXA_NEXTJS_DEBUGGER__.getPerformanceMetrics()
      `);

      return metrics;
    } catch (error) {
      this.logger.error('Failed to get performance metrics', { sessionId, error });
      throw error;
    }
  }

  /**
   * Debug SSR props
   */
  async debugSSRProps(sessionId: string): Promise<any> {
    try {
      const ssrProps = await this.browserDebugger.evaluateExpression(sessionId, `
        window.__RIXA_NEXTJS_DEBUGGER__.debugSSRProps()
      `);

      return ssrProps;
    } catch (error) {
      this.logger.error('Failed to debug SSR props', { sessionId, error });
      throw error;
    }
  }

  /**
   * Set breakpoint on API route
   */
  async setApiRouteBreakpoint(sessionId: string, route: string): Promise<void> {
    try {
      // This would require server-side integration for full functionality
      await this.browserDebugger.evaluateExpression(sessionId, `
        (function() {
          const originalFetch = window.fetch;
          window.fetch = function(url, options) {
            if (url === '${route}') {
              debugger; // Trigger breakpoint
            }
            return originalFetch.apply(this, arguments);
          };
        })()
      `);

      this.logger.info('API route breakpoint set', { sessionId, route });
    } catch (error) {
      this.logger.error('Failed to set API route breakpoint', { sessionId, route, error });
      throw error;
    }
  }

  /**
   * Analyze hydration mismatches
   */
  async analyzeHydrationMismatches(sessionId: string): Promise<Array<{ component: string; issue: string; suggestion: string }>> {
    try {
      const hydrationInfo = await this.getHydrationInfo(sessionId);
      const mismatches = [];

      if (hydrationInfo?.errors.length) {
        for (const error of hydrationInfo.errors) {
          mismatches.push({
            component: error.component,
            issue: error.message,
            suggestion: this.getHydrationSuggestion(error.message)
          });
        }
      }

      return mismatches;
    } catch (error) {
      this.logger.error('Failed to analyze hydration mismatches', { sessionId, error });
      throw error;
    }
  }

  /**
   * Get hydration suggestion based on error message
   */
  private getHydrationSuggestion(errorMessage: string): string {
    if (errorMessage.includes('Text content does not match')) {
      return 'Check for dynamic content that differs between server and client. Use useEffect for client-only content.';
    }
    if (errorMessage.includes('Expected server HTML to contain')) {
      return 'Ensure server and client render the same HTML structure. Check for conditional rendering.';
    }
    if (errorMessage.includes('Hydration failed')) {
      return 'Use suppressHydrationWarning={true} for intentionally different content, or fix the mismatch.';
    }
    return 'Review server-side and client-side rendering logic for consistency.';
  }

  /**
   * Get bundle analysis
   */
  async getBundleAnalysis(sessionId: string): Promise<any> {
    try {
      const analysis = await this.browserDebugger.evaluateExpression(sessionId, `
        (function() {
          const resources = performance.getEntriesByType('resource');
          const bundles = resources.filter(r => r.name.includes('/_next/static/'));
          
          return {
            totalBundles: bundles.length,
            totalSize: bundles.reduce((sum, b) => sum + (b.transferSize || 0), 0),
            largestBundle: bundles.reduce((largest, current) => 
              (current.transferSize || 0) > (largest.transferSize || 0) ? current : largest, {}),
            bundlesByType: {
              javascript: bundles.filter(b => b.name.endsWith('.js')),
              css: bundles.filter(b => b.name.endsWith('.css')),
              images: bundles.filter(b => /\\.(png|jpg|jpeg|gif|svg|webp)$/.test(b.name))
            }
          };
        })()
      `);

      return analysis;
    } catch (error) {
      this.logger.error('Failed to get bundle analysis', { sessionId, error });
      throw error;
    }
  }

  /**
   * Simulate server-side rendering
   */
  async simulateSSR(sessionId: string, componentName: string): Promise<any> {
    try {
      const result = await this.browserDebugger.evaluateExpression(sessionId, `
        window.__RIXA_NEXTJS_DEBUGGER__.simulateSSR('${componentName}')
      `);

      return result;
    } catch (error) {
      this.logger.error('Failed to simulate SSR', { sessionId, componentName, error });
      throw error;
    }
  }
}
