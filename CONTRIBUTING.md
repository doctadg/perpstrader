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

- **TypeScript strict mode** is enabled — no `any`, explicit types everywhere.
- Follow existing patterns in the codebase. If a module uses a factory pattern or dependency injection, do the same.
- Use named exports; avoid default exports.
- Keep functions small and focused. Each module should have a single responsibility.
- Format with the project's Prettier config (run `npx prettier --write .` before committing).
- Prefer `const` over `let`, never use `var`.

## Project Structure

```
src/
  agents/         # LangGraph agents (news, prediction, strategy, etc.)
  engine/         # Execution engine — order placement and management
  risk/           # Risk manager — position sizing, drawdown limits
  strategy/       # Strategy engine — signal generation and evaluation
  evolution/      # Evolution engine — strategy adaptation and optimization
  research/       # Research engine — backtesting and analysis
  pumpfun/        # PumpFun agent — meme token detection and trading
  safekeeping/    # Safekeeping fund — treasury management
  api/            # REST API for external agent control
  db/             # Database layer (SQLite, Redis, ChromaDB)
  shared/         # Shared types, utils, constants
config/           # Configuration files
tests/            # Test files
docs/             # Documentation
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
