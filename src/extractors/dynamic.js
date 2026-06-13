import { chromium } from 'playwright';
import { Readability } from '@mozilla/readability';
import { JSDOM } from 'jsdom';

/**
 * Dynamic Extractor (Playwright)
 */
export const dynamicExtractor = {
  async extract(url) {
    let browser;
    try {
      browser = await chromium.launch({ headless: true });
      const page = await browser.newPage();
      await page.goto(url, { waitUntil: 'networkidle', timeout: 30000 });
      
      const content = await page.content();
      const dom = new JSDOM(content, { url });
      const reader = new Readability(dom.window.document);
      const article = reader.parse();

      await browser.close();

      return {
        sourceType: 'article-dynamic',
        url,
        title: article?.title || 'Unknown',
        description: article?.excerpt,
        articleContent: article?.textContent || 'No content found.',
        author: article?.byline,
        metadata: {
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