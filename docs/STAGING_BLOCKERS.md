# External staging blockers

Status: BLOCKED_EXTERNAL_AUTH, 2026-10-04. Ordinary local engineering and acceptance continued independently.

| Blocker | Why required | Exact operator action | Next step |
| --- | --- | --- | --- |
| No authorized persistent application host or staging domain | Web, worker, scheduler and collector must operate when this PC is off | Authorize an existing Linux/container host with private networking and its staging HTTPS hostname; approve any new billing separately | Populate `deploy/staging.env`, follow `docs/DEPLOYMENT.md`, run Compose config and deploy |
| No dedicated hosted INDUSTRY PostgreSQL connection | A Supabase Storage API key does not provide an isolated database or authorize repurposing another project's data | Supply a dedicated TLS `DATABASE_URL` and CA if required, through the host secret manager | `pnpm readiness --strict`, `pnpm db:migrate`, `pnpm staging:seed` |
| No private Git remote/push authorization | Remote CI cannot run without a repository destination | Select/create a private repository and authorize the remote; never make it public | Push the existing `.github/workflows/ci.yml` after review |
| No hosted backup/restore access | Local restore evidence cannot prove a managed host's recovery configuration | Enable/verify backups on the selected database host and perform the documented disposable restore drill | Record the verified date in BACKUP_RESTORE_VERIFIED_AT |
| Final Treasury and Collector intentionally absent | Only needed for later separately approved Pump acceptance | Supply their public addresses and protected collector key file later; no final keys were generated | Read Pump runbook and offline ALT commands; keep all broadcast flags false |

Storage is NOT blocked: the already-authorized Supabase project is reused solely through new isolated INDUSTRY staging buckets (`industry-staging-browser-captures`, private; `industry-staging-icons`, public). No other project's database or objects were modified. Credentials remain in ignored private configuration and were never printed.

OpenAI is usable. The supplied gpt-6-luna key passed bounded real calls from the local staging worker. A hosted worker test remains dependent on host authorization. No subscription/account purchase was made. No public staging URL exists. Docker was unavailable on this PC, so native PostgreSQL/process simulation was used; container startup remains a target-host acceptance check.
