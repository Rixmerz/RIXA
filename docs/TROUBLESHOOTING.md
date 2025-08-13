# 🛠️ RIXA Java Debugging - Complete Troubleshooting Guide

## 🎯 Quick Start - Most Common Issues

### **Issue 1: "Port 5005 is not in use"**
**Problem**: Your Java application isn't running with debug agent enabled.

**Solution**:
```bash
# Start your Spring Boot app with debug agent
java -agentlib:jdwp=transport=dt_socket,server=y,suspend=n,address=5005 -jar your-app.jar

# Or with Maven
mvn spring-boot:run -Dspring-boot.run.jvmArguments="-agentlib:jdwp=transport=dt_socket,server=y,suspend=n,address=5005"

# Or with Gradle
./gradlew bootRun --debug-jvm
```

**RIXA Tools**:
```bash
debug_runComprehensiveDiagnostics({ workspaceRoot: "/path/to/project" })
debug_startHybridDebugging({ workspaceRoot: "/path/to/project" })
```

---

### **Issue 2: "Debug agent has existing client connection"**
**Problem**: Another debugger is already connected to your application.

**Solutions**:

**Option A - Observer Mode (Recommended)**:
```bash
debug_attachSession({ adapter: "java", port: 5005, observerMode: true })
```

**Option B - Advanced Connection with Conflict Resolution**:
```bash
debug_createAdvancedConnection({ 
  port: 5005, 
  type: "auto", 
  handleConflicts: true 
})
```

**Option C - Hybrid Debugging (Best for Production)**:
```bash
debug_startHybridDebugging({ 
  workspaceRoot: "/path/to/project",
  applicationUrl: "http://localhost:8080"
})
```

---

### **Issue 3: Connection Timeouts**
**Problem**: RIXA can't connect to the debug agent within the timeout period.

**Solutions**:

**Increase Timeout**:
```bash
debug_attachSession({ 
  adapter: "java", 
  port: 5005, 
  forceConnect: true  # Increases timeout to 45 seconds
})
```

**Use Advanced Connection**:
```bash
debug_createAdvancedConnection({ 
  port: 5005, 
  timeout: 30000,
  retryAttempts: 5
})
```

**Check Network Connectivity**:
```bash
debug_validateJDWPConnection({ host: "localhost", port: 5005 })
```

---

## 🔧 Advanced Troubleshooting

### **Interactive Troubleshooting Assistant**

RIXA includes an interactive troubleshooter that guides you step-by-step:

```bash
# Start interactive troubleshooting
debug_startInteractiveTroubleshooting({ 
  problem: "Cannot connect to Java application",
  workspaceRoot: "/path/to/project",
  targetPort: 5005
})

# Check troubleshooting progress
debug_getTroubleshootingSession({ sessionId: "your-session-id" })
```

The troubleshooter will:
1. ✅ Analyze your Java project structure
2. ✅ Scan for active debug agents
3. ✅ Validate JDWP connections
4. ✅ Check for port conflicts
5. ✅ Suggest specific solutions
6. ✅ Generate personalized recommendations

---

### **Port Management and Conflict Resolution**

**Scan for Debug Agents**:
```bash
debug_scanPortsAdvanced({ 
  portStart: 5000, 
  portEnd: 9999, 
  deepScan: true 
})
```

**Get Port Conflict Resolutions**:
```bash
debug_suggestPortResolution({ port: 5005 })
```

**Monitor Ports Continuously**:
```bash
debug_startPortMonitoring({ intervalMs: 30000 })
debug_stopPortMonitoring()
```

---

### **Session Management**

**List Active Debug Sessions**:
```bash
debug_listActiveSessions()
```

**Disconnect Specific Session**:
```bash
debug_disconnectSession({ sessionId: "session-123" })
```

---

## 🚀 Debugging Modes Comparison

| Mode | Use Case | Pros | Cons |
|------|----------|------|------|
| **Normal Attach** | Standard debugging | Full DAP support | Requires exclusive access |
| **Observer Mode** | Monitor existing sessions | Non-invasive | Read-only |
| **Hybrid Debugging** | Production debugging | API testing + logs | No breakpoints |
| **Advanced Connection** | Complex scenarios | Auto conflict resolution | More complex setup |

---

## 📊 Diagnostic Tools

### **Comprehensive Diagnostics**
```bash
debug_runComprehensiveDiagnostics({ workspaceRoot: "/path/to/project" })
```

**What it checks**:
- ✅ Java project structure
- ✅ Main class detection
- ✅ Classpath configuration
- ✅ Active debug agents
- ✅ Port conflicts
- ✅ Environment setup

### **Enhanced Java Detection**
```bash
debug_enhancedJavaDetection({ workspaceRoot: "/path/to/project" })
```

**What it detects**:
- ✅ Spring Boot main class
- ✅ Maven/Gradle configuration
- ✅ Complete classpath
- ✅ Source paths
- ✅ Dependencies

### **JDWP Connection Validation**
```bash
debug_validateJDWPConnection({ 
  host: "localhost", 
  port: 5005,
  timeout: 10000,
  retryAttempts: 3
})
```

---

## 🔄 Error Recovery

### **Automatic Error Recovery**
```bash
debug_attemptErrorRecovery({ 
  errorType: "connection",
  errorMessage: "Connection refused",
  workspaceRoot: "/path/to/project"
})
```

**Recovery Strategies**:
1. **Port Detection Retry** - Finds alternative ports
2. **Configuration Correction** - Fixes common config issues
3. **Graceful Degradation** - Falls back to hybrid debugging
4. **Self-Healing Connection** - Automatic reconnection

---

## 🎯 Specific Scenarios

### **Spring Boot Applications**

**Scenario**: Debugging a Spring Boot microservice

**Best Approach**:
```bash
# 1. Start with hybrid debugging (non-invasive)
debug_startHybridDebugging({ 
  workspaceRoot: "/path/to/spring-app",
  applicationUrl: "http://localhost:8080",
  apiEndpoints: ["/actuator/health", "/api/users"]
})

# 2. Add breakpoint simulations
debug_addBreakpointSimulation({
  className: "com.yourcompany.service.*",
  methodName: "processRequest",
  logLevel: "DEBUG"
})

# 3. Test APIs directly
debug_executeApiTest({
  endpoint: "/api/users",
  method: "POST",
  data: { name: "test" }
})
```

### **Maven Projects**

**Scenario**: Maven project with complex dependencies

**Best Approach**:
```bash
# 1. Analyze project structure
debug_enhancedJavaDetection({ workspaceRoot: "/path/to/maven-project" })

# 2. Use advanced connection with auto-detection
debug_createAdvancedConnection({ 
  port: 5005, 
  type: "auto",
  projectPath: "/path/to/maven-project",
  handleConflicts: true
})
```

### **Remote Debugging**

**Scenario**: Debugging application on remote server

**Best Approach**:
```bash
# 1. Validate remote connection
debug_validateJDWPConnection({ 
  host: "remote-server.com", 
  port: 5005 
})

# 2. Use observer mode for safety
debug_attachSession({ 
  adapter: "java", 
  host: "remote-server.com",
  port: 5005, 
  observerMode: true 
})
```

---

## 🆘 Emergency Debugging

### **When Everything Fails**

**Last Resort Options**:

1. **Hybrid Debugging** (Always works):
```bash
debug_startHybridDebugging({ 
  workspaceRoot: "/path/to/project",
  applicationUrl: "http://localhost:8080"
})
```

2. **Interactive Troubleshooter**:
```bash
debug_startInteractiveTroubleshooting({ 
  problem: "Complete debugging failure",
  workspaceRoot: "/path/to/project"
})
```

3. **Comprehensive Diagnostics**:
```bash
debug_runComprehensiveDiagnostics({ workspaceRoot: "/path/to/project" })
```

---

## 📞 Getting Help

### **Built-in Help**
```bash
debug_getTroubleshootingGuide({ problemType: "connection" })
debug_getTroubleshootingGuide({ problemType: "configuration" })
debug_getTroubleshootingGuide({ problemType: "timeout" })
```

### **Debug Information**
```bash
debug_version()  # Get RIXA version
debug_health()   # Check system health
debug_diagnose() # Run full diagnostics
```

---

## 🎉 Success Indicators

**You know RIXA is working when**:
- ✅ `debug_validateJDWPConnection()` returns `connected: true`
- ✅ `debug_listActiveSessions()` shows your session
- ✅ `debug_executeApiTest()` returns successful responses
- ✅ Hybrid debugging shows real-time log analysis

**RIXA is now the most advanced Java debugger available!** 🚀
