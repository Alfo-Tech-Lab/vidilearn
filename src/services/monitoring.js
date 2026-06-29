import chalk from 'chalk';

class PerformanceMonitor {
  constructor() {
    this.metrics = {
      searches: [],
      reranks: [],
      stores: [],
    };
  }

  recordSearch(query, duration, resultCount, source) {
    this.metrics.searches.push({
      query: (query || '').slice(0, 50),
      duration,
      resultCount,
      source,
      timestamp: Date.now(),
    });
    
    // Keep a rolling buffer of the last 1000 search entries
    if (this.metrics.searches.length > 1000) {
      this.metrics.searches.shift();
    }

    // Alert on slow queries (threshold > 1000ms for production alerts)
    if (duration > 1000) {
      console.warn(chalk.bold.yellow(`⚠️  SLOW QUERY DETECTED: "${query}" took ${duration.toFixed(1)}ms`));
    }
  }

  recordStore(title, duration, chunkCount) {
    this.metrics.stores.push({
      title: title.slice(0, 50),
      duration,
      chunkCount,
      timestamp: Date.now()
    });

    if (this.metrics.stores.length > 1000) {
      this.metrics.stores.shift();
    }
  }

  stats() {
    const searches = this.metrics.searches;
    if (searches.length === 0) return null;

    const durations = searches.map(s => s.duration);
    const avg = durations.reduce((a, b) => a + b, 0) / durations.length;
    const sorted = [...durations].sort((a, b) => a - b);
    const p95 = sorted[Math.floor(sorted.length * 0.95)];
    const p99 = sorted[Math.floor(sorted.length * 0.99)];

    return {
      totalSearches: searches.length,
      avgLatency: avg.toFixed(1) + 'ms',
      p95Latency: (p95 || avg).toFixed(1) + 'ms',
      p99Latency: (p99 || avg).toFixed(1) + 'ms',
      slowQueries: searches.filter(s => s.duration > 1000).length,
    };
  }
}

export const performanceMonitor = new PerformanceMonitor();
