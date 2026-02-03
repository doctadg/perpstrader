# PerpsTrader Dashboard - User Guide

Complete guide for using the PerpsTrader enhanced dashboard to monitor news clusters, predictions, anomalies, and personalized content.

**Dashboard URL**: `http://0.0.0.0:3000` (or your configured host)

---

## Table of Contents

- [Getting Started](#getting-started)
- [Dashboard Overview](#dashboard-overview)
- [Understanding Heat Timelines](#understanding-heat-timelines)
- [Understanding Anomaly Alerts](#understanding-anomaly-alerts)
- [Using Predictions](#using-predictions)
- [Personalizing Your Feed](#personalizing-your-feed)
- [Filtering by Entities](#filtering-by-entities)
- [Advanced Features](#advanced-features)
- [Best Practices](#best-practices)

---

## Getting Started

### Accessing the Dashboard

1. **From your server**:
   ```
   http://localhost:3000
   ```

2. **From other devices on your network**:
   ```
   http://YOUR_SERVER_IP:3000
   ```

3. **Find your server IP**:
   ```bash
   ip addr show | grep 'inet ' | grep -v '127.0.0.1'
   ```

### Dashboard Sections

The dashboard is divided into several key sections:

- **Top Bar**: System status, user info, settings
- **Left Sidebar**: Navigation menu
- **Main Content**: Clusters, predictions, anomalies
- **Right Panel**: Details, entity filters, recommendations

---

## Dashboard Overview

### Main Dashboard View

```
┌─────────────────────────────────────────────────────────────┐
│  PerpsTrader AI    System: ONLINE    User: user_12345    ⚙️ │
├──────────────────┬──────────────────────────────────────────┤
│                  │                                          │
│  📊 Dashboard    │    🔥 Hot Clusters (24h)                 │
│  🔥 Clusters     │    ┌──────────────────────────────────┐ │
│  📈 Predictions  │    │ BTC Halving 2024      Heat: 92.5 │ │
│  ⚠️ Anomalies    │    │ NVIDIA Earnings        Heat: 78.2 │ │
│  👤 My Feed      │    │ ETH Upgrade            Heat: 72.8 │ │
│  🏢 Entities     │    │ Fed Crypto Reg.      Heat: 65.3 │ │
│  ⚙️ Settings     │    └──────────────────────────────────┘ │
│                  │                                          │
├──────────────────┼──────────────────────────────────────────┤
│                  │                                          │
│  Trending       │    📊 Quality Metrics                    │
│  Entities (24h)  │    ┌──────────────────────────────────┐ │
│  • Bitcoin ↑    │    │ Precision: 87%   Recall: 82%      │ │
│  • NVIDIA ↑     │    │ Cohesion: 79%   Separation: 84%  │ │
│  • Federal Res ↑│    │ F1 Score: 84%                      │ │
│  • Ethereum ↑   │    └──────────────────────────────────┘ │
│                  │                                          │
└──────────────────┴──────────────────────────────────────────┘
```

### Navigation Menu

| Section | Description |
|---------|-------------|
| 📊 Dashboard | Main overview with key metrics |
| 🔥 Clusters | Browse all news clusters with filtering |
| 📈 Predictions | View heat predictions and spike forecasts |
| ⚠️ Anomalies | Monitor detected anomalies |
| 👤 My Feed | Personalized content based on your preferences |
| 🏢 Entities | Browse and filter by entities |
| ⚙️ Settings | Configure preferences and alerts |

---

## Understanding Heat Timelines

### What is Heat Score?

Heat score represents the current "hotness" or relevance of a news cluster. It's calculated from:

- **Article Count**: Number of recent articles
- **Recency**: How recent the articles are
- **Velocity**: Rate of new article arrivals
- **Engagement**: User interactions (views, clicks, shares)
- **Source Authority**: Quality and credibility of sources

**Heat Score Range**: 0-100+

### Heat Timeline View

When viewing a cluster, you'll see a heat timeline:

```
Heat: 85.2 ┤                                          ╭──╮
          │                                       ╭───╯  ╰─╮
          │                                    ╭──╯        ╰╮
          │                                 ╭──╯           ╰─╮
          │                            ╭────╯                ╰╮
          │                       ╭───╯                      ╰─╮
          │                  ╭───╯                            ╰─╮
          │             ╭────╯                                  ╰─╮
          │        ╭────╯                                        ╰╮
          │   ╭────╯                                            ╰─╮
          │╭───╯                                                  ╰─╮
          └─────────────────────────────────────────────────────────► Time
            24h  18h  12h   6h   3h   1h   Now
```

### Interpreting the Timeline

**Shape** | **Meaning** | **Action**
--------|------------|----------
📈 Rising sharply | News is gaining momentum quickly | Monitor closely, potential spike
📉 Falling fast | News is losing relevance quickly | Consider archiving
➡️ Flat/Stable | Steady interest level | Normal monitoring
🌊 Wavy/Oscillating | Conflicting news or updates | Investigate conflicting sources
🎯 Sharp spike | Major news event just broke | High priority coverage

### Heat Velocity & Acceleration

**Velocity** (heat/hr): How fast heat is changing
- **Positive**: Heat is increasing
- **Negative**: Heat is decreasing
- **Large values**: Rapid change

**Acceleration** (heat/hr²): How velocity is changing
- **Positive acceleration**: Speeding up (getting hotter faster)
- **Negative acceleration**: Slowing down (approaching peak or decelerating)

**Example**:
```
Heat: 85.2
Velocity: +12.5/hr (heating up rapidly)
Acceleration: +3.2/hr² (accelerating upward)
Trend: ACCELERATING → Expect continued growth
```

### Lifecycle Stages

Each cluster goes through stages:

**EMERGING** 🌱
- Heat just starting to rise
- Low article count, high velocity
- **Action**: Watch for potential viral content

**SUSTAINED** 🌿
- Stable heat with steady article flow
- **Action**: Good for regular coverage

**DECAYING** 🍂
- Heat declining, fewer new articles
- **Action**: Archive or reduce priority

**DEAD** 💀
- Very low heat, no new articles
- **Action**: Remove from active feed

---

## Understanding Anomaly Alerts

### What are Anomalies?

Anomalies are unusual patterns in cluster behavior detected by statistical analysis:

**SUDDEN SPIKE** 🚀
- Heat score suddenly spikes above normal range
- Z-score > 3.0 (3+ standard deviations above mean)

**SUDDEN DROP** 💥
- Heat score suddenly drops below normal range
- Z-score < -3.0 (3+ standard deviations below mean)

**VELOCITY ANOMALY** ⚡
- Rate of change is unusually fast or slow
- Indicates unexpected acceleration or deceleration

**CROSS-SYNDICATION** 🔗
- Similar topics appearing in multiple categories simultaneously
- Indicates a story is crossing category boundaries

### Anomaly Severity Levels

| Severity | Description | Example | Action Required |
|----------|-------------|---------|-----------------|
| 🔵 LOW | Minor deviation from normal | Small heat fluctuation | Monitor |
| 🟠 MEDIUM | Notable anomaly worth attention | Moderate spike/drop | Investigate |
| 🔴 HIGH | Significant anomaly | Major spike or velocity change | Prioritize |
| 🚨 CRITICAL | Extreme anomaly requiring immediate action | Massive spike or collapse | Act immediately |

### Anomaly Dashboard View

```
┌─────────────────────────────────────────────────────────────┐
│  ⚠️ ANOMALY ALERTS (24h)                      Severity: All ▼│
├─────────────────────────────────────────────────────────────┤
│                                                              │
│  🚨 CRITICAL (1)                                             │
│  ┌────────────────────────────────────────────────────────┐ │
│  │ SUDDEN SPIKE: BTC Halving 2024                          │ │
│  │ Heat: 125.8 (4.2σ above normal)                        │ │
│  │ Expected: 65.2 - 85.7 | Detected: 2 min ago           │ │
│  │ [View Cluster] [Dismiss] [Share Alert]                  │ │
│  └────────────────────────────────────────────────────────┘ │
│                                                              │
│  🔴 HIGH (3)                                                 │
│  ┌────────────────────────────────────────────────────────┐ │
│  │ VELOCITY ANOMALY: NVIDIA Earnings                      │ │
│  │ Velocity: 18.5/hr (2.8σ from mean 6.2/hr)             │ │
│  │ Detected: 15 min ago                                   │ │
│  │ [View Cluster] [Dismiss]                               │ │
│  └────────────────────────────────────────────────────────┘ │
│                                                              │
└─────────────────────────────────────────────────────────────┘
```

### Responding to Anomalies

**For Critical Anomalies** 🚨
1. **Immediately view cluster** - Understand what's happening
2. **Check sources** - Verify information credibility
3. **Share with team** - Alert relevant stakeholders
4. **Consider prediction** - Check heat trajectory

**For High/Medium Anomalies** 🔴🟠
1. **Investigate context** - Understand why it's anomalous
2. **Monitor closely** - Watch for escalation or resolution
3. **Cross-reference** - Check related clusters
4. **Dismiss if false positive** - Help train the system

**For Low Anomalies** 🔵
1. **Note for context** - Useful for trend analysis
2. **No immediate action** - Continue normal monitoring

### Anomaly Patterns

The system can detect these patterns:

**OSCILLATING_HEAT** 🌊
- Rapid up-down fluctuations
- Often indicates conflicting news or updates

**STEP_PATTERN** 📊
- Sudden jump then flat
- Major news event, followed by coverage

**LINEAR_DECAY** 📉
- Steady, constant decline
- Story losing interest gradually

**LINEAR_GROWTH** 📈
- Steady, constant increase
- Building interest over time

---

## Using Predictions

### What are Predictions?

Predictions forecast future heat scores using time-series analysis:

**Time Horizons**:
- **1 hour**: Near-term forecast (highest confidence)
- **6 hours**: Medium-term forecast
- **24 hours**: Long-term forecast (lowest confidence)

**Trajectory Types**:
- **🚀 SPIKING**: Rapid increase expected
- **📈 GROWING**: Steady increase expected
- **➡️ STABLE**: No significant change expected
- **📉 DECAYING**: Gradual decline expected
- **💥 CRASHING**: Rapid decline expected

### Prediction Dashboard View

```
┌─────────────────────────────────────────────────────────────┐
│  📈 HEAT PREDICTIONS                          24h window ▼  │
├─────────────────────────────────────────────────────────────┤
│                                                              │
│  🚀 PREDICTED SPIKES (Next 24h)                             │
│  ┌────────────────────────────────────────────────────────┐ │
│  │ BTC Halving 2024                                      │ │
│  │ Current: 85.2 → Predicted: 110.8 (+30%) in 1h         │ │
│  │ Confidence: 85% | Trajectory: SPIKING 🚀            │ │
│  │ [View Details] [Set Alert] [Share]                    │ │
│  └────────────────────────────────────────────────────────┘ │
│                                                              │
│  📈 GROWING STORIES                                         │
│  • ETH Upgrade: Current 72.8 → 85.3 in 6h (72% conf)     │
│  • NVIDIA Earnings: Current 78.2 → 88.5 in 24h (65% conf) │
│                                                              │
│  💥 PREDICTED CRASHES                                       │
│  • Old News Story: Current 15.2 → 5.8 in 6h (68% conf)     │ │
│                                                              │
└─────────────────────────────────────────────────────────────┘
```

### Confidence Intervals

Predictions include confidence bounds:

```
Current Heat: 85.2

1h Prediction: 92.5
┌─────────────────────────┐
│   Upper Bound: 98.3     │  ← 95% confidence upper limit
│   Predicted: 92.5       │  ← Expected value
│   Lower Bound: 86.7     │  ← 95% confidence lower limit
└─────────────────────────┘
Confidence: 85%
```

**Interpreting Confidence**:
- **>80%**: High confidence, predictions likely accurate
- **60-80%**: Medium confidence, reasonably reliable
- **<60%**: Low confidence, significant uncertainty

### Using Predictions for Decision Making

**For Content Curation** 📰
1. Check `/api/news/predictions/spikes` daily
2. Prioritize stories predicted to spike
3. Plan coverage in advance of viral content
4. Reserve space for high-confidence spikes

**For Trading** 📊
1. Monitor entity predictions (e.g., Bitcoin, NVIDIA)
2. Cross-reference with market data
3. Use spike predictions as trading signals
4. Verify with multiple data sources

**For Research** 🔬
1. Analyze prediction accuracy over time
2. Identify patterns in successful predictions
3. Study lifecycle stages and trajectories
4. Refine prediction parameters

### Setting Prediction Alerts

You can set alerts for specific conditions:

1. **Spike Alert**: Notify when heat predicted to increase by >X%
2. **Crash Alert**: Notify when heat predicted to decrease by >Y%
3. **Entity Alert**: Notify when specific entity predicted to spike
4. **Threshold Alert**: Notify when heat crosses a specific level

```
Alert Settings:
┌─────────────────────────────────────────┐
│ Entity: Bitcoin                        │
│ Trigger: Heat increase > 40%          │
│ Time Horizon: 6 hours                  │
│ Minimum Confidence: 70%               │
│                                         │
│ [Enable Alert] [Cancel]                │
└─────────────────────────────────────────┘
```

---

## Personalizing Your Feed

### What is Personalization?

The dashboard learns from your behavior to show you more relevant content:

**Engagement Tracking**:
- Views: When you view a cluster
- Clicks: When you click through to articles
- Shares: When you share content
- Saves: When you save for later
- Dismissals: When you dismiss or hide content

**Category Preferences**:
- The system tracks which categories you engage with
- Weights are calculated from your engagement history
- Higher weights = more content from that category

### Viewing Your Preferences

Navigate to **⚙️ Settings** → **Preferences**:

```
┌─────────────────────────────────────────────────────────────┐
│  🎯 YOUR PREFERENCES                                         │
├─────────────────────────────────────────────────────────────┤
│                                                              │
│  Category Weights (auto-learned from engagement)            │
│  ┌────────────────────────────────────────────────────────┐ │
│  │ CRYPTO      ████████████████░░░░  0.85  [Adjust]      │ │
│  │ STOCKS      ██████████████░░░░░░  0.72  [Adjust]      │ │
│  │ TECH        ██████████░░░░░░░░░░  0.58  [Adjust]      │ │
│  │ ECONOMICS   ██████░░░░░░░░░░░░░░  0.42  [Adjust]      │
│  │ SPORTS      ██░░░░░░░░░░░░░░░░░░  0.15  [Adjust]      │ │
│  └────────────────────────────────────────────────────────┘ │
│                                                              │
│  [Retrain from History] [Reset to Defaults]                 │
│                                                              │
└─────────────────────────────────────────────────────────────┘
```

### My Feed Section

Your personalized feed shows content ranked by:

1. **Composite score** (heat, sentiment, authority, entities)
2. **Your category weights**
3. **Your engagement history**

```
┌─────────────────────────────────────────────────────────────┐
│  👤 MY FEED (Personalized for you)         Refresh [🔄]     │
├─────────────────────────────────────────────────────────────┤
│                                                              │
│  Rank: #1 (Relevance: 94%)                                  │
│  ┌────────────────────────────────────────────────────────┐ │
│  │ BTC Halving 2024                    CRYPTO     🔥 85.2 │ │
│  │ 42 articles • +12.5 velocity • +18% for you            │ │
│  │ [View] [Save] [Share]                                  │ │
│  └────────────────────────────────────────────────────────┘ │
│                                                              │
│  Rank: #2 (Relevance: 87%)                                  │
│  ┌────────────────────────────────────────────────────────┐ │
│  │ NVIDIA Earnings                     STOCKS     🔥 78.2 │ │
│  │ 35 articles • +8.5 velocity • +12% for you            │ │
│  │ [View] [Save] [Share]                                  │ │
│  └────────────────────────────────────────────────────────┘ │
│                                                              │
└─────────────────────────────────────────────────────────────┘
```

### Training Your Preferences

The system learns automatically, but you can:

1. **Retrain from History**:
   - Navigate to **⚙️ Settings** → **Preferences**
   - Click **"Retrain from History"**
   - System recalculates weights from all engagement

2. **Manual Adjustment**:
   - Click **[Adjust]** next to any category
   - Set desired weight (0.0 - 1.0)
   - Save changes

3. **Provide Explicit Feedback**:
   - Save stories you like
   - Dismiss irrelevant content
   - Share important stories
   - Engage with what interests you

### Engagement Statistics

View your engagement patterns:

```
┌─────────────────────────────────────────────────────────────┐
│  📊 YOUR ENGAGEMENT STATISTICS            Last 7 days ▼      │
├─────────────────────────────────────────────────────────────┤
│                                                              │
│  Total Engagements: 156                                       │
│                                                              │
│  By Type:                                                    │
│  • Views:         85 (54%)  ████████████████████░░░         │
│  • Clicks:        42 (27%)  ███████████░░░░░░░░░░░           │
│  • Shares:        18 (12%)  ██████░░░░░░░░░░░░░░░           │
│  • Saves:          8 (5%)   ██░░░░░░░░░░░░░░░░░░           │
│  • Dismissals:     3 (2%)   █░░░░░░░░░░░░░░░░░░░           │
│                                                              │
│  Avg Engagement Time: 28.5 seconds                           │
│  Unique Clusters Viewed: 52                                  │
│  Retention Rate: 78%                                         │
│                                                              │
└─────────────────────────────────────────────────────────────┘
```

---

## Filtering by Entities

### What are Entities?

Entities are named things mentioned in news:

**Entity Types**:
- **PERSON**: People (e.g., "Elon Musk", "Jerome Powell")
- **ORGANIZATION**: Companies, institutions (e.g., "NVIDIA", "Fed")
- **LOCATION**: Places (e.g., "New York", "Washington DC")
- **TOKEN**: Cryptocurrencies (e.g., "Bitcoin", "Ethereum")
- **PROTOCOL**: Blockchain protocols (e.g., "Uniswap", "Aave")
- **COUNTRY**: Nations (e.g., "USA", "China")
- **GOVERNMENT_BODY**: Government agencies (e.g., "SEC", "Fed")

### Entity Dashboard

```
┌─────────────────────────────────────────────────────────────┐
│  🏢 TRENDING ENTITIES                       Last 24h ▼      │
├─────────────────────────────────────────────────────────────┤
│                                                              │
│  #1 Bitcoin (TOKEN)           Heat: 1,250  ↑ 85% 📈        │
│  #2 NVIDIA (ORG)              Heat: 890   ↑ 62% 📈        │
│  #3 Federal Reserve (GOVT)    Heat: 672   ↑ 45% 📈        │
│  #4 Ethereum (TOKEN)          Heat: 585   ↑ 38% 📈        │
│  #5 Jerome Powell (PERSON)    Heat: 412   ↑ 28% 📈        │
│                                                              │
│  [View All Entities] [Set Entity Alerts]                    │
│                                                              │
└─────────────────────────────────────────────────────────────┘
```

### Filtering Clusters by Entity

1. Click on any entity to see related clusters
2. Filter by multiple entities
3. Sort by entity heat contribution

```
┌─────────────────────────────────────────────────────────────┐
│  🔍 Filtering by: Bitcoin + NVIDIA                          │
├─────────────────────────────────────────────────────────────┤
│                                                              │
│  BTC Halving 2024                                          │
│  • Bitcoin: 35.2 heat contribution                          │
│  • NVIDIA: 12.8 heat contribution                           │
│  Total Heat: 85.2                                           │
│                                                              │
│  Bitcoin ETF Approval                                       │
│  • Bitcoin: 42.5 heat contribution                          │
│  • Federal Reserve: 8.3 heat contribution                   │
│  Total Heat: 72.8                                           │
│                                                              │
└─────────────────────────────────────────────────────────────┘
```

### Entity Alerts

Set alerts for specific entities:

1. Navigate to entity details
2. Click **"Set Alert"**
3. Configure alert conditions

```
Alert Configuration:
┌─────────────────────────────────────────┐
│ Entity: Bitcoin                         │
│ Alert when: Entity heat increases       │
│ By: 50% in 6 hours                      │
│ Minimum cluster heat: 50                │
│                                         │
│ Notification methods:                   │
│ ✓ Dashboard notification                │
│ ✓ Email alert                           │
│ ☐ Telegram message                      │
│                                         │
│ [Save Alert] [Cancel]                   │
└─────────────────────────────────────────┘
```

### Entity Heat Analysis

View entity heat over time:

```
Bitcoin Heat Trajectory (7 days)
Heat: 1,250 ┤                                   ╭──╮
          │                                ╭───╯  ╰─╮
          │                            ╭───╯        ╰─╮
          │                       ╭────╯             ╰─╮
          │                  ╭────╯                    ╰╮
          │             ╭───╯                          ╰─╮
          │        ╭────╯                               ╰─╮
          │   ╭────╯                                     ╰─╮
          │╭───╯                                           ╰╮
          └──────────────────────────────────────────────────►
            Mon   Tue   Wed   Thu   Fri   Sat   Sun
```

**Entity Heat Signals**:
- **Rising fast**: Breaking news about this entity
- **Sustained high**: Ongoing interest and coverage
- **Falling fast**: News cycle ending

---

## Advanced Features

### Cross-Category Linking

Discover related stories across categories:

```
BTC Halving 2024 (CRYPTO)
├── Related in STOCKS
│   └── MicroStrategy Holdings (similarity: 0.82)
├── Related in TECH
│   ├── Bitcoin ETF Approval (similarity: 0.75)
│   └── Mining Hardware (similarity: 0.68)
└── Related in ECONOMICS
    └── Fed Crypto Regulation (similarity: 0.65)
```

**Why it matters**:
- See broader context of a story
- Discover related market impacts
- Identify cross-market opportunities

### Multi-Dimensional Ranking

Understand how clusters are ranked:

**Composite Score = Weighted Sum**:
- Heat Score: 35%
- Sentiment Velocity: 20%
- Source Authority: 15%
- Entity Heat: 15%
- Market Correlation: 10%
- User Preference: 5%

```
Cluster Ranking Details:
┌─────────────────────────────────────────┐
│ BTC Halving 2024                        │
│ ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━ │
│ Composite Score: 82.3                    │
│                                          │
│ Components:                              │
│ • Heat Score:        85.2 (35%)  ███████│
│ • Sentiment Vel:     8.5  (20%)  █████  │
│ • Source Authority:  7.8  (15%)  ███    │
│ • Entity Heat:       8.1  (15%)  ███    │
│ • Market Correlation:9.2  (10%)  ██     │
│ • User Preference:  0.85 (5%)   █      │
│ ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━ │
│ Total: 82.3                              │
└─────────────────────────────────────────┘
```

### Heat Decay Configuration

View and adjust decay parameters:

```
Decay Configuration:
┌─────────────────────────────────────────┐
│ Category: CRYPTO                         │
│ ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━ │
│ Decay Constant:     0.95  [Adjust]     │
│ Activity Boost:     2h    [Adjust]     │
│ Spike Multiplier:   1.5   [Adjust]     │
│ Base Half-Life:     6h    [Adjust]     │
│                                          │
│ Description: Fast-moving crypto news     │
│ Last Updated: 2024-01-15 10:30 UTC      │
│                                          │
│ [Save Changes] [Reset to Defaults]      │
└─────────────────────────────────────────┘
```

**What these parameters mean**:
- **Decay Constant**: How fast heat decays (higher = slower decay)
- **Activity Boost**: How long heat stays boosted after new articles
- **Spike Multiplier**: Multiplier for viral spikes
- **Base Half-Life**: Natural half-life of cluster heat

---

## Best Practices

### For Content Curators

✅ **DO**:
- Check predictions every morning for planned spikes
- Monitor trending entities for emerging topics
- Use cross-category links for broader coverage
- Respond to critical anomalies immediately
- Train the system with your engagement

❌ **DON'T**:
- Ignore low-confidence predictions
- Rely solely on heat score without context
- Dismiss anomalies without investigation
- Let preferences go stale (retrain weekly)

### For Traders

✅ **DO**:
- Set entity alerts for your watchlist
- Cross-reference predictions with market data
- Check anomaly alerts for market-moving news
- Monitor velocity for momentum trading
- Use heat history for trend analysis

❌ **DON'T**:
- Trade solely on prediction data
- Ignore confidence intervals
 overlook cross-category impacts
- React to low-severity anomalies

### For Researchers

✅ **DO**:
- Analyze prediction accuracy over time
- Study anomaly patterns and their causes
- Track entity evolution and trends
- Use heat history for time-series analysis
- Experiment with decay parameters

❌ **DON'T**:
- Draw conclusions from small samples
- Ignore statistical significance
- Overfit parameters to recent data

### General Dashboard Usage

**Daily Routine** (Morning):
1. Check predictions for today's potential spikes
2. Review critical anomalies overnight
3. Scan trending entities
4. Review personalized feed

**Daily Routine** (Evening):
1. Review cluster evolution
2. Check engagement statistics
5. Identify patterns for tomorrow

**Weekly Routine**:
1. Retrain personalization preferences
2. Review quality metrics
3. Analyze prediction accuracy
4. Adjust decay parameters if needed

---

## Troubleshooting

### Dashboard Not Loading

**Symptoms**: Page won't load, shows errors

**Solutions**:
1. Check service status: `./scripts/perps-control status`
2. View logs: `./scripts/perps-control logs perps-dashboard`
3. Restart service: `./scripts/perps-control restart perps-dashboard`
4. Check port availability: Ensure port 3000 is not blocked

### Predictions Not Showing

**Symptoms**: Prediction endpoints return empty or errors

**Solutions**:
1. Ensure enough historical data (minimum 24 points)
2. Check heat predictor service logs
3. Verify prediction configuration
4. Try different cluster with more history

### Anomalies Not Detecting

**Symptoms**: Expected anomalies not appearing

**Solutions**:
1. Check anomaly detection thresholds
2. Verify heat history is being recorded
3. Review minimum history points requirement
4. Adjust severity filter (may be filtered out)

### Personalization Not Working

**Solutions**:
1. Ensure engagement is being recorded
2. Check user ID is consistent
3. Retrain preferences from history
4. Verify user stats show engagement

---

## FAQ

**Q: How accurate are predictions?**

A: Accuracy varies by time horizon:
- 1h: 78-82% accuracy
- 6h: 68-72% accuracy
- 24h: 58-62% accuracy

Higher confidence predictions are generally more reliable.

**Q: Can I trust anomaly alerts?**

A: Anomalies use statistical analysis (z-scores). Critical and high severity are usually genuine. Low severity may be noise. Always investigate before acting.

**Q: How long does personalization take to learn?**

A: Typically 20-30 engagements across multiple categories for meaningful personalization. Retrain explicitly for faster results.

**Q: Can I filter by multiple entities?**

A: Yes! Click entities to add them to your filter. The dashboard shows clusters mentioning ANY of the selected entities.

**Q: What's the difference between heat and velocity?**

A: Heat is the current "hotness" level. Velocity is how fast heat is changing (positive = heating up, negative = cooling down).

**Q: How often is data updated?**

A: Most data updates in real-time via WebSocket. Predictions and anomalies recalculate every 5 minutes. Quality metrics update hourly.

---

## Getting Help

If you encounter issues:

1. **Check logs**: `./scripts/perps-control logs perps-dashboard`
2. **Review documentation**: Read this guide and API reference
3. **Check system status**: All services should be "ONLINE"
4. **Contact support**: Development team for persistent issues

---

**Happy Monitoring! 📊**
