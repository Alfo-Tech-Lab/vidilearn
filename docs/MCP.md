# Model Context Protocol (MCP) Specification

Vidilearn runs as a native Model Context Protocol server. This allows AI developer agents (such as Claude Desktop, Cursor, or Codex) to execute queries directly against your local memory.

---

## 1. Protocol Architecture

```
[ AI Desktop Client ] ──( Stdio JSON-RPC 2.0 )──► [ Vidilearn MCP Server ] ──► [ Local Memory SQLite ]
```

All interactions use JSON-RPC 2.0 frames running over Standard I/O (stdio) transport.

---

## 2. Tool Contracts

The following schemas are exposed via `ListToolsRequestSchema`:

### A. `search_memory`
Performs hybrid FTS5 and vector similarity search.
* **Input Schema**:
  ```json
  {
    "type": "object",
    "properties": {
      "query": { "type": "string", "description": "Search query" },
      "limit": { "type": "number", "description": "Optional limit" }
    },
    "required": ["query"]
  }
  ```
* **Output Format**: Returns list of matching documents and content chunks with relevance metrics.

### B. `extract_youtube`
Retrieves metadata and transcripts for a YouTube video on the fly.
* **Input Schema**:
  ```json
  {
    "type": "object",
    "properties": {
      "url": { "type": "string", "description": "YouTube URL" }
    },
    "required": ["url"]
  }
  ```

### C. `extract_entities`
Runs entity and concept co-occurrence analysis on documents stored in local memory.
* **Output Format**: Returns Mermaid diagram and nodes list.
