import fs from 'fs';
import path from 'path';
import axios from 'axios';
import { dbService } from './db.js';

export const graphService = {
  // Extract entities & concepts from text
  extractEntitiesRuleBased(text) {
    const words = text.match(/\b[A-Z][a-zA-Z0-9_]{2,}\b/g) || [];
    const stopWords = new Set(['The', 'And', 'For', 'But', 'You', 'They', 'This', 'That', 'With', 'From', 'Then']);
    const counts = {};

    words.forEach(w => {
      if (stopWords.has(w)) return;
      counts[w] = (counts[w] || 0) + 1;
    });

    return Object.entries(counts)
      .filter(([_, count]) => count >= 2)
      .map(([word]) => word);
  },

  async extractEntitiesOllama(text, ollamaUrl = 'http://127.0.0.1:11434', model = 'qwen2.5') {
    try {
      const prompt = `Extract a list of entities (people, technologies, concepts, organizations) and relationships between them from the following text.
Respond ONLY with a JSON object in this format:
{
  "entities": ["entity1", "entity2"],
  "relationships": [{"entity": "entity1", "relationship": "relationship_type", "target": "entity2"}]
}
Text:
${text.slice(0, 1500)}`;

      const response = await axios.post(`${ollamaUrl}/api/generate`, {
        model,
        prompt,
        format: 'json',
        stream: false
      });

      return JSON.parse(response.data.response);
    } catch (err) {
      return null;
    }
  },

  async generateGraph(options = {}) {
    const documents = dbService.getAllDocuments();
    const nodes = [];
    const relationships = [];
    const entityMap = new Map();

    console.log(`Analyzing ${documents.length} ingested sources to generate knowledge graph...`);

    for (const doc of documents) {
      nodes.push({ id: `doc_${doc.id}`, label: doc.title, type: 'document' });

      const stmt = dbService.db.prepare('SELECT text FROM chunks WHERE document_id = ?');
      const chunks = stmt.all(doc.id);
      const docText = chunks.map(c => c.text).join('\n');
      
      let graphData = null;
      if (options.useOllama) {
        graphData = await this.extractEntitiesOllama(docText, options.ollamaUrl, options.ollamaModel);
      }

      if (!graphData) {
        const entities = this.extractEntitiesRuleBased(docText);
        graphData = {
          entities,
          relationships: entities.slice(0, 5).map((ent, idx, arr) => {
            if (idx === 0) return null;
            return { entity: arr[idx - 1], relationship: 'relates_to', target: ent };
          }).filter(Boolean)
        };
      }

      // Populate entities
      graphData.entities.forEach(ent => {
        const entId = `ent_${ent.toLowerCase().replace(/[^a-z0-9]/g, '_')}`;
        if (!entityMap.has(entId)) {
          entityMap.set(entId, ent);
          nodes.push({ id: entId, label: ent, type: 'entity' });
        }
        relationships.push({
          entity: doc.title,
          relationship: 'mentions',
          target: ent
        });
      });

      // Populate relationships
      graphData.relationships.forEach(rel => {
        relationships.push({
          entity: rel.entity || rel.source,
          relationship: rel.relationship || 'relates_to',
          target: rel.target
        });
      });
    }

    return { nodes, relationships };
  },

  toMermaid(graph) {
    let mermaid = 'graph TD\n';
    
    // Add unique node IDs mapping
    const nodeIds = {};
    graph.nodes.forEach(n => {
      const safeId = n.id.replace(/[^a-zA-Z0-9_]/g, '_');
      nodeIds[n.label] = safeId;
      const shape = n.type === 'document' ? `["${n.label}"]` : `(("${n.label}"))`;
      mermaid += `  ${safeId}${shape}\n`;
    });

    graph.relationships.forEach(r => {
      const srcId = nodeIds[r.entity] || `ent_${r.entity.toLowerCase().replace(/[^a-z0-9]/g, '_')}`;
      const tgtId = nodeIds[r.target] || `ent_${r.target.toLowerCase().replace(/[^a-z0-9]/g, '_')}`;
      mermaid += `  ${srcId} -->|"${r.relationship}"| ${tgtId}\n`;
    });

    return mermaid;
  },

  toObsidian(graph) {
    const vaultPath = path.join(process.cwd(), 'vidilearn_obsidian_vault');
    if (!fs.existsSync(vaultPath)) fs.mkdirSync(vaultPath, { recursive: true });

    graph.nodes.forEach(n => {
      const fileName = `${n.label.replace(/[/\\?%*:|"<>]/g, '-')}.md`;
      const filePath = path.join(vaultPath, fileName);
      let content = `# ${n.label}\n\nType: ${n.type}\n\n## Connections\n`;
      
      const outgoing = graph.relationships.filter(r => r.entity === n.label);
      outgoing.forEach(r => {
        content += `- [[${r.target}]] (${r.relationship})\n`;
      });

      fs.writeFileSync(filePath, content);
    });

    return vaultPath;
  }
};
