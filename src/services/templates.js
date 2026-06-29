import fs from 'fs';
import path from 'path';

export const templatesService = {
  createTemplate(type, targetDir = '.') {
    const root = path.join(process.cwd(), targetDir, `vidilearn_template_${type}`);
    if (fs.existsSync(root)) {
      throw new Error(`Directory ${root} already exists.`);
    }

    fs.mkdirSync(root, { recursive: true });

    switch (type.toLowerCase()) {
      case 'rag':
        this.createRagTemplate(root);
        break;
      case 'podcast':
        this.createPodcastTemplate(root);
        break;
      case 'youtube-course':
        this.createYoutubeCourseTemplate(root);
        break;
      case 'newsletter':
        this.createNewsletterTemplate(root);
        break;
      default:
        throw new Error(`Unknown template type: ${type}. Choose from: rag, podcast, youtube-course, newsletter`);
    }

    return root;
  },

  createRagTemplate(dir) {
    fs.mkdirSync(path.join(dir, 'data'), { recursive: true });
    
    // JS RAG script
    const scriptContent = `import { dbService } from '../../src/services/db.js';
import { embeddingService } from '../../src/services/embedding.js';
import axios from 'axios';

async function runRAG(query) {
  console.log(\`Query: "\${query}"\`);
  
  // 1. Get embedding of query
  const queryEmbedArr = await embeddingService.embed(query);
  const queryEmbedding = queryEmbedArr[0].embedding;

  // 2. Query local hybrid database
  const results = await dbService.search(query, queryEmbedding, 3);
  
  console.log('\\n--- Retrieved Context ---');
  results.forEach((r, idx) => {
    console.log(\`[Source \${idx+1}]: \${r.title} (\${r.source_type})\`);
    console.log(\`Text: \${r.text.slice(0, 150)}...\`);
  });

  // 3. Synthesize via local LLM (Ollama)
  const contextText = results.map(r => r.text).join('\\n\\n');
  const prompt = \`Context:\\n\${contextText}\\n\\nQuestion: \${query}\\nAnswer:\`;

  try {
    const response = await axios.post('http://127.0.0.1:11434/api/generate', {
      model: 'qwen2.5',
      prompt: prompt,
      stream: false
    });
    console.log('\\n--- Synthesized Answer ---');
    console.log(response.data.response);
  } catch (err) {
    console.warn('\\nOllama synthesis skipped: Make sure Ollama is running.');
  }
}

runRAG("What are agentic workflows?");
`;
    fs.writeFileSync(path.join(dir, 'rag_example.js'), scriptContent);
    fs.writeFileSync(path.join(dir, 'README.md'), `# Local RAG Template\n\nIngest documents using \`vidilearn ingest\` and then execute this script:\n\n\`\`\`bash\nnode rag_example.js\n\`\`\``);
  },

  createPodcastTemplate(dir) {
    fs.mkdirSync(path.join(dir, 'podcasts'), { recursive: true });
    const scriptContent = `import { ingestionService } from '../../src/services/ingestion.js';

async function ingestPodcasts() {
  const podcastRss = 'https://lexfridman.com/feed/podcast/'; // Example RSS
  console.log('Ingesting recent podcast metadata & transcripts...');
  
  const results = await ingestionService.ingest(podcastRss, {
    embedProvider: 'transformers'
  });
  
  console.log(\`Successfully ingested \${results.length} podcast episodes!\`);
}

ingestPodcasts();
`;
    fs.writeFileSync(path.join(dir, 'ingest_podcasts.js'), scriptContent);
    fs.writeFileSync(path.join(dir, 'README.md'), `# Local Podcast Ingestion\n\nRun the script to pull and parse a podcast RSS feed:\n\n\`\`\`bash\nnode ingest_podcasts.js\n\`\`\``);
  },

  createYoutubeCourseTemplate(dir) {
    fs.mkdirSync(path.join(dir, 'syllabus'), { recursive: true });
    const configContent = {
      course_name: "Self-Supervised Learning Course",
      playlist_url: "https://www.youtube.com/playlist?list=PLtBw6njHN5-rwp5__7HN0FyYLtYj5kpGv",
      modules: [
        { name: "Module 1: Introduction", videos_limit: 2 },
        { name: "Module 2: Advanced Topics", videos_limit: 3 }
      ]
    };
    fs.writeFileSync(path.join(dir, 'course_config.json'), JSON.stringify(configContent, null, 2));
    fs.writeFileSync(path.join(dir, 'README.md'), `# YouTube Course Syllabus Builder\n\nConfigure \`course_config.json\` and execute course pipeline scripts to extract transcripts and generate structured syllabus notes.`);
  },

  createNewsletterTemplate(dir) {
    fs.mkdirSync(path.join(dir, 'newsletters'), { recursive: true });
    const templateScript = `import { dbService } from '../../src/services/db.js';
import fs from 'fs';

function generateNewsletter() {
  const documents = dbService.getAllDocuments().slice(0, 5);
  let newsletter = '# Weekly AI Insights Newsletter\\n\\n';
  
  documents.forEach(doc => {
    newsletter += \`## \${doc.title}\\n- **Source**: \${doc.url || 'Local File'}\\n- **Ingested**: \${doc.created_at}\\n\\n\`;
  });

  fs.writeFileSync('newsletters/newsletter_draft.md', newsletter);
  console.log('Newsletter draft written to newsletters/newsletter_draft.md');
}

generateNewsletter();
`;
    fs.writeFileSync(path.join(dir, 'generate_newsletter.js'), templateScript);
    fs.writeFileSync(path.join(dir, 'README.md'), `# Automated Newsletter Draft Generator\n\nGenerates custom newsletter digests from recently ingested data sources.`);
  }
};
