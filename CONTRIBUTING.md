# Contributing to Speed-Read

Thank you for your interest in contributing to Speed-Read! This document provides guidelines and instructions for contributing.

## Code of Conduct

By participating in this project, you agree to abide by our [Code of Conduct](CODE_OF_CONDUCT.md).

## How to Contribute

### Reporting Bugs

Before creating a bug report, please check existing issues to avoid duplicates. When creating a bug report, include:

- A clear, descriptive title
- Steps to reproduce the issue
- Expected behavior vs actual behavior
- Browser/environment information
- Sample files (if applicable and non-sensitive)

### Suggesting Features

Feature requests are welcome! Please include:

- A clear description of the feature
- The problem it solves or use case it enables
- Any implementation ideas you have

### Pull Requests

1. Fork the repository
2. Create a feature branch (`git checkout -b feature/amazing-feature`)
3. Make your changes
4. Run tests (`npm test`)
5. Run linting (`npm run lint`)
6. Commit your changes with a descriptive message
7. Push to your branch
8. Open a Pull Request

#### PR Guidelines

- Keep PRs focused on a single change
- Update documentation if needed
- Add tests for new features
- Ensure all tests pass
- Follow the existing code style

## Development Setup

```bash
# Clone your fork
git clone https://github.com/YOUR_USERNAME/speed-read.git
cd speed-read

# Install dependencies
npm install

# Start development server
npm run dev

# Run tests
npm test

# Build for production
npm run build
```

## Project Structure

```
speed-read/
├── src/
│   ├── core/           # Core engine (validation, page controller)
│   ├── readers/        # Format-specific readers (EPUB, PDF, CBZ)
│   ├── components/     # Web Component
│   └── react/          # React wrapper
├── tests/              # Test files
├── docs/               # Documentation
└── demo/               # Demo site
```

## Questions?

Feel free to open an issue for any questions about contributing.
