import { YoutubeTranscript } from 'youtube-transcript';
import ytDlp from 'yt-dlp-exec';

/**
 * YouTube Extractor
 */
export const youtubeExtractor = {
  async extract(url, options = {}) {
    try {
      const metadata = await this.getMetadata(url);
      
      let transcript = null;
      if (options.includeTranscript !== false) {
        transcript = await this.getTranscript(url, options);
      }

      return {
        ...metadata,
        transcript,
        isLive: metadata.isLive,
        extractedAt: new Date().toISOString()
      };
    } catch (error) {
      throw new Error(`YouTube Extraction Failed: ${error.message}`);
    }
  },

  async getMetadata(url) {
    const data = await ytDlp(url, {
      dumpSingleJson: true,
      noCheckCertificates: true,
      noWarnings: true,
      addHeader: ['referer:youtube.com', 'user-agent:googlebot']
    });

    return {
      sourceType: 'youtube',
      url: data.original_url || url,
      title: data.title,
      description: data.description,
      channel: data.uploader,
      author: data.uploader,
      publishedDate: data.upload_date,
      tags: data.tags || [],
      thumbnails: data.thumbnails || [],
      subtitles: data.subtitles || {},
      isLive: data.is_live || data.was_live || false,
      metadata: {
        viewCount: data.view_count,
        duration: data.duration,
        likeCount: data.like_count,
        isLive: data.is_live,
        isUpcoming: data.is_upcoming
      }
    };
  },

  async getTranscript(url, options = {}) {
    try {
      const segments = await YoutubeTranscript.fetchTranscript(url, {
        lang: options.lang || 'en'
      });

      if (options.stream) {
        for (const segment of segments) {
          process.stdout.write(segment.text + ' ');
        }
        process.stdout.write('\n');
      }

      return segments.map(s => s.text).join(' ');
    } catch (err) {
      return "Transcript unavailable through direct scraping.";
    }
  },

  async getSubtitles(url) {
    // Returns subtitle info from metadata
    const metadata = await this.getMetadata(url);
    return metadata.subtitles;
  },

  async extractPlaylist(url) {
    try {
      const data = await ytDlp(url, {
        dumpSingleJson: true,
        flatPlaylist: true,
        noCheckCertificates: true,
        noWarnings: true
      });

      if (!data.entries) {
        throw new Error("No entries found in playlist");
      }

      return {
        sourceType: 'youtube-playlist',
        url,
        title: data.title,
        video_urls: data.entries.map(entry => entry.url || `https://www.youtube.com/watch?v=${entry.id}`),
        metadata: {
          video_count: data.entries.length
        }
      };
    } catch (error) {
      throw new Error(`Playlist Extraction Failed: ${error.message}`);
    }
  }
};