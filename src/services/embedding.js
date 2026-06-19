import { pipeline } from '@xenova/transformers';

/**
 * Embedding Service
 */
export const embeddingService = {
  extractor: null,

  async init() {
    if (!this.extractor) {
      this.extractor = await pipeline('feature-extraction', 'Xenova/all-MiniLM-L6-v2');
    }
  },

  async embed(text) {
    await this.init();
    const chunks = this.chunkText(text);
    const embeddings = [];

    for (const chunk of chunks) {
      const output = await this.extractor(chunk, { pooling: 'mean', normalize: true });
      embeddings.push({
        text: chunk,
        embedding: Array.from(output.data)
      });
    }

    return embeddings;
  },

  chunkText(text, maxChars = 500) {
    const sentences = text.match(/[^.!?]+[.!?]+/g) || [text];
    const chunks = [];
    let currentChunk = "";

    for (const sentence of sentences) {
      if ((currentChunk + sentence).length > maxChars && currentChunk.length > 0) {
        chunks.push(currentChunk.trim());
        currentChunk = "";
      }
      currentChunk += sentence;
    }

    if (currentChunk.trim().length > 0) {
      chunks.push(currentChunk.trim());
    }

    return chunks;
  }
};
