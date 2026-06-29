// Clips analysis: real transcript density + keyword intensity scoring

const HOOK_PATTERNS = [
  /\b(important|key|crucial|critical|must|remember|never forget|always|secret|hack)\b/i,
  /\b(insane|mind-blowing|incredible|amazing|shocking|surprising|unexpected)\b/i,
  /\b(problem|mistake|wrong|fail|broke|error|issue|bug|challenge)\b/i,
  /\b(solution|answer|fix|result|trick|tip|method|technique|approach)\b/i,
  /\b(first|second|third|finally|last|ultimately|in conclusion|to summarize)\b/i,
  /\b(imagine|picture this|think about|consider|what if|here's the thing)\b/i,
];

const QUESTION_PATTERN = /\?/;
const NUMBERS_PATTERN = /\b\d+(\.\d+)?(%|x|times|percent|million|billion|k)\b/i;
const PAUSE_PATTERN = /\b(so|now|look|right|okay|listen|wait|actually|basically)\b/i;

export const clipsService = {
  analyzeClips(segments) {
    if (!segments || segments.length === 0) {
      throw new Error("No transcript segments available for clips analysis.");
    }

    console.log(`Analyzing ${segments.length} transcript segments for pacing and keyword density...`);

    // ── Step 1: Compute per-segment signals ──────────────────────────────
    const analyzed = segments.map((seg, idx) => {
      const text = seg.text || '';
      const words = text.trim().split(/\s+/).filter(Boolean);
      const duration = Math.max(seg.duration || 5, 1);
      const wps = words.length / duration; // words per second

      let intensity = 0;

      // Hook word matches
      HOOK_PATTERNS.forEach(pat => {
        if (pat.test(text)) intensity += 2;
      });

      // Questions are hooks
      if (QUESTION_PATTERN.test(text)) intensity += 1.5;

      // Statistics / numbers = high-value content
      if (NUMBERS_PATTERN.test(text)) intensity += 1.5;

      // Pause/emphasis markers
      const pauseMatches = (text.match(PAUSE_PATTERN) || []).length;
      intensity += pauseMatches * 0.5;

      // Fast speech (>2.5 wps) = energetic moment
      if (wps > 2.5) intensity += 1;

      // Long sentences = high-density information
      if (words.length > 20) intensity += 0.5;

      return {
        index: idx,
        text,
        offset: typeof seg.offset === 'number' ? seg.offset : idx * 5,
        duration,
        wps: parseFloat(wps.toFixed(2)),
        intensity: parseFloat(intensity.toFixed(2)),
        score: parseFloat((intensity + (wps > 2.5 ? 1 : 0)).toFixed(2))
      };
    });

    // ── Step 2: Sliding window smoothing (3-segment windows) ─────────────
    const smoothed = analyzed.map((seg, idx) => {
      const window = analyzed.slice(Math.max(0, idx - 1), idx + 2);
      const avgScore = window.reduce((sum, s) => sum + s.score, 0) / window.length;
      return { ...seg, smoothedScore: parseFloat(avgScore.toFixed(2)) };
    });

    // ── Step 3: Dynamic threshold — top 25% of segments ──────────────────
    const scores = smoothed.map(s => s.smoothedScore).sort((a, b) => a - b);
    const p75 = scores[Math.floor(scores.length * 0.75)] || 1.5;
    const threshold = Math.max(1.5, p75 * 0.8);

    // ── Step 4: Group adjacent high-scoring segments into clips ──────────
    const clips = [];
    let currentClip = null;

    for (const seg of smoothed) {
      if (seg.smoothedScore >= threshold) {
        if (!currentClip) {
          currentClip = {
            startTime: seg.offset,
            endTime: seg.offset + seg.duration,
            texts: [seg.text],
            intensitySum: seg.intensity,
            segmentsCount: 1
          };
        } else {
          // Merge if gap is small (< 3 seconds)
          if (seg.offset - currentClip.endTime <= 3) {
            currentClip.endTime = seg.offset + seg.duration;
            currentClip.texts.push(seg.text);
            currentClip.intensitySum += seg.intensity;
            currentClip.segmentsCount++;
          } else {
            clips.push(currentClip);
            currentClip = {
              startTime: seg.offset,
              endTime: seg.offset + seg.duration,
              texts: [seg.text],
              intensitySum: seg.intensity,
              segmentsCount: 1
            };
          }
        }
      } else {
        if (currentClip) {
          clips.push(currentClip);
          currentClip = null;
        }
      }
    }
    if (currentClip) clips.push(currentClip);

    // ── Step 5: If no clips above threshold, return top 3 by score ───────
    if (clips.length === 0) {
      const top3 = [...smoothed]
        .sort((a, b) => b.smoothedScore - a.smoothedScore)
        .slice(0, 3);
      top3.forEach(seg => clips.push({
        startTime: seg.offset,
        endTime: seg.offset + seg.duration,
        texts: [seg.text],
        intensitySum: seg.intensity,
        segmentsCount: 1
      }));
    }

    // ── Step 6: Sort by intensity and format output ───────────────────────
    return clips
      .sort((a, b) => b.intensitySum - a.intensitySum)
      .slice(0, 5)
      .map((clip, idx) => {
        const clipDuration = Math.round(clip.endTime - clip.startTime);
        const combinedText = clip.texts.join(' ');
        // Confidence: based on intensity relative to max possible
        const confidence = Math.min(0.98, 0.45 + (clip.intensitySum / (clip.segmentsCount * 10)));
        return {
          id: idx + 1,
          startTime: this.formatTime(clip.startTime),
          endTime: this.formatTime(clip.endTime),
          duration: `${clipDuration}s`,
          intensityScore: parseFloat(clip.intensitySum.toFixed(2)),
          confidence: parseFloat(confidence.toFixed(2)),
          transcript: combinedText.slice(0, 300) + (combinedText.length > 300 ? '...' : '')
        };
      });
  },

  formatTime(seconds) {
    const mins = Math.floor(seconds / 60);
    const secs = Math.floor(seconds % 60);
    return `${mins.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`;
  }
};
