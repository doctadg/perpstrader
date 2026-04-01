/**
 * Narrative Scanner — barrel export
 */

export { NarrativeScanner } from './narrative-scanner.js';
export type {
  Narrative,
  ScoredNarrative,
  ScannerConfig,
  SourceResult,
  NarrativeSource,
  SourceType,
} from './types.js';
export { DEFAULT_CONFIG } from './types.js';
export { TwitterSource } from './sources/twitter.js';
export { RedditSource } from './sources/reddit.js';
export { NewsSource } from './sources/news.js';
