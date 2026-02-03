// Local News Classification Service
// Provides reliable event classification without API dependencies
// Used as fallback when GLM is unavailable

import { NewsArticle, NewsCategory } from '../shared/types';
import { deriveTrend } from './news-trend';

const TREND_UP_KEYWORDS = [
    'surge', 'soar', 'rally', 'breaks', 'breakout', 'jumps', 'gains', 'rises', 'climbs',
    'hits', 'tops', 'surges', 'approves', 'launches', 'lists', 'partnership', 'partners',
    'announces', 'unveils', 'debuts', 'record', 'milestone', 'beat', 'exceeds', 'beats',
    'upgrades', 'accumulate', 'purchase', 'buys', 'acquire', 'acquisition'
];

const TREND_DOWN_KEYWORDS = [
    'plunge', 'crash', 'drops', 'falls', 'declines', 'sinks', 'tumbles', 'plummets',
    'hack', 'hacked', 'exploit', 'breach', 'ban', 'bans', 'banned', 'sanction', 'sanctions',
    'seizure', 'seizes', 'seized', 'raid', 'raids', 'crackdown', 'rejects', 'rejected',
    'delist', 'delists', 'delisting', 'plunges', 'crashes', 'underperform', 'miss', 'misses',
    'downgrade', 'liquidation', 'liquidations'
];

const CRITICAL_KEYWORDS = [
    'breaking', 'crisis', 'emergency', 'collapse', 'bankruptcy', 'default', 'hack',
    'seizure', 'seizes', 'raid', 'major', 'significant', 'urgent', 'critical', 'explosive'
];

const HIGH_KEYWORDS = [
    'announcement', 'announces', 'launch', 'launches', 'approval', 'approves', 'regulation',
    'official', 'officially', 'fed', 'central bank', 'ecb', 'boj', 'pBoC'
];

const SUB_EVENT_PATTERNS: Record<string, RegExp[]> = {
    seizure: [/seize/i, /seiz/i, /raid/i, /captur/i, /takeover/i],
    approval: [/approv/i, /clearance/i, /authorization/i, /greenlight/i, /permit/i],
    launch: [/launch/i, /debut/i, /unveil/i, /rollout/i, /introduc/i, /start/i],
    hack: [/hack/i, /exploit/i, /breach/i, /vulnerabilit/i, /compromis/i, /drain/i],
    sanction: [/sanction/i, /embargo/i, /ban/i, /blacklist/i, /restrict/i],
    earnings: [/earnings/i, /results/i, /profit/i, /revenue/i, /guidance/i, /beat/i, /miss/i],
    price_surge: [/surge/i, /soar/i, /rally/i, /jumps/i, /breaks/i, /breakout/i, /rall/i],
    price_drop: [/plunge/i, /crash/i, /drop/i, /fall/i, /decline/i, /sink/i, /tumble/i],
    partnership: [/partnership/i, /partner/i, /collaboration/i, /alliance/i, /integrat/i, /teammate/i],
    listing: [/list/i, /listed/i, /listing/i, /exchange/i, /trading/i, /debut/i],
    delisting: [/delist/i, /delisting/i, /suspend/i, /suspended/i],
    proposal: [/propos/i, /plan/i, /proposal/i, /suggest/i, /consider/i],
    ruling: [/ruling/i, /court/i, /judge/i, /decision/i, /verdict/i, /order/i],
    conflict: [/conflict/i, /war/i, /tension/i, /clash/i, /fight/i, /battle/i],
    protest: [/protest/i, /demonstrat/i, /rally/i, /march/i, /strikes/i],
    merger: [/merger/i, /merge/i, /acquire/i, /acquisition/i, /buyout/i, /takeover/i],
    regulation: [/regulation/i, /regulator/i, /sec/i, /cfi?c/i, /rule/i, /guideline/i],
};

const SPORTS_LEAGUES: Record<string, RegExp[]> = {
    'Premier League': [/premier league/i, /epl/i, /brentford/i, /sunderland/i, /manchester/i, /liverpool/i, /arsenal/i, /chelsea/i],
    'NBA': [/nba/i, /basketball/i, /lakers/i, /celtics/i, /warriors/i, /nba draft/i],
    'NFL': [/nfl/i, /football/i, /super bowl/i, /cowboys/i, /patriors/i, / chiefs/i],
    'UFC': [/ufc/i, /mma/i, /fight night/i, /bellator/i, /pfl/i, /octagon/i],
    'Tennis': [/tennis/i, /wimbledon/i, /us open/i, /french open/i, /australian open/i, /atp/i, /wta/i],
    'Golf': [/golf/i, /pga/i, /masters/i, /ryder cup/i, /us open/i, /augusta/i],
    'Serie A': [/serie a/i, /italian/i, /juve/i, /inter milan/i, /ac milan/i, /sassuolo/i],
};

export interface LocalClassification {
    topic: string;
    subEventType: string;
    trendDirection: 'UP' | 'DOWN' | 'NEUTRAL';
    urgency: 'CRITICAL' | 'HIGH' | 'MEDIUM' | 'LOW';
    keywords: string[];
    confidence: number;
}

export function classifyArticleLocally(article: NewsArticle): LocalClassification {
    const title = article.title;
    const lowerTitle = title.toLowerCase();
    const content = (article.content || article.snippet || '').toLowerCase();
    const text = `${lowerTitle} ${content}`;
    
    // Extract entities and keywords
    const keywords: string[] = [];
    
    // Extract crypto tickers
    const cryptoTickers = extractCryptoTickers(text);
    keywords.push(...cryptoTickers);
    
    // Extract sports league
    const sportsLeague = detectSportsLeague(lowerTitle);
    if (sportsLeague) {
        keywords.push(sportsLeague);
    }
    
    // Detect sub-event type
    const subEventType = detectSubEventType(text);
    
    // Detect trend direction
    const trendDirection = detectTrendDirection(lowerTitle, subEventType);
    
    // Detect urgency
    const urgency = detectUrgency(text, article.importance);
    
    // Build topic from title
    const topic = buildSpecificTopic(title, cryptoTickers, subEventType, sportsLeague);
    
    // Calculate confidence
    const confidence = calculateConfidence(title, subEventType, trendDirection);
    
    return {
        topic,
        subEventType,
        trendDirection,
        urgency,
        keywords: [...new Set(keywords)],
        confidence,
    };
}

function extractCryptoTickers(text: string): string[] {
    const tickers: string[] = [];
    const knownTickers = [
        'BTC', 'ETH', 'SOL', 'XRP', 'BNB', 'DOGE', 'ADA', 'AVAX', 'DOT', 'LINK',
        'MATIC', 'POL', 'ARB', 'OP', 'LTC', 'BCH', 'ETC', 'TRX', 'TON', 'ATOM',
        'NEAR', 'APT', 'SUI', 'ICP', 'FIL', 'INJ', 'RNDR', 'RUNE', 'UNI', 'AAVE',
        'MKR', 'SNX', 'LDO', 'JUP', 'TIA', 'FTM', 'PEPE', 'SHIB',
    ];
    
    for (const ticker of knownTickers) {
        const regex = new RegExp(`\\b${ticker}\\b`, 'i');
        if (regex.test(text)) {
            tickers.push(ticker);
        }
    }
    
    return tickers;
}

function detectSportsLeague(text: string): string | null {
    for (const [league, patterns] of Object.entries(SPORTS_LEAGUES)) {
        for (const pattern of patterns) {
            if (pattern.test(text)) {
                return league;
            }
        }
    }
    return null;
}

function detectSubEventType(text: string): string {
    for (const [eventType, patterns] of Object.entries(SUB_EVENT_PATTERNS)) {
        for (const pattern of patterns) {
            if (pattern.test(text)) {
                return eventType;
            }
        }
    }
    return 'other';
}

function detectTrendDirection(text: string, subEventType: string): 'UP' | 'DOWN' | 'NEUTRAL' {
    // Check sub-event type first
    const upTypes = ['approval', 'launch', 'listing', 'partnership', 'breakout', 'price_surge', 'earnings'];
    const downTypes = ['hack', 'sanction', 'delisting', 'price_drop', 'seizure', 'crackdown', 'conflict'];
    
    if (upTypes.includes(subEventType)) return 'UP';
    if (downTypes.includes(subEventType)) return 'DOWN';
    
    // Check keywords
    let upCount = 0;
    let downCount = 0;
    
    for (const kw of TREND_UP_KEYWORDS) {
        if (text.includes(kw)) upCount++;
    }
    
    for (const kw of TREND_DOWN_KEYWORDS) {
        if (text.includes(kw)) downCount++;
    }
    
    if (upCount > downCount * 1.3 && upCount > 1) return 'UP';
    if (downCount > upCount * 1.3 && downCount > 1) return 'DOWN';
    
    return 'NEUTRAL';
}

function detectUrgency(text: string, importance: string): 'CRITICAL' | 'HIGH' | 'MEDIUM' | 'LOW' {
    // Check importance from categorization
    if (importance === 'CRITICAL') return 'CRITICAL';
    if (importance === 'HIGH') return 'HIGH';
    if (importance === 'LOW') return 'LOW';
    
    // Check keywords
    for (const kw of CRITICAL_KEYWORDS) {
        if (text.includes(kw)) return 'CRITICAL';
    }
    
    for (const kw of HIGH_KEYWORDS) {
        if (text.includes(kw)) return 'HIGH';
    }
    
    return 'MEDIUM';
}

function buildSpecificTopic(title: string, tickers: string[], subEventType: string, sportsLeague: string | null): string {
    // Extract key words from title (skip common words)
    const stopWords = new Set([
        'the', 'a', 'an', 'and', 'or', 'but', 'in', 'on', 'at', 'to', 'for', 'of', 'with',
        'by', 'from', 'up', 'down', 'is', 'are', 'was', 'be', 'been', 'being', 'have', 'has',
        'had', 'do', 'does', 'did', 'will', 'would', 'could', 'should', 'may', 'might',
        'must', 'shall', 'can', 'need', 'this', 'that', 'these', 'those', 'it', 'its',
        'as', 'if', 'than', 'so', 'because', 'while', 'when', 'where', 'what', 'which',
        'who', 'whom', 'whose', 'why', 'how', 'all', 'each', 'every', 'both', 'few',
        'more', 'most', 'other', 'some', 'such', 'no', 'not', 'only', 'same', 'just',
        'about', 'after', 'before', 'above', 'below', 'between', 'into', 'through',
        'during', 'under', 'again', 'further', 'then', 'once', 'here', 'there', 'news',
        'today', 'latest', 'update', 'report', 'reports', 'says', 'said', 'according',
        'market', 'markets', 'price', 'prices', 'trading', 'traders'
    ]);
    
    const words = title.split(/\s+/);
    const meaningfulWords: string[] = [];
    
    for (const word of words) {
        const cleaned = word.replace(/[^a-zA-Z0-9$-]/g, '').toLowerCase();
        if (cleaned.length > 2 && !stopWords.has(cleaned) && !/^\d+$/.test(cleaned)) {
            meaningfulWords.push(cleaned);
        }
    }
    
    // Build topic - entity + action + key details
    const parts: string[] = [];
    
    // Add ticker if present
    if (tickers.length > 0) {
        parts.push(tickers[0].toUpperCase());
    }
    
    // Add sports league if present
    if (sportsLeague) {
        parts.push(sportsLeague);
    }
    
    // Add key entity words first (skip action-related words to avoid duplication)
    const actionWords = new Set(['seize', 'seizes', 'seized', 'seizing', 'approve', 'approves', 'approved',
        'launch', 'launches', 'launched', 'hack', 'hacked', 'sanction', 'sanctions', 'sanctioned',
        'plunge', 'plunges', 'plunged', 'crash', 'crashes', 'crashed', 'surge', 'surges', 'surged',
        'break', 'breaks', 'broke', 'broken', 'announce', 'announces', 'announced', 'drains',
        'signals', 'prediction', 'picks', 'approves']);
    
    for (let i = 0; i < Math.min(3, meaningfulWords.length); i++) {
        const word = meaningfulWords[i];
        if (!tickers.includes(word.toUpperCase()) && 
            !actionWords.has(word) &&
            !parts.some(p => p.toLowerCase() === word)) {
            parts.push(word);
        }
    }
    
    // Add action/sub-event description LAST
    if (subEventType !== 'other') {
        const actionMap: Record<string, string> = {
            seizure: 'seizure',
            approval: 'approval',
            launch: 'launch',
            hack: 'hack',
            sanction: 'sanctions',
            earnings: 'earnings',
            price_surge: 'surge',
            price_drop: 'plunge',
            breakout: 'breakout',
            partnership: 'partnership',
            listing: 'listing',
            delisting: 'delisting',
            merger: 'merger',
            acquisition: 'acquisition',
            proposal: 'proposal',
            ruling: 'ruling',
            protest: 'protest',
            conflict: 'conflicts',
        };
        parts.push(actionMap[subEventType] || subEventType);
    }
    
    let topic = parts.slice(0, 6).join(' ');
    
    // If topic is too short or generic, use derived trend
    if (topic.length < 10) {
        return deriveTrend({ title, tags: [] }).topic;
    }
    
    return topic;
}

function calculateConfidence(title: string, subEventType: string, trendDirection: string): number {
    let confidence = 0.5;
    
    // Higher confidence if we detected a specific sub-event
    if (subEventType !== 'other') confidence += 0.2;
    
    // Higher confidence if we have trend indicators
    if (trendDirection !== 'NEUTRAL') confidence += 0.1;
    
    // Lower confidence for very short titles
    if (title.split(' ').length < 5) confidence -= 0.1;
    
    // Higher confidence for titles with numbers (specifics)
    if (/\d/.test(title)) confidence += 0.1;
    
    return Math.max(0.3, Math.min(0.95, confidence));
}

export function classifyBatch(articles: NewsArticle[]): LocalClassification[] {
    return articles.map(article => classifyArticleLocally(article));
}

// Helper to integrate with existing deriveTrend
export function enhanceWithLocalClassification(
    article: NewsArticle,
    derivedTopic: string,
    derivedKeywords: string[]
): { topic: string; trendDirection: string; urgency: string; keywords: string[] } {
    const local = classifyArticleLocally(article);
    
    // Use local topic if derived is generic
    const topic = (derivedTopic.length < 15 || derivedTopic.includes('price action'))
        ? local.topic 
        : derivedTopic;
    
    // Use local trend direction and urgency
    const trendDirection = local.trendDirection;
    const urgency = local.urgency;
    
    // Merge keywords
    const keywords = [...new Set([...local.keywords, ...derivedKeywords])].slice(0, 10);
    
    return { topic, trendDirection, urgency, keywords };
}
