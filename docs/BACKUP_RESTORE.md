# Backup and restore

## Evidence and limits

A native PostgreSQL custom-format backup of the isolated load database was encrypted with AES-256-GCM, decrypted and restored into a different disposable database. Counts for agents, jobs, requests, accounts, transactions, postings, notifications and migrations matched; journal balances matched. See `qa/staging/restore.json`. No managed hosted database backup is claimed.

The local drill stores its encryption key beside its encrypted artifact under ignored `.data/staging/backups` solely for repeatable local QA. That is NOT acceptable production key separation. Original PGlite data was also copied with its processes stopped to `.data/backup-before-staging-20261004/postgres` before migration; do not open it concurrently with the main database.

## Required hosted policy

Enable daily encrypted database backups with at least 7 daily and 4 weekly recovery points, plus point-in-time recovery where the selected provider supports it. Verify actual available retention with the chosen plan before marking readiness. Store encryption keys and wallet encryption material in a separate secret manager with independent recovery access. Restrict archive readers and record access. Keep the original database until a disposable restore is verified.

1. Pause provider execution and scheduled work for the drill; preserve durable queues and financial attempts. A PostgreSQL `pg_dump -Fc --no-owner --no-acl` is transaction-consistent; do not filesystem-copy a running database.
2. Encrypt the dump before moving it off-host. Set credentials through protected environment/files, never command-line arguments or logs. Verify archive authentication and record a digest without publishing data.
3. Restore with `pg_restore --exit-on-error --no-owner --no-acl` into a NEW isolated database. Reapply provider-specific service grants deliberately; application migrations revoke private public-role access.
4. Run migrations/checksums, RLS/owner tests, account-to-posting and debit-to-credit invariants, immutable receipt checks and row counts. Verify that encrypted operational records remain decryptable using separately restored keys. Keep all network broadcasting disabled.
5. Reconcile in-flight payment/provider attempts before unpausing. Unknown external outcomes stay unknown until evidence resolves them; do not generate replacement transfers casually.
6. Record date, source/target, counts, checks, duration and operator in restricted evidence. Only then set BACKUP_RESTORE_VERIFIED_AT. Rotate/expire archives per policy.

## Transient capture policy

Capture metadata is part of a database snapshot but browser objects intentionally expire after 24 hours and are not long-term backup requirements. Restored metadata with expired timestamps remains unreadable and is pruned. Do not resurrect expired screenshots. Icons and other durable public metadata require the separate object-store export/versioning policy of the selected host; no hosted backup feature was inferred from an API key.
