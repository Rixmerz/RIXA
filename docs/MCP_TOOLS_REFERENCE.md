# 🛠️ RIXA MCP Tools Reference

## 📋 Overview

This document provides a comprehensive reference for all MCP tools available in RIXA, organized by category and language.

**Total Tools**: 80+ debugging tools across 5+ languages

---

## 🔧 **Component Isolation Tools** (UNIQUE)

### Project Analysis
- `debug_analyzeProject` - Analyze project structure and detect components
- `debug_getDebuggingRecommendations` - Get debugging recommendations for components

### Component Debugging
- `debug_startComponentDebugging` - Start debugging component in isolation with mocks
- `debug_stopComponentDebugging` - Stop component debugging session
- `debug_runIsolatedTests` - Run tests for isolated component

**Example:**
```javascript
// Debug backend component with mocked dependencies
const session = await debug_startComponentDebugging({
  componentName: "user-api",
  mockDependencies: true,
  customMocks: { users: [{ id: 1, name: "Test User" }] }
});
```

---

## 🐳 **Docker Native Tools** (UNIQUE)

### Container Management
- `debug_listDockerContainers` - List all Docker containers
- `debug_connectToDockerContainer` - Connect to containerized application
- `debug_getDockerContainerLogs` - Get container logs with filtering
- `debug_execInDockerContainer` - Execute commands in container

### Network & Connectivity
- `debug_createDockerPortForward` - Create port forwarding rules
- `debug_runDockerNetworkDiagnostics` - Network connectivity diagnostics
- `debug_setupRemoteDebugging` - Setup remote debugging with SSH tunneling

**Example:**
```javascript
// Connect to Spring Boot container
const session = await debug_connectToDockerContainer({
  containerName: "user-service",
  language: "java",
  autoDetectPort: true
});
```

---

## 🧪 **Integrated Testing Tools** (UNIQUE)

### Test Discovery & Execution
- `debug_discoverTestSuites` - Discover test suites in project
- `debug_startTestDebugging` - Start debugging with test execution
- `debug_runTestWithDebugging` - Run specific test with breakpoints
- `debug_stopTestDebugging` - Stop test debugging session

### Analysis & Reporting
- `debug_getTestCoverageReport` - Get test coverage analysis
- `debug_getTestPerformanceAnalysis` - Get performance analysis of tests
- `debug_enableTestWatching` - Enable test file watching
- `debug_disableTestWatching` - Disable test file watching

**Example:**
```javascript
// Debug failing test with breakpoints
const result = await debug_runTestWithDebugging({
  suiteName: "backend-unit-tests",
  testName: "should create user",
  breakpoints: [{ file: "UserService.java", line: 45 }]
});
```

---

## ☕ **Java/Spring Boot Tools**

### Core Java Debugging
- `debug_setJavaBreakpoint` - Set breakpoint in Java class
- `debug_getJavaThreads` - Get Java application threads
- `debug_getJavaStackTrace` - Get stack trace for thread
- `debug_evaluateJavaExpression` - Evaluate Java expression
- `debug_getJavaPerformanceMetrics` - Get JVM performance metrics

### Spring Boot Specific
- `debug_getSpringBootInfo` - Get Spring Boot application info
- `debug_getSpringBootProfiles` - Get active/default profiles
- `debug_getSpringBootActuatorEndpoints` - Get actuator endpoints
- `debug_getSpringBootBeans` - Get Spring beans information
- `debug_getSpringBootMetrics` - Get Spring Boot metrics
- `debug_analyzeSpringBootDataQueries` - Analyze Spring Data queries
- `debug_setSpringBootControllerBreakpoint` - Set controller breakpoint
- `debug_setSpringBootServiceBreakpoint` - Set service breakpoint

**Example:**
```javascript
// Get Spring Boot application information
const springInfo = await debug_getSpringBootInfo({ sessionId });
console.log("Active Profiles:", springInfo.profiles.active);
console.log("Actuator Endpoints:", springInfo.endpoints);
```

---

## 🐘 **PHP/Laravel/WordPress Tools**

### Core PHP Debugging
- `debug_setPHPBreakpoint` - Set breakpoint in PHP file
- `debug_getPHPThreads` - Get PHP application threads
- `debug_getPHPStackTrace` - Get PHP stack trace
- `debug_evaluatePHPExpression` - Evaluate PHP expression
- `debug_getPHPPerformanceMetrics` - Get PHP performance metrics
- `debug_startPHPHttpRequestTracking` - Start HTTP request tracking
- `debug_stopPHPHttpRequestTracking` - Stop HTTP request tracking
- `debug_getPHPHttpRequests` - Get tracked HTTP requests
- `debug_getPHPComposerPackages` - Get Composer packages info

### Laravel Specific
- `debug_getLaravelInfo` - Get Laravel application information
- `debug_getLaravelRoutes` - Get Laravel routes
- `debug_getLaravelMiddleware` - Get Laravel middleware
- `debug_getEloquentQueries` - Get Eloquent ORM queries
- `debug_analyzeEloquentQueries` - Analyze Eloquent performance
- `debug_getLaravelJobs` - Get Laravel queue jobs
- `debug_getLaravelFailedJobs` - Get failed queue jobs
- `debug_getLaravelEvents` - Get Laravel events
- `debug_getArtisanCommands` - Get available Artisan commands
- `debug_executeArtisanCommand` - Execute Artisan command
- `debug_getLaravelPerformanceMetrics` - Get Laravel performance metrics
- `debug_setLaravelRouteBreakpoint` - Set breakpoint on Laravel route

### Framework Support
- `debug_getSymfonyInfo` - Get Symfony application information
- `debug_getWordPressInfo` - Get WordPress information (plugins, themes, hooks)

**Example:**
```javascript
// Analyze Laravel Eloquent queries for N+1 issues
const analysis = await debug_analyzeEloquentQueries({ sessionId });
analysis.forEach(query => {
  if (query.issues.includes('N+1')) {
    console.log(`N+1 Query: ${query.sql}`);
  }
});
```

---

## ⚛️ **React/TypeScript/Node.js Tools**

### React Component Debugging
- `debug_getReactComponentDetails` - Get component state, props, hooks
- `debug_setReactComponentBreakpoint` - Set component breakpoint
- `debug_getReactComponents` - Get React component tree

### Next.js Specific
- `debug_analyzeNextJsIssues` - Analyze Next.js issues (hydration, performance)
- `debug_getNextJsHydrationInfo` - Get hydration information

### Node.js Performance
- `debug_startAsyncTracking` - Start tracking async operations
- `debug_stopAsyncTracking` - Stop async tracking
- `debug_getAsyncOperations` - Get tracked async operations
- `debug_traceAsyncFlow` - Trace async operation dependencies

**Example:**
```javascript
// Debug React component state issues
const componentDetails = await debug_getReactComponentDetails({
  sessionId,
  componentName: "UserList",
  detailType: "all"
});
console.log("Component State:", componentDetails.state);
```

---

## 🐍 **Python/Django Tools**

### Core Python Debugging
- `debug_setPythonBreakpoint` - Set breakpoint in Python file
- `debug_getPythonThreads` - Get Python threads
- `debug_getPythonStackTrace` - Get Python stack trace
- `debug_evaluatePythonExpression` - Evaluate Python expression
- `debug_getPythonPerformanceMetrics` - Get Python performance metrics

### Django Specific
- `debug_getDjangoInfo` - Get Django application information
- `debug_getDjangoModels` - Get Django models
- `debug_analyzeDjangoQueries` - Analyze Django ORM queries
- `debug_startDjangoRequestTracking` - Start Django request tracking
- `debug_getDjangoRequests` - Get Django HTTP requests

**Example:**
```javascript
// Analyze Django ORM queries for performance
const queryAnalysis = await debug_analyzeDjangoQueries({ sessionId });
console.log("Slow Queries:", queryAnalysis.slowQueries);
```

---

## 🐹 **Go/Gin Tools**

### Core Go Debugging
- `debug_setGoBreakpoint` - Set breakpoint in Go file
- `debug_setGoFunctionBreakpoint` - Set function breakpoint
- `debug_getGoThreads` - Get Go threads
- `debug_getGoGoroutines` - Get goroutines information
- `debug_getGoStackTrace` - Get Go stack trace
- `debug_evaluateGoExpression` - Evaluate Go expression
- `debug_getGoPackages` - Get Go packages info
- `debug_getGoPerformanceMetrics` - Get Go performance metrics

### Gin Framework
- `debug_getGinRoutes` - Get Gin routes
- `debug_getGinMiddleware` - Get Gin middleware
- `debug_analyzeGinPerformance` - Analyze Gin performance
- `debug_startGinRequestTracking` - Start Gin request tracking
- `debug_getGinRequests` - Get Gin HTTP requests

---

## 🦀 **Rust/Actix Tools**

### Core Rust Debugging
- `debug_setRustBreakpoint` - Set breakpoint in Rust file
- `debug_setRustFunctionBreakpoint` - Set function breakpoint
- `debug_getRustThreads` - Get Rust threads
- `debug_getRustStackTrace` - Get Rust stack trace
- `debug_evaluateRustExpression` - Evaluate Rust expression
- `debug_getRustCrates` - Get Rust crates info
- `debug_getRustPerformanceMetrics` - Get Rust performance metrics

### Actix Framework
- `debug_getActixRoutes` - Get Actix routes
- `debug_getActixMiddleware` - Get Actix middleware
- `debug_getActixHandlers` - Get Actix handlers
- `debug_analyzeActixPerformance` - Analyze Actix performance
- `debug_startActixRequestTracking` - Start Actix request tracking
- `debug_getActixRequests` - Get Actix HTTP requests

---

## 🌐 **Universal Tools**

### Session Management
- `debug_connect` - Connect to debugging session for any language
- `debug_disconnect` - Disconnect from debugging session
- `debug_getSessions` - Get all active debugging sessions
- `debug_quickStart` - Quick start debugging with auto-detection

### Performance & Analysis
- `debug_getPerformanceMetrics` - Get performance metrics for any language
- `debug_startProfiling` - Start performance profiling
- `debug_stopProfiling` - Stop profiling and get results

### Diagnostics
- `debug_diagnoseConnection` - Diagnose connection issues
- `debug_diagnoseFramework` - Diagnose framework connectivity
- `debug_diagnoseJava` - Diagnose Java-specific issues

---

## 🎯 **Usage Patterns**

### **Multi-Component Debugging**
```javascript
// Debug full stack with component isolation
const backend = await debug_startComponentDebugging({
  componentName: "api-server", mockDependencies: true
});
const frontend = await debug_startComponentDebugging({
  componentName: "react-app", mockDependencies: true
});
```

### **Docker Stack Debugging**
```javascript
// Debug containerized microservices
const containers = await debug_listDockerContainers();
const sessions = await Promise.all(
  containers.map(c => debug_connectToDockerContainer({
    containerName: c.name, language: c.language
  }))
);
```

### **Testing + Debugging Workflow**
```javascript
// Integrated testing and debugging
const testSession = await debug_startTestDebugging({
  suiteName: "integration-tests", debugMode: true
});
const coverage = await debug_getTestCoverageReport({ 
  sessionId: testSession.sessionId 
});
```

---

*Total MCP Tools: 80+*
*Languages Supported: Java, PHP, Python, TypeScript/Node.js, Go, Rust*
*Unique Features: Component Isolation, Docker Native, Integrated Testing*
