# Production operations and recovery

## Deployment checks

`INDUSTRY validation` runs lint, TypeScript, tests, build, secret scan and production dependency audit on pushes and pull requests. Railway's `checkSuites` setting is enabled on the web, database and worker main-branch deployment triggers. Do not bypass it with direct CLI source uploads for ordinary releases. The collector uses a separately deployed scheduler image; changes to that image require the same reviewed checks before release.

## Visitor identity

Only Railway's overwritten `X-Real-IP` is trusted on public HTTP ingress. Do not substitute arbitrary `X-Forwarded-For` or Cloudflare headers. The gateway validates one IP and canonicalizes IPv6; missing/malformed values fail closed. Railway's internal GET /api/health probe alone uses a separate health-probe bucket when ingress headers are absent. Live spoof tests and evidence are in `qa/launch-hardening/ingress.json`.

Railway reference: https://docs.railway.com/networking/public-networking/specs-and-limits
CI gating reference: https://docs.railway.com/deployments/github-autodeploys

## Monitoring

GitHub Actions runs `INDUSTRY external health` outside Railway, scheduled approximately every five minutes (GitHub schedules can be delayed). It calls `/api/ops/health` using a dedicated `MONITOR_API_SECRET`. The same read-only key is in GitHub repository secrets and web/database Railway variables. It cannot sign transactions, run Coins, pause services, or access the admin panel. Anonymous requests return 401. Rotate all three copies together.

Health includes worker/scheduler staleness, collector process and individual business errors, fee conversions pending over fifteen minutes, recent failed jobs, ledger invariants and market staleness. Historical dead letters and budget/intentional pause states are warnings, distinct from current infrastructure faults. Public outage detection retries once before failing the workflow. GitHub run failures are recorded externally; actual owner notification delivery is a separate acceptance gate. A green monitoring run is not a fee-claim or launch transaction test.

## Verified recovery snapshot

October 11 snapshot contains the production `industry` schema, eleven stored artwork objects and four service configurations. AES-256-GCM archive resides in private Supabase bucket `industry-recovery`; object name and SHA-256 are recorded in `qa/launch-hardening/cloud-backup.json`. The key is separate in Railway industry-database `BACKUP_ENCRYPTION_KEY`; a restricted local copy is in `.data/recovery-oct11`. Never commit either secrets or decrypted dumps.

A production snapshot was restored into isolated local PostgreSQL `industry_recovery_20261011`. All 53 tables matched their exported-snapshot counts and content digests; account/ledger balances reconciled, RLS remained enabled, and all artwork hashes matched. Encrypted cloud readback and decryption were also verified. This proves production-data recovery to an isolated local target, not a hosted regional failover. Do not run workers or the application against the restored database with production keys. It contains production session/signing material and must remain access-restricted.

Recovery procedure:

1. Obtain the encrypted archive from private storage and the key separately from Railway. Preserve the recorded hash; decrypt only on a trusted, access-restricted recovery host.
2. Restore the custom-format dump into a new isolated PostgreSQL database using pg_restore, preserving schema and RLS. Never restore over the live database as a test.
3. Compare every table with the archive's manifest using UTC timestamps; verify ledger postings versus account balances and all artwork hashes. Inspect policies and application-role grants for the target platform. Restore artwork into a private storage bucket using its original paths.
4. Recover required service configuration without printing it. The snapshot is point-in-time; reapply subsequent infrastructure changes from the runbook. Rotate session/internal/worker/monitor credentials before switching recovered production traffic. Restore any signing key only to the database service after public-address verification.
5. Deploy with all execution, collection and reconciliation switches disabled initially. Verify read-only behavior, HTTPS, storage, authenticated admin, and accounting. Owner approval remains required before enabling real-value processing on a replacement deployment.
6. Record the recovery timestamp, scope, checks, data-loss window and limitations. Never mark hosted failover verified based solely on this local drill.

The archive is an additional recovery checkpoint, not a replacement for Supabase's managed daily database backups. Temporary browser captures are excluded intentionally (24-hour retention); they are not business accounting records. Preserve the old memesplice.fun redirect for existing token metadata URLs. A single Supabase outage may affect both primary data and the cloud archive; retain the separately encrypted local archive and ensure the owner retains recovery access to Railway and Supabase.
