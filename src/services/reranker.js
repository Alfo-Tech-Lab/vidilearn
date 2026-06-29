import { pipeline } from '@xenova/transformers';
import chalk from 'chalk';

class RerankerService {
  constructor() {
    this.model = null;
    this._initPromise = null;
    
    // Circuit Breaker State
    this.breaker = {
      state: 'CLOSED',       // CLOSED, OPEN, HALF-OPEN
      failureCount: 0,
      threshold: 3,          // consecutive failures to trip
      lastStateChange: Date.now(),
      cooldownMs: 30000,     // 30 seconds cooldown when OPEN
      slowThresholdMs: 1200  // executions > 1.2s count as failures
    };

    this._warmUp();
  }

  _warmUp() {
    this._initPromise = this._loadModel().catch(() => null);
  }

  async _loadModel() {
    if (this.model) return this.model;
    try {
      this.model = await pipeline('text-classification', 'Xenova/ms-marco-MiniLM-L-6-v2');
      await this.model('warmup query', { text_pair: 'warmup doc' }).catch(() => null);
      return this.model;
    } catch (err) {
      return null;
    }
  }

  async init() {
    if (this.model) return;
    if (this._initPromise) {
      await this._initPromise;
    } else {
      await this._loadModel();
    }
  }

  _checkCircuitBreaker() {
    const now = Date.now();
    
    if (this.breaker.state === 'OPEN') {
      // Check if cooldown window has expired
      if (now - this.breaker.lastStateChange > this.breaker.cooldownMs) {
        this.breaker.state = 'HALF-OPEN';
        this.breaker.lastStateChange = now;
        console.warn(chalk.bold.yellow("🔧 Reranker Circuit Breaker: entering HALF-OPEN state (testing recovery)..."));
      } else {
        return false; // Circuit is OPEN — bypass reranker
      }
    }
    return true;
  }

  _recordSuccess() {
    this.breaker.failureCount = 0;
    if (this.breaker.state === 'HALF-OPEN') {
      this.breaker.state = 'CLOSED';
      this.breaker.lastStateChange = Date.now();
      console.log(chalk.bold.green("✅ Reranker Circuit Breaker: CLOSED (system recovered successfully)."));
    }
  }

  _recordFailure(reason) {
    this.breaker.failureCount++;
    console.warn(chalk.yellow(`⚠ Reranker execution failure #${this.breaker.failureCount}: ${reason}`));
    
    if (this.breaker.state !== 'OPEN' && this.breaker.failureCount >= this.breaker.threshold) {
      this.breaker.state = 'OPEN';
      this.breaker.lastStateChange = Date.now();
      console.error(chalk.bold.red(`🚨 Reranker Circuit Breaker: TRIPPED (OPEN). Bypassing reranking model for ${this.breaker.cooldownMs / 1000}s.`));
    }
  }

  async rerank(query, candidates, topK = 5) {
    if (candidates.length === 0) return [];

    const isHealthy = this._checkCircuitBreaker();
    const fallbackResults = () => candidates
      .sort((a, b) => b.score - a.score)
      .slice(0, topK)
      .map(item => ({ ...item, rerankScore: item.score }));

    if (!isHealthy) {
      return fallbackResults();
    }

    await this.init();

    if (!this.model) {
      return fallbackResults();
    }

    const startTime = performance.now();
    try {
      const textsToPair = candidates.map(c => (c.text || '').slice(0, 512));
      const queries = Array(candidates.length).fill(query);

      // Run inference
      const outputs = await this.model(queries, { text_pair: textsToPair });
      const duration = performance.now() - startTime;

      if (duration > this.breaker.slowThresholdMs) {
        this._recordFailure(`Slow response (${duration.toFixed(0)}ms)`);
      } else {
        this._recordSuccess();
      }

      const scored = candidates.map((item, idx) => {
        const out = outputs[idx];
        const score = out ? out.score : 0;
        return {
          ...item,
          rerankScore: score
        };
      });

      return scored
        .sort((a, b) => b.rerankScore - a.rerankScore)
        .slice(0, topK);

    } catch (err) {
      this._recordFailure(err.message);
      return fallbackResults();
    }
  }
}

export const rerankerService = new RerankerService();
