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
    const result = await articleExtractor.extract('https://example.com');
    expect(result.title).toBeDefined();
    expect(result.source_url).toBe('https://example.com');
    expect(result.clean_text).toBeDefined();
  });
});

describe('YouTube Extractor', () => {
  test('should extract metadata from YouTube video', async () => {
    // Note: This makes a real network request
    const result = await youtubeExtractor.getMetadata('https://www.youtube.com/watch?v=dQw4w9WgXcQ');
    expect(result.title).toBeDefined();
    expect(result.channel).toBeDefined();
    expect(result.sourceType).toBe('youtube');
  });
});
