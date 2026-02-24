import BetterSqlite3 from 'better-sqlite3';
import crypto from 'crypto';
import configManager from '../shared/config';
import logger from '../shared/logger';
import openrouterService from '../shared/openrouter-service';
import { NewsCategory, NewsImportance, NewsSentiment } from '../shared/types';

type ClusterCategory = NewsCategory | 'GENERAL';
type TrendDirection = 'UP' | 'DOWN' | 'NEUTRAL';
type ClusterUrgency = 'CRITICAL' | 'HIGH' | 'MEDIUM' | 'LOW';

interface SourceArticle {
  id: string;
  title: string;
  content: string;
  summary: string;
  snippet: string;
  source: string;
  url: string;
  publishedAt: Date | null;
  createdAt: Date;
  eventTime: Date;
  categories: NewsCategory[];
  tags: string[];
  sentiment: NewsSentiment;
  importance: NewsImportance;
}

interface LlmEventLabel {
  topic: string;
  trendDirection: TrendDirection;
  urgency: ClusterUrgency;
  keywords: string[];
}

interface StateSnapshotRow {
  clusterKey: string;
  clusterId: string;
  lastHeatScore: number;
}

interface ClusterArticleRef {
  article: SourceArticle;
  weight: number;
  tokenSet: Set<string>;
  label?: LlmEventLabel;
}

interface ClusterAccumulator {
  key: string;
  category: ClusterCategory;
  topicVotes: Map<string, number>;
  tokenWeights: Map<string, number>;
  keywordWeights: Map<string, number>;
  tokenSet: Set<string>;
  articles: ClusterArticleRef[];
  sourceSet: Set<string>;
  weightSum: number;
  weightedSentimentSum: number;
  trendVotes: Record<TrendDirection, number>;
  urgencyVotes: Record<ClusterUrgency, number>;
  importanceVotes: Record<NewsImportance, number>;
  labeledCount: number;
  firstSeen: Date;
  lastSeen: Date;
}

interface BuildOptions {
  hours?: number;
  category?: string;
  limit?: number;
  force?: boolean;
  articleLimit?: number;
}

interface InternalBuildResult {
  generatedAt: string;
  hours: number;
  category: string;
  totalArticles: number;
  totalClusters: number;
  clusters: NewsHeatmapCluster[];
  llm: {
    enabled: boolean;
    model: string;
    labeledArticles: number;
    coverage: number;
  };
}

interface CachedBuildResult {
  createdAt: number;
  result: InternalBuildResult;
}

export interface NewsHeatmapClusterArticle {
  id: string;
  title: string;
  source: string;
  url: string;
  publishedAt: string | null;
  sentiment: NewsSentiment;
  importance: NewsImportance;
  snippet: string;
  summary: string;
}

export interface NewsHeatmapCluster {
  id: string;
  topic: string;
  topicKey: string;
  summary: string;
  category: ClusterCategory;
  keywords: string[];
  heatScore: number;
  articleCount: number;
  sourceCount: number;
  sentimentScore: number;
  sentiment: NewsSentiment;
  trendDirection: TrendDirection;
  urgency: ClusterUrgency;
  velocity: number;
  freshnessMinutes: number;
  llmCoverage: number;
  firstSeen: string;
  updatedAt: string;
  articles: NewsHeatmapClusterArticle[];
}

export interface NewsHeatmapResult {
  generatedAt: string;
  hours: number;
  category: string;
  totalArticles: number;
  totalClusters: number;
  clusters: NewsHeatmapCluster[];
  byCategory: Record<string, NewsHeatmapCluster[]>;
  llm: {
    enabled: boolean;
    model: string;
    labeledArticles: number;
    coverage: number;
  };
}

export interface NewsHeatmapTimelinePoint {
  bucketStart: string;
  bucketEnd: string;
  avgHeat: number;
  articleCount: number;
  clusterObservations: number;
  byCategory: Record<string, number>;
}

export interface NewsHeatmapTimeline {
  generatedAt: string;
  hours: number;
  bucketHours: number;
  points: NewsHeatmapTimelinePoint[];
}

const CATEGORY_SET = new Set<NewsCategory>([
  'CRYPTO',
  'STOCKS',
  'ECONOMICS',
  'GEOPOLITICS',
  'TECH',
  'COMMODITIES',
  'SPORTS',
  'FOOTBALL',
  'BASKETBALL',
  'TENNIS',
  'MMA',
  'GOLF',
]);

const HIGH_SIGNAL_TOKENS = new Set([
  'btc', 'eth', 'sol', 'xrp', 'ada', 'dot', 'avax', 'link', 'arb', 'op',
  'fed', 'fomc', 'cpi', 'pce', 'ppi', 'powell', 'ecb', 'boj', 'sec', 'etf',
  'nasdaq', 'spx', 'spy', 'dxy', 'oil', 'gold', 'silver', 'treasury', 'yield',
  'trump', 'china', 'us', 'uk', 'eu', 'opec', 'nvidia', 'tesla', 'apple',
]);

const STOP_WORDS = new Set([
  'a', 'an', 'and', 'are', 'as', 'at', 'be', 'been', 'being', 'by', 'for', 'from',
  'has', 'have', 'had', 'he', 'her', 'his', 'i', 'if', 'in', 'into', 'is', 'it',
  'its', 'of', 'on', 'or', 's', 'she', 'that', 'the', 'their', 'them', 'they',
  'this', 'to', 'was', 'were', 'will', 'with', 'you', 'your', 'new', 'latest',
  'update', 'updates', 'news', 'report', 'reports', 'says', 'say', 'amid', 'after',
  'before', 'over', 'under', 'during', 'about', 'market', 'markets', 'analysis',
]);

class NewsHeatmapService {
  private db: BetterSqlite3.Database | null = null;
  private initialized = false;
  private readonly dbPath: string;
  private readonly cacheTtlMs: number;
  private readonly maxArticleScan: number;
  private readonly maxLlmLabelArticles: number;
  private readonly llmTimeoutMs: number;
  private readonly cache = new Map<string, CachedBuildResult>();
  private readonly inFlight = new Map<string, Promise<InternalBuildResult>>();
  private readonly clusterDetailCache = new Map<string, NewsHeatmapCluster>();
  private readonly configuredLabelingModel: string;
  private llmBlockedUntil = 0;
  private llmConsecutiveEmpty = 0;

  constructor() {
    this.dbPath = process.env.NEWS_DB_PATH || './data/news.db';
    this.cacheTtlMs = Number.parseInt(process.env.NEWS_HEATMAP_CACHE_MS || '15000', 10);
    this.maxArticleScan = Number.parseInt(process.env.NEWS_HEATMAP_MAX_ARTICLES || '1200', 10);
    this.maxLlmLabelArticles = Number.parseInt(process.env.NEWS_HEATMAP_MAX_LLM_ARTICLES || '450', 10);
    this.llmTimeoutMs = Math.max(1000, Number.parseInt(process.env.NEWS_HEATMAP_LLM_TIMEOUT_MS || '8000', 10));
    this.configuredLabelingModel = configManager.get().openrouter.labelingModel;
  }

  async initialize(): Promise<void> {
    if (this.initialized) return;

    try {
      this.db = new BetterSqlite3(this.dbPath);
      this.db.pragma('journal_mode = WAL');
      this.db.pragma('busy_timeout = 5000');
      this.ensureSchema();
      this.initialized = true;
      logger.info('[NewsHeatmapService] Initialized');
    } catch (error) {
      logger.error('[NewsHeatmapService] Initialization failed:', error);
      this.db = null;
    }
  }

  private ensureSchema(): void {
    if (!this.db) return;

    this.db.exec(`
      CREATE TABLE IF NOT EXISTS news_heatmap_state (
        cluster_key TEXT PRIMARY KEY,
        cluster_id TEXT NOT NULL,
        category TEXT NOT NULL,
        topic TEXT NOT NULL,
        last_heat_score REAL NOT NULL,
        last_article_count INTEGER NOT NULL,
        last_velocity REAL NOT NULL,
        last_sentiment_score REAL NOT NULL,
        llm_coverage REAL NOT NULL,
        updated_at TEXT NOT NULL
      )
    `);

    this.db.exec(`
      CREATE TABLE IF NOT EXISTS news_heatmap_history (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        cluster_key TEXT NOT NULL,
        category TEXT NOT NULL,
        topic TEXT NOT NULL,
        heat_score REAL NOT NULL,
        article_count INTEGER NOT NULL,
        sentiment_score REAL NOT NULL,
        velocity REAL NOT NULL,
        llm_coverage REAL NOT NULL,
        timestamp TEXT NOT NULL
      )
    `);

    this.db.exec(`
      CREATE INDEX IF NOT EXISTS idx_news_heatmap_state_updated
      ON news_heatmap_state(updated_at DESC)
    `);

    this.db.exec(`
      CREATE INDEX IF NOT EXISTS idx_news_heatmap_history_time
      ON news_heatmap_history(timestamp DESC)
    `);

    this.db.exec(`
      CREATE INDEX IF NOT EXISTS idx_news_heatmap_history_category
      ON news_heatmap_history(category, timestamp DESC)
    `);
  }

  private normalizeCategory(rawCategory?: string | null): ClusterCategory {
    if (!rawCategory) return 'GENERAL';
    const normalized = rawCategory.toUpperCase();
    if (CATEGORY_SET.has(normalized as NewsCategory)) {
      return normalized as NewsCategory;
    }
    if (normalized === 'POLITICS') return 'GEOPOLITICS';
    if (normalized === 'FX' || normalized === 'RATES') return 'ECONOMICS';
    return 'GENERAL';
  }

  private parseDate(value: string | null | undefined): Date | null {
    if (!value) return null;
    const parsed = new Date(value);
    if (Number.isNaN(parsed.getTime())) return null;
    return parsed;
  }

  private parseJsonArray(value: string | null | undefined): string[] {
    if (!value) return [];
    try {
      const parsed = JSON.parse(value);
      if (!Array.isArray(parsed)) return [];
      return parsed.map(v => String(v)).filter(Boolean);
    } catch {
      return [];
    }
  }

  private normalizeToken(rawToken: string): string {
    return rawToken
      .toLowerCase()
      .replace(/^[^a-z0-9#+-]+|[^a-z0-9#+-]+$/g, '')
      .replace(/['"]/g, '');
  }

  private extractTokens(article: SourceArticle): string[] {
    const tokenSet = new Set<string>();

    const pushToken = (token: string) => {
      const normalized = this.normalizeToken(token);
      if (!normalized) return;
      if (/^\d+$/.test(normalized)) return;
      if (normalized.length < 3 && !HIGH_SIGNAL_TOKENS.has(normalized)) return;
      if (STOP_WORDS.has(normalized) && !HIGH_SIGNAL_TOKENS.has(normalized)) return;
      tokenSet.add(normalized);
    };

    const rawText = `${article.title} ${article.snippet} ${article.summary}`.trim();
    const parts = rawText
      .split(/[\s/,:;()[\]{}"'`~!?<>|]+/)
      .filter(Boolean);
    for (const part of parts) pushToken(part);

    for (const tag of article.tags) pushToken(tag);

    const tickerMatches = article.title.match(/\b[A-Z]{2,8}\b/g) || [];
    for (const ticker of tickerMatches) pushToken(ticker);

    if (tokenSet.size === 0) {
      article.title
        .split(/\s+/)
        .filter(token => token.length > 3)
        .slice(0, 6)
        .forEach(pushToken);
    }

    return Array.from(tokenSet).slice(0, 30);
  }

  private normalizeTopicKey(topic: string): string {
    return topic
      .toLowerCase()
      .replace(/&/g, ' and ')
      .replace(/[^a-z0-9]+/g, '_')
      .replace(/^_+|_+$/g, '')
      .slice(0, 180);
  }

  private jaccardSimilarity(a: Set<string>, b: Set<string>): number {
    if (!a.size || !b.size) return 0;

    const [small, large] = a.size < b.size ? [a, b] : [b, a];
    let intersection = 0;
    for (const token of small) {
      if (large.has(token)) intersection++;
    }

    const union = a.size + b.size - intersection;
    return union > 0 ? intersection / union : 0;
  }

  private sentimentToScore(sentiment: NewsSentiment): number {
    if (sentiment === 'BULLISH') return 1;
    if (sentiment === 'BEARISH') return -1;
    return 0;
  }

  private importanceWeight(importance: NewsImportance): number {
    switch (importance) {
      case 'CRITICAL':
        return 2.4;
      case 'HIGH':
        return 1.65;
      case 'MEDIUM':
        return 1.0;
      case 'LOW':
      default:
        return 0.8;
    }
  }

  private calculateArticleWeight(article: SourceArticle, nowMs: number): number {
    const ageHours = Math.max(0, (nowMs - article.eventTime.getTime()) / 3_600_000);
    const recencyWeight = Math.exp(-ageHours / 9);
    const importanceWeight = this.importanceWeight(article.importance);
    const sentimentBoost = 1 + Math.abs(this.sentimentToScore(article.sentiment)) * 0.22;
    return recencyWeight * importanceWeight * sentimentBoost;
  }

  private chooseTopic(acc: ClusterAccumulator): string {
    if (acc.topicVotes.size > 0) {
      const topTopic = Array.from(acc.topicVotes.entries())
        .sort((a, b) => b[1] - a[1])[0]?.[0];
      if (topTopic && topTopic.length > 5) return topTopic;
    }

    const latestArticle = [...acc.articles]
      .sort((a, b) => b.article.eventTime.getTime() - a.article.eventTime.getTime())[0]?.article;
    if (!latestArticle) return 'Unlabeled Market Event';

    return latestArticle.title
      .replace(/\s*[-|]\s*(Reuters|Bloomberg|CoinDesk|Cointelegraph|AP|AFP).*$/i, '')
      .replace(/\s+/g, ' ')
      .trim()
      .slice(0, 120);
  }

  private chooseKeywords(acc: ClusterAccumulator): string[] {
    const weightedKeywords = new Map<string, number>();
    for (const [k, v] of acc.keywordWeights) weightedKeywords.set(k, (weightedKeywords.get(k) || 0) + v * 1.35);
    for (const [k, v] of acc.tokenWeights) weightedKeywords.set(k, (weightedKeywords.get(k) || 0) + v);

    return Array.from(weightedKeywords.entries())
      .sort((a, b) => b[1] - a[1])
      .map(([token]) => token)
      .filter(token => token.length >= 3)
      .slice(0, 8);
  }

  private toSentimentLabel(score: number): NewsSentiment {
    if (score >= 0.15) return 'BULLISH';
    if (score <= -0.15) return 'BEARISH';
    return 'NEUTRAL';
  }

  private resolveTrendDirection(acc: ClusterAccumulator, velocity: number): TrendDirection {
    const voteDelta = acc.trendVotes.UP - acc.trendVotes.DOWN;
    if (voteDelta >= 2) return 'UP';
    if (voteDelta <= -2) return 'DOWN';
    if (velocity >= 3) return 'UP';
    if (velocity <= -3) return 'DOWN';
    return 'NEUTRAL';
  }

  private resolveUrgency(acc: ClusterAccumulator, heatScore: number): ClusterUrgency {
    const urgencyRanking: ClusterUrgency[] = ['LOW', 'MEDIUM', 'HIGH', 'CRITICAL'];
    const voted = urgencyRanking
      .map(level => ({ level, count: acc.urgencyVotes[level] }))
      .sort((a, b) => b.count - a.count)[0];

    if (heatScore >= 85 || acc.importanceVotes.CRITICAL >= 2) return 'CRITICAL';
    if (heatScore >= 65 || acc.importanceVotes.CRITICAL >= 1 || acc.importanceVotes.HIGH >= 4) return 'HIGH';
    if (heatScore >= 35) return 'MEDIUM';

    if (voted && voted.count > 0) return voted.level;
    return 'LOW';
  }

  private stableFallbackKey(acc: ClusterAccumulator): string {
    const primaryTopic = this.chooseTopic(acc);
    const topicKey = this.normalizeTopicKey(primaryTopic);
    if (topicKey) return `${acc.category}:${topicKey}`;

    const topTokens = Array.from(acc.tokenWeights.entries())
      .sort((a, b) => b[1] - a[1])
      .map(([token]) => token)
      .slice(0, 6)
      .sort();

    if (topTokens.length === 0) {
      const fallbackHash = crypto.createHash('sha1').update(acc.articles[0]?.article.id || crypto.randomUUID()).digest('hex').slice(0, 16);
      return `${acc.category}:cluster:${fallbackHash}`;
    }

    return `${acc.category}:${topTokens.join('|')}`;
  }

  private createAccumulator(
    key: string,
    category: ClusterCategory,
    firstArticle: SourceArticle
  ): ClusterAccumulator {
    return {
      key,
      category,
      topicVotes: new Map<string, number>(),
      tokenWeights: new Map<string, number>(),
      keywordWeights: new Map<string, number>(),
      tokenSet: new Set<string>(),
      articles: [],
      sourceSet: new Set<string>(),
      weightSum: 0,
      weightedSentimentSum: 0,
      trendVotes: { UP: 0, DOWN: 0, NEUTRAL: 0 },
      urgencyVotes: { CRITICAL: 0, HIGH: 0, MEDIUM: 0, LOW: 0 },
      importanceVotes: { CRITICAL: 0, HIGH: 0, MEDIUM: 0, LOW: 0 },
      labeledCount: 0,
      firstSeen: firstArticle.eventTime,
      lastSeen: firstArticle.eventTime,
    };
  }

  private addArticleToAccumulator(
    acc: ClusterAccumulator,
    article: SourceArticle,
    tokenSet: Set<string>,
    weight: number,
    label?: LlmEventLabel
  ): void {
    acc.articles.push({ article, tokenSet, weight, label });
    acc.sourceSet.add(article.source || 'Unknown');
    acc.weightSum += weight;
    acc.weightedSentimentSum += this.sentimentToScore(article.sentiment) * weight;
    acc.importanceVotes[article.importance] += 1;

    if (article.eventTime.getTime() < acc.firstSeen.getTime()) acc.firstSeen = article.eventTime;
    if (article.eventTime.getTime() > acc.lastSeen.getTime()) acc.lastSeen = article.eventTime;

    for (const token of tokenSet) {
      acc.tokenSet.add(token);
      acc.tokenWeights.set(token, (acc.tokenWeights.get(token) || 0) + weight);
    }

    if (label) {
      acc.labeledCount += 1;
      acc.topicVotes.set(label.topic, (acc.topicVotes.get(label.topic) || 0) + 1.3);
      acc.trendVotes[label.trendDirection] += 1;
      acc.urgencyVotes[label.urgency] += 1;
      for (const keyword of label.keywords) {
        const normalized = this.normalizeToken(keyword);
        if (!normalized || normalized.length < 3) continue;
        acc.tokenSet.add(normalized);
        acc.keywordWeights.set(normalized, (acc.keywordWeights.get(normalized) || 0) + weight * 1.15);
      }
    }
  }

  private findBestCluster(
    clusters: ClusterAccumulator[],
    category: ClusterCategory,
    tokenSet: Set<string>,
    label?: LlmEventLabel
  ): ClusterAccumulator | null {
    let best: ClusterAccumulator | null = null;
    let bestScore = 0;

    for (const cluster of clusters) {
      if (cluster.category !== category) continue;
      const lexical = this.jaccardSimilarity(tokenSet, cluster.tokenSet);

      let labelScore = 0;
      if (label) {
        const labelTokenSet = new Set<string>([
          ...label.keywords.map(keyword => this.normalizeToken(keyword)).filter(Boolean),
          ...this.normalizeTopicKey(label.topic).split('_').filter(token => token.length >= 3),
        ]);
        labelScore = this.jaccardSimilarity(labelTokenSet, cluster.tokenSet);
      }

      const score = Math.max(lexical, labelScore * 1.1);
      if (score > bestScore) {
        bestScore = score;
        best = cluster;
      }
    }

    const threshold = label ? 0.26 : 0.34;
    return bestScore >= threshold ? best : null;
  }

  private mergeAccumulators(target: ClusterAccumulator, source: ClusterAccumulator): void {
    for (const article of source.articles) target.articles.push(article);
    for (const sourceName of source.sourceSet) target.sourceSet.add(sourceName);
    for (const token of source.tokenSet) target.tokenSet.add(token);

    for (const [token, weight] of source.tokenWeights) {
      target.tokenWeights.set(token, (target.tokenWeights.get(token) || 0) + weight);
    }
    for (const [token, weight] of source.keywordWeights) {
      target.keywordWeights.set(token, (target.keywordWeights.get(token) || 0) + weight);
    }
    for (const [topic, weight] of source.topicVotes) {
      target.topicVotes.set(topic, (target.topicVotes.get(topic) || 0) + weight);
    }

    target.weightSum += source.weightSum;
    target.weightedSentimentSum += source.weightedSentimentSum;
    target.labeledCount += source.labeledCount;
    target.trendVotes.UP += source.trendVotes.UP;
    target.trendVotes.DOWN += source.trendVotes.DOWN;
    target.trendVotes.NEUTRAL += source.trendVotes.NEUTRAL;
    target.urgencyVotes.CRITICAL += source.urgencyVotes.CRITICAL;
    target.urgencyVotes.HIGH += source.urgencyVotes.HIGH;
    target.urgencyVotes.MEDIUM += source.urgencyVotes.MEDIUM;
    target.urgencyVotes.LOW += source.urgencyVotes.LOW;
    target.importanceVotes.CRITICAL += source.importanceVotes.CRITICAL;
    target.importanceVotes.HIGH += source.importanceVotes.HIGH;
    target.importanceVotes.MEDIUM += source.importanceVotes.MEDIUM;
    target.importanceVotes.LOW += source.importanceVotes.LOW;

    if (source.firstSeen.getTime() < target.firstSeen.getTime()) target.firstSeen = source.firstSeen;
    if (source.lastSeen.getTime() > target.lastSeen.getTime()) target.lastSeen = source.lastSeen;
  }

  private async getRecentArticles(hours: number, limit: number): Promise<SourceArticle[]> {
    await this.initialize();
    if (!this.db) return [];

    const hasNewsTable = this.db
      .prepare("SELECT 1 AS ok FROM sqlite_master WHERE type = 'table' AND name = 'news_articles'")
      .get() as { ok: number } | undefined;
    if (!hasNewsTable?.ok) return [];

    const cutoff = new Date(Date.now() - hours * 3_600_000).toISOString();
    // Use indexed scans first, then hydrate full rows by id to avoid full-table scans.
    // Also intentionally avoid selecting `content` (unused in clustering) to reduce DB I/O.
    const rows = this.db.prepare(`
      WITH candidates AS (
        SELECT id, published_at AS event_time
        FROM news_articles
        WHERE published_at IS NOT NULL AND published_at != '' AND published_at >= ?
        UNION ALL
        SELECT id, created_at AS event_time
        FROM news_articles
        WHERE (published_at IS NULL OR published_at = '') AND created_at >= ?
      ),
      ranked AS (
        SELECT id, event_time
        FROM candidates
        ORDER BY event_time DESC
        LIMIT ?
      )
      SELECT
        n.id,
        n.title,
        '' AS content,
        n.summary,
        n.snippet,
        n.source,
        n.url,
        n.published_at,
        n.created_at,
        n.categories,
        n.tags,
        n.sentiment,
        n.importance
      FROM ranked r
      JOIN news_articles n ON n.id = r.id
      ORDER BY r.event_time DESC
    `).all(cutoff, cutoff, limit) as any[];

    return rows
      .map((row): SourceArticle | null => {
        const createdAt = this.parseDate(row.created_at);
        if (!createdAt) return null;
        const publishedAt = this.parseDate(row.published_at);
        const eventTime = publishedAt || createdAt;

        const categories = this.parseJsonArray(row.categories)
          .map(category => this.normalizeCategory(category))
          .filter((category): category is NewsCategory => category !== 'GENERAL') as NewsCategory[];
        const categoryList: NewsCategory[] = categories.length > 0 ? categories : ['CRYPTO'];

        const tags = this.parseJsonArray(row.tags).slice(0, 12);
        const sentiment: NewsSentiment = ['BULLISH', 'BEARISH', 'NEUTRAL'].includes(row.sentiment)
          ? row.sentiment as NewsSentiment
          : 'NEUTRAL';
        const importance: NewsImportance = ['LOW', 'MEDIUM', 'HIGH', 'CRITICAL'].includes(row.importance)
          ? row.importance as NewsImportance
          : 'MEDIUM';

        return {
          id: String(row.id),
          title: String(row.title || 'Untitled'),
          content: String(row.content || ''),
          summary: String(row.summary || ''),
          snippet: String(row.snippet || ''),
          source: String(row.source || 'Unknown'),
          url: String(row.url || ''),
          publishedAt,
          createdAt,
          eventTime,
          categories: categoryList,
          tags,
          sentiment,
          importance,
        };
      })
      .filter((article): article is SourceArticle => article !== null);
  }

  private async labelArticlesWithLlm(articles: SourceArticle[]): Promise<Map<string, LlmEventLabel>> {
    const labels = new Map<string, LlmEventLabel>();
    if (!openrouterService.canUseService()) return labels;
    if (Date.now() < this.llmBlockedUntil) return labels;

    const labelInputs = articles.slice(0, this.maxLlmLabelArticles).map(article => ({
      id: article.id,
      title: article.title,
      category: article.categories[0],
      tags: article.tags,
    }));

    if (labelInputs.length === 0) return labels;

    try {
      const llmLabels = await this.withTimeout(
        openrouterService.batchEventLabels(labelInputs) as Promise<Map<string, any>>,
        this.llmTimeoutMs,
        `LLM labeling timed out after ${this.llmTimeoutMs}ms`
      );
      for (const [id, rawLabel] of llmLabels as Map<string, any>) {
        const topic = String(rawLabel?.topic || '').trim();
        if (!topic) continue;
        const trendDirection: TrendDirection = ['UP', 'DOWN', 'NEUTRAL'].includes(rawLabel?.trendDirection)
          ? rawLabel.trendDirection as TrendDirection
          : 'NEUTRAL';
        const urgency: ClusterUrgency = ['CRITICAL', 'HIGH', 'MEDIUM', 'LOW'].includes(rawLabel?.urgency)
          ? rawLabel.urgency as ClusterUrgency
          : 'MEDIUM';
        const keywords = Array.isArray(rawLabel?.keywords)
          ? rawLabel.keywords.map((keyword: unknown) => String(keyword)).filter(Boolean).slice(0, 8)
          : [];

        labels.set(id, { topic, trendDirection, urgency, keywords });
      }

      if (labels.size === 0) {
        this.llmConsecutiveEmpty += 1;
        if (this.llmConsecutiveEmpty >= 2) {
          this.llmBlockedUntil = Date.now() + (10 * 60 * 1000);
          logger.warn('[NewsHeatmapService] OpenRouter returned zero labels repeatedly; disabling LLM labeling for 10 minutes');
          this.llmConsecutiveEmpty = 0;
        }
      } else {
        this.llmConsecutiveEmpty = 0;
        this.llmBlockedUntil = 0;
      }
    } catch (error) {
      this.llmConsecutiveEmpty += 1;
      if (this.llmConsecutiveEmpty >= 2) {
        this.llmBlockedUntil = Date.now() + (10 * 60 * 1000);
        this.llmConsecutiveEmpty = 0;
      }
      logger.warn('[NewsHeatmapService] LLM labeling failed, continuing with lexical fallback:', error);
    }

    return labels;
  }

  private async withTimeout<T>(promise: Promise<T>, timeoutMs: number, errorMessage: string): Promise<T> {
    let timeoutHandle: NodeJS.Timeout | null = null;
    const timeoutPromise = new Promise<never>((_, reject) => {
      timeoutHandle = setTimeout(() => reject(new Error(errorMessage)), timeoutMs);
    });

    try {
      return await Promise.race([promise, timeoutPromise]);
    } finally {
      if (timeoutHandle) clearTimeout(timeoutHandle);
    }
  }

  private async getPreviousState(hours: number): Promise<Map<string, StateSnapshotRow>> {
    await this.initialize();
    if (!this.db) return new Map();

    const cutoff = new Date(Date.now() - hours * 3_600_000).toISOString();
    const rows = this.db.prepare(`
      SELECT cluster_key, cluster_id, last_heat_score
      FROM news_heatmap_state
      WHERE updated_at >= ?
    `).all(cutoff) as Array<{ cluster_key: string; cluster_id: string; last_heat_score: number }>;

    const result = new Map<string, StateSnapshotRow>();
    for (const row of rows) {
      result.set(row.cluster_key, {
        clusterKey: row.cluster_key,
        clusterId: row.cluster_id,
        lastHeatScore: row.last_heat_score,
      });
    }
    return result;
  }

  private buildClusters(
    articles: SourceArticle[],
    llmLabels: Map<string, LlmEventLabel>,
    previousState: Map<string, StateSnapshotRow>,
    now: Date
  ): NewsHeatmapCluster[] {
    const nowMs = now.getTime();
    const workingClusters: ClusterAccumulator[] = [];
    const byLlmTopicKey = new Map<string, ClusterAccumulator>();

    const sortedArticles = [...articles]
      .sort((a, b) => b.eventTime.getTime() - a.eventTime.getTime());

    for (const article of sortedArticles) {
      const category = this.normalizeCategory(article.categories[0]);
      const tokens = new Set(this.extractTokens(article));
      const weight = this.calculateArticleWeight(article, nowMs);
      const label = llmLabels.get(article.id);
      const llmTopicKey = label ? `${category}:${this.normalizeTopicKey(label.topic)}` : '';

      let assignedCluster: ClusterAccumulator | null = null;

      if (llmTopicKey) {
        assignedCluster = byLlmTopicKey.get(llmTopicKey) || null;
      }

      if (!assignedCluster) {
        assignedCluster = this.findBestCluster(workingClusters, category, tokens, label);
      }

      if (!assignedCluster) {
        const seedKey = llmTopicKey || `${category}:seed:${crypto.randomUUID()}`;
        assignedCluster = this.createAccumulator(seedKey, category, article);
        workingClusters.push(assignedCluster);
        if (llmTopicKey) byLlmTopicKey.set(llmTopicKey, assignedCluster);
      }

      this.addArticleToAccumulator(assignedCluster, article, tokens, weight, label);
    }

    // Stabilize keys and merge duplicates from lexical seeds.
    const stableClusterMap = new Map<string, ClusterAccumulator>();
    for (const cluster of workingClusters) {
      const stableKey = cluster.key.includes(':seed:')
        ? this.stableFallbackKey(cluster)
        : cluster.key;

      if (!stableClusterMap.has(stableKey)) {
        cluster.key = stableKey;
        stableClusterMap.set(stableKey, cluster);
      } else {
        this.mergeAccumulators(stableClusterMap.get(stableKey)!, cluster);
      }
    }

    const finalizedClusters: NewsHeatmapCluster[] = [];
    for (const cluster of stableClusterMap.values()) {
      if (cluster.articles.length === 0) continue;

      const articlesByRecency = [...cluster.articles]
        .sort((a, b) => b.article.eventTime.getTime() - a.article.eventTime.getTime());
      const topic = this.chooseTopic(cluster);
      const keywords = this.chooseKeywords(cluster);
      const topicKey = this.normalizeTopicKey(topic) || crypto.createHash('sha1').update(cluster.key).digest('hex').slice(0, 24);

      const sourceDiversityBoost = Math.log2(cluster.sourceSet.size + 1) * 3.4;
      const concentrationPenalty = Math.max(0, cluster.articles.length - cluster.sourceSet.size) * 0.35;
      const rawHeat = cluster.weightSum * 19 + sourceDiversityBoost + Math.sqrt(cluster.articles.length) * 4 - concentrationPenalty;
      const heatScore = Number((100 * (1 - Math.exp(-rawHeat / 26))).toFixed(2));

      const stableKey = `${cluster.category}:${topicKey}`;
      const previous = previousState.get(stableKey) || previousState.get(cluster.key);
      const velocity = Number((heatScore - (previous?.lastHeatScore || 0)).toFixed(2));
      const sentimentScore = cluster.weightSum > 0
        ? Number((cluster.weightedSentimentSum / cluster.weightSum).toFixed(3))
        : 0;

      const trendDirection = this.resolveTrendDirection(cluster, velocity);
      const urgency = this.resolveUrgency(cluster, heatScore);
      const clusterId = previous?.clusterId || `nh_${crypto.createHash('sha1').update(stableKey).digest('hex').slice(0, 18)}`;
      const freshnessMinutes = Math.max(0, Math.round((nowMs - cluster.lastSeen.getTime()) / 60_000));
      const llmCoverage = Number((cluster.labeledCount / Math.max(1, cluster.articles.length)).toFixed(3));

      const latestTitle = articlesByRecency[0]?.article.title || topic;
      const spanHours = Math.max(0.1, (cluster.lastSeen.getTime() - cluster.firstSeen.getTime()) / 3_600_000);
      const summary = `${cluster.articles.length} articles across ${cluster.sourceSet.size} sources over ${spanHours.toFixed(1)}h. Latest: ${latestTitle}`;

      finalizedClusters.push({
        id: clusterId,
        topic,
        topicKey,
        summary,
        category: cluster.category,
        keywords,
        heatScore,
        articleCount: cluster.articles.length,
        sourceCount: cluster.sourceSet.size,
        sentimentScore,
        sentiment: this.toSentimentLabel(sentimentScore),
        trendDirection,
        urgency,
        velocity,
        freshnessMinutes,
        llmCoverage,
        firstSeen: cluster.firstSeen.toISOString(),
        updatedAt: cluster.lastSeen.toISOString(),
        articles: articlesByRecency.slice(0, 12).map(entry => ({
          id: entry.article.id,
          title: entry.article.title,
          source: entry.article.source,
          url: entry.article.url,
          publishedAt: entry.article.publishedAt ? entry.article.publishedAt.toISOString() : null,
          sentiment: entry.article.sentiment,
          importance: entry.article.importance,
          snippet: entry.article.snippet,
          summary: entry.article.summary,
        })),
      });
    }

    return finalizedClusters
      .sort((a, b) => {
        if (b.heatScore !== a.heatScore) return b.heatScore - a.heatScore;
        if (b.velocity !== a.velocity) return b.velocity - a.velocity;
        return b.articleCount - a.articleCount;
      });
  }

  private async persistState(clusters: NewsHeatmapCluster[], timestamp: string): Promise<void> {
    await this.initialize();
    if (!this.db || clusters.length === 0) return;

    const upsertState = this.db.prepare(`
      INSERT INTO news_heatmap_state (
        cluster_key,
        cluster_id,
        category,
        topic,
        last_heat_score,
        last_article_count,
        last_velocity,
        last_sentiment_score,
        llm_coverage,
        updated_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      ON CONFLICT(cluster_key) DO UPDATE SET
        cluster_id = excluded.cluster_id,
        category = excluded.category,
        topic = excluded.topic,
        last_heat_score = excluded.last_heat_score,
        last_article_count = excluded.last_article_count,
        last_velocity = excluded.last_velocity,
        last_sentiment_score = excluded.last_sentiment_score,
        llm_coverage = excluded.llm_coverage,
        updated_at = excluded.updated_at
    `);

    const insertHistory = this.db.prepare(`
      INSERT INTO news_heatmap_history (
        cluster_key,
        category,
        topic,
        heat_score,
        article_count,
        sentiment_score,
        velocity,
        llm_coverage,
        timestamp
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
    `);

    const cleanupState = this.db.prepare(`
      DELETE FROM news_heatmap_state
      WHERE updated_at < ?
    `);

    const cleanupHistory = this.db.prepare(`
      DELETE FROM news_heatmap_history
      WHERE timestamp < ?
    `);

    const retainStateCutoff = new Date(Date.now() - 10 * 24 * 3_600_000).toISOString();
    const retainHistoryCutoff = new Date(Date.now() - 14 * 24 * 3_600_000).toISOString();

    const tx = this.db.transaction((items: NewsHeatmapCluster[]) => {
      for (const cluster of items) {
        const key = `${cluster.category}:${cluster.topicKey}`;
        upsertState.run(
          key,
          cluster.id,
          cluster.category,
          cluster.topic,
          cluster.heatScore,
          cluster.articleCount,
          cluster.velocity,
          cluster.sentimentScore,
          cluster.llmCoverage,
          timestamp
        );

        insertHistory.run(
          key,
          cluster.category,
          cluster.topic,
          cluster.heatScore,
          cluster.articleCount,
          cluster.sentimentScore,
          cluster.velocity,
          cluster.llmCoverage,
          timestamp
        );
      }

      cleanupState.run(retainStateCutoff);
      cleanupHistory.run(retainHistoryCutoff);
    });

    tx(clusters);
  }

  private normalizeOptions(options: BuildOptions): Required<Pick<BuildOptions, 'hours' | 'limit' | 'force' | 'articleLimit'>> & { category: string } {
    const hours = Math.max(1, Math.min(168, Number(options.hours) || 24));
    const limit = Math.max(1, Math.min(300, Number(options.limit) || 60));
    const articleLimit = Math.max(50, Math.min(this.maxArticleScan, Number(options.articleLimit) || this.maxArticleScan));
    const rawCategory = String(options.category || 'ALL').toUpperCase();
    const category = rawCategory === 'ALL'
      ? 'ALL'
      : this.normalizeCategory(rawCategory);

    return {
      hours,
      category,
      limit,
      force: Boolean(options.force),
      articleLimit,
    };
  }

  private buildCacheKey(hours: number, category: string, articleLimit: number): string {
    return `${hours}:${category}:${articleLimit}`;
  }

  private projectResult(raw: InternalBuildResult, limit: number): NewsHeatmapResult {
    const visibleClusters = raw.clusters.slice(0, limit);
    const byCategory: Record<string, NewsHeatmapCluster[]> = {};
    for (const cluster of visibleClusters) {
      if (!byCategory[cluster.category]) byCategory[cluster.category] = [];
      byCategory[cluster.category].push(cluster);
    }

    return {
      generatedAt: raw.generatedAt,
      hours: raw.hours,
      category: raw.category,
      totalArticles: raw.totalArticles,
      totalClusters: raw.totalClusters,
      clusters: visibleClusters,
      byCategory,
      llm: raw.llm,
    };
  }

  private async buildInternal(options: Required<Pick<BuildOptions, 'hours' | 'articleLimit'>> & { category: string }): Promise<InternalBuildResult> {
    const now = new Date();
    const articles = await this.getRecentArticles(options.hours, options.articleLimit);
    const llmLabels = await this.labelArticlesWithLlm(articles);
    const previousState = await this.getPreviousState(96);
    const allClusters = this.buildClusters(articles, llmLabels, previousState, now);
    const timestamp = now.toISOString();

    await this.persistState(allClusters, timestamp);

    const filteredClusters = options.category === 'ALL'
      ? allClusters
      : allClusters.filter(cluster => cluster.category === options.category);

    this.clusterDetailCache.clear();
    for (const cluster of filteredClusters) {
      this.clusterDetailCache.set(cluster.id, cluster);
    }

    const llmCoverage = articles.length > 0
      ? llmLabels.size / Math.min(articles.length, this.maxLlmLabelArticles)
      : 0;
    const llmEnabled = openrouterService.canUseService() && Date.now() >= this.llmBlockedUntil;

    return {
      generatedAt: timestamp,
      hours: options.hours,
      category: options.category,
      totalArticles: articles.length,
      totalClusters: filteredClusters.length,
      clusters: filteredClusters,
      llm: {
        enabled: llmEnabled,
        model: this.configuredLabelingModel,
        labeledArticles: llmLabels.size,
        coverage: Number(llmCoverage.toFixed(3)),
      },
    };
  }

  async getHeatmap(options: BuildOptions = {}): Promise<NewsHeatmapResult> {
    const normalized = this.normalizeOptions(options);
    const cacheKey = this.buildCacheKey(normalized.hours, normalized.category, normalized.articleLimit);
    const now = Date.now();

    if (!normalized.force) {
      const cached = this.cache.get(cacheKey);
      if (cached && (now - cached.createdAt) < this.cacheTtlMs) {
        return this.projectResult(cached.result, normalized.limit);
      }
    }

    if (!normalized.force && this.inFlight.has(cacheKey)) {
      const inFlightResult = await this.inFlight.get(cacheKey)!;
      return this.projectResult(inFlightResult, normalized.limit);
    }

    const buildPromise = this.buildInternal({
      hours: normalized.hours,
      category: normalized.category,
      articleLimit: normalized.articleLimit,
    });
    this.inFlight.set(cacheKey, buildPromise);

    try {
      const result = await buildPromise;
      this.cache.set(cacheKey, { createdAt: Date.now(), result });
      return this.projectResult(result, normalized.limit);
    } finally {
      this.inFlight.delete(cacheKey);
    }
  }

  async rebuild(options: BuildOptions = {}): Promise<NewsHeatmapResult> {
    return this.getHeatmap({ ...options, force: true });
  }

  async getClusterDetails(clusterId: string, hours: number = 48): Promise<NewsHeatmapCluster | null> {
    if (!clusterId) return null;
    const cached = this.clusterDetailCache.get(clusterId);
    if (cached) return cached;

    const rebuilt = await this.getHeatmap({ hours, limit: 250, force: true });
    return rebuilt.clusters.find(cluster => cluster.id === clusterId) || null;
  }

  async getTimeline(hours: number = 24, bucketHours: number = 2, category: string = 'ALL'): Promise<NewsHeatmapTimeline> {
    await this.initialize();
    if (!this.db) {
      return {
        generatedAt: new Date().toISOString(),
        hours,
        bucketHours,
        points: [],
      };
    }

    const resolvedHours = Math.max(1, Math.min(168, Number(hours) || 24));
    const resolvedBucketHours = Math.max(1, Math.min(24, Number(bucketHours) || 2));
    const categoryFilter = String(category || 'ALL').toUpperCase();
    const cutoff = new Date(Date.now() - resolvedHours * 3_600_000).toISOString();

    const readRows = () => this.db!.prepare(`
      SELECT category, heat_score, article_count, timestamp
      FROM news_heatmap_history
      WHERE timestamp >= ?
      ORDER BY timestamp ASC
    `).all(cutoff) as Array<{
      category: string;
      heat_score: number;
      article_count: number;
      timestamp: string;
    }>;

    let rows = readRows();

    if (rows.length === 0) {
      // Build one snapshot if history is empty, but do not recurse indefinitely
      // if there is still no data after rebuild.
      await this.getHeatmap({ hours: resolvedHours, limit: 80, force: true });
      rows = readRows();
      if (rows.length === 0) {
        return {
          generatedAt: new Date().toISOString(),
          hours: resolvedHours,
          bucketHours: resolvedBucketHours,
          points: [],
        };
      }
    }

    const bucketMs = resolvedBucketHours * 3_600_000;
    const nowMs = Date.now();
    const startMs = nowMs - resolvedHours * 3_600_000;
    const alignedStart = Math.floor(startMs / bucketMs) * bucketMs;

    const buckets = new Map<number, {
      heatSum: number;
      articleSum: number;
      observations: number;
      byCategoryHeat: Map<string, number>;
      byCategoryObs: Map<string, number>;
    }>();

    for (let ts = alignedStart; ts <= nowMs; ts += bucketMs) {
      buckets.set(ts, {
        heatSum: 0,
        articleSum: 0,
        observations: 0,
        byCategoryHeat: new Map<string, number>(),
        byCategoryObs: new Map<string, number>(),
      });
    }

    for (const row of rows) {
      const rowCategory = String(row.category || 'GENERAL').toUpperCase();
      if (categoryFilter !== 'ALL' && rowCategory !== categoryFilter) continue;

      const ts = this.parseDate(row.timestamp)?.getTime();
      if (!ts) continue;
      if (ts < alignedStart) continue;
      const bucketStart = Math.floor(ts / bucketMs) * bucketMs;
      const bucket = buckets.get(bucketStart);
      if (!bucket) continue;

      bucket.heatSum += row.heat_score;
      bucket.articleSum += row.article_count;
      bucket.observations += 1;
      bucket.byCategoryHeat.set(rowCategory, (bucket.byCategoryHeat.get(rowCategory) || 0) + row.heat_score);
      bucket.byCategoryObs.set(rowCategory, (bucket.byCategoryObs.get(rowCategory) || 0) + 1);
    }

    const points: NewsHeatmapTimelinePoint[] = Array.from(buckets.entries())
      .sort((a, b) => a[0] - b[0])
      .map(([bucketStart, bucket]) => {
        const byCategory: Record<string, number> = {};
        for (const [cat, heat] of bucket.byCategoryHeat.entries()) {
          const count = bucket.byCategoryObs.get(cat) || 1;
          byCategory[cat] = Number((heat / count).toFixed(2));
        }

        return {
          bucketStart: new Date(bucketStart).toISOString(),
          bucketEnd: new Date(bucketStart + bucketMs).toISOString(),
          avgHeat: bucket.observations > 0 ? Number((bucket.heatSum / bucket.observations).toFixed(2)) : 0,
          articleCount: bucket.articleSum,
          clusterObservations: bucket.observations,
          byCategory,
        };
      });

    return {
      generatedAt: new Date().toISOString(),
      hours: resolvedHours,
      bucketHours: resolvedBucketHours,
      points,
    };
  }
}

const newsHeatmapService = new NewsHeatmapService();
export default newsHeatmapService;
