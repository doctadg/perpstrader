// Security Node - Enhanced contract security analysis for tokens
// Now integrates RugCheck.xyz + DexScreener for comprehensive rug detection
// Checks: mint/freeze authority, RugCheck score, top holders, LP lock, insider networks,
// sell pressure, liquidity, honeypot detection, transfer fees

import logger from '../../shared/logger';
import { PumpFunAgentState, ContractSecurity } from '../../shared/types';
import { addThought, updateStep } from '../state';
import { rugCheckGate, getFullReport as getRugCheckReport, extractRugCheckRedFlags, rugCheckToScoreFactor } from '../services/rugcheck-service';
import { dexScreenerGate } from '../services/dexscreener-service';
import type { RugCheckReport } from '../services/rugcheck-service';

export async function securityNode(state: PumpFunAgentState): Promise<Partial<PumpFunAgentState>> {
  if (state.queuedTokens.length === 0) {
    logger.warn('[SecurityNode] No tokens to analyze');
    return {
      ...addThought(state, 'No tokens to analyze'),
      ...updateStep(state, 'NO_TOKENS'),
    };
  }

  logger.info(`[SecurityNode] Analyzing security for ${state.queuedTokens.length} tokens`);

  // Import Solana RPC service
  let solanaRPC: any;
  try {
    solanaRPC = (await import('../services/solana-rpc')).default;
  } catch (error) {
    logger.error('[SecurityNode] Failed to import Solana RPC service');
    return {
      ...addThought(state, 'Failed to import Solana RPC service'),
      ...updateStep(state, 'ERROR'),
    };
  }

  const securityAnalyses = new Map<string, ContractSecurity>();
  const rugCheckReports = new Map<string, RugCheckReport>();
  const rugCheckFlags = new Map<string, string[]>();
  const rugCheckScores = new Map<string, number>();
  let filteredByRugCheck = 0;
  let filteredByDexScreener = 0;

  // Analyze security with concurrency limit
  const concurrency = 5; // Reduced from 10 to respect RugCheck rate limits
  for (let i = 0; i < state.queuedTokens.length; i += concurrency) {
    const batch = state.queuedTokens.slice(i, i + concurrency);

    await Promise.allSettled(
      batch.map(async (item: any) => {
        const token = item.token || item;
        const mint = token.mintAddress;

        try {
          // ── Step 1: On-chain mint info (fast, RPC) ──────────────────
          const security = await solanaRPC.getMintInfo(mint);
          securityAnalyses.set(mint, security);

          // ── Step 2: RugCheck gate (external API, rate-limited) ───────
          const rcGate = await rugCheckGate(mint, token.symbol || 'UNKNOWN');

          if (!rcGate.pass) {
            filteredByRugCheck++;
            logger.warn(
              `[SecurityNode] RUGCHECK BLOCKED ${token.symbol || mint.slice(0, 8)}: ${rcGate.reason}`
            );
            // Escalate risk level
            securityAnalyses.set(mint, {
              ...security,
              riskLevel: 'HIGH',
            });
            if (rcGate.report) {
              rugCheckReports.set(mint, rcGate.report);
            }
            return;
          }

          // ── Step 3: DexScreener gate (market data) ──────────────────
          const dsGate = await dexScreenerGate(mint, token.symbol || 'UNKNOWN');

          if (!dsGate.pass) {
            filteredByDexScreener++;
            logger.warn(
              `[SecurityNode] DEXSCREENER BLOCKED ${token.symbol || mint.slice(0, 8)}: ${dsGate.reason}`
            );
            securityAnalyses.set(mint, {
              ...security,
              riskLevel: 'HIGH',
            });
            return;
          }

          // ── Step 4: If RugCheck had data, store it for scoring ──────
          if (rcGate.report) {
            rugCheckReports.set(mint, rcGate.report);
            rugCheckScores.set(mint, rugCheckToScoreFactor(rcGate.report));
            rugCheckFlags.set(mint, extractRugCheckRedFlags(rcGate.report));
          }

        } catch (error) {
          logger.debug(`[SecurityNode] Failed to analyze ${token.symbol}: ${error}`);
          securityAnalyses.set(mint, {
            mintAuthority: null,
            freezeAuthority: null,
            decimals: 0,
            supply: 0n,
            isMintable: false,
            isFreezable: false,
            metadataHash: '',
            riskLevel: 'HIGH',
          });
        }
      })
    );
  }

  // Calculate security statistics
  let highRisk = 0;
  let mediumRisk = 0;
  let lowRisk = 0;

  for (const security of securityAnalyses.values()) {
    if (security.riskLevel === 'HIGH') highRisk++;
    else if (security.riskLevel === 'MEDIUM') mediumRisk++;
    else lowRisk++;
  }

  logger.info(
    `[SecurityNode] Analyzed ${securityAnalyses.size} tokens ` +
    `(H:${highRisk} M:${mediumRisk} L:${lowRisk}) | ` +
    `RugCheck blocked: ${filteredByRugCheck} | ` +
    `DexScreener blocked: ${filteredByDexScreener} | ` +
    `RugCheck enriched: ${rugCheckReports.size}`
  );

  return {
    ...addThought(state,
      `Security: ${lowRisk} low, ${mediumRisk} medium, ${highRisk} high risk | ` +
      `RugCheck blocked ${filteredByRugCheck}, DexScreener blocked ${filteredByDexScreener}`
    ),
    ...updateStep(state, 'SECURITY_ANALYZED'),
    thoughts: [
      ...state.thoughts,
      `Security: ${lowRisk} low risk, ${mediumRisk} medium, ${highRisk} high risk`,
      `RugCheck filtered: ${filteredByRugCheck} tokens | DexScreener filtered: ${filteredByDexScreener} tokens`,
    ],
  };
}

export { addThought, updateStep } from '../state';
