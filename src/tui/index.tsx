#!/usr/bin/env node
// =============================================================================
// PerpsTrader TUI — Main Entry Point
// =============================================================================
// Hyprland rice-style terminal dashboard for the PerpsTrader trading system.
// Uses Ink (React for CLI) with Catppuccin Mocha color palette.
// =============================================================================

import React, { useState, useEffect, useCallback, useRef } from 'react';
import { render, Box, Text, useApp, useInput, useStdout } from 'ink';
import chalk from 'chalk';
import * as T from './theme';
import { fetchAllData, getApiUrl, ApiData } from './api';
import { HeaderBar, FooterBar, Spinner, Separator } from './components';
import {
  DashboardView,
  PositionsView,
  NewsView,
  RiskView,
  StrategiesView,
  PredictionsView,
} from './views';

// =============================================================================
// Constants
// =============================================================================

const VIEW_NAMES = [
  'Dashboard',
  'Positions',
  'News',
  'Risk',
  'Strategies',
  'Predictions',
] as const;

const DEFAULT_REFRESH_INTERVAL = 5; // seconds
const MIN_REFRESH = 1;
const MAX_REFRESH = 60;

const EMPTY_DATA: ApiData = {
  status: null,
  portfolio: null,
  positions: null,
  signals: null,
  news: null,
  predictions: null,
  risk: null,
  strategies: null,
};

// =============================================================================
// App Component
// =============================================================================

function App() {
  const { exit } = useApp();
  const { stdout } = useStdout();

  // State
  const [activeView, setActiveView] = useState(0);
  const [data, setData] = useState<ApiData>(EMPTY_DATA);
  const [connected, setConnected] = useState(false);
  const [loading, setLoading] = useState(true);
  const [lastRefresh, setLastRefresh] = useState<Date | null>(null);
  const [refreshInterval, setRefreshInterval] = useState(DEFAULT_REFRESH_INTERVAL);
  const [scrollOffset, setScrollOffset] = useState(0);
  const [uptime, setUptime] = useState(0);
  const [showHelp, setShowHelp] = useState(false);

  const refreshTimerRef = useRef<any>(null);
  const uptimeTimerRef = useRef<any>(null);
  const mountedRef = useRef(true);

  // =============================================================================
  // Data Fetching
  // =============================================================================

  const refresh = useCallback(async () => {
    setLoading(true);
    try {
      const result = await fetchAllData();
      if (!mountedRef.current) return;

      setData(result.data);
      setConnected(result.connected);
      setLastRefresh(new Date());
      setLoading(false);
    } catch {
      if (mountedRef.current) {
        setConnected(false);
        setLoading(false);
      }
    }
  }, []);

  // Initial fetch + auto-refresh
  useEffect(() => {
    mountedRef.current = true;
    refresh();

    // Auto-refresh interval
    refreshTimerRef.current = setInterval(() => {
      refresh();
    }, refreshInterval * 1000);

    // Uptime ticker
    const startTime = Date.now();
    uptimeTimerRef.current = setInterval(() => {
      setUptime(Date.now() - startTime);
    }, 1000);

    return () => {
      mountedRef.current = false;
      if (refreshTimerRef.current) clearInterval(refreshTimerRef.current);
      if (uptimeTimerRef.current) clearInterval(uptimeTimerRef.current);
    };
  }, [refreshInterval, refresh]);

  // =============================================================================
  // Keyboard Navigation
  // =============================================================================

  useInput((input, key) => {
    // View switching: 1-6
    if (input >= '1' && input <= '6') {
      setActiveView(parseInt(input) - 1);
      setScrollOffset(0);
      return;
    }

    // Quit
    if (input === 'q' || key.escape) {
      exit();
      return;
    }

    // Manual refresh
    if (input === 'r') {
      refresh();
      return;
    }

    // Adjust refresh interval
    if (input === '+' || input === '=') {
      setRefreshInterval((prev) => Math.max(MIN_REFRESH, prev - 1));
      return;
    }
    if (input === '-') {
      setRefreshInterval((prev) => Math.min(MAX_REFRESH, prev + 1));
      return;
    }

    // Scroll
    if (key.upArrow || input === 'k') {
      setScrollOffset((prev) => Math.max(0, prev - 1));
      return;
    }
    if (key.downArrow || input === 'j') {
      setScrollOffset((prev) => prev + 1);
      return;
    }
    if (input === 'g') {
      setScrollOffset(0);
      return;
    }

    // Tab to cycle views
    if (input === 'h') {
      setActiveView((prev) => (prev - 1 + VIEW_NAMES.length) % VIEW_NAMES.length);
      setScrollOffset(0);
      return;
    }
    if (input === 'l') {
      setActiveView((prev) => (prev + 1) % VIEW_NAMES.length);
      setScrollOffset(0);
      return;
    }

    // Help
    if (input === '?') {
      setShowHelp((prev) => !prev);
      return;
    }
  });

  // =============================================================================
  // Render View
  // =============================================================================

  const renderView = () => {
    switch (activeView) {
      case 0:
        return <DashboardView data={data} loading={loading} scrollOffset={scrollOffset} />;
      case 1:
        return <PositionsView data={data} loading={loading} scrollOffset={scrollOffset} />;
      case 2:
        return <NewsView data={data} loading={loading} scrollOffset={scrollOffset} />;
      case 3:
        return <RiskView data={data} loading={loading} scrollOffset={scrollOffset} />;
      case 4:
        return <StrategiesView data={data} loading={loading} scrollOffset={scrollOffset} />;
      case 5:
        return <PredictionsView data={data} loading={loading} scrollOffset={scrollOffset} />;
      default:
        return <DashboardView data={data} loading={loading} scrollOffset={scrollOffset} />;
    }
  };

  // =============================================================================
  // Connection Banner
  // =============================================================================

  const connectionBanner = !connected && !loading ? (
    <Box
      borderStyle="round"
      borderColor={T.colors.surface1}
      paddingLeft={2}
      paddingRight={2}
      paddingTop={1}
      paddingBottom={1}
      marginBottom={1}
      justifyContent="center"
    >
      <Box>
        <Text color={T.colors.yellow}>{T.icons.warning} </Text>
        <Text color={T.colors.subtext0}>Cannot connect to Agent API at </Text>
        <Text color={T.colors.peach} bold>{getApiUrl()}</Text>
        <Text color={T.colors.overlay0}> {'\u2014'} showing empty state. </Text>
        <Text color={T.colors.overlay1}>[r] to retry</Text>
      </Box>
    </Box>
  ) : null;

  // =============================================================================
  // Help Overlay
  // =============================================================================

  const helpOverlay = showHelp ? (
    <Box
      flexDirection="column"
      borderStyle="round"
      borderColor={T.colors.mauve}
      paddingLeft={2}
      paddingRight={2}
      paddingTop={1}
      paddingBottom={1}
      marginBottom={1}
    >
      <Text color={T.colors.mauve} bold>
        {'  '}{T.icons.settings} Keyboard Shortcuts
      </Text>
      <Box flexDirection="column" marginTop={1}>
        <Text color={T.colors.text}><Text color={T.colors.mauve} bold>{'  '}[1-6]</Text> Switch views</Text>
        <Text color={T.colors.text}><Text color={T.colors.mauve} bold>{'  '}[h/l]</Text> Previous/next view</Text>
        <Text color={T.colors.text}><Text color={T.colors.mauve} bold>{'  '}[\u2191\u2193 j/k]</Text> Scroll content</Text>
        <Text color={T.colors.text}><Text color={T.colors.mauve} bold>{'  '}[g/End]</Text> Scroll to top/bottom</Text>
        <Text color={T.colors.text}><Text color={T.colors.mauve} bold>{'  '}[r]</Text> Refresh data now</Text>
        <Text color={T.colors.text}><Text color={T.colors.mauve} bold>{'  '}[+/-]</Text> Adjust refresh interval ({refreshInterval}s)</Text>
        <Text color={T.colors.text}><Text color={T.colors.mauve} bold>{'  '}[?]</Text> Toggle this help</Text>
        <Text color={T.colors.text}><Text color={T.colors.red} bold>{'  '}[q/Esc]</Text> Quit</Text>
      </Box>
      <Text color={T.colors.overlay0}>{'  '}Press [?] to close</Text>
    </Box>
  ) : null;

  // =============================================================================
  // Version from status
  // =============================================================================

  const version = data.status?.version || '2.0.0';

  // =============================================================================
  // Main Layout
  // =============================================================================

  return (
    <Box flexDirection="column">
      {/* Header */}
      <HeaderBar
        connected={connected}
        portfolio={data.portfolio}
        refreshInterval={refreshInterval}
        uptime={uptime}
        version={version}
      />

      {/* Connection Warning */}
      {connectionBanner}

      {/* Main Content */}
      <Box flexDirection="column" flexGrow={1}>
        {renderView()}
      </Box>

      {/* Help Overlay */}
      {helpOverlay}

      {/* Footer */}
      <FooterBar
        activeView={activeView}
        refreshInterval={refreshInterval}
        loading={loading}
      />
    </Box>
  );
}

// =============================================================================
// Bootstrap
// =============================================================================

// Set terminal title
process.title = 'PerpsTrader TUI';
if (process.stdout.isTTY) {
  process.stdout.write('\x1b]2;PerpsTrader TUI\x07');
}

// Check for TTY support (Ink requires raw mode on stdin)
if (!process.stdin.isTTY) {
  process.stdout.write(chalk.hex(T.colors.red)(`\n  ${T.icons.cross} Error: PerpsTrader TUI requires an interactive terminal (TTY).\n`));
  process.stdout.write(chalk.hex(T.colors.overlay0)(`  ${T.icons.dash} Run directly in a terminal, not piped.\n\n`));
  process.exit(1);
}

// Render the app
const { waitUntilExit } = render(<App />);

// Handle uncaught errors gracefully
process.on('uncaughtException', (err) => {
  process.stderr.write(chalk.hex(T.colors.red)(`\n  ${T.icons.cross} Error: ${err.message}\n`));
  process.exit(1);
});

process.on('unhandledRejection', (reason) => {
  process.stderr.write(chalk.hex(T.colors.yellow)(`\n  ${T.icons.warning} Unhandled rejection: ${reason}\n`));
});

export { waitUntilExit };
