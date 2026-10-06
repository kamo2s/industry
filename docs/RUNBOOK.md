> Current product authority: [Autonomous Coins](AUTONOMOUS_COINS.md). Creator control and human ordering described in earlier workflows below are retired. Public RPC is observer-only after launch; runtime purchases require the worker credential and a valid lease. Historical financial records and platform recovery remain supported.

# Current staging operator entry point — 2026-10-04

Use [STAGING_STATUS](STAGING_STATUS.md) for current evidence, [DEPLOYMENT](DEPLOYMENT.md) for the protected hosted topology, [BACKUP_RESTORE](BACKUP_RESTORE.md) for retention/restore, and [INCIDENT_RESPONSE](INCIDENT_RESPONSE.md) for immediate switches. The older local/devnet procedures below remain historical context, not permission to launch or fund a mainnet wallet.

`pnpm readiness --strict` is the predeploy configuration gate. Admin health displays live database/web state, worker/scheduler/collector/retention heartbeats, queue/dead letters, invariant errors and provider charged/reserved/daily cap. Configuration READY is not a substitute for live acceptance. A missing database requires an external health probe because its own Admin cannot answer.

The staging cap defaults to $2 per UTC day across workers. Pause providers in Admin or set PROVIDER_EXECUTION_PAUSED=true. Pause agents separately to stop deterministic jobs as well. All Pump broadcasting stays disabled and final financial addresses stay empty. Keep staging intervals at least 15 minutes; bounded acceptance automatically drains and pauses seed businesses.

A failed supplier can be replaced on a parent retry only after its payment is refunded. Delivered/pending work is reused, unresolved latest dependencies block completion, and original receipts/costs remain intact. Never reset attempt counts or delete a dead letter to hide a failure. Inspect its cause, fix configuration/code, then request a new bounded mission if appropriate.

Macro Economy external revenue excludes internal A2A turnover; business-level earnings and Self-Sustaining rules are unchanged. All database timestamps use UTC; the UI may display the reviewer's local time.

---
## Pump operations (current)

Read [PUMP_INTEGRATION.md](PUMP_INTEGRATION.md) and [FEE_ROUTING.md](FEE_ROUTING.md) before configuring Pump. The defaults disable both launch and collection. Use the separate scheduler process in `scripts/start.ts`; production composition must start it as well and keep `/collector` private. Back up and migrate with services stopped when using PGlite. The current migration preserved 2,861 rows across 40 existing tables; backup: `.data/backup-before-pump-20261003-220031/postgres`.

Admin → Pump Fees → Collect Now queues the same bounded collector pipeline. Troubleshoot using routing status, observed pending native amount, last collection, USD credited and pending conversion count. Unfunded gas wallets, unavailable history, missing trusted prices and invalid operator policy configuration remain pending/retry states. Never manually credit a receipt to resolve a timeout. Restore archival RPC / historical Pyth access, then let the collector replay.

For launch recovery, use the saved operation in Review & Launch. Resume keeps the same mint after expiry. Cancellation requires expiry and no finalized mint; existing mints require recovery. Read the integration guide for the 24-hour ephemeral signer window, lookup-table setup plan, exact configuration variables and controlled-chain acceptance steps. SOL receipts become USD accounting credits only; physical SOL stays pooled. No automatic swap is implemented.

# Operations runbook

## Start and inspect

Local: `pnpm dev` or `pnpm build` then `pnpm start`. The supervisor starts database → worker → web at localhost:3000. Refresh the browser after a production rebuild. Do not start another supervisor on the same ports/database. `GET /api/health` reports database and recent worker heartbeat; `/debug` shows permitted job state, and `/admin` requires an allowed signed wallet.

## Job not progressing

Inspect phase, attempts, last error, trace/run IDs, owner pause/termination, global switches, model/search configuration, compute balance and hourly/daily caps. A worker needs a recent heartbeat. Lost leases recover after ninety seconds. Retry exhaustion is dead-lettered; fix the cause before creating a new manual run. Never delete ledger/history to force a retry or re-use a completed lease.

## Stop spending or launches

An authenticated administrator can pause all agents, payments or launches. Environment `AGENTS_ENABLED=false`, `AUTONOMOUS_PAYMENTS_ENABLED=false`, `TOKEN_LAUNCH_ENABLED=false` and `EMERGENCY_PAUSE=true` take precedence. Owners can pause or set an agent kill switch. Transactions already submitted to chain cannot be revoked; let settlement reconciliation finish. Termination is permanent for that identity and disables its services.

## Funding

Devnet token preparation returns a generated payer address. Fund it only with devnet SOL and retry the same launch key. The mint key is persisted before submission. Normal internal purchases use Operating Balance. In demo mode, use Fund Business to choose Operating Balance or Compute Credits. Do not fund legacy agent wallets for internal hiring. External x402 experiments use separately labelled devnet custody. Live internal credit issuance requires operator reconciliation; INTERNAL_LEDGER_ENABLED remains false by default. The existing authenticated compute-allocation control posts a balanced journal entry. No production balance or valuation is inferred from devnet tokens.

## Payment pending / failed seller

Repeat the original body, idempotency key and signed payment. Do not produce a second transaction while the first is indeterminate. The worker reconciles signed/verifying/settling attempts every thirty seconds using exact message identity; inspect `/admin` for unresolved attempts. A settled payment followed by failed seller work is `refund_required`, not refunded. Use the authenticated admin refund control. Fund the seller treasury with devnet SOL for fees if requested; recipient/asset/amount are fixed to the original payment. The service persists the signed transaction before broadcast and marks refunded only after chain confirmation. Recovery resends identical bytes. After finalized failure/expiry, review the error and authorize a fresh attempt; prior receipts remain stored. Do not edit SQL to pretend a refund happened.

## Provider outage

Model/search/browser/RPC/facilitator requests are bounded and return sanitized errors. Usage estimates recorded before calls survive worker crashes. Direct OpenAI retries 429/5xx at most once inside a call with backoff; other recoverable outcomes go through the durable worker retry policy. Schema-invalid output is a permanent contract failure and retains any reported usage cost. Ambiguous transport/5xx costs retain conservative reserves for reconciliation. Live OpenAI never silently switches to mock AI. See [OpenAI integration](OPENAI_INTEGRATION.md) for pricing, provenance, configuration and bounded acceptance. Devnet public RPC/faucets can throttle; configure a dedicated RPC or supply test funding rather than bypassing provider restrictions.

## Backups and secrets

Back up managed Postgres and storage; separately escrow the wallet encryption key and application secrets. Stop the local database service before filesystem-copying PGlite. Restore into an isolated environment first and verify migrations, key decryption, ownership and ledger totals. Never print keys or commit `.env`, `.data`, sessions or private acceptance state. `qa/devnet` contains public evidence only.

## Acceptance

`pnpm check`, `pnpm test:e2e`, `pnpm security:scan`, `pnpm audit --prod`. `pnpm devnet:preflight` checks real public providers. `pnpm test:devnet -- --prepare` creates durable acceptance preparations; full `pnpm test:devnet` refuses to claim success without real mints, live sourced research, interval work, devnet x402 settlement and buyer/seller ledger entries. Read `qa/devnet/acceptance.json` and IMPLEMENTATION_STATUS for actual outcomes.

## Fee policy and routing

`POST /api/admin/fee-policy` remains the authenticated, audited configuration interface. It accepts exactly BOOTSTRAP, GROWTH and ESTABLISHED with `threshold` (lower bound in USD), `compute_share`, `operating_share`, `platform_share`. Thresholds increase from zero in exact micro-dollar units; shares support up to 12 decimal places and must sum to one exactly. Without an override, `packages/core/fee-policy.ts` supplies the approved V1 defaults. Admin, Launch, Financials, Economy and Docs show this same resolved policy. Existing overrides are labelled and retained. See [FEE_ROUTING.md](FEE_ROUTING.md) for rates, splitting and audit rules.

`POST /api/admin/fee-receipt` remains demo-only. It exercises the same splitter against an isolated development-receipt cumulative total, never the Pump total. New receipts snapshot their resolved policy and exact segment allocations; existing allocated records and postings are never recalculated. Rounding dust goes to Operating (or Compute if Operating has a zero share), never a zero-share account. Low compute does not change percentages; existing debt and insufficient-compute gates still apply. No rescue policy is enabled.

`POST /api/tokens/routing` reads the configured devnet mint and reports capability-specific failures. Owner `POST /api/agents/:id/routing-check` persists evidence for an existing token business. The current metadata-only token adapter cannot enforce creator trading fees, so activation fails closed with FEE ROUTING VERIFICATION FAILED. A configured treasury address does not overcome that limitation. The separate Pump adapter now implements independently verified locked routing and receipt ingestion; see the current Pump section above. Mainnet acceptance and autonomous pooled-treasury withdrawals remain unperformed.

## Migration evidence

On 2026-10-03 the local supervisor was stopped and `.data/postgres` copied to `.data/backup-before-business-model-20261003-200009/postgres`. Migration 007 preserved 1,403 rows across 32 pre-existing tables, comparing every original field. See `qa/business-model/migration.json`. Never rerun an offline database script alongside the running service.

