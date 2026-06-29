class LRUCache {
  constructor(options = {}) {
    this.maxEntries = options.maxEntries || 500;
    this.stdTTL = (options.stdTTL || 3600) * 1000; // default 1 hour in ms
    this.cache = new Map(); // Stores { value, expiresAt, lastAccessed }
    
    this.stats = {
      hits: 0,
      misses: 0,
      evictions: 0
    };
  }

  get(key) {
    const entry = this.cache.get(key);
    if (!entry) {
      this.stats.misses++;
      return null;
    }

    // Check expiration
    if (Date.now() > entry.expiresAt) {
      this.cache.delete(key);
      this.stats.evictions++;
      this.stats.misses++;
      return null;
    }

    // Update LRU access order by re-inserting key
    this.cache.delete(key);
    entry.lastAccessed = Date.now();
    this.cache.set(key, entry);

    this.stats.hits++;
    return entry.value;
  }

  set(key, value, ttlMs = this.stdTTL) {
    // Evict least recently used (first key in Map iterator) if full
    if (this.cache.size >= this.maxEntries && !this.cache.has(key)) {
      const firstKey = this.cache.keys().next().value;
      if (firstKey !== undefined) {
        this.cache.delete(firstKey);
        this.stats.evictions++;
      }
    }

    this.cache.set(key, {
      value,
      expiresAt: Date.now() + ttlMs,
      lastAccessed: Date.now()
    });
  }

  clear() {
    this.cache.clear();
  }

  getStats() {
    const total = this.stats.hits + this.stats.misses;
    return {
      hits: this.stats.hits,
      misses: this.stats.misses,
      evictions: this.stats.evictions,
      hitRate: total > 0 ? (this.stats.hits / total * 100).toFixed(1) + '%' : 'N/A',
      size: this.cache.size,
      maxEntries: this.maxEntries
    };
  }
}

class SearchCache {
  constructor() {
    // Limits cache to 500 search result entries to prevent memory leaks
    this.lru = new LRUCache({
      maxEntries: 500,
      stdTTL: 3600 // 1 hour
    });
  }

  getCacheKey(query, options = {}) {
    return `search:${query}:${JSON.stringify(options)}`;
  }

  get(query, options = {}) {
    const key = this.getCacheKey(query, options);
    return this.lru.get(key);
  }

  set(query, options = {}, results) {
    const key = this.getCacheKey(query, options);
    this.lru.set(key, {
      results,
      cached_at: Date.now()
    });
  }

  clear() {
    this.lru.clear();
  }

  getStats() {
    return this.lru.getStats();
  }
}

export const searchCache = new SearchCache();
export { LRUCache };
