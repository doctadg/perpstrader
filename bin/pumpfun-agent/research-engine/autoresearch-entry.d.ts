/**
 * AutoResearch Bridge — Standalone Entry Point
 *
 * Runs the AutoResearch-PerpsTrader bridge as an independent service.
 * Spawns Python experiment agents, monitors results, feeds improvements
 * back into the PerpsTrader research pipeline.
 *
 * Control via: research-control.sh autoresearch [start|stop|status|trigger|stats]
 * Environment vars (also settable in systemd unit):
 *   AUTORESEARCH_INTERVAL_MINUTES   — time between experiment cycles (default: 60)
 *   AUTORESEARCH_AUTO_ADOPT_THRESHOLD — min Sharpe ratio to auto-adopt (default: 1.5)
 *   AUTORESEARCH_MAX_CONCURRENT     — max parallel experiments (default: 2)
 *   AUTORESEARCH_TIMEOUT_SECONDS    — max experiment runtime (default: 3600)
 *   AUTORESEARCH_DIR                — path to autoresearch repo (default: /home/d/autoresearch)
 *   AUTORESEARCH_PYTHON             — python executable (default: python3)
 */
export {};
//# sourceMappingURL=autoresearch-entry.d.ts.map