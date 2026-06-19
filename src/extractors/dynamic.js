import { JSDOM } from 'jsdom';
import { Readability } from '@mozilla/readability';

/**
 * Dynamic Extractor (Playwright)
 */
export const dynamicExtractor = {
  async extract(url) {
    let browser;
    try {
      // Lazy load playwright
      const { chromium } = await import('playwright');

      browser = await chromium.launch({ headless: true });
      const page = await browser.newPage();
      await page.goto(url, { waitUntil: 'networkidle', timeout: 30000 });
      
      const content = await page.content();
      const dom = new JSDOM(content, { url });
      const reader = new Readability(dom.window.document);
      const article = reader.parse();

      await browser.close();

      const clean_text = article?.textContent || 'No content found.';

      return {
        sourceType: 'article-dynamic',
        source_url: url,
        title: article?.title || 'Unknown',
        byline: article?.byline,
        published_date: null, // Harder to extract from rendered DOM without specific selectors
        clean_text,
        word_count: clean_text.split(/\s+/).length,
        metadata: {
          excerpt: article?.excerpt,
          siteName: article?.siteName,
          renderedBy: 'playwright'
        },
        extractedAt: new Date().toISOString()
      };
    } catch (error) {
      if (browser) await browser.close();
      throw new Error(`Dynamic Extraction Failed: ${error.message}`);
    }
  }
};