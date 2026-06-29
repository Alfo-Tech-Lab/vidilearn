# Retrieval & RAG Architecture Specification

This document details the core of Vidilearn's local intelligence system: the **Retrieval-Augmented Generation (RAG) Architecture**.

---

## 1. Chunking Specification

To optimize retrieval precision and avoid fragmenting critical explanations, Vidilearn supports multiple chunking strategies:

| Chunking Mode | Description | Defaults |
| --- | --- | --- |
| `fixed` | Fixed char/token count splits. | Size: 500 chars, Overlap: 100 chars |
| `sentence` | Splits strictly on sentence boundaries (`.!?`). | Maximum chunk size: 500 chars |
| `paragraph` | Splits on double newlines (`\n\n`) to preserve paragraph structure. | Maximum size: 800 chars |
| `transcript-aware` | Groups timed subtitle segments into chronological paragraphs. | Max duration block: 30s |

### Context Overlap Window
To prevent semantic boundary cut-offs, chunks carry a sliding window overlap. If a sentence spans across a boundary, the tokenizer includes the full sentence in both chunks.

## # 4. Embedding Specification

Default embedding dimensions:
* 384 dimensions

Supported embedding providers:
* nomic-embed-text
* bge-small-en
* all-MiniLM-L6-v2

Embedding storage:
* Float32Array binary blob

Distance metrics:
* cosine similarity
* dot product

Chunk size defaults:
* 500 tokens
* 100 token overlap

Metadata:
* embedding_model
* embedding_version
* created_at

Example:
```json
{
  "embeddingModel": "nomic-embed-text",
  "dimensions": 384,
  "distanceMetric": "cosine"
}
```

---

## 3. Hybrid Search & Ranking Architecture

Vidilearn combines keyword-based search with semantic vector search for a robust hybrid retrieval mechanism.

```
                  [ User Query ]
                        │
         ┌──────────────┴──────────────┐
         ▼                             ▼
   [ BM25 Search ]            [ Semantic Search ]
(SQLite FTS5 matching)       (Cosine Similarity Vector)
         │                             │
  Keyword Score (30%)          Vector Score (70%)
         │                             │
         └──────────────┬──────────────┘
                        ▼
                [ Hybrid Ranker ]
                        │
                [ Reciprocal Rank ]
                        │
                        ▼
            [ Top K Relevant Chunks ]
```

### Retrieval & Synthesis Algorithm
1. **FTS Matching**: Clean query is passed to SQLite FTS5 MATCH. Candidates are retrieved and ranked using BM25.
2. **Vector Similarity**: Query is embedded to a Float32 array. Chunks are compared using JavaScript-level cosine similarity.
3. **Score Fusion**: Scores are fused using a weighted average:
   $$\text{Score} = (0.3 \times \text{Keyword Score}) + (0.7 \times \text{Semantic Score})$$
4. **Context Assembly**: The top $K$ chunks are sorted by index per document to restore reading order, then formatted as structured context blocks for the LLM.
