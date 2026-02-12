# Predictions Correlation Page - UI/UX Design Document

**Project:** PerpsTrader Dashboard  
**Location:** http://192.168.1.70:3001/correlations  
**Target Users:** Professional traders seeking alpha from news-to-market correlations  
**Design Philosophy:** Multi-million dollar fintech aesthetic with cyberpunk-terminal DNA

---

## 1. Design System Foundation

### 1.1 Color Palette

```css
:root {
  /* Core Backgrounds */
  --bg-obsidian: #050507;           /* Primary background */
  --bg-panel: rgba(12, 12, 18, 0.85); /* Panel backgrounds */
  --bg-elevated: rgba(20, 20, 30, 0.9); /* Hover/selected states */
  --bg-input: rgba(8, 8, 12, 0.95);   /* Input fields */
  
  /* Accent Colors */
  --terminal-green: #00ff9d;        /* Success, positive PnL, bullish */
  --terminal-cyan: #00f2ff;         /* Primary accent, links, active */
  --terminal-amber: #ffb300;        /* Warnings, medium confidence */
  --terminal-red: #ff3e3e;          /* Errors, negative PnL, bearish */
  --terminal-purple: #a855f7;       /* Premium features, AI insights */
  --terminal-orange: #f97316;       /* High urgency, closing soon */
  
  /* Correlation-Specific Gradients */
  --correlation-high: linear-gradient(135deg, #00ff9d 0%, #00f2ff 100%);
  --correlation-medium: linear-gradient(135deg, #00f2ff 0%, #a855f7 100%);
  --correlation-low: linear-gradient(135deg, #a855f7 0%, #64748b 100%);
  --confidence-glow: 0 0 20px rgba(0, 242, 255, 0.4);
  
  /* Borders */
  --border-low: rgba(0, 242, 255, 0.15);
  --border-med: rgba(0, 242, 255, 0.4);
  --border-high: rgba(0, 242, 255, 0.7);
  --border-glow: 0 0 15px rgba(0, 242, 255, 0.3);
  
  /* Text */
  --text-primary: #e0e0e0;
  --text-secondary: #888888;
  --text-muted: #555555;
  --text-inverse: #050507;
}
```

### 1.2 Typography

```css
:root {
  --font-mono: 'JetBrains Mono', monospace;    /* Data, timestamps, IDs */
  --font-sans: 'Inter', sans-serif;             /* Headings, body text */
  --font-display: 'Inter', sans-serif;          /* Large numbers, titles */
  
  /* Type Scale */
  --text-xs: 0.65rem;      /* Labels, metadata */
  --text-sm: 0.75rem;      /* Secondary data */
  --text-base: 0.875rem;   /* Body text */
  --text-lg: 1rem;         /* Card titles */
  --text-xl: 1.25rem;      /* Section headers */
  --text-2xl: 1.5rem;      /* Page titles */
  --text-3xl: 2rem;        /* Hero stats */
}
```

### 1.3 Spacing & Layout

```css
:root {
  --space-1: 4px;
  --space-2: 8px;
  --space-3: 12px;
  --space-4: 16px;
  --space-5: 20px;
  --space-6: 24px;
  --space-8: 32px;
  --space-10: 40px;
  
  /* Panel System */
  --panel-padding: 16px;
  --panel-gap: 20px;
  --panel-border-radius: 0;  /* Sharp corners for terminal aesthetic */
  --panel-border: 1px solid var(--border-low);
}
```

### 1.4 Animation Specifications

```css
:root {
  /* Transitions */
  --transition-fast: 0.15s ease;
  --transition-normal: 0.3s cubic-bezier(0.165, 0.84, 0.44, 1);
  --transition-slow: 0.5s ease;
  
  /* Keyframe Animations */
  --pulse-glow: pulse-glow 2s infinite;
  --scan-line: scan-line 8s linear infinite;
  --correlation-pulse: correlation-pulse 1.5s ease-in-out infinite;
}

@keyframes correlation-pulse {
  0%, 100% { box-shadow: 0 0 5px var(--terminal-cyan); }
  50% { box-shadow: 0 0 20px var(--terminal-cyan), 0 0 40px rgba(0, 242, 255, 0.3); }
}

@keyframes confidence-shimmer {
  0% { background-position: -200% center; }
  100% { background-position: 200% center; }
}
```

---

## 2. View Architecture

### 2.1 Navigation Structure

```
/correlations                    → Main Correlation Feed (default)
/correlations/article/:id        → Article Detail View
/correlations/discover           → Market Discovery Browse
/correlations/trending           → Trending Correlations
```

### 2.2 Layout Shell

```typescript
interface CorrelationLayoutProps {
  children: React.ReactNode;
  activeView: 'feed' | 'article' | 'discover' | 'trending';
  onViewChange: (view: string) => void;
}

// Persistent elements across all views:
// - Top navigation bar with view tabs
// - Real-time correlation ticker
// - Filter sidebar (collapsible on mobile)
// - Connection status indicator
```

---

## 3. Main Correlation Feed View

### 3.1 Wireframe Description

```
┌─────────────────────────────────────────────────────────────────────────────┐
│ [SYS_CORR.001]    PREDICTION_CORRELATIONS    [LIVE]    [FILTER ▼] [REFRESH] │
├─────────────────────────────────────────────────────────────────────────────┤
│ ┌─────────────────────────────────────────────────────────────────────────┐ │
│ │ ▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓ │ │
│ │  CORRELATION TICKER: BTC ETF Approval → YES tokens +12% | ETH Merge...  │ │
│ └─────────────────────────────────────────────────────────────────────────┘ │
├─────────────────────────────────────────────────────────────────────────────┤
│  [FEED]  [DISCOVER]  [TRENDING]  [SAVED]                                    │
├──────────────┬──────────────────────────────────────────────────────────────┤
│              │  ┌────────────────────────────────────────────────────────┐  │
│  FILTERS     │  │ 🔥 HIGH CONFIDENCE    [X]                              │  │
│  ──────────  │  │                                                        │  │
│  Categories  │  │  BTC Spot ETF Approval Deadline                        │  │
│  ☑ CRYPTO    │  │  ═══════════════════════════════════════════════════   │  │
│  ☐ STOCKS    │  │  📰 Reuters: "SEC expected to approve multiple BTC      │  │
│  ☑ ECONOMICS │  │     ETFs by Jan 10 deadline"                           │  │
│  ☐ POLITICS  │  │     2 hrs ago • Reuters • Sentiment: BULLISH           │  │
│              │  │                                                        │  │
│  Confidence  │  │  CORRELATED MARKETS:                                   │  │
│  ├─▓▓▓▓▓░░   │  │  ┌────────────────────────────────────────────────┐    │  │
│  │ 80-100%   │  │  │ Will BTC ETF approve by Jan 15?                │    │  │
│  ├─▓▓▓░░░░░  │  │  │ ████████████████████░░░░  YES: 0.84 | NO: 0.16 │    │  │
│  │ 60-79%    │  │  │ Volume: $2.4M | Closes: 4d | Correlation: 94%  │    │  │
│  └─▓░░░░░░░  │  │  │ [VIEW] [TRADE] [DISMISS]                        │    │  │
│              │  │  └────────────────────────────────────────────────┘    │  │
│  Status      │  │  ┌────────────────────────────────────────────────┐    │  │
│  ☑ Open      │  │  │ Will total ETF inflows >$1B in first week?     │    │  │
│  ☑ Closing   │  │  │ ██████████████░░░░░░░░░░  YES: 0.62 | NO: 0.38 │    │  │
│  ☐ Resolved  │  │  │ Volume: $890K | Closes: 7d | Correlation: 71%  │    │  │
│              │  │  │ [VIEW] [TRADE] [DISMISS]                        │    │  │
│  Volume      │  │  └────────────────────────────────────────────────┘    │  │
│  ├─▓▓▓▓▓▓▓   │  │                                                        │  │
│  └─▓▓░░░░░   │  └────────────────────────────────────────────────────────┘  │
│              │                                                              │
│  [RESET]     │  ┌────────────────────────────────────────────────────────┐  │
│              │  │ ⚡ TRENDING NOW                                        │  │
│              │  │                                                        │  │
│              │  │  Trump Policy Speech Impact                            │  │
│              │  │  ═══════════════════════════════════════════════════   │  │
│              │  │  📰 CNN: "Trump announces crypto strategic reserve"    │  │
│              │  │     45 min ago • CNN • Sentiment: NEUTRAL              │  │
│              │  │                                                        │  │
│              │  │  CORRELATED MARKETS (2):                               │  │
│              │  │  [MARKET_PREVIEW] [MARKET_PREVIEW]                     │  │
│              │  └────────────────────────────────────────────────────────┘  │
└──────────────┴──────────────────────────────────────────────────────────────┘
```

### 3.2 Component Breakdown

#### 3.2.1 CorrelationArticleCard

```typescript
interface CorrelationArticleCardProps {
  article: CorrelatedArticle;
  isExpanded: boolean;
  onExpand: () => void;
  onDismiss: () => void;
  onTrade: (market: PredictionMarket) => void;
}

interface CorrelatedArticle {
  id: string;
  title: string;
  source: string;
  publishedAt: Date;
  snippet: string;
  sentiment: 'BULLISH' | 'BEARISH' | 'NEUTRAL';
  importance: 'LOW' | 'MEDIUM' | 'HIGH' | 'CRITICAL';
  categories: NewsCategory[];
  imageUrl?: string;
  correlatedMarkets: CorrelatedMarket[];
  heatScore: number;        // 0-100 trending indicator
  isBreaking: boolean;
}

interface CorrelatedMarket {
  market: PredictionMarket;
  correlationScore: number;    // 0-100
  correlationReason: string;   // AI-generated explanation
  confidenceLevel: 'HIGH' | 'MEDIUM' | 'LOW';
  priceImpact: {              // Predicted impact
    direction: 'UP' | 'DOWN' | 'NEUTRAL';
    magnitude: number;        // Estimated % move
  };
}
```

**Visual States:**
- **Default:** Subtle cyan border, clean panel
- **High Confidence:** Animated cyan glow border, "HIGH CONFIDENCE" badge
- **Breaking:** Red pulse animation on left border, "BREAKING" chip
- **Hovered:** Slight elevation, show quick actions
- **Dismissed:** Slide out animation, opacity fade

#### 3.2.2 MarketPreviewCard

```typescript
interface MarketPreviewCardProps {
  market: CorrelatedMarket;
  layout: 'compact' | 'full';
  onView: () => void;
  onTrade: () => void;
}

// Compact Layout (used in article cards)
// - Mini price bar (YES/NO)
// - Volume + Close time
// - Correlation score badge
// - Hover: Quick action buttons appear

// Full Layout (used in detail view)
// - Full price chart sparkline
// - Outcome probabilities
// - Order book preview
// - Related news
```

#### 3.2.3 CorrelationScoreBadge

```typescript
interface CorrelationScoreBadgeProps {
  score: number;        // 0-100
  size: 'sm' | 'md' | 'lg';
  showLabel: boolean;
}

// Visual representation:
// - 90-100: Green gradient, "EXCELLENT" label
// - 75-89: Cyan gradient, "STRONG" label  
// - 60-74: Amber gradient, "MODERATE" label
// - <60: Gray gradient, "WEAK" label
// - Animated circular progress indicator
```

### 3.3 Real-Time Updates

```typescript
// WebSocket events handled:
interface CorrelationWebSocketEvents {
  'correlation:new': NewCorrelationEvent;
  'correlation:update': CorrelationUpdateEvent;
  'correlation:expire': CorrelationExpireEvent;
  'market:price': MarketPriceUpdate;
  'market:volume': MarketVolumeUpdate;
  'article:breaking': BreakingNewsEvent;
}

// UI Behaviors:
// - New correlations: Slide in from top with animation
// - Price updates: Flash green/red on price change
// - Breaking news: Red pulse on article card, sound notification
// - Expired markets: Gray out, move to "Recently Closed" section
```

---

## 4. Article Detail View

### 4.1 Wireframe Description

```
┌─────────────────────────────────────────────────────────────────────────────┐
│ [← BACK TO FEED]    ARTICLE_ANALYSIS_NODE    [SAVE] [SHARE]                 │
├─────────────────────────────────────────────────────────────────────────────┤
│                                                                             │
│  ┌─────────────────────────────────────────────────────────────────────┐   │
│  │  🔥 HIGH CONFIDENCE  │  📰 Reuters  │  2h ago  │  CRYPTO            │   │
│  │                                                                     │   │
│  │  SEC Expected to Approve Multiple Bitcoin ETFs by January Deadline  │   │
│  │                                                                     │   │
│  │  The U.S. Securities and Exchange Commission is expected to approve │   │
│  │  multiple spot Bitcoin exchange-traded funds by the January 10     │   │
│  │  deadline, according to sources familiar with the matter. This     │   │
│  │  landmark decision could open the floodgates for institutional...  │   │
│  │                                                                     │   │
│  │  [READ FULL ARTICLE →]                                              │   │
│  └─────────────────────────────────────────────────────────────────────┘   │
│                                                                             │
│  ┌─────────────────────────────────────────────────────────────────────┐   │
│  │  AI CORRELATION ANALYSIS                                            │   │
│  │  ═══════════════════════════════════════════════════════════════    │   │
│  │                                                                     │   │
│  │  ┌─────────────┐  KEY INSIGHTS:                                    │   │
│  │  │             │  • ETF approval directly impacts BTC price        │   │
│  │  │   SCORE     │  • Historical precedent: Similar approvals +15%   │   │
│  │  │             │  • Market pricing in 84% probability of YES       │   │
│  │  │    94%      │  • Time decay: High urgency as deadline approaches│   │
│  │  │             │                                                     │   │
│  │  │  EXCELLENT  │  CONFIDENCE FACTORS:                                │   │
│  │  │             │  ✓ Direct causation (regulatory → market)         │   │
│  │  │  MATCH      │  ✓ Specific date certainty                        │   │
│  │  └─────────────┘  ✓ High market volume & liquidity                  │   │
│  │                   ⚠ Single source dependency                        │   │
│  └─────────────────────────────────────────────────────────────────────┘   │
│                                                                             │
│  ┌─────────────────────────────────────────────────────────────────────┐   │
│  │  CORRELATED MARKETS (3)                                             │   │
│  │  ═══════════════════════════════════════════════════════════════    │   │
│  │                                                                     │   │
│  │  ┌──────────────────────────────────────────────────────────────┐  │   │
│  │  │ Will spot Bitcoin ETF be approved by Jan 15, 2024?          │  │   │
│  │  │ [████████████████████████████████████████░░░░] YES: 84¢     │  │   │
│  │  │ [░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░▓▓▓▓] NO: 16¢      │  │   │
│  │  │                                                              │  │   │
│  │  │  Correlation: 94%  │  Vol: $2.4M  │  Liquidity: HIGH        │  │   │
│  │  │  Closes: 4 days    │  Your Position: None                     │  │   │
│  │  │                                                              │  │   │
│  │  │  WHY THIS MATCHES:                                           │  │   │
│  │  │  "Article directly discusses SEC approval timeline. Market   │  │   │
│  │  │   question is identical to event described. Historical ETF   │  │   │
│  │  │   approvals have caused 10-20% same-day BTC moves."          │  │   │
│  │  │                                                              │  │   │
│  │  │  [VIEW MARKET]  [TRADE $100]  [TRADE $500]  [CUSTOM]        │  │   │
│  │  └──────────────────────────────────────────────────────────────┘  │   │
│  │                                                                     │   │
│  │  [2 MORE MARKETS...]                                                │   │
│  └─────────────────────────────────────────────────────────────────────┘   │
│                                                                             │
│  ┌─────────────────────────────────────────────────────────────────────┐   │
│  │  SOURCE RELIABILITY                                                 │   │
│  │  ═══════════════════════════════════════════════════════════════    │   │
│  │                                                                     │   │
│  │  Reuters  ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━  TRUST: 96%      │   │
│  │  ├─ Prediction accuracy: 94% (17 predictions)                       │   │
│  │  ├─ Timeliness score: 98%                                           │   │
│  │  └─ Bias indicator: NEUTRAL                                         │   │
│  │                                                                     │   │
│  │  [VIEW SOURCE HISTORY]                                              │   │
│  └─────────────────────────────────────────────────────────────────────┘   │
│                                                                             │
└─────────────────────────────────────────────────────────────────────────────┘
```

### 4.2 Component Breakdown

#### 4.2.1 ArticleHeader
- Full article title with importance badge
- Source attribution with trust score
- Publish time with "X hours ago" relative format
- Category tags
- Action buttons (Save, Share, Export)

#### 4.2.2 CorrelationAnalysisPanel
- Large circular correlation score
- AI-generated insight bullets
- Confidence factor checklist
- Historical precedent reference

#### 4.2.3 MarketDetailCard
- Full market title with status indicator
- Price probability bars (animated)
- Key metrics grid (volume, liquidity, close time)
- AI reasoning for correlation
- Quick trade buttons
- Position indicator (if user has open position)

#### 4.2.4 SourceReliabilityPanel
- Source trust score
- Historical prediction accuracy
- Timeliness metrics
- Bias assessment
- Link to source history

---

## 5. Market Discovery View

### 5.1 Wireframe Description

```
┌─────────────────────────────────────────────────────────────────────────────┐
│ [SYS_DISC.002]    MARKET_DISCOVERY_NODE    [LIVE]    [SEARCH 🔍]            │
├─────────────────────────────────────────────────────────────────────────────┤
│                                                                             │
│  ┌─────────────────────────────────────────────────────────────────────┐   │
│  │  BROWSE BY CATEGORY                    [GRID ▓▓] [LIST ▓░]         │   │
│  │  ═══════════════════════════════════════════════════════════════    │   │
│  │                                                                     │   │
│  │  [ALL] [CRYPTO ▓▓▓▓] [POLITICS ▓▓] [SPORTS ▓] [ECONOMY ▓▓▓]        │   │
│  │  [TECH] [SCIENCE ▓] [ENTERTAIN ▓] [WEATHER ▓] [OTHER ▓]            │   │
│  │                                                                     │   │
│  │  Sort: [Confidence ▼]  Filter: [Open ▓] [Closing ▓] [High Vol ▓]   │   │
│  └─────────────────────────────────────────────────────────────────────┘   │
│                                                                             │
│  ┌─────────────────────────────────────────────────────────────────────┐   │
│  │  🔥 TRENDING CORRELATIONS                                           │   │
│  │  ═══════════════════════════════════════════════════════════════    │   │
│  │                                                                     │   │
│  │  ┌──────────────────┐ ┌──────────────────┐ ┌──────────────────┐   │   │
│  │  │ ⚡ MOVING NOW    │ │ 📈 MOMENTUM      │ │ 🎯 BREAKOUT      │   │   │
│  │  │                  │ │                  │ │                  │   │   │
│  │  │ BTC ETF News     │ │ Fed Rate Cut     │ │ Election Polls   │   │   │
│  │  │ +12% in 1h       │ │ 3 markets        │ │ 5 markets        │   │   │
│  │  │ 4 markets        │ │ Corr: 89%        │ │ Corr: 76%        │   │   │
│  │  │ Corr: 94%        │ │                  │ │                  │   │   │
│  │  └──────────────────┘ └──────────────────┘ └──────────────────┘   │   │
│  └─────────────────────────────────────────────────────────────────────┘   │
│                                                                             │
│  ┌─────────────────────────────────────────────────────────────────────┐   │
│  │  ALL MARKETS                    Showing 24 of 156 markets          │   │
│  │  ═══════════════════════════════════════════════════════════════    │   │
│  │                                                                     │   │
│  │  ┌──────────────────────────────────────────────────────────────┐  │   │
│  │  │ Will ETH ETF be approved in 2024?                           │  │   │
│  │  │ ████████████████████░░░░ YES: 0.72                          │  │   │
│  │  │ Correlation: 87% │ CRYPTO │ Vol: $1.2M │ Closes: 45 days    │  │   │
│  │  │ Related: "SEC comments on ETH ETF applications..."          │  │   │
│  │  └──────────────────────────────────────────────────────────────┘  │   │
│  │                                                                     │   │
│  │  ┌──────────────────────────────────────────────────────────────┐  │   │
│  │  │ Will Trump win 2024 election?                               │  │   │
│  │  │ ██████████████████████░░ YES: 0.54                          │  │   │
│  │  │ Correlation: 82% │ POLITICS │ Vol: $5.8M │ Closes: 300 days  │  │   │
│  │  │ Related: "Polls show tightening race in swing states..."    │  │   │
│  │  └──────────────────────────────────────────────────────────────┘  │   │
│  │                                                                     │   │
│  │  [LOAD MORE MARKETS...]                                             │   │
│  └─────────────────────────────────────────────────────────────────────┘   │
│                                                                             │
└─────────────────────────────────────────────────────────────────────────────┘
```

### 5.2 Component Breakdown

#### 5.2.1 CategoryFilterBar
- Horizontal scrollable category chips
- Each chip shows category name + count
- Active category highlighted with cyan
- "All" option default selected

#### 5.2.2 TrendingCorrelationsStrip
- 3-column card layout
- Each card: Trending topic, stat summary, market count
- Auto-rotating highlight (every 10s)
- Click to filter by that topic

#### 5.2.3 MarketListItem
- Market title with probability bar
- Correlation score badge
- Category tag
- Volume + close time
- Related news snippet
- Hover reveals quick actions

---

## 6. Component Architecture (React)

### 6.1 Directory Structure

```
dashboard/
├── components/
│   └── correlations/
│       ├── layout/
│       │   ├── CorrelationLayout.tsx
│       │   ├── CorrelationNav.tsx
│       │   └── CorrelationTicker.tsx
│       ├── feed/
│       │   ├── CorrelationFeed.tsx
│       │   ├── ArticleCard.tsx
│       │   ├── MarketPreviewCard.tsx
│       │   ├── CorrelationScoreBadge.tsx
│       │   ├── SentimentIndicator.tsx
│       │   └── EmptyFeedState.tsx
│       ├── detail/
│       │   ├── ArticleDetail.tsx
│       │   ├── ArticleHeader.tsx
│       │   ├── CorrelationAnalysisPanel.tsx
│       │   ├── MarketDetailCard.tsx
│       │   ├── SourceReliabilityPanel.tsx
│       │   └── HistoricalAccuracyChart.tsx
│       ├── discover/
│       │   ├── MarketDiscovery.tsx
│       │   ├── CategoryFilterBar.tsx
│       │   ├── TrendingCorrelationsStrip.tsx
│       │   ├── MarketListItem.tsx
│       │   └── DiscoveryFilters.tsx
│       ├── shared/
│       │   ├── ConfidenceBadge.tsx
│       │   ├── MarketProbabilityBar.tsx
│       │   ├── CountdownTimer.tsx
│       │   ├── VolumeIndicator.tsx
│       │   ├── LiquidityBadge.tsx
│       │   └── TimeAgo.tsx
│       └── charts/
│           ├── CorrelationSparkline.tsx
│           ├── PriceProbabilityChart.tsx
│           └── TrendingTopicsCloud.tsx
├── hooks/
│   └── correlations/
│       ├── useCorrelations.ts
│       ├── useCorrelationFeed.ts
│       ├── useMarketDiscovery.ts
│       └── useRealtimeUpdates.ts
├── store/
│   └── correlationStore.ts
├── types/
│   └── correlations.ts
└── utils/
    └── correlations/
        ├── correlationHelpers.ts
        ├── formatters.ts
        └── animations.ts
```

### 6.2 Key Component Implementations

#### 6.2.1 CorrelationFeed (Main Container)

```typescript
// components/correlations/feed/CorrelationFeed.tsx
import React, { useEffect, useState, useCallback } from 'react';
import { useCorrelationFeed } from '@/hooks/correlations/useCorrelationFeed';
import { ArticleCard } from './ArticleCard';
import { EmptyFeedState } from './EmptyFeedState';
import { FeedFilters } from './FeedFilters';
import { CorrelationTicker } from '../layout/CorrelationTicker';

export const CorrelationFeed: React.FC = () => {
  const {
    articles,
    isLoading,
    hasMore,
    filters,
    setFilters,
    loadMore,
    refresh,
    realtimeUpdates
  } = useCorrelationFeed();

  const [dismissedIds, setDismissedIds] = useState<Set<string>>(new Set());

  const handleDismiss = useCallback((id: string) => {
    setDismissedIds(prev => new Set(prev).add(id));
    // Animate out then remove from DOM
  }, []);

  const visibleArticles = articles.filter(a => !dismissedIds.has(a.id));

  return (
    <div className="correlation-feed">
      <CorrelationTicker updates={realtimeUpdates} />
      
      <div className="feed-layout">
        <aside className="feed-sidebar">
          <FeedFilters 
            filters={filters} 
            onChange={setFilters} 
          />
        </aside>
        
        <main className="feed-main">
          {isLoading && visibleArticles.length === 0 ? (
            <FeedSkeleton />
          ) : visibleArticles.length === 0 ? (
            <EmptyFeedState onRefresh={refresh} />
          ) : (
            <>
              <div className="articles-list">
                {visibleArticles.map(article => (
                  <ArticleCard
                    key={article.id}
                    article={article}
                    onDismiss={() => handleDismiss(article.id)}
                  />
                ))}
              </div>
              
              {hasMore && (
                <LoadMoreButton onClick={loadMore} loading={isLoading} />
              )}
            </>
          )}
        </main>
      </div>
    </div>
  );
};
```

#### 6.2.2 ArticleCard

```typescript
// components/correlations/feed/ArticleCard.tsx
import React, { useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { CorrelatedArticle } from '@/types/correlations';
import { CorrelationScoreBadge } from './CorrelationScoreBadge';
import { MarketPreviewCard } from './MarketPreviewCard';
import { SentimentIndicator } from './SentimentIndicator';
import { TimeAgo } from '../shared/TimeAgo';

interface ArticleCardProps {
  article: CorrelatedArticle;
  onDismiss: () => void;
  onExpand: () => void;
}

export const ArticleCard: React.FC<ArticleCardProps> = ({
  article,
  onDismiss,
  onExpand
}) => {
  const [isHovered, setIsHovered] = useState(false);
  const [isExpanded, setIsExpanded] = useState(false);

  const hasHighConfidence = article.correlatedMarkets.some(
    m => m.confidenceLevel === 'HIGH' && m.correlationScore >= 90
  );

  const cardVariants = {
    hidden: { opacity: 0, y: -20 },
    visible: { opacity: 1, y: 0 },
    exit: { opacity: 0, x: -100, transition: { duration: 0.3 } }
  };

  return (
    <motion.article
      className={`article-card ${hasHighConfidence ? 'high-confidence' : ''} ${article.isBreaking ? 'breaking' : ''}`}
      variants={cardVariants}
      initial="hidden"
      animate="visible"
      exit="exit"
      onHoverStart={() => setIsHovered(true)}
      onHoverEnd={() => setIsHovered(false)}
    >
      {/* Header */}
      <header className="article-header">
        <div className="article-badges">
          {hasHighConfidence && (
            <span className="badge badge-high-confidence">
              🔥 HIGH CONFIDENCE
            </span>
          )}
          {article.isBreaking && (
            <span className="badge badge-breaking">
              ⚡ BREAKING
            </span>
          )}
          <SentimentIndicator sentiment={article.sentiment} />
        </div>
        
        <AnimatePresence>
          {isHovered && (
            <motion.div
              className="article-actions"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
            >
              <button onClick={onDismiss} className="btn-dismiss">
                DISMISS
              </button>
              <button onClick={onExpand} className="btn-expand">
                EXPAND
              </button>
            </motion.div>
          )}
        </AnimatePresence>
      </header>

      {/* Content */}
      <div className="article-content" onClick={onExpand}>
        <h3 className="article-title">{article.title}</h3>
        <div className="article-meta">
          <span className="source">{article.source}</span>
          <span className="separator">•</span>
          <TimeAgo date={article.publishedAt} />
          <span className="separator">•</span>
          <span className="category">{article.categories.join(', ')}</span>
        </div>
        <p className="article-snippet">{article.snippet}</p>
      </div>

      {/* Correlated Markets */}
      <div className="article-markets">
        <h4 className="markets-label">
          CORRELATED MARKETS ({article.correlatedMarkets.length}):
        </h4>
        <div className="markets-list">
          {article.correlatedMarkets.map(correlatedMarket => (
            <MarketPreviewCard
              key={correlatedMarket.market.id}
              market={correlatedMarket}
              layout="compact"
            />
          ))}
        </div>
      </div>
    </motion.article>
  );
};
```

#### 6.2.3 MarketPreviewCard

```typescript
// components/correlations/feed/MarketPreviewCard.tsx
import React, { useState } from 'react';
import { CorrelatedMarket } from '@/types/correlations';
import { MarketProbabilityBar } from '../shared/MarketProbabilityBar';
import { CorrelationScoreBadge } from './CorrelationScoreBadge';
import { VolumeIndicator } from '../shared/VolumeIndicator';
import { CountdownTimer } from '../shared/CountdownTimer';

interface MarketPreviewCardProps {
  market: CorrelatedMarket;
  layout: 'compact' | 'full';
}

export const MarketPreviewCard: React.FC<MarketPreviewCardProps> = ({
  market,
  layout
}) => {
  const [showActions, setShowActions] = useState(false);
  const { market: m, correlationScore, correlationReason } = market;

  if (layout === 'compact') {
    return (
      <div 
        className="market-preview-compact"
        onMouseEnter={() => setShowActions(true)}
        onMouseLeave={() => setShowActions(false)}
      >
        <div className="market-header">
          <span className="market-title">{m.title}</span>
          <CorrelationScoreBadge score={correlationScore} size="sm" />
        </div>
        
        <MarketProbabilityBar 
          yesPrice={m.yesPrice} 
          noPrice={m.noPrice}
          animated
        />
        
        <div className="market-metrics">
          <VolumeIndicator volume={m.volume} />
          <span className="separator">|</span>
          <CountdownTimer closeTime={m.closeTime} />
          <span className="separator">|</span>
          <span className={`liquidity liquidity-${m.liquidity || 'medium'}`}>
            {m.liquidity?.toUpperCase() || 'MEDIUM'} LIQUIDITY
          </span>
        </div>
        
        {showActions && (
          <div className="market-actions">
            <button className="btn-view">VIEW</button>
            <button className="btn-trade">TRADE</button>
            <button className="btn-dismiss">DISMISS</button>
          </div>
        )}
      </div>
    );
  }

  // Full layout implementation...
  return null;
};
```

### 6.3 Custom Hooks

#### 6.3.1 useCorrelationFeed

```typescript
// hooks/correlations/useCorrelationFeed.ts
import { useState, useEffect, useCallback } from 'react';
import { useQuery, useInfiniteQuery } from '@tanstack/react-query';
import { useWebSocket } from '@/hooks/useWebSocket';
import { CorrelatedArticle, FeedFilters } from '@/types/correlations';

const FEED_PAGE_SIZE = 10;

export const useCorrelationFeed = () => {
  const [filters, setFilters] = useState<FeedFilters>({
    categories: [],
    confidenceRange: [60, 100],
    status: ['OPEN', 'CLOSING_SOON'],
    minVolume: 0,
    sortBy: 'confidence'
  });

  const [realtimeUpdates, setRealtimeUpdates] = useState<any[]>([]);

  // WebSocket connection for real-time updates
  const { lastMessage } = useWebSocket('/correlations');

  useEffect(() => {
    if (lastMessage) {
      handleRealtimeUpdate(lastMessage);
    }
  }, [lastMessage]);

  // Main feed query
  const {
    data,
    fetchNextPage,
    hasNextPage,
    isLoading,
    isFetchingNextPage,
    refetch
  } = useInfiniteQuery({
    queryKey: ['correlations', 'feed', filters],
    queryFn: async ({ pageParam = 0 }) => {
      const response = await fetch(
        `/api/correlations/feed?cursor=${pageParam}&limit=${FEED_PAGE_SIZE}`,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(filters)
        }
      );
      return response.json();
    },
    getNextPageParam: (lastPage) => lastPage.nextCursor,
    staleTime: 30000, // 30 seconds
  });

  const articles = data?.pages.flatMap(page => page.articles) ?? [];

  const handleRealtimeUpdate = useCallback((message: any) => {
    switch (message.type) {
      case 'NEW_CORRELATION':
        // Prepend new article
        refetch();
        break;
      case 'PRICE_UPDATE':
        // Update price in existing article
        setRealtimeUpdates(prev => [...prev, message]);
        break;
      case 'MARKET_CLOSED':
        // Remove or gray out market
        break;
    }
  }, [refetch]);

  return {
    articles,
    isLoading,
    hasMore: !!hasNextPage,
    filters,
    setFilters,
    loadMore: fetchNextPage,
    refresh: refetch,
    realtimeUpdates
  };
};
```

#### 6.3.2 useRealtimeUpdates

```typescript
// hooks/correlations/useRealtimeUpdates.ts
import { useEffect, useRef } from 'react';
import { io, Socket } from 'socket.io-client';

export const useRealtimeUpdates = (handlers: {
  onNewCorrelation?: (data: any) => void;
  onPriceUpdate?: (data: any) => void;
  onMarketClosed?: (data: any) => void;
  onBreakingNews?: (data: any) => void;
}) => {
  const socketRef = useRef<Socket | null>(null);

  useEffect(() => {
    const socket = io('/correlations');
    socketRef.current = socket;

    socket.on('correlation:new', handlers.onNewCorrelation || (() => {}));
    socket.on('market:price', handlers.onPriceUpdate || (() => {}));
    socket.on('market:closed', handlers.onMarketClosed || (() => {}));
    socket.on('article:breaking', handlers.onBreakingNews || (() => {}));

    return () => {
      socket.disconnect();
    };
  }, [handlers]);

  return socketRef.current;
};
```

---

## 7. API Contract

### 7.1 REST Endpoints

#### GET /api/correlations/feed
```typescript
// Query Parameters
interface FeedQueryParams {
  cursor?: string;           // Pagination cursor
  limit?: number;            // Default: 10, Max: 50
  category?: string;         // Filter by category
  minConfidence?: number;    // 0-100
  maxConfidence?: number;    // 0-100
  status?: string;           // OPEN,CLOSING_SOON,RESOLVED (comma-separated)
  minVolume?: number;        // Minimum volume in USD
  sortBy?: 'confidence' | 'recency' | 'volume' | 'heat';
}

// Response
interface FeedResponse {
  articles: CorrelatedArticle[];
  nextCursor: string | null;
  totalCount: number;
  filters: {
    applied: FeedQueryParams;
    available: {
      categories: NewsCategory[];
      confidenceRange: { min: number; max: number };
    };
  };
}
```

#### GET /api/correlations/article/:id
```typescript
// Response
interface ArticleDetailResponse {
  article: CorrelatedArticle & {
    fullContent?: string;
    contentUrl: string;
    extractedEntities: string[];
    aiSummary: string;
  };
  correlatedMarkets: CorrelatedMarket[];
  sourceReliability: {
    source: string;
    trustScore: number;
    historicalAccuracy: {
      predictions: number;
      correct: number;
      accuracy: number;
    };
    biasAssessment: 'LEFT' | 'CENTER' | 'RIGHT' | 'NEUTRAL';
    timelinessScore: number;
  };
  historicalCorrelations: {
    articleId: string;
    date: Date;
    correlationScore: number;
    outcome: 'CORRECT' | 'INCORRECT' | 'PENDING';
  }[];
}
```

#### GET /api/correlations/discover
```typescript
// Query Parameters
interface DiscoverQueryParams {
  category?: string;
  query?: string;            // Search query
  minConfidence?: number;
  maxConfidence?: number;
  status?: string;
  minVolume?: number;
  sortBy?: 'confidence' | 'volume' | 'closeTime' | 'trending';
  limit?: number;
}

// Response
interface DiscoverResponse {
  markets: CorrelatedMarket[];
  trendingTopics: {
    topic: string;
    marketCount: number;
    avgConfidence: number;
    heatScore: number;
  }[];
  categoryCounts: Record<NewsCategory, number>;
}
```

#### POST /api/correlations/dismiss
```typescript
// Request
interface DismissRequest {
  articleId: string;
  marketId?: string;         // Optional: dismiss specific market only
}

// Response
interface DismissResponse {
  success: boolean;
  dismissedId: string;
}
```

#### GET /api/correlations/trending
```typescript
// Response
interface TrendingResponse {
  topics: {
    id: string;
    name: string;
    description: string;
    marketCount: number;
    avgCorrelationScore: number;
    volume24h: number;
    heatTrend: 'RISING' | 'STABLE' | 'FALLING';
    relatedArticles: number;
  }[];
  updatedAt: Date;
}
```

### 7.2 WebSocket Events

#### Client → Server
```typescript
// Subscribe to feed updates
socket.emit('subscribe:feed', {
  filters: FeedFilters;
});

// Subscribe to specific article
socket.emit('subscribe:article', {
  articleId: string;
});

// Mark article as seen
socket.emit('article:seen', {
  articleId: string;
});
```

#### Server → Client
```typescript
// New correlation detected
socket.on('correlation:new', (data: {
  article: CorrelatedArticle;
  timestamp: Date;
  isBreaking: boolean;
}) => {});

// Price update for correlated market
socket.on('market:price', (data: {
  marketId: string;
  articleId: string;
  yesPrice: number;
  noPrice: number;
  volume24h: number;
  change24h: number;
  timestamp: Date;
}) => {});

// Market closed
socket.on('market:closed', (data: {
  marketId: string;
  articleId: string;
  finalOutcome?: 'YES' | 'NO';
  timestamp: Date;
}) => {});

// Breaking news alert
socket.on('article:breaking', (data: {
  article: CorrelatedArticle;
  priority: 'HIGH' | 'CRITICAL';
  timestamp: Date;
}) => {});

// Heat score update
socket.on('correlation:heat', (data: {
  articleId: string;
  heatScore: number;      // 0-100
  trend: 'UP' | 'DOWN' | 'STABLE';
}) => {});
```

### 7.3 Data Types

```typescript
// types/correlations.ts

export interface CorrelatedArticle {
  id: string;
  title: string;
  snippet: string;
  fullContent?: string;
  source: string;
  url: string;
  publishedAt: Date;
  scrapedAt: Date;
  categories: NewsCategory[];
  tags: string[];
  sentiment: 'BULLISH' | 'BEARISH' | 'NEUTRAL';
  importance: 'LOW' | 'MEDIUM' | 'HIGH' | 'CRITICAL';
  imageUrl?: string;
  
  // Correlation-specific fields
  correlatedMarkets: CorrelatedMarket[];
  heatScore: number;          // 0-100 trending indicator
  isBreaking: boolean;
  confidenceScore: number;    // Overall correlation confidence
}

export interface CorrelatedMarket {
  market: PredictionMarket;
  
  // Correlation analysis
  correlationScore: number;       // 0-100
  correlationReason: string;      // AI explanation
  confidenceLevel: 'HIGH' | 'MEDIUM' | 'LOW';
  
  // Price impact prediction
  priceImpact: {
    direction: 'UP' | 'DOWN' | 'NEUTRAL';
    magnitude: number;           // Estimated % move
    confidence: number;          // 0-1
  };
  
  // Historical performance
  historicalAccuracy?: {
    similarPredictions: number;
    correctPredictions: number;
    avgReturn: number;
  };
  
  // Timing
  urgencyScore: number;        // 0-100 (based on close time)
}

export interface FeedFilters {
  categories: NewsCategory[];
  confidenceRange: [number, number];
  status: ('OPEN' | 'CLOSING_SOON' | 'RESOLVED')[];
  minVolume: number;
  sortBy: 'confidence' | 'recency' | 'volume' | 'heat';
  searchQuery?: string;
}

export type NewsCategory = 
  | 'CRYPTO' 
  | 'STOCKS' 
  | 'ECONOMICS' 
  | 'GEOPOLITICS' 
  | 'TECH' 
  | 'COMMODITIES' 
  | 'SPORTS'
  | 'POLITICS'
  | 'SCIENCE'
  | 'ENTERTAINMENT';
```

---

## 8. Responsive Design

### 8.1 Breakpoints

```css
/* Mobile First Approach */
:root {
  --breakpoint-sm: 640px;   /* Large phones */
  --breakpoint-md: 768px;   /* Tablets */
  --breakpoint-lg: 1024px;  /* Small laptops */
  --breakpoint-xl: 1280px;  /* Desktops */
  --breakpoint-2xl: 1536px; /* Large monitors */
}
```

### 8.2 Layout Adaptations

#### Mobile (< 768px)
```
- Single column layout
- Filters in collapsible drawer (bottom sheet)
- Article cards stack vertically
- Market previews show 1 per row
- Ticker scrolls horizontally
- Quick actions on swipe
```

#### Tablet (768px - 1024px)
```
- Two column layout
- Filters in collapsible sidebar
- Article cards with compact market previews
- Market previews show 2 per row
```

#### Desktop (> 1024px)
```
- Three column layout (filters, feed, trending)
- Full market preview cards
- Sticky header with navigation
- Hover interactions enabled
```

### 8.3 Touch Interactions

```typescript
// Mobile gesture handlers
const swipeHandlers = {
  onSwipeLeft: (articleId: string) => dismissArticle(articleId),
  onSwipeRight: (articleId: string) => saveArticle(articleId),
  onTap: (articleId: string) => expandArticle(articleId),
  onLongPress: (articleId: string) => showContextMenu(articleId)
};
```

---

## 9. Animation Specifications

### 9.1 Page Transitions

```typescript
// Framer Motion variants
const pageTransition = {
  initial: { opacity: 0, x: 20 },
  animate: { 
    opacity: 1, 
    x: 0,
    transition: { duration: 0.3, ease: [0.165, 0.84, 0.44, 1] }
  },
  exit: { 
    opacity: 0, 
    x: -20,
    transition: { duration: 0.2 }
  }
};
```

### 9.2 Card Animations

```typescript
const cardVariants = {
  hidden: { 
    opacity: 0, 
    y: -20,
    scale: 0.98
  },
  visible: { 
    opacity: 1, 
    y: 0,
    scale: 1,
    transition: { 
      duration: 0.4,
      ease: [0.165, 0.84, 0.44, 1]
    }
  },
  exit: { 
    opacity: 0, 
    x: -100,
    transition: { duration: 0.3 }
  },
  hover: {
    y: -4,
    boxShadow: '0 0 20px rgba(0, 242, 255, 0.2)',
    transition: { duration: 0.2 }
  }
};
```

### 9.3 Price Update Animations

```typescript
const priceFlash = {
  up: {
    backgroundColor: ['rgba(0, 255, 157, 0)', 'rgba(0, 255, 157, 0.3)', 'rgba(0, 255, 157, 0)'],
    transition: { duration: 0.8 }
  },
  down: {
    backgroundColor: ['rgba(255, 62, 62, 0)', 'rgba(255, 62, 62, 0.3)', 'rgba(255, 62, 62, 0)'],
    transition: { duration: 0.8 }
  }
};
```

### 9.4 Loading States

```typescript
const shimmer = {
  background: 'linear-gradient(90deg, transparent 0%, rgba(0,242,255,0.1) 50%, transparent 100%)',
  backgroundSize: '200% 100%',
  animation: 'shimmer 1.5s infinite'
};
```

---

## 10. Accessibility

### 10.1 Keyboard Navigation

```typescript
// Key bindings
const keyboardShortcuts = {
  'j': 'Next article',
  'k': 'Previous article',
  'o': 'Open selected article',
  'd': 'Dismiss selected article',
  's': 'Save article',
  't': 'Trade on selected market',
  'f': 'Focus search',
  'r': 'Refresh feed',
  '?': 'Show keyboard shortcuts'
};
```

### 10.2 ARIA Labels

```typescript
// Component ARIA attributes
const ariaAttributes = {
  articleCard: {
    role: 'article',
    'aria-label': `Article: ${title} from ${source}`,
    'aria-describedby': `markets-for-${id}`
  },
  correlationBadge: {
    role: 'meter',
    'aria-valuemin': 0,
    'aria-valuemax': 100,
    'aria-valuenow': score,
    'aria-label': `Correlation score: ${score}%`
  },
  marketPreview: {
    role: 'region',
    'aria-label': `Prediction market: ${market.title}`
  }
};
```

### 10.3 Reduced Motion

```typescript
const respectReducedMotion = () => {
  const prefersReducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  
  return {
    transition: prefersReducedMotion ? 'none' : 'all 0.3s ease',
    animation: prefersReducedMotion ? 'none' : 'correlation-pulse 1.5s infinite'
  };
};
```

---

## 11. Performance Considerations

### 11.1 Virtualization

```typescript
// For long feeds, use virtualization
import { Virtualizer } from '@tanstack/react-virtual';

const VirtualizedFeed = ({ articles }: { articles: CorrelatedArticle[] }) => {
  const parentRef = useRef<HTMLDivElement>(null);
  
  const virtualizer = useVirtualizer({
    count: articles.length,
    getScrollElement: () => parentRef.current,
    estimateSize: () => 250, // Estimated row height
    overscan: 5
  });

  return (
    <div ref={parentRef} className="feed-container">
      <div style={{ height: virtualizer.getTotalSize() }}>
        {virtualizer.getVirtualItems().map(virtualItem => (
          <ArticleCard
            key={articles[virtualItem.index].id}
            article={articles[virtualItem.index]}
            style={{
              position: 'absolute',
              top: 0,
              transform: `translateY(${virtualItem.start}px)`
            }}
          />
        ))}
      </div>
    </div>
  );
};
```

### 11.2 Data Fetching Strategy

```typescript
// React Query configuration
const queryConfig = {
  feed: {
    staleTime: 30 * 1000,      // 30 seconds
    cacheTime: 5 * 60 * 1000,  // 5 minutes
    refetchInterval: 60 * 1000 // Auto-refresh every minute
  },
  article: {
    staleTime: 60 * 1000,
    cacheTime: 10 * 60 * 1000
  },
  trending: {
    staleTime: 5 * 60 * 1000,
    refetchInterval: 5 * 60 * 1000
  }
};
```

### 11.3 Image Optimization

```typescript
// Lazy load article images
const ArticleImage = ({ src, alt }: { src?: string; alt: string }) => {
  if (!src) return null;
  
  return (
    <img
      src={src}
      alt={alt}
      loading="lazy"
      decoding="async"
      className="article-image"
      onError={(e) => { e.currentTarget.style.display = 'none'; }}
    />
  );
};
```

---

## 12. Implementation Checklist

### Phase 1: Foundation
- [ ] Set up React component directory structure
- [ ] Implement base layout shell with navigation
- [ ] Create design system CSS variables
- [ ] Set up WebSocket connection handler
- [ ] Implement API client hooks

### Phase 2: Feed View
- [ ] Build ArticleCard component with all states
- [ ] Build MarketPreviewCard (compact + full)
- [ ] Implement CorrelationScoreBadge
- [ ] Create feed layout with filters sidebar
- [ ] Implement real-time updates
- [ ] Add animations and transitions

### Phase 3: Detail View
- [ ] Build ArticleHeader component
- [ ] Build CorrelationAnalysisPanel
- [ ] Build MarketDetailCard with reasoning
- [ ] Build SourceReliabilityPanel
- [ ] Implement historical accuracy charts
- [ ] Create navigation between views

### Phase 4: Discovery View
- [ ] Build CategoryFilterBar
- [ ] Build TrendingCorrelationsStrip
- [ ] Implement MarketListItem
- [ ] Create search functionality
- [ ] Add sorting and filtering logic

### Phase 5: Polish
- [ ] Responsive design implementation
- [ ] Keyboard shortcuts
- [ ] Accessibility audit
- [ ] Performance optimization
- [ ] Animation refinement
- [ ] Error handling and empty states

---

## 13. Backend Requirements

### Required New API Endpoints

1. `GET /api/correlations/feed` - Main correlation feed
2. `GET /api/correlations/article/:id` - Article detail
3. `GET /api/correlations/discover` - Market discovery
4. `GET /api/correlations/trending` - Trending topics
5. `POST /api/correlations/dismiss` - Dismiss article/market
6. `GET /api/correlations/search` - Search articles/markets

### Required WebSocket Events

1. `correlation:new` - New correlation detected
2. `correlation:update` - Article/market update
3. `correlation:expire` - Correlation expired
4. `market:price` - Real-time price update
5. `market:volume` - Volume update
6. `article:breaking` - Breaking news alert

### Database Requirements

New tables needed:
- `article_correlations` - Article-to-market correlation records
- `correlation_history` - Historical correlation accuracy tracking
- `user_correlation_preferences` - User customization data

---

*Document Version: 1.0*  
*Last Updated: 2026-02-03*  
*Author: UI/UX Engineering Team*
