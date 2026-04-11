// =============================================================================
// PerpsTrader TUI — Shared UI Components
// =============================================================================

import React from 'react';
import { Box, Text, useStdout } from 'ink';
import * as T from './theme';

// =============================================================================
// Panel — Rounded box with title
// =============================================================================

export interface PanelProps {
  title: string;
  icon?: string;
  width?: string | number;
  flex?: number;
  children: React.ReactNode;
  borderColor?: string;
  dim?: boolean;
  compact?: boolean;
}

export function Panel({
  title,
  icon,
  width,
  flex,
  children,
  borderColor,
  dim,
  compact,
}: PanelProps) {
  const borderCol = borderColor || T.colors.surface1;
  const titleColor = dim ? T.colors.overlay1 : T.colors.subtext1;
  const iconColor = dim ? T.colors.overlay0 : T.colors.mauve;

  return (
    <Box
      flexDirection="column"
      width={width}
      flexGrow={flex}
      flexShrink={0}
      borderStyle="round"
      borderColor={borderCol}
      paddingLeft={1}
      paddingRight={1}
      paddingTop={0}
      paddingBottom={0}
      marginBottom={1}
    >
      <Box>
        {icon && <Text color={iconColor}>{icon}</Text>}
        {icon && <Text> </Text>}
        <Text color={titleColor} bold>{title}</Text>
        <Text color={T.colors.surface2}> {'\u2500'.repeat(3)}</Text>
      </Box>
      <Box flexDirection="column">{children}</Box>
    </Box>
  );
}

// =============================================================================
// Header Bar
// =============================================================================

export interface HeaderBarProps {
  connected: boolean;
  portfolio: any;
  refreshInterval: number;
  uptime: number;
  version?: string;
}

export function HeaderBar({ connected, portfolio, refreshInterval, uptime, version }: HeaderBarProps) {
  const { stdout } = useStdout();
  const w = stdout?.columns || 100;

  const portfolioValue = portfolio?.totalValue || 0;
  const unrealizedPnL = portfolio?.unrealizedPnL || 0;
  const pnlPct = portfolioValue > 0 ? (unrealizedPnL / portfolioValue) * 100 : 0;
  const positionCount = portfolio?.positionCount || 0;
  const statusText = connected ? 'LIVE' : 'OFFLINE';
  const statusColor = connected ? T.colors.green : T.colors.red;
  const uptimeStr = T.formatUptime(uptime);

  return (
    <Box flexDirection="column">
      <Text color={T.colors.surface1}>{'\u2500'.repeat(w)}</Text>
      <Box>
        <Text> </Text>
        <Text color={T.colors.mauve} bold>{T.icons.logo} PerpsTrader</Text>
        {version && <Text color={T.colors.overlay0}> {version}</Text>}
        <Text color={T.colors.surface2}> {'\u2502'}</Text>
        <Text color={statusColor}> {T.icons.dot} {statusText}</Text>
        <Text color={T.colors.surface2}> {'\u2502'}</Text>
        <Text color={T.colors.subtext0}> {T.icons.wallet} {T.formatUSD(portfolioValue)}</Text>
        <Text color={T.colors.surface2}> {'\u2502'}</Text>
        <Text color={T.pnlColor(unrealizedPnL)}> {T.pnlIcon(unrealizedPnL)} {T.formatUSD(unrealizedPnL)}</Text>
        <Text color={T.colors.overlay1}> ({T.formatPct(pnlPct)})</Text>
        <Text color={T.colors.surface2}> {'\u2502'}</Text>
        <Text color={T.colors.overlay0}> {T.icons.clock} {uptimeStr}</Text>
        <Text color={T.colors.surface2}> {'\u2502'}</Text>
        <Text color={T.colors.overlay0}> {positionCount} pos</Text>
        <Text color={T.colors.surface2}> {'\u2502'}</Text>
        <Text color={T.colors.overlay0}> {refreshInterval}s</Text>
      </Box>
      <Text color={T.colors.surface1}>{'\u2500'.repeat(w)}</Text>
    </Box>
  );
}

// =============================================================================
// Footer Bar — Keybinding hints (no chalk — pure Ink Text components)
// =============================================================================

export interface FooterBarProps {
  activeView: number;
  refreshInterval: number;
  loading: boolean;
}

export function FooterBar({ activeView, refreshInterval, loading }: FooterBarProps) {
  const { stdout } = useStdout();
  const w = stdout?.columns || 100;

  const views = [
    { key: '1', short: 'Dash' },
    { key: '2', short: 'Pos' },
    { key: '3', short: 'News' },
    { key: '4', short: 'Risk' },
    { key: '5', short: 'Strat' },
    { key: '6', short: 'Pred' },
  ];

  return (
    <Box flexDirection="column">
      <Text color={T.colors.surface0}>{'\u2500'.repeat(w)}</Text>
      <Box>
        <Text> </Text>
        <Text color={T.colors.overlay0}>{T.icons.clock} {loading ? 'refreshing...' : `every ${refreshInterval}s`}</Text>
        <Text color={T.colors.surface2}> {'\u2502'} </Text>
        {views.map((v, i) => (
          <React.Fragment key={v.key}>
            <Text color={i === activeView ? T.colors.mauve : T.colors.overlay0}>
              {i === activeView ? `[${v.key}] ${v.short}` : ` ${v.key}  ${v.short}`}
            </Text>
            <Text> </Text>
          </React.Fragment>
        ))}
        <Text color={T.colors.surface2}> {'\u2502'} </Text>
        <Text color={T.colors.overlay0}>[r]efresh</Text>
        <Text color={T.colors.surface2}> {'\u2502'} </Text>
        <Text color={T.colors.overlay0}>[+/-]speed</Text>
        <Text color={T.colors.surface2}> {'\u2502'} </Text>
        <Text color={T.colors.red}>[q]uit</Text>
      </Box>
    </Box>
  );
}

// =============================================================================
// Spinner
// =============================================================================

export function Spinner({ text, color }: { text?: string; color?: string }) {
  const [frame, setFrame] = React.useState(0);
  const frames = ['\u2807', '\u280b', '\u2839', '\u2838', '\u283c', '\u2834', '\u2826', '\u2827', '\u2807', '\u280f'];
  const c = color || T.colors.mauve;

  React.useEffect(() => {
    const id = setInterval(() => setFrame((f) => (f + 1) % frames.length), 80);
    return () => clearInterval(id);
  }, []);

  return <Text color={c}>{frames[frame]} {text || 'Loading'}</Text>;
}

// =============================================================================
// Empty State
// =============================================================================

export function EmptyState({ message, icon }: { message: string; icon?: string }) {
  return (
    <Text color={T.colors.overlay0}>
      {'  '}{icon || T.icons.bullet} {message}
    </Text>
  );
}

// =============================================================================
// Progress Bar
// =============================================================================

export function ProgressBar({
  percent,
  width = 20,
  color,
}: {
  percent: number;
  width?: number;
  color?: string;
}) {
  const bar = T.progressBar(Math.min(100, Math.max(0, percent)), width);
  const pctColor =
    color ||
    (percent > 80 ? T.colors.red : percent > 60 ? T.colors.yellow : percent > 30 ? T.colors.teal : T.colors.green);

  return (
    <Text>
      <Text color={pctColor}>{bar}</Text>
      <Text color={T.colors.overlay1}> {percent.toFixed(1)}%</Text>
    </Text>
  );
}

// =============================================================================
// Section Label
// =============================================================================

export function Label({ children, color }: { children: React.ReactNode; color?: string }) {
  return <Text color={color || T.colors.overlay0}>{children}</Text>;
}

// =============================================================================
// Data Row — key-value pair
// =============================================================================

export function DataRow({
  label,
  value,
  valueColor,
  indent = 1,
}: {
  label: string;
  value: string | React.ReactNode;
  valueColor?: string;
  indent?: number;
}) {
  const prefix = '  '.repeat(indent);
  return (
    <Box>
      <Text color={T.colors.overlay0}>
        {prefix}{T.box.lj} {label}:{' '}
      </Text>
      <Text color={valueColor || T.colors.text}>{value}</Text>
    </Box>
  );
}

// =============================================================================
// Separator
// =============================================================================

export function Separator({ width }: { width?: number }) {
  const { stdout } = useStdout();
  const w = width || stdout?.columns || 80;
  return <Text color={T.colors.surface0}>{'\u2500'.repeat(w)}</Text>;
}

// =============================================================================
// View Wrapper — handles loading/empty states for full views
// =============================================================================

export interface ViewProps {
  data: any;
  loading: boolean;
  scrollOffset: number;
}

export function ViewWrapper({
  title,
  icon,
  loading,
  children,
}: {
  title: string;
  icon?: string;
  loading: boolean;
  children: React.ReactNode;
}) {
  if (loading) {
    return (
      <Box flexDirection="column" alignItems="center" justifyContent="center" flexGrow={1}>
        <Spinner text={`Loading ${title.toLowerCase()}...`} />
      </Box>
    );
  }
  return <Box flexDirection="column">{children}</Box>;
}
