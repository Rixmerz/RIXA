# MCP Integration Guide

This guide provides comprehensive instructions for integrating RIXA with Model Context Protocol (MCP) clients like Claude Desktop.

## Overview

RIXA acts as an MCP server that provides debugging capabilities to AI clients. When properly configured, AI clients can use RIXA's 17 debugging tools to interact with debug adapters and manage debugging sessions.

## Supported MCP Clients

- **Claude Desktop** (Primary support)
- **Other MCP-compatible clients** (Generic configuration provided)

## Configuration Files

### Template Files Provided

1. **`claude_desktop_config.json`** - Complete template with detailed comments
2. **`examples/claude-desktop-basic.json`** - Minimal configuration for quick setup
3. **`examples/claude-desktop-advanced.json`** - Production-ready configuration

## Step-by-Step Setup

### 1. Prerequisites

- RIXA installed and built (`npm run build`)
- Claude Desktop installed
- Node.js 20+ available in PATH

### 2. Locate Configuration File

**macOS:**
```bash
~/Library/Application Support/Claude/claude_desktop_config.json
```

**Windows:**
```bash
%APPDATA%/Claude/claude_desktop_config.json
```

**Linux:**
```bash
~/.config/Claude/claude_desktop_config.json
```

### 3. Configuration Options

#### Essential Settings

| Setting | Description | Example |
|---------|-------------|---------|
| `command` | Node.js executable | `"node"` |
| `args` | Path to RIXA's built file | `["/path/to/RIXA/dist/index.js"]` |
| `RIXA_AUTH_TOKENS` | Authentication tokens | `"your-secure-token"` |
| `RIXA_FS_ALLOWED_PATHS` | Allowed filesystem paths | `"/Users/name/projects"` |

#### Security Settings

| Setting | Description | Default | Recommended |
|---------|-------------|---------|-------------|
| `RIXA_AUTH_ENABLED` | Enable authentication | `"true"` | `"true"` |
| `RIXA_FS_READ_ONLY` | Read-only filesystem | `"false"` | `"false"` for debugging |
| `RIXA_FS_MAX_FILE_SIZE` | Max file size (bytes) | `"10485760"` | `"10485760"` (10MB) |
| `RIXA_FS_EXCLUDE_PATTERNS` | File patterns to exclude | `"node_modules/**,*.log"` | Include build dirs |

#### Performance Settings

| Setting | Description | Default | Notes |
|---------|-------------|---------|-------|
| `RIXA_RATE_LIMIT_MAX_REQUESTS` | Max requests per window | `"100"` | Adjust based on usage |
| `RIXA_RATE_LIMIT_WINDOW_MS` | Rate limit window (ms) | `"60000"` | 1 minute |
| `RIXA_MAX_SESSIONS` | Max concurrent sessions | `"5"` | Increase for team use |
| `RIXA_DAP_TIMEOUT` | Debug adapter timeout | `"30000"` | 30 seconds |

### 4. Platform-Specific Examples

#### macOS Configuration
```json
{
  "mcpServers": {
    "rixa": {
      "command": "node",
      "args": ["/Users/yourname/RIXA/dist/index.js"],
      "env": {
        "RIXA_AUTH_ENABLED": "true",
        "RIXA_AUTH_TOKENS": "macos-rixa-token-2025",
        "RIXA_FS_ALLOWED_PATHS": "/Users/yourname/projects:/Users/yourname/workspace",
        "RIXA_LOG_LEVEL": "info"
      }
    }
  }
}
```

#### Windows Configuration
```json
{
  "mcpServers": {
    "rixa": {
      "command": "node",
      "args": ["C:/Users/YourName/RIXA/dist/index.js"],
      "env": {
        "RIXA_AUTH_ENABLED": "true",
        "RIXA_AUTH_TOKENS": "windows-rixa-token-2025",
        "RIXA_FS_ALLOWED_PATHS": "C:/Users/YourName/projects;C:/workspace",
        "RIXA_LOG_LEVEL": "info"
      }
    }
  }
}
```

#### Linux Configuration
```json
{
  "mcpServers": {
    "rixa": {
      "command": "node",
      "args": ["/home/yourname/RIXA/dist/index.js"],
      "env": {
        "RIXA_AUTH_ENABLED": "true",
        "RIXA_AUTH_TOKENS": "linux-rixa-token-2025",
        "RIXA_FS_ALLOWED_PATHS": "/home/yourname/projects:/home/yourname/workspace",
        "RIXA_LOG_LEVEL": "info"
      }
    }
  }
}
```

## Available Tools

Once configured, the following debugging tools will be available to the MCP client:

### Session Management
- `debug/createSession` - Create new debugging session
- `debug/terminateSession` - Terminate debugging session
- `debug/restartSession` - Restart debugging session

### Execution Control
- `debug/continue` - Continue execution
- `debug/pause` - Pause execution
- `debug/stepIn` - Step into function calls
- `debug/stepOver` - Step over current line
- `debug/stepOut` - Step out of current function

### Breakpoint Management
- `debug/setBreakpoints` - Set breakpoints in source files
- `debug/removeBreakpoints` - Remove existing breakpoints
- `debug/listBreakpoints` - List all active breakpoints

### State Inspection
- `debug/getStackTrace` - Get current call stack
- `debug/getVariables` - Get variables in current scope
- `debug/getScopes` - Get available scopes
- `debug/evaluate` - Evaluate expressions in debug context

### Enhanced Tools
- `debug/getEnhancedStackTrace` - Get detailed stack trace with source info
- `debug/analyzeVariable` - Perform deep variable analysis
- `debug/getDebugStats` - Get debugging session statistics

## Verification and Testing

### 1. Basic Connectivity Test
Ask your MCP client: "What debugging tools do you have available?"

Expected response should list all 17 RIXA debugging tools.

### 2. Health Check
If RIXA is running, you can check its health:
```bash
curl http://localhost:3000/health
```

### 3. Log Verification
Check RIXA logs for successful MCP client connections:
```bash
# If using log file
tail -f /path/to/rixa.log

# If logging to console
# Check Claude Desktop console or RIXA startup logs
```

## Troubleshooting

### Common Configuration Issues

1. **Invalid JSON Syntax**
   - Use a JSON validator to check syntax
   - Ensure no trailing commas
   - Verify proper quote escaping

2. **Path Issues**
   - Use absolute paths for reliability
   - Use forward slashes (/) even on Windows
   - Ensure paths exist and are accessible

3. **Permission Problems**
   - Check file/directory permissions
   - Ensure Claude Desktop can access RIXA installation
   - Verify allowed paths are correctly specified

4. **Authentication Failures**
   - Ensure tokens are properly configured
   - Check for typos in token values
   - Verify RIXA_AUTH_ENABLED is set correctly

### Debug Commands

```bash
# Test RIXA directly
cd /path/to/RIXA
npm start

# Check if RIXA is responding
curl http://localhost:3000/health

# View detailed logs
RIXA_LOG_LEVEL=debug npm start

# Test with specific configuration
RIXA_AUTH_ENABLED=false npm start
```

### Getting Help

1. Check RIXA logs for error messages
2. Verify configuration against provided templates
3. Test RIXA independently before MCP integration
4. Consult the main README.md for additional troubleshooting steps

## Security Considerations

1. **Use Strong Tokens**: Generate cryptographically secure tokens
2. **Limit Filesystem Access**: Only allow necessary directories
3. **Enable Rate Limiting**: Prevent abuse with appropriate limits
4. **Monitor Logs**: Watch for suspicious activity
5. **Regular Updates**: Keep RIXA updated for security patches

## Advanced Configuration

For production deployments or team environments, consider:

- Multiple authentication tokens for different users/services
- Centralized logging with structured JSON format
- Higher rate limits for team usage
- Read-only mode for sensitive environments
- Custom exclude patterns for proprietary files
