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
        transcript = await this.getTranscript(url);
      }

      return {
        ...metadata,
        transcript,
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
      metadata: {
        viewCount: data.view_count,
        duration: data.duration,
        likeCount: data.like_count
      }
    };
  },

  async getTranscript(url) {
    try {
      const segments = await YoutubeTranscript.fetchTranscript(url);
      return segments.map(s => s.text).join(' ');
    } catch (err) {
      return "Transcript unavailable through direct scraping.";
    }
  },

  async getSubtitles(url) {
    // Returns subtitle info from metadata
    const metadata = await this.getMetadata(url);
    return metadata.subtitles;
  }
};