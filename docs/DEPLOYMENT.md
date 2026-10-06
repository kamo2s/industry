# Hosted deployment

Current evidence and limitations: [STAGING_STATUS](STAGING_STATUS.md). No off-PC application has been deployed. Use the existing authorized private storage buckets; a dedicated TLS PostgreSQL database and persistent host still require operator access.

## Deploy the prepared topology

1. Select an authorized persistent Linux container host with private networking, Docker Compose v2, ports 80/443 and a staging hostname. Obtain billing approval separately if required. Do not use request-scoped functions for the worker or scheduler.
2. Copy `deploy/staging.env.example` to the ignored `deploy/staging.env` on that host, or inject equivalent secrets from its secret manager. Set a real HTTPS origin/domain, dedicated `DATABASE_URL`, trusted CA when needed, existing Supabase URL/service credential and INDUSTRY bucket names, OpenAI credential, admin wallet allowlist, independent 32+ character service/session secrets and a 64-hex wallet encryption key. These are application secrets, not final Treasury/Collector wallets.
3. Generate the reviewer password hash using `caddy hash-password` interactively; store it privately. Caddy protects staging with basic authentication, terminates TLS, overwrites the trusted client-IP header and streams SSE without buffering. Never expose web:3000 or database:4318 directly.
4. Install locked dependencies with `pnpm install --frozen-lockfile --ignore-scripts`; run `pnpm check`, `pnpm security:scan`, `pnpm audit --audit-level high`. CI mirrors these commands. The Docker image builds the approved Next.js interface and runs as user node.
5. Export the private staging environment into the deployment process, inspect `pnpm readiness`, correct configuration blockers and run `pnpm db:migrate`. After deploying and completing the restore drill, require `pnpm readiness --strict --probe` for staging sign-off. Strict staging readiness intentionally excludes later financial acceptance and remote CI gates; those remain explicit checks below. `--target=production` includes them. Configuration alone never proves on-chain or hosted acceptance. Keep all launch/collection flags false. Never run staging against the local demo database.
6. `docker compose --env-file deploy/staging.env config --quiet` then `docker compose --env-file deploy/staging.env up --build -d database`. The broker also applies migrations under a database lock with stored SHA-256 checksums. Create the four small businesses with `pnpm staging:seed` using the same protected environment and a configured admin wallet. The hosted seed starts paused/manual with bounded test credits.
7. `docker compose --env-file deploy/staging.env up --build -d`. This starts web, persistent worker/scheduler and the disabled collector behind the edge proxy. Health checks inspect the actual web/API, database RPC and worker endpoint. Worker SIGTERM stops new claims and drains active work; 150 seconds are reserved before forced termination. Stop worker before database. Unexpected deaths recover through the 90-second durable lease.
8. Verify HTTPS, signed wallet login, owner and cross-owner access, Admin readiness, storage ACLs, SSE reconnection, provider cap, one bounded real mission and settlement before unpausing schedules. Set staging intervals to at least 15 minutes. Repeat browser/mobile QA and a bounded soak on the actual host.

A Vercel web deployment is possible only with an authenticated, privately reachable persistent RPC service. The supplied complete container topology avoids public RPC ingress. It is prepared, but this computer has no Docker engine: Linux image startup, TLS/ingress, host restarts and off-PC persistence must be verified on the selected host.

## Secret/process boundaries

Web: session secret and web RPC credential. Worker: OpenAI/search keys and distinct worker credential. Database broker: PostgreSQL, private storage, ledger authority and encrypted custody material. Collector scheduler: only its narrow tick credential. The default composition mounts no operational signer and enables no Pump broadcast. `compose.pump.yaml` is an optional later operator-reviewed key mount, not part of staging deployment.

Default browser mode is safe HTTPS fetch. Local Chromium rendering needs a compatible executable and libraries in a derived image. Browserbase billing is blocked in staging until its cost model is reviewed; Helius calls require an explicit reviewed per-call estimate and a reserved live run. No account purchase is needed for the default OpenAI + OpenAI Web Search + HTTPS setup.

## Rollback

Pause providers/agents, stop workers, preserve pending job/payment/receipt history, and back up first. Deploy a previously verified application image compatible with the current schema. Do not edit or reverse applied migrations in place. For an incompatible schema, restore to a new isolated target and verify the journal before any traffic switch. See [BACKUP_RESTORE](BACKUP_RESTORE.md) and [INCIDENT_RESPONSE](INCIDENT_RESPONSE.md).
