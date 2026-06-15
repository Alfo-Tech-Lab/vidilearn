# Vidilearn

> Teach your AI using YouTube videos.

Vidilearn is a lightweight CLI tool that extracts transcripts, subtitles, descriptions, chapters, and structured metadata from YouTube videos — without requiring API keys.

Built for AI agents, RAG pipelines, educational tools, automation workflows, and developer tooling.

---

## Features

- Extract transcripts from YouTube videos
- Download subtitles and captions
- Extract video descriptions
- Parse chapters and timestamps
- Structured JSON output
- No API keys required
- Lightweight and fast
- AI / RAG ready

---

## Installation

```bash
npm install -g vidilearn
```

---

## Quick Start

```bash
vidilearn extract "https://youtube.com/watch?v=VIDEO_ID"
```

---

## Rule of Thumb

Whenever a URL contains special characters like `?`, `&`, or `=`, always wrap the URL in quotes.

### Incorrect

```bash
vidilearn extract https://youtube.com/watch?v=abc123&list=xyz
```

### Correct

```bash
vidilearn extract "https://youtube.com/watch?v=abc123&list=xyz"
```

---

## CLI Usage

### Extract Video Data

```bash
vidilearn extract "<youtube-url>"
```

### Example

```bash
vidilearn extract "https://www.youtube.com/watch?v=dQw4w9WgXcQ"
```

---

## Example Output

```json
{
  "title": "Sample Video",
  "channel": "Example Channel",
  "description": "Video description here...",
  "transcript": "Full transcript content...",
  "chapters": [
    {
      "title": "Introduction",
      "timestamp": "00:00"
    }
  ]
}
```

---

## Use Cases

### AI Agents

Teach AI agents using long-form YouTube knowledge.

### RAG Pipelines

Convert educational videos into searchable AI datasets.

### Educational Apps

Transform lectures into structured learning content.

### Automation Workflows

Integrate into bots, pipelines, and AI systems.

### Developer Tooling

Use inside scripts, apps, and backend workflows.

---

## Why Vidilearn?

Most YouTube extraction tools:
- require APIs
- are bloated
- break frequently
- are not AI-focused

Vidilearn is designed for:
- speed
- simplicity
- AI workflows
- developer productivity

---

## Philosophy

Vidilearn follows a simple idea:

> Videos contain knowledge.  
> AI should be able to learn from them instantly.

---

## Contributing

Pull requests, issues, and feature ideas are welcome.

---

## License

MIT
