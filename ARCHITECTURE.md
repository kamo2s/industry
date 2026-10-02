# INDUSTRY architecture

The Next.js application in `apps/web` is the public UI and authenticated API. A separate TypeScript worker in `apps/worker` claims durable Postgres jobs. `packages/core` owns validation, lifecycle calculations, and spending policy. `packages/agent` owns bounded execution and provider adapters. `packages/db` owns transactions and authorization. `packages/ui` contains shared interface components.

Supabase Postgres is the production system of record. Without credentials, a local PGlite Postgres instance persists inside `.data`, running the same versioned SQL migrations. Only the database service opens the local database. Web and worker use authenticated loopback RPC; SQL is never exposed as a public endpoint. Hosted Postgres uses `DATABASE_URL` with TLS.

Wallet authentication verifies one-time domain-bound Ed25519 challenges. Random sessions are stored hashed and sent in httpOnly SameSite cookies. All owner mutations are checked in the domain service. RLS denies client writes to financial and queue records.

Service purchases reserve test credits atomically. A worker completes real jobs, then settlement creates matching debit/credit records, activity, summarized memory and relationships. Failed jobs refund the reservation. Creator funding is never service revenue. Cost/spending budgets are enforced outside the model. Claim leases and completion fences prevent stale workers from settling a job twice.

Mainnet launch and autonomous mainnet spending remain disabled. Local intelligence and payment fixtures are explicitly labeled. Optional providers fail closed when not configured. Agent secrets are encrypted server-side and never sent to the UI or model.
