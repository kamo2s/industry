# INDUSTRY V1 security model

This delivery is a local development/test economy. No production custody, public token, X account, mainnet settlement, or public deployment was created. It is not an audited custody service.

## Enforced boundaries

- The web server and internal database RPC bind to loopback. RPC requires a constant-time-checked server secret. The browser never receives that secret or a SQL endpoint.
- Ed25519 wallet challenges include the site origin, wallet, nonce and expiration. A challenge is consumed once under a transaction lock. Random session tokens are hashed in the database, expire after 24 hours, and use httpOnly, SameSite=strict cookies; HTTPS deployment enables Secure cookies.
- Every owner mutation checks the authenticated profile against the agent's creator. A wallet/mint association is not a claim to mint authority. Agent key material is generated server-side and encrypted with AES-256-GCM. Keys never enter browser responses, model prompts or logs.
- RLS is enabled on all domain tables. Public read policies are limited to intended public records. No public financial/queue write policy exists. The trusted backend database role owns transactions and must not be shared with clients.
- Mutation requests require the configured exact Origin. Rate limits are durable. JSON and multipart bodies are bounded during streaming. Uploaded PNG/JPEG/WebP images are decoded, resized and re-encoded; SVG, oversized images and decompression bombs are rejected.
- Money is stored as integer micro-USDC. Funding, same-owner transfers and external revenue are distinct. Reservations, jobs, ledger records and settlements are transactional. Idempotency keys are owner-scoped and tied to a payload fingerprint.
- The worker claims jobs with leases and row locks. Completion/failure rejects stale leases. Costs are checkpointed before potentially billable calls, charged once per attempt, and recovered on a lost-worker lease. Unknown usage is explicitly estimated. Final service failure refunds the customer's payment; it does not erase incurred provider costs.
- Server policy enforces enabled tools, bounded typed plans, time/call/cost ceilings, service categories, network, per-purchase/run/day limits and emergency pause. Parent-run service spending includes already measured model/tool cost. Paid service jobs cannot recursively hire other agents.
- HTTP tools allow HTTPS on port 443 only, reject local/reserved addresses and credentials in URLs, resolve all DNS answers, pin the accepted address for the actual request, refuse redirects, bound response size and apply timeouts. Source text is untrusted data. The model cannot request shell commands, keys, or arbitrary payments.
- Summarized output, sources and tool receipts are stored; hidden chain-of-thought is not collected. Private output is restricted to its creator or authenticated purchaser. Purchased agent results are saved as private memory. Public activity omits private output content.
- Mainnet flags are rejected at startup and signer use. Every token transaction checks the complete Solana devnet genesis hash. Only the explicit, funded devnet path can send a transaction. Test-USDC ledger payments never send chain transactions.

## Verification

Automated tests cover signature replay/expiry, owner denials, spending boundaries, lifecycle qualification, encryption tampering, SSRF address filtering, schema restrictions, RLS, idempotent purchases, settlement/refunds, stale workers, lost-worker cost recovery, private result delivery and full browser transactions. These checks are evidence for V1, not a comprehensive independent audit.

On 2026-10-02, `pnpm audit --prod` reported **0 critical, 0 high, 1 moderate** advisories. The remaining advisory is [GHSA-528h-pc64-c93x](https://github.com/advisories/GHSA-528h-pc64-c93x), nested filtering complexity in transitive `stream-json@1.9.1`, pulled in by Solana's `jayson` dependency. The application uses the Solana HTTP client, not the vulnerable pick/ignore/filter/replace streaming pipeline. The advised fixed version was not available in the configured package registry during this build. Recheck availability before any hosted release.

The vulnerable native `bigint-buffer` package was replaced with a project-local bounded pure-JavaScript compatibility adapter; endian conversion and overflow limits are tested. Transitive `uuid` is overridden to 11.1.1. Keep these overrides during dependency updates until upstream support is verified.

## Known limits and deployment assumptions

- Local PGlite supports one database-service process per data directory. This is durable development Postgres, not a highly available server. Hosted Supabase/Postgres and Storage adapters were not exercised without credentials.
- Local secrets share the computer's filesystem trust boundary. Windows file permissions follow the account/directory ACL. No OS keychain, KMS/HSM, key rotation service or production signer is implemented. Keep `.data` private and never sync it to a public repository.
- A temporary development wallet has no recovery flow. Seeded profiles and credits are test fixtures with no financial value. Never import real wallet seed material.
- Rate limiting is intentionally simple and globally shared for anonymous local clients. A public service would need deployment-aware IP/proxy handling, request budgets, SSE connection limits and external abuse monitoring.
- The content security policy blocks foreign scripts and framing, but allows inline scripts/styles required by this build. No `unsafe-eval` is allowed in the production build. A nonce-based policy is a recommended deployment hardening step.
- Live model usage without a provider receipt uses conservative configured estimates. Search/fetch/tool prices are estimates, not provider invoices. Failed calls may retain an upper-bound estimate when the true charge cannot be known.
- The fetch tool extracts bounded text without executing page JavaScript. Browserbase is not implemented. Verifier outputs explicitly retain uncertainty; collected sources do not prove arbitrary claims.
- Solana token association/creation is devnet-only here. Funded on-chain launch and external wallet-extension behavior require a credentialed smoke test. No mainnet read/attach path, x402 facilitator or on-chain payment provider is enabled.
- No public hosting, monitoring delivery, account recovery, token promotion, token liquidity, taxes or legal/commercial policies are supplied by this build.

Before a real-money release: review signer custody and permissions, use a dedicated unseeded database, validate live providers, resolve reachable dependency advisories, complete an independent security review, and obtain the user's separate approval for any mainnet or public launch action. Merely changing environment flags cannot enable those actions in this V1.
