/**
 * Detection Service
 * Identifies the type of URL and selects appropriate extractor
 */
export const detectionService = {
  isYouTube(url) {
    return /youtube\.com|youtu\.be/.test(url);
  },
  
  detect(url) {
    if (this.isYouTube(url)) return 'youtube';
    return 'article';
  }
};