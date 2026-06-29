# 3. Processing Pipeline Specification

Vidilearn uses a multi-stage ingestion pipeline:

Input Source
↓
Extractor
↓
Cleaner
↓
Chunker
↓
Embedding Engine
↓
Vector Storage
↓
Search Index
↓
MCP Agent Layer
↓
CLI/API Output

---

## Pipeline Stages

### Extractor

Responsible for:
* fetching remote content
* subtitle extraction
* HTML parsing
* PDF decoding
* audio transcription

### Cleaner

Responsible for:
* removing ads
* Unicode normalization
* whitespace cleanup
* timestamp alignment
* speaker normalization

### Chunker

Responsible for:
* semantic chunking
* overlap windows
* metadata linking

### Embedding Engine

Responsible for:
* local embeddings
* Float32 vector generation
* dimension consistency

### Search Layer

Responsible for:
* semantic retrieval
* BM25 keyword matching
* hybrid ranking

### MCP Layer

Responsible for:
* exposing tools to AI agents
* query orchestration
* memory retrieval
