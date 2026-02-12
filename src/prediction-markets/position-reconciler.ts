// Position Reconciler - Syncs local positions with actual on-chain state
// Critical for ensuring position accuracy and preventing orphaned positions

import logger from '../../shared/logger';
import predictionStore from '../../data/prediction-store';
import { PredictionPosition, PredictionMarket } from '../../shared/types';
import { polymarketGammaClient } from './resilient-api-client';

interface ReconciliationResult {
  timestamp: number;
  discrepancies: PositionDiscrepancy[];
  orphanedPositions: PredictionPosition[];
  stalePositions: PredictionPosition[];
  synced: boolean;
}

interface PositionDiscrepancy {
  position: PredictionPosition;
  actualShares: number;
  expectedShares: number;
  difference: number;
  severity: 'MINOR' | 'MAJOR' | 'CRITICAL';
}

interface OnChainPosition {
  marketId: string;
  tokenId: string;
  outcome: 'YES' | 'NO';
  shares: number;
  avgPrice: number;
}

class PositionReconciler {
  private lastReconciliation = 0;
  private reconciliationInterval: number;
  private isRunning = false;
  private discrepanciesFound = 0;

  constructor() {
    this.reconciliationInterval = parseInt(
      process.env.PREDICTION_RECONCILIATION_INTERVAL_MS || '300000',
      10
    ); // Default 5 minutes
  }

  // ========================================================================
  // CORE RECONCILIATION
  // ========================================================================

  /**
   * Perform full position reconciliation
   * Should be called periodically (every 5 minutes) and before/after trades
   */
  public async reconcile(): Promise<ReconciliationResult> {
    if (this.isRunning) {
      logger.warn('[PositionReconciler] Reconciliation already in progress');
      return this.getLastResult();
    }

    this.isRunning = true;
    const startTime = Date.now();

    try {
      logger.info('[PositionReconciler] Starting position reconciliation...');

      // 1. Get local positions
      const localPositions = predictionStore.getPositions();

      // 2. Get on-chain positions (would be implemented with real CLOB API)
      const onChainPositions = await this.fetchOnChainPositions();

      // 3. Find discrepancies
      const discrepancies = this.findDiscrepancies(localPositions, onChainPositions);

      // 4. Find orphaned positions (local exists but not on-chain)
      const orphanedPositions = this.findOrphanedPositions(localPositions, onChainPositions);

      // 5. Find stale positions (market closed/resolved but position still open)
      const stalePositions = await this.findStalePositions(localPositions);

      // 6. Log results
      const result: ReconciliationResult = {
        timestamp: Date.now(),
        discrepancies,
        orphanedPositions,
        stalePositions,
        synced: discrepancies.length === 0 && orphanedPositions.length === 0,
      };

      this.logReconciliation(result, localPositions.length);

      // 7. Handle critical discrepancies
      if (discrepancies.some(d => d.severity === 'CRITICAL')) {
        await this.handleCriticalDiscrepancy(discrepancies);
      }

      // 8. Clean up orphaned positions
      if (orphanedPositions.length > 0) {
        await this.cleanupOrphanedPositions(orphanedPositions);
      }

      this.lastReconciliation = Date.now();
      this.discrepanciesFound += discrepancies.length;

      return result;
    } catch (error) {
      logger.error('[PositionReconciler] Reconciliation failed:', error);
      throw error;
    } finally {
      this.isRunning = false;
    }
  }

  /**
   * Fetch positions from on-chain (Polymarket CLOB API)
   * NOTE: This is a placeholder - real implementation needs wallet integration
   */
  private async fetchOnChainPositions(): Promise<OnChainPosition[]> {
    // In real implementation:
    // 1. Query Polymarket CLOB API for current positions
    // 2. Parse token holdings from wallet
    // 3. Map to position format

    // For now, return empty array (paper trading mode)
    if (process.env.PREDICTION_PAPER_TRADING !== 'false') {
      return [];
    }

    // TODO: Implement real CLOB API integration
    logger.warn('[PositionReconciler] Real on-chain position fetching not yet implemented');
    return [];
  }

  private findDiscrepancies(
    local: PredictionPosition[],
    onChain: OnChainPosition[]
  ): PositionDiscrepancy[] {
    const discrepancies: PositionDiscrepancy[] = [];

    for (const localPos of local) {
      const chainPos = onChain.find(
        c => c.marketId === localPos.marketId && c.outcome === localPos.outcome
      );

      if (!chainPos) {
        // Position exists locally but not on-chain - handled as orphaned
        continue;
      }

      const difference = Math.abs(localPos.shares - chainPos.shares);
      const percentDiff = difference / localPos.shares;

      if (difference > 0.001) {
        discrepancies.push({
          position: localPos,
          actualShares: chainPos.shares,
          expectedShares: localPos.shares,
          difference,
          severity: percentDiff > 0.1 ? 'CRITICAL' : percentDiff > 0.05 ? 'MAJOR' : 'MINOR',
        });
      }
    }

    return discrepancies;
  }

  private findOrphanedPositions(
    local: PredictionPosition[],
    onChain: OnChainPosition[]
  ): PredictionPosition[] {
    return local.filter(
      localPos => !onChain.some(
        chainPos =>
          chainPos.marketId === localPos.marketId && chainPos.outcome === localPos.outcome
      )
    );
  }

  private async findStalePositions(
    positions: PredictionPosition[]
  ): Promise<PredictionPosition[]> {
    const stale: PredictionPosition[] = [];

    for (const position of positions) {
      try {
        // Fetch current market status
        const response = await polymarketGammaClient.get<any>(
          `/markets/${position.marketId}`
        );

        const market = response;
        const status = this.normalizeStatus(market);

        if (status === 'CLOSED' || status === 'RESOLVED') {
          stale.push(position);
        }
      } catch (error) {
        logger.warn(
          `[PositionReconciler] Failed to fetch market status for ${position.marketId}:`,
          error
        );
      }
    }

    return stale;
  }

  private normalizeStatus(raw: any): 'OPEN' | 'CLOSED' | 'RESOLVED' | 'UNKNOWN' {
    if (raw?.closed === true || raw?.archived === true) return 'CLOSED';
    if (raw?.resolved === true) return 'RESOLVED';
    if (raw?.active === true) return 'OPEN';
    return 'UNKNOWN';
  }

  // ========================================================================
  // CLEANUP AND CORRECTION
  // ========================================================================

  private async cleanupOrphanedPositions(positions: PredictionPosition[]): Promise<void> {
    logger.warn(`[PositionReconciler] Cleaning up ${positions.length} orphaned positions`);

    for (const position of positions) {
      logger.info(
        `[PositionReconciler] Removing orphaned position: ${position.marketTitle} ${position.outcome}`
      );
      predictionStore.removePosition(position.marketId, position.outcome);
    }
  }

  private async handleCriticalDiscrepancy(
    discrepancies: PositionDiscrepancy[]
  ): Promise<void> {
    const critical = discrepancies.filter(d => d.severity === 'CRITICAL');

    logger.error(
      `[PositionReconciler] 🚨 CRITICAL DISCREPANCIES FOUND: ${critical.length}\n` +
        critical
          .map(
            d =>
              `  - ${d.position.marketTitle}: expected ${d.expectedShares.toFixed(4)}, ` +
              `actual ${d.actualShares.toFixed(4)}`
          )
          .join('\n')
    );

    // TODO: Trigger alert via alerting service
    // TODO: Consider emergency stop for critical discrepancies
  }

  // ========================================================================
  // LOGGING AND REPORTING
  // ========================================================================

  private logReconciliation(
    result: ReconciliationResult,
    totalLocalPositions: number
  ): void {
    const duration = Date.now() - result.timestamp;

    logger.info(
      `[PositionReconciler] Reconciliation complete in ${duration}ms:\n` +
        `  Local positions: ${totalLocalPositions}\n` +
        `  Discrepancies: ${result.discrepancies.length}\n` +
        `  Orphaned: ${result.orphanedPositions.length}\n` +
        `  Stale: ${result.stalePositions.length}\n` +
        `  Synced: ${result.synced ? '✅' : '❌'}`
    );

    if (result.discrepancies.length > 0) {
      for (const d of result.discrepancies) {
        logger.warn(
          `[PositionReconciler] ${d.severity} discrepancy: ${d.position.marketTitle} ` +
            `diff=${d.difference.toFixed(4)} shares`
        );
      }
    }
  }

  private getLastResult(): ReconciliationResult {
    return {
      timestamp: this.lastReconciliation,
      discrepancies: [],
      orphanedPositions: [],
      stalePositions: [],
      synced: false,
    };
  }

  // ========================================================================
  // SCHEDULING
  // ========================================================================

  /**
   * Start automatic reconciliation loop
   */
  public startAutoReconciliation(): void {
    logger.info(
      `[PositionReconciler] Auto-reconciliation started (interval: ${this.reconciliationInterval}ms)`
    );

    const run = async () => {
      try {
        await this.reconcile();
      } catch (error) {
        logger.error('[PositionReconciler] Auto-reconciliation error:', error);
      }

      setTimeout(run, this.reconciliationInterval);
    };

    run();
  }

  /**
   * Force immediate reconciliation
   */
  public async forceReconcile(): Promise<ReconciliationResult> {
    return this.reconcile();
  }

  // ========================================================================
  // EMERGENCY CLOSE
  // ========================================================================

  /**
   * Emergency close all positions
   * Used when risk limits are hit or system shutdown
   */
  public async emergencyCloseAll(): Promise<{
    closed: number;
    failed: number;
    positions: PredictionPosition[];
  }> {
    logger.error('[PositionReconciler] 🚨 EMERGENCY CLOSE ALL POSITIONS 🚨');

    const positions = predictionStore.getPositions();
    let closed = 0;
    let failed = 0;

    for (const position of positions) {
      try {
        logger.info(
          `[PositionReconciler] Emergency closing: ${position.marketTitle} ${position.outcome}`
        );

        // In real implementation, this would submit market orders
        // For now, just mark as closed in local state
        predictionStore.removePosition(position.marketId, position.outcome);
        closed++;
      } catch (error) {
        logger.error(
          `[PositionReconciler] Failed to close position ${position.marketId}:`,
          error
        );
        failed++;
      }
    }

    logger.info(
      `[PositionReconciler] Emergency close complete: ${closed} closed, ${failed} failed`
    );

    return { closed, failed, positions };
  }

  // ========================================================================
  // HEALTH CHECK
  // ========================================================================

  public getHealth(): {
    healthy: boolean;
    lastReconciliation: number;
    minutesSinceReconciliation: number;
    discrepanciesFound: number;
    autoReconciliationEnabled: boolean;
  } {
    const minutesSince = (Date.now() - this.lastReconciliation) / 60000;

    return {
      healthy: minutesSince < 10 && this.discrepanciesFound === 0,
      lastReconciliation: this.lastReconciliation,
      minutesSinceReconciliation: Math.floor(minutesSince),
      discrepanciesFound: this.discrepanciesFound,
      autoReconciliationEnabled: this.reconciliationInterval > 0,
    };
  }
}

// Singleton instance
const positionReconciler = new PositionReconciler();
export default positionReconciler;
