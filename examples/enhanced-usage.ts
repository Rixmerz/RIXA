#!/usr/bin/env tsx

/**
 * Enhanced RIXA Usage Example
 * 
 * This example demonstrates the enhanced features of RIXA including:
 * - Project resource analysis
 * - Health monitoring
 * - Rate limiting
 * - Enhanced debugging tools
 */

import { RixaIntegration } from '../src/core/integration.js';
import { createLogger } from '../src/utils/logger.js';
import type { AppConfig } from '../src/types/config.js';

async function demonstrateEnhancedFeatures() {
  console.log('🚀 RIXA Enhanced Features Demo');
  console.log('================================\n');

  // Create enhanced configuration
  const config: AppConfig = {
    server: {
      host: 'localhost',
      port: 3000,
      path: '/mcp',
    },
    auth: {
      enabled: true,
      tokens: ['demo-token-123'],
    },
    filesystem: {
      allowedPaths: [process.cwd()],
      excludePatterns: ['node_modules/**', '*.log', '.git/**', 'dist/**'],
      readOnly: false,
      maxFileSize: 10 * 1024 * 1024, // 10MB
    },
    logging: {
      level: 'info',
      format: 'json',
      file: {
        enabled: false,
        path: '',
        maxSize: 0,
        maxFiles: 0,
      },
    },
  };

  // Create logger
  const logger = createLogger(config.logging, { requestId: 'enhanced-demo' });

  // Create RIXA integration
  const rixa = new RixaIntegration(config, logger);

  try {
    // Start RIXA
    console.log('📡 Starting RIXA with enhanced features...');
    await rixa.start();
    console.log('✅ RIXA started successfully\n');

    // Demonstrate health monitoring
    console.log('🏥 Health Monitoring Demo');
    console.log('-------------------------');
    
    // Wait a moment for metrics to initialize
    await new Promise(resolve => setTimeout(resolve, 1000));

    // Get health status
    try {
      const healthResponse = await fetch('http://localhost:3000/health');
      const healthData = await healthResponse.json();
      console.log('Health Status:', healthData.status);
      console.log('Uptime:', Math.round(healthData.uptime / 1000), 'seconds');
      console.log('Checks:', Object.keys(healthData.checks || {}).length, 'health checks\n');
    } catch (error) {
      console.log('Health endpoint not available (expected in this demo)\n');
    }

    // Demonstrate metrics
    console.log('📊 Metrics Demo');
    console.log('---------------');
    
    try {
      const metricsResponse = await fetch('http://localhost:3000/metrics');
      const metricsData = await metricsResponse.json();
      console.log('Memory Usage:', Math.round(metricsData.memory.percentage), '%');
      console.log('Total Connections:', metricsData.connections.total);
      console.log('Active Sessions:', metricsData.sessions.active);
      console.log('Total Requests:', metricsData.requests.total, '\n');
    } catch (error) {
      console.log('Metrics endpoint not available (expected in this demo)\n');
    }

    // Demonstrate WebSocket MCP connection
    console.log('🔌 MCP Connection Demo');
    console.log('----------------------');

    const WebSocket = (await import('ws')).WebSocket;
    const ws = new WebSocket('ws://localhost:3000/mcp');

    await new Promise((resolve, reject) => {
      ws.on('open', resolve);
      ws.on('error', reject);
      setTimeout(() => reject(new Error('Connection timeout')), 5000);
    });

    console.log('✅ Connected to MCP server');

    // Initialize MCP connection
    const initRequest = {
      jsonrpc: '2.0',
      id: 'init-1',
      method: 'initialize',
      params: {
        protocolVersion: '2024-11-05',
        capabilities: { tools: true, resources: true },
        clientInfo: { name: 'Enhanced Demo', version: '0.1.0' },
      },
    };

    ws.send(JSON.stringify(initRequest));

    // Wait for initialize response
    const initResponse = await new Promise((resolve) => {
      ws.on('message', (data) => {
        const message = JSON.parse(data.toString());
        if (message.id === 'init-1') {
          resolve(message);
        }
      });
    });

    console.log('✅ MCP connection initialized');
    console.log('Server:', (initResponse as any).result.serverInfo.name, '\n');

    // List enhanced resources
    console.log('📁 Enhanced Resources Demo');
    console.log('--------------------------');

    const resourcesRequest = {
      jsonrpc: '2.0',
      id: 'resources-1',
      method: 'resources/list',
    };

    ws.send(JSON.stringify(resourcesRequest));

    const resourcesResponse = await new Promise((resolve) => {
      ws.on('message', (data) => {
        const message = JSON.parse(data.toString());
        if (message.id === 'resources-1') {
          resolve(message);
        }
      });
    });

    const resources = (resourcesResponse as any).result.resources;
    console.log('Total Resources:', resources.length);
    
    // Show project resources
    const projectResources = resources.filter((r: any) => r.uri.startsWith('project://'));
    console.log('Project Resources:', projectResources.length);
    
    projectResources.forEach((resource: any) => {
      console.log(`  - ${resource.name}`);
      console.log(`    URI: ${resource.uri}`);
      console.log(`    Type: ${resource.mimeType}`);
    });
    console.log();

    // Demonstrate project tree resource
    if (projectResources.length > 0) {
      console.log('🌳 Project Tree Demo');
      console.log('--------------------');

      const treeResource = projectResources.find((r: any) => r.uri.includes('/tree/'));
      if (treeResource) {
        const treeRequest = {
          jsonrpc: '2.0',
          id: 'tree-1',
          method: 'resources/read',
          params: { uri: treeResource.uri },
        };

        ws.send(JSON.stringify(treeRequest));

        const treeResponse = await new Promise((resolve) => {
          ws.on('message', (data) => {
            const message = JSON.parse(data.toString());
            if (message.id === 'tree-1') {
              resolve(message);
            }
          });
        });

        const treeContent = (treeResponse as any).result.contents[0].text;
        const tree = JSON.parse(treeContent);
        
        console.log('Project:', tree.name);
        console.log('Type:', tree.type);
        console.log('Children:', tree.children?.length || 0);
        
        if (tree.children && tree.children.length > 0) {
          console.log('Sample files:');
          tree.children.slice(0, 3).forEach((child: any) => {
            console.log(`  - ${child.name} (${child.type})`);
          });
        }
        console.log();
      }
    }

    // List available debug tools
    console.log('🛠️  Debug Tools Demo');
    console.log('--------------------');

    const toolsRequest = {
      jsonrpc: '2.0',
      id: 'tools-1',
      method: 'tools/list',
    };

    ws.send(JSON.stringify(toolsRequest));

    const toolsResponse = await new Promise((resolve) => {
      ws.on('message', (data) => {
        const message = JSON.parse(data.toString());
        if (message.id === 'tools-1') {
          resolve(message);
        }
      });
    });

    const tools = (toolsResponse as any).result.tools;
    console.log('Available Debug Tools:', tools.length);
    
    tools.forEach((tool: any) => {
      console.log(`  - ${tool.name}: ${tool.description}`);
    });
    console.log();

    // Demonstrate debug session creation
    console.log('🐛 Debug Session Demo');
    console.log('---------------------');

    // Create a simple test script
    const testScript = `
console.log('Hello from test script!');
const x = 42;
const y = x * 2;
console.log('Result:', y);
`;

    // Note: In a real scenario, you would create an actual file
    console.log('Demo would create debug session for Node.js script');
    console.log('Script content preview:');
    console.log(testScript.trim());
    console.log();

    // Close WebSocket connection
    ws.close();
    console.log('✅ MCP connection closed');

  } catch (error) {
    console.error('❌ Demo failed:', error instanceof Error ? error.message : error);
  } finally {
    // Stop RIXA
    console.log('\n🛑 Stopping RIXA...');
    await rixa.stop();
    console.log('✅ RIXA stopped successfully');
  }
}

// CLI usage examples
function showCliExamples() {
  console.log('\n📋 CLI Usage Examples');
  console.log('=====================\n');

  const examples = [
    {
      title: 'Test Connection',
      command: 'npm run cli connect',
      description: 'Test connection to RIXA server',
    },
    {
      title: 'List Tools',
      command: 'npm run cli tools',
      description: 'Show available debug tools',
    },
    {
      title: 'List Resources',
      command: 'npm run cli resources',
      description: 'Show available project resources',
    },
    {
      title: 'Interactive Debugging',
      command: 'npm run cli debug',
      description: 'Start interactive debugging session',
    },
    {
      title: 'Create Node.js Session',
      command: 'npm run cli create-session -a node -p ./app.js',
      description: 'Create debug session for Node.js application',
    },
    {
      title: 'Create with Arguments',
      command: 'npm run cli create-session -a node -p ./app.js --args "arg1,arg2" --cwd ./project',
      description: 'Create session with program arguments and working directory',
    },
  ];

  examples.forEach((example, index) => {
    console.log(`${index + 1}. ${example.title}`);
    console.log(`   Command: ${example.command}`);
    console.log(`   Description: ${example.description}\n`);
  });
}

// Main execution
async function main() {
  if (process.argv.includes('--cli-examples')) {
    showCliExamples();
    return;
  }

  await demonstrateEnhancedFeatures();
}

// Handle errors
process.on('uncaughtException', (error) => {
  console.error('❌ Uncaught exception:', error);
  process.exit(1);
});

process.on('unhandledRejection', (reason) => {
  console.error('❌ Unhandled rejection:', reason);
  process.exit(1);
});

// Run demo
if (import.meta.url === `file://${process.argv[1]}`) {
  main().catch((error) => {
    console.error('❌ Demo failed:', error);
    process.exit(1);
  });
}

export { demonstrateEnhancedFeatures, showCliExamples };
