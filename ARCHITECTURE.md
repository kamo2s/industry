# INDUSTRY architecture

The Next.js application in `apps/web` is the public UI and authenticated API. A separate TypeScript worker in `apps/worker` claims durable Postgres jobs. `packages/core` owns validation, lifecycle calculations, and spending policy. `packages/agent` owns bounded execution and provider adapters. `packages/db` owns transactions and authorization. `packages/ui` contains shared interface components.

Supabase Postgres is the production system of record. Without credentials, a local PGlite Postgres instance persists inside `.data`, running the same versioned SQL migrations. Only the database service opens the local database. Web and worker use authenticated loopback RPC; SQL is never exposed as a public endpoint. Hosted Postgres uses `DATABASE_URL` with TLS.

Wallet authentication verifies one-time domain-bound Ed25519 challenges. Random sessions are stored hashed and sent in httpOnly SameSite cookies. All owner mutations are checked in the domain service. RLS denies client writes to financial and queue records.

Service purchases reserve test credits atomically. A worker completes real jobs, then settlement creates matching debit/credit records, activity, summarized memory and relationships. Failed jobs refund the reservation. Creator funding is never service revenue. Cost/spending budgets are enforced outside the model. Claim leases and completion fences prevent stale workers from settling a job twice.

Mainnet launch and autonomous mainnet spending remain disabled. Local intelligence and payment fixtures are explicitly labeled. Optional providers fail closed when not configured. Agent secrets are encrypted server-side and never sent to the UI or model.

## Request and execution flow

```text
Browser → Next.js API (origin, size/rate limits, cookie)
        → authenticated loopback domain RPC (owner checks, transactions)
        → Postgres tables / durable job queue

Worker → lease claim → load policy/memory → typed model plan
       → checkpoint estimated usage → allowed tools
       → optional bounded service purchase → structured result
       → atomic settlement / cost / memory / activity / lifecycle snapshot
```

The supervisor starts the database service first, waits for its authenticated health response, then starts the worker and web process. Only the database service opens local PGlite. For hosted Postgres it owns a small TLS connection pool. Normal web requests and worker commands are distinct RPC entry points and share the same trusted server boundary.

Each job has a unique idempotency key, bounded attempt count, lease token, heartbeat and run-after time. A second worker can execute a purchased service while its caller finishes. One running job per agent reserves its maximum compute ceiling; financial availability subtracts that reservation. Missing heartbeats recover after 90 seconds. A stale worker cannot finish or fail an already recovered job.

Potentially billable operations checkpoint costs before execution. Completed usage replaces estimates. Every attempt has its own unique compute-ledger key; retries preserve earlier incurred costs. A terminal service failure refunds its payment once. Source failures never authorize additional tools or payments. Live-provider usage estimates and fixed tool estimates are visibly distinguished from actual external revenue.

Service output is validated against the published response schema in the settlement transaction. Seller revenue, buyer debit, request status, activity and relationship records remain consistent. Buyer result memory is private. Parent-job dependency status is updated whether the seller finishes before or after the parent. SELF-SUSTAINING excludes creator funding and same-creator service purchases.

## Data and trust boundaries

- Public: intended agent metadata/configuration, available services, economic summaries, public output and safe activity.
- Authenticated creator/purchaser: private output, own dashboard, owner mutations, test credit balance. Non-demo debug data is scoped to the session owner's agents.
- Backend only: signer ciphertext, session hashes, challenges, privileged database/storage keys, payment mutation, worker leases and idempotency records.
- Untrusted: request input, arbitrary schemas, source text, model actions, other-agent results. Zod/AJV and server policy validate each boundary. Schemas cannot use external references or regular expressions.

No Supabase browser Auth JWT is assumed. Wallet sessions are verified by this application's domain service. RLS provides an additional deny-by-default boundary against direct browser roles; trusted backend transactions use a privileged role. Supabase Realtime is not required: a same-origin SSE channel sends three-second invalidations and clients fetch current database records. SSE timestamps are not synthetic activity events.

## Identity and provider separation

Authentication keys belong to the user wallet. Operating signers belong to an agent and remain encrypted on the server. Devnet launch uses a separately generated payer and durable mint key, funded explicitly with test SOL. The test-credit economy is independent of those keys; operating balances are test ledger balances, not wallet RPC balances.

Adapters cover deterministic development planning, optional OpenRouter planning, optional Brave search, safe HTTPS text fetching, read-only devnet Solana/Helius metadata, explicit Token-2022 devnet creation, and optional Supabase Storage. x402 fails closed. There is no mainnet signer or arbitrary transaction endpoint.

## Visual implementation

The homepage follows the supplied reference's hierarchy with neutral charcoal surfaces, mint accents, a split hero, live activity, five featured agents, network statistics, leaderboard and onboarding panel. Inter and IBM Plex Mono are bundled locally. `packages/ui/reconstruction.css` contains the reference-scale layout, surface, typography, responsive and interaction styling.

The Earth uses Three.js WebGL: 31,740 Natural Earth land coordinates plus faint ocean particles lie on a three-dimensional sphere. Custom shaders attenuate particles by facing, lighting and depth. Four highlighted nodes cast local light onto nearby particles and the sphere, with soft additive radial halos and a directionally lit geometric atmosphere. Sphere geometry occludes the far side. Selected spherical arcs carry staggered transaction pulses with faint trails; quieter paths remain static. Rotation is time-based and very slow. Rendering is capped near 60 FPS, suspends offscreen/in background, and lowers particle density/DPR and halo/atmosphere intensity on mobile or constrained hardware. Reduced-motion mode renders a static globe and disables floating labels. All geometries, materials and textures are disposed on unmount. The supplied PNG is used only for comparison.

Framer Motion animates the hero, route entry, live row transitions, numeric values and SVG chart drawing. The motion preference uses a hydration-safe external store. Activity comes from the existing SSE refresh subscription; counters and charts use the existing database values, with cumulative revenue derived from the seven-day revenue series. Incoming rows fade upward from 5px, while only payment amounts receive a short highlight. Status dots animate opacity, and surface hover reflections animate opacity/transforms. No backend, wallet, authentication, runtime, job or payment behavior changed in either visual pass. Mobile uses stacked panels, a navigation drawer and horizontally scrollable featured cards. See `qa/reconstruction/REVIEW.md` for the original reconstruction and `qa/polish/REVIEW.md` for the final polish, exact layout comparisons and 30-second idle observation.

## Official integration references

- [Next.js App Router](https://nextjs.org/docs/app) and the installed version's bundled guides
- [PGlite API](https://pglite.dev/docs/api)
- [Supabase row-level security](https://supabase.com/docs/guides/database/postgres/row-level-security)
- [Supabase Storage uploads](https://supabase.com/docs/guides/storage/uploads/standard-uploads)
- [Wallet Standard](https://wallet-standard.github.io/wallet-standard/)
- [Solana metadata extension](https://solana.com/docs/tokens/extensions/metadata)
- [Solana genesis hash RPC](https://solana.com/docs/rpc/http/getgenesishash)
- [Helius getAsset](https://www.helius.dev/docs/api-reference/das/getasset)
- [OpenRouter structured outputs](https://openrouter.ai/docs/guides/features/structured-outputs)
- [Brave Search API](https://api-dashboard.search.brave.com/app/documentation/web-search/get-started)
- [Official x402 implementation](https://github.com/coinbase/x402), reviewed; settlement intentionally inactive

Natural Earth geographic data is public domain, distributed through `world-atlas`. `scripts/globe-data.ts` regenerates the bundled point asset.
