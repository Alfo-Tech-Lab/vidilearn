# Vidilearn

<div align="center">

# Teach your AI using YouTube videos

Lightweight AI-first YouTube extraction CLI for transcripts, subtitles, chapters, descriptions, and structured metadata — without API keys.

[Installation](#installation) •
[Quick Start](#quick-start) •
[Features](#features) •
[AI Workflows](#ai--agent-workflows) •
[CLI Usage](#cli-usage) •
[JSON Output](#json-output)

</div>

---

## Overview

Vidilearn is a modern developer-first CLI designed for AI agents, RAG pipelines, automation systems, MCP servers, Codex CLI workflows, Gemini CLI integrations, and educational tooling.

Extract structured knowledge from YouTube videos directly into your AI systems.

No API keys.  
No browser automation.  
No bloated setup.

---

# Features

- Extract transcripts
- Download subtitles
- Parse descriptions
- Extract chapters & timestamps
- Structured JSON output
- AI-ready data formatting
- Fast CLI workflow
- No API key required
- Lightweight architecture
- Automation-friendly
- Works with AI agents & MCP systems
- Clean terminal experience

---

# Installation

## Global Installation

```bash
npm install -g vidilearn
```

## Verify Installation

```bash
vidilearn --help
```

---

# Quick Start

## Extract Video Knowledge

```bash
vidilearn extract "https://youtube.com/watch?v=VIDEO_ID"
```

---

# Rule of Thumb

Whenever a URL contains special characters like `?`, `&`, or `=`, always wrap it in quotes.

## Incorrect

```bash
vidilearn extract https://youtube.com/watch?v=abc123&list=xyz
```

## Correct

```bash
vidilearn extract "https://youtube.com/watch?v=abc123&list=xyz"
```

---

# Example JSON Output

```json
{
  "title": "Build AI Agents",
  "channel": "AI Academy",
  "duration": "12:45",
  "description": "Learn how to build AI agents...",
  "transcript": "...",
  "chapters": [
    {
      "title": "Introduction",
      "timestamp": "00:00"
    },
    {
      "title": "Agent Architecture",
      "timestamp": "03:42"
    }
  ]
}
```

---

# CLI Usage

## Basic Extraction

```bash
vidilearn extract "<youtube-url>"
```

## Save Output

```bash
vidilearn extract "<youtube-url>" > output.json
```

## Pretty JSON Output

```bash
vidilearn extract "<youtube-url>" --pretty
```

## Transcript Only

```bash
vidilearn extract "<youtube-url>" --transcript
```

## Chapters Only

```bash
vidilearn extract "<youtube-url>" --chapters
```

## Metadata Only

```bash
vidilearn extract "<youtube-url>" --metadata
```

---

# AI & Agent Workflows

Vidilearn is designed for modern AI ecosystems.

## Compatible With

- OpenAI Agents
- MCP Servers
- Codex CLI
- Gemini CLI
- Claude Workflows
- LangChain
- LangGraph
- CrewAI
- AutoGen
- RAG Pipelines
- Vector Databases
- Local AI Systems
- AI Automation Agents

---

# MCP Server Integration

Use Vidilearn inside MCP-based AI systems to feed YouTube knowledge directly into your agents.

## Example

```bash
vidilearn extract "<youtube-url>" --json
```

Pipe the structured output into:
- memory systems
- vector stores
- retrieval pipelines
- autonomous agents

---

# Codex CLI Workflow

Use Vidilearn to give coding agents contextual learning data from technical YouTube videos.

## Example

```bash
vidilearn extract "https://youtube.com/watch?v=VIDEO_ID" > context.json
```

Then feed the extracted data into:
- Codex CLI
- AI coding agents
- autonomous developer workflows

---

# Gemini CLI Integration

Use Vidilearn as a knowledge ingestion layer for Gemini-powered automation systems.

## Example Workflow

```bash
vidilearn extract "<youtube-url>" --pretty
```

Pass the extracted transcript into:
- Gemini CLI prompts
- summarization pipelines
- AI research systems
- educational assistants

---

# AI Use Cases

## RAG Pipelines

Convert long-form educational videos into searchable knowledge bases.

## AI Memory Systems

Store YouTube knowledge into persistent AI memory.

## Educational Applications

Turn lectures into structured AI-readable datasets.

## Autonomous Agents

Allow AI agents to learn directly from YouTube.

## Research Systems

Extract technical insights from conferences, tutorials, and talks.

---

# Architecture Philosophy

Vidilearn is built around:

- simplicity
- speed
- AI-first workflows
- lightweight tooling
- structured extraction
- automation compatibility

---

# Why Vidilearn?

Most YouTube extraction tools:

- require API keys
- are bloated
- break frequently
- are not AI-focused
- have poor automation support

Vidilearn focuses on:

- developer experience
- AI-native workflows
- structured outputs
- clean CLI ergonomics
- production-ready automation

---

# Performance Goals

- Fast extraction
- Minimal dependencies
- Low memory footprint
- Automation-safe architecture
- Reliable structured output

---

# Roadmap

- Streaming transcript extraction
- Batch playlist processing
- MCP-native server mode
- Local embedding pipeline support
- Vector database integrations
- AI summarization modules
- Multi-language subtitle support
- Live stream support

---

# Contributing

Contributions are welcome.

Ideas, improvements, bug reports, and feature requests are appreciated.

---

# Security

Vidilearn does not require API keys or authentication tokens.

Always review extracted content before using it in production AI systems.

---

# License

MIT License

---

---

## Support

If Vidilearn helps your workflow, consider sponsoring development ❤️

GitHub Sponsors:
https://github.com/sponsors/sarathi-eng

---

# Author

Built by Alfo Tech Industries

---

© 2026 Alfo Tech Industries. All rights reserved.
