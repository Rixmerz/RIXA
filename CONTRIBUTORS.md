# Contributors

This document acknowledges the contributions made to the RIXA (Runtime Intelligent eXecution Adapter) project.

## Core Contributors

### Rixmerz (Juan Pablo Diaz)
- **GitHub:** [@Rixmerz](https://github.com/Rixmerz)
- **Email:** 129809369+Rixmerz@users.noreply.github.com
- **Role:** Project Maintainer & Lead Developer
- **Contributions:**
  - Project architecture and core infrastructure
  - MCP (Model Context Protocol) server implementation
  - Language dispatcher and session management
  - Electron debugging support
  - Java debugging integration
  - Python debugging integration
  - Go debugging integration
  - PHP debugging integration
  - Rust debugging integration
  - Hybrid debugging architecture design and implementation
  - Build system and CI/CD setup
  - Documentation and project management

### Mikael Liljedahl (mikaelliljedahl)
- **GitHub:** [@mikaelliljedahl](https://github.com/mikaelliljedahl)
- **Email:** mliljedahl@gmail.com
- **Role:** .NET Debugging Architecture Contributor
- **Contributions:**
  - **Original .NET debugging implementation** in branch `mikaelliljedahl:feature/dotnet-support`
  - Created foundational .NET debugging architecture
  - Implemented initial .NET debugging tools and adapters
  - Provided comprehensive .NET debugging documentation including:
    - Debug adapter comparison (vsdbg vs netcoredbg)
    - .NET implementation planning and technical specifications
    - Project analysis and framework detection utilities
  - Established patterns for .NET debugging that influenced the hybrid architecture
  - **Commit:** `e07195d` - "added dotnet support, not tested"

**Note:** Mikael's original .NET debugging work from the `feature/dotnet-support` branch was integrated and enhanced as part of the hybrid debugging architecture implementation. While the final implementation was significantly refactored and extended, the foundational concepts, documentation, and initial .NET debugging patterns originated from Mikael's contributions.

## Acknowledgments

We thank all contributors who have helped make RIXA a comprehensive debugging solution for multiple programming languages. Special recognition goes to:

- **mikaelliljedahl** for pioneering the .NET debugging support and providing the foundation that enabled the hybrid debugging architecture
- The open-source community for feedback and suggestions
- Microsoft and the .NET team for the excellent debugging tools (vsdbg)
- The Samsung team for the open-source netcoredbg debugger
- The Debug Adapter Protocol (DAP) community for standardizing debugging interfaces

## Contributing

We welcome contributions from the community! Please see our [Contributing Guidelines](CONTRIBUTING.md) for information on how to get involved.

### How to Contribute

1. Fork the repository
2. Create a feature branch
3. Make your changes
4. Add tests if applicable
5. Update documentation
6. Submit a pull request

### Areas for Contribution

- Additional programming language support
- Enhanced debugging features
- Performance improvements
- Documentation improvements
- Bug fixes and testing

## Attribution Policy

All significant contributions are acknowledged in this file. We believe in giving proper credit to everyone who helps improve RIXA. If you've contributed and don't see your name here, please let us know!

---

*Last updated: August 31, 2025*
