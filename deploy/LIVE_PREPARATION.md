# INDUSTRY live deployment preparation — October 6

Prepared, NOT deployed. No transaction broadcast and no wallet signing. **Latest October 6 update:** authenticated Railway and Supabase access is confirmed. All three Splice deployments are stopped and old GitHub autodeploy sources disconnected, as requested by the owner. Temporary domain is memesplice.fun. The owner chose existing Supabase reuse, with isolated industry schema. See RAILWAY_CUTOVER.md for actual state and rollback references. The older infrastructure audit below is historical and superseded.

Files: compose.production.yaml, deploy/production.env.example, deploy/Caddyfile.production. The separate Compose project must be named industry. Production uses dedicated TLS PostgreSQL, explicit HTTPS origin, persistent web/database broker/worker/collector, OpenRouter, private capture storage, separate service secrets and default-disabled Pump broadcasting. Production environment files are excluded from Git and Docker build context. Never copy the local demo database or blindly flip APP_MODE in the running local instance.

Infrastructure audit: MemeSplice/.env.local contains Supabase REST credentials; this is not a PostgreSQL login. MemeSplice/.openai/hosting.json describes old static out/ hosting. Its PRODUCTION-READINESS.md explicitly says a persistent production Node host was not provisioned. No Docker or provider CLI was found on PATH. Owner will buy a new INDUSTRY domain. No Splice resource or data was deleted or modified.

Owner-designated public Treasury and Collector are in the production example. Collector key was previously verified privately. Never put its key in a container image; compose.pump.yaml mounts the operator-provided file into the database broker only. Server file permissions must permit the container's node account to read it, not the public web service. Do not copy secrets to a remote host before its identity/access is verified.

Mainnet read-only check: Pump RPC genesis and required executable programs passed through existing pump-lookup tool. qa/pump/alt-plan.json is an unsigned plan with 16 accounts and a 1090-byte sample launch. It creates no live table. Regenerate it immediately before separately approved signing because its slot-derived address is time-sensitive. No arbitrary wallet allowlist or production broadcast approval was invented.

Remaining gates:
1. Identify authorized persistent host/account and access. Existing static Sites hosting is not evidence of background Node process support.
2. New domain and DNS; set PUBLIC_APP_URL, INDUSTRY_DOMAIN and PUMP_METADATA_BASE_URL to the final HTTPS origin.
3. A clean dedicated PostgreSQL database and TLS credentials; backup Splice before any future replacement. Do not run INDUSTRY migrations against existing Splice public tables.
4. Configure isolated Storage buckets/policies, session/worker/broker secrets and protected operational signer on the chosen host.
5. Validate docker compose config, build and staging/restore/worker tests on the actual host. Docker is absent locally; deployment syntax has only been source-reviewed, not executed.
6. Provision/verify ALT with separately approved signing, then prepare/simulate one controlled launch. Public wallet access still requires a separate product change from the current restricted acceptance allowlist.
7. Enable broadcasts only in reviewed live deployment. No real token has been launched in this preparation.

Browser capture limitation: the deployment currently uses fetch; no Linux browser executable is included. Real screenshot capture needs an isolated browser configured and verified on the target host before claiming full hosted parity.
