/**
 * Strategy Activation Pipeline
 *
 * Bridges the gap between generated strategies and active trading strategies.
 *
 * What this does:
 * 1. Evaluates all strategies in the `strategies` table using performance metrics
 * 2. Deactivates all strategies (sets isActive=0)
 * 3. Activates the top N strategies (sets isActive=1) based on composite scoring
 * 4. Promotes top strategies from `strategy_performance` (research engine pipeline)
 * 5. Reports strategy diversity and health metrics
 *
 * Usage:
 *   npx ts-node src/scripts/strategy-activator.ts [--top N] [--min-trades N] [--dry-run]
 */
export {};
//# sourceMappingURL=strategy-activator.d.ts.map