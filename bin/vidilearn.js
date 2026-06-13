#!/usr/bin/env node

import { Command } from 'commander';
import chalk from 'chalk';
import ora from 'ora';
import { youtubeExtractor } from '../src/extractors/youtube.js';
import { articleExtractor } from '../src/extractors/article.js';
import { storageService } from '../src/services/storage.js';
import { detectionService } from '../src/services/detection.js';
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
  .action(async (url, options) => {
    const type = detectionService.detect(url);
    const extractor = type === 'youtube' ? youtubeExtractor : articleExtractor;
    await runTask('Full Extract', url, (u) => extractor.extract(u), { 
      save: options.save, 
      format: options.format 
    });
  });

// 2. watchless transcript <url>
program
  .command('transcript')
  .description('Extract YouTube transcript only')
  .argument('<url>', 'YouTube URL')
  .option('-p, --print', 'Print to terminal')
  .action(async (url, options) => {
    if (!detectionService.isYouTube(url)) {
      console.error(chalk.red('Error: This command only supports YouTube URLs.'));
      process.exit(1);
    }
    await runTask('Transcript', url, (u) => youtubeExtractor.getTranscript(u).then(t => ({ title: 'Transcript', transcript: t })), {
      save: !options.print,
      print: options.print,
      format: 'txt'
    });
  });

// 3. watchless article <url>
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
  .action(async (url) => {
    if (!detectionService.isYouTube(url)) {
      console.error(chalk.red('Error: This command only supports YouTube URLs.'));
      process.exit(1);
    }
    await runTask('Subtitles', url, (u) => youtubeExtractor.getSubtitles(u).then(s => ({ title: 'Subtitles', data: s })), {
      save: true,
      format: 'json'
    });
  });

program.parse();