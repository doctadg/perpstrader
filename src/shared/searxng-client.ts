// SearXNG Search Client - Direct integration for news ingestion
// Bypasses the search server and uses SearXNG directly

import axios from 'axios';
import logger from './logger';

interface SearXNGResult {
  title: string;
  url: string;
  content: string;
  publishedDate?: string;
  engine: string;
  score: number;
}

interface SearXNGResponse {
  query: string;
  number_of_results: number;
  results: SearXNGResult[];
}

/**
 * Search using local SearXNG instance
 */
export async function searchSearXNG(
  query: string,
  numResults: number = 10,
  category: string = 'general'
): Promise<SearXNGResult[]> {
  const searxngUrl = process.env.SEARXNG_URL || 'http://localhost:8080';
  
  try {
    const params = new URLSearchParams({
      q: query,
      format: 'json',
      categories: category,
      language: 'en-US',
      safesearch: '0',
    });

    const response = await axios.get(`${searxngUrl}/search?${params.toString()}`, {
      timeout: 30000,
      headers: {
        'Accept': 'application/json',
      },
    });

    const data = response.data as SearXNGResponse;
    
    logger.info(`[SearXNG] Query: "${query}" - Found ${data.results?.length || 0} results`);
    
    return (data.results || []).slice(0, numResults).map(r => ({
      title: r.title,
      url: r.url,
      content: r.content,
      publishedDate: r.publishedDate,
      engine: r.engine,
      score: r.score,
    }));
  } catch (error) {
    logger.error(`[SearXNG] Search failed for "${query}":`, error);
    return [];
  }
}

/**
 * Search multiple queries in parallel
 */
export async function searchSearXNGParallel(
  queries: string[],
  numResults: number = 10
): Promise<Map<string, SearXNGResult[]>> {
  const results = new Map<string, SearXNGResult[]>();
  
  // Rate limit: 2 concurrent searches
  const batchSize = 2;
  
  for (let i = 0; i < queries.length; i += batchSize) {
    const batch = queries.slice(i, i + batchSize);
    const batchResults = await Promise.all(
      batch.map(q => searchSearXNG(q, numResults))
    );
    
    batch.forEach((query, idx) => {
      results.set(query, batchResults[idx]);
    });
    
    // Small delay between batches
    if (i + batchSize < queries.length) {
      await new Promise(r => setTimeout(r, 500));
    }
  }
  
  return results;
}

/**
 * Check SearXNG health
 */
export async function checkSearXNGHealth(): Promise<{ ok: boolean; latency: number; message: string }> {
  const searxngUrl = process.env.SEARXNG_URL || 'http://localhost:8080';
  const start = Date.now();
  
  try {
    const response = await axios.get(searxngUrl, {
      timeout: 10000,
    });
    
    const latency = Date.now() - start;
    
    if (response.status === 200) {
      return { ok: true, latency, message: `Healthy (${latency}ms)` };
    }
    
    return { ok: false, latency, message: `HTTP ${response.status}` };
  } catch (error) {
    return { ok: false, latency: Date.now() - start, message: String(error) };
  }
}
