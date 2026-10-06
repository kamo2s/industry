# Staging status — 2026-10-04

**STATE B: BLOCKED_EXTERNAL_AUTH.** The approved interface is preserved. Protected deployment artifacts and local native-PostgreSQL acceptance are ready for operator review. There is no public staging URL or verified off-PC execution. See [overnight completion report](OVERNIGHT_COMPLETION_REPORT.md) for all 20 requested outcomes and [external blockers](STAGING_BLOCKERS.md) for exact actions.

## Current master completion update

Network reconstruction and controlled full-site review are locally self-QA approved; UI is frozen. All 18 browser tests passed. Results are documented in [MASTER_COMPLETION_STATUS](MASTER_COMPLETION_STATUS.md). Current full local code gate: 226 tests / 22 files, lint, typecheck and build passed; secret scan found no exposures. Infrastructure was re-audited on October 4: the hosted deployment remains blocked by external access. The following table records the **earlier isolated local PostgreSQL acceptance**, not a newly hosted deployment.

## Earlier verified local staging evidence

| Area | Evidence |
| --- | --- |
| Code | 201 tests / 17 files, lint, typecheck and production build passed |
| Browser | 9 full regression tests; 43 additional staging desktop/mobile route views |
| Approved UI | 24 baseline + 24 final local + 24 staging captures at the three required viewports; no browser errors or horizontal page overflow |
| Persistence | Native PostgreSQL 17.11; 11 checksum migrations, clean install/populated upgrade, transaction serialization/rollback, UTC, RLS roles and application authorization |
| Real AI | Approved OpenAI model + Web Search; scheduled RADAR→VERIFY flow, provenance, internal escrow/settlement, Compute charge and all dependent product views |
| Storage | Existing Supabase project, only isolated INDUSTRY private capture/public icon buckets; actual browser pixels and ACL/expiry/deletion/orphan checks |
| Load | 20 businesses, 100 jobs, 20 purchases; 96 successes and 4 injected failure/refunds; balanced journal, no duplicate settlement or paid load calls |
| Recovery | Real worker kill/lease recovery, DB interruption, web/auth/SSE reconnect and encrypted backup/restore |
| Security | TLS downgrade protection, source/secret scan, injection authority checks, pinned DNS/redirect denial, wallet/admin/private-capture controls, rate limits and kill switches |
| Dependencies | Latest audit: zero advisories; two transitive TOML high findings resolved without upgrading the Pump SDK |
| Operations | Admin process/queue/dead-letter/cost/Pump readiness; $2 global UTC-day provider cap and pause; committed outcome IDs in safe logs |
| Pump | Pinned official SDK/IDL and offline ALT tools; no broadcasts; Treasury and Collector remain UNCONFIGURED |

The bounded soak completed **60.0432 monitored minutes** over two segments, with **242 checkpoints**. All 16 final checks passed: four businesses paused/manual, no active work/reservations/escrow, balanced ledger and no duplicate missions/notifications/settlements or post-fix failures. Recorded provider cost: **$0.173515 / $2.00**. SSE observation: **19.5012 minutes**, 390 frames, no disconnects. See `qa/staging/closeout.json`. Early failures, the recorder interruption and excluded unmonitored gap remain disclosed in the completion report; six historical dead letters were preserved.

## Deployment boundary

Original local app: `http://localhost:3000`, existing PGlite history preserved. Isolated staging: `http://localhost:3100`, broker 4418, worker health 4419 and native PostgreSQL loopback 55432. Test economy only. Staging businesses are paused/manual at bounded acceptance completion.

Prepared topology: nonroot Node 24 image, protected Caddy HTTPS edge, private web/broker services, persistent worker/scheduler and separate disabled collector, plus dedicated external TLS PostgreSQL. Docker is absent locally; image startup, ingress/TLS and actual host lifecycle remain unverified until the host is authorized. CI exists locally; no private remote was available to push.

Required external actions: authorize a persistent host/domain, provide a dedicated TLS database connection, verify hosted backups/restore, and select a private Git destination. Final wallet addresses/collector key, RPC/funding/ALT/Pyth and mainnet acceptance are separate later financial gates. No new AI/search subscription is needed.

Existing infrastructure discovery found usable OpenAI and safely reusable Supabase storage credentials. No authorized application deployment path or dedicated INDUSTRY hosted database login was found in the inspected configuration. The available browser surfaces expose INDUSTRY pages, not a signed-in hosting dashboard. No unrelated application's database or objects were repurposed; secrets remain in ignored private configuration.
