# Vidilearn I/O Specification

This document details the inputs and outputs of Vidilearn.

---

## 1. Input Specifications

Vidilearn supports a wide variety of input sources:

### A. YouTube Videos
* **Input**: Standard video URL (e.g., `https://www.youtube.com/watch?v=dQw4w9WgXcQ` or short URL `https://youtu.be/dQw4w9WgXcQ`).
* **CLI Option**: `vidilearn ingest <url>` or `vidilearn extract <url>`

### B. General Web Articles
* **Input**: Public web page URL (static pages are parsed via Readability; dynamic JS pages trigger a Playwright browser fallback).
* **CLI Option**: `vidilearn ingest <url>` or `vidilearn extract <url>`

### C. Documents
* **PDF**: `.pdf` file paths. Parsed locally using `pdf-parse`.
* **Word DOCX**: `.docx` file paths. Parsed locally using `mammoth`.
* **EPUB Books**: `.epub` file paths. Parsed using zip extraction.
* **Markdown/Plain Text**: `.md` and `.txt` files.

### D. Audio Recordings (Speech-to-Text)
* **Format**: `.mp3`, `.wav`, `.m4a`, `.ogg`.
* **Processing**: Converted to 16kHz mono PCM raw streams and transcribed using a local Whisper pipeline.

### E. RSS Feeds & Podcasts
* **Input**: XML feed URLs.
* **Processing**: Parses feed items or podcast enclosure URLs and extracts text.

### F. GitHub Code Repositories
* **Input**: Git URL (e.g. `https://github.com/user/repo`).
* **Processing**: Performs local clone and ingests all code files.

---

## 2. Output Specifications

### A. SQLite Knowledge Database (`vidilearn.db`)
Stored in `~/.vidilearn/vidilearn.db`:

#### `documents` Table
```sql
CREATE TABLE documents (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  title TEXT NOT NULL,
  url TEXT,
  source_type TEXT NOT NULL,
  metadata TEXT, -- JSON holding dates, authors, thumb URLs
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP
);
```

#### `chunks` Table
```sql
CREATE TABLE chunks (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  document_id INTEGER REFERENCES documents(id) ON DELETE CASCADE,
  text TEXT NOT NULL,
  embedding BLOB NOT NULL, -- Float32Array binary vector (384 dimensions)
  chunk_index INTEGER NOT NULL,
  metadata TEXT -- JSON holding page offsets, durations, or page numbers
);
```

### B. Standardized JSON Output
Extracting or search queries return a unified JSON schema:

```json
{
  "sourceType": "youtube | article | pdf | docx | text",
  "title": "Document Title",
  "url": "https://source.url",
  "author": "Author or Channel Name",
  "publishedDate": "2026-06-28",
  "transcript": "Full text or transcript string content...",
  "clean_text": "Alternative text container...",
  "metadata": {
    "viewCount": 120530,
    "duration": 240
  },
  "extractedAt": "2026-06-28T14:46:34.000Z"
}
```

### C. Knowledge Graph (Mermaid/JSON)
* **Mermaid Output**: Diagram syntax representing entities and connections:
  ```mermaid
  graph TD
    doc_1["Rick Astley - Never Gonna Give You Up"]
    ent_never(("Never"))
    doc_1 -->|"mentions"| ent_never
  ```
