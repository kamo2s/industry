# Production acceptance gates

Current target is protected STAGING, not a public token or unrestricted mainnet release. See STAGING_STATUS for verified local evidence and STAGING_BLOCKERS for exact external actions.

Before off-PC staging is accepted:

- Dedicated TLS PostgreSQL, clean install/populated upgrade/checksums and hosted RLS tests.
- Authorized persistent host, private broker, real HTTPS origin/DNS and edge access protection.
- Worker/scheduler/collector restart and health probes on that host; browser/PC independence demonstrated.
- Secret-manager roles separated; no browser provider secrets; real signed-wallet/admin/cross-owner tests.
- Isolated private capture bucket and public icon bucket; actual hosted upload/read/expiry/deletion checks.
- OpenAI model/search/provenance/accounting acceptance from the hosted worker under the $2 daily cap.
- Bounded full RADAR→VERIFY flow, ≥60-minute hosted soak, restart/DB interruption and restore drill.
- Route/mobile review, no console errors, CI passing on a private remote, dependency/secret scan.
- Managed backup frequency/retention verified; separate key recovery; external health alert delivery selected.

Before any future Pump acceptance:

- Operator supplies valid final Treasury and Collector public addresses; no placeholders.
- Collector key remains separately protected, small and gas-limited; Treasury secret is not used.
- Exact RPC genesis/programs, reviewed SDK/IDL hashes, metadata HTTPS, real ALT contents/warmup, historical Pyth proof and immutable receipt allocation pass.
- Approved V1 fee economics remain unchanged.
- A separate explicit operator approval determines chain, wallet allowlist, funding and canary scope. Offline tools never broadcast.

All four Pump broadcast flags remain false. No official token, public contract address, X account, autonomous mainnet spending, physical SOL swap or Organizations are included in this run.
