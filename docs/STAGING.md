# Staging operations

Use `APP_ENV=staging`, `APP_MODE=live`, a dedicated PostgreSQL database and explicit HTTPS `PUBLIC_APP_URL`. Staging uses TEST_USDC internal accounting, never actual USDC, creator-fee receipts or market capitalization. New signed users receive zero automatic credits. An operator deliberately funds a small seed economy.

`pnpm staging:seed` creates PULSE, RADAR, VERIFY and INDEX once in the dedicated target, using the configured administrator identity and bounded test credits. It does not copy local QA history or generate financial keys. Hosted seed businesses begin paused/manual. Configure at least 15-minute intervals only for bounded acceptance; pause them afterward.

## Local simulation used in this run

Isolated native PostgreSQL 17.11 listens only on 127.0.0.1:55432. Database broker:4418, web:3100, worker health:4419, plus a separate disabled collector. Private configuration and QA identities are under ignored `.data/staging`. The original application remains on localhost:3000 with its existing PGlite data, backed up before migration.

The simulation exception `STAGING_LOCAL_SIMULATION=true` permits loopback HTTP/PostgreSQL without TLS only for staging. Never set it on a host. `STAGING_DETERMINISTIC_PROVIDER=true` permits explicitly labelled development brains for inexpensive infrastructure checks. Real RADAR/VERIFY executions use the approved OpenAI brain; no silent fallback occurs.

Read `qa/staging/*.json` and [OVERNIGHT_COMPLETION_REPORT](OVERNIGHT_COMPLETION_REPORT.md) for exact outcomes. These are local-process tests against native PostgreSQL and real hosted private storage. They do not establish hosted compute, HTTPS ingress, managed backups or continued operation with this PC off.

## Bounded test tools

- `scripts/staging-soak.ts`: persisted 15-second checkpoints; 60 monitored minutes across resumable segments. Unobserved gaps do not count toward the target. At the limit it disables schedules, drains existing work and pauses the seed businesses. Wall time and monitored time are recorded separately.
- `scripts/staging-load.ts`: disposable database, 20 businesses, 100 jobs and deterministic suppliers; never uses OpenAI for load.
- `scripts/staging-recovery.ts`: real worker-child termination and 90-second lease expiry.
- `scripts/staging-outage.ts`: stops ONLY the disposable local PostgreSQL cluster and restores it.
- `scripts/staging-storage.ts --simulation`: isolated real private-bucket ACL, expiry and cleanup checks.
- `scripts/staging-browser.ts`: actual safe public HTML rendering plus real private storage; temporary objects deleted afterward.
- `scripts/staging-security.ts`, `staging-http.ts`, `staging-visual.ts`: database roles/application access, HTTP controls and browser review.

These scripts intentionally refuse destructive target reuse where applicable. Do not change their database names to a production target. They require the private local acceptance configuration and are not generic remote deployment commands.
