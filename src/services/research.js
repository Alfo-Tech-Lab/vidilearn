import fs from 'fs';
import path from 'path';
import ytDlp from 'yt-dlp-exec';
import { youtubeExtractor } from '../extractors/youtube.js';
import { dbService } from './db.js';
import { ingestionService } from './ingestion.js';
import axios from 'axios';

export const researchService = {
  async runResearch(query, options = {}) {
    const limit = options.limit || 3;
    const outputDir = path.join(process.cwd(), `research_${Date.now()}_${query.toLowerCase().replace(/[^a-z0-9]/g, '_')}`);
    
    fs.mkdirSync(outputDir, { recursive: true });
    fs.mkdirSync(path.join(outputDir, 'summaries'), { recursive: true });
    fs.mkdirSync(path.join(outputDir, 'citations'), { recursive: true });

    console.log(`Starting Research Mode for query: "${query}"...`);
    
    // 1. Search YouTube
    const searchUrl = `ytsearch${limit}:${query}`;
    console.log(`Searching YouTube for top ${limit} videos...`);
    
    const searchResults = await ytDlp(searchUrl, {
      dumpSingleJson: true,
      flatPlaylist: true,
      noCheckCertificates: true,
      noWarnings: true
    });

    if (!searchResults.entries || searchResults.entries.length === 0) {
      throw new Error("No YouTube search results found.");
    }

    const videos = searchResults.entries.map(e => ({
      id: e.id,
      title: e.title,
      url: `https://www.youtube.com/watch?v=${e.id}`
    }));

    console.log(`Found ${videos.length} videos. Processing transcripts and metadata...`);

    const ingestedDocs = [];
    const timeline = [];

    for (let i = 0; i < videos.length; i++) {
      const video = videos[i];
      console.log(`[${i+1}/${videos.length}] Extracting: ${video.title}`);
      try {
        const data = await youtubeExtractor.extract(video.url);
        
        // Ingest into local SQLite memory DB
        const docId = dbService.insertDocument(data.title, video.url, 'youtube', {
          author: data.author,
          publishedDate: data.publishedDate,
          extractedAt: data.extractedAt
        });

        const chunks = await ingestionService.saveChunksToDb(docId, data.transcript || data.description || '', options.provider || 'transformers');
        
        ingestedDocs.push({
          id: docId,
          title: data.title,
          url: video.url,
          author: data.author,
          publishedDate: data.publishedDate,
          transcript: data.transcript,
          description: data.description,
          chunksCount: chunks.length
        });

        // Add to timeline
        timeline.push({
          date: data.publishedDate || 'Unknown',
          title: data.title,
          channel: data.author,
          url: video.url
        });

        // Save citation metadata
        fs.writeFileSync(
          path.join(outputDir, 'citations', `video_${docId}.json`),
          JSON.stringify(data, null, 2)
        );

        // Generate summary
        let summary = '';
        if (options.useOllama) {
          summary = await this.summarizeWithOllama(data.title, data.transcript || data.description, options.ollamaUrl, options.ollamaModel);
        } else {
          summary = `### ${data.title}\n\n*Channel: ${data.author}*\n*Date: ${data.publishedDate}*\n\nDescription summary:\n${(data.description || 'No description available.').slice(0, 300)}...`;
        }

        fs.writeFileSync(
          path.join(outputDir, 'summaries', `summary_${docId}.md`),
          summary
        );
      } catch (err) {
        console.error(`Failed to research video ${video.title}: ${err.message}`);
      }
    }

    // Sort timeline by date
    timeline.sort((a, b) => a.date.localeCompare(b.date));
    fs.writeFileSync(path.join(outputDir, 'timeline.json'), JSON.stringify(timeline, null, 2));

    // Generate main compiled report
    let compiledReport = `# Deep Research Report: ${query}\n\n`;
    compiledReport += `Generated on: ${new Date().toLocaleDateString()}\n\n`;
    
    compiledReport += `## Table of Contents\n1. Executive Summary\n2. Key Timeline & Milestones\n3. Source Overviews\n\n`;

    // 1. Executive Summary
    compiledReport += `## 1. Executive Summary\n\n`;
    if (options.useOllama && ingestedDocs.length > 0) {
      const allTranscripts = ingestedDocs.map(d => `Source: ${d.title}\n${d.transcript || d.description}`).join('\n\n');
      compiledReport += await this.synthesizeReportWithOllama(query, allTranscripts, options.ollamaUrl, options.ollamaModel);
    } else {
      compiledReport += `This report compiles insights retrieved locally from top YouTube sources matching "${query}".\n`;
    }
    compiledReport += `\n\n`;

    // 2. Timeline
    compiledReport += `## 2. Key Timeline & Milestones\n\n`;
    timeline.forEach(t => {
      compiledReport += `- **${t.date}**: [${t.title}](${t.url}) by *${t.channel}*\n`;
    });
    compiledReport += `\n\n`;

    // 3. Source Overviews
    compiledReport += `## 3. Source Overviews & Summaries\n\n`;
    for (const doc of ingestedDocs) {
      const summaryContent = fs.readFileSync(path.join(outputDir, 'summaries', `summary_${doc.id}.md`), 'utf8');
      compiledReport += `${summaryContent}\n\n---\n\n`;
    }

    fs.writeFileSync(path.join(outputDir, 'markdown_report.md'), compiledReport);
    return outputDir;
  },

  async summarizeWithOllama(title, text, url = 'http://127.0.0.1:11434', model = 'qwen2.5') {
    try {
      const prompt = `Summarize the following transcript/description of a video titled "${title}" in a clear, concise bullet-point format. Include key takeaways, tools mentioned, or core concepts.
Text:
${text.slice(0, 4000)}`;

      const response = await axios.post(`${url}/api/generate`, {
        model,
        prompt,
        stream: false
      });
      return `### ${title}\n\n${response.data.response}`;
    } catch (e) {
      return `### ${title}\n\n*Failed to summarize using Ollama. (Make sure Ollama is running)*`;
    }
  },

  async synthesizeReportWithOllama(query, context, url = 'http://127.0.0.1:11434', model = 'qwen2.5') {
    try {
      const prompt = `Act as an expert research analyst. Synthesize a comprehensive, executive-level markdown report based on the following text content retrieved from multiple videos about "${query}". Summarize the consensus, conflicts, and main breakthroughs.
Sources Context:
${context.slice(0, 8000)}`;

      const response = await axios.post(`${url}/api/generate`, {
        model,
        prompt,
        stream: false
      });
      return response.data.response;
    } catch (e) {
      return `Failed to synthesize executive report via Ollama. Check that Ollama service is active.`;
    }
  }
};
