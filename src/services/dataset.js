import fs from 'fs';
import path from 'path';
import ytDlp from 'yt-dlp-exec';
import { youtubeExtractor } from '../extractors/youtube.js';
import { embeddingService } from './embedding.js';

export const datasetService = {
  async exportDataset(channelUrl, options = {}) {
    console.log(`Starting Dataset Export for channel: ${channelUrl}`);
    
    let playlistData;
    try {
      playlistData = await ytDlp(channelUrl, {
        dumpSingleJson: true,
        flatPlaylist: true,
        noCheckCertificates: true,
        noWarnings: true,
        playlistEnd: options.limit || 5
      });
    } catch (err) {
      throw new Error(`Failed to read channel uploads for dataset export: ${err.message}`);
    }

    if (!playlistData.entries || playlistData.entries.length === 0) {
      throw new Error("No uploads found for this channel.");
    }

    const dataset = [];
    const entries = playlistData.entries.slice(0, options.limit || 5);

    for (let i = 0; i < entries.length; i++) {
      const entry = entries[i];
      const videoUrl = `https://www.youtube.com/watch?v=${entry.id}`;
      console.log(`[${i+1}/${entries.length}] Extracting data for: "${entry.title}"`);
      
      try {
        const data = await youtubeExtractor.extract(videoUrl);
        const text = data.transcript || data.description || '';
        const chunks = embeddingService.chunkText(text);
        
        // Simple topic extraction rule-based
        const words = text.match(/\b\w{4,}\b/g) || [];
        const counts = {};
        words.forEach(w => {
          const lower = w.toLowerCase();
          if (['this', 'that', 'with', 'from', 'they', 'have', 'were', 'about'].includes(lower)) return;
          counts[lower] = (counts[lower] || 0) + 1;
        });
        const topics = Object.entries(counts)
          .sort((a, b) => b[1] - a[1])
          .slice(0, 5)
          .map(t => t[0]);

        dataset.push({
          title: data.title,
          url: videoUrl,
          channel: data.author,
          publishedDate: data.publishedDate,
          transcript: text,
          chunks: chunks,
          topics: topics
        });
      } catch (err) {
        console.warn(`Failed to process video ${entry.title}: ${err.message}`);
      }
    }

    const outputFile = options.output || path.join(process.cwd(), `dataset_${Date.now()}_channel.json`);
    fs.writeFileSync(outputFile, JSON.stringify(dataset, null, 2));
    return { outputFile, count: dataset.length };
  }
};
