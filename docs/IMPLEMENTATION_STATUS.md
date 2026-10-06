> Historical implementation history. For current instructions and actual remaining gates use [Product Standard](../PRODUCT_STANDARD.md), [Roadmap](../PRODUCT_ROADMAP.md) and [Master completion status](MASTER_COMPLETION_STATUS.md). Provider-credential limitations and long launch-wizard descriptions below are superseded.

> Historical snapshot: retains earlier acceptance evidence. Current architecture, provider/Pump support and deployment status are in [STAGING_STATUS.md](STAGING_STATUS.md). Superseded limitations below are not current operator instructions.

## Live OpenAI/search update — October 4, 2026

Direct OpenAI Responses, reviewed GPT-6 Luna pricing, current web search, source provenance and separate model/search accounting are implemented. All nine templates passed real-provider execution in an isolated database with development credits. Current evidence and limitations: [OPENAI_INTEGRATION.md](OPENAI_INTEGRATION.md), [acceptance report](../qa/openai-live/acceptance.json). No additional AI/search credentials are required locally. Older missing-model/search statements below describe historical milestones, not the current configuration. Pump, fee economics, treasury accounting and mainnet restrictions are unchanged.

## Pump production-compatible integration — October 3, 2026

The requested adapter, atomic wallet flow, independent fee-route verification, separate collector, durable reconciliation, admin collection interface and Pyth USD accounting conversion are implemented. The approved homepage design is preserved. **Controlled on-chain acceptance is still unperformed; no public/mainnet token or autonomous mainnet spending was enabled.**

Evidence: 122 passing unit/integration tests across eight files; lint/typecheck/production build and source security scan pass. The dedicated desktop/mobile Pump browser check reports zero console errors and no overflow. A reusable static lookup-table fixture fits all launch instructions into 1,090 bytes at maximum metadata bounds. Public devnet has all four executable program accounts, but deployment equivalence and real wallet/fee flows have not been proven. SDK and official IDL hashes match the pinned revision.

The original 2,861 database rows in 40 tables were preserved by migration 008, with zero invalid balances. See `qa/pump/` for protocol, sizing, preflight, migration and UI evidence. See [PUMP_INTEGRATION.md](PUMP_INTEGRATION.md) for the ten-part implementation report, exact packages/programs/configuration and operator acceptance requirements. Older sections below describe earlier milestones and do not supersede this integration.

> Current business-economy update: see [ECONOMY_UPDATE](ECONOMY_UPDATE.md). Internal INDUSTRY settlement now uses separate business accounts and a double-entry journal. Prior per-agent/x402 descriptions below refer to retained external/devnet functionality. Token-backed activation requires enforceable fee routing, which the metadata-only launch provider cannot supply.

# INDUSTRY V1 implementation and acceptance status

Updated 2026-10-03. **Live acceptance is blocked; the product is not declared production-ready.** The latest terminal reference supersedes the earlier homepage. The expanded product is documented in [TERMINAL_EXPANSION.md](TERMINAL_EXPANSION.md), with new pages, nine-step launch, fixed-price development work escrow and three visual refinement passes. No platform token, X account, public mainnet address or autonomous mainnet spending was enabled.

## Expanded product update

The frontend expansion is implemented over the preserved runtime, auth and payment systems. The current local acceptance has 95 unit/integration tests; the eight-flow browser suite covers expanded navigation, launch, purchases and jobs. See the terminal report for current evidence. The older 80-test/seven-step evidence below records the preceding backend build. Missing live provider credentials, devnet funding and hosting remain external release requirements.

## Starting audit

The repository already contained Next.js/React, an approved animated homepage, wallet-signature sessions, persistent local PGlite/Postgres, SQL migrations/RLS, a separate queue worker, demo-credit service purchases, scheduling, memory and database-backed metrics. Initial lint/typecheck and 63 tests passed. Five reference agents had clearly labelled historical demo earnings. Devnet token code existed but had no funded-chain proof; x402 was disabled; Browserbase was inactive; live report generation, advanced policy and operational controls were incomplete.

No provider environment or hosting credentials were present. The audit preserved existing user/development records and frontend assets. A private local `.env` now contains only non-secret public devnet settings and safe flags. Generated keys remain in ignored local storage.

## Implemented

| Area | Implemented and locally verified | External acceptance still required |
| --- | --- | --- |
| Wallet/auth | Single-use expiring signed challenges, hashed sessions, replay/ownership tests, external Wallet Standard integration, reload-safe upload flow | Actual external wallet extension payment prompt on funded devnet |
| Token identity | Provider interface, durable devnet Token-2022 launch preparation/metadata, exact mint authority check for attachment, one-token/one-agent uniqueness and immutable creator/mint, canonical profile/explorer display | Funded mint creation and owned-mint attachment |
| Roles/model | Shared Researcher/Watcher/Indexer/Verifier runtime; configurable OpenRouter models; strict structured planning/results, bounded input/output, one schema retry, token/cost checkpoints | Live model + search execution with credentials |
| Research/browser | Brave adapter, DNS-pinned public HTTPS, SSRF/redirect/size/deadline controls, local Playwright and Browserbase adapters | Browserbase account path; Brave live search |
| Queue/worker | Separate two-slot worker, interval dispatcher, leases/heartbeats, concurrency fence, backoff/dead-letter/cancellation, trace/run IDs and recovery | Managed PostgreSQL/hosted restart smoke test |
| Memory | Bounded relevant summaries, persistent full-text index, cross-run queries, watcher fingerprint deduplication | Quality assessment on live research outputs |
| Services/payments | Metadata/invoke API, official x402 V2 SDK, exact devnet USDC, request-bound memo, constrained signer, durable receipt/replay/lost-reply recovery, human and agent purchases | Real facilitator verification/settlement with funded USDC |
| Safety policy | Network/asset/category/counterparty, per-purchase/run/hour/day, count limits, current-policy rechecks and global/agent kill switches | Funded live-policy acceptance |
| Ledger | Separate compute-credit/devnet domains, provider usage estimates/actuals, earned revenue and buyer expense, calculated self-sustaining status, receipt-backed refund recovery | Real on-chain sale and refund receipts |
| Controls | Owner mission/schedule/service price/policy/pause/resume/termination; restricted administrator controls, compute allocation, reports/notifications/audit | Operator admin wallet configuration for a live deployment |
| Frontend | New terminal homepage; Coins, Jobs, Network, Track Record, nine-step Launch and My Industry; existing functionality and real API data retained | See terminal visual/motion evidence |
| Deployment | Full web/private-DB-service/worker container configuration, TLS database adapter, separate worker credential, health/restart configuration, migrations and runbook | Supabase/hosting authorization; Docker is unavailable on this computer |

The isolated production Token-2022 adapter uses an injected approved custody signer and explicit mainnet gates. It is not selected by V1. Mainnet activation remains a separate reviewed release including network/schema/payment/custody configuration; it has not been exercised or approved.

## Verification evidence

- `pnpm check`: lint, typecheck, **80 unit/integration tests**, production build passed. Migrations 001–005 pass from an empty test database and are applied to the existing local database without deleting history.
- `pnpm test:e2e`: **4 browser tests passed**, including signature authentication, reload/upload, seven-step creation, worker/result/memory, owner policy/funding, service publication, human and agent demo-credit purchases, CSRF/image rejection and responsive navigation.
- `pnpm security:scan`: 159 source/build files checked, no findings in source or browser bundles. `pnpm audit --prod`: zero known advisories. These checks do not replace a production custody/security audit.
- Actual local browser adapter fetched/extracted 15,988 characters from PostgreSQL public documentation and rejected a private address. See `qa/product/browser-preflight.json`. This caught and fixed the Node 24 all-address DNS lookup callback path while retaining pinned DNS.
- Public devnet RPC genesis, existing USDC mint verification and official public test facilitator V2 exact-USDC support verified. Official SDK payment construction/signing and memo binding succeeded without broadcast. See `qa/devnet/preflight.json`.
- Running web/database/worker health verified at localhost:3000; `qa/product/health.json`.
- Approved-layout regression and motion evidence: `qa/product/REVIEW.md` and `qa/product/product.json`.

Fixture facilitator tests verify payment/refund durability, duplicate prevention, failed seller handling and budget enforcement. They do not claim real-chain settlement. The real-chain acceptance report remains `complete: false` with **no transactions**.

## Remaining external blockers

Configure privately in `.env`, then restart the running services:

1. `OPENROUTER_API_KEY`, `OPENROUTER_MODEL`, `MODEL_INPUT_PRICE_PER_MILLION`, `MODEL_OUTPUT_PRICE_PER_MILLION`. Choose a structured-output-capable model; ceiling prices must cover all selected role models.
2. `SEARCH_PROVIDER_API_KEY` for Brave live web search.
3. At least **0.1 devnet SOL and 0.05 devnet USDC** in acceptance funding wallet **7uQoazeGXNzNa1M6w7UC8xXviJmH5aHHrSF1yvcByz6N**. Supported test USDC mint: `4zMMC9srt5Ri5X14GAgXhaHii3GnPAEERYPJgZJDncDU`. No mainnet assets. The public faucet attempt declined/timed out; no bypass or repeated faucet abuse was attempted.

The two acceptance identities already authenticated with real Ed25519 signatures and prepared durable mint operations. Private keys/cookies are in `.data/acceptance`, never in public evidence. Run `pnpm test:devnet` after the above configuration. It must prove mint creation, live report storage, interval execution, paid service challenge, agent payment, settlement, delivery and both ledgers before completion can be declared. Review exact receipts in `qa/devnet/acceptance.json`.

For cloud staging, provide a fresh Supabase/Postgres connection and hosting authorization for the web/private database service/persistent worker, plus explicit secrets and `ADMIN_WALLETS`. Optional Helius, Browserbase and Supabase Storage credentials are not required for the local devnet acceptance path. No existing cloud project was available to deploy into.

## Development behavior retained

The running app is explicitly `APP_MODE=demo`: historical fixtures, temporary development identities and internal test-credit purchases are labelled. Without model/search credentials it uses deterministic development research, never claims that output is live AI analysis, and does not fake devnet settlement. Public RPC and the test facilitator are configured, but funding and live research are still absent.

No public deployment, funded mint, x402 settlement or refund transaction is claimed in this report. Documentation under `docs/` supersedes the earlier visual/local-build reports at the project root.

