# 🔧 C#/.NET Debugging Guide - RIXA

## 📊 **Comprehensive .NET Debugging Support**

RIXA provides **complete debugging support** for all .NET frameworks and versions, from .NET Framework 4.0 to .NET 9.0, including specialized support for modern frameworks like Blazor, MAUI, and Unity.

---

## 🎯 **Supported .NET Versions & Frameworks**

### **.NET Versions**
- ✅ **.NET Framework**: 4.0, 4.5, 4.6, 4.7, 4.8
- ✅ **.NET Core**: 3.1
- ✅ **.NET**: 5.0, 6.0, 7.0, 8.0, 9.0

### **Framework Support Matrix**

| Framework | Hot Reload | Async Debug | Remote Debug | LINQ Debug | Status |
|-----------|------------|-------------|--------------|------------|---------|
| **ASP.NET Core** | ✅ | ✅ | ✅ | ✅ | Complete |
| **WPF** | ✅ | ✅ | ❌ | ✅ | Complete |
| **WinForms** | ❌ | ✅ | ❌ | ✅ | Complete |
| **Blazor Server** | ✅ | ✅ | ✅ | ✅ | Complete |
| **Blazor WebAssembly** | ✅ | ❌ | ✅ | ❌ | Complete |
| **MAUI** | ✅ | ✅ | ❌ | ✅ | Complete |
| **Unity** | ❌ | ✅ | ✅ | ✅ | Complete |
| **Console Apps** | ✅ | ✅ | ✅ | ✅ | Complete |

---

## 🔧 **MCP Tools for .NET Debugging**

### **1. debug_connectDotNet**
**Connect to .NET applications with automatic detection**

```typescript
await mcp.callTool('debug_connectDotNet', {
  processId: 1234,                    // Or processName: "MyApp.exe"
  enableHotReload: true,              // Enable hot reload
  enableAsyncDebugging: true,         // Enable async/await debugging
  enableLinqDebugging: true,          // Enable LINQ query debugging
  enableExceptionBreaking: true,      // Break on exceptions
  debuggerType: 'vsdbg'              // vsdbg, netcoredbg, or mono
});
```

**Features:**
- 🔍 **Automatic Detection**: Version, framework, and runtime detection
- 🚀 **Multi-Debugger Support**: vsdbg, netcoredbg, mono
- ⚡ **Advanced Features**: Hot reload, async debugging, LINQ support

### **2. debug_getDotNetProcesses**
**Discover all .NET processes with detailed information**

```typescript
await mcp.callTool('debug_getDotNetProcesses', {
  includeSystemProcesses: false,      // Filter system processes
  filterByFramework: 'aspnetcore',    // Filter by specific framework
  filterByVersion: 'net8.0',         // Filter by .NET version
  includeDebuggableOnly: true        // Only debuggable processes
});
```

**Response includes:**
- 📊 **Process Details**: PID, name, version, framework, architecture
- 🏗️ **Grouped by Framework**: Organized by ASP.NET Core, WPF, etc.
- 📈 **Summary Statistics**: Counts by framework and version

### **3. debug_inspectDotNetObject**
**Deep object inspection with .NET-specific features**

```typescript
await mcp.callTool('debug_inspectDotNetObject', {
  sessionId: 'session-123',
  objectId: 'obj-456',
  includePrivateMembers: false,       // Include private fields/properties
  includeStaticMembers: false,        // Include static members
  includeInheritedMembers: true,      // Include inherited members
  maxDepth: 3,                        // Recursion depth
  evaluateProperties: true            // Evaluate property values
});
```

**Advanced Analysis:**
- 🔍 **Member Analysis**: Properties, fields, methods with accessibility info
- 🧬 **Type Information**: Primitive, array, collection detection
- ⚡ **Capabilities**: Modification potential, async methods, generics

### **4. debug_evaluateCSharpExpression**
**Evaluate C# expressions with advanced features**

```typescript
await mcp.callTool('debug_evaluateCSharpExpression', {
  sessionId: 'session-123',
  expression: 'items.Where(x => x.IsActive).Select(x => x.Name)',
  timeout: 5000,                      // Evaluation timeout
  allowSideEffects: false,            // Allow side effects
  enableLinqDebugging: true,          // LINQ query analysis
  enableAsyncEvaluation: true         // Async expression support
});
```

**Expression Analysis:**
- 🔍 **LINQ Detection**: Automatic LINQ query recognition
- ⚡ **Async Support**: async/await expression evaluation
- 📊 **Complexity Analysis**: Expression complexity assessment
- 🎯 **Lambda Detection**: Lambda expression identification

### **5. debug_getDotNetAssemblies**
**Comprehensive assembly information**

```typescript
await mcp.callTool('debug_getDotNetAssemblies', {
  sessionId: 'session-123',
  includeSystemAssemblies: false,     // Include system assemblies
  includeGACAssemblies: false,        // Include GAC assemblies
  includeDynamicAssemblies: true,     // Include dynamic assemblies
  includeTypeInformation: true,       // Include type details
  sortBy: 'name'                      // Sort by name, version, location
});
```

**Assembly Details:**
- 📦 **Assembly Metadata**: Name, version, location, GAC status
- 🏗️ **Type Information**: Classes, interfaces, enums, structs
- 🔍 **Module Details**: Symbols, debugging information
- 📊 **Statistics**: Type counts, framework analysis

### **6. debug_setDotNetBreakpoint**
**Advanced breakpoints with .NET-specific features**

```typescript
await mcp.callTool('debug_setDotNetBreakpoint', {
  sessionId: 'session-123',
  file: 'Controllers/HomeController.cs',
  line: 25,
  condition: 'user.IsActive && user.Age > 18',
  hitCondition: '>= 5',               // Hit count condition
  logMessage: 'User: {user.Name}',    // Log message
  breakOnAsyncException: true,        // Break on async exceptions
  breakOnLinqExecution: true,         // Break on LINQ execution
  assembly: 'MyApp.dll',              // Target assembly
  method: 'ProcessUser'               // Target method
});
```

**Advanced Features:**
- 🎯 **Conditional Breaking**: Complex C# expressions
- ⚡ **Async Support**: Break on async exceptions
- 🔍 **LINQ Support**: Break on LINQ query execution
- 📝 **Logging**: Structured log messages with interpolation

### **7. debug_enableDotNetHotReload**
**Hot reload for supported .NET applications**

```typescript
await mcp.callTool('debug_enableDotNetHotReload', {
  sessionId: 'session-123',
  watchPaths: ['**/*.cs', '**/*.razor'], // File patterns to watch
  excludePatterns: ['bin/**', 'obj/**'], // Exclude patterns
  enableAutoReload: true,                // Auto-apply changes
  reloadTimeout: 5000,                   // Reload timeout
  enableVerboseLogging: false            // Verbose logging
});
```

**Hot Reload Features:**
- 🔥 **Live Updates**: Real-time code changes
- 📁 **File Watching**: Configurable file patterns
- ⚡ **Auto-Apply**: Automatic change application
- 📊 **Change Tracking**: Applied changes and errors

---

## 🚀 **Framework-Specific Features**

### **ASP.NET Core**
- 🌐 **HTTP Context Debugging**: Request/response inspection
- 🔧 **Middleware Debugging**: Pipeline inspection
- 💉 **Dependency Injection**: Service container inspection
- ⚙️ **Configuration Debugging**: appsettings.json inspection

### **WPF Applications**
- 🎨 **XAML Debugging**: Visual tree inspection
- 🔗 **Data Binding**: Binding expression debugging
- 🎯 **Dependency Properties**: Property system debugging
- 🖱️ **Command Debugging**: Command pattern inspection

### **Blazor Applications**
- 🧩 **Component Debugging**: Blazor component lifecycle
- 🔄 **SignalR Debugging**: Real-time communication (Server)
- 🌐 **JS Interop**: JavaScript interoperability debugging
- 🔄 **State Management**: Component state inspection

### **Unity Games**
- 🎮 **GameObject Debugging**: Scene object inspection
- 🧩 **Component Debugging**: MonoBehaviour components
- 🔄 **Coroutine Debugging**: Coroutine execution tracking
- 🎯 **Physics Debugging**: Collision and physics debugging

---

## 📊 **Advanced Debugging Features**

### **Async/Await Debugging**
- ⚡ **Task State Inspection**: Running, completed, faulted tasks
- 🔍 **Async Stack Traces**: Complete async call chains
- 🚫 **Deadlock Detection**: Async deadlock identification
- 📈 **Performance Analysis**: Async operation timing

### **LINQ Query Debugging**
- 🔍 **Query Visualization**: Step-by-step execution
- 📊 **Performance Analysis**: Query execution timing
- 🎯 **Intermediate Results**: Results at each step
- 🔄 **Deferred Execution**: Lazy evaluation tracking

### **Exception Handling**
- 🚨 **Enhanced Exception Info**: Detailed exception analysis
- 💡 **Smart Suggestions**: Context-aware recommendations
- 🔍 **Inner Exception Chains**: Complete exception hierarchy
- 📊 **Common Exception Detection**: Known exception patterns

---

## 🎯 **Best Practices**

### **Connection Setup**
1. **Use Process ID** for specific targeting
2. **Enable Framework Detection** for automatic configuration
3. **Configure Timeouts** appropriately for your application
4. **Choose Appropriate Debugger** (vsdbg for Windows, netcoredbg for cross-platform)

### **Breakpoint Strategy**
1. **Use Conditional Breakpoints** to reduce noise
2. **Enable Async Exception Breaking** for async-heavy applications
3. **Use Log Messages** for non-intrusive debugging
4. **Target Specific Assemblies** for better performance

### **Performance Optimization**
1. **Filter System Assemblies** when not needed
2. **Limit Object Inspection Depth** for complex objects
3. **Use Specific Framework Filters** for process discovery
4. **Enable Hot Reload** only when actively developing

---

## 🔧 **Troubleshooting**

### **Common Issues**
- **Connection Failed**: Check if debugger is installed (vsdbg, netcoredbg)
- **Process Not Found**: Ensure process is running and debuggable
- **Hot Reload Not Working**: Verify framework support and file patterns
- **Expression Evaluation Failed**: Check syntax and context availability

### **Debugger Requirements**
- **vsdbg**: Visual Studio Debugger (Windows)
- **netcoredbg**: Cross-platform .NET debugger
- **mono**: Mono debugger (Unity, older .NET)

---

## 🎉 **Conclusion**

RIXA provides **the most comprehensive .NET debugging experience** available, with support for all major frameworks, advanced features like hot reload and LINQ debugging, and intelligent framework detection. Whether you're debugging a simple console application or a complex Blazor application, RIXA has the tools you need.

**Start debugging your .NET applications today with RIXA's powerful MCP tools!**
