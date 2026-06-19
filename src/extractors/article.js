import axios from 'axios';
import * as cheerio from 'cheerio';
import { Readability } from '@mozilla/readability';
import { JSDOM } from 'jsdom';
import { dynamicExtractor } from './dynamic.js';

/**
 * Article Extractor
 */
export const articleExtractor = {
  async extract(url) {
    try {
      const response = await axios.get(url, {
        headers: {
          'User-Agent': 'Mozilla/5.0 (compatible; Googlebot/2.1; +http://www.google.com/bot.html)'
        },
        timeout: 10000
      });

      const dom = new JSDOM(response.data, { url });
      const reader = new Readability(dom.window.document);
      const article = reader.parse();

      if (!article || article.textContent.length < 300) {
        // Fallback to Dynamic if content is thin
        return await dynamicExtractor.extract(url);
      }

      const $ = cheerio.load(response.data);

      return {
        sourceType: 'article',
        source_url: url,
        title: article.title,
        byline: article.byline,
        published_date: this.extractDate($),
        clean_text: article.textContent,
        word_count: article.textContent.split(/\s+/).length,
        metadata: {
          excerpt: article.excerpt,
          siteName: article.siteName,
          lang: article.lang,
          headings: this.extractHeadings($),
          images: this.extractImages($)
        },
        extractedAt: new Date().toISOString()
      };
    } catch (error) {
      // Automatic fallback on 403/Blocked
      return await dynamicExtractor.extract(url);
    }
  },

  extractDate($) {
    return $('meta[property="article:published_time"]').attr('content') || 
           $('meta[name="publish-date"]').attr('content') || null;
  },

  extractHeadings($) {
    const headings = [];
    $('h1, h2, h3').each((i, el) => {
      headings.push({ level: el.tagName.toLowerCase(), text: $(el).text().trim() });
    });
    return headings;
  },

  extractImages($) {
    const images = [];
    $('img').each((i, el) => {
      const src = $(el).attr('src');
      if (src?.startsWith('http')) images.push(src);
    });
    return images.slice(0, 10);
  }
};