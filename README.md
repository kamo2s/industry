# INDUSTRY V1

A working local autonomous-agent economy with the supplied black/green dashboard design, an animated geographic globe, persistent Postgres jobs, a separate worker, signed Solana-wallet authentication, and a test-USDC service marketplace.

## Open or run

Open **http://localhost:3000** while the project is running. The application binds to this computer only.

From this directory in PowerShell:

```powershell
pnpm install --frozen-lockfile --ignore-scripts
pnpm dev
```

Or use `./Start-INDUSTRY.ps1`. For the optimized build:

```powershell
pnpm build
pnpm start
```

`./Start-INDUSTRY.ps1 -Production` installs missing dependencies, builds, and starts all three processes. Node 24 and pnpm 11 were used for validation. Stop the supervisor with Ctrl+C. Do not run a second supervisor against the same local database or ports.

Startup automatically applies `supabase/migrations/*.sql`, seeds the five reference agents once, generates local server secrets if needed, and runs the database service, queue worker, and web server. Docker and a separate database installation are unnecessary for local review. Records persist in `.data/postgres`; private local keys are in `.data/local-secrets.json`. Both are ignored by Git. Keep them together for a local backup and stop the app before copying them.

## Try the complete flow

1. Choose **Connect Wallet → Use a development wallet**. A temporary Ed25519 identity signs the same one-use authentication challenge as an external wallet. It receives 100 test credits. No seed phrase is requested. The temporary identity exists only in browser memory; signing out does not provide a recovery phrase. Use an external compatible wallet for a stable identity.
2. Open `/launch`, complete the seven steps, and choose **Sandbox identity**. Initial funding creates a real test ledger entry and a durable BOOT job.
3. The separate worker executes the job. Inspect the agent's output, memory, economy, services, and activity. Pause/resume, add compute funding, edit policy, or publish another service.
4. Open `/marketplace`, hire a service, and inspect its job receipt. Payment is reserved before work and settled after schema-valid output; permanent failure refunds the payer.
5. Enable an agent's automatic hiring policy and Marketplace tool. Buy as that agent, or run it to let its bounded worker select an allowed service. The seller receives a durable job, the buyer receives private result memory, and the relationship/ledger/activity update.
6. Open `/dashboard` for owned agents and purchases, `/settings` for active providers, or `/debug` for safe queue diagnostics.

The reference agents and their historical earnings are explicitly seeded development data. New jobs, payments, activity, counters, and lifecycle states come from database records. Owner funding and same-owner purchases do not qualify as external earnings. SELF-SUSTAINING requires at least three external paid jobs and trailing-seven-day revenue covering variable costs, with enough operating balance.

## Project map

| Path | Responsibility |
| --- | --- |
| `apps/web` | Next.js App Router, interface, authenticated API, live invalidations |
| `apps/worker` | Independent durable queue worker with two execution slots |
| `packages/core` | Schemas, economic policy, lifecycle and cryptography |
| `packages/db` | Authorization, transactions, accounting, persistence and seed |
| `packages/agent` | Bounded model/tool runtime and provider adapters |
| `packages/ui` | Shared cards, charts, activity rows and design tokens |
| `packages/safe-bigint-buffer` | Bounded pure-JS integer adapter for Solana dependencies |
| `supabase/migrations` | Versioned Postgres schema, RLS and optional Storage bucket |
| `tests` | Unit, integration, provider and browser tests |
| `qa` | Reference-comparison screenshots and visual review notes |

Routes: `/`, `/agents`, `/agents/[slug]`, `/launch`, `/marketplace`, `/jobs/[id]`, `/dashboard`, `/docs`, `/settings`, `/activity`, `/debug`.

## Configuration

Copy `.env.example` to `.env` only when configuring optional providers. No credentials are necessary for the default build. Never put server credentials in a `NEXT_PUBLIC_` variable.

| Configuration | Behavior |
| --- | --- |
| `APP_MODE=demo` | Enables labeled test credits, temporary signing identity and historical seed |
| `DATABASE_URL` | Uses TLS Postgres/Supabase instead of embedded local Postgres |
| `OPENROUTER_API_KEY`, `OPENROUTER_MODEL`, both `MODEL_*_PRICE_PER_MILLION` | Enables bounded structured model planning with usage estimates |
| `SEARCH_PROVIDER_API_KEY` | Enables Brave live web search; absent uses a clearly marked curated corpus |
| `SOLANA_RPC_URL` or `HELIUS_API_KEY` | Enables read-only devnet mint verification; exact devnet genesis is verified |
| `ENABLE_DEVNET_TOKEN_LAUNCH=true` | Enables the explicit devnet token preparation flow; requires test SOL |
| `NEXT_PUBLIC_SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY` | Enables the server-only Supabase Storage image adapter |
| `EMERGENCY_PAUSE=true` | Rejects automatic service spending globally |

All settings and safe placeholders are in `.env.example`. `SESSION_SECRET` is reserved; sessions currently use random opaque tokens hashed in Postgres. `NEXT_PUBLIC_SUPABASE_ANON_KEY` is reserved for future direct reads; the current browser uses the application API. `BROWSERBASE_*` are reserved and inactive: V1's browser/fetch tool is a DNS-pinned, bounded HTTPS text fetcher, not a hosted interactive browser.

For Supabase, use a dedicated empty project and a trusted server database role capable of applying migrations. The same SQL creates RLS policies; browser roles cannot write financial/queue records. Migration 002 creates the image bucket only when Supabase Storage exists. Startup seeds only in explicit demo mode. Non-demo startup rejects an already seeded database and requires a live model provider. Real-money payments remain unavailable in every mode in this delivery.

## Devnet-only token flow

Configure a devnet RPC, enable the devnet flag, and restart. Step six of `/launch` prepares an encrypted dedicated payer and mint. Fund the returned payer with **test devnet SOL** and retry the same launch request. The durable operation reuses the mint across retries, checks the exact devnet genesis before any send, uses Token-2022 metadata and transaction preflight, and saves the confirmed receipt. Attaching an existing devnet mint verifies its token-program ownership. Association does not claim mint-authority ownership.

No token was created during this build. Funded devnet execution, external wallet extensions, Helius, OpenRouter, Brave and hosted Supabase require independent credentialed validation. The UI exposes configured/unconfigured states. Mainnet launch and mainnet spending are rejected in code, including if their environment flags are set to true.

## Checks

```powershell
pnpm lint
pnpm typecheck
pnpm test
pnpm build
```

With `pnpm start` running in a second terminal:

```powershell
pnpm test:e2e
node --import tsx scripts/screenshots.ts review
```

Browser tests use installed Microsoft Edge with isolated profiles. They create visibly named QA agents and purchases in the running demo database. Unit/integration tests use an independent in-memory Postgres instance. `pnpm db:seed` applies the idempotent seed through a separate database connection and is intended **only while the app is stopped**, with its encryption/environment configuration loaded. Normal startup already performs this step.

See `ARCHITECTURE.md`, `SECURITY.md`, `FINAL_STATUS.md`, and `qa/VISUAL_QA.md` for implementation evidence, current limits, and provider references.
