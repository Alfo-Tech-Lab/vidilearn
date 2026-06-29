import { pipeline } from '@huggingface/transformers';
import axios from 'axios';
import { configService } from './config.js';

/**
 * Embedding Service
 * Supports local transformers.js (all-MiniLM-L6-v2) and Ollama embeddings.
 */
export const embeddingService = {
  extractor: null,
  ollamaUrl: configService.get('ollama.host') || 'http://127.0.0.1:11434',
  ollamaModel: configService.get('ollama.model') || 'nomic-embed-text',

  async init() {
    if (!this.extractor) {
      try {
        const modelName = configService.get('embedding.model') || 'Xenova/all-MiniLM-L6-v2';
        this.extractor = await pipeline('feature-extraction', modelName, { dtype: 'fp32' });
      } catch (err) {
        console.warn("Transformers.js pipeline initialization warning:", err.message);
      }
    }
  },

  async embed(text, provider = null) {
    const activeProvider = provider || configService.get('embedding.provider') || 'transformers';
    const startTime = Date.now();
    
    if (activeProvider === 'ollama') {
      try {
        const response = await axios.post(`${this.ollamaUrl}/api/embeddings`, {
          model: this.ollamaModel,
          prompt: text
        });
        if (response.data && response.data.embedding) {
          const duration = Date.now() - startTime;
          const tokens = Math.ceil(text.length / 4);
          
          console.log(JSON.stringify({
            event: "chunk_embedded",
            duration_ms: duration,
            tokens: tokens,
            model: this.ollamaModel
          }, null, 2));

          try {
            const { dbService } = await import('./db.js');
            dbService.insertTelemetry("embedding", duration, Math.round(process.memoryUsage().heapUsed / 1024 / 1024));
          } catch (dbErr) {}

          return [{
            text,
            embedding: response.data.embedding
          }];
        }
      } catch (err) {
        console.warn(`Ollama embedding failed for model ${this.ollamaModel}, falling back to local. Error: ${err.message}`);
      }
    }

    // Default to local transformers.js
    await this.init();
    const chunks = this.chunkText(text);
    const embeddings = [];

    for (const chunk of chunks) {
      const chunkStart = Date.now();
      const output = await this.extractor(chunk, { pooling: 'mean', normalize: true });
      const duration = Date.now() - chunkStart;
      const tokens = Math.ceil(chunk.length / 4);

      console.log(JSON.stringify({
        event: "chunk_embedded",
        duration_ms: duration,
        tokens: tokens,
        model: "all-MiniLM-L6-v2"
      }, null, 2));

      try {
        const { dbService } = await import('./db.js');
        dbService.insertTelemetry("embedding", duration, Math.round(process.memoryUsage().heapUsed / 1024 / 1024));
      } catch (dbErr) {}

      embeddings.push({
        text: chunk,
        embedding: Array.from(output.data)
      });
    }

    return embeddings;
  },

  chunkText(text, maxChars = null, mode = 'sentence') {
    if (!text) return [];
    
    const sizeLimit = maxChars || configService.get('chunking.size') || 500;
    const overlapLimit = configService.get('chunking.overlap') || 100;
    const activeMode = mode || configService.get('chunking.mode') || 'sentence';

    switch (activeMode.toLowerCase()) {
      case 'fixed': {
        const chunks = [];
        for (let i = 0; i < text.length; i += (sizeLimit - overlapLimit)) {
          chunks.push(text.slice(i, i + sizeLimit).trim());
        }
        return chunks.filter(Boolean);
      }
      case 'paragraph': {
        return text.split(/\n\s*\n/).map(p => p.trim()).filter(Boolean);
      }
      case 'sentence':
      case 'semantic': {
        const normalized = text.replace(/\s+/g, ' ');
        const sentences = normalized.match(/[^.!?]+[.!?]+/g) || [normalized];
        const chunks = [];
        let currentChunk = "";

        for (const sentence of sentences) {
          if ((currentChunk + sentence).length > sizeLimit && currentChunk.length > 0) {
            chunks.push(currentChunk.trim());
            currentChunk = currentChunk.slice(-overlapLimit);
          }
          currentChunk += sentence;
        }

        if (currentChunk.trim().length > 0) {
          chunks.push(currentChunk.trim());
        }
        return chunks;
      }
      case 'transcript-aware': {
        // Splitting by brackets containing timestamps e.g. [12:30]
        return text.split(/\[\d{1,2}:\d{2}\]/).map(t => t.trim()).filter(Boolean);
      }
      default:
        return [text];
    }
  }
};
