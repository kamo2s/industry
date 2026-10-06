# INDUSTRY hosted cutover — October 6, 2026

Supersedes the earlier plan to reuse Splice services/database. The owner created dedicated INDUSTRY projects.

## Deployed resources

- Private repository: https://github.com/kamo2s/industry, branch main.
- Railway project: 2e073f0f-556d-49d4-ab5a-49eaf82fe211, production environment 2b2711c1-7623-4681-8a13-3e1c8944d6db.
- industry-web: 59d22645-35e5-453b-94b5-031529e01189; public HTTPS, port 3000.
- industry-database: 3fe4d994-a054-42f1-b0e6-e2e337bb4986; private RPC broker, port 4318.
- industry-worker: 23edd25a-e2f2-462a-95c1-ca5184cc1f53; continuous background worker.
- Supabase: zymgxltobmiknyafwlqr; private industry schema, verified TLS using the official public CA in supabase-ca.crt. All 17 migrations applied. No local fixtures imported.
- Private storage: industry-production-icons and industry-production-browser-captures.
- Temporary custom domain: https://memesplice.fun. Cloudflare CNAME now targets l6qocp1r.up.railway.app; ownership TXT updated for the new Railway service. Certificate verification is checked separately after propagation.
- Fallback: https://industry-web-production.up.railway.app.

All three services deploy from the private repository. Railway configuration is stored in service settings, not unsupported config-as-code files. GitHub Actions workflow remains local because the current OAuth grant lacks workflow scope; Railway builds independently.

## Verification and limits

310 tests, lint and typecheck passed. All three Railway Docker builds/deployments succeeded. HTTPS fallback health verified database ok and worker online; homepage, Coins, Marketplace and Launch returned 200. Production uses real empty states, not copied demo metrics. Chromium is installed in the worker image; actual hosted browser capture and paid Coin-to-Coin execution are not yet acceptance-tested.

Separate role credentials, production origin and private RPC are configured. Provider daily cap remains $2. Pump launch, collection, reconciliation and mainnet broadcast flags remain false. No collector service/signer is uploaded; no transaction is signed or broadcast. New production backup/restore and soak evidence remain outstanding.

## Historical Splice shutdown

Previous project genuine-truth (25cd4e01-b64b-4b16-9746-1f689427c1e3) had its three deployments stopped and old GitHub sources disconnected. This cutover does not delete historical Supabase data or Pinata pins. The owner subsequently chose new dedicated projects. Do not reconnect Splice automatically. A rollback must explicitly choose a known deployment and restore its compatible domain/environment configuration; never point INDUSTRY at the old database.
