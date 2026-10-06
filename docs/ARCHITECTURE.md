# INDUSTRY architecture

The current product contract is [Autonomous Coins](AUTONOMOUS_COINS.md): one Coin business entity, launch-only creator instructions and human observation afterwards. Homepage layout is preserved. Explicit `APP_ENV=local|staging|production` is authoritative; `NODE_ENV` only describes the build. `packages/core/environment.ts` validates origin, persistence, secrets and staging financial gates.

## Processes

- Next.js serves the UI, wallet authentication boundary, same-origin API, rate limits and SSE invalidation. Every data refresh applies application authorization.
- The private database broker owns business identity, policy, durable jobs, immutable double-entry accounting, source/event/capture metadata and financial adapters. Hosted environments require TLS PostgreSQL. PGlite is local/test only.
- AgentRuntime has two general lanes and one reserved supplier lane. Queue claiming also dispatches due recurring missions, with row locks and schedule idempotency. A browser or open page is never required for dispatch. Hosted continuity needs the persistent service to be deployed; local evidence does not prove off-PC operation.
- A separate collector scheduler sends authenticated bounded ticks. It holds no Treasury key. All Pump broadcasting remains disabled; final Treasury and Collector addresses are absent.

Wallet signatures create server-side hashed, expiring sessions, independent of Supabase Auth. Supabase anon/authenticated roles have no direct private-table or ledger-function access. The broker exposes `Domain.publicDispatch` through `/rpc`: launch normalization and observer-only permissions. Manual service invocation, posting and creator execution/configuration/funding controls return 403. Worker purchases use separate credentials and an active lease; admin containment uses an allowlisted signed wallet. Internal `dispatch` is retained for recovery and historical regression tests, never used directly by public RPC. Service-role credentials never reach the browser or AI worker.

## Durable execution

Claims carry job, run, trace and lease IDs. Heartbeats preserve ownership. Expired 90-second leases recover with bounded attempts; exhaustion remains a visible dead letter. Provider usage is checkpointed before billable calls and settled once per attempt, including uncertain-outcome estimates. Staging shares a database-serialized $2/day provider cap across workers; run reservations count across UTC midnight. Admin/environment provider pause blocks new paid calls.

Plans are bounded before tools execute. Each step rechecks current policy. Public HTTPS is DNS-pinned; rendered pages have no script/subresource access. Source provenance distinguishes discovery from actual retrieval. Supplier outputs are evidence, never authority. Pending/delivered supplier requests are reused across parent retries; only refunded failures can be replaced, once per parent attempt. A parent cannot complete with an unresolved latest dependency.

## Financial model

Business identity owns separate Compute and Operating accounts. Compute pays measured execution; Operating reserves service purchases into escrow. Valid delivery settles 100% to seller Operating; failure refunds the original payer. Both sides of internal turnover remain one internal transfer in Economy, not new external inflow. Creator fees and owner funding do not qualify as genuine service revenue or Self-Sustaining evidence.

Confirmed Pump SOL receipts retain raw asset, mint/business, signature, slot/time and immutable evidence. Receipt-time trusted Pyth pricing adds USD accounting value exactly once. Missing trusted price leaves PENDING_CONVERSION. Physical SOL stays in the pooled treasury; no swap or autonomous withdrawal exists. Approved fee economics are unchanged: [FEE_ROUTING](FEE_ROUTING.md).

## Storage and observability

Browser pixels live in a private object bucket; the database stores metadata and visibility. Reads go through the API, with owner/public/system and expiry checks. Captures expire after 24 hours; cleanup and orphan sweeps run every 10 minutes. Icons use a separate public bucket. Hosted storage was exercised with actual public-page pixels and separate ACL fixtures.

SSE sends refresh signals every three seconds; it is the implemented live transport, not a direct Supabase Realtime subscription. Admin shows worker/scheduler/collector/retention state, queue/dead letters, ledger invariants, provider cost/reservations/cap, configuration and Pump prerequisites. Job/phase logs and durable audit records provide IDs without credentials. Outcome logs are emitted after the application transaction commits and correlate job, run, service request and journal transaction IDs. See [RUNBOOK](RUNBOOK.md).
