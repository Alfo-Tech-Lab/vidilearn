import fs from 'fs';
import path from 'path';
import { execFileSync } from 'child_process';
import Parser from 'rss-parser';
import { createRequire } from 'module';
const require = createRequire(import.meta.url);
const pdfModule = require('pdf-parse');
// pdf-parse v2 API: class-based with load()+getText(), v1 was a direct function
async function parsePDF(buffer) {
  const uint8 = new Uint8Array(buffer.buffer, buffer.byteOffset, buffer.byteLength);
  const parser = new pdfModule.PDFParse({ data: uint8, verbosity: 0 });
  await parser.load(uint8);
  const result = await parser.getText();
  // result.pages is an array of { text: string }
  return { text: result.pages.map(p => p.text).join('\n') };
}
import mammoth from 'mammoth';
import { articleExtractor } from '../extractors/article.js';
import { embeddingService } from './embedding.js';
import { dbService } from './db.js';
import { pluginLoader } from './plugins.js';
import os from 'os';

const parser = new Parser();

export const ingestionService = {
  // Safe helper to pause execution (rate limiting)
  sleep(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
  },

  // Path Sanitization to prevent traversing outside workspace/home
  sanitizePath(targetPath) {
    const resolved = path.resolve(targetPath);
    const workspaceRoot = process.cwd();
    const userHome = os.homedir();
    
    if (!resolved.startsWith(workspaceRoot) && !resolved.startsWith(userHome)) {
      throw new Error("SECURITY_ERROR: Access denied. Path is outside authorized workspace boundaries.");
    }
    return resolved;
  },

  // Main ingest entry point
  async ingest(target, options = {}) {
    // Route to custom plugin driver if supported
    const pluginDriver = pluginLoader.getDriverForTarget(target);
    if (pluginDriver) {
      console.log(`[Plugin Ingest] Routing ingestion of ${target} to plugin: ${pluginDriver.name}`);
      const data = await pluginDriver.extract(target, options);
      const docId = dbService.insertDocument(data.title, target, data.sourceType || 'plugin', data.metadata || {});
      const chunks = await this.saveChunksToDb(docId, data.transcript || data.clean_text || '', options.embedProvider);
      return [{ id: docId, title: data.title, url: target, sourceType: data.sourceType, chunksCount: chunks.length }];
    }

    // AUDIT-01 / CWE-918: Reject non-http/https schemes to prevent SSRF, file://, ftp:// exploits
    const isUrl = target.startsWith('http://') || target.startsWith('https://');
    if (target.startsWith('file://') || target.startsWith('ftp://') || target.startsWith('data:')) {
      throw new Error('SECURITY_ERROR: Unsupported or dangerous URL scheme. Only http:// and https:// are permitted.');
    }
    let results = [];

    if (isUrl) {
      // AUDIT-01: validate it's a proper github URL before git clone
      if (target.includes('github.com')) {
        const githubUrlPattern = /^https:\/\/github\.com\/[\w.-]+\/[\w.-]+(\/?|\.git)$/;
        if (!githubUrlPattern.test(target)) {
          throw new Error('SECURITY_ERROR: Invalid GitHub repository URL format.');
        }
        results = await this.ingestGithubRepo(target, options);
      } else if (
        target.includes('/rss') || target.includes('/feed') ||
        target.endsWith('.xml') || target.endsWith('.rss') ||
        target.includes('feeds.') || target.includes('hnrss.org') ||
        options.rss === true
      ) {
        results = await this.ingestRss(target, options);
      } else {
        // Smart fallback: try RSS parse first, if it has items treat as RSS feed
        let isRss = false;
        try {
          const testFeed = await parser.parseURL(target);
          if (testFeed && testFeed.items && testFeed.items.length > 0) {
            isRss = true;
            results = await this.ingestRss(target, options);
          }
        } catch (_) {}
        if (!isRss) {
          results = [await this.ingestUrl(target, options)];
        }
      }
    } else {
      // Local path with path traversal sanitization
      const cleanPath = this.sanitizePath(target);
      const stats = fs.statSync(cleanPath);
      if (stats.isDirectory()) {
        results = await this.ingestDirectory(cleanPath, options);
      } else {
        results = [await this.ingestFile(cleanPath, options)];
      }
    }

    return results;
  },

  async ingestUrl(url, options = {}) {
    const { detectionService } = await import('./detection.js');
    const { youtubeExtractor } = await import('../extractors/youtube.js');
    const { articleExtractor } = await import('../extractors/article.js');

    const type = detectionService.detect(url);
    const extractor = type === 'youtube' ? youtubeExtractor : articleExtractor;
    const data = await extractor.extract(url, { lang: options.lang || 'en' });

    const title = data.title || 'Untitled Web Page';
    const text = data.articleContent || data.transcript || '';
    
    const docId = dbService.insertDocument(title, url, type, {
      author: data.author,
      publishedDate: data.publishedDate,
      extractedAt: new Date().toISOString()
    });

    const chunks = await this.saveChunksToDb(docId, text, options.embedProvider);
    return { id: docId, title, url, sourceType: type, chunksCount: chunks.length };
  },

  async ingestFile(filePath, options = {}) {
    const cleanPath = this.sanitizePath(filePath);
    const ext = path.extname(cleanPath).toLowerCase();
    const title = path.basename(cleanPath, ext);
    let text = '';
    let sourceType = '';
    const fileStat = fs.statSync(cleanPath);
    // AUDIT-03 / CWE-400: Cap file size to 50MB to prevent memory-exhaustion DoS attacks
    const MAX_FILE_BYTES = 50 * 1024 * 1024;
    if (fileStat.size > MAX_FILE_BYTES) {
      throw new Error(`SECURITY_ERROR: File size ${(fileStat.size / 1024 / 1024).toFixed(1)}MB exceeds 50MB safety limit.`);
    }
    let meta = { path: cleanPath, size: fileStat.size };

    if (ext === '.pdf') {
      sourceType = 'pdf';
      const dataBuffer = fs.readFileSync(cleanPath);
      const pdfData = await parsePDF(dataBuffer);
      text = pdfData.text;
    } else if (ext === '.docx') {
      sourceType = 'docx';
      const result = await mammoth.extractRawText({ path: cleanPath });
      text = result.value;
    } else if (ext === '.epub') {
      sourceType = 'epub';
      text = await this.parseEpubSimple(cleanPath);
    } else if (ext === '.md' || ext === '.txt') {
      sourceType = ext.slice(1);
      text = fs.readFileSync(cleanPath, 'utf8');
    } else if (['.mp3', '.wav', '.m4a', '.ogg'].includes(ext)) {
      sourceType = 'audio';
      text = await this.transcribeAudioLocal(cleanPath);
    } else {
      sourceType = 'text';
      text = fs.readFileSync(cleanPath, 'utf8');
    }

    const docId = dbService.insertDocument(title, cleanPath, sourceType, meta);
    const chunks = await this.saveChunksToDb(docId, text, options.embedProvider);

    return { id: docId, title, path: cleanPath, sourceType, chunksCount: chunks.length };
  },

  async ingestDirectory(dirPath, options = {}) {
    const cleanDir = this.sanitizePath(dirPath);
    const files = this.walkDir(cleanDir);
    const results = [];

    for (const file of files) {
      try {
        const result = await this.ingestFile(file, options);
        results.push(result);
        // Rate limit: 200ms delay to prevent locking I/O channels
        await this.sleep(200);
      } catch (err) {
        console.warn(`Failed to ingest file ${file}:`, err.message);
      }
    }

    return results;
  },

  async ingestRss(rssUrl, options = {}) {
    const feed = await parser.parseURL(rssUrl);
    const results = [];

    console.log(`Ingesting RSS Feed: "${feed.title}" (${feed.items.length} items)...`);

    for (const item of feed.items) {
      if (!item.link && !item.content && !item.contentSnippet && !item.summary) continue;

      // Try to fetch full article text from link first
      let articleText = '';
      let articleChunks = 0;

      if (item.link) {
        try {
          const result = await this.ingestUrl(item.link, options);
          articleChunks = result?.chunks || 0;
          if (articleChunks > 0) {
            results.push(result);
            await this.sleep(1000);
            continue; // Article extracted successfully — done
          }
        } catch (err) {
          // Article fetch failed (paywall/403/timeout) — fall through to RSS content
        }
      }

      // ── Fallback: use content embedded in the RSS feed item itself ────────
      const itemText = [
        item.title || '',
        item.contentSnippet || item.summary || '',
        // Strip HTML tags from content field
        (item.content || item['content:encoded'] || '').replace(/<[^>]+>/g, ' ')
      ].filter(Boolean).join('. ').replace(/\s+/g, ' ').trim();

      if (itemText.length < 30) {
        console.warn(`Skipping feed item (no usable content): ${item.title || item.link}`);
        continue;
      }

      // Ingest the feed item text directly as an article document
      try {
        const title = item.title || `Feed item from ${feed.title}`;
        const sourceUrl = item.link || rssUrl;
        const docId = dbService.insertDocument(title, sourceUrl, 'article', {
          feedUrl: rssUrl,
          feedTitle: feed.title,
          publishedDate: item.pubDate || item.isoDate || null,
          author: item.creator || item.author || null,
          extractedAt: new Date().toISOString(),
          source: 'rss_feed_content'
        });

        const chunks = await this.saveChunksToDb(docId, itemText, options.provider || 'transformers');
        results.push({
          id: docId,
          title,
          url: sourceUrl,
          source_type: 'article',
          chunks: chunks.length
        });
        await this.sleep(200);
      } catch (err) {
        console.warn(`Failed to ingest feed item "${item.title}":`, err.message);
      }
    }

    return results;
  },

  async ingestGithubRepo(repoUrl, options = {}) {
    // AUDIT-01 / CWE-78: Use sanitized temp path inside OS temp dir, not process.cwd()
    // to prevent writing cloned repos inside the application workspace
    const tempDir = path.join(os.tmpdir(), `vidilearn_repo_${Date.now()}`);
    console.log(`Safe cloning repository ${repoUrl} without shell evaluation...`);
    
    // Shell safety: spawn git directly using execFileSync args array, bypassing shell
    try {
      execFileSync('git', ['clone', '--depth', '1', '--no-tags', '--single-branch', repoUrl, tempDir], {
        stdio: 'ignore',
        timeout: 60000  // AUDIT-03 / CWE-400: Abort clone after 60 seconds (hangs prevention)
      });
      const results = await this.ingestDirectory(tempDir, options);
      return results;
    } finally {
      if (fs.existsSync(tempDir)) {
        fs.rmSync(tempDir, { recursive: true, force: true });
      }
    }
  },

  async parseEpubSimple(filePath) {
    try {
      const tempDir = path.join(process.cwd(), `temp_epub_${Date.now()}`);
      fs.mkdirSync(tempDir);
      try {
        execFileSync('unzip', ['-q', filePath, '-d', tempDir], { stdio: 'ignore' });
        const htmlFiles = this.walkDir(tempDir).filter(f => f.endsWith('.html') || f.endsWith('.xhtml') || f.endsWith('.xml'));
        let fullText = '';
        for (const file of htmlFiles) {
          const content = fs.readFileSync(file, 'utf8');
          const text = content.replace(/<\/?[^>]+(>|$)/g, " ");
          fullText += text + '\n';
        }
        return fullText;
      } finally {
        if (fs.existsSync(tempDir)) {
          fs.rmSync(tempDir, { recursive: true, force: true });
        }
      }
    } catch (e) {
      throw new Error(`Failed to parse EPUB: simple zip extraction failed. Make sure 'unzip' is installed. Error: ${e.message}`);
    }
  },

  async transcribeAudioLocal(audioPath) {
    console.log(`Local transcription requested for ${audioPath}.`);
    const rawAudioPath = path.join(process.cwd(), `temp_audio_${Date.now()}.raw`);
    try {
      // Shell safety: execute ffmpeg cleanly with separate args
      execFileSync('ffmpeg', ['-i', audioPath, '-ar', '16000', '-ac', '1', '-f', 'f32le', rawAudioPath], { stdio: 'ignore' });
      const buffer = fs.readFileSync(rawAudioPath);
      const floatArr = new Float32Array(buffer.buffer, buffer.byteOffset, buffer.byteLength / 4);

      const { pipeline } = await import('@huggingface/transformers');
      const transcriber = await pipeline('automatic-speech-recognition', 'Xenova/whisper-tiny.en', { dtype: 'fp32' });
      const result = await transcriber(floatArr);
      return result.text;
    } catch (err) {
      throw new Error(`Local transcription failed. Ensure 'ffmpeg' is installed. Error: ${err.message}`);
    } finally {
      if (fs.existsSync(rawAudioPath)) {
        fs.unlinkSync(rawAudioPath);
      }
    }
  },

  async saveChunksToDb(docId, text, embedProvider = null) {
    const chunks = embeddingService.chunkText(text);
    const saved = [];

    for (let i = 0; i < chunks.length; i++) {
      const chunkText = chunks[i];
      const embeddingResult = await embeddingService.embed(chunkText, embedProvider);
      const embedding = embeddingResult[0].embedding;
      const chunkId = dbService.insertChunk(docId, chunkText, embedding, i);
      saved.push({ id: chunkId, index: i });
    }

    return saved;
  },

  // AUDIT-03 / CWE-400: Limit recursion depth to prevent zip bombs, symlink loops, and resource exhaustion
  walkDir(dir, depth = 0, maxDepth = 6, maxFiles = 500) {
    if (depth > maxDepth) {
      console.warn(`[Security] walkDir: Max depth ${maxDepth} reached at ${dir}. Skipping deeper traversal.`);
      return [];
    }
    let results = [];
    const list = fs.readdirSync(dir);
    for (const filename of list) {
      if (results.length >= maxFiles) {
        console.warn(`[Security] walkDir: Max file limit ${maxFiles} reached. Stopping traversal.`);
        break;
      }
      const file = path.join(dir, filename);
      // Skip hidden files and dotfiles
      if (path.basename(file).startsWith('.')) continue;
      const stat = fs.lstatSync(file); // lstatSync to detect symlinks, not follow them
      if (stat.isSymbolicLink()) {
        // AUDIT-03: Refuse to follow symlinks to prevent circular loops
        console.warn(`[Security] walkDir: Skipping symlink at ${file}`);
        continue;
      }
      if (stat.isDirectory()) {
        results = results.concat(this.walkDir(file, depth + 1, maxDepth, maxFiles - results.length));
      } else {
        results.push(file);
      }
    }
    return results;
  }
};
