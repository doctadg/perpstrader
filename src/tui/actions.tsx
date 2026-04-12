// =============================================================================
// PerpsTrader TUI — Interactive Action Handlers
// =============================================================================
//
// Provides confirmation prompts and action execution for:
//   - Close Position (c key on Positions view)
//   - Cancel Order (x key on Orders view)
//   - Emergency Stop (e key anywhere)
//   - Trigger Trading Cycle (t key anywhere)
//
// These are React components that render inline confirmation dialogs.
// =============================================================================

import React, { useState, useEffect } from 'react';
import { Box, Text, useInput } from 'ink';
import * as T from './theme';
import { closePosition, cancelOrder, emergencyStop, triggerCycle } from './api';

// =============================================================================
// Types
// =============================================================================

export type ActionType = 'close-position' | 'cancel-order' | 'emergency-stop' | 'trigger-cycle' | null;

export interface ActionPrompt {
  type: ActionType;
  data?: any;           // extra data (positionId, orderId, etc.)
  message: string;      // display message
}

export interface ActionResult {
  type: ActionType;
  success: boolean;
  message: string;
  timestamp: Date;
}

// =============================================================================
// Confirmation Dialog Component
// =============================================================================

interface ConfirmDialogProps {
  prompt: ActionPrompt;
  onConfirm: () => void;
  onCancel: () => void;
  requireDouble?: boolean; // for emergency stop
}

export function ConfirmDialog({ prompt, onConfirm, onCancel, requireDouble }: ConfirmDialogProps) {
  const [phase, setPhase] = useState<'first' | 'typing' | 'executing'>(
    requireDouble ? 'first' : 'typing'
  );
  const [typed, setTyped] = useState('');
  const requiredWord = 'CONFIRM';

  useInput((input, key) => {
    if (key.escape || input === 'q') {
      onCancel();
      return;
    }

    if (phase === 'first') {
      // First press: any key to continue
      if (key.return || input === 'y' || input === 'Y') {
        setPhase('typing');
        setTyped('');
      }
      return;
    }

    if (phase === 'typing') {
      if (key.return) {
        // Check typed text
        if (requireDouble && typed.toUpperCase() !== requiredWord) {
          onCancel();
          return;
        }
        setPhase('executing');
        onConfirm();
        return;
      }
      if (key.backspace || key.delete) {
        setTyped((prev) => prev.slice(0, -1));
        return;
      }
      if (input && input.length === 1) {
        setTyped((prev) => (prev + input).slice(0, 10));
      }
    }
  });

  if (phase === 'executing') {
    return (
      <Box
        flexDirection="column"
        borderStyle="round"
        borderColor={T.colors.peach}
        paddingLeft={2}
        paddingRight={2}
        paddingTop={1}
        paddingBottom={1}
        marginTop={1}
      >
        <Text color={T.colors.peach}>
          {'  '}{T.icons.warning} Executing...
        </Text>
      </Box>
    );
  }

  if (requireDouble && phase === 'first') {
    return (
      <Box
        flexDirection="column"
        borderStyle="round"
        borderColor={T.colors.red}
        paddingLeft={2}
        paddingRight={2}
        paddingTop={1}
        paddingBottom={1}
        marginTop={1}
      >
        <Box>
          <Text color={T.colors.red} bold>{T.icons.warning} EMERGENCY STOP</Text>
        </Box>
        <Text color={T.colors.text}>
          {'  '}This will close ALL positions and cancel ALL orders!
        </Text>
        <Text color={T.colors.overlay0}>
          {'  '}Press [Enter] or [y] to continue, [Esc] to cancel
        </Text>
      </Box>
    );
  }

  if (requireDouble && phase === 'typing') {
    const match = typed.toUpperCase() === requiredWord;
    return (
      <Box
        flexDirection="column"
        borderStyle="round"
        borderColor={T.colors.red}
        paddingLeft={2}
        paddingRight={2}
        paddingTop={1}
        paddingBottom={1}
        marginTop={1}
      >
        <Box>
          <Text color={T.colors.red} bold>{T.icons.warning} FINAL CONFIRMATION</Text>
        </Box>
        <Text color={T.colors.overlay0}>
          {'  '}Type <Text color={T.colors.red} bold>{requiredWord}</Text> and press Enter:
        </Text>
        <Box>
          <Text color={match ? T.colors.green : T.colors.text}>
            {'  '}&gt; {typed}
            <Text color={T.colors.overlay0}>_</Text>
          </Text>
        </Box>
        <Text color={T.colors.overlay1}>
          {'  '}Press [Esc] to cancel
        </Text>
      </Box>
    );
  }

  // Normal confirmation (no double-confirm)
  return (
    <Box
      flexDirection="column"
      borderStyle="round"
      borderColor={T.colors.yellow}
      paddingLeft={2}
      paddingRight={2}
      paddingTop={1}
      paddingBottom={1}
      marginTop={1}
    >
      <Text color={T.colors.yellow} bold>{prompt.message}</Text>
      <Text color={T.colors.overlay0}>
        {'  '}Press [Enter] or [y] to confirm, [Esc] to cancel
      </Text>
    </Box>
  );
}

// =============================================================================
// Action Result Toast
// =============================================================================

interface ActionToastProps {
  result: ActionResult;
  onDismiss: () => void;
}

export function ActionToast({ result, onDismiss }: ActionToastProps) {
  const [visible, setVisible] = useState(true);

  useEffect(() => {
    const timer = setTimeout(() => {
      setVisible(false);
      onDismiss();
    }, 4000);
    return () => clearTimeout(timer);
  }, [onDismiss]);

  useInput((_input, key) => {
    if (key.return || _input === ' ') {
      setVisible(false);
      onDismiss();
    }
  });

  if (!visible) return null;

  const successColor = result.success ? T.colors.green : T.colors.red;
  const icon = result.success ? T.icons.check : T.icons.cross;

  return (
    <Box
      flexDirection="column"
      borderStyle="round"
      borderColor={successColor}
      paddingLeft={2}
      paddingRight={2}
      paddingTop={1}
      paddingBottom={1}
      marginTop={1}
    >
      <Box>
        <Text color={successColor} bold>{icon} {result.message}</Text>
      </Box>
      <Text color={T.colors.overlay0}>
        {'  '}Press any key to dismiss
      </Text>
    </Box>
  );
}

// =============================================================================
// Action Executor Hook
// =============================================================================

export function useActions(
  onResult: (result: ActionResult) => void
): {
  executeAction: (prompt: ActionPrompt) => Promise<void>;
} {
  const executeAction = React.useCallback(
    async (prompt: ActionPrompt) => {
      let result: ActionResult;

      switch (prompt.type) {
        case 'close-position': {
          const res = await closePosition(prompt.data?.positionId || '');
          result = {
            type: 'close-position',
            success: res?.success === true,
            message: res?.success
              ? `Position closed: ${res.symbol || prompt.data?.positionId}`
              : `Failed to close position: ${res?.error || 'Unknown error'}`,
            timestamp: new Date(),
          };
          break;
        }
        case 'cancel-order': {
          const res = await cancelOrder(prompt.data?.orderId || '');
          result = {
            type: 'cancel-order',
            success: res?.success === true,
            message: res?.success
              ? `Order cancelled: ${prompt.data?.orderId}`
              : `Failed to cancel order: ${res?.message || res?.error || 'Unknown error'}`,
            timestamp: new Date(),
          };
          break;
        }
        case 'emergency-stop': {
          const res = await emergencyStop();
          result = {
            type: 'emergency-stop',
            success: res?.success === true,
            message: res?.success
              ? `EMERGENCY STOP: ${res.positionsClosed || 0} positions closed, ${res.ordersCancelled || 0} orders cancelled`
              : `Emergency stop failed: ${res?.error || 'Unknown error'}`,
            timestamp: new Date(),
          };
          break;
        }
        case 'trigger-cycle': {
          const res = await triggerCycle(prompt.data?.symbol);
          result = {
            type: 'trigger-cycle',
            success: res?.success === true,
            message: res?.success
              ? `Trading cycle triggered: ${res.cycleId || 'success'}`
              : `Failed to trigger cycle: ${res?.error || 'Unknown error'}`,
            timestamp: new Date(),
          };
          break;
        }
        default:
          return;
      }

      onResult(result);
    },
    [onResult]
  );

  return { executeAction };
}
