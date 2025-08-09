#!/usr/bin/env node

import { Command } from 'commander';
import { WebSocket } from 'ws';
// Removed unused imports
import chalk from 'chalk';
import ora from 'ora';
import inquirer from 'inquirer';

/**
 * RIXA CLI - Command line interface for debugging operations
 */

interface RixaCliConfig {
  serverUrl: string;
  token?: string;
  timeout: number;
}

class RixaCli {
  private ws: WebSocket | null = null;
  private requestId = 1;
  private pendingRequests = new Map<string, { resolve: Function; reject: Function }>();

  constructor(private config: RixaCliConfig) {}

  async connect(): Promise<void> {
    return new Promise((resolve, reject) => {
      const spinner = ora('Connecting to RIXA server...').start();

      this.ws = new WebSocket(this.config.serverUrl);

      this.ws.on('open', () => {
        spinner.succeed('Connected to RIXA server');
        this.setupMessageHandling();
        resolve();
      });

      this.ws.on('error', (error) => {
        spinner.fail('Failed to connect to RIXA server');
        reject(error);
      });

      setTimeout(() => {
        if (this.ws?.readyState !== WebSocket.OPEN) {
          spinner.fail('Connection timeout');
          reject(new Error('Connection timeout'));
        }
      }, this.config.timeout);
    });
  }

  async disconnect(): Promise<void> {
    if (this.ws) {
      this.ws.close();
      this.ws = null;
    }
  }

  async initialize(): Promise<void> {
    const response = await this.sendRequest('initialize', {
      protocolVersion: '2024-11-05',
      capabilities: {
        tools: true,
        resources: true,
      },
      clientInfo: {
        name: 'RIXA CLI',
        version: '0.1.0',
      },
    });

    console.log(chalk.green('✓ Initialized MCP connection'));
    console.log(chalk.gray(`Server: ${response.result.serverInfo.name} v${response.result.serverInfo.version}`));
  }

  async listTools(): Promise<void> {
    const response = await this.sendRequest('tools/list');
    const tools = response.result.tools;

    console.log(chalk.blue('\nAvailable Debug Tools:'));
    console.log(chalk.blue('='.repeat(50)));

    for (const tool of tools) {
      console.log(chalk.yellow(`\n${tool.name}`));
      console.log(chalk.gray(`  ${tool.description}`));
      
      if (tool.inputSchema?.properties) {
        console.log(chalk.gray('  Parameters:'));
        for (const [param, schema] of Object.entries(tool.inputSchema.properties)) {
          const required = tool.inputSchema.required?.includes(param) ? chalk.red('*') : '';
          console.log(chalk.gray(`    ${param}${required}: ${(schema as any).description || 'No description'}`));
        }
      }
    }
  }

  async listResources(): Promise<void> {
    const response = await this.sendRequest('resources/list');
    const resources = response.result.resources;

    console.log(chalk.blue('\nAvailable Resources:'));
    console.log(chalk.blue('='.repeat(50)));

    for (const resource of resources) {
      console.log(chalk.yellow(`\n${resource.name}`));
      console.log(chalk.gray(`  URI: ${resource.uri}`));
      console.log(chalk.gray(`  Type: ${resource.mimeType}`));
      if (resource.description) {
        console.log(chalk.gray(`  Description: ${resource.description}`));
      }
    }
  }

  async createSession(): Promise<string> {
    const answers = await inquirer.prompt([
      {
        type: 'list',
        name: 'adapter',
        message: 'Select debug adapter:',
        choices: ['node', 'python', 'java', 'go'],
      },
      {
        type: 'input',
        name: 'program',
        message: 'Program to debug:',
        validate: (input) => input.length > 0 || 'Program path is required',
      },
      {
        type: 'input',
        name: 'args',
        message: 'Program arguments (comma-separated, optional):',
      },
      {
        type: 'input',
        name: 'cwd',
        message: 'Working directory (optional):',
      },
    ]);

    const spinner = ora('Creating debug session...').start();

    try {
      const response = await this.sendRequest('tools/call', {
        name: 'debug/createSession',
        arguments: {
          adapter: answers.adapter,
          program: answers.program,
          args: answers.args ? answers.args.split(',').map((s: string) => s.trim()) : [],
          cwd: answers.cwd || undefined,
        },
      });

      spinner.succeed('Debug session created');
      
      const content = response.result.content;
      const sessionInfo = JSON.parse(content[1].text);
      
      console.log(chalk.green(`\nSession ID: ${sessionInfo.sessionId}`));
      console.log(chalk.gray(`State: ${sessionInfo.state}`));
      
      return sessionInfo.sessionId;
    } catch (error) {
      spinner.fail('Failed to create session');
      throw error;
    }
  }

  async setBreakpoint(sessionId: string): Promise<void> {
    const answers = await inquirer.prompt([
      {
        type: 'input',
        name: 'file',
        message: 'File path:',
        validate: (input) => input.length > 0 || 'File path is required',
      },
      {
        type: 'number',
        name: 'line',
        message: 'Line number:',
        validate: (input) => (input && input > 0) || 'Line number must be positive',
      },
      {
        type: 'input',
        name: 'condition',
        message: 'Condition (optional):',
      },
    ]);

    const spinner = ora('Setting breakpoint...').start();

    try {
      const response = await this.sendRequest('tools/call', {
        name: 'debug/setBreakpoints',
        arguments: {
          sessionId,
          source: {
            path: answers.file,
          },
          breakpoints: [
            {
              line: answers.line,
              condition: answers.condition || undefined,
            },
          ],
        },
      });

      spinner.succeed('Breakpoint set');
      console.log(chalk.green(response.result.content[0].text));
    } catch (error) {
      spinner.fail('Failed to set breakpoint');
      throw error;
    }
  }

  async continueExecution(sessionId: string): Promise<void> {
    const threadsResponse = await this.sendRequest('tools/call', {
      name: 'debug/getThreads',
      arguments: { sessionId },
    });

    const threads = JSON.parse(threadsResponse.result.content[0].text);
    if (threads.length === 0) {
      console.log(chalk.yellow('No threads found'));
      return;
    }

    const threadId = threads[0].id;
    const spinner = ora('Continuing execution...').start();

    try {
      await this.sendRequest('tools/call', {
        name: 'debug/continue',
        arguments: {
          sessionId,
          threadId,
        },
      });

      spinner.succeed('Execution continued');
    } catch (error) {
      spinner.fail('Failed to continue execution');
      throw error;
    }
  }

  async getStackTrace(sessionId: string): Promise<void> {
    const threadsResponse = await this.sendRequest('tools/call', {
      name: 'debug/getThreads',
      arguments: { sessionId },
    });

    const threads = JSON.parse(threadsResponse.result.content[0].text);
    if (threads.length === 0) {
      console.log(chalk.yellow('No threads found'));
      return;
    }

    const threadId = threads[0].id;
    const spinner = ora('Getting stack trace...').start();

    try {
      const response = await this.sendRequest('tools/call', {
        name: 'debug/getStackTrace',
        arguments: {
          sessionId,
          threadId,
        },
      });

      spinner.succeed('Stack trace retrieved');
      
      const stackTrace = JSON.parse(response.result.content[0].text);
      console.log(chalk.blue('\nStack Trace:'));
      console.log(chalk.blue('='.repeat(50)));

      stackTrace.stackFrames.forEach((frame: any, index: number) => {
        console.log(chalk.yellow(`${index}: ${frame.name}`));
        console.log(chalk.gray(`    at ${frame.source?.path || 'unknown'}:${frame.line}:${frame.column}`));
      });
    } catch (error) {
      spinner.fail('Failed to get stack trace');
      throw error;
    }
  }

  async evaluateExpression(sessionId: string): Promise<void> {
    const answers = await inquirer.prompt([
      {
        type: 'input',
        name: 'expression',
        message: 'Expression to evaluate:',
        validate: (input) => input.length > 0 || 'Expression is required',
      },
    ]);

    const spinner = ora('Evaluating expression...').start();

    try {
      const response = await this.sendRequest('tools/call', {
        name: 'debug/evaluate',
        arguments: {
          sessionId,
          expression: answers.expression,
        },
      });

      spinner.succeed('Expression evaluated');
      console.log(chalk.green(response.result.content[0].text));
    } catch (error) {
      spinner.fail('Failed to evaluate expression');
      throw error;
    }
  }

  private async sendRequest(method: string, params?: any): Promise<any> {
    return new Promise((resolve, reject) => {
      if (!this.ws || this.ws.readyState !== WebSocket.OPEN) {
        reject(new Error('Not connected to server'));
        return;
      }

      const id = `req-${this.requestId++}`;
      const message = {
        jsonrpc: '2.0',
        id,
        method,
        params,
      };

      this.pendingRequests.set(id, { resolve, reject });

      this.ws.send(JSON.stringify(message));

      // Set timeout
      setTimeout(() => {
        if (this.pendingRequests.has(id)) {
          this.pendingRequests.delete(id);
          reject(new Error('Request timeout'));
        }
      }, this.config.timeout);
    });
  }

  private setupMessageHandling(): void {
    if (!this.ws) return;

    this.ws.on('message', (data) => {
      try {
        const message = JSON.parse(data.toString());

        if (message.id && this.pendingRequests.has(message.id)) {
          const { resolve, reject } = this.pendingRequests.get(message.id)!;
          this.pendingRequests.delete(message.id);

          if (message.error) {
            reject(new Error(message.error.message));
          } else {
            resolve(message);
          }
        } else if (message.method) {
          // Handle notifications
          this.handleNotification(message);
        }
      } catch (error) {
        console.error(chalk.red('Failed to parse message:'), error);
      }
    });
  }

  private handleNotification(message: any): void {
    if (message.method.startsWith('notifications/debug/')) {
      const eventType = message.method.replace('notifications/debug/', '');
      
      switch (eventType) {
        case 'stopped':
          console.log(chalk.yellow(`\n🛑 Execution stopped: ${message.params.reason}`));
          if (message.params.text) {
            console.log(chalk.gray(`   ${message.params.text}`));
          }
          break;
        case 'output':
          if (message.params.category === 'stdout') {
            process.stdout.write(message.params.output);
          } else if (message.params.category === 'stderr') {
            process.stderr.write(chalk.red(message.params.output));
          } else {
            console.log(chalk.gray(message.params.output));
          }
          break;
        case 'terminated':
          console.log(chalk.red('\n💀 Debug session terminated'));
          break;
        default:
          console.log(chalk.blue(`\n📡 ${eventType}:`, JSON.stringify(message.params, null, 2)));
      }
    }
  }
}

// CLI Commands
async function main() {
  const program = new Command();

  program
    .name('rixa')
    .description('RIXA CLI - Runtime Intelligent eXecution Adapter')
    .version('0.1.0');

  program
    .option('-u, --url <url>', 'RIXA server URL', 'ws://localhost:3000/mcp')
    .option('-t, --token <token>', 'Authentication token')
    .option('--timeout <ms>', 'Request timeout in milliseconds', '30000');

  program
    .command('connect')
    .description('Test connection to RIXA server')
    .action(async () => {
      const config: RixaCliConfig = {
        serverUrl: program.opts()['url'],
        token: program.opts()['token'],
        timeout: parseInt(program.opts()['timeout']),
      };

      const cli = new RixaCli(config);

      try {
        await cli.connect();
        await cli.initialize();
        console.log(chalk.green('✓ Connection successful'));
        await cli.disconnect();
      } catch (error) {
        console.error(chalk.red('✗ Connection failed:'), error instanceof Error ? error.message : error);
        process.exit(1);
      }
    });

  program
    .command('tools')
    .description('List available debug tools')
    .action(async () => {
      const config: RixaCliConfig = {
        serverUrl: program.opts()['url'],
        token: program.opts()['token'],
        timeout: parseInt(program.opts()['timeout']),
      };

      const cli = new RixaCli(config);

      try {
        await cli.connect();
        await cli.initialize();
        await cli.listTools();
        await cli.disconnect();
      } catch (error) {
        console.error(chalk.red('Error:'), error instanceof Error ? error.message : error);
        process.exit(1);
      }
    });

  program
    .command('resources')
    .description('List available resources')
    .action(async () => {
      const config: RixaCliConfig = {
        serverUrl: program.opts()['url'],
        token: program.opts()['token'],
        timeout: parseInt(program.opts()['timeout']),
      };

      const cli = new RixaCli(config);

      try {
        await cli.connect();
        await cli.initialize();
        await cli.listResources();
        await cli.disconnect();
      } catch (error) {
        console.error(chalk.red('Error:'), error instanceof Error ? error.message : error);
        process.exit(1);
      }
    });

  program
    .command('debug')
    .description('Start interactive debugging session')
    .action(async () => {
      const config: RixaCliConfig = {
        serverUrl: program.opts()['url'],
        token: program.opts()['token'],
        timeout: parseInt(program.opts()['timeout']),
      };

      const cli = new RixaCli(config);

      try {
        await cli.connect();
        await cli.initialize();

        console.log(chalk.blue('\n🚀 Starting interactive debugging session'));
        const sessionId = await cli.createSession();

        // Interactive debugging loop
        while (true) {
          const action = await inquirer.prompt([
            {
              type: 'list',
              name: 'action',
              message: 'What would you like to do?',
              choices: [
                'Set breakpoint',
                'Continue execution',
                'Get stack trace',
                'Evaluate expression',
                'Exit',
              ],
            },
          ]);

          try {
            switch (action.action) {
              case 'Set breakpoint':
                await cli.setBreakpoint(sessionId);
                break;
              case 'Continue execution':
                await cli.continueExecution(sessionId);
                break;
              case 'Get stack trace':
                await cli.getStackTrace(sessionId);
                break;
              case 'Evaluate expression':
                await cli.evaluateExpression(sessionId);
                break;
              case 'Exit':
                console.log(chalk.blue('👋 Goodbye!'));
                await cli.disconnect();
                return;
            }
          } catch (error) {
            console.error(chalk.red('Error:'), error instanceof Error ? error.message : error);
          }
        }
      } catch (error) {
        console.error(chalk.red('Error:'), error instanceof Error ? error.message : error);
        process.exit(1);
      }
    });

  program
    .command('create-session')
    .description('Create a debug session')
    .requiredOption('-a, --adapter <adapter>', 'Debug adapter (node, python, java, go)')
    .requiredOption('-p, --program <program>', 'Program to debug')
    .option('--args <args>', 'Program arguments (comma-separated)')
    .option('--cwd <cwd>', 'Working directory')
    .action(async (options) => {
      const config: RixaCliConfig = {
        serverUrl: program.opts()['url'],
        token: program.opts()['token'],
        timeout: parseInt(program.opts()['timeout']),
      };

      const cli = new RixaCli(config);

      try {
        await cli.connect();
        await cli.initialize();

        const response = await (cli as any).sendRequest('tools/call', {
          name: 'debug/createSession',
          arguments: {
            adapter: options.adapter,
            program: options.program,
            args: options.args ? options.args.split(',').map((s: string) => s.trim()) : [],
            cwd: options.cwd,
          },
        });

        const content = response.result.content;
        const sessionInfo = JSON.parse(content[1].text);

        console.log(chalk.green('✓ Debug session created'));
        console.log(chalk.yellow(`Session ID: ${sessionInfo.sessionId}`));
        console.log(chalk.gray(`State: ${sessionInfo.state}`));

        await cli.disconnect();
      } catch (error) {
        console.error(chalk.red('Error:'), error instanceof Error ? error.message : error);
        process.exit(1);
      }
    });

  await program.parseAsync();
}

// Handle uncaught errors
process.on('uncaughtException', (error) => {
  console.error(chalk.red('Uncaught exception:'), error);
  process.exit(1);
});

process.on('unhandledRejection', (reason) => {
  console.error(chalk.red('Unhandled rejection:'), reason);
  process.exit(1);
});

// Run CLI
if (import.meta.url === `file://${process.argv[1]}`) {
  main().catch((error) => {
    console.error(chalk.red('CLI error:'), error);
    process.exit(1);
  });
}
