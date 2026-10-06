# Splice → INDUSTRY cutover, October 6, 2026

Status: Splice stopped. INDUSTRY not yet deployed. Owner chose reuse of existing Supabase, not a new Railway database.

## Confirmed infrastructure

Railway workspace `kamo's Projects`, project `genuine-truth` (`25cd4e01-b64b-4b16-9746-1f689427c1e3`), production environment `2f05e708-19e1-420f-b217-5c6872173953`.
Existing custom domain `memesplice.fun`, Railway domain `memesplice-production.up.railway.app`; both target port 5173. DNS remains unchanged.
Supabase organization Splice, project MemeSplice (`qvitpuikrisqmgsrhubh`), PRO/MICRO, us-east-1. Dashboard reported healthy with last backup 13 hours earlier; restore has not been tested.

## Stopped deployments / rollback

| Service | Service ID | Previous deployment |
| --- | --- | --- |
| splice-web | 0855213a-387e-4540-b2fa-986736c0f566 | 5e8017d2-0c59-4ff2-b132-6327953e30d1 |
| splice-ai-worker | c1272486-e330-4780-b7fa-0b2a9f631c39 | 1dd2f969-75ec-433f-a782-910301aafa5c |
| splice-launch-reconciler | 3a967587-a980-4efb-9b3f-06fca318c260 | 62f5da47-aff4-4b4a-b011-0f3e2642e0b4 |

Railway confirms no active deployment for all three. GitHub source disconnected from all three to prevent an old-code push restarting Splice. Prior source: `kamo2s/MemeSplice`, branch `main`, deployment label `browser_icon`. Service history and existing variables retained. No Supabase data or Pinata objects deleted. Rollback requires deliberately reconnecting that repo/branch and redeploying the retained Splice version with its former commands and variables.

## Replacement plan

Reuse web service for INDUSTRY web (listen 0.0.0.0:5173 to preserve domain routing), AI worker for INDUSTRY worker, reconciler for private INDUSTRY database broker. Separate credentials per role; never upload local .env, collector signer, test database, captures or tools in the source archive. A hosted collector remains disabled/unprovisioned until its separate financial readiness gate.

Reuse the existing Supabase compute with a private `industry` schema and `DATABASE_SCHEMA=industry`. Never include public in that search path. Apply `supabase-industry-schema.sql` before application migrations. Preserve Splice public tables. Dedicated INDUSTRY storage bucket names remain separate from Splice. PostgreSQL TLS verification remains required.

Current concrete blocker: neither local Splice configuration nor existing Railway variables contains a PostgreSQL password/connection string. Supabase Connect displays `[YOUR-PASSWORD]`, not a recoverable password. Existing REST service secret is not a PostgreSQL password. A database password must be entered locally by the owner, or reset by the owner in Supabase; do not invent one or weaken authentication. CLI authorized explicitly by owner for this project/workspace; no Railway database was created.

After credentials: verify TLS, check schema isolation, run migration, configure role-scoped variables, upload/build services, test public HTTPS, wallet auth, assets, worker, isolated browser capture, backups and restore. No public token, mainnet broadcast, or automatic treasury spending is enabled by this cutover.
