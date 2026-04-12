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
import {
  fetchAllData,
  fetchOrders,
  fetchBacktestHistory,
  getApiUrl,
  ApiData,
} from './api';
import { HeaderBar, FooterBar, Spinner, Separator } from './components';
import {
  DashboardView,
  PositionsView,
  NewsView,
  RiskView,
  StrategiesView,
  PredictionsView,
  OrdersView,
  BacktestView,
} from './views';
import {
  ConfirmDialog,
  ActionToast,
  useActions,
  ActionPrompt,
  ActionResult,
  ActionType,
} from './actions';

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
  'Orders',
  'Backtest',
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
  const [selectedIndex, setSelectedIndex] = useState(0);
  const [uptime, setUptime] = useState(0);
  const [showHelp, setShowHelp] = useState(false);

  // Action state
  const [actionPrompt, setActionPrompt] = useState<ActionPrompt | null>(null);
  const [actionResult, setActionResult] = useState<ActionResult | null>(null);

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

      setData((prev) => ({
        ...prev,
        ...result.data,
      }));
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

  // Fetch additional data for specific views
  const refreshOrders = useCallback(async () => {
    try {
      const result = await fetchOrders();
      if (mountedRef.current && result) {
        setData((prev) => ({ ...prev, orders: result }));
      }
    } catch { /* ignore */ }
  }, []);

  const refreshBacktest = useCallback(async () => {
    try {
      const result = await fetchBacktestHistory();
      if (mountedRef.current && result) {
        setData((prev) => ({ ...prev, backtest: result }));
      }
    } catch { /* ignore */ }
  }, []);

  // Initial fetch + auto-refresh
  useEffect(() => {
    mountedRef.current = true;
    refresh();

    // Auto-refresh interval
    refreshTimerRef.current = setInterval(() => {
      refresh();
      // Also refresh view-specific data
      if (activeView === 6) refreshOrders();     // Orders view
      if (activeView === 7) refreshBacktest();    // Backtest view
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
  }, [refreshInterval, refresh, activeView]);

  // Fetch view-specific data when switching views
  useEffect(() => {
    if (activeView === 6) refreshOrders();
    if (activeView === 7) refreshBacktest();
  }, [activeView, refreshOrders, refreshBacktest]);

  // =============================================================================
  // Item count helpers for scrolling bounds
  // =============================================================================

  const getItemCount = useCallback((): number => {
    switch (activeView) {
      case 1: // Positions
        return (data.positions?.positions || []).length;
      case 4: // Strategies
        return (data.strategies?.strategies || []).length;
      case 6: // Orders
        return (data.orders?.orders || []).length;
      case 7: // Backtest
        return (data.backtest?.runs || []).length;
      default:
        return 0;
    }
  }, [activeView, data]);

  // =============================================================================
  // Action handlers
  // =============================================================================

  const handleActionResult = useCallback((result: ActionResult) => {
    setActionPrompt(null);
    setActionResult(result);
    // Refresh data after action
    setTimeout(() => refresh(), 500);
  }, [refresh]);

  const { executeAction } = useActions(handleActionResult);

  const dismissResult = useCallback(() => {
    setActionResult(null);
  }, []);

  const handleViewAction = useCallback((type: string, actionData: any) => {
    switch (type) {
      case 'close-position': {
        const positions: any[] = data.positions?.positions || [];
        const selected = positions[selectedIndex];
        if (!selected) return;
        setActionPrompt({
          type: 'close-position',
          data: { positionId: selected.id || selected.coin || selected.symbol },
          message: `Close position: ${selected.symbol || selected.coin}? (PnL will be realized)`,
        });
        break;
      }
      case 'cancel-order': {
        const orders: any[] = data.orders?.orders || [];
        const selected = orders[selectedIndex];
        if (!selected) return;
        setActionPrompt({
          type: 'cancel-order',
          data: { orderId: selected.id || selected.orderId },
          message: `Cancel order ${selected.id || selected.orderId} (${selected.symbol})?`,
        });
        break;
      }
      default:
        break;
    }
  }, [data, selectedIndex]);

  // =============================================================================
  // Keyboard Navigation
  // =============================================================================

  useInput((input, key) => {
    // If confirmation dialog is shown, don't process other keys
    if (actionPrompt) return;
    // If action result toast is shown, any key dismisses
    if (actionResult) return;

    // View switching: 1-8
    if (input >= '1' && input <= '8') {
      setActiveView(parseInt(input) - 1);
      setScrollOffset(0);
      setSelectedIndex(0);
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
      if (activeView === 6) refreshOrders();
      if (activeView === 7) refreshBacktest();
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

    // Emergency Stop — 'e' key anywhere
    if (input === 'e' && !showHelp) {
      setActionPrompt({
        type: 'emergency-stop',
        message: 'EMERGENCY STOP — close all positions?',
      });
      return;
    }

    // Trigger Trading Cycle — 't' key
    if (input === 't' && !showHelp) {
      setActionPrompt({
        type: 'trigger-cycle',
        message: 'Trigger a new trading cycle?',
      });
      return;
    }

    // Close Position — 'c' key on Positions view
    if (input === 'c' && activeView === 1 && !showHelp) {
      handleViewAction('close-position', null);
      return;
    }

    // Cancel Order — 'x' key on Orders view
    if (input === 'x' && activeView === 6 && !showHelp) {
      handleViewAction('cancel-order', null);
      return;
    }

    // Scroll / Select — Up/Down or j/k
    if (key.upArrow || input === 'k') {
      setSelectedIndex((prev) => Math.max(0, prev - 1));
      // Auto-scroll: if selection goes above visible area, scroll up
      if (selectedIndex <= scrollOffset) {
        setScrollOffset((prev) => Math.max(0, prev - 1));
      }
      return;
    }
    if (key.downArrow || input === 'j') {
      const count = getItemCount();
      const newIdx = Math.min(count - 1, selectedIndex + 1);
      setSelectedIndex(newIdx);
      // Auto-scroll: if selection goes below visible area, scroll down
      const maxVisible = activeView === 1 ? 2 : activeView === 4 ? 2 : activeView === 7 ? 10 : 15;
      if (newIdx >= scrollOffset + maxVisible) {
        setScrollOffset((prev) => prev + 1);
      }
      return;
    }
    if (input === 'g') {
      setScrollOffset(0);
      setSelectedIndex(0);
      return;
    }
    // Page up/down
    if ((key as any).pageUp) {
      const maxVisible = activeView === 1 ? 2 : activeView === 4 ? 2 : activeView === 7 ? 10 : 15;
      const jump = Math.max(1, maxVisible - 1);
      setScrollOffset((prev) => Math.max(0, prev - jump));
      setSelectedIndex((prev) => Math.max(0, prev - jump));
      return;
    }
    if ((key as any).pageDown) {
      const count = getItemCount();
      const maxVisible = activeView === 1 ? 2 : activeView === 4 ? 2 : activeView === 7 ? 10 : 15;
      const jump = Math.max(1, maxVisible - 1);
      setScrollOffset((prev) => Math.min(Math.max(0, count - maxVisible), prev + jump));
      setSelectedIndex((prev) => Math.min(count - 1, prev + jump));
      return;
    }

    // Tab to cycle views
    if (input === 'h') {
      setActiveView((prev) => (prev - 1 + VIEW_NAMES.length) % VIEW_NAMES.length);
      setScrollOffset(0);
      setSelectedIndex(0);
      return;
    }
    if (input === 'l') {
      setActiveView((prev) => (prev + 1) % VIEW_NAMES.length);
      setScrollOffset(0);
      setSelectedIndex(0);
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
    const props = {
      data,
      loading,
      scrollOffset,
      selectedIndex,
      onAction: handleViewAction,
    };

    switch (activeView) {
      case 0:
        return <DashboardView {...props} />;
      case 1:
        return <PositionsView {...props} />;
      case 2:
        return <NewsView {...props} />;
      case 3:
        return <RiskView {...props} />;
      case 4:
        return <StrategiesView {...props} />;
      case 5:
        return <PredictionsView {...props} />;
      case 6:
        return <OrdersView {...props} />;
      case 7:
        return <BacktestView {...props} />;
      default:
        return <DashboardView {...props} />;
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
        <Text color={T.colors.text}><Text color={T.colors.mauve} bold>{'  '}[1-8]</Text> Switch views</Text>
        <Text color={T.colors.text}><Text color={T.colors.mauve} bold>{'  '}[h/l]</Text> Previous/next view</Text>
        <Text color={T.colors.text}><Text color={T.colors.mauve} bold>{'  '}{'\u2191\u2193 j/k'}</Text> Select / scroll</Text>
        <Text color={T.colors.text}><Text color={T.colors.mauve} bold>{'  '}[g/End]</Text> Scroll to top/bottom</Text>
        <Text color={T.colors.text}><Text color={T.colors.mauve} bold>{'  '}[r]</Text> Refresh data now</Text>
        <Text color={T.colors.text}><Text color={T.colors.mauve} bold>{'  '}[+/-]</Text> Adjust refresh interval ({refreshInterval}s)</Text>
        <Text color={T.colors.text}><Text color={T.colors.peach} bold>{'  '}[e]</Text> Emergency stop (double confirm)</Text>
        <Text color={T.colors.text}><Text color={T.colors.teal} bold>{'  '}[t]</Text> Trigger trading cycle</Text>
        <Text color={T.colors.text}><Text color={T.colors.yellow} bold>{'  '}[c]</Text> Close selected position</Text>
        <Text color={T.colors.text}><Text color={T.colors.yellow} bold>{'  '}[x]</Text> Cancel selected order</Text>
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

        {/* Confirmation Dialog */}
        {actionPrompt && (
          <ConfirmDialog
            prompt={actionPrompt}
            requireDouble={actionPrompt.type === 'emergency-stop'}
            onConfirm={() => executeAction(actionPrompt)}
            onCancel={() => setActionPrompt(null)}
          />
        )}

        {/* Action Result Toast */}
        {actionResult && (
          <ActionToast result={actionResult} onDismiss={dismissResult} />
        )}
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
