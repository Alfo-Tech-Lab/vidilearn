import EventEmitter from 'events';
import { dbService, searchCache, performanceMonitor } from './db.js';
import { embeddingService } from './embedding.js';

/**
 * DataSyncService: Handles document synchronization, cache invalidations, 
 * batch ingestion tracking, and index integrity checks.
 */
class DataSyncService extends EventEmitter {
  constructor() {
    super();
    this.syncInProgress = false;
    this.batchSize = 50;
  }

  // ============================================================================
  // CACHE INVALIDATION
  // ============================================================================

  invalidateCache() {
    searchCache.clear();
    this.emit('cache:invalidated');
  }

  // ============================================================================
  // SINGLE DOCUMENT SYNC
  // ============================================================================

  /**
   * Delete a document and automatically invalidate search cache.
   * SQLite triggers automatically clean up associated chunks, FTS5 virtual rows, and vec0 records.
   */
  deleteDocument(url) {
    try {
      const deletedCount = dbService.deleteDocumentByUrl(url);
      if (deletedCount > 0) {
        this.invalidateCache();
        this.emit('document:deleted', { url, deletedCount });
      }
      return deletedCount;
    } catch (err) {
      this.emit('error:delete', { url, error: err.message });
      throw err;
    }
  }

  // ============================================================================
  // INDEX HEALTH & MAINTENANCE
  // ============================================================================

  /**
   * Rebuild vec0 and FTS5 indexes from main chunks table
   */
  async rebuildIndexes() {
    if (this.syncInProgress) {
      throw new Error('Sync operations already in progress');
    }

    this.syncInProgress = true;
    const startTime = performance.now();
    console.log('⚠️  Starting complete rebuild of FTS5 and sqlite-vec indices...');

    try {
      // Clean indices
      dbService.db.exec('DELETE FROM chunks_fts');
      dbService.db.exec('DELETE FROM vec_chunks');

      // Fetch all chunks
      const chunks = dbService.db.prepare('SELECT id, text, embedding FROM chunks').all();

      // Batch insert into virtual tables
      const insertFts = dbService.db.prepare('INSERT INTO chunks_fts(rowid, text) VALUES(?, ?)');
      const insertVec = dbService.db.prepare('INSERT INTO vec_chunks(rowid, embedding) VALUES(?, ?)');

      const rebuildTx = dbService.db.transaction((rows) => {
        for (const row of rows) {
          insertFts.run(row.id, row.text);
          insertVec.run(BigInt(row.id), row.embedding);
        }
      });

      rebuildTx(chunks);

      // Run database vacuum & analyze for optimal index structure
      dbService.db.exec('ANALYZE');

      // Clear cache
      this.invalidateCache();

      const duration = performance.now() - startTime;
      this.emit('index:rebuilt', { chunksCount: chunks.length, durationMs: duration });
      console.log(`✅ Index rebuild completed in ${duration.toFixed(1)}ms`);

      return { chunksCount: chunks.length, durationMs: duration };
    } catch (err) {
      this.emit('index:error', { error: err.message });
      throw err;
    } finally {
      this.syncInProgress = false;
    }
  }

  /**
   * Verify index integrity across relational tables, FTS5 virtual indices, and vec_chunks ANN tables.
   */
  verifyIntegrity() {
    const checks = {
      database: 'FAIL',
      ftsConsistency: 'FAIL',
      vecConsistency: 'FAIL',
      orphans: 'FAIL'
    };

    try {
      // 1. Database structural check
      const integrity = dbService.db.prepare('PRAGMA integrity_check').pluck().get();
      checks.database = integrity === 'ok' ? 'ok' : integrity;

      // 2. Counts consistency
      const chunksCount = dbService.db.prepare('SELECT COUNT(*) as count FROM chunks').get().count;
      const ftsCount = dbService.db.prepare('SELECT COUNT(*) as count FROM chunks_fts').get().count;
      const vecCount = dbService.db.prepare('SELECT COUNT(*) as count FROM vec_chunks').get().count;

      checks.ftsConsistency = chunksCount === ftsCount ? 'ok' : `Mismatch (chunks: ${chunksCount}, FTS: ${ftsCount})`;
      checks.vecConsistency = chunksCount === vecCount ? 'ok' : `Mismatch (chunks: ${chunksCount}, vec: ${vecCount})`;

      // 3. Orphans check (FTS or Vector rows referencing non-existent chunks)
      const ftsOrphans = dbService.db.prepare(`
        SELECT COUNT(*) as count FROM chunks_fts WHERE rowid NOT IN (SELECT id FROM chunks)
      `).get().count;

      const vecOrphans = dbService.db.prepare(`
        SELECT COUNT(*) as count FROM vec_chunks WHERE rowid NOT IN (SELECT id FROM chunks)
      `).get().count;

      checks.orphans = (ftsOrphans === 0 && vecOrphans === 0) 
        ? 'ok' 
        : `Found orphans (FTS: ${ftsOrphans}, vec: ${vecOrphans})`;

      this.emit('integrity:checked', checks);
      return checks;
    } catch (err) {
      checks.error = err.message;
      this.emit('integrity:error', err);
      return checks;
    }
  }

  /**
   * Fetch live engine metrics and sync stats
   */
  getStats() {
    const docsCount = dbService.db.prepare('SELECT COUNT(*) as count FROM documents').get().count;
    const chunksCount = dbService.db.prepare('SELECT COUNT(*) as count FROM chunks').get().count;
    
    // DB physical size on disk
    const pageSize = dbService.db.prepare('PRAGMA page_size').pluck().get();
    const pageCount = dbService.db.prepare('PRAGMA page_count').pluck().get();
    const dbSize = pageSize * pageCount;

    return {
      documentsCount: docsCount,
      chunksCount: chunksCount,
      databaseSizeBytes: dbSize,
      databaseSizeMB: (dbSize / (1024 * 1024)).toFixed(2),
      syncInProgress: this.syncInProgress,
      integrity: this.verifyIntegrity(),
      cache: searchCache.getStats()
    };
  }
}

export const dataSyncService = new DataSyncService();
export { DataSyncService };
