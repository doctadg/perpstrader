# Contributing to PerpsTrader

Thanks for your interest in contributing! This guide will get you up and running.

## Prerequisites

- **Node.js** 18+ (LTS recommended)
- **npm** 9+
- **SQLite3** (system package, e.g. `apt install sqlite3` or `brew install sqlite3`)
- A **Solana/RPC endpoint** and API keys for the services you want to use (news, etc.)
- **Git**

## Setup

```bash
# Fork the repo on GitHub, then clone your fork
git clone https://github.com/YOUR_USERNAME/PerpsTrader.git
cd PerpsTrader

# Install dependencies
npm install

# Copy the environment template and fill in your keys
cp .env.example .env
# Edit .env with your API keys and RPC endpoints

# Build the project
npm run build
```

## Development Workflow

```bash
# Run in development mode (watch + auto-reload)
npm run dev

# Run tests
npm test

# Lint
npm run lint

# Type-check only
npx tsc --noEmit
```

Before submitting a PR, make sure `npm run build` and `npm test` pass cleanly.

## Code Style

- **TypeScript with gradual typing** — the codebase uses `strict: false` to allow incremental typing. Add explicit types where practical and avoid unnecessary `any`, but don't block progress on perfect type coverage.
- Follow existing patterns in the codebase. If a module uses a factory pattern or dependency injection, do the same.
- Use named exports; avoid default exports.
- Keep functions small and focused. Each module should have a single responsibility.
- Format with the project's Prettier config (run `npx prettier --write .` before committing).
- Prefer `const` over `let`, never use `var`.

## Project Structure

```
src/
  execution-engine/    # Execution engine — order placement and management
  risk-manager/        # Risk manager — position sizing, drawdown limits, circuit breakers
  news-agent/          # News agent — LangGraph pipeline for news ingestion and analysis
  prediction-agent/    # Prediction agent — Polymarket integration
  strategy-engine/     # Strategy engine — signal generation and evaluation
  evolution-engine/    # Evolution engine — strategy adaptation and optimization
  research-engine/     # Research engine — continuous market research and backtest jobs
  pumpfun-agent/       # PumpFun agent — Solana meme token detection and trading
  safekeeping-fund/    # Safekeeping fund — multi-chain treasury management
  backtester/          # Backtester — historical backtesting engine
  dashboard/           # Dashboard — Express server, API routes, web UI
  shared/              # Shared types, utilities, constants
config/                # Configuration files
tests/                 # Test files
docs/                  # Documentation
```

## Pull Request Process

1. **Branch off `main`** — create a descriptive branch name (`feat/add-trailing-stop`, `fix/race-condition-orders`).
2. **Make atomic commits** — one logical change per commit.
3. **Write tests** for new functionality. Bug fixes should include a test that reproduces the issue.
4. **Update docs** if you change behavior or add new modules.
5. **Open a PR** against `main` with a clear description of what changed and why.
6. **Address review feedback** — keep PRs small to make review easier.
7. Squash-merge is preferred for clean history.

## Questions?

Open a GitHub Discussion or reach out on the project's communication channel. Happy building!
