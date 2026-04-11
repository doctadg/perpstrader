// =============================================================================
// PerpsTrader TUI — Views (Dashboard, Positions, News, Risk, Strategies, Predictions)
// =============================================================================

import React from 'react';
import { Box, Text } from 'ink';
import * as T from './theme';
import { Panel, EmptyState, ProgressBar, DataRow, Spinner } from './components';

// =============================================================================
// Shared View Props
// =============================================================================

export interface ViewProps {
  data: any;
  loading: boolean;
  scrollOffset: number;
}

// =============================================================================
// 1. DASHBOARD VIEW
// =============================================================================

export function DashboardView({ data, loading }: ViewProps) {
  if (loading) {
    return (
      <Box flexDirection="column" alignItems="center" flexGrow={1} paddingTop={2}>
        <Spinner text="Loading dashboard..." />
        <Text color={T.colors.overlay0}>{'\n'}  Fetching all data from Agent API...</Text>
      </Box>
    );
  }

  const positions: any[] = data.positions?.positions || [];
  const signals: any[] = data.signals?.signals || [];
  const news: any[] = data.news?.articles || [];
  const risk = data.risk;
  const strategies: any[] = data.strategies?.strategies || [];
  const predictions: any[] = data.predictions?.positions || [];

  return (
    <Box flexDirection="column" flexGrow={1}>
      {/* Row 1: Positions, Signals, News */}
      <Box flexDirection="row" flexGrow={1}>
        {/* Positions Mini */}
        <Panel title="Positions" icon={T.icons.chart} flex={1}>
          {positions.length === 0 ? (
            <EmptyState message="No open positions" />
          ) : (
            positions.slice(0, 5).map((pos: any, i: number) => {
              const pnl = pos.unrealizedPnL || 0;
              const entryPx = pos.entryPrice || pos.averageEntryPrice || 0;
              return (
                <Box key={i} flexDirection="column" marginBottom={i < Math.min(positions.length, 5) - 1 ? 1 : 0}>
                  <Box>
                    <Text color={T.colors.text} bold>{pos.symbol || '???'}</Text>
                    <Text color={T.colors.overlay0}> {pos.leverage || 1}x </Text>
                    <Text color={pos.side === 'LONG' ? T.colors.green : T.colors.red}>
                      {(pos.side || 'LONG').toLowerCase()}
                    </Text>
                  </Box>
                  <Text color={T.colors.overlay0}>
                    {'  '}Entry: {T.formatNum(entryPx)}
                  </Text>
                  <Text color={T.pnlColor(pnl)}>
                    {'  '}{T.pnlIcon(pnl)} {T.formatUSD(pnl)}
                    {pos.pnlPct != null && ` (${T.formatPct(pos.pnlPct)})`}
                  </Text>
                </Box>
              );
            })
          )}
        </Panel>

        {/* Signals Mini */}
        <Panel title="Signals" icon={T.icons.live} flex={1}>
          {signals.length === 0 ? (
            <EmptyState message="No signals yet" />
          ) : (
            signals.slice(0, 6).map((sig: any, i: number) => {
              const dir = sig.signal || sig.direction || sig.side || 'NEUTRAL';
              return (
                <Box key={i} flexDirection="column" marginBottom={i < Math.min(signals.length, 6) - 1 ? 1 : 0}>
                  <Box>
                    <Text color={T.signalColor(dir)}>{T.icons.dot}</Text>
                    <Text color={T.colors.text} bold> {(dir).toUpperCase().substring(0, 7)}</Text>
                    <Text color={T.colors.overlay0}> {sig.symbol || ''}</Text>
                  </Box>
                  {sig.confidence != null && sig.confidence > 0 && (
                    <Text color={T.colors.overlay0}>
                      {'  '}Conf: {(sig.confidence * 100).toFixed(0)}%
                    </Text>
                  )}
                </Box>
              );
            })
          )}
        </Panel>

        {/* News Mini */}
        <Panel title="News" icon={T.icons.news} flex={1}>
          {news.length === 0 ? (
            <EmptyState message="No news articles" />
          ) : (
            news.slice(0, 5).map((article: any, i: number) => {
              const sentiment = article.sentiment || article.overallSentiment || 'NEUTRAL';
              return (
                <Box key={i} flexDirection="column" marginBottom={i < Math.min(news.length, 5) - 1 ? 1 : 0}>
                  <Box>
                    <Text color={T.sentimentColor(sentiment)}>{T.icons.dot}</Text>
                    <Text color={T.colors.subtext0}> {T.truncate(article.title || 'Untitled', 30)}</Text>
                  </Box>
                  <Text color={T.colors.overlay1}>
                    {'  '}{T.timeAgo(article.publishedAt || article.timestamp || article.createdAt)}
                    {article.source ? ` \u00b7 ${article.source}` : ''}
                  </Text>
                </Box>
              );
            })
          )}
        </Panel>
      </Box>

      {/* Row 2: Risk, Strategies, Predictions */}
      <Box flexDirection="row" flexGrow={1}>
        {/* Risk Mini */}
        <Panel title="Risk" icon={T.icons.risk} flex={1}>
          {risk ? (
            <Box flexDirection="column">
              <Box marginBottom={1}>
                <Text color={T.colors.overlay0}>
                  {'  '}{T.icons.warning} Risk:{' '}
                  <Text color={T.riskLevelColor(risk.riskLevel)} bold>{risk.riskLevel || 'UNKNOWN'}</Text>
                </Text>
                {risk.riskScore != null && (
                  <ProgressBar percent={risk.riskScore * 10} width={22} />
                )}
              </Box>
              <DataRow label="Drawdown" value={`${(risk.drawdown?.current || 0).toFixed(1)}% / ${(risk.drawdown?.max || 0).toFixed(1)}%`} valueColor={T.colors.peach} />
              <DataRow label="Margin" value={`${(risk.exposure?.utilization || 0).toFixed(1)}%`} />
              <DataRow label="Gross Exp" value={T.formatUSD(risk.exposure?.gross || 0)} />
              <DataRow
                label="Circuit"
                value={
                  <Text>
                    <Text color={T.colors.green}>{T.icons.check} OK</Text>
                    {risk.warnings && risk.warnings.length > 0 && (
                      <Text color={T.colors.yellow}> {' '}{risk.warnings.length} warn</Text>
                    )}
                  </Text>
                }
              />
            </Box>
          ) : (
            <EmptyState message="No risk data available" />
          )}
        </Panel>

        {/* Strategies Mini */}
        <Panel title="Strategies" icon={T.icons.strategy} flex={1}>
          {strategies.length === 0 ? (
            <EmptyState message="No strategies active" />
          ) : (
            strategies.slice(0, 5).map((strat: any, i: number) => {
              const perf = strat.performance || {};
              return (
                <Box key={i} flexDirection="column" marginBottom={i < Math.min(strategies.length, 5) - 1 ? 1 : 0}>
                  <Box>
                    <Text color={strat.isActive ? T.colors.green : T.colors.overlay1}>
                      {strat.isActive ? T.icons.dot : T.icons.bullet}
                    </Text>
                    <Text color={T.colors.text} bold> {T.truncate(strat.name || 'Unknown', 22)}</Text>
                  </Box>
                  <Text color={T.colors.overlay0}>
                    {'  '}Sharpe: <Text color={T.colors.text}>{(perf.sharpeRatio || 0).toFixed(2)}</Text>
                    {'  Win: '}{(perf.winRate * 100 || 0).toFixed(0)}%
                    {'  PnL: '}{T.formatUSD(perf.totalPnL || 0)}
                  </Text>
                </Box>
              );
            })
          )}
        </Panel>

        {/* Predictions Mini */}
        <Panel title="Predictions" icon={T.icons.prediction} flex={1}>
          {predictions.length === 0 ? (
            <EmptyState message="No prediction positions" />
          ) : (
            predictions.slice(0, 5).map((pred: any, i: number) => {
              const status = pred.status || pred.outcome || 'OPEN';
              const pnl = pred.realizedPnL || pred.unrealizedPnL || pred.pnl || 0;
              return (
                <Box key={i} flexDirection="column" marginBottom={i < Math.min(predictions.length, 5) - 1 ? 1 : 0}>
                  <Box>
                    <Text color={status === 'WON' ? T.colors.green : status === 'LOST' ? T.colors.red : T.colors.yellow}>
                      {status === 'WON' ? T.icons.check : status === 'LOST' ? T.icons.cross : T.icons.dot}
                      {' '}{status.toUpperCase().substring(0, 4)}
                    </Text>
                    <Text color={T.colors.subtext0}> {T.truncate(pred.marketTitle || pred.title || '???', 25)}</Text>
                  </Box>
                  {pnl !== 0 && (
                    <Text color={T.pnlColor(pnl)}>
                      {'  '}{T.formatUSD(pnl)}
                    </Text>
                  )}
                </Box>
              );
            })
          )}
        </Panel>
      </Box>
    </Box>
  );
}

// =============================================================================
// 2. POSITIONS VIEW — Detailed position cards
// =============================================================================

export function PositionsView({ data, loading }: ViewProps) {
  const positions: any[] = data.positions?.positions || [];
  const totalPnL = data.positions?.totalUnrealizedPnL || 0;

  if (loading && positions.length === 0) {
    return (
      <Box flexDirection="column" alignItems="center" flexGrow={1} paddingTop={2}>
        <Spinner text="Loading positions..." />
      </Box>
    );
  }

  return (
    <Box flexDirection="column" flexGrow={1}>
      {/* Summary bar */}
      <Box marginBottom={1}>
        <Text color={T.colors.subtext1} bold>
          {'  '}{T.icons.chart} Positions ({positions.length} open)
        </Text>
        <Text color={T.colors.surface2}> {'\u2502'}</Text>
        <Text color={T.pnlColor(totalPnL)}>
          {' '}{T.pnlIcon(totalPnL)} Total PnL: {T.formatUSD(totalPnL)}
        </Text>
      </Box>

      {positions.length === 0 ? (
        <Panel title="No Positions" icon={T.icons.bullet}>
          <EmptyState message="No open positions found" />
        </Panel>
      ) : (
        positions.map((pos: any, i: number) => {
          const pnl = pos.unrealizedPnL || 0;
          const entryPx = pos.entryPrice || pos.averageEntryPrice || 0;
          const markPx = pos.markPrice || pos.currentPrice || 0;
          const size = pos.size || pos.quantity || 0;
          const leverage = pos.leverage || 1;
          const liqPrice = pos.liquidationPrice;
          const stopLoss = pos.stopLoss;
          const takeProfit = pos.takeProfit;
          const side = pos.side || 'LONG';
          const pnlPct = pos.pnlPct || (entryPx > 0 ? ((markPx - entryPx) / entryPx * 100 * (side === 'SHORT' ? -1 : 1)) : 0);
          const notional = size * (markPx || entryPx);

          return (
            <Panel
              key={i}
              title={`${pos.symbol || '???'} ${side.toLowerCase()} ${leverage}x`}
              icon={side === 'LONG' ? T.icons.up : T.icons.down}
              borderColor={side === 'LONG' ? '#2d4a2d' : '#4a2d2d'}
            >
              <Box flexDirection="row">
                <Box flexDirection="column" flexGrow={1}>
                  <DataRow label="Entry" value={T.formatNum(entryPx)} indent={0} />
                  <DataRow label="Mark" value={T.formatNum(markPx)} indent={0} />
                  <DataRow label="Size" value={`${T.formatNum(size, 4)} (${T.formatUSD(notional)})`} indent={0} />
                </Box>
                <Box flexDirection="column" flexGrow={1}>
                  <DataRow
                    label="PnL"
                    value={`${T.formatUSD(pnl)} (${T.formatPct(pnlPct)})`}
                    valueColor={T.pnlColor(pnl)}
                    indent={0}
                  />
                  {liqPrice != null && (
                    <DataRow label="Liq Price" value={T.formatNum(liqPrice)} valueColor={T.colors.red} indent={0} />
                  )}
                </Box>
              </Box>
              {(stopLoss || takeProfit) && (
                <Box marginTop={1}>
                  {stopLoss != null && (
                    <Text color={T.colors.overlay0}>
                      {'  '}SL: <Text color={T.colors.red}>{T.formatNum(stopLoss)}</Text>
                    </Text>
                  )}
                  {takeProfit != null && (
                    <Text color={T.colors.overlay0}>
                      {'  '}TP: <Text color={T.colors.green}>{T.formatNum(takeProfit)}</Text>
                    </Text>
                  )}
                </Box>
              )}
            </Panel>
          );
        })
      )}
    </Box>
  );
}

// =============================================================================
// 3. NEWS VIEW — Scrollable news feed
// =============================================================================

export function NewsView({ data, loading, scrollOffset }: ViewProps) {
  const articles: any[] = data.news?.articles || [];
  const categories: Record<string, number> = data.news?.categories || {};

  if (loading && articles.length === 0) {
    return (
      <Box flexDirection="column" alignItems="center" flexGrow={1} paddingTop={2}>
        <Spinner text="Loading news..." />
      </Box>
    );
  }

  // Category summary
  const catEntries = Object.entries(categories).sort((a, b) => b[1] - a[1]).slice(0, 8);

  return (
    <Box flexDirection="column" flexGrow={1}>
      {/* Header */}
      <Box marginBottom={1}>
        <Text color={T.colors.subtext1} bold>
          {'  '}{T.icons.news} News Feed ({articles.length} articles)
        </Text>
        {catEntries.length > 0 && (
          <Text color={T.colors.overlay0}>
            {' '}{catEntries.map(([k, v]) => `${k}(${v})`).join(' \u00b7 ')}
          </Text>
        )}
      </Box>

      {articles.length === 0 ? (
        <Panel title="No News" icon={T.icons.bullet}>
          <EmptyState message="No news articles found" />
        </Panel>
      ) : (
        <Box flexDirection="column">
          {articles.slice(scrollOffset, scrollOffset + 20).map((article: any, i: number) => {
            const sentiment = article.sentiment || article.overallSentiment || 'NEUTRAL';
            const categories = article.categories || [];
            const importance = article.importance || article.impact || 'MEDIUM';
            const impColor = importance === 'HIGH' ? T.colors.peach : importance === 'LOW' ? T.colors.overlay0 : T.colors.yellow;

            return (
              <Panel
                key={i}
                title={T.truncate(article.title || 'Untitled', 35)}
                compact
                borderColor={T.colors.surface0}
              >
                {/* Meta line */}
                <Box>
                  <Text color={T.sentimentColor(sentiment)} bold>
                    {T.icons.dot} {(sentiment).toUpperCase().substring(0, 7)}
                  </Text>
                  <Text color={T.colors.overlay1}> {'\u2502'} </Text>
                  <Text color={impColor}>{importance}</Text>
                  <Text color={T.colors.overlay1}> {'\u2502'} </Text>
                  <Text color={T.colors.overlay0}>{T.timeAgo(article.publishedAt || article.timestamp || article.createdAt)}</Text>
                </Box>
                {/* Title */}
                <Box>
                  <Text color={T.colors.text} bold>{T.truncate(article.title || 'Untitled', 60)}</Text>
                </Box>
                {/* Details */}
                <Box>
                  {article.description && (
                    <Text color={T.colors.overlay0}>{T.truncate(article.description, 80)}</Text>
                  )}
                </Box>
                {/* Tags */}
                {categories.length > 0 && (
                  <Box>
                    <Text color={T.colors.overlay1}>
                      {'  '}{categories.slice(0, 5).map((c: string) => `#${c}`).join(' ')}
                    </Text>
                  </Box>
                )}
                {/* Source */}
                {(article.source || article.url) && (
                  <Box>
                    <Text color={T.colors.overlay1}>
                      {'  '}{article.source || 'Unknown'}
                      {article.url && <Text color={T.colors.blue}> {T.icons.right} link</Text>}
                    </Text>
                  </Box>
                )}
              </Panel>
            );
          })}
          {articles.length > scrollOffset + 20 && (
            <Text color={T.colors.overlay0}>
              {'  '}{T.icons.down} {articles.length - scrollOffset - 20} more articles...
            </Text>
          )}
        </Box>
      )}
    </Box>
  );
}

// =============================================================================
// 4. RISK VIEW — Full risk dashboard
// =============================================================================

export function RiskView({ data, loading }: ViewProps) {
  const risk = data.risk;
  const portfolio = data.portfolio;

  if (loading && !risk) {
    return (
      <Box flexDirection="column" alignItems="center" flexGrow={1} paddingTop={2}>
        <Spinner text="Loading risk data..." />
      </Box>
    );
  }

  const drawdown = risk?.drawdown || {};
  const exposure = risk?.exposure || {};
  const daily = risk?.dailyMetrics || {};
  const breakers: any[] = risk?.circuitBreakers || [];
  const warnings: string[] = risk?.warnings || [];

  return (
    <Box flexDirection="column" flexGrow={1}>
      <Box marginBottom={1}>
        <Text color={T.colors.subtext1} bold>
          {'  '}{T.icons.risk} Risk Dashboard
        </Text>
        {risk?.riskLevel && (
          <>
            <Text color={T.colors.surface2}> {'\u2502'}</Text>
            <Text color={T.riskLevelColor(risk.riskLevel)} bold>
              {' '}Risk: {risk.riskLevel}
            </Text>
          </>
        )}
      </Box>

      {!risk ? (
        <Panel title="No Risk Data" icon={T.icons.bullet}>
          <EmptyState message="Risk data not available" />
        </Panel>
      ) : (
        <>
          {/* Risk Score */}
          <Panel title="Risk Score" icon={T.icons.warning}>
            <ProgressBar
              percent={(risk.riskScore || 0) * 10}
              width={40}
              color={T.riskLevelColor(risk.riskLevel)}
            />
            {warnings.length > 0 && (
              <Box flexDirection="column" marginTop={1}>
                {warnings.slice(0, 5).map((w: string, i: number) => (
                  <Box key={i}>
                    <Text color={T.colors.yellow}>{T.icons.warning} </Text>
                    <Text color={T.colors.overlay0}>{w}</Text>
                  </Box>
                ))}
              </Box>
            )}
          </Panel>

          {/* Two column: Drawdown + Exposure */}
          <Box flexDirection="row">
            <Panel title="Drawdown" icon={T.icons.down} flex={1}>
              <DataRow
                label="Current"
                value={`${(drawdown.current || 0).toFixed(2)}%`}
                valueColor={drawdown.current > 10 ? T.colors.red : drawdown.current > 5 ? T.colors.yellow : T.colors.green}
              />
              <DataRow
                label="Max"
                value={`${(drawdown.max || 0).toFixed(2)}%`}
                valueColor={T.colors.peach}
              />
              <DataRow
                label="Daily"
                value={`${(drawdown.daily || 0).toFixed(2)}%`}
                valueColor={T.pnlColor(-(drawdown.daily || 0))}
              />
            </Panel>

            <Panel title="Exposure" icon={T.icons.chart} flex={1}>
              <DataRow label="Gross" value={T.formatUSD(exposure.gross || 0)} />
              <DataRow label="Net" value={T.formatUSD(exposure.net || 0)} />
              <DataRow label="Long" value={T.formatUSD(exposure.long || 0)} valueColor={T.colors.green} />
              <DataRow label="Short" value={T.formatUSD(exposure.short || 0)} valueColor={T.colors.red} />
              <DataRow label="Utilization" value={`${(exposure.utilization || 0).toFixed(1)}%`} />
              {exposure.utilization != null && (
                <ProgressBar percent={exposure.utilization} width={20} />
              )}
            </Panel>
          </Box>

          {/* Daily Metrics */}
          <Panel title="Today's Trading" icon={T.icons.clock}>
            <DataRow
              label="PnL"
              value={T.formatUSD(daily.pnl || 0)}
              valueColor={T.pnlColor(daily.pnl || 0)}
            />
            <DataRow label="Trades" value={`${daily.trades || 0}`} />
            <DataRow label="Wins" value={`${daily.wins || 0}`} valueColor={T.colors.green} />
            <DataRow label="Losses" value={`${daily.losses || 0}`} valueColor={T.colors.red} />
            {daily.consecutiveLosses > 0 && (
              <DataRow
                label="Consec. Losses"
                value={`${daily.consecutiveLosses}`}
                valueColor={daily.consecutiveLosses > 3 ? T.colors.red : T.colors.yellow}
              />
            )}
          </Panel>

          {/* Circuit Breakers */}
          <Panel title="Circuit Breakers" icon={T.icons.risk}>
            {breakers.length === 0 ? (
              <DataRow label="All Systems" value={<Text color={T.colors.green}>{T.icons.check} OK</Text>} />
            ) : (
              breakers.map((cb: any, i: number) => {
                const state = cb.state || 'CLOSED';
                const isOk = state === 'CLOSED';
                return (
                  <Box key={i} flexDirection="column">
                    <DataRow
                      label={cb.name || `Breaker ${i + 1}`}
                      value={
                        <Text color={isOk ? T.colors.green : T.colors.red}>
                          {isOk ? T.icons.check : T.icons.cross} {state}
                        </Text>
                      }
                    />
                    {cb.tripCount > 0 && (
                      <Text color={T.colors.overlay1}>
                        {'      '}Trips: {cb.tripCount}
                      </Text>
                    )}
                  </Box>
                );
              })
            )}
          </Panel>
        </>
      )}
    </Box>
  );
}

// =============================================================================
// 5. STRATEGIES VIEW — Strategy leaderboard
// =============================================================================

export function StrategiesView({ data, loading }: ViewProps) {
  const strategies: any[] = data.strategies?.strategies || [];
  const activeCount = data.strategies?.activeCount || 0;

  if (loading && strategies.length === 0) {
    return (
      <Box flexDirection="column" alignItems="center" flexGrow={1} paddingTop={2}>
        <Spinner text="Loading strategies..." />
      </Box>
    );
  }

  // Sort by Sharpe ratio descending
  const sorted = [...strategies].sort((a, b) => {
    const sa = a.performance?.sharpeRatio || 0;
    const sb = b.performance?.sharpeRatio || 0;
    return sb - sa;
  });

  return (
    <Box flexDirection="column" flexGrow={1}>
      <Box marginBottom={1}>
        <Text color={T.colors.subtext1} bold>
          {'  '}{T.icons.strategy} Strategies ({activeCount}/{strategies.length} active)
        </Text>
      </Box>

      {strategies.length === 0 ? (
        <Panel title="No Strategies" icon={T.icons.bullet}>
          <EmptyState message="No strategies configured" />
        </Panel>
      ) : (
        sorted.map((strat: any, i: number) => {
          const perf = strat.performance || {};
          const isActive = strat.isActive !== false;
          const symbols = (strat.symbols || []).join(', ');
          const type = strat.type || 'AI_PREDICTION';
          const totalPnL = perf.totalPnL || 0;
          const winRate = perf.winRate || 0;
          const sharpe = perf.sharpeRatio || 0;
          const trades = perf.totalTrades || 0;
          const maxDD = perf.maxDrawdown || 0;
          const pf = perf.profitFactor || 0;

          return (
            <Panel
              key={i}
              title={T.truncate(strat.name || 'Unnamed Strategy', 35)}
              icon={isActive ? T.icons.dot : T.icons.bullet}
              borderColor={isActive ? T.colors.surface1 : T.colors.surface0}
            >
              {/* Status & Type */}
              <Box>
                <Text color={isActive ? T.colors.green : T.colors.overlay1} bold>
                  {isActive ? 'ACTIVE' : 'INACTIVE'}
                </Text>
                <Text color={T.colors.overlay0}>
                  {' '}\u00b7 {type.replace(/_/g, ' ')}
                </Text>
              </Box>

              {/* Symbols */}
              {symbols && (
                <Text color={T.colors.overlay0}>
                  {'  '}Symbols: <Text color={T.colors.subtext0}>{symbols}</Text>
                </Text>
              )}

              {/* Performance Metrics Grid */}
              <Box flexDirection="row" marginTop={1}>
                <Box flexDirection="column" flexGrow={1}>
                  <DataRow
                    label="Sharpe"
                    value={sharpe.toFixed(2)}
                    valueColor={sharpe > 1 ? T.colors.green : sharpe > 0.5 ? T.colors.text : T.colors.red}
                    indent={0}
                  />
                  <DataRow
                    label="Win Rate"
                    value={`${(winRate * 100).toFixed(1)}%`}
                    valueColor={winRate > 0.6 ? T.colors.green : winRate > 0.4 ? T.colors.text : T.colors.red}
                    indent={0}
                  />
                  <DataRow label="Trades" value={`${trades}`} indent={0} />
                </Box>
                <Box flexDirection="column" flexGrow={1}>
                  <DataRow
                    label="PnL"
                    value={T.formatUSD(totalPnL)}
                    valueColor={T.pnlColor(totalPnL)}
                    indent={0}
                  />
                  <DataRow
                    label="Max DD"
                    value={`${maxDD.toFixed(1)}%`}
                    valueColor={maxDD > 15 ? T.colors.red : maxDD > 8 ? T.colors.yellow : T.colors.green}
                    indent={0}
                  />
                  <DataRow
                    label="Profit Factor"
                    value={pf.toFixed(2)}
                    valueColor={pf > 1.5 ? T.colors.green : pf > 1 ? T.colors.text : T.colors.red}
                    indent={0}
                  />
                </Box>
              </Box>

              {/* Mini bar */}
              <Box marginTop={1}>
                <ProgressBar
                  percent={Math.min(100, sharpe * 50)}
                  width={30}
                  color={sharpe > 1 ? T.colors.green : T.colors.teal}
                />
              </Box>
            </Panel>
          );
        })
      )}
    </Box>
  );
}

// =============================================================================
// 6. PREDICTIONS VIEW — Prediction market positions
// =============================================================================

export function PredictionsView({ data, loading }: ViewProps) {
  const positions: any[] = data.predictions?.positions || [];
  const signals: any[] = data.predictions?.signals || [];
  const totalPnL = data.predictions?.unrealizedPnL || 0;
  const totalPositions = data.predictions?.totalPositions || 0;

  if (loading && positions.length === 0) {
    return (
      <Box flexDirection="column" alignItems="center" flexGrow={1} paddingTop={2}>
        <Spinner text="Loading predictions..." />
      </Box>
    );
  }

  // Stats
  const won = positions.filter((p: any) => p.status === 'WON' || p.outcome === 'WON').length;
  const lost = positions.filter((p: any) => p.status === 'LOST' || p.outcome === 'LOST').length;
  const open = positions.filter((p: any) => !p.status || p.status === 'OPEN' || p.status === 'PENDING').length;

  return (
    <Box flexDirection="column" flexGrow={1}>
      <Box marginBottom={1}>
        <Text color={T.colors.subtext1} bold>
          {'  '}{T.icons.prediction} Predictions ({totalPositions} positions)
        </Text>
        <Text color={T.colors.surface2}> {'\u2502'}</Text>
        <Text color={T.colors.green}> {T.icons.check}{won}W</Text>
        <Text color={T.colors.overlay0}> </Text>
        <Text color={T.colors.red}>{T.icons.cross}{lost}L</Text>
        <Text color={T.colors.overlay0}> </Text>
        <Text color={T.colors.yellow}>{T.icons.dot}{open} open</Text>
        <Text color={T.colors.surface2}> {'\u2502'}</Text>
        <Text color={T.pnlColor(totalPnL)}>
          {' '}Unrealized: {T.formatUSD(totalPnL)}
        </Text>
      </Box>

      {positions.length === 0 ? (
        <Panel title="No Predictions" icon={T.icons.bullet}>
          <EmptyState message="No prediction market positions" />
        </Panel>
      ) : (
        <>
          {/* Prediction Signals */}
          {signals.length > 0 && (
            <Panel title="Recent Signals" icon={T.icons.live} compact>
              {signals.slice(0, 5).map((sig: any, i: number) => (
                <Box key={i} flexDirection="column" marginBottom={i < Math.min(signals.length, 5) - 1 ? 1 : 0}>
                  <Box>
                    <Text color={sig.action === 'BUY' ? T.colors.green : sig.action === 'SELL' ? T.colors.red : T.colors.yellow}>
                      {T.icons.diamond} {sig.action || 'HOLD'}
                    </Text>
                    <Text color={T.colors.text} bold> {T.truncate(sig.marketTitle || '???', 40)}</Text>
                  </Box>
                  <Text color={T.colors.overlay0}>
                    {'  '}Conf: {(sig.confidence * 100).toFixed(0)}%
                    {sig.reason && ` \u00b7 ${T.truncate(sig.reason, 50)}`}
                  </Text>
                </Box>
              ))}
            </Panel>
          )}

          {/* Prediction Positions */}
          {positions.map((pred: any, i: number) => {
            const status = pred.status || pred.outcome || 'OPEN';
            const pnl = pred.realizedPnL || pred.unrealizedPnL || pred.pnl || 0;
            const confidence = pred.confidence || pred.probability || 0;
            const title = pred.marketTitle || pred.title || pred.question || 'Unknown Market';
            const entryPrice = pred.entryPrice || pred.avgPrice || 0;
            const currentPrice = pred.currentPrice || pred.markPrice || 0;
            const size = pred.size || pred.quantity || 0;
            const side = pred.side || pred.outcome || 'YES';
            const isWon = status === 'WON';
            const isLost = status === 'LOST';
            const isOpen = !isWon && !isLost;

            return (
              <Panel
                key={i}
                title={T.truncate(title, 45)}
                icon={
                  isWon ? T.icons.check : isLost ? T.icons.cross : T.icons.prediction
                }
                borderColor={
                  isWon ? '#2d4a2d' : isLost ? '#4a2d2d' : T.colors.surface1
                }
              >
                <Box flexDirection="row">
                  <Box flexDirection="column" flexGrow={1}>
                    {/* Status badge */}
                    <Box>
                      <Text color={isWon ? T.colors.green : isLost ? T.colors.red : T.colors.yellow} bold>
                        {status.toUpperCase()}
                      </Text>
                      <Text color={T.colors.overlay0}>
                        {' '}\u00b7 {side === 'YES' ? 'YES' : 'NO'}
                      </Text>
                    </Box>
                    {/* Confidence */}
                    <DataRow
                      label="Confidence"
                      value={`${(confidence * 100 || confidence || 0).toFixed(0)}%`}
                      valueColor={confidence > 0.7 ? T.colors.green : confidence > 0.5 ? T.colors.yellow : T.colors.red}
                      indent={0}
                    />
                    {/* Size */}
                    {size > 0 && (
                      <DataRow label="Size" value={T.formatUSD(size)} indent={0} />
                    )}
                  </Box>
                  <Box flexDirection="column" flexGrow={1}>
                    {/* Prices */}
                    {entryPrice > 0 && (
                      <DataRow label="Entry" value={`$${entryPrice.toFixed(2)}`} indent={0} />
                    )}
                    {currentPrice > 0 && currentPrice !== entryPrice && (
                      <DataRow label="Current" value={`$${currentPrice.toFixed(2)}`} indent={0} />
                    )}
                    {/* PnL */}
                    <DataRow
                      label="PnL"
                      value={T.formatUSD(pnl)}
                      valueColor={T.pnlColor(pnl)}
                      indent={0}
                    />
                  </Box>
                </Box>
              </Panel>
            );
          })}
        </>
      )}
    </Box>
  );
}
