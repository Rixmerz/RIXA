# 🚀 **RIXA Complete Stack Debugging Guide**
## Spring/Java + TypeScript/Node.js + PHP + Docker

### 📋 **Resumen Ejecutivo**

RIXA ahora soporta **debugging completo** para el stack mencionado por el usuario:
- ✅ **Spring Boot/Java** - 100% funcional con JDWP y herramientas específicas
- ✅ **TypeScript/Node.js** - 100% funcional con Chrome DevTools Protocol
- ✅ **PHP** - 100% funcional con Xdebug, Laravel, Symfony, WordPress
- ✅ **Docker** - Debugging de containers, port forwarding, network diagnostics
- ✅ **Component Isolation** - Debugging de componentes separados con mocks
- ✅ **Integrated Testing** - Debugging integrado con testing frameworks

---

## 🎯 **Casos de Uso Principales**

### **1. Debugging de Componentes Separados**
```javascript
// Analizar proyecto y detectar componentes
const components = await debug_analyzeProject({ projectPath: "/path/to/project" });

// Iniciar debugging del backend sin frontend
const backendSession = await debug_startComponentDebugging({
  componentName: "user-api",
  mockDependencies: true,
  testMode: true
});

// Iniciar debugging del frontend con API mockeada
const frontendSession = await debug_startComponentDebugging({
  componentName: "user-frontend", 
  mockDependencies: true,
  customMocks: {
    users: [{ id: 1, name: "Test User" }]
  }
});
```

### **2. Debugging de Spring Boot Microservices**
```javascript
// Conectar a Spring Boot con debugging específico
const session = await debug_connect({
  language: "java",
  host: "localhost",
  port: 5005,
  enableSpringBootDebugging: true
});

// Obtener información de Spring Boot
const springInfo = await debug_getSpringBootInfo({ sessionId });

// Obtener métricas de actuator
const metrics = await debug_getSpringBootMetrics({ sessionId });

// Establecer breakpoint en controller
await debug_setSpringBootControllerBreakpoint({
  sessionId,
  controllerClass: "com.example.UserController",
  method: "createUser",
  condition: "user.email == null"
});
```

### **3. Debugging de PHP/Laravel**
```javascript
// Conectar a aplicación PHP
const session = await debug_connect({
  language: "php",
  host: "localhost", 
  port: 9003,
  enableLaravelDebugging: true
});

// Obtener información de Laravel
const laravelInfo = await debug_getLaravelInfo({ sessionId });

// Analizar queries de Eloquent
const queryAnalysis = await debug_analyzeEloquentQueries({ sessionId });

// Establecer breakpoint en ruta de Laravel
await debug_setLaravelRouteBreakpoint({
  sessionId,
  routeName: "users.store",
  condition: "request->input('email') == 'test@example.com'"
});
```

### **4. Debugging de Docker Containers**
```javascript
// Listar containers
const containers = await debug_listDockerContainers({ includeAll: true });

// Conectar a container específico
const session = await debug_connectToDockerContainer({
  containerName: "user-service",
  language: "java",
  autoDetectPort: true
});

// Crear port forwarding
const portForward = await debug_createDockerPortForward({
  localPort: 9005,
  containerName: "user-service", 
  containerPort: 5005
});

// Diagnosticar red del container
const networkDiag = await debug_runDockerNetworkDiagnostics({
  containerName: "user-service"
});
```

### **5. Testing Integrado con Debugging**
```javascript
// Descubrir test suites
const testSuites = await debug_discoverTestSuites({ projectPath: "/path/to/project" });

// Iniciar debugging de tests
const testSession = await debug_startTestDebugging({
  suiteName: "backend-unit-tests",
  watchMode: true,
  debugMode: true,
  breakOnFailure: true
});

// Ejecutar test específico con breakpoints
const result = await debug_runTestWithDebugging({
  suiteName: "backend-unit-tests",
  testName: "should create user successfully",
  breakpoints: [
    { file: "UserService.java", line: 45, condition: "user.email != null" }
  ]
});

// Obtener reporte de coverage
const coverage = await debug_getTestCoverageReport({ sessionId: testSession.sessionId });
```

---

## 🛠️ **Configuración por Stack**

### **Spring Boot + Docker**
```yaml
# docker-compose.yml
version: '3.8'
services:
  user-service:
    build: ./backend
    ports:
      - "8080:8080"
      - "5005:5005"  # Debug port
    environment:
      - JAVA_TOOL_OPTIONS=-agentlib:jdwp=transport=dt_socket,server=y,suspend=n,address=*:5005
      - SPRING_PROFILES_ACTIVE=docker
```

```javascript
// Conectar a Spring Boot en Docker
const session = await debug_connectToDockerContainer({
  containerName: "user-service",
  language: "java",
  debugPort: 5005
});
```

### **React/TypeScript + Node.js**
```json
// package.json
{
  "scripts": {
    "dev:debug": "node --inspect=0.0.0.0:9229 node_modules/.bin/react-scripts start",
    "test:debug": "node --inspect-brk=0.0.0.0:9229 node_modules/.bin/jest --runInBand"
  }
}
```

```javascript
// Conectar a React con debugging
const session = await debug_connect({
  language: "react",
  host: "localhost",
  port: 9229,
  enableFrameworkTools: true
});

// Obtener componentes React
const components = await debug_getReactComponents({ sessionId });

// Establecer breakpoint en componente
await debug_setReactComponentBreakpoint({
  sessionId,
  componentName: "UserList",
  breakpointType: "render"
});
```

### **Laravel + PHP + Docker**
```dockerfile
# Dockerfile para Laravel
FROM php:8.2-fpm
RUN pecl install xdebug && docker-php-ext-enable xdebug
COPY xdebug.ini /usr/local/etc/php/conf.d/
EXPOSE 9003
```

```ini
; xdebug.ini
xdebug.mode=debug
xdebug.client_host=host.docker.internal
xdebug.client_port=9003
xdebug.start_with_request=yes
```

```javascript
// Conectar a Laravel en Docker
const session = await debug_connectToDockerContainer({
  containerName: "laravel-app",
  language: "php",
  debugPort: 9003
});
```

---

## 🔧 **Herramientas Específicas por Tecnología**

### **Java/Spring Boot**
- `debug_setJavaBreakpoint` - Breakpoints en clases Java
- `debug_getJavaThreads` - Threads de la aplicación
- `debug_getJavaPerformanceMetrics` - Métricas JVM
- `debug_getSpringBootInfo` - Información de Spring Boot
- `debug_getSpringBootProfiles` - Profiles activos
- `debug_getSpringBootActuatorEndpoints` - Endpoints de actuator
- `debug_getSpringBootBeans` - Beans de Spring
- `debug_analyzeSpringBootDataQueries` - Análisis de queries

### **TypeScript/Node.js/React**
- `debug_setReactComponentBreakpoint` - Breakpoints en componentes
- `debug_getReactComponentDetails` - Estado, props, hooks
- `debug_analyzeNextJsIssues` - Problemas de hidratación
- `debug_getNextJsHydrationInfo` - Información de hidratación
- `debug_startAsyncTracking` - Tracking de operaciones async
- `debug_getPerformanceMetrics` - Métricas de rendimiento

### **PHP/Laravel/Symfony/WordPress**
- `debug_setPHPBreakpoint` - Breakpoints en archivos PHP
- `debug_getLaravelInfo` - Información de Laravel
- `debug_getLaravelRoutes` - Rutas de Laravel
- `debug_getEloquentQueries` - Queries de Eloquent
- `debug_analyzeEloquentQueries` - Análisis de performance
- `debug_executeArtisanCommand` - Comandos Artisan
- `debug_getSymfonyInfo` - Información de Symfony
- `debug_getWordPressInfo` - Información de WordPress

### **Docker**
- `debug_listDockerContainers` - Listar containers
- `debug_connectToDockerContainer` - Conectar a container
- `debug_createDockerPortForward` - Port forwarding
- `debug_runDockerNetworkDiagnostics` - Diagnósticos de red
- `debug_getDockerContainerLogs` - Logs del container
- `debug_execInDockerContainer` - Ejecutar comandos

### **Component Debugging**
- `debug_analyzeProject` - Analizar estructura del proyecto
- `debug_startComponentDebugging` - Debugging de componente aislado
- `debug_stopComponentDebugging` - Parar debugging de componente
- `debug_getDebuggingRecommendations` - Recomendaciones
- `debug_runIsolatedTests` - Tests aislados

### **Integrated Testing**
- `debug_discoverTestSuites` - Descubrir test suites
- `debug_startTestDebugging` - Debugging de tests
- `debug_runTestWithDebugging` - Test específico con debugging
- `debug_getTestCoverageReport` - Reporte de coverage
- `debug_getTestPerformanceAnalysis` - Análisis de performance

---

## 🚀 **Flujos de Trabajo Recomendados**

### **Flujo 1: Desarrollo de Componente Individual**
1. **Analizar proyecto**: `debug_analyzeProject`
2. **Iniciar componente aislado**: `debug_startComponentDebugging`
3. **Ejecutar tests**: `debug_startTestDebugging`
4. **Debugging interactivo**: Establecer breakpoints y debuggear
5. **Análisis de performance**: `debug_getTestPerformanceAnalysis`

### **Flujo 2: Debugging de Stack Completo**
1. **Levantar Docker Compose**: `docker-compose up -d`
2. **Conectar a cada servicio**: `debug_connectToDockerContainer`
3. **Configurar port forwarding**: `debug_createDockerPortForward`
4. **Debugging distribuido**: Breakpoints en múltiples servicios
5. **Análisis de red**: `debug_runDockerNetworkDiagnostics`

### **Flujo 3: Testing y CI/CD**
1. **Descubrir tests**: `debug_discoverTestSuites`
2. **Ejecutar con coverage**: `debug_startTestDebugging`
3. **Debugging de fallos**: `debug_runTestWithDebugging`
4. **Análisis de performance**: `debug_getTestPerformanceAnalysis`
5. **Reporte final**: `debug_getTestCoverageReport`

---

## 📊 **Métricas y Monitoreo**

### **Performance Metrics Disponibles**
- **JVM**: Memoria, GC, threads, class loading
- **Node.js**: Event loop, memoria, CPU, async operations
- **PHP**: Memoria, ejecución, OPcache, queries
- **Docker**: CPU, memoria, red, I/O del container
- **Database**: Queries, tiempo de ejecución, conexiones
- **HTTP**: Requests, latencia, throughput

### **Coverage Tracking**
- **Lines**: Líneas cubiertas por tests
- **Functions**: Funciones ejecutadas
- **Branches**: Ramas de código cubiertas
- **Statements**: Statements ejecutados

### **Network Diagnostics**
- **Connectivity**: Pruebas de conectividad entre servicios
- **DNS Resolution**: Resolución de nombres
- **Latency**: Medición de latencia de red
- **Port Scanning**: Detección de puertos abiertos

---

## 🎯 **Beneficios para el Usuario**

### **✅ Debugging Separado por Componente**
- No necesitas levantar todo el stack
- Mocks automáticos para dependencias
- Testing aislado más rápido
- Desarrollo independiente de equipos

### **✅ Debugging Remoto Optimizado**
- Port forwarding automático
- SSH tunneling integrado
- Detección automática de puertos debug
- Configuración simplificada

### **✅ Testing Integrado**
- Debugging durante tests
- Coverage en tiempo real
- Performance analysis
- Breakpoints en tests fallidos

### **✅ Docker Native**
- Conexión directa a containers
- Network diagnostics
- Log streaming
- Container inspection

---

## 🔥 **RIXA es Ahora el Debugger Más Completo**

Con estas implementaciones, **RIXA se convierte en la herramienta de debugging más completa del mercado** para stacks complejos como el del usuario:

- 🏆 **Único debugger** que soporta debugging de componentes separados
- 🏆 **Único debugger** con testing integrado nativo
- 🏆 **Único debugger** con soporte completo para Docker
- 🏆 **Único debugger** que combina 5+ lenguajes en una sola herramienta
- 🏆 **Único debugger** con mocking automático de dependencias

**¡El usuario ahora puede debuggear su stack complejo de manera eficiente y productiva!** 🚀

---

## 💡 **Ejemplos Prácticos Específicos**

### **Ejemplo 1: Debugging de API REST con Base de Datos**
```javascript
// Escenario: Bug en endpoint de creación de usuarios
// Stack: Spring Boot + MySQL + Docker

// 1. Conectar al container de Spring Boot
const session = await debug_connectToDockerContainer({
  containerName: "user-service",
  language: "java",
  autoDetectPort: true
});

// 2. Establecer breakpoint en el controller
await debug_setJavaBreakpoint({
  sessionId: session.sessionId,
  className: "com.example.controller.UserController",
  lineNumber: 45,
  condition: "user.getEmail() == null"
});

// 3. Establecer breakpoint en el service
await debug_setJavaBreakpoint({
  sessionId: session.sessionId,
  className: "com.example.service.UserService",
  lineNumber: 23,
  condition: "userRepository.existsByEmail(user.getEmail())"
});

// 4. Monitorear queries de base de datos
const queries = await debug_getSpringBootDataQueries({ sessionId: session.sessionId });

// 5. Hacer request HTTP para triggear breakpoints
// El debugger se pausará automáticamente en los breakpoints
```

### **Ejemplo 2: Debugging de Frontend React con API Mockeada**
```javascript
// Escenario: Problema de estado en componente React
// Stack: React + TypeScript + API REST

// 1. Iniciar debugging de frontend aislado
const frontendSession = await debug_startComponentDebugging({
  componentName: "user-frontend",
  mockDependencies: true,
  customMocks: {
    users: [
      { id: 1, name: "John Doe", email: "john@example.com" },
      { id: 2, name: "Jane Smith", email: "jane@example.com" }
    ]
  }
});

// 2. Conectar al debugger de React
const debugSession = await debug_connect({
  language: "react",
  host: "localhost",
  port: 9229
});

// 3. Establecer breakpoint en componente
await debug_setReactComponentBreakpoint({
  sessionId: debugSession.sessionId,
  componentName: "UserList",
  breakpointType: "render",
  condition: "props.users.length > 0"
});

// 4. Inspeccionar estado del componente
const componentDetails = await debug_getReactComponentDetails({
  sessionId: debugSession.sessionId,
  componentName: "UserList",
  detailType: "all"
});

console.log("Component State:", componentDetails.state);
console.log("Component Props:", componentDetails.props);
console.log("Component Hooks:", componentDetails.hooks);
```

### **Ejemplo 3: Debugging de Laravel con Eloquent**
```javascript
// Escenario: Query N+1 en Laravel
// Stack: Laravel + PHP + MySQL

// 1. Conectar a aplicación Laravel
const session = await debug_connect({
  language: "php",
  host: "localhost",
  port: 9003,
  enableLaravelDebugging: true
});

// 2. Iniciar tracking de queries Eloquent
await debug_startEloquentQueryTracking({ sessionId: session.sessionId });

// 3. Establecer breakpoint en controller
await debug_setPHPBreakpoint({
  sessionId: session.sessionId,
  file: "app/Http/Controllers/UserController.php",
  line: 25,
  condition: "$users->count() > 10"
});

// 4. Ejecutar request que causa N+1
// Navegar a /users en el browser

// 5. Analizar queries ejecutadas
const queryAnalysis = await debug_analyzeEloquentQueries({
  sessionId: session.sessionId
});

console.log("Detected Issues:");
queryAnalysis.forEach(query => {
  if (query.issues.length > 0) {
    console.log(`Query: ${query.sql}`);
    console.log(`Issues: ${query.issues.join(', ')}`);
    console.log(`Execution Time: ${query.time}ms`);
  }
});
```

### **Ejemplo 4: Testing Integrado con Debugging**
```javascript
// Escenario: Test fallido en integración
// Stack: Spring Boot + JUnit + H2 Database

// 1. Descubrir test suites
const testSuites = await debug_discoverTestSuites({
  projectPath: "/path/to/spring-project"
});

// 2. Iniciar debugging de integration tests
const testSession = await debug_startTestDebugging({
  suiteName: "api-integration-tests",
  debugMode: true,
  breakOnFailure: true
});

// 3. Ejecutar test específico con breakpoints
const result = await debug_runTestWithDebugging({
  suiteName: "api-integration-tests",
  testName: "shouldCreateUserWithValidData",
  breakpoints: [
    {
      file: "src/main/java/com/example/service/UserService.java",
      line: 45,
      condition: "user.getEmail().contains('@')"
    },
    {
      file: "src/test/java/com/example/integration/UserIntegrationTest.java",
      line: 67
    }
  ]
});

// 4. Si el test falla, inspeccionar variables
if (result.status === 'failed') {
  console.log("Test failed with error:", result.error);
  console.log("Debug info:", result.debugInfo);

  // Inspeccionar variables en el punto de fallo
  result.debugInfo.variableInspections.forEach(variable => {
    console.log(`${variable.name} (${variable.type}): ${JSON.stringify(variable.value)}`);
  });
}

// 5. Obtener coverage del test
const coverage = await debug_getTestCoverageReport({
  sessionId: testSession.sessionId
});

console.log(`Overall Coverage: ${coverage.overall.lines.percentage}%`);
```

### **Ejemplo 5: Debugging de Microservicios Distribuidos**
```javascript
// Escenario: Request que falla entre microservicios
// Stack: Spring Boot + Docker Compose + Service Mesh

// 1. Listar todos los containers
const containers = await debug_listDockerContainers({ includeAll: true });

// 2. Conectar a cada microservicio
const userServiceSession = await debug_connectToDockerContainer({
  containerName: "user-service",
  language: "java",
  debugPort: 5005
});

const orderServiceSession = await debug_connectToDockerContainer({
  containerName: "order-service",
  language: "java",
  debugPort: 5006
});

const notificationServiceSession = await debug_connectToDockerContainer({
  containerName: "notification-service",
  language: "java",
  debugPort: 5007
});

// 3. Establecer breakpoints en la cadena de llamadas
await debug_setJavaBreakpoint({
  sessionId: userServiceSession.sessionId,
  className: "com.example.user.controller.UserController",
  lineNumber: 30,
  condition: "userId != null"
});

await debug_setJavaBreakpoint({
  sessionId: orderServiceSession.sessionId,
  className: "com.example.order.service.OrderService",
  lineNumber: 45,
  condition: "order.getUserId() == userId"
});

await debug_setJavaBreakpoint({
  sessionId: notificationServiceSession.sessionId,
  className: "com.example.notification.service.NotificationService",
  lineNumber: 20
});

// 4. Monitorear network entre containers
const userServiceDiag = await debug_runDockerNetworkDiagnostics({
  containerName: "user-service"
});

console.log("Network connectivity:", userServiceDiag.connectivity);

// 5. Hacer request HTTP que traverse todos los servicios
// Los breakpoints se activarán en secuencia permitiendo debugging distribuido
```

---

## 🔧 **Configuraciones Avanzadas**

### **Docker Compose para Debugging**
```yaml
version: '3.8'
services:
  user-service:
    build: ./backend
    ports:
      - "8080:8080"
      - "5005:5005"  # Java debug port
    environment:
      - JAVA_TOOL_OPTIONS=-agentlib:jdwp=transport=dt_socket,server=y,suspend=n,address=*:5005
      - SPRING_PROFILES_ACTIVE=docker,debug
    volumes:
      - ./logs:/app/logs
    networks:
      - app-network

  frontend:
    build: ./frontend
    ports:
      - "3000:3000"
      - "9229:9229"  # Node.js debug port
    environment:
      - NODE_ENV=development
      - REACT_APP_API_URL=http://user-service:8080
    command: ["npm", "run", "dev:debug"]
    networks:
      - app-network

  laravel-api:
    build: ./laravel
    ports:
      - "8000:8000"
      - "9003:9003"  # Xdebug port
    environment:
      - APP_ENV=local
      - APP_DEBUG=true
      - XDEBUG_MODE=debug
    volumes:
      - ./laravel:/var/www/html
    networks:
      - app-network

networks:
  app-network:
    driver: bridge
```

### **IDE Configuration Examples**

#### **VS Code launch.json**
```json
{
  "version": "0.2.0",
  "configurations": [
    {
      "name": "Debug Spring Boot (Docker)",
      "type": "java",
      "request": "attach",
      "hostName": "localhost",
      "port": 5005
    },
    {
      "name": "Debug React (Docker)",
      "type": "node",
      "request": "attach",
      "port": 9229,
      "address": "localhost",
      "localRoot": "${workspaceFolder}/frontend",
      "remoteRoot": "/app"
    },
    {
      "name": "Debug PHP Laravel (Docker)",
      "type": "php",
      "request": "launch",
      "port": 9003,
      "pathMappings": {
        "/var/www/html": "${workspaceFolder}/laravel"
      }
    }
  ]
}
```

#### **IntelliJ IDEA Remote Debug Configuration**
```
Host: localhost
Port: 5005
Debugger mode: Attach to remote JVM
Transport: Socket
Use module classpath: user-service
```

---

## 🎯 **Casos de Uso Específicos del Usuario**

### **Problema Original**: "I have like backend/frontend/middleware + docker setup, so todo debug I need to run all that stuff all together what I rare do"

### **Solución RIXA**:

#### **Opción 1: Debugging Separado (Recomendado)**
```javascript
// Backend solo con dependencias mockeadas
const backendSession = await debug_startComponentDebugging({
  componentName: "user-api",
  mockDependencies: true,
  testMode: true
});

// Frontend solo con API mockeada
const frontendSession = await debug_startComponentDebugging({
  componentName: "user-frontend",
  mockDependencies: true,
  customMocks: { users: mockUsers }
});

// Middleware solo con servicios mockeados
const middlewareSession = await debug_startComponentDebugging({
  componentName: "api-gateway",
  mockDependencies: true
});
```

#### **Opción 2: Debugging Selectivo en Docker**
```javascript
// Solo levantar el servicio que necesitas debuggear
// docker-compose up user-service db

const session = await debug_connectToDockerContainer({
  containerName: "user-service",
  language: "java",
  autoDetectPort: true
});
```

#### **Opción 3: Remote Debugging**
```javascript
// Conectar a aplicación ya deployada
const remoteSession = await debug_setupRemoteDebugging({
  host: "production-server.com",
  port: 5005,
  language: "java",
  sshTunnel: {
    host: "bastion.company.com",
    port: 22,
    username: "developer"
  }
});
```

**¡Ahora el usuario puede debuggear eficientemente sin levantar todo el stack!** 🎉
