# .NET Debugging Implementation Plan for RIXA

## Executive Summary

This document outlines the comprehensive plan to add full .NET debugging support to RIXA (Runtime Intelligent eXecution Adapter). The implementation will support both Visual Studio Code and Visual Studio 2022+ through the Debug Adapter Protocol (DAP), providing debugging capabilities for .NET Core, .NET 5+, ASP.NET Core, Blazor, and other .NET frameworks.

## Goals and Objectives

### Primary Goals
- Implement complete .NET debugging support using DAP protocol
- Support both Microsoft's vsdbg and open-source netcoredbg adapters
- Enable debugging in VS Code, Visual Studio 2022+, and other DAP-compliant clients
- Achieve feature parity with existing language debuggers (Python, Java, Go)

### Success Criteria
- Successfully debug .NET console applications with breakpoints and stepping
- Debug ASP.NET Core applications with middleware and request inspection
- Support Blazor WebAssembly and Server debugging
- Pass comprehensive test suite covering all debugging scenarios
- Complete MCP tool integration for Claude AI assistance

## Architecture Overview

The implementation follows RIXA's established patterns:
- Language-specific debugger classes in `/src/dotnet/`
- DAP communication through existing transport layer
- MCP tool exposure via stdio server
- Integration with session manager and language dispatcher

## Implementation Phases

### [Phase 1: Core .NET Debugger Implementation](./phase1-core-implementation.md)
**Timeline: Week 1-2**
- Create dotnet directory structure
- Implement DotNetDebugger base class
- Add vsdbg adapter integration
- Add netcoredbg adapter integration
- Basic debugging operations (launch, attach, breakpoints, stepping)

### [Phase 2: Framework-Specific Support](./phase2-framework-support.md)
**Timeline: Week 3-4**
- ASP.NET Core debugging features
- Blazor WebAssembly/Server debugging
- Entity Framework Core query analysis
- Dependency injection container inspection
- Hot Reload support

### [Phase 3: Integration & MCP Tools](./phase3-integration-mcp.md)
**Timeline: Week 5**
- Update language dispatcher
- Add .NET-specific MCP tools
- Project detection and analysis
- Configuration management
- Error handling and recovery

### [Phase 4: Testing & Documentation](./phase4-testing-documentation.md)
**Timeline: Week 6**
- Comprehensive test suite
- Integration tests with sample projects
- Documentation updates
- Performance optimization
- Release preparation

## Technical Architecture

### Component Diagram
```
┌─────────────────────────────────────────┐
│           MCP Client (Claude)           │
└─────────────────┬───────────────────────┘
                  │ MCP Protocol
┌─────────────────▼───────────────────────┐
│            RIXA MCP Server              │
│  ┌────────────────────────────────────┐ │
│  │     .NET-specific MCP Tools        │ │
│  └────────────────┬───────────────────┘ │
│  ┌────────────────▼───────────────────┐ │
│  │      Language Dispatcher           │ │
│  └────────────────┬───────────────────┘ │
│  ┌────────────────▼───────────────────┐ │
│  │      DotNetDebugger Class          │ │
│  └────────────────┬───────────────────┘ │
└─────────────────┬───────────────────────┘
                  │ DAP Protocol
┌─────────────────▼───────────────────────┐
│    Debug Adapters (vsdbg/netcoredbg)    │
└─────────────────┬───────────────────────┘
                  │
┌─────────────────▼───────────────────────┐
│         .NET Application                │
└─────────────────────────────────────────┘
```

### Key Design Decisions

1. **Dual Adapter Support**: Supporting both vsdbg and netcoredbg ensures maximum compatibility
2. **DAP Protocol**: Using standard DAP ensures VS Code and VS 2022+ compatibility
3. **Modular Architecture**: Separate classes for different frameworks maintains clean separation
4. **Graceful Degradation**: Fallback from vsdbg to netcoredbg if needed

## File Structure

```
src/
├── dotnet/
│   ├── dotnet-debugger.ts          # Main debugger class
│   ├── vsdbg-adapter.ts            # vsdbg integration
│   ├── netcoredbg-adapter.ts       # netcoredbg integration
│   ├── aspnet-debugger.ts          # ASP.NET Core support
│   ├── blazor-debugger.ts          # Blazor support
│   ├── project-analyzer.ts         # .csproj analysis
│   └── types.ts                    # TypeScript interfaces
├── core/
│   └── language-dispatcher.ts      # [Modified] Add .NET routing
├── mcp-stdio.ts                    # [Modified] Add .NET tools
└── __tests__/
    └── dotnet-debugging.test.ts    # Test suite
```

## Dependencies and Requirements

### System Requirements
- .NET SDK 6.0+ installed
- vsdbg or netcoredbg debugger available
- Node.js 20+ (existing RIXA requirement)

### NPM Dependencies
- No additional packages required (uses existing DAP infrastructure)

### External Tools
- **vsdbg**: Microsoft's official debugger (auto-downloadable)
- **netcoredbg**: Open-source alternative (manual installation)

## Risk Analysis and Mitigation

| Risk | Impact | Probability | Mitigation |
|------|--------|-------------|------------|
| vsdbg licensing restrictions | Medium | Low | Support netcoredbg as alternative |
| DAP protocol changes | Low | Low | Version checking and compatibility layer |
| Complex framework debugging | Medium | Medium | Incremental implementation, basic features first |
| Performance issues with large apps | Medium | Low | Implement pagination and lazy loading |
| Cross-platform compatibility | High | Low | Test on Windows, Linux, macOS |

## Testing Strategy

### Unit Tests
- Adapter initialization and connection
- Breakpoint management
- Variable inspection
- Expression evaluation

### Integration Tests
- End-to-end debugging scenarios
- Framework-specific features
- Multi-threaded application debugging
- Exception handling

### Manual Testing
- VS Code debugging experience
- Visual Studio 2022+ compatibility
- Cross-platform validation

## Documentation Requirements

### User Documentation
- Getting started guide
- Configuration reference
- Troubleshooting guide
- Framework-specific guides

### Developer Documentation
- API reference
- Architecture documentation
- Contributing guidelines
- Extension points

## Timeline and Milestones

| Week | Milestone | Deliverables |
|------|-----------|--------------|
| 1-2 | Core Implementation | Basic .NET debugging functional |
| 3-4 | Framework Support | ASP.NET Core and Blazor debugging |
| 5 | Integration | MCP tools and language dispatcher |
| 6 | Testing & Docs | Complete test suite and documentation |

## Rollout Plan

1. **Alpha Release**: Internal testing with basic features
2. **Beta Release**: Community testing with core features
3. **RC Release**: Feature-complete with known issues resolved
4. **GA Release**: Production-ready with full documentation

## Support and Maintenance

### Post-Release Support
- Bug fixes and patches
- Performance improvements
- New .NET version support
- Framework updates

### Long-term Roadmap
- MAUI debugging support
- Azure Functions debugging
- Container debugging
- Performance profiling integration

## Related Documents

- [Technical Specifications](./technical-specifications.md) - Detailed technical requirements
- [Adapter Comparison](./adapter-comparison.md) - vsdbg vs netcoredbg analysis
- [API Reference](./api-reference.md) - Detailed API documentation
- [Testing Guide](./testing-guide.md) - Comprehensive testing procedures

## Approval and Sign-off

| Role | Name | Date | Signature |
|------|------|------|-----------|
| Technical Lead | | | |
| Project Manager | | | |
| QA Lead | | | |

---

*Document Version: 1.0*  
*Last Updated: 2025-08-29*  
*Status: Draft*