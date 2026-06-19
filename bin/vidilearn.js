#!/usr/bin/env node

import { Command } from 'commander';
import chalk from 'chalk';
import ora from 'ora';
import { youtubeExtractor } from '../src/extractors/youtube.js';
import { articleExtractor } from '../src/extractors/article.js';
import { storageService } from '../src/services/storage.js';
import { detectionService } from '../src/services/detection.js';
import { startMcpServer } from '../src/services/mcp.js';
import { embeddingService } from '../src/services/embedding.js';
import fs from 'fs';
import { fileURLToPath } from 'url';
import path from 'path';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const packageJson = JSON.parse(fs.readFileSync(path.join(__dirname, '../package.json'), 'utf8'));

const program = new Command();

program
  .name('vidilearn')
  .description('Production-grade content extraction agent for YouTube and Web')
  .version(packageJson.version);

// Helper for running extractors with a spinner
async function runTask(name, url, taskFn, options = {}) {
  const spinner = ora(`${name}: ${chalk.blue(url)}`).start();
  try {
    const result = await taskFn(url);
    spinner.succeed(`${name} Complete: ${chalk.green(result.title)}`);
    
    if (options.prettyPrint) {
      console.log(JSON.stringify(result, null, 2));
    }

    if (options.save) {
      const filePath = await storageService.save(result, options.format || 'json');
      console.log(`${chalk.dim('Saved to:')} ${chalk.cyan(filePath)}`);
    } else if (options.print) {
      console.log('\n--------------------------------------------');
      console.log(result.articleContent || result.transcript || result.title);
      console.log('--------------------------------------------\n');
    }
    
    return result;
  } catch (error) {
    spinner.fail(`${name} Failed: ${chalk.red(error.message)}`);
    process.exit(1);
  }
}

// 1. watchless extract <url>
program
  .command('extract')
  .description('Full extraction (metadata + content/transcript)')
  .argument('<url>', 'URL to extract')
  .option('-f, --format <type>', 'Export format (json, md, txt)', 'json')
  .option('--no-save', 'Skip saving to file')
  .option('--pretty', 'Print result to console as pretty JSON')
  .option('--stream', 'Stream transcript to stdout (YouTube only)')
  .option('--lang <code>', 'Subtitle language code (e.g., en, es)', 'en')
  .option('--list-langs', 'List available subtitle languages')
  .option('--embed', 'Generate local embeddings for the content')
  .action(async (url, options) => {
    const type = detectionService.detect(url);
    if (type === 'youtube' && options.listLangs) {
      await runTask('List Languages', url, (u) => youtubeExtractor.getSubtitles(u).then(s => ({ title: 'Available Subtitles', languages: Object.keys(s) })), { save: false, prettyPrint: true });
      return;
    }
    const extractor = type === 'youtube' ? youtubeExtractor : articleExtractor;
    let result = await runTask('Full Extract', url, (u) => extractor.extract(u, { stream: options.stream, lang: options.lang }), {
      save: options.save, 
      format: options.format 
    });

    if (options.embed) {
      const textToEmbed = result.clean_text || result.transcript;
      if (textToEmbed) {
        const spinner = ora('Generating Embeddings...').start();
        result.embeddings = await embeddingService.embed(textToEmbed);
        spinner.succeed('Embeddings Generated');
      }
    }
    if (options.pretty || options.prettyPrint) {
      console.log(JSON.stringify(result, null, 2));
    }
  });

// 2. watchless transcript <url>
program
  .command('transcript')
  .description('Extract YouTube transcript only')
  .argument('<url>', 'YouTube URL')
  .option('-p, --print', 'Print to terminal')
  .option('--stream', 'Stream transcript to stdout')
  .option('--lang <code>', 'Subtitle language code (e.g., en, es)', 'en')
  .action(async (url, options) => {
    if (!detectionService.isYouTube(url)) {
      console.error(chalk.red('Error: This command only supports YouTube URLs.'));
      process.exit(1);
    }
    await runTask('Transcript', url, (u) => youtubeExtractor.getTranscript(u, { stream: options.stream, lang: options.lang }).then(t => ({ title: 'Transcript', transcript: t })), {
      save: !options.print && !options.stream,
      print: options.print,
      format: 'txt'
    });
  });

program
  .command('article')
  .description('Extract clean article content')
  .argument('<url>', 'Webpage URL')
  .option('-f, --format <type>', 'Export format (json, md, txt)', 'md')
  .action(async (url, options) => {
    await runTask('Article Extract', url, (u) => articleExtractor.extract(u), {
      save: true,
      format: options.format
    });
  });

// 4. watchless metadata <url>
program
  .command('metadata')
  .description('Extract metadata only')
  .argument('<url>', 'URL to extract')
  .action(async (url) => {
    const type = detectionService.detect(url);
    const task = type === 'youtube' 
      ? (u) => youtubeExtractor.getMetadata(u)
      : (u) => articleExtractor.extract(u).then(r => { delete r.articleContent; return r; });
    
    await runTask('Metadata', url, task, { save: true, format: 'json' });
  });

// 5. watchless subtitles <url>
program
  .command('subtitles')
  .description('Extract YouTube subtitles metadata')
  .argument('<url>', 'YouTube URL')
  .option('--list-langs', 'List available subtitle languages')
  .action(async (url, options) => {
    if (!detectionService.isYouTube(url)) {
      console.error(chalk.red('Error: This command only supports YouTube URLs.'));
      process.exit(1);
    }
    if (options.listLangs) {
      await runTask('List Languages', url, (u) => youtubeExtractor.getSubtitles(u).then(s => ({ title: 'Available Subtitles', languages: Object.keys(s) })), { save: false, prettyPrint: true });
      return;
    }
    await runTask('Subtitles', url, (u) => youtubeExtractor.getSubtitles(u).then(s => ({ title: 'Subtitles', data: s })), {
      save: true,
      format: 'json'
    });
  });

// 6. watchless mcp-server
program
  .command('mcp-server')
  .description('Start MCP server (stdio)')
  .action(async () => {
    await startMcpServer();
  });

// 7. watchless extract-playlist <url>
program
  .command('extract-playlist')
  .description('Batch extract metadata + transcripts for every video in a playlist')
  .argument('<url>', 'YouTube playlist URL')
  .option('-c, --concurrency <n>', 'Number of concurrent extractions', '3')
  .option('-o, --output-dir <dir>', 'Directory to save output files', './output')
  .action(async (url, options) => {
    const spinner = ora(`Fetching Playlist: ${chalk.blue(url)}`).start();
    try {
      const playlist = await youtubeExtractor.extractPlaylist(url);
      spinner.succeed(`Playlist Found: ${chalk.green(playlist.title)} (${playlist.video_urls.length} videos)`);

      const concurrency = parseInt(options.concurrency);
      const results = [];
      const queue = [...playlist.video_urls];

      const outputDir = options.outputDir || './output';
      if (!fs.existsSync(outputDir)) {
        fs.mkdirSync(outputDir, { recursive: true });
      }

      async function processQueue() {
        while (queue.length > 0) {
          const videoUrl = queue.shift();
          const taskName = `[${playlist.video_urls.length - queue.length}/${playlist.video_urls.length}]`;
          try {
            const videoResult = await runTask(taskName, videoUrl, (u) => youtubeExtractor.extract(u), { save: false });
            const fileName = `${videoResult.title.replace(/[/\\?%*:|"<>]/g, '-')}.json`;
            const filePath = path.join(outputDir, fileName);
            fs.writeFileSync(filePath, JSON.stringify(videoResult, null, 2));
            results.push(videoResult);
          } catch (err) {
            console.error(chalk.red(`Failed to process ${videoUrl}: ${err.message}`));
          }
        }
      }

      const workers = Array(Math.min(concurrency, queue.length)).fill(null).map(() => processQueue());
      await Promise.all(workers);

      console.log(chalk.green(`\nDone! Processed ${results.length} videos. Results saved to ${outputDir}`));
    } catch (error) {
      spinner.fail(`Playlist Extraction Failed: ${chalk.red(error.message)}`);
      process.exit(1);
    }
  });

program.parse();