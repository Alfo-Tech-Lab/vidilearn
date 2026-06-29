import ytDlp from 'yt-dlp-exec';
import { youtubeExtractor } from '../extractors/youtube.js';
import { dbService } from './db.js';
import { ingestionService } from './ingestion.js';
import axios from 'axios';

export const watcherService = {
  async watchChannel(channelUrl, options = {}) {
    console.log(`Checking YouTube channel uploads: ${channelUrl}`);
    
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
      throw new Error(`Failed to check channel upload list: ${err.message}`);
    }

    if (!playlistData.entries || playlistData.entries.length === 0) {
      console.log("No videos found on the specified channel.");
      return [];
    }

    // Get all ingested YouTube URLs to check for duplicates
    const stmt = dbService.db.prepare("SELECT url FROM documents WHERE source_type = 'youtube'");
    const existingUrls = new Set(stmt.all().map(doc => doc.url));

    const newVideos = playlistData.entries
      .map(e => ({
        id: e.id,
        title: e.title,
        url: `https://www.youtube.com/watch?v=${e.id}`
      }))
      .filter(v => !existingUrls.has(v.url));

    console.log(`Found ${newVideos.length} new videos to ingest out of the last ${playlistData.entries.length} uploads.`);

    const ingested = [];

    for (const video of newVideos) {
      console.log(`Ingesting new upload: "${video.title}"...`);
      try {
        const data = await youtubeExtractor.extract(video.url);
        
        const docId = dbService.insertDocument(data.title, video.url, 'youtube', {
          author: data.author,
          publishedDate: data.publishedDate,
          extractedAt: new Date().toISOString()
        });

        const chunks = await ingestionService.saveChunksToDb(docId, data.transcript || data.description || '', options.provider || 'transformers');
        
        const result = {
          id: docId,
          title: data.title,
          url: video.url,
          author: data.author,
          chunksCount: chunks.length
        };

        ingested.push(result);

        // If webhook configured, notify
        if (options.webhook) {
          try {
            await axios.post(options.webhook, {
              event: 'video_ingested',
              video: result
            });
            console.log(`Webhook triggered successfully for: ${video.title}`);
          } catch (webhookErr) {
            console.warn(`Webhook request failed: ${webhookErr.message}`);
          }
        }
      } catch (err) {
        console.error(`Failed to ingest video "${video.title}": ${err.message}`);
      }
    }

    return ingested;
  }
};
