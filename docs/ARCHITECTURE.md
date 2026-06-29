# Vidilearn Architecture Specification

This document details the high-level architecture, design patterns, and system contracts of Vidilearn, an **offline-first local AI knowledge infrastructure platform**.

---

## 1. System Topology

Vidilearn is structured as a decoupled layered application to support CLI execution, interactive sessions, and daemon MCP integrations.

```
       [ CLI Commands ]      [ MCP Client (e.g. Cursor) ]
              │                        │
              ▼                        ▼
     [ Command Router ]       [ MCP Server (Stdio) ]
              │                        │
              └───────────┬────────────┘
                          │
                          ▼
              [ Core Orchestration Engine ]
                          │
      ┌───────────────────┼───────────────────┐
      ▼                   ▼                   ▼
[Ingestion Service] [Graph Service] [Retrieval Service]
      │                   │                   │
      ▼                   ▼                   ▼
[Parsing Drivers]   [Entity Extractor]  [FTS5 + Vector Ranker]
      │                   │                   │
      └───────────────────┼───────────────────┘
                          │
                          ▼
            [ SQLite Storage Provider ]
```

---

## 2. Storage Abstraction Layer

Vidilearn currently stores unified documents and vector embeddings locally inside an embedded **SQLite** instance (`~/.vidilearn/vidilearn.db`). 

To ensure adaptability for enterprise-scale workloads, storage operations are routed through a generic abstract driver interface. Future providers can implement this interface:

* **SQLite** (Default, fully embedded, zero-setup)
* **LanceDB** (Local serverless vector database)
* **Qdrant Local** (Single-binary embedded vector engine)
* **ChromaDB Local** (Client-side embedded database)

---

## 3. Versioned Output Contracts (Schema Version 2.0)

All components, tools, and CLI commands emit output conforming to versioned JSON contracts to ensure seamless interoperability with upstream LLMs and orchestration agents.

### Base Document Schema
```json
{
  "schemaVersion": "2.0",
  "documentId": 12,
  "sourceType": "youtube | article | pdf | docx | text | audio",
  "title": "Document Title",
  "url": "https://source.url",
  "author": "Author or Creator",
  "publishedDate": "2026-06-28",
  "extractedAt": "2026-06-28T09:30:00.000Z",
  "metadata": {
    "wordCount": 1850,
    "hasSubtitles": true
  }
}
```

### Retrieval Chunk Schema
```json
{
  "schemaVersion": "2.0",
  "chunkId": 142,
  "documentId": 12,
  "text": "Extracted segment string text...",
  "score": 0.895,
  "chunkIndex": 4,
  "metadata": {
    "pageNumber": 12,
    "timestamp": 240
  }
}
```
