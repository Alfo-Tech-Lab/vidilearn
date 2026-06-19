<div align="center">

# Vidilearn

### Teach your AI using YouTube videos and the web

Production-grade content extraction agent for YouTube and the web. Extract transcripts, clean articles, and structured metadata locally — zero API keys, with automatic Playwright fallback for dynamic sites.

[![npm version](https://img.shields.io/npm/v/vidilearn.svg)](https://www.npmjs.com/package/vidilearn)
[![npm downloads](https://img.shields.io/npm/dt/vidilearn.svg)](https://www.npmjs.com/package/vidilearn)
[![CI](https://github.com/Alfo-Tech-Lab/vidilearn/actions/workflows/ci.yml/badge.svg)](https://github.com/Alfo-Tech-Lab/vidilearn/actions)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](./LICENSE)

[Installation](#installation) • [Quick Start](#quick-start) • [Features](#features) • [CLI Usage](#cli-usage) • [MCP Server](#mcp-server-mode) • [AI Workflows](#ai--agent-workflows)

</div>

---

## Overview

Vidilearn is a modern developer-first CLI and MCP server designed for AI agents, RAG pipelines, automation systems, Codex CLI workflows, Gemini CLI integrations, and educational tooling.

Extract structured knowledge from YouTube videos **and web articles** directly into your AI systems.

No API keys.
No bloated setup.
No vendor lock-in.

---

## Features

**YouTube**
- Transcript extraction
- Subtitle download with multi-language support (`--lang`, `--list-langs`)
- Chapter & timestamp extraction
- Description and metadata parsing
- Batch playlist extraction
- Live/premiere video detection
- Streaming transcript output for long videos

**Web**
- Clean article extraction from static pages
- Automatic Playwright fallback for JS-rendered / dynamic sites
- Same structured JSON schema as YouTube output

**AI-native**
- Native MCP server mode — expose extraction as tools, not just CLI output
- Local embedding generation via `@xenova/transformers` — no external embedding API needed
- AI-ready structured JSON output across every command

**Engineering**
- Zero API keys required
- Lightweight by default — Playwright loads lazily, only when the fallback path is triggered
- Automation-friendly, scriptable, pipeable

---

## Installation

### Global Installation

```
npm install -g vidilearn
```

### Verify Installation

```
vidilearn --help
```

---

## Quick Start

### Extract a YouTube video

```
vidilearn extract "https://youtube.com/watch?v=VIDEO_ID"
```

### Extract a web article

```
vidilearn extract "https://example.com/some-article"
```

Vidilearn auto-detects YouTube vs. general web URLs and routes to the correct extractor.

> **Rule of thumb:** Whenever a URL contains `?`, `&`, or `=`, wrap it in quotes to avoid shell interpretation issues.

---

## CLI Usage

### YouTube extraction

```
vidilearn extract "<youtube-url>"                # full extraction
vidilearn extract "<youtube-url>" --pretty        # pretty-printed JSON
vidilearn extract "<youtube-url>" --transcript    # transcript only
vidilearn extract "<youtube-url>" --chapters      # chapters only
vidilearn extract "<youtube-url>" --metadata      # metadata only
vidilearn extract "<youtube-url>" --stream        # stream transcript as it's parsed
```

### Subtitle language control

```
vidilearn extract "<youtube-url>" --list-langs        # list available subtitle languages
vidilearn extract "<youtube-url>" --lang es            # extract Spanish subtitles
```

### Batch playlist extraction

```
vidilearn extract-playlist "<playlist-url>"
vidilearn extract-playlist "<playlist-url>" --concurrency 5
vidilearn extract-playlist "<playlist-url>" --output-dir ./videos
```

### Web article extraction

```
vidilearn extract "<article-url>"
```

Static pages are parsed directly. If the page returns little to no usable content (typical of JS-heavy sites), vidilearn automatically retries using a headless Playwright browser.

### Local embeddings

```
vidilearn extract "<url>" --embed
```

Outputs `{ chunk, embedding }` pairs generated locally — ready for ingestion into a vector store, no API key required.

### Save output

```
vidilearn extract "<url>" > output.json
```

---

## Example JSON Output

### YouTube

```json
{
  "title": "Build AI Agents",
  "channel": "AI Academy",
  "duration": "12:45",
  "description": "Learn how to build AI agents...",
  "transcript": "...",
  "chapters": [
    { "title": "Introduction", "timestamp": "00:00" },
    { "title": "Agent Architecture", "timestamp": "03:42" }
  ]
}
```

### Web article

```json
{
  "title": "Understanding Transformer Architectures",
  "source_url": "https://example.com/transformers",
  "byline": "Jane Doe",
  "published_date": "2026-04-02",
  "clean_text": "...",
  "word_count": 1840
}
```

---

## MCP Server Mode

Run vidilearn as a native MCP server so agents can call extraction directly as a tool, instead of shelling out to the CLI.

```
vidilearn mcp-server
```

Exposes `extract_youtube` and `extract_web` as MCP tools over stdio transport — compatible with Claude, Gemini CLI, and any MCP-compatible agent framework.

---

## AI & Agent Workflows

Vidilearn is designed for modern AI ecosystems.

**Compatible with:**
- MCP Servers (native)
- Claude Workflows
- Gemini CLI
- Codex CLI
- OpenAI Agents
- LangChain / LangGraph
- CrewAI / AutoGen
- RAG pipelines
- Vector databases
- Local AI systems

**Use cases:**
- **RAG pipelines** — convert long-form videos and articles into searchable knowledge bases
- **AI memory systems** — store extracted knowledge into persistent agent memory
- **Educational applications** — turn lectures and tutorials into structured AI-readable datasets
- **Autonomous agents** — let agents learn directly from YouTube and the web via the MCP server
- **Research systems** — extract technical insights from conferences, talks, and long-form articles

---

## Why Vidilearn?

Most extraction tools require API keys, are bloated, break frequently, or aren't built with AI agents in mind.

Vidilearn focuses on:
- Developer experience
- AI-native workflows (CLI **and** MCP)
- Structured, consistent outputs across content types
- Clean CLI ergonomics
- Production-ready automation

---

## Roadmap

- Vector database integrations (Pinecone, Weaviate, Qdrant adapters)
- AI summarization modules
- Live stream partial-transcript extraction
- Browser extension companion

---

## Contributing

Contributions are welcome. See [CONTRIBUTING.md](./CONTRIBUTING.md) for setup steps and the PR checklist.

---

## Security

Vidilearn does not require API keys or authentication tokens. Always review extracted content before using it in production AI systems.

---

## License

MIT — see [LICENSE](./LICENSE).

---

## Support

If Vidilearn helps your workflow, consider sponsoring development ❤️

GitHub Sponsors: https://github.com/sponsors/sarathi-eng

---

## Author

Built by Alfo Tech Industries

© 2026 Alfo Tech Industries. All rights reserved.
