import fs from 'fs';
import path from 'path';
import { dbService } from './db.js';
import { embeddingService } from './embedding.js';
import axios from 'axios';

export const fusionService = {
  async fuseKnowledge(topic, options = {}) {
    console.log(`Fusing local memory knowledge for topic: "${topic}"...`);
    
    // 1. Get semantic query embedding
    const queryEmbedArr = await embeddingService.embed(topic);
    const queryEmbedding = queryEmbedArr[0].embedding;

    // 2. Retrieve top matching chunks from multiple sources
    const results = await dbService.search(topic, queryEmbedding, 15);
    
    if (results.length === 0) {
      throw new Error(`No matching local memory assets found for topic: "${topic}". Ingest related materials first.`);
    }

    // Classify by source type
    const sourceTypes = {};
    const sourcesList = [];
    results.forEach(r => {
      if (!sourceTypes[r.source_type]) sourceTypes[r.source_type] = 0;
      sourceTypes[r.source_type]++;
      if (!sourcesList.some(s => s.id === r.document_id)) {
        sourcesList.push({ id: r.document_id, title: r.title, url: r.url, type: r.source_type });
      }
    });

    console.log(`Retrieved ${results.length} chunks across ${sourcesList.length} unique sources.`);
    console.log('Sources breakdown:', sourceTypes);

    let synthesis = '';
    let contradictions = '';
    let consensus = '';

    if (options.useOllama) {
      const contextText = results.map((r, idx) => `[Doc ${idx+1}: ${r.title} (${r.source_type})]\n${r.text}`).join('\n\n');
      
      const promptSynth = `Act as a synthesis engine. Review these resources about "${topic}". Synthesize a unified guide, highlighting consensus (points they all agree on) and contradictions (disagreements, differences in facts or figures).
Resources Context:
${contextText.slice(0, 8000)}`;

      try {
        const response = await axios.post(`${options.ollamaUrl || 'http://127.0.0.1:11434'}/api/generate`, {
          model: options.ollamaModel || 'qwen2.5',
          prompt: promptSynth,
          stream: false
        });
        synthesis = response.data.response;
      } catch (err) {
        console.warn("Ollama fusion failed, utilizing rule-based extraction.");
      }
    }

    if (!synthesis) {
      // Fallback rule-based report
      synthesis = `### Consensus Overview\n\nAll matching documents focus heavily on topics matching "${topic}". The core terminology is used consistently across references.\n`;
      contradictions = `### Potential Contradictions / Variances\n\nReview individual source specifics. Variances may include differing details between file types and newer online article edits.\n`;
      consensus = `### Knowledge Matrix\n\n`;
      sourcesList.forEach(s => {
        consensus += `- **${s.title}** (${s.type}): [Link](${s.url || '#'}) \n`;
      });
      synthesis += `\n${contradictions}\n${consensus}`;
    }

    const outputFile = options.output || path.join(process.cwd(), `fusion_${topic.toLowerCase().replace(/[^a-z0-9]/g, '_')}.md`);
    
    let report = `# Knowledge Fusion Report: ${topic}\n\n`;
    report += `Generated on: ${new Date().toLocaleDateString()}\n\n`;
    report += `## Consolidated Knowledge\n${synthesis}\n\n`;
    report += `## Citations & Sources Fused\n`;
    sourcesList.forEach((s, idx) => {
      report += `${idx+1}. **${s.title}** (${s.type}) - URL: ${s.url || 'Local source'}\n`;
    });

    fs.writeFileSync(outputFile, report);
    return outputFile;
  }
};
