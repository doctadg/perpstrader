/**
 * Main Orchestrator — ties together narrative-scanner, coin-generator, position-manager, and printterminal API.
 * Runs on a configurable interval, each cycle: scan narratives → pick best → generate coin → launch → monitor.
 */

import pino from 'pino';
import { v4 as uuid } from 'uuid';
import { LaunchClient } from './launch-client';
import { OrchestratorConfig, DEFAULT_ORCHESTRATOR_CONFIG } from './config';
import { LaunchRecord, OrchestratorState, CycleResult, LaunchStatus } from './orch-types';
import { NarrativeScanner } from '../narrative-scanner/narrative-scanner';
import { CoinGenerator } from '../coin-generator/coin-generator';
import { PositionManager } from '../position-manager/position-manager';
import type { ScoredNarrative } from '../narrative-scanner/types';
import type { CoinConcept } from '../coin-generator/types';
import type { Plan } from '../../../shared/launcher-plan-types';

const logger = pino({ name: 'orchestrator' });

export class Orchestrator {
  private config: OrchestratorConfig;
  private client: LaunchClient;
  private scanner: NarrativeScanner;
  private generator: CoinGenerator;
  private positionMgr: PositionManager;

  private state: OrchestratorState;
  private history: LaunchRecord[] = [];
  private timer?: ReturnType<typeof setInterval>;
  private running = false;

  constructor(opts?: Partial<OrchestratorConfig>) {
    this.config = { ...DEFAULT_ORCHESTRATOR_CONFIG, ...opts };
    this.client = new LaunchClient(this.config.printterminalUrl);
    this.scanner = new NarrativeScanner();
    this.generator = new CoinGenerator();
    this.positionMgr = new PositionManager();
    this.state = {
      status: 'idle',
      totalLaunched: 0,
      totalSuccess: 0,
      totalFailed: 0,
      solSpentToday: 0,
      lastCycleAt: 0,
    };
    this.loadHistory();
  }

  /** Start the orchestrator loop */
  async start(): Promise<void> {
    if (this.running) return;
    this.running = true;
    this.state.status = 'running';
    logger.info({ intervalMs: this.config.launchIntervalMs }, 'Orchestrator started');

    // Run first cycle immediately
    await this.cycle();

    // Schedule subsequent cycles
    this.timer = setInterval(() => this.cycle(), this.config.launchIntervalMs);
  }

  /** Stop the orchestrator loop */
  async stop(): Promise<void> {
    this.running = false;
    this.state.status = 'stopped';
    if (this.timer) {
      clearInterval(this.timer);
      this.timer = undefined;
    }
    await this.positionMgr.stop();
    logger.info('Orchestrator stopped');
  }

  /** Main cycle: scan → pick → generate → launch → monitor */
  private async cycle(): Promise<void> {
    const cycleId = uuid();
    const startTime = Date.now();

    logger.info({ cycleId }, '--- Cycle started ---');

    try {
      // 0) Check daily budget
      if (this.state.solSpentToday >= this.config.dailyBudgetSol) {
        logger.warn({ spent: this.state.solSpentToday, budget: this.config.dailyBudgetSol }, 'Daily budget exhausted');
        this.recordResult({ cycleId, status: 'skipped', reason: 'daily_budget', durationMs: Date.now() - startTime });
        return;
      }

      // Reset daily counter if new day
      this.maybeResetDailyBudget();

      // 1) Scan narratives
      const narratives = await this.scanner.scan();
      if (!narratives.length) {
        logger.info('No narratives found');
        this.recordResult({ cycleId, status: 'skipped', reason: 'no_narratives', durationMs: Date.now() - startTime });
        return;
      }

      // 2) Pick best narrative (highest score, no duplicate in cooldown window)
      const best = this.pickBestNarrative(narratives);
      if (!best) {
        logger.info('No suitable narrative (all duplicates or below threshold)');
        this.recordResult({ cycleId, status: 'skipped', reason: 'no_unique_narrative', durationMs: Date.now() - startTime });
        return;
      }

      logger.info({ narrative: best.text.slice(0, 80), score: best.score }, 'Selected narrative');

      // 3) Generate coin concept
      const concept: CoinConcept = await this.generator.generate(best);
      logger.info({ name: concept.name, symbol: concept.symbol }, 'Generated coin concept');

      // 4) Build launch plan
      const plan = this.buildPlan(concept);
      logger.info({ runId: plan.runId }, 'Built launch plan');

      // 5) Execute launch via printterminal API
      const launchResult = await this.client.spamLaunch(plan, 0);

      // 6) Register with position manager for monitoring
      if (launchResult.mintPublicKey) {
        this.positionMgr.track({
          mint: launchResult.mintPublicKey,
          symbol: concept.symbol,
          buyMcap: 0,
          targetMcap: this.config.targetMcapUsd,
          walletAddresses: [], // populated from plan wallet IDs
        });
      }

      // 7) Record
      const solSpent = this.calculateSolSpent(plan);
      this.state.solSpentToday += solSpent;
      this.state.totalLaunched++;

      const record: LaunchRecord = {
        id: uuid(),
        cycleId,
        timestamp: Date.now(),
        narrative: best.text.slice(0, 200),
        narrativeScore: best.score,
        coinName: concept.name,
        coinSymbol: concept.symbol,
        metadataUri: concept.metadata?.image || '',
        planRunId: plan.runId,
        mintAddress: launchResult.mintPublicKey || '',
        status: launchResult.status === 'launched' ? 'success' : 'failed',
        solSpent,
        printterminalRunId: launchResult.runId,
      };

      if (record.status === 'success') this.state.totalSuccess++;
      else this.state.totalFailed++;

      this.history.push(record);
      this.persistHistory();

      this.recordResult({ cycleId, status: 'launched', record, durationMs: Date.now() - startTime });
      logger.info({ mint: record.mintAddress, solSpent }, 'Cycle complete — token launched');

    } catch (err: any) {
      logger.error({ err: err.message, cycleId }, 'Cycle failed');
      this.state.totalFailed++;
      this.recordResult({ cycleId, status: 'error', error: err.message, durationMs: Date.now() - startTime });
    }

    this.state.lastCycleAt = Date.now();
  }

  /** Pick the best narrative that hasn't been used recently */
  private pickBestNarrative(narratives: ScoredNarrative[]): ScoredNarrative | null {
    const cooldownMs = this.config.narrativeCooldownMs;
    const now = Date.now();
    const recentNarratives = new Set(
      this.history
        .filter(r => now - r.timestamp < cooldownMs)
        .map(r => r.narrative.toLowerCase().slice(0, 50))
    );

    for (const n of narratives) {
      const key = n.text.toLowerCase().slice(0, 50);
      if (!recentNarratives.has(key)) {
        return n;
      }
    }
    return null;
  }

  /** Build a Plan object matching printterminal's PlanSchema */
  private buildPlan(concept: CoinConcept): Plan {
    const runId = `spam-${Date.now()}-${uuid().slice(0, 8)}`;
    const walletIds = Array.from(
      { length: this.config.numBuyerWallets },
      (_, i) => `buyer-${i + 1}`
    );

    return {
      runId,
      route: 'burst',
      timingBase: 'now',
      fees: {
        mode: 'auto',
        jitoTipSol: this.config.jitoTipSol,
      },
      policyId: 'default',
      creatorWalletId: 'creator-1',
      steps: [
        {
          name: 'create-token',
          type: 'pumpfun.create',
          at: { mode: 'time', ms: 0 },
          metadata: {
            name: concept.name,
            symbol: concept.symbol,
            uri: concept.metadata?.image || 'https://arweave.net/placeholder',
          },
          devBuyAmount: 0,
        },
        {
          name: 'buy-token',
          type: 'pumpfun.buy',
          walletIds,
          amountSolEach: this.config.buyAmountSolPerWallet,
          useJitoBundle: true,
          at: { mode: 'time', ms: 100 },
        },
      ],
    };
  }

  /** Calculate total SOL spent in a plan */
  private calculateSolSpent(plan: Plan): number {
    let total = 0;
    for (const step of plan.steps) {
      if (step.type === 'pumpfun.buy') {
        const count = step.walletIds?.length || 0;
        total += count * (step.amountSolEach || 0);
      }
      if (step.type === 'pumpfun.create') {
        total += step.devBuyAmount || 0;
      }
    }
    total += plan.fees.jitoTipSol || 0.001;
    return total;
  }

  /** Reset daily budget at midnight UTC */
  private maybeResetDailyBudget(): void {
    const now = new Date();
    if (now.getUTCHours() === 0 && now.getUTCMinutes() < 30 && this.state.solSpentToday > 0) {
      logger.info({ previous: this.state.solSpentToday }, 'Resetting daily budget');
      this.state.solSpentToday = 0;
    }
  }

  private recordResult(result: CycleResult): void {
    logger.info({ result }, 'Cycle result');
  }

  private loadHistory(): void {
    try {
      const fs = require('fs');
      const path = `${this.config.dataDir}/launch-history.json`;
      if (fs.existsSync(path)) {
        this.history = JSON.parse(fs.readFileSync(path, 'utf-8'));
        // Recalculate state from history
        const today = new Date().toISOString().slice(0, 10);
        const todayRecords = this.history.filter(r => new Date(r.timestamp).toISOString().slice(0, 10) === today);
        this.state.solSpentToday = todayRecords.reduce((s, r) => s + r.solSpent, 0);
        this.state.totalLaunched = this.history.length;
        this.state.totalSuccess = this.history.filter(r => r.status === 'success').length;
        this.state.totalFailed = this.history.filter(r => r.status === 'failed').length;
      }
    } catch {
      logger.warn('Could not load history, starting fresh');
    }
  }

  private persistHistory(): void {
    try {
      const fs = require('fs');
      const path = `${this.config.dataDir}/launch-history.json`;
      fs.mkdirSync(this.config.dataDir, { recursive: true });
      fs.writeFileSync(path, JSON.stringify(this.history, null, 2));
    } catch (err: any) {
      logger.error({ err: err.message }, 'Failed to persist history');
    }
  }

  getState(): OrchestratorState {
    return { ...this.state };
  }

  getHistory(): LaunchRecord[] {
    return [...this.history];
  }
}
