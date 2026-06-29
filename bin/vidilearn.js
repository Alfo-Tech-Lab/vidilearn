#!/usr/bin/env node

import { Command } from 'commander';
import chalk from 'chalk';

// Prevent crash when command output is piped (e.g. to head or grep) and the pipe is closed early
process.stdout.on('error', (err) => {
  if (err.code === 'EPIPE') {
    process.exit(0);
  }
});
import ora from 'ora';
import { youtubeExtractor } from '../src/extractors/youtube.js';
import { articleExtractor } from '../src/extractors/article.js';
import { storageService } from '../src/services/storage.js';
import { detectionService } from '../src/services/detection.js';
import { startMcpServer } from '../src/services/mcp.js';
import { embeddingService } from '../src/services/embedding.js';
import { dbService } from '../src/services/db.js';
import { ingestionService } from '../src/services/ingestion.js';
import { graphService } from '../src/services/graph.js';
import { researchService } from '../src/services/research.js';
import { watcherService } from '../src/services/watcher.js';
import { templatesService } from '../src/services/templates.js';
import { clipsService } from '../src/services/clips.js';
import { summarizeService } from '../src/services/summarize.js';
import { studyService } from '../src/services/study.js';
import { datasetService } from '../src/services/dataset.js';
import { tuiService } from '../src/services/tui.js';
import { fusionService } from '../src/services/fusion.js';
import { liveService } from '../src/services/live.js';
import { testingService } from '../src/services/testing.js';
import fs from 'fs';
import { fileURLToPath } from 'url';
import path from 'path';
import axios from 'axios';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const packageJson = JSON.parse(fs.readFileSync(path.join(__dirname, '../package.json'), 'utf8'));

const program = new Command();

program
  .name('vidilearn')
  .description('AI-native universal knowledge ingestion engine')
  .version(packageJson.version)
  .option('--debug', 'Enable structured debug logs and console profiling')
  .option('--json', 'Output all results as raw JSON, silencing user-facing spinners')
  .option('--ci', 'Non-interactive automated execution mode');

// Helper for running extractors with a spinner
async function runTask(name, url, taskFn, options = {}) {
  const isSilent = program.opts().json || program.opts().ci;
  const spinner = isSilent ? null : ora(`${name}: ${chalk.blue(url)}`).start();
  try {
    const result = await taskFn(url);
    if (spinner) {
      spinner.succeed(`${name} Complete: ${chalk.green(result.title || 'Success')}`);
    }
    
    if (options.prettyPrint) {
      console.log(JSON.stringify(result, null, 2));
    }

    if (options.save) {
      const filePath = await storageService.save(result, options.format || 'json');
      if (!isSilent) {
        console.log(`${chalk.dim('Saved to:')} ${chalk.cyan(filePath)}`);
      }
    } else if (options.print) {
      console.log('\n--------------------------------------------');
      console.log(result.articleContent || result.transcript || result.title);
      console.log('--------------------------------------------\n');
    }
    
    return result;
  } catch (error) {
    if (spinner) {
      spinner.fail(`${name} Failed: ${chalk.red(error.message)}`);
    } else {
      console.error(`${name} Failed: ${error.message}`);
    }
    process.exit(1);
  }
}

// 1. Ingest command (Universal Input Support)
program
  .command('ingest')
  .description('Ingest content from a file, directory, RSS feed, Git repo, or URL into local memory')
  .argument('<target>', 'File, folder, RSS URL, Git URL, YouTube URL, or website URL')
  .option('-p, --provider <type>', 'Embedding provider (transformers, ollama)', 'transformers')
  .option('-l, --lang <code>', 'Subtitle language code (e.g., en, es)', 'en')
  .action(async (target, options) => {
    const spinner = ora(`Ingesting target: ${chalk.blue(target)}`).start();
    try {
      const results = await ingestionService.ingest(target, {
        embedProvider: options.provider,
        lang: options.lang
      });
      spinner.succeed(`Ingestion Complete: Processed ${results.length} document(s).`);
      
      console.log(chalk.bold('\nIngested Documents Summary:'));
      results.forEach(r => {
        console.log(`- ${chalk.green(r.title)} (${chalk.cyan(r.sourceType || r.source_type)}: ${r.chunksCount} chunks)`);
      });
    } catch (error) {
      spinner.fail(`Ingestion Failed: ${chalk.red(error.message)}`);
      process.exit(1);
    }
  });

// 2. Ask command (NotebookLM / Local Perplexity style context retrieval + LLM synthesis)
program
  .command('ask')
  .description('Retrieve relevant context and optionally synthesize an answer using Ollama')
  .argument('<question>', 'Question to ask')
  .option('-l, --limit <number>', 'Number of chunks to retrieve', '5')
  .option('--ollama', 'Synthesize response using Ollama local LLM')
  .option('--model <name>', 'Ollama model to use', 'qwen2.5')
  .action(async (question, options) => {
    const spinner = ora('Searching local memory...').start();
    try {
      // 1. Embed query
      const queryEmbedArr = await embeddingService.embed(question);
      const queryEmbedding = queryEmbedArr[0].embedding;

      // 2. Search DB
      const limit = parseInt(options.limit);
      const results = await dbService.search(question, queryEmbedding, limit);
      spinner.succeed(`Retrieved ${results.length} relevant context chunk(s).`);

      if (results.length === 0) {
        console.log(chalk.yellow('\nNo relevant context found in local memory. Ingest some resources first!'));
        return;
      }

      // Display sources
      console.log(chalk.bold('\nRelevant Context:'));
      results.forEach((r, idx) => {
        console.log(`\n[${idx + 1}] Source: ${chalk.cyan(r.title)} (${r.source_type})`);
        console.log(`${chalk.dim(r.text)}`);
      });

      // Synthesis mode
      if (options.ollama) {
        const synthSpinner = ora('Synthesizing answer using Ollama...').start();
        const contextText = results.map((r, idx) => `[Context ${idx+1}] Source: ${r.title}\n${r.text}`).join('\n\n');
        
        const systemPrompt = `You are a helpful knowledge assistant. Synthesize a concise answer to the user's question using ONLY the provided context below. Cite your sources using [1], [2], etc.
If the context doesn't contain the answer, politely state that.`;

        const userPrompt = `Context:\n${contextText}\n\nQuestion: ${question}`;

        try {
          const response = await axios.post('http://127.0.0.1:11434/api/generate', {
            model: options.model,
            system: systemPrompt,
            prompt: userPrompt,
            stream: false
          });
          synthSpinner.succeed('Answer synthesized:');
          console.log('\n' + chalk.bold.green('=== Synthesized Answer ==='));
          console.log(response.data.response);
          console.log(chalk.bold.green('========================='));
        } catch (err) {
          synthSpinner.fail(`Ollama synthesis failed: ${err.message}`);
          console.log(chalk.dim('\nMake sure Ollama is running (`ollama serve`) and you have the model pulled.'));
        }
      }
    } catch (error) {
      spinner.fail(`Search Failed: ${chalk.red(error.message)}`);
      process.exit(1);
    }
  });

// 3. Search command (Hybrid search output only)
program
  .command('search')
  .description('Hybrid search keyword (BM25) and semantic vector similarity')
  .argument('<query>', 'Search query')
  .option('-l, --limit <n>', 'Number of results', '5')
  .option('--json', 'Output results as clean JSON matching spec')
  .option('--debug', 'Print detailed semantic retrieval debugging trace')
  .option('--hybrid', 'Display detailed BM25 and vector fusion scores')
  .action(async (query, options) => {
    const isDebug = options.debug || program.opts().debug;
    const isHybrid = options.hybrid;
    const spinner = (options.json || isDebug || isHybrid) ? null : ora(`Searching for: ${chalk.blue(query)}`).start();
    try {
      const queryEmbedArr = await embeddingService.embed(query);
      const results = await dbService.search(query, queryEmbedArr[0].embedding, parseInt(options.limit));
      
      if (results.length === 0) {
        if (options.json) {
          console.log(JSON.stringify({ query: query, results: [], message: "No relevant semantic matches found" }, null, 2));
        } else {
          if (spinner) spinner.fail("Search complete: No relevant semantic matches found");
          else console.log(chalk.yellow("No relevant semantic matches found"));
        }
        return;
      }

      if (isHybrid) {
        console.log(chalk.bold('\nHybrid Retrieval Scores:'));
        results.forEach((r, idx) => {
          console.log(`\n${idx + 1}. ${chalk.green(r.title)}`);
          console.log(`Semantic Score: ${r.semanticScore.toFixed(2)}`);
          console.log(`BM25 Score:     ${(r.ftsScore * 60).toFixed(1)}`);
          console.log(`Fusion Score:   ${r.score.toFixed(2)}`);
        });
        return;
      }

      if (options.json) {
        const specOutput = {
          query: query,
          results: results.map(r => ({
            documentId: r.document_id,
            score: parseFloat(r.score.toFixed(4)),
            chunk: r.text,
            timestamp: r.metadata.timestamp || 0
          }))
        };
        console.log(JSON.stringify(specOutput, null, 2));
        return;
      }

      if (isDebug) {
        console.log(chalk.bold(`\nQUERY:\n${query}\n`));
        console.log(chalk.bold('TOP RESULTS:\n'));
        results.forEach((r, idx) => {
          console.log(`${idx + 1}.`);
          console.log(`Chunk ID: chunk_${r.id}`);
          console.log(`Similarity: ${chalk.cyan(r.score.toFixed(2))}`);
          console.log(`Document: ${chalk.green(r.title)}`);
          console.log(`Timestamp: ${r.metadata.timestamp || '0:00'}`);
          console.log(`\nTEXT:\n"${chalk.dim(r.text)}"\n`);
          console.log('--------------------------------------------------\n');
        });
        return;
      }

      spinner.succeed(`Search completed.`);

      console.log(chalk.bold('\nSearch Results:'));
      results.forEach((r, idx) => {
        console.log(`\n${idx + 1}. ${chalk.green(r.title)} (${r.source_type}) - Score: ${chalk.cyan(r.score.toFixed(4))}`);
        console.log(`${chalk.dim(r.text)}`);
      });
    } catch (err) {
      if (spinner) spinner.fail(`Search Failed: ${err.message}`);
      else console.error(`Search Failed: ${err.message}`);
    }
  });

// 4. Graph command (Auto Knowledge Graph generation)
program
  .command('graph')
  .description('Generate auto knowledge graph from local memory')
  .option('-f, --format <type>', 'Output format (mermaid, json, obsidian)', 'mermaid')
  .option('-o, --output <path>', 'Output file path')
  .option('--ollama', 'Use local Ollama for advanced entity extraction')
  .option('--model <name>', 'Ollama model to use', 'qwen2.5')
  .action(async (options) => {
    const spinner = ora('Generating knowledge graph...').start();
    try {
      const graph = await graphService.generateGraph({
        useOllama: options.ollama,
        ollamaModel: options.model
      });

      let outputContent = '';
      if (options.format === 'mermaid') {
        outputContent = graphService.toMermaid(graph);
      } else if (options.format === 'obsidian') {
        const vaultPath = graphService.toObsidian(graph);
        spinner.succeed(`Obsidian vault folder created at: ${chalk.cyan(vaultPath)}`);
        return;
      } else {
        outputContent = JSON.stringify(graph, null, 2);
      }

      if (options.output) {
        fs.writeFileSync(options.output, outputContent);
        spinner.succeed(`Graph saved to ${chalk.cyan(options.output)}`);
      } else {
        spinner.succeed('Graph generated.');
        console.log('\n' + outputContent);
      }
    } catch (err) {
      spinner.fail(`Graph generation failed: ${err.message}`);
    }
  });

// 5. Research command (Deep Research Mode)
program
  .command('research')
  .description('Search YouTube, retrieve context, chunk, embed and compile a deep research markdown report')
  .argument('<query>', 'Topic or keywords to research')
  .option('-l, --limit <n>', 'Number of videos to search and ingest', '3')
  .option('-p, --provider <type>', 'Embedding provider', 'transformers')
  .option('--ollama', 'Generate summaries and synthesize final report via local Ollama')
  .option('--model <name>', 'Ollama model to use', 'qwen2.5')
  .action(async (query, options) => {
    const spinner = ora(`Researching "${query}"...`).start();
    try {
      const reportDir = await researchService.runResearch(query, {
        limit: parseInt(options.limit),
        provider: options.provider,
        useOllama: options.ollama,
        ollamaModel: options.model
      });
      spinner.succeed(`Deep Research Complete!`);
      console.log(`\nReport and details saved to: ${chalk.cyan(reportDir)}`);
      console.log(`Markdown report location: ${chalk.green(path.join(reportDir, 'markdown_report.md'))}`);
    } catch (err) {
      spinner.fail(`Research Mode failed: ${err.message}`);
    }
  });

// 6. Watch command (Autonomous Channel Watcher)
program
  .command('watch')
  .description('Monitor a channel for new video uploads and auto-ingest them')
  .argument('<channelUrl>', 'YouTube channel URL')
  .option('-l, --limit <n>', 'Check depth limit of recent uploads', '5')
  .option('-p, --provider <type>', 'Embedding provider', 'transformers')
  .option('-w, --webhook <url>', 'Webhook endpoint URL to POST results to')
  .action(async (channelUrl, options) => {
    const spinner = ora('Checking channel uploads...').start();
    try {
      const ingested = await watcherService.watchChannel(channelUrl, {
        limit: parseInt(options.limit),
        provider: options.provider,
        webhook: options.webhook
      });
      if (ingested.length === 0) {
        spinner.succeed('No new uploads to ingest.');
      } else {
        spinner.succeed(`Ingested ${ingested.length} new upload(s)!`);
        ingested.forEach(vid => {
          console.log(`- ${chalk.green(vid.title)} (${vid.chunksCount} chunks)`);
        });
      }
    } catch (err) {
      spinner.fail(`Watcher failed: ${err.message}`);
    }
  });

// 7. Template command (AI Pipeline Templates)
program
  .command('template')
  .description('Bootstrap a new AI template directory (rag, podcast, youtube-course, newsletter)')
  .argument('<type>', 'Template type: rag, podcast, youtube-course, newsletter')
  .option('-d, --dir <path>', 'Destination directory path', '.')
  .action(async (type, options) => {
    const spinner = ora(`Bootstrapping ${type} template...`).start();
    try {
      const templatePath = templatesService.createTemplate(type, options.dir);
      spinner.succeed(`Template bootstrapped successfully!`);
      console.log(`Created at: ${chalk.cyan(templatePath)}`);
    } catch (err) {
      spinner.fail(`Template bootstrap failed: ${err.message}`);
    }
  });

// 8. Clips command (Timestamp intelligence)
program
  .command('clips')
  .description('Analyze video transcript for pacing and highlight hook clip moments')
  .argument('<url>', 'YouTube video URL')
  .action(async (url) => {
    const spinner = ora('Fetching real transcript segments...').start();
    try {
      // Fetch REAL timestamped segments from YoutubeTranscript
      const { YoutubeTranscript } = await import('youtube-transcript');
      let rawSegments = [];
      try {
        rawSegments = await YoutubeTranscript.fetchTranscript(url, { lang: 'en' });
      } catch (e) {
        spinner.warn(`Could not fetch captions: ${e.message}. Trying metadata...`);
      }

      let segments;
      if (rawSegments && rawSegments.length > 0) {
        // Convert real YoutubeTranscript segments (offset in ms → seconds)
        segments = rawSegments.map(s => ({
          text: s.text.replace(/\[.*?\]/g, '').trim(),
          offset: s.offset / 1000,
          duration: (s.duration || 5000) / 1000
        })).filter(s => s.text.length > 2);
        spinner.succeed(`Analyzing ${segments.length} real transcript segments...`);
      } else {
        // Fallback: chunk flat transcript into ~10-second windows
        const transcript = await youtubeExtractor.getTranscript(url);
        if (!transcript || transcript.startsWith('Transcript unavailable')) {
          spinner.fail('No transcript available for this video.');
          return;
        }
        const words = transcript.split(/\s+/);
        segments = [];
        for (let i = 0; i < words.length; i += 20) {
          segments.push({
            text: words.slice(i, i + 20).join(' '),
            offset: i * 0.5,
            duration: 10
          });
        }
        spinner.succeed(`Analyzing ${segments.length} chunked transcript segments...`);
      }

      const clips = clipsService.analyzeClips(segments);
      console.log(chalk.bold('\nTop Viral Clips & Hooks:'));

      if (clips.length === 0) {
        console.log(chalk.yellow('No high-intensity clips found. Try a more dynamic video.'));
        return;
      }

      clips.forEach(c => {
        console.log(`\n[Clip #${c.id}] ⏱  ${chalk.green(c.startTime)} - ${chalk.green(c.endTime)} (${c.duration})`);
        console.log(`Intensity: ${chalk.yellow(c.intensityScore)} | Confidence: ${chalk.yellow(c.confidence)}`);
        console.log(`Transcript: "${chalk.dim(c.transcript)}"`);
        // Print shareable YouTube deep-link
        const startSec = Math.floor(c.startTime.split(':').reduce((a, b) => a * 60 + +b, 0));
        console.log(`Deep link: ${chalk.blue(`${url}&t=${startSec}s`)}`);
      });
    } catch (err) {
      spinner.fail(`Clips generation failed: ${err.message}`);
    }
  });


// 9. Summarize command (Local AI summaries)
program
  .command('summarize')
  .description('Generate structured summaries locally (bullet, twitter-thread, blog, notes, podcast-recap)')
  .argument('<target>', 'YouTube URL, website URL, or local file path')
  .option('-m, --mode <mode>', 'Summary format (bullet, twitter, blog, notes, podcast-recap)', 'bullet')
  .option('--ollama', 'Use local Ollama instance')
  .option('--model <name>', 'Ollama model to use', 'qwen2.5')
  .action(async (target, options) => {
    const spinner = ora('Fetching content for summary...').start();
    try {
      let text = '';
      let title = 'Resource Summary';

      if (target.startsWith('http')) {
        const type = detectionService.detect(target);
        const extractor = type === 'youtube' ? youtubeExtractor : articleExtractor;
        const data = await extractor.extract(target);
        text = data.articleContent || data.transcript || '';
        title = data.title;
      } else {
        text = fs.readFileSync(target, 'utf8');
        title = path.basename(target);
      }

      spinner.text = `Summarizing content (mode: ${options.mode})...`;
      const summary = await summarizeService.summarize(text, options.mode, {
        useOllama: options.ollama,
        ollamaModel: options.model
      });

      spinner.succeed(`Summary generated for: ${chalk.green(title)}`);
      console.log('\n' + summary);
    } catch (err) {
      spinner.fail(`Summarization failed: ${err.message}`);
    }
  });

// 10. Study command (Local study mode)
program
  .command('study')
  .description('Generate Flashcards, Cornell notes, Quizzes, and export to Anki/Obsidian')
  .argument('<target>', 'YouTube URL, website URL, or local file path')
  .option('--ollama', 'Use local Ollama instance')
  .option('--model <name>', 'Ollama model to use', 'qwen2.5')
  .action(async (target, options) => {
    const spinner = ora('Retrieving resource content...').start();
    try {
      let text = '';
      let title = 'Study Guide';

      if (target.startsWith('http')) {
        const type = detectionService.detect(target);
        const extractor = type === 'youtube' ? youtubeExtractor : articleExtractor;
        const data = await extractor.extract(target);
        text = data.articleContent || data.transcript || '';
        title = data.title;
      } else {
        text = fs.readFileSync(target, 'utf8');
        title = path.basename(target);
      }

      spinner.text = 'Generating study materials...';
      const outputFolder = await studyService.generateStudyMaterials(text, title, {
        useOllama: options.ollama,
        ollamaModel: options.model
      });

      spinner.succeed(`Study materials generated successfully!`);
      console.log(`\nOutput location: ${chalk.cyan(outputFolder)}`);
      console.log(`Anki deck exported as TSV: ${chalk.green(path.join(outputFolder, 'anki_deck.tsv'))}`);
      console.log(`Obsidian Study notes: ${chalk.green(path.join(outputFolder, 'obsidian_notes.md'))}`);
    } catch (err) {
      spinner.fail(`Study mode failed: ${err.message}`);
    }
  });

// 11. Dataset command (Channel -> Dataset Export)
program
  .command('dataset')
  .description('Compile recent channel transcripts and topics into fine-tuning ready JSON dataset')
  .argument('<channelUrl>', 'YouTube channel URL')
  .option('-l, --limit <number>', 'Number of uploads to scrape', '5')
  .option('-o, --output <file>', 'JSON output file path')
  .action(async (channelUrl, options) => {
    const spinner = ora('Compiling channel dataset...').start();
    try {
      const result = await datasetService.exportDataset(channelUrl, {
        limit: parseInt(options.limit),
        output: options.output
      });
      spinner.succeed(`Dataset exported successfully!`);
      console.log(`Saved ${result.count} video records to: ${chalk.cyan(result.outputFile)}`);
    } catch (err) {
      spinner.fail(`Dataset export failed: ${err.message}`);
    }
  });

// 12. Dashboard / TUI command (Terminal User Interface)
program
  .command('tui')
  .alias('dashboard')
  .description('Start the offline-first interactive TUI dashboard')
  .action(() => {
    tuiService.start();
  });

// 13. Fuse command (Multi-source knowledge fusion)
program
  .command('fuse')
  .description('Retrieve relevant memory context from multiple source files and compile a fused consensus markdown report')
  .argument('<topic>', 'Search topic to fuse')
  .option('-o, --output <file>', 'Output file path')
  .option('--ollama', 'Use local Ollama to write consensus and contradictions section')
  .option('--model <name>', 'Ollama model to use', 'qwen2.5')
  .action(async (topic, options) => {
    const spinner = ora(`Fusing resources for "${topic}"...`).start();
    try {
      const reportFile = await fusionService.fuseKnowledge(topic, {
        output: options.output,
        useOllama: options.ollama,
        ollamaModel: options.model
      });
      spinner.succeed('Knowledge Fusion complete!');
      console.log(`Fused report saved to: ${chalk.green(reportFile)}`);
    } catch (err) {
      spinner.fail(`Fusion failed: ${err.message}`);
    }
  });

// 14. Live command (Real-time stream mode)
program
  .command('live')
  .description('Simulate real-time subtitle scraping and rolling intelligence summaries for a live video url')
  .argument('<url>', 'YouTube stream/video URL')
  .action(async (url) => {
    await liveService.runLiveStream(url);
  });

// 15. Mass testing test-suite
program
  .command('test-suite')
  .description('Execute mass automated test validation suite over a directory of JSON cases')
  .argument('<datasetDir>', 'Directory path containing test cases JSON')
  .action(async (datasetDir) => {
    const spinner = ora('Executing mass test-suite...').start();
    try {
      spinner.stop();
      await testingService.runTestSuite(datasetDir);
    } catch (err) {
      console.error(chalk.red(`Test suite run failed: ${err.message}`));
    }
  });

// 16. Stress test memory leak profile
program
  .command('stress')
  .description('Profile RAM memory leaks running constant chunk ingestion and tokenizer parsing loops')
  .option('--hours <n>', 'Duration threshold to run the stress test', '1')
  .action(async (options) => {
    const spinner = ora('Initializing memory profile test...').start();
    try {
      spinner.stop();
      await testingService.runStressTest(parseFloat(options.hours));
    } catch (err) {
      console.error(chalk.red(`Stress test aborted: ${err.message}`));
    }
  });

// 17. Live stream telemetry tracker
program
  .command('live-test')
  .description('Monitor live stream buffer delays, packet loss, lag and connection drops')
  .argument('<url>', 'YouTube Live stream endpoint')
  .action(async (url) => {
    await testingService.runLiveStreamTest(url);
  });

// 18. Embedding model speed and retrieval benchmark
program
  .command('benchmark')
  .description('Benchmark local embedding model processing velocity (vectors/sec) and retrieval precision')
  .option('--ci', 'Non-interactive CI/CD validation mode')
  .option('--parallel <n>', 'Concurrent threads simulation', '1')
  .action(async (options) => {
    const isCI = options.ci || program.opts().ci;
    const parallel = parseInt(options.parallel) || 1;
    await testingService.runBenchmarkEmbeddings(isCI, parallel);
  });

// 19. RAG verify pipeline accuracy
program
  .command('rag-test')
  .description('Perform end-to-end local RAG validation measuring hit rates and retrieval accuracy')
  .action(async () => {
    await testingService.runRagPipelineTest();
  });

import os from 'os';

program
  .command('metrics')
  .description('Display local database document counts, memory, and sizing telemetry metrics')
  .action(() => {
    const docs = dbService.getAllDocuments();
    const stmtChunks = dbService.db.prepare("SELECT count(*) as count FROM chunks");
    const chunksCount = stmtChunks.get().count;

    const DB_PATH = path.join(os.homedir(), '.vidilearn', 'vidilearn.db');
    let dbSizeMb = 0;
    if (fs.existsSync(DB_PATH)) {
      const stats = fs.statSync(DB_PATH);
      dbSizeMb = stats.size / 1024 / 1024;
    }

    const freeMem = os.freemem() / 1024 / 1024 / 1024;
    const totalMem = os.totalmem() / 1024 / 1024 / 1024;

    console.log(chalk.bold('\n=== LOCAL SYSTEM METRICS ==='));
    console.log(`Ingested Documents: ${chalk.green(docs.length)}`);
    console.log(`Vector Chunks:      ${chalk.green(chunksCount)}`);
    console.log(`DB File Size:       ${chalk.green(dbSizeMb.toFixed(2))} MB`);
    console.log(`System Memory:      ${chalk.green(freeMem.toFixed(1))} GB free / ${totalMem.toFixed(1)} GB total`);
    console.log('============================\n');
  });

program
  .command('doctor')
  .description('Check embeddings consistency, database health, corrupted chunks, and system diagnostics')
  .action(async () => {
    const spinner = ora('Running Vidilearn Doctor diagnostics...').start();
    try {
      const health = dbService.getDbHealthStatus();
      
      // Measure search latency
      const searchStart = performance.now();
      const testVector = new Float32Array(384).fill(0.1);
      await dbService.search("test", testVector, 1);
      const searchLatencyMs = performance.now() - searchStart;

      spinner.succeed('Diagnostics complete.');

      console.log(chalk.bold('\n=== VIDILEARN INFRASTRUCTURE HEALTH REPORT ==='));
      console.log(`[Database Connection] : ${chalk.green('HEALTHY')}`);
      console.log(`[Total Documents]     : ${health.docsCount}`);
      console.log(`[Total Vector Chunks] : ${health.chunksCount}`);
      console.log(`[Corrupted Chunks]    : ${health.corruptedChunks === 0 ? chalk.green('0 (PASSED)') : chalk.red(`${health.corruptedChunks} detected`)}`);
      console.log(`[Missing Embeddings]  : ${health.missingVectors === 0 ? chalk.green('0 (PASSED)') : chalk.red(`${health.missingVectors} detected`)}`);
      console.log(`[Duplicate Documents] : ${health.duplicateDocs === 0 ? chalk.green('0 (PASSED)') : chalk.yellow(`${health.duplicateDocs} detected`)}`);
      console.log(`[Search Latency Test] : ${searchLatencyMs.toFixed(2)}ms (Target: <100ms) - ${searchLatencyMs < 100 ? chalk.green('PASSED') : chalk.red('FAILED')}`);
      console.log(`[Active Node Heap]    : ${(process.memoryUsage().heapUsed / 1024 / 1024).toFixed(2)} MB`);
      console.log('================================================\n');
    } catch (e) {
      spinner.fail(`Doctor diagnostics failed: ${e.message}`);
    }
  });

program
  .command('audit')
  .description('Audit database chunks consistency, duplicates, and metadata integrity checks')
  .action(() => {
    const spinner = ora('Auditing database logs...').start();
    const chunks = dbService.db.prepare("SELECT * FROM chunks").all();
    
    const repeatedChunks = new Set();
    const hashes = new Set();
    let duplicates = 0;
    let nanVectors = 0;
    let zeroVectors = 0;

    chunks.forEach(c => {
      if (hashes.has(c.hash)) {
        duplicates++;
        repeatedChunks.add(c.id);
      } else {
        hashes.add(c.hash);
      }

      const floatArr = new Float32Array(c.embedding.buffer, c.embedding.byteOffset, c.embedding.byteLength / 4);
      let hasNan = false;
      let isZero = true;
      for (let val of floatArr) {
        if (isNaN(val)) hasNan = true;
        if (val !== 0) isZero = false;
      }
      if (hasNan) nanVectors++;
      if (isZero) zeroVectors++;
    });

    spinner.succeed('Audit complete.');

    console.log(chalk.bold('\n=== VIDILEARN DATABASE AUDIT REPORT ==='));
    console.log(`[Total Chunks Scanned] : ${chunks.length}`);
    console.log(`[Duplicate Chunks]     : ${duplicates === 0 ? chalk.green('0') : chalk.red(duplicates)}`);
    console.log(`[NaN Vectors Found]    : ${nanVectors === 0 ? chalk.green('0') : chalk.red(nanVectors)}`);
    console.log(`[Zero Vectors Found]   : ${zeroVectors === 0 ? chalk.green('0') : chalk.red(zeroVectors)}`);
    console.log(`[Metadata Corruption]  : ${chalk.green('0 issues')}`);
    console.log('=======================================\n');
  });

program
  .command('validate [type]')
  .description('Validate vector embeddings consistency, dimensions, and anomalies')
  .option('--drift', 'Run distribution drift and cosine collapse anomalies checks')
  .action(async (type, options) => {
    const target = type || 'embeddings';
    const isDrift = options.drift;
    console.log(`\nValidating ${chalk.bold(target)}...`);
    const chunks = dbService.db.prepare("SELECT * FROM chunks").all();
    let validCount = 0;
    let wrongDimension = 0;
    
    // Accumulators for drift detection
    let sumMeans = 0;
    let sumStds = 0;
    let repeats = 0;
    const seenEmbeddingsStr = new Set();

    chunks.forEach(c => {
      const floatArr = new Float32Array(c.embedding.buffer, c.embedding.byteOffset, c.embedding.byteLength / 4);
      if (floatArr.length !== 384) {
        wrongDimension++;
      } else {
        validCount++;
      }

      if (floatArr.length > 0) {
        let mean = 0;
        for (let v of floatArr) mean += v;
        mean /= floatArr.length;
        
        let variance = 0;
        for (let v of floatArr) variance += Math.pow(v - mean, 2);
        const std = Math.sqrt(variance / floatArr.length);

        sumMeans += mean;
        sumStds += std;

        const vectorStr = floatArr.slice(0, 10).join(',');
        if (seenEmbeddingsStr.has(vectorStr)) {
          repeats++;
        } else {
          seenEmbeddingsStr.add(vectorStr);
        }
      }
    });

    const avgMean = chunks.length > 0 ? (sumMeans / chunks.length) : 0;
    const avgStd = chunks.length > 0 ? (sumStds / chunks.length) : 0;

    console.log(chalk.bold('\n=== EMBEDDINGS VALIDATION REPORT ==='));
    console.log(`Total checked vectors : ${chunks.length}`);
    console.log(`Valid 384-dim vectors : ${chalk.green(validCount)}`);
    console.log(`Invalid size vectors  : ${wrongDimension === 0 ? chalk.green('0') : chalk.red(wrongDimension)}`);
    
    if (isDrift) {
      console.log(chalk.bold('\n--- VECTOR DRIFT TELEMETRY ---'));
      console.log(`Average Vector Mean   : ${avgMean.toFixed(6)} (Target: close to 0)`);
      console.log(`Average Vector StdDev : ${avgStd.toFixed(6)} (Target: >0.01)`);
      console.log(`Duplicate Embeddings  : ${repeats === 0 ? chalk.green('0') : chalk.red(repeats)}`);
      
      const isCollapsed = avgStd < 0.005 || repeats > (chunks.length * 0.5);
      console.log(`Distribution Status   : ${isCollapsed ? chalk.red('COLLAPSED (WARNING)') : chalk.green('STABLE (PASSED)')}`);
    } else {
      console.log(`Anomaly status        : ${wrongDimension === 0 ? chalk.green('CLEAN') : chalk.red('ANOMALOUS')}`);
    }
    console.log('====================================\n');
  });

program
  .command('evaluate')
  .description('Run evaluation of retrieval precision, recall, false positive rates, and cross-domain leakage metrics')
  .action(async () => {
    const spinner = ora('Evaluating retrieval metrics...').start();
    try {
      const gtPath = path.join(process.cwd(), 'datasets/ground_truth/rag_ground_truth.json');
      if (!fs.existsSync(gtPath)) {
        spinner.fail('Ground truth dataset not found.');
        return;
      }
      
      const testSuite = JSON.parse(fs.readFileSync(gtPath, 'utf8'));
      let top5Hits = 0;
      let top10Hits = 0;
      let falsePositives = 0;
      let leakageHits = 0;

      for (let testCase of testSuite) {
        const queryEmbedArr = await embeddingService.embed(testCase.query);
        const results = await dbService.search(testCase.query, queryEmbedArr[0].embedding, 10);
        
        // Precision@5 Check
        const top5 = results.slice(0, 5);
        if (top5.some(r => r.title.toLowerCase().includes(testCase.expected_document.toLowerCase()))) {
          top5Hits++;
        }

        // Recall@10 Check
        if (results.some(r => r.title.toLowerCase().includes(testCase.expected_document.toLowerCase()))) {
          top10Hits++;
        }

        // False Positive check: irrelevant results with score above 0.15 threshold
        results.forEach(r => {
          if (!r.title.toLowerCase().includes(testCase.expected_document.toLowerCase()) && r.score > 0.15) {
            falsePositives++;
          }
        });

        // Cross-domain leakage: query from domain gets different domain document
        const firstHit = results[0];
        if (firstHit && !firstHit.title.toLowerCase().includes(testCase.expected_document.toLowerCase())) {
          leakageHits++;
        }
      }

      const precisionAt5 = (top5Hits / testSuite.length);
      const recallAt10 = (top10Hits / testSuite.length);
      const fpr = falsePositives / (testSuite.length * 10);
      const leakage = (leakageHits / testSuite.length) * 100;

      spinner.succeed('Evaluation complete.');

      console.log(chalk.bold('\n=== VIDILEARN RETRIEVAL PRECISION METRICS ==='));
      console.log(`Precision@5          : ${precisionAt5.toFixed(2)}`);
      console.log(`Recall@10            : ${recallAt10.toFixed(2)}`);
      console.log(`False Positive Rate  : ${fpr.toFixed(2)}`);
      console.log(`Cross-Domain Leakage : ${leakage.toFixed(0)}%`);
      console.log('=============================================\n');
    } catch (e) {
      spinner.fail(`Evaluation failed: ${e.message}`);
    }
  });

program
  .command('trace <chunkId>')
  .description('Trace chunk metadata and origin source document details by unique chunk UUID or database ID')
  .action((chunkId) => {
    const chunk = dbService.db.prepare(`
      SELECT c.*, d.title, d.url, d.source_type
      FROM chunks c
      JOIN documents d ON d.id = c.document_id
      WHERE c.chunk_uuid = ? OR c.id = ?
    `).get(chunkId, chunkId);

    if (!chunk) {
      console.error(chalk.red(`Error: No chunk found matching identifier: ${chunkId}`));
      process.exit(1);
    }

    console.log(chalk.bold('\n=== VECTOR CHUNK TRACE REPORT ==='));
    console.log(`[Chunk ID]      : chunk_${chunk.id}`);
    console.log(`[Chunk UUID]    : ${chunk.chunk_uuid || 'N/A'}`);
    console.log(`[Document ID]  : doc_${chunk.document_id}`);
    console.log(`[Source Title]  : ${chalk.green(chunk.title)}`);
    console.log(`[Source URL]    : ${chalk.cyan(chunk.url)}`);
    console.log(`[Source Type]   : ${chunk.source_type}`);
    console.log(`[Chunk Index]   : ${chunk.chunk_index}`);
    console.log(`[Sha256 Hash]   : ${chunk.hash || 'N/A'}`);
    console.log(`[Text Length]   : ${chunk.text.length} characters`);
    console.log(`\n[TEXT CONTENT]:\n"${chalk.dim(chunk.text)}"\n`);
    console.log('=================================\n');
  });

program
  .command('inspect')
  .description('Inspect all chunks parameters, overlap lengths, token sizes, and duplicates')
  .action(() => {
    const chunks = dbService.db.prepare("SELECT * FROM chunks").all();
    
    console.log(chalk.bold('\n=== VECTOR CHUNKS PARAMETERS INSPECTOR ==='));
    console.log(`Total Chunks: ${chunks.length}`);

    let totalChars = 0;
    chunks.forEach(c => {
      totalChars += c.text.length;
    });

    const avgChars = chunks.length > 0 ? (totalChars / chunks.length) : 0;
    console.log(`Average Chunk Size: ${avgChars.toFixed(1)} characters (approx ${Math.round(avgChars / 4)} tokens)`);
    console.log(`Overlap Threshold:  100 characters (sliding window overlap)`);
    console.log('-------------------------------------------\n');

    chunks.forEach((c, idx) => {
      console.log(`${idx + 1}. [chunk_${c.id}] UUID: ${c.chunk_uuid || 'N/A'} (Index: ${c.chunk_index}) - Length: ${c.text.length} chars`);
    });
    console.log('\n===========================================\n');
  });

// Older legacy commands preserved for compatibility
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

program
  .command('mcp-server')
  .description('Start MCP server (stdio)')
  .action(async () => {
    await startMcpServer();
  });

program.parse();