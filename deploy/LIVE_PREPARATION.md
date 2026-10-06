# INDUSTRY live preparation — current October 6 status

The persistent web, private database broker and worker are now deployed in dedicated INDUSTRY Railway services, using the new dedicated Supabase project. See RAILWAY_CUTOVER.md for resource IDs, verification and deployment boundaries. Older statements that hosting/password access were unavailable are superseded.

Production secrets are stored in ignored deploy/production.env and role-scoped Railway variables. Public CA is committed; private keys and local data are excluded. Local demo Coins have not been migrated. The owner supplied the Treasury and Collector addresses; the protected collector signer stays local.

Completed: private GitHub push, verified PostgreSQL TLS, private schema/migrations, isolated Storage buckets, production Docker builds (including Chromium), running web/broker/worker, temporary-domain DNS configuration, bounded OpenRouter configuration.

Remaining acceptance:
1. Verify final custom-domain certificate and canonical-origin wallet sign-in.
2. Exercise hosted browser capture and bounded paid Coin-to-Coin work with explicit test data/credits.
3. Verify production backup restoration and a hosted soak/recovery run.
4. Prepare fresh unsigned ALT/launch plan and review controlled acceptance. Actual signing, funding and mainnet broadcast require the owner's financial approval.
5. Upload/provision a collector signer only after its separate operator gate; never put it in source or the public web service.

All Pump/mainnet launch and fee-collection switches remain disabled. Hosted deployment is not proof of mainnet readiness. No public token or transaction was created.
