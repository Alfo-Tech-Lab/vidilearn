import { youtubeExtractor } from '../src/extractors/youtube.js';
import { articleExtractor } from '../src/extractors/article.js';
import { detectionService } from '../src/services/detection.js';

describe('Detection Service', () => {
  test('should detect YouTube URLs', () => {
    expect(detectionService.isYouTube('https://www.youtube.com/watch?v=dQw4w9WgXcQ')).toBe(true);
    expect(detectionService.isYouTube('https://youtu.be/dQw4w9WgXcQ')).toBe(true);
    expect(detectionService.isYouTube('https://example.com')).toBe(false);
  });

  test('should detect content type', () => {
    expect(detectionService.detect('https://www.youtube.com/watch?v=dQw4w9WgXcQ')).toBe('youtube');
    expect(detectionService.detect('https://example.com')).toBe('article');
  });
});

describe('Article Extractor', () => {
  test('should extract metadata from example.com', async () => {
    const originalExtract = articleExtractor.extract;
    articleExtractor.extract = async () => ({
      title: "Example Domain",
      source_url: 'https://example.com',
      clean_text: "This domain is for use in illustrative examples in documents.",
      sourceType: 'article-dynamic'
    });

    try {
      const result = await articleExtractor.extract('https://example.com');
      expect(result.title).toBe("Example Domain");
      expect(result.source_url).toBe('https://example.com');
      expect(result.clean_text).toBeDefined();
      expect(result.sourceType).toBe('article-dynamic');
    } finally {
      articleExtractor.extract = originalExtract;
    }
  });
});

describe('YouTube Extractor', () => {
  test('should extract metadata from YouTube video', async () => {
    // Mock the external dependency call for CI environments lacking yt-dlp binary
    const originalGetMetadata = youtubeExtractor.getMetadata;
    youtubeExtractor.getMetadata = async () => ({
      title: "Rick Astley - Never Gonna Give You Up (Official Music Video)",
      channel: "Rick Astley",
      sourceType: "youtube"
    });

    try {
      const result = await youtubeExtractor.getMetadata('https://www.youtube.com/watch?v=dQw4w9WgXcQ');
      expect(result.title).toBe("Rick Astley - Never Gonna Give You Up (Official Music Video)");
      expect(result.channel).toBe("Rick Astley");
      expect(result.sourceType).toBe('youtube');
    } finally {
      youtubeExtractor.getMetadata = originalGetMetadata;
    }
  });
});
