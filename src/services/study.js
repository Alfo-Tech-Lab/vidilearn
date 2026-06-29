import fs from 'fs';
import path from 'path';
import axios from 'axios';

// NLP keyword extraction for real flashcard generation
function extractKeyTerms(text) {
  // Extract terms that look like definitions or concepts
  const definitions = [];
  
  // Pattern: "X is/are Y" → front=X, back=Y
  const defPattern = /\b([A-Z][a-zA-Z\s]{2,30}(?:RL|AI|ML|LLM|RAG)?)\s+(?:is|are|means|refers to|defined as)\s+([^.!?]{10,120}[.!?])/g;
  let m;
  while ((m = defPattern.exec(text)) !== null) {
    definitions.push({ front: m[1].trim(), back: m[2].trim() });
  }

  // Pattern: numbered lists "1. Key term: explanation"
  const listPattern = /\d+\.\s*\*{0,2}([^:\n]{5,40})\*{0,2}[:\-]\s*([^.\n]{10,120})/g;
  while ((m = listPattern.exec(text)) !== null) {
    definitions.push({ front: m[1].trim(), back: m[2].trim() });
  }

  // Pattern: "## Term\nExplanation"
  const headingPattern = /#{1,3}\s+([^\n]{5,60})\n+([^\n#]{20,200})/g;
  while ((m = headingPattern.exec(text)) !== null) {
    definitions.push({ front: `What is "${m[1].trim()}"?`, back: m[2].trim() });
  }

  // Bold terms: **term** → term: next sentence
  const boldPattern = /\*\*([^*]{3,40})\*\*[:\s-]*([^.!?\n]{15,150}[.!?]?)/g;
  while ((m = boldPattern.exec(text)) !== null) {
    definitions.push({ front: m[1].trim(), back: m[2].trim() });
  }

  return definitions;
}

function extractQuizFromText(sentences) {
  const quiz = [];
  
  // Find sentences with factual claims
  const factSentences = sentences.filter(s => 
    /\b(algorithm|technique|method|approach|model|system|framework|tool|library|concept)\b/i.test(s) &&
    s.length > 30 && s.length < 200
  );

  factSentences.slice(0, 5).forEach((s, i) => {
    // Extract key noun as answer
    const words = s.match(/\b([A-Z][a-z]+(?:[-][A-Z][a-z]+)*|\b[A-Z]{2,10}\b)/g) || ['concept'];
    const answer = words[0] || 'the main concept';
    const distractors = ['alternative approach', 'unrelated technique', 'deprecated method'];
    const options = [answer, ...distractors].sort(() => Math.random() - 0.5);
    
    quiz.push({
      question: s.trim().replace(/\.$/, '') + '?',
      options: options.slice(0, 4),
      answer
    });
  });

  // Fallback quiz if no factual sentences
  if (quiz.length === 0) {
    quiz.push({
      question: "What is the main subject discussed in this content?",
      options: ["The main topic and its core concepts", "Unrelated information", "A deprecated feature", "Marketing material"],
      answer: "The main topic and its core concepts"
    });
  }

  return quiz;
}

export const studyService = {
  async generateStudyMaterials(text, title, options = {}) {
    console.log(`Generating study guide and quiz cards for: ${title}`);
    
    let studyData = null;
    if (options.useOllama) {
      studyData = await this.generateWithOllama(text, options.ollamaUrl, options.ollamaModel);
    }

    if (!studyData) {
      studyData = this.generateFallback(text, title);
    }

    const safeTitle = title.toLowerCase().replace(/[^a-z0-9]/g, '_').slice(0, 40);
    const outputDir = path.join(process.cwd(), `study_${Date.now()}_${safeTitle}`);
    fs.mkdirSync(outputDir, { recursive: true });

    // Save all outputs
    fs.writeFileSync(path.join(outputDir, 'flashcards.json'), JSON.stringify(studyData.flashcards, null, 2));
    fs.writeFileSync(path.join(outputDir, 'quiz.json'), JSON.stringify(studyData.quiz, null, 2));
    
    // Anki TSV (front\tback)
    const ankiTsv = studyData.flashcards.map(c => `${c.front}\t${c.back}`).join('\n');
    fs.writeFileSync(path.join(outputDir, 'anki_deck.tsv'), ankiTsv);

    // Obsidian Notes with structured sections
    let obsidianNotes = `# Study Guide: ${title}\n\n`;
    obsidianNotes += `> Generated: ${new Date().toLocaleDateString()}\n\n`;
    obsidianNotes += `## 📚 Key Takeaways\n${studyData.notes}\n\n`;
    obsidianNotes += `## 🃏 Flashcards (${studyData.flashcards.length} cards)\n\n`;
    studyData.flashcards.forEach((c, idx) => {
      obsidianNotes += `### Card ${idx + 1}\n`;
      obsidianNotes += `**Q**: ${c.front}\n`;
      obsidianNotes += `**A**: %%${c.back}%%\n\n`;
    });
    obsidianNotes += `## 🧠 Quiz (${studyData.quiz.length} questions)\n\n`;
    studyData.quiz.forEach((q, idx) => {
      obsidianNotes += `### Q${idx + 1}: ${q.question}\n`;
      q.options.forEach((opt, i) => {
        const marker = opt === q.answer ? '✅' : '○';
        obsidianNotes += `${marker} ${opt}\n`;
      });
      obsidianNotes += '\n';
    });

    fs.writeFileSync(path.join(outputDir, 'obsidian_notes.md'), obsidianNotes);
    
    return outputDir;
  },

  async generateWithOllama(text, url = 'http://127.0.0.1:11434', model = 'qwen2.5') {
    try {
      const prompt = `Extract study materials from this text. Return ONLY valid JSON:
{
  "flashcards": [{"front": "specific question about a concept", "back": "precise answer"}],
  "quiz": [{"question": "question?", "options": ["a","b","c","d"], "answer": "correct option"}],
  "notes": "markdown formatted study notes with bullet points"
}
Rules:
- Minimum 5 flashcards, 3 quiz questions
- Questions must be specific to the content (no generic questions)
- Answers must come directly from the text

Text:
${text.slice(0, 4000)}`;

      const response = await axios.post(`${url}/api/generate`, {
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

  generateFallback(text, title = 'Document') {
    const clean = text.replace(/<[^>]+>/g, '').replace(/\s+/g, ' ');
    const sentences = clean.match(/[^.!?]+[.!?]+/g) || [clean];
    
    // ── Real flashcard generation from definitions/terms ─────────────────
    let flashcards = extractKeyTerms(text);
    
    // If structured terms found, use them; else extract sentence-based cards
    if (flashcards.length < 3) {
      // Sentence-based: high-information sentences become cards
      const highInfoSentences = sentences
        .filter(s => s.length > 50 && /\b(is|are|means|defined|called|known as|allows|enables|provides|requires)\b/i.test(s))
        .slice(0, 8);
      
      highInfoSentences.forEach((s, i) => {
        const words = s.match(/\b\w{5,}\b/g) || [];
        const keyWord = words.find(w => /^[A-Z]/.test(w)) || words[0] || `concept ${i + 1}`;
        flashcards.push({
          front: `What does the text say about "${keyWord}"?`,
          back: s.trim()
        });
      });
    }

    // Ensure at least 3 cards
    if (flashcards.length < 3) {
      sentences.slice(0, 5).forEach((s, i) => {
        if (flashcards.length < 5) {
          flashcards.push({
            front: `Key point #${i + 1} from ${title}:`,
            back: s.trim()
          });
        }
      });
    }

    flashcards = flashcards.slice(0, 10); // cap at 10

    // ── Real quiz generation ──────────────────────────────────────────────
    const quiz = extractQuizFromText(sentences);

    // ── Structured notes ─────────────────────────────────────────────────
    const topSentences = sentences.slice(0, Math.min(7, sentences.length));
    const notes = `### 📖 ${title}\n\n` +
      topSentences.map((s, i) => `${i + 1}. ${s.trim()}`).join('\n');

    return { flashcards, quiz, notes };
  }
};
