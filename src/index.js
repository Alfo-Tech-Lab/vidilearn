import { youtubeExtractor } from './extractors/youtube.js';
import { articleExtractor } from './extractors/article.js';
import { storageService } from './services/storage.js';
import { detectionService } from './services/detection.js';
import { dbService } from './services/db.js';
import { embeddingService } from './services/embedding.js';
import { ingestionService } from './services/ingestion.js';
import { graphService } from './services/graph.js';
import { researchService } from './services/research.js';
import { watcherService } from './services/watcher.js';
import { templatesService } from './services/templates.js';
import { clipsService } from './services/clips.js';
import { summarizeService } from './services/summarize.js';
import { studyService } from './services/study.js';
import { datasetService } from './services/dataset.js';
import { tuiService } from './services/tui.js';
import { fusionService } from './services/fusion.js';
import { liveService } from './services/live.js';
import { testingService } from './services/testing.js';

export {
  youtubeExtractor,
  articleExtractor,
  storageService,
  detectionService,
  dbService,
  embeddingService,
  ingestionService,
  graphService,
  researchService,
  watcherService,
  templatesService,
  clipsService,
  summarizeService,
  studyService,
  datasetService,
  tuiService,
  fusionService,
  liveService,
  testingService
};