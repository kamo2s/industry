# Incident response

Preserve timestamps, environment, job/run/trace IDs and immutable receipts. Never paste keys, prompts or private screenshot data into an incident ticket. Admin controls require an authenticated allowlisted wallet; environment switches take precedence.

| Incident | Immediate action | Recovery |
| --- | --- | --- |
| OpenAI runaway cost | Pause providers in Admin or PROVIDER_EXECUTION_PAUSED=true; then pause affected agents | Inspect global reservations, model/search attempts and compute postings. Reconcile uncertain usage; do not delete it. Lower limits before one bounded canary. |
| Worker loop / scheduler duplicates | AGENTS_ENABLED=false or EMERGENCY_PAUSE=true; stop worker if necessary | Inspect schedule idempotency and leases. Preserve queue/history. Restart one worker first; wait 90 seconds for abandoned leases. |
| Database unavailable | Leave payments/providers paused; inspect host/DB health | Restore connectivity, verify migration checksums and journal invariants, then recover durable leases. Never switch automatically to PGlite. |
| Ledger invariant failure | EMERGENCY_PAUSE=true; stop all financial mutation | Snapshot, reconcile postings against balances and immutable source receipts on a restored copy. Do not repair by arbitrary SQL credits. |
| Stuck service settlement | Pause affected service/business | Reuse existing request/payment identity. Internal failed work refunds escrow; unknown on-chain outcomes require chain reconciliation. Never call an unconfirmed refund completed. |
| Browser capture leak concern | Make the affected business/output private and stop capture execution | Application reads recheck visibility immediately. Inspect private bucket policy and object access, remove affected objects, rotate storage credential if compromised; retain only safe incident metadata. |
| Wallet-auth issue | Restrict staging edge access; stop mutations | Revoke affected hashed sessions, inspect one-use challenges/origin settings and rotate session/RPC secrets as appropriate. Re-authenticate wallets. |
| Pump routing mismatch | Keep all Pump launch/collection flags false; pause token-backed business | Independently verify canonical on-chain sharing state; never accept metadata as routing evidence. |
| Collector problem | PUMP_FEE_COLLECTION_ENABLED=false and PUMP_MAINNET_COLLECTION_ENABLED=false | Preserve prepared/signed attempts. Reconcile exact signatures before later operator-approved retry. |
| Compromised operational key | Disable collection/launch, isolate signer process, restrict ingress | Operator rotates/revokes custody authorization under a separate reviewed process. Do not generate final keys or send funds as an automatic repair. |

Important switches: EMERGENCY_PAUSE, AGENTS_ENABLED, AUTONOMOUS_PAYMENTS_ENABLED, TOKEN_LAUNCH_ENABLED, PROVIDER_EXECUTION_PAUSED, PUMP_LAUNCH_ENABLED, PUMP_MAINNET_LAUNCH_ENABLED, PUMP_FEE_COLLECTION_ENABLED and PUMP_MAINNET_COLLECTION_ENABLED. MAINNET_ENABLED stays false. Switching off future work cannot revoke already accepted external calls or submitted transactions.

Admin alerts: stale worker/scheduler, high queue, dead letters, ledger invariant failure, provider cap/pause, capture retention/upload failures, collector failure and routing failure. Database failure makes the health API unavailable; an external host probe must alert on that absence. No external alerting account was configured or purchased.
