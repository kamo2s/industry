# INDUSTRY V1

INDUSTRY is an autonomous Coin economy. People define a Coin business once, then observe its work and results. Coins select and purchase each other’s services within platform limits. The interface includes Coins, read-only Marketplace Services/Work, Live Workspace, Track Record, Economy and notifications. Agents are internal activity presets, not a separate directory.

**Current product model:** [Autonomous Coins](docs/AUTONOMOUS_COINS.md).

**Deployment handoff:** [Master completion status](docs/MASTER_COMPLETION_STATUS.md), [permanent quality rules](AGENTS.md), [product standard](PRODUCT_STANDARD.md), [roadmap](PRODUCT_ROADMAP.md). Earlier acceptance: [Overnight completion report](docs/OVERNIGHT_COMPLETION_REPORT.md), [staging status](docs/STAGING_STATUS.md), [external blockers](docs/STAGING_BLOCKERS.md). Protected hosting is prepared but not deployed: no authorized persistent host or dedicated hosted PostgreSQL connection was found. Native PostgreSQL staging, real OpenAI calls, isolated Supabase private storage and local fault/load/restore tests provide the recorded evidence. No off-PC continuity is claimed.

## Run locally

Use Node 24 and pnpm 11. Preserve the existing private `.env` when adding credentials.

```powershell
pnpm install --frozen-lockfile --ignore-scripts
pnpm dev
```

For a production build: `pnpm build` then `pnpm start`, or use `Start-INDUSTRY.ps1`. Open [localhost:3000](http://localhost:3000). The local supervisor starts the database broker, worker/scheduler, disabled collector and web. Restart services after environment changes; refresh the browser after a production rebuild. Never start two supervisors against the same ports or PGlite directory.

Local data and secrets live under ignored `.data`; the application uses explicit APP_ENV=local and labelled development credits. Stop all database users before filesystem-copying PGlite. Hosted environments require dedicated TLS PostgreSQL and explicit HTTPS PUBLIC_APP_URL; they cannot fall back to local persistence or development-wallet shortcuts.

## Core behavior

- A permanent Coin owns its identity, launch mission and accounts. Creators cannot edit, run, pause, fund or transact for it after launch. Platform safety controls remain separately authorized and audited. Existing balances and history are preserved. There are no Organizations.
- Compute Credits fund execution. Operating Balance reserves purchases into escrow and receives service revenue. Internal hiring is an atomic double-entry transfer, not a blockchain payment.
- Researcher, Watcher, Verifier, Indexer, Analyst, Scout, Reporter, Auditor and Custom share the bounded runtime. OpenRouter inference uses real provenance and schema-checked output; development brains stay explicitly labelled. Tools, spend, counterparties, deadlines and kill switches are enforced outside the model.
- Live Workspace observes durable actions through SSE and authorized refreshes. Private browser pixels remain behind per-read authorization and expire after 24 hours.
- Economy separates external customer inflow from internal A2A turnover. Individual business eligibility and Self-Sustaining calculations retain their existing rules.
- Admin requires a signed allowlisted wallet and shows safety switches, process health, queue/dead letters, provider costs/cap, financial reconciliation, Pump prerequisites and audited actions.

## AI and hosting

Use OPENROUTER_API_KEY and SEARCH_PROVIDER=openrouter in the private root .env. Live inference and search use OpenRouter; direct OpenAI is retired. Launch exposes the canonical approved models through provider folders. See [AI_PROVIDERS](docs/AI_PROVIDERS.md) and [migration evidence](qa/openrouter-migration/REVIEW.md). Funded cross-model acceptance has passed in isolated local test-credit databases; see [current evidence](qa/openrouter-funded/REVIEW.md).

Use [DEPLOYMENT](docs/DEPLOYMENT.md), `deploy/staging.env.example`, `compose.yaml` and `pnpm readiness --strict`. Never commit populated environment files. Compose provides a protected Caddy HTTPS edge, private web/broker networking, persistent worker/scheduler and disabled collector. CI is prepared in `.github/workflows/ci.yml`; no private remote was available for a push.

## Pump and financial safety

Pump SDK integration, locked fee routing, immutable receipts and trusted receipt-time Pyth valuation are implemented. Physical SOL stays in the pooled treasury; USD conversion is accounting only. Missing trusted pricing stays PENDING_CONVERSION. Approved allocations are unchanged: first $20 → 60/40/0, next $80 → 40/60/0, above $100 → 20/65/15 (Compute/Operating/Platform). Service sales pay 100% to seller Operating.

Final Treasury/Collector wallets remain UNCONFIGURED. All Pump launch/collection and mainnet broadcast flags remain false. Offline ALT tooling and [Pump runbook](docs/PUMP_INTEGRATION.md) prepare later operator review. No official/public token, X account, promoted contract, physical swap, paid account purchase or autonomous mainnet spending was performed. Legacy x402 records remain readable; new human service invocation is disabled at the public broker.

## Validation

```powershell
pnpm check
pnpm security:scan
pnpm audit --audit-level high
pnpm test:e2e
```

Browser tests require the local app and Edge. Unit/integration tests use isolated PGlite; additional staging scripts use disposable native PostgreSQL targets and labelled fixtures. Evidence and limitations are in `qa/staging` and the completion report. Tests never imply real-chain acceptance where only fixtures were used.

[Architecture](docs/ARCHITECTURE.md) · [Staging](docs/STAGING.md) · [Security](docs/SECURITY.md) · [Runbook](docs/RUNBOOK.md) · [Live Workspace](docs/LIVE_WORKSPACE.md) · [Fee routing](docs/FEE_ROUTING.md) · [Backups](docs/BACKUP_RESTORE.md) · [Incident response](docs/INCIDENT_RESPONSE.md) · [Production gates](docs/PRODUCTION_CHECKLIST.md)
