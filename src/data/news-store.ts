// News Store Service - SQLite (FTS5-backed keyword search)
// Stores and retrieves global news articles for autonomous newsfeed

import BetterSqlite3 from 'better-sqlite3';
import { NewsArticle, NewsCategory, NewsImportance, NewsSentiment, NewsItem, NewsStats } from '../shared/types';
import logger from '../shared/logger';
import crypto from 'crypto';

class NewsStore {
  private db: BetterSqlite3.Database | null = null;
  private initialized: boolean = false;
  private ftsEnabled: boolean = false;
  private dbPath: string;

  constructor() {
    this.dbPath = process.env.NEWS_DB_PATH || './data/news.db';
  }

  async initialize(): Promise<void> {
    if (this.initialized) return;

    try {
      logger.info('Initializing news database...');

      this.db = new BetterSqlite3(this.dbPath);
      this.db.pragma('journal_mode = WAL');

      this.db.exec(`
        CREATE TABLE IF NOT EXISTS news_articles (
          id TEXT PRIMARY KEY,
          title TEXT NOT NULL,
          content TEXT,
          source TEXT NOT NULL,
          url TEXT NOT NULL,
          published_at TEXT,
          categories TEXT NOT NULL,
          categories_flat TEXT NOT NULL,
          tags TEXT NOT NULL,
          tags_flat TEXT NOT NULL,
          market_links TEXT,
          market_links_flat TEXT,
          sentiment TEXT NOT NULL,
          importance TEXT NOT NULL,
          snippet TEXT,
          summary TEXT,
          scraped_at TEXT NOT NULL,
          created_at TEXT NOT NULL,
          url_hash TEXT NOT NULL UNIQUE,
          metadata TEXT
        )
      `);

      this.db.exec(`
        CREATE INDEX IF NOT EXISTS idx_news_created_at
        ON news_articles(created_at)
      `);

      this.db.exec(`
        CREATE INDEX IF NOT EXISTS idx_news_published_at
        ON news_articles(published_at)
      `);

      this.db.exec(`
        CREATE INDEX IF NOT EXISTS idx_news_url_hash
        ON news_articles(url_hash)
      `);

      this.db.exec(`
        CREATE INDEX IF NOT EXISTS idx_news_categories_flat
        ON news_articles(categories_flat)
      `);

      this.ensureMarketLinkColumns();

      this.db.exec(`
        CREATE INDEX IF NOT EXISTS idx_news_market_links_flat
        ON news_articles(market_links_flat)
      `);
      this.setupFts();

      this.initialized = true;
      logger.info('News database initialized successfully');
    } catch (error: any) {
      logger.error('Failed to initialize news database:', error?.message || error);
      this.db = null;
    }
  }

  private setupFts(): void {
    if (!this.db) return;

    try {
      this.db.exec(`
        CREATE VIRTUAL TABLE IF NOT EXISTS news_articles_fts
        USING fts5(
          title,
          content,
          snippet,
          summary,
          tags,
          categories,
          id UNINDEXED
        )
      `);

      this.ftsEnabled = true;
    } catch (error) {
      this.ftsEnabled = false;
      logger.warn('[NewsStore] FTS5 not available, falling back to LIKE search');
    }
  }

  private createUrlHash(url: string): string {
    return crypto.createHash('md5').update(url).digest('hex');
  }

  private formatFlat(values: string[]): string {
    return values.length ? `|${values.join('|')}|` : '|';
  }

  private parseJsonArray<T>(value: string | null | undefined): T[] {
    if (!value) return [];
    try {
      return JSON.parse(value) as T[];
    } catch (error) {
      return [];
    }
  }

  private sanitizeFtsQuery(query: string): string {
    const tokens = query
      .replace(/["'`]/g, ' ')
      .replace(/[^a-zA-Z0-9\s]/g, ' ')
      .split(/\s+/)
      .map(token => token.trim())
      .filter(Boolean);

    if (!tokens.length) return '';
    return tokens.map(token => `"${token}"`).join(' OR ');
  }

  private ensureMarketLinkColumns(): void {
    if (!this.db) return;

    const columns = new Set(
      (this.db.prepare("PRAGMA table_info('news_articles')").all() as any[])
        .map(row => row.name)
    );

    if (!columns.has('market_links')) {
      try {
        this.db.exec('ALTER TABLE news_articles ADD COLUMN market_links TEXT');
      } catch (error) {
        logger.warn('[NewsStore] Failed to add market_links column:', error);
      }
    }

    if (!columns.has('market_links_flat')) {
      try {
        this.db.exec('ALTER TABLE news_articles ADD COLUMN market_links_flat TEXT');
      } catch (error) {
        logger.warn('[NewsStore] Failed to add market_links_flat column:', error);
      }
    }
  }

  private toNewsItem(row: any): NewsItem {
    const categories = this.parseJsonArray<NewsCategory>(row.categories);
    const tags = this.parseJsonArray<string>(row.tags);
    const marketLinks = this.parseJsonArray<any>(row.market_links);
    let metadata: Record<string, any> | undefined;
    if (row.metadata) {
      try {
        metadata = JSON.parse(row.metadata);
      } catch (error) {
        metadata = undefined;
      }
    }

    return {
      id: row.id,
      title: row.title,
      content: row.content || undefined,
      summary: row.summary || undefined,
      source: row.source,
      url: row.url,
      publishedAt: row.published_at ? new Date(row.published_at) : undefined,
      categories,
      tags,
      sentiment: row.sentiment as NewsSentiment,
      importance: row.importance as NewsImportance,
      snippet: row.snippet || row.title,
      scrapedAt: new Date(row.scraped_at),
      createdAt: new Date(row.created_at),
      marketLinks,
      metadata,
    };
  }

  async storeNews(articles: NewsArticle[]): Promise<{ stored: string[]; duplicates: string[] }> {
    await this.initialize();
    if (!this.db) throw new Error('News database not initialized');

    const storedIds: string[] = [];
    const duplicateUrls: string[] = [];

    const insert = this.db.prepare(`
      INSERT OR IGNORE INTO news_articles (
        id,
        title,
        content,
        source,
        url,
        published_at,
        categories,
        categories_flat,
        tags,
        tags_flat,
        market_links,
        market_links_flat,
        sentiment,
        importance,
        snippet,
        summary,
        scraped_at,
        created_at,
        url_hash,
        metadata
      ) VALUES (
        ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?
      )
    `);

    const insertFts = this.ftsEnabled
      ? this.db.prepare(`
        INSERT INTO news_articles_fts (
          title,
          content,
          snippet,
          summary,
          tags,
          categories,
          id
        ) VALUES (?, ?, ?, ?, ?, ?, ?)
      `)
      : null;

    const insertBatch = this.db.transaction((items: NewsArticle[]) => {
      for (const article of items) {
        try {
          const id = article.id || crypto.randomUUID();
          const urlHash = this.createUrlHash(article.url);
          const categories = article.categories || [];
          const tags = article.tags || [];

          const categoriesJson = JSON.stringify(categories);
          const tagsJson = JSON.stringify(tags);
          const categoriesFlat = this.formatFlat(categories);
          const tagsFlat = this.formatFlat(tags);
          const marketLinks = article.marketLinks || article.metadata?.marketLinks || [];
          const marketLinksJson = JSON.stringify(marketLinks);
          const marketLinkTokens = marketLinks
            .flatMap((link: any) => [link.marketId, link.marketSlug])
            .filter((value: string | undefined) => !!value);
          const marketLinksFlat = this.formatFlat(marketLinkTokens);

          // Safely convert dates to ISO strings - handle undefined/null
          let publishedAtIso: string | null = null;
          if (article.publishedAt instanceof Date && !isNaN(article.publishedAt.getTime())) {
            publishedAtIso = article.publishedAt.toISOString();
          } else if (typeof article.publishedAt === 'string' && article.publishedAt.length > 0) {
            publishedAtIso = article.publishedAt;
          }
          
          let scrapedAtIso: string;
          if (article.scrapedAt instanceof Date && !isNaN(article.scrapedAt.getTime())) {
            scrapedAtIso = article.scrapedAt.toISOString();
          } else if (typeof article.scrapedAt === 'string' && article.scrapedAt.length > 0) {
            scrapedAtIso = article.scrapedAt;
          } else {
            scrapedAtIso = new Date().toISOString();
          }
          
          let createdAtIso: string;
          if (article.createdAt instanceof Date && !isNaN(article.createdAt.getTime())) {
            createdAtIso = article.createdAt.toISOString();
          } else if (typeof article.createdAt === 'string' && article.createdAt.length > 0) {
            createdAtIso = article.createdAt;
          } else {
            createdAtIso = new Date().toISOString();
          }

          const result = insert.run(
            id,
            article.title,
            article.content || '',
            article.source,
            article.url,
            publishedAtIso,
            categoriesJson,
            categoriesFlat,
            tagsJson,
            tagsFlat,
            marketLinksJson,
            marketLinksFlat,
            article.sentiment,
            article.importance,
            article.snippet || '',
            article.summary || '',
            scrapedAtIso,
            createdAtIso,
            urlHash,
            article.metadata ? JSON.stringify(article.metadata) : null
          );

          if (result.changes === 0) {
            duplicateUrls.push(article.url);
            continue;
          }

          storedIds.push(id);

          if (insertFts) {
            insertFts.run(
              article.title,
              article.content || '',
              article.snippet || '',
              article.summary || '',
              tags.join(' '),
              categories.join(' '),
              id
            );
          }
        } catch (error) {
          logger.error(`Failed to store article: ${article.title}`, error);
        }
      }
    });

    insertBatch(articles);

    if (storedIds.length > 0) {
      logger.info(`Stored ${storedIds.length} news articles, skipped ${duplicateUrls.length} duplicates`);
    }

    return { stored: storedIds, duplicates: duplicateUrls };
  }

  async getNewsSince(since: Date, limit: number = 5000): Promise<NewsItem[]> {
    await this.initialize();
    if (!this.db) return [];

    try {
      const resolvedLimit = Number.isFinite(limit) ? limit : 5000;
      const sinceIso = since.toISOString();

      const rows = this.db.prepare(`
        SELECT * FROM news_articles
        WHERE created_at >= ?
        ORDER BY created_at DESC
        LIMIT ?
      `).all(sinceIso, resolvedLimit) as any[];

      return rows.map(row => this.toNewsItem(row));
    } catch (error) {
      logger.error('Failed to get news since:', error);
      return [];
    }
  }

  async getRecentNews(limit: number = 50, category?: NewsCategory): Promise<NewsItem[]> {
    await this.initialize();
    if (!this.db) return [];

    try {
      const resolvedLimit = Number.isFinite(limit) ? limit : 50;

      const rows = (category
        ? this.db.prepare(`
            SELECT * FROM news_articles
            WHERE categories_flat LIKE ?
            ORDER BY created_at DESC
            LIMIT ?
          `).all(`%|${category}|%`, resolvedLimit)
        : this.db.prepare(`
            SELECT * FROM news_articles
            ORDER BY created_at DESC
            LIMIT ?
          `).all(resolvedLimit)) as any[];

      return rows.map(row => this.toNewsItem(row));
    } catch (error) {
      logger.error('Failed to get recent news:', error);
      return [];
    }
  }

  async getNewsByCategory(category: NewsCategory, limit: number = 50): Promise<NewsItem[]> {
    return this.getRecentNews(limit, category);
  }

  async getNewsByMarket(marketId: string, marketSlug?: string, limit: number = 30): Promise<NewsItem[]> {
    await this.initialize();
    if (!this.db) return [];

    const resolvedLimit = Number.isFinite(limit) ? limit : 30;
    const tokens = [marketId, marketSlug].filter(Boolean) as string[];
    if (tokens.length === 0) return [];

    try {
      const clauses = tokens.map(() => 'market_links_flat LIKE ?').join(' OR ');
      const values = tokens.map(token => `%|${token}|%`);
      const rows = this.db.prepare(`
        SELECT * FROM news_articles
        WHERE ${clauses}
        ORDER BY created_at DESC
        LIMIT ?
      `).all(...values, resolvedLimit) as any[];

      return rows.map(row => this.toNewsItem(row));
    } catch (error) {
      logger.error('Failed to get news by market:', error);
      return [];
    }
  }

  async searchNews(query: string, limit: number = 20): Promise<NewsItem[]> {
    await this.initialize();
    if (!this.db) return [];

    const trimmed = query.trim();
    if (!trimmed) return [];

    try {
      const resolvedLimit = Number.isFinite(limit) ? limit : 20;

      if (this.ftsEnabled) {
        const safeQuery = this.sanitizeFtsQuery(trimmed);
        if (safeQuery) {
          try {
            const hits = this.db.prepare(`
              SELECT id FROM news_articles_fts
              WHERE news_articles_fts MATCH ?
              ORDER BY bm25(news_articles_fts)
              LIMIT ?
            `).all(safeQuery, resolvedLimit) as Array<{ id: string }>;

            if (!hits.length) return [];

            const ids = hits.map(hit => hit.id);
            const rows = this.db.prepare(`
              SELECT * FROM news_articles
              WHERE id IN (${ids.map(() => '?').join(',')})
            `).all(...ids) as any[];

            const rowMap = new Map(rows.map(row => [row.id, row]));
            return ids.map(id => rowMap.get(id)).filter(Boolean).map(row => this.toNewsItem(row));
          } catch (error) {
            logger.warn('[NewsStore] FTS search failed, falling back to LIKE search');
          }
        }
      }

      const like = `%${trimmed}%`;
      const rows = this.db.prepare(`
        SELECT * FROM news_articles
        WHERE title LIKE ?
          OR content LIKE ?
          OR snippet LIKE ?
          OR summary LIKE ?
          OR tags_flat LIKE ?
          OR categories_flat LIKE ?
        ORDER BY created_at DESC
        LIMIT ?
      `).all(like, like, like, like, like, like, resolvedLimit) as any[];

      return rows.map(row => this.toNewsItem(row));
    } catch (error) {
      logger.error('Failed to search news:', error);
      return [];
    }
  }

  async getTags(): Promise<string[]> {
    await this.initialize();
    if (!this.db) return [];

    try {
      const rows = this.db.prepare(`
        SELECT tags FROM news_articles
      `).all() as Array<{ tags: string }>;

      const tagSet = new Set<string>();
      for (const row of rows) {
        const tags = this.parseJsonArray<string>(row.tags);
        tags.forEach(tag => tagSet.add(tag));
      }

      return Array.from(tagSet).sort();
    } catch (error) {
      logger.error('Failed to get tags:', error);
      return [];
    }
  }

  async getStats(): Promise<NewsStats> {
    await this.initialize();
    if (!this.db) {
      return {
        total: 0,
        byCategory: {} as any,
        byImportance: {} as any,
        bySentiment: {} as any,
        latestArticle: null,
        totalTags: 0,
      };
    }

    try {
      const rows = this.db.prepare(`
        SELECT categories, tags, importance, sentiment, published_at, created_at
        FROM news_articles
      `).all() as Array<{
        categories: string;
        tags: string;
        importance: string;
        sentiment: string;
        published_at: string | null;
        created_at: string;
      }>;

      const stats: NewsStats = {
        total: rows.length,
        byCategory: {} as any,
        byImportance: {} as any,
        bySentiment: {} as any,
        latestArticle: null,
        totalTags: 0,
      };

      const tagSet = new Set<string>();
      let latestDate: Date | null = null;

      for (const row of rows) {
        const categories = this.parseJsonArray<NewsCategory>(row.categories);
        const tags = this.parseJsonArray<string>(row.tags);

        categories.forEach(category => {
          stats.byCategory[category] = (stats.byCategory[category] || 0) + 1;
        });

        stats.byImportance[row.importance as NewsImportance] =
          (stats.byImportance[row.importance as NewsImportance] || 0) + 1;
        stats.bySentiment[row.sentiment as NewsSentiment] =
          (stats.bySentiment[row.sentiment as NewsSentiment] || 0) + 1;

        tags.forEach(tag => tagSet.add(tag));

        const dateValue = row.published_at || row.created_at;
        const parsedDate = new Date(dateValue);
        if (!latestDate || parsedDate > latestDate) {
          latestDate = parsedDate;
        }
      }

      stats.latestArticle = latestDate;
      stats.totalTags = tagSet.size;

      return stats;
    } catch (error) {
      logger.error('Failed to get stats:', error);
      return {
        total: 0,
        byCategory: {} as any,
        byImportance: {} as any,
        bySentiment: {} as any,
        latestArticle: null,
        totalTags: 0,
      };
    }
  }

  async getCount(): Promise<number> {
    await this.initialize();
    if (!this.db) return 0;
    const row = this.db.prepare('SELECT COUNT(*) as total FROM news_articles').get() as { total: number };
    return row?.total || 0;
  }

  async getArticleById(id: string): Promise<NewsItem | null> {
    await this.initialize();
    if (!this.db) return null;

    try {
      const row = this.db.prepare('SELECT * FROM news_articles WHERE id = ?').get(id) as any;
      if (!row) return null;
      return this.toNewsItem(row);
    } catch (error) {
      logger.error(`Failed to get article by id ${id}:`, error);
      return null;
    }
  }

  async updateArticleSummary(id: string, summary: string): Promise<boolean> {
    await this.initialize();
    if (!this.db) return false;

    try {
      const result = this.db.prepare(`
        UPDATE news_articles 
        SET summary = ? 
        WHERE id = ?
      `).run(summary, id);

      if (this.ftsEnabled && result.changes > 0) {
        this.db.prepare(`
          UPDATE news_articles_fts 
          SET summary = ? 
          WHERE id = ?
        `).run(summary, id);
      }

      return result.changes > 0;
    } catch (error) {
      logger.error(`Failed to update article summary for ${id}:`, error);
      return false;
    }
  }
}

const newsStore = new NewsStore();
export default newsStore;
