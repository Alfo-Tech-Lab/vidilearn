# Changelog

All notable changes to this project will be documented in this file.

## [1.1.0] - 2026-06-19

### Added
- **MCP Server Mode**: Added `vidilearn mcp-server` to start an MCP-compliant server on stdio.
- **Batch Processing**: Added `vidilearn extract-playlist` for YouTube playlist extraction with concurrency control.
- **Streaming Support**: Added `--stream` flag to `extract` and `transcript` commands for real-time transcript output.
- **Local Embeddings**: Added `--embed` flag to generate local vector embeddings using `@xenova/transformers`.
- **Web Extraction**: Implemented robust web article extraction with automatic Playwright fallback for dynamic sites.
- **Multi-language**: Added `--lang` and `--list-langs` flags for selecting and discovering subtitle tracks.
- **Live Stream Support**: Added detection and handling for YouTube live streams and premieres.
- **Repo Hygiene**: Added MIT License, Funding configuration, CI workflows, and comprehensive contributing guide.

### Changed
- Improved JSON output schema for better compatibility with AI agents.
- Optimized Playwright installation (now an optional dependency).
- Refined CLI ergonomics and added `--pretty` flag for easier debugging.

### Fixed
- Fixed various extraction edge cases and improved error messaging.
