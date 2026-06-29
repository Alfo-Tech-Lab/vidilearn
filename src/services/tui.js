import readline from 'readline';
import chalk from 'chalk';
import { dbService } from './db.js';
import { embeddingService } from './embedding.js';
import { graphService } from './graph.js';
import { summarizeService } from './summarize.js';

export const tuiService = {
  start() {
    const rl = readline.createInterface({
      input: process.stdin,
      output: process.stdout
    });

    console.clear();
    console.log(chalk.bold.green('=================================================='));
    console.log(chalk.bold.green('       VIDILEARN OFFLINE-FIRST AI KNOWLEDGE BRAIN'));
    console.log(chalk.bold.green('=================================================='));
    console.log(`Loaded local memory path: ${chalk.cyan('~/.vidilearn/vidilearn.db')}\n`);

    const showMenu = () => {
      console.log(chalk.bold('\nCommands menu:'));
      console.log(`1. ${chalk.yellow('list')}      - List all ingested documents`);
      console.log(`2. ${chalk.yellow('search')}    - Query memory (keyword + semantic)`);
      console.log(`3. ${chalk.yellow('ask')}       - Ask a question to your local brain`);
      console.log(`4. ${chalk.yellow('summary')}   - Generate summary of a document`);
      console.log(`5. ${chalk.yellow('graph')}     - View knowledge graph`);
      console.log(`6. ${chalk.yellow('exit')}      - Return to terminal`);
      
      rl.question(chalk.green('\nSelect option (1-6) or type command: '), async (input) => {
        const cmd = input.trim().toLowerCase();
        
        if (cmd === '1' || cmd === 'list') {
          const docs = dbService.getAllDocuments();
          console.log(chalk.bold('\n--- Ingested Documents ---'));
          if (docs.length === 0) {
            console.log('No documents found. Try running "vidilearn ingest" first.');
          } else {
            docs.forEach(doc => {
              console.log(`ID: ${chalk.yellow(doc.id)} | Title: ${chalk.green(doc.title)} (${doc.source_type})`);
            });
          }
          showMenu();
        } else if (cmd === '2' || cmd === 'search') {
          rl.question('\nEnter search query: ', async (query) => {
            if (query.trim()) {
              const queryEmbedArr = await embeddingService.embed(query);
              const results = await dbService.search(query, queryEmbedArr[0].embedding, 3);
              console.log(chalk.bold('\n--- Top 3 Results ---'));
              results.forEach((r, idx) => {
                console.log(`\n${idx+1}. ${chalk.green(r.title)} | Score: ${r.score.toFixed(4)}`);
                console.log(chalk.dim(r.text));
              });
            }
            showMenu();
          });
        } else if (cmd === '3' || cmd === 'ask') {
          rl.question('\nEnter question: ', async (q) => {
            if (q.trim()) {
              const queryEmbedArr = await embeddingService.embed(q);
              const results = await dbService.search(q, queryEmbedArr[0].embedding, 4);
              console.log(chalk.bold('\n--- Retrieved Context ---'));
              results.forEach((r, idx) => {
                console.log(`[${idx+1}] ${r.title}: ${r.text.slice(0, 150)}...`);
              });
              // Simple synthesized explanation fallback
              console.log(chalk.bold('\n--- Brain Synthesis ---'));
              console.log(`Based on the matching docs, the top relevance points to ${chalk.green(results[0]?.title || 'Unknown')}.`);
            }
            showMenu();
          });
        } else if (cmd === '4' || cmd === 'summary') {
          rl.question('\nEnter Document ID: ', async (idStr) => {
            const id = parseInt(idStr);
            const stmt = dbService.db.prepare("SELECT text FROM chunks WHERE document_id = ?");
            const chunks = stmt.all(id);
            if (chunks.length === 0) {
              console.log(chalk.red('Document not found.'));
            } else {
              const text = chunks.map(c => c.text).join('\n');
              const summary = await summarizeService.summarize(text, 'bullet');
              console.log(chalk.bold('\n--- Document Summary ---'));
              console.log(summary);
            }
            showMenu();
          });
        } else if (cmd === '5' || cmd === 'graph') {
          const graph = await graphService.generateGraph();
          const mermaid = graphService.toMermaid(graph);
          console.log(chalk.bold('\n--- Mermaid Graph ---'));
          console.log(mermaid);
          showMenu();
        } else if (cmd === '6' || cmd === 'exit') {
          rl.close();
        } else {
          console.log(chalk.red('Invalid option.'));
          showMenu();
        }
      });
    };

    showMenu();
  }
};
