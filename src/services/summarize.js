import axios from 'axios';

// High-frequency signal words that indicate important/hook moments
const HOOK_WORDS = new Set([
  'important','remember','key','crucial','significant','finally','imagine','literally',
  'insane','secret','hack','never','always','warning','must','need','critical','first',
  'last','actually','honestly','truth','mistake','wrong','problem','solution','tip',
  'trick','lesson','learned','discovered','found','realized','surprised','shocked'
]);

const TRANSITION_WORDS = new Set([
  'so','now','but','however','therefore','because','which','means','results','allows',
  'enables','creates','produces','defines','shows','explains','demonstrates','proves'
]);

export const summarizeService = {
  async summarize(text, mode = 'bullet', options = {}) {
    if (!text || text.trim().length === 0) {
      throw new Error("Empty text content. Cannot summarize.");
    }

    if (options.useOllama) {
      return await this.summarizeWithOllama(text, mode, options.ollamaUrl, options.ollamaModel);
    }

    return this.fallbackSummarize(text, mode);
  },

  async summarizeWithOllama(text, mode, url = 'http://127.0.0.1:11434', model = 'qwen2.5') {
    let systemPrompt = '';
    switch (mode.toLowerCase()) {
      case 'bullet':
        systemPrompt = 'Summarize the text in 5-7 concise bullet points using "•" prefix. Focus on key insights, facts, and actionable takeaways.';
        break;
      case 'twitter':
      case 'twitter-thread':
        systemPrompt = 'Convert into an engaging Twitter/X thread. Number each tweet as "1/", "2/", etc. Max 280 chars per tweet. Hook with the first tweet. End with a call to action.';
        break;
      case 'blog':
        systemPrompt = 'Write a structured blog post with: a compelling H2 title, intro paragraph, 3 H3 sections with content, and a conclusion with takeaways.';
        break;
      case 'notes':
        systemPrompt = 'Create Cornell-style study notes: MAIN NOTES section (key concepts), CUES column (questions from margins), SUMMARY section (2-3 sentence synthesis).';
        break;
      case 'podcast-recap':
        systemPrompt = 'Write a podcast episode recap: Host/Speakers, Episode Flow (3 bullet arc), Key Quotes (2-3), Main Takeaways (3 bullets), Who Should Listen.';
        break;
      default:
        systemPrompt = 'Summarize the text concisely in bullet points.';
    }

    try {
      const response = await axios.post(`${url}/api/generate`, {
        model,
        system: systemPrompt,
        prompt: `Text:\n${text.slice(0, 8000)}`,
        stream: false
      });
      return response.data.response;
    } catch (err) {
      return `${this.fallbackSummarize(text, mode)}\n\n*(Ollama connection failed. Displaying local summary)*`;
    }
  },

  // Extract key sentences using TF-IDF-like word frequency scoring
  _extractTopSentences(text, count = 7) {
    const clean = text.replace(/\s+/g, ' ').replace(/<[^>]+>/g, '');
    const sentences = clean.match(/[^.!?]+[.!?]+/g) || [clean];
    if (sentences.length <= count) return sentences.map(s => s.trim());

    const words = clean.toLowerCase().match(/\b\w{4,}\b/g) || [];
    const stopWords = new Set(['this','that','with','from','then','they','have','were',
      'about','when','where','what','which','will','your','their','there','these','those',
      'also','been','into','over','after','before','other','just','more','than','some']);
    const freqs = {};
    words.forEach(w => {
      if (!stopWords.has(w)) freqs[w] = (freqs[w] || 0) + 1;
    });

    const scored = sentences.map((s, idx) => {
      const sWords = s.toLowerCase().match(/\b\w{4,}\b/g) || [];
      let score = sWords.reduce((sum, sw) => sum + (freqs[sw] || 0), 0);
      // Boost sentences with hook/transition words
      const lower = s.toLowerCase();
      if ([...HOOK_WORDS].some(w => lower.includes(w))) score += 10;
      if ([...TRANSITION_WORDS].some(w => lower.includes(w))) score += 3;
      // Prefer earlier sentences (intro) and later (conclusion)
      if (idx < 3) score *= 1.2;
      if (idx > sentences.length - 4) score *= 1.1;
      return { sentence: s.trim(), index: idx, score };
    });

    return scored
      .sort((a, b) => b.score - a.score)
      .slice(0, count)
      .sort((a, b) => a.index - b.index)
      .map(s => s.sentence);
  },

  fallbackSummarize(text, mode) {
    const topSentences = this._extractTopSentences(text, 7);
    const title = text.match(/^#+\s*(.+)/m)?.[1] || 'Summary';

    switch (mode.toLowerCase()) {
      case 'bullet': {
        const bullets = topSentences.slice(0, 6).map(s => `• ${s}`).join('\n');
        return `## Key Points\n\n${bullets}`;
      }

      case 'twitter':
      case 'twitter-thread': {
        // Split into tweet-length chunks (≤280 chars)
        const tweets = [];
        const hook = topSentences[0];
        tweets.push(`1/ 🧵 ${hook.slice(0, 240)}`);
        topSentences.slice(1, 5).forEach((s, i) => {
          const num = i + 2;
          const chars = s.length > 250 ? s.slice(0, 247) + '...' : s;
          tweets.push(`${num}/ ${chars}`);
        });
        tweets.push(`${tweets.length + 1}/ 💡 TL;DR: ${topSentences[topSentences.length - 1].slice(0, 200)}`);
        tweets.push(`${tweets.length + 1}/ Follow for more AI/ML insights 🔁`);
        return `## Twitter Thread\n\n${tweets.join('\n\n')}`;
      }

      case 'blog': {
        const intro = topSentences.slice(0, 2).join(' ');
        const body1 = topSentences.slice(2, 4).join(' ');
        const body2 = topSentences.slice(4, 6).join(' ');
        const conclusion = topSentences[topSentences.length - 1];
        return `## ${title}\n\n### Introduction\n${intro}\n\n### Core Concepts\n${body1}\n\n### Key Insights\n${body2}\n\n### Conclusion\n${conclusion}\n\n**Takeaway**: ${topSentences[2]?.slice(0, 150) || conclusion}`;
      }

      case 'notes': {
        const cues = topSentences.slice(0, 5).map((s, i) =>
          `**Q${i+1}**: ${s.replace(/\b(\w+)\b.*/, '$1')}...?`
        ).join('\n');
        const mainNotes = topSentences.map((s, i) => `${i+1}. ${s}`).join('\n');
        const summary = topSentences.slice(0, 2).join(' ').slice(0, 300);
        return `## Cornell Notes: ${title}\n\n### 📝 Main Notes\n${mainNotes}\n\n### ❓ Cues / Questions\n${cues}\n\n### 📌 Summary\n${summary}`;
      }

      case 'podcast-recap': {
        const keyPoints = topSentences.slice(0, 5).map(s => `  • ${s}`).join('\n');
        const quote = topSentences[1] || topSentences[0];
        return `## 🎙️ Episode Recap: ${title}\n\n### Episode Flow\n${topSentences.slice(0, 3).map((s, i) => `${i+1}. ${s.slice(0, 120)}`).join('\n')}\n\n### Key Quote\n> "${quote.slice(0, 200)}"\n\n### Main Takeaways\n${keyPoints}\n\n### Who Should Listen\nAnyone interested in AI, machine learning, and modern technology trends.`;
      }

      default: {
        const bullets = topSentences.slice(0, 5).map(s => `• ${s}`).join('\n');
        return `## Summary\n\n${bullets}`;
      }
    }
  }
};
