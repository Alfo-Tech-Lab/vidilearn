import Database from 'better-sqlite3';
import path from 'path';
import fs from 'fs';
import os from 'os';
import crypto from 'crypto';
import * as sqliteVec from 'sqlite-vec';
import { configService } from './config.js';
import { rerankerService } from './reranker.js';
import { searchCache } from './cache.js';
import { performanceMonitor } from './monitoring.js';

const DB_DIR = path.join(os.homedir(), '.vidilearn');
if (!fs.existsSync(DB_DIR)) {
  fs.mkdirSync(DB_DIR, { recursive: true });
}
const DB_PATH = path.join(DB_DIR, 'vidilearn.db');

class DBService {
  constructor() {
    this.db = new Database(DB_PATH);
    
    // SQLite performance tuning
    this.db.pragma('journal_mode = WAL');
    this.db.pragma('synchronous = NORMAL');
    this.db.pragma('mmap_size = 268435456'); // 256MB Memory-mapped I/O
    this.db.pragma('temp_store = MEMORY');    // Store temp tables in RAM
    this.db.pragma('cache_size = -64000');    // 64MB Page cache
    this.db.pragma('page_size = 4096');       // 4KB block size alignment
    
    // Map of queryKey -> Promise for Request Coalescing (Single Flight)
    this.inProgressSearches = new Map();

    // Load sqlite-vec loadable extension
    this.db.loadExtension(sqliteVec.getLoadablePath());
    
    this.init();
  }

  init() {
    // Enable foreign keys
    this.db.pragma('foreign_keys = ON');

    try {
      this.db.exec("ALTER TABLE chunks ADD COLUMN chunk_uuid TEXT UNIQUE");
    } catch(e) {}
    try {
      this.db.exec("ALTER TABLE chunks ADD COLUMN hash TEXT UNIQUE");
    } catch(e) {}

    // Create tables
    this.db.exec(`
      CREATE TABLE IF NOT EXISTS documents (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        title TEXT NOT NULL,
        url TEXT,
        source_type TEXT NOT NULL,
        metadata TEXT,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP
      );

      CREATE TABLE IF NOT EXISTS chunks (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        chunk_uuid TEXT UNIQUE,
        document_id INTEGER,
        text TEXT NOT NULL,
        embedding BLOB NOT NULL,
        chunk_index INTEGER NOT NULL,
        hash TEXT UNIQUE,
        metadata TEXT,
        FOREIGN KEY(document_id) REFERENCES documents(id) ON DELETE CASCADE
      );

      -- FTS5 table for hybrid keyword search
      CREATE VIRTUAL TABLE IF NOT EXISTS chunks_fts USING fts5(
        text,
        content='chunks',
        content_rowid='id'
      );

      -- sqlite-vec virtual table for ANN vector indexing
      CREATE VIRTUAL TABLE IF NOT EXISTS vec_chunks USING vec0(
        embedding float[384]
      );

      CREATE TABLE IF NOT EXISTS extraction_runs (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        source_url TEXT,
        started_at DATETIME,
        completed_at DATETIME,
        status TEXT,
        error_message TEXT
      );

      CREATE TABLE IF NOT EXISTS embeddings (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        chunk_id INTEGER,
        model TEXT,
        dimensions INTEGER,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP
      );

      CREATE TABLE IF NOT EXISTS telemetry (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        operation TEXT,
        latency_ms INTEGER,
        ram_usage_mb INTEGER,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP
      );

      CREATE TABLE IF NOT EXISTS retrieval_logs (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        query TEXT,
        chunk_id TEXT,
        similarity REAL,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP
      );

      CREATE TABLE IF NOT EXISTS chunk_hashes (
        chunk_id TEXT UNIQUE,
        hash TEXT UNIQUE
      );
    `);

    // Create triggers to keep FTS and sqlite-vec in sync
    try {
      this.db.exec(`
        CREATE TRIGGER IF NOT EXISTS chunks_ai AFTER INSERT ON chunks BEGIN
          INSERT INTO chunks_fts(rowid, text) VALUES (new.id, new.text);
        END;

        CREATE TRIGGER IF NOT EXISTS chunks_ad AFTER DELETE ON chunks BEGIN
          INSERT INTO chunks_fts(chunks_fts, rowid, text) VALUES('delete', old.id, old.text);
        END;

        CREATE TRIGGER IF NOT EXISTS chunks_au AFTER UPDATE ON chunks BEGIN
          INSERT INTO chunks_fts(chunks_fts, rowid, text) VALUES('delete', old.id, old.text);
          INSERT INTO chunks_fts(rowid, text) VALUES (new.id, new.text);
        END;

        -- Trigger to delete from vec_chunks automatically when chunk is deleted
        CREATE TRIGGER IF NOT EXISTS chunks_bd BEFORE DELETE ON chunks BEGIN
          DELETE FROM vec_chunks WHERE rowid = old.id;
        END;
      `);
    } catch (e) {
      // Triggers might already exist
    }

    // Backfill any missing embeddings into vec_chunks virtual table
    try {
      const missing = this.db.prepare(`
        SELECT id, embedding FROM chunks
        WHERE id NOT IN (SELECT rowid FROM vec_chunks)
      `).all();

      if (missing.length > 0) {
        console.log(`Backfilling ${missing.length} existing chunk embeddings into sqlite-vec virtual table...`);
        const insertVec = this.db.prepare('INSERT INTO vec_chunks(rowid, embedding) VALUES(?, ?)');
        const backfillTransaction = this.db.transaction((rows) => {
          for (const row of rows) {
            insertVec.run(BigInt(row.id), row.embedding);
          }
        });
        backfillTransaction(missing);
        console.log('sqlite-vec backfill complete!');
      }
    } catch (err) {
      console.warn("Could not check or backfill sqlite-vec table:", err.message);
    }
  }

  // Normalize vectors once at storage / query time to make Euclidean Distance == Cosine Similarity
  normalizeVector(vec) {
    let norm = 0;
    for (let i = 0; i < vec.length; i++) norm += vec[i] * vec[i];
    if (norm === 0) return new Float32Array(vec.length);
    norm = Math.sqrt(norm);
    
    const normalized = new Float32Array(vec.length);
    for (let i = 0; i < vec.length; i++) normalized[i] = vec[i] / norm;
    return normalized;
  }

  insertDocument(title, url, sourceType, metadata = {}) {
    const stmt = this.db.prepare(`
      INSERT INTO documents (title, url, source_type, metadata)
      VALUES (?, ?, ?, ?)
    `);
    const info = stmt.run(title, url, sourceType, JSON.stringify(metadata));
    return info.lastInsertRowid;
  }

  insertChunk(documentId, text, embedding, chunkIndex, metadata = {}) {
    const hash = crypto.createHash('sha256').update(text).digest('hex');

    // Duplicate detection and prevention
    const existing = this.db.prepare("SELECT id FROM chunks WHERE hash = ?").get(hash);
    if (existing) {
      console.log(`[Duplicate Prevention] SKIP DUPLICATE chunk with hash: ${hash.slice(0, 8)}...`);
      return existing.id;
    }

    const uuid = crypto.randomUUID();
    const stmt = this.db.prepare(`
      INSERT INTO chunks (chunk_uuid, document_id, text, embedding, chunk_index, hash, metadata)
      VALUES (?, ?, ?, ?, ?, ?, ?)
    `);
    
    // Normalize vector to ensure Euclidean distance is aligned to Cosine Similarity
    const normalized = this.normalizeVector(embedding);
    const buffer = Buffer.from(normalized.buffer);
    const info = stmt.run(uuid, documentId, text, buffer, chunkIndex, hash, JSON.stringify(metadata));
    const newChunkId = info.lastInsertRowid;

    try {
      this.db.prepare("INSERT INTO chunk_hashes (chunk_id, hash) VALUES (?, ?)").run(uuid, hash);
    } catch (e) {}

    // Index vector in sqlite-vec using BigInt for rowid compatibility
    try {
      this.db.prepare("INSERT INTO vec_chunks(rowid, embedding) VALUES(?, ?)").run(BigInt(newChunkId), buffer);
    } catch (err) {
      console.warn("Failed to index vector in sqlite-vec:", err.message);
    }

    return newChunkId;
  }

  deleteDocumentByUrl(url) {
    const stmt = this.db.prepare('DELETE FROM documents WHERE url = ?');
    return stmt.run(url).changes;
  }

  getAllDocuments() {
    const stmt = this.db.prepare('SELECT * FROM documents ORDER BY created_at DESC');
    return stmt.all().map(doc => ({
      ...doc,
      metadata: JSON.parse(doc.metadata || '{}')
    }));
  }

  // Fallback Cosine Similarity
  cosineSimilarity(vecA, vecB) {
    let dotProduct = 0.0;
    let normA = 0.0;
    let normB = 0.0;
    for (let i = 0; i < vecA.length; i++) {
      dotProduct += vecA[i] * vecB[i];
      normA += vecA[i] * vecA[i];
      normB += vecB[i] * vecB[i];
    }
    if (normA === 0 || normB === 0) return 0;
    return dotProduct / (Math.sqrt(normA) * Math.sqrt(normB));
  }

  // Hybrid search: FTS5 + Semantic Vector Search (via sqlite-vec) + Request Coalescing (Single Flight) + Query Cache
  async search(query, queryEmbedding = null, limit = 10) {
    const startTime = performance.now();
    const cacheOptions = { hasEmbedding: !!queryEmbedding, limit };

    // 1. Check Query Cache (Instant <1ms response)
    const cached = searchCache.get(query, cacheOptions);
    if (cached) {
      const duration = performance.now() - startTime;
      performanceMonitor.recordSearch(query, duration, cached.results.length, 'cache');
      return cached.results;
    }

    // 2. Request Coalescing (Single Flight) to prevent Cache Stampedes under concurrent spikes
    const coalescingKey = `search:${query}:${JSON.stringify(cacheOptions)}`;
    if (this.inProgressSearches.has(coalescingKey)) {
      const results = await this.inProgressSearches.get(coalescingKey);
      const duration = performance.now() - startTime;
      performanceMonitor.recordSearch(query, duration, results.length, 'coalesced');
      return results;
    }

    // Create the search execution promise
    const searchPromise = (async () => {
      let ftsResults = [];
      if (query && query.trim().length > 0) {
        try {
          const cleanQuery = query.replace(/[^a-zA-Z0-9\s]/g, ' ').trim();
          if (cleanQuery.length > 0) {
            const stmt = this.db.prepare(`
              SELECT c.id, c.document_id, c.text, c.embedding, c.chunk_index, c.metadata, d.title, d.url, d.source_type, fts.rank
              FROM chunks_fts fts
              JOIN chunks c ON c.id = fts.rowid
              JOIN documents d ON d.id = c.document_id
              WHERE chunks_fts MATCH ?
              ORDER BY rank LIMIT ?
            `);
            ftsResults = stmt.all(cleanQuery, Math.max(50, limit * 4));
          }
        } catch (err) {
          console.error("FTS search error:", err.message);
        }
      }

      // Get dense candidates using sqlite-vec ANN search
      let denseResults = [];
      if (queryEmbedding) {
        try {
          const normalized = this.normalizeVector(queryEmbedding);
          const queryBuf = Buffer.from(normalized.buffer);
          const stmt = this.db.prepare(`
            SELECT 
              c.id, 
              c.document_id, 
              c.text, 
              c.embedding, 
              c.chunk_index, 
              c.metadata, 
              d.title, 
              d.url, 
              d.source_type,
              v.distance
            FROM vec_chunks v
            JOIN chunks c ON c.id = v.rowid
            JOIN documents d ON d.id = c.document_id
            WHERE v.embedding MATCH ? AND k = ?
          `);
          denseResults = stmt.all(queryBuf, Math.max(100, limit * 6));
        } catch (err) {
          console.error("sqlite-vec search error:", err.message);
        }
      }

      const scored = new Map();
      const RRF_CONSTANT = 60;

      // Map FTS ranks
      const ftsRanks = new Map();
      ftsResults.forEach((r, idx) => {
        ftsRanks.set(r.id, { rank: idx + 1, data: r });
      });

      // Map Semantic ranks from sqlite-vec distance
      denseResults.sort((a, b) => a.distance - b.distance);
      const semanticRanks = new Map();
      denseResults.forEach((r, idx) => {
        semanticRanks.set(r.id, { 
          rank: idx + 1, 
          similarity: Math.max(-1.0, Math.min(1.0, 1.0 - (r.distance * r.distance) / 2.0)),
          data: r
        });
      });

      // Merge using Reciprocal Rank Fusion (RRF)
      const allIds = new Set([...ftsRanks.keys(), ...semanticRanks.keys()]);
      
      let queryType = "general";
      if (query && query.match(/^[A-Z0-9_-]+$/)) queryType = "code-heavy";
      else if (query && (query.includes('"') || query.includes("'"))) queryType = "exact-heavy";

      const ftsWeight = queryType === "code-heavy" || queryType === "exact-heavy" ? 1.5 : 1.0;
      const semanticWeight = queryType === "exact-heavy" ? 0.5 : 1.0;

      allIds.forEach(id => {
        const ftsItem = ftsRanks.get(id);
        const semItem = semanticRanks.get(id);

        const r_fts = ftsItem ? ftsItem.rank : Infinity;
        const r_vec = semItem ? semItem.rank : Infinity;

        const ftsScore = r_fts === Infinity ? 0 : (1 / (RRF_CONSTANT + r_fts)) * ftsWeight;
        const vecScore = r_vec === Infinity ? 0 : (1 / (RRF_CONSTANT + r_vec)) * semanticWeight;

        const rrfScore = ftsScore + vecScore;
        const rawData = ftsItem ? ftsItem.data : (semItem ? semItem.data : null);
        if (!rawData) return;

        scored.set(id, {
          id,
          document_id: rawData.document_id,
          text: rawData.text,
          chunk_index: rawData.chunk_index,
          metadata: typeof rawData.metadata === 'string' ? JSON.parse(rawData.metadata || '{}') : rawData.metadata || {},
          title: rawData.title,
          url: rawData.url,
          source_type: rawData.source_type,
          ftsScore,
          semanticScore: semItem ? semItem.similarity : 0,
          score: rrfScore
        });
      });

      // Neural Cross-Encoder Reranking
      const rerankCount = Math.max(10, limit * 2);
      const topCandidates = Array.from(scored.values())
        .sort((a, b) => b.score - a.score)
        .slice(0, rerankCount);

      const reranked = await rerankerService.rerank(query, topCandidates, limit);
      
      const finalResults = reranked
        .map(item => {
          item.score = item.rerankScore || item.score;
          return item;
        })
        .filter(r => r.score >= 0.015);

      // Save to cache
      searchCache.set(query, cacheOptions, finalResults);
      return finalResults;
    })();

    // Register query in progress
    this.inProgressSearches.set(coalescingKey, searchPromise);

    try {
      const results = await searchPromise;
      const duration = performance.now() - startTime;
      performanceMonitor.recordSearch(query, duration, results.length, 'live');
      return results;
    } finally {
      // Remove promise from progress map once executed
      this.inProgressSearches.delete(coalescingKey);
    }
  }

  insertExtractionRun(sourceUrl, startedAt, completedAt, status, errorMessage) {
    const stmt = this.db.prepare(`
      INSERT INTO extraction_runs (source_url, started_at, completed_at, status, error_message)
      VALUES (?, ?, ?, ?, ?)
    `);
    const info = stmt.run(sourceUrl, startedAt, completedAt, status, errorMessage);
    return info.lastInsertRowid;
  }

  insertEmbedding(chunkId, model, dimensions) {
    const stmt = this.db.prepare(`
      INSERT INTO embeddings (chunk_id, model, dimensions)
      VALUES (?, ?, ?)
    `);
    const info = stmt.run(chunkId, model, dimensions);
    return info.lastInsertRowid;
  }

  insertTelemetry(operation, latencyMs, ramUsageMb) {
    const stmt = this.db.prepare(`
      INSERT INTO telemetry (operation, latency_ms, ram_usage_mb)
      VALUES (?, ?, ?)
    `);
    const info = stmt.run(operation, latencyMs, ramUsageMb);
    return info.lastInsertRowid;
  }

  getDbHealthStatus() {
    const docsCount = this.db.prepare("SELECT count(*) as count FROM documents").get().count;
    const chunksCount = this.db.prepare("SELECT count(*) as count FROM chunks").get().count;
    const corruptedChunks = this.db.prepare("SELECT count(*) as count FROM chunks WHERE text = '' OR text IS NULL").get().count;
    const missingVectors = this.db.prepare("SELECT count(*) as count FROM chunks WHERE length(embedding) = 0").get().count;

    const duplicateDocs = this.db.prepare(`
      SELECT count(*) as count FROM (
        SELECT url, count(*) as c FROM documents GROUP BY url HAVING c > 1
      )
    `).get().count;

    return {
      docsCount,
      chunksCount,
      corruptedChunks,
      missingVectors,
      duplicateDocs
    };
  }
}

export const dbService = new DBService();
export { searchCache, performanceMonitor };
