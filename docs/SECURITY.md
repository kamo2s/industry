> Current product authority: [Autonomous Coins](AUTONOMOUS_COINS.md). Creator control and human ordering described in earlier workflows below are retired. Public RPC is observer-only after launch; runtime purchases require the worker credential and a valid lease. Historical financial records and platform recovery remain supported.

> Current authority: [Product Standard](../PRODUCT_STANDARD.md) and [Master completion status](MASTER_COMPLETION_STATUS.md). Distinguish the retained external/devnet signer path from the pooled Pump fee treasury: no fee-treasury private key is used, and normal business payments are internal journal transfers.

# Staging security verification — 2026-10-04

Current baseline: explicit environment/origin validation, fail-closed hosted persistence, TLS PostgreSQL, separate service credentials, protected edge ingress, route/IP/wallet limits, global provider reservations, private capture storage and unchanged financial gates. See `qa/staging/security.json`, `storage.json`, `http.json`, `recovery.json` and the completion report for evidence and limits.

Migration 011 revokes raw private table reads and ledger function execution from browser roles. Wallet-owner/admin authorization stays in the broker; Supabase service access is not delegated to browsers. Native PostgreSQL tests cover clean install, populated upgrade, RLS roles, anonymous/owner/cross-owner/admin behavior, nonce replay and session expiry. Hosted database policies still require target-host verification.

The dependency audit found two high-severity advisories in transitive TOML 3.0.0 used by Anchor's local configuration parser. A locked TOML 4.2.0 override resolves both; compatibility parsing and the Pump tests pass. The latest full registry audit reports zero known advisories. Public research text cannot invoke an administrator, ledger, ownership or routing API: AgentRuntime exposes only bounded tools and its current lease's operations. DNS-pinned HTTPS, denied redirects/private ranges, bounded schemas/uploads and provider failure simulations remain covered by tests.

Secret scanning found no configured credentials in source/browser/generated text artifacts; private acceptance configuration remains ignored. The soak recorder's old unhandled PostgreSQL error printed an internal client diagnostic during the outage; a sanitized pool error handler now prevents that diagnostic/crash. PostgreSQL cancel identifiers in that terminated connection are transient, not application credentials. Do not preserve raw provider/client diagnostics in shared logs.

PostgreSQL connection strings cannot override certificate verification or UTC/timeouts through URL options. The adapter removes conflicting parameters and enforces trusted TLS outside the explicitly enabled loopback staging simulation. Regression tests inspect the actual pg client connection parameters for SSL downgrade attempts.
## Pump security addition (current)

The official Pump adapter independently verifies locked V2 fee sharing; the legacy metadata-only provider remains fail-closed. No Pump mainnet or collection flags were enabled. Narrow Pump allowlist/approval gates are separate from the general mainnet switches, which remain prohibited. No treasury private key is required.

`/collector` requires a distinct credential and accepts only bounded ticks. It is not reachable through AgentRuntime's operation allowlist. The dedicated scheduler delegates signing and receipt verification to the private DB service. The local supervisor strips the operational key path, collector credential, oracle key and administrative secrets from the AI worker. Preserve these process boundaries in deployment; do not give a model arbitrary shell or filesystem execution.

The mint recovery signer is encrypted separately, expires after 24 hours, and is erased on verification/cancellation. The gas signer is a distinct small wallet. Prepared/signed transaction bytes are durable before broadcast. Never delete unknown attempts or replace a mint after a timeout. Exact signatures, program instructions, canonical routing accounts, genesis, finality, quote units and balance evidence are checked.

Pyth valuation trusts only the allowlisted HTTPS Hermes service, with feed, timestamp, confidence and precision checks. It is not an on-chain proof of the oracle binary attestation. Unavailable historical pricing stays PENDING_CONVERSION. Price and raw receipt evidence are immutable after successful conversion; retry keys and balanced SQL postings prevent duplicate credit. No DEX price fallback or physical swap exists. See [PUMP_INTEGRATION.md](PUMP_INTEGRATION.md) for current protocol-governance limitations and acceptance scope.

# Security boundaries

The business economy uses permanent business-owned internal accounts. Every monetary mutation is backed by immutable, balanced journal postings; database constraints verify account units, nonnegative available balances and the cached-balance/journal agreement. Service reservations move into escrow and settle or refund atomically with idempotency protection. Internal hiring does not invoke the external signer or require per-agent wallets. Unexpected measured compute overage is explicit debt and blocks new execution until funded.

New watchlists, notification read state and account actions remain scoped to the authenticated profile. Worker supplier-result access requires a matching parent request. Token-backed activation requires verified enforceable provider fee routing; the current metadata-only adapter fails that check. No Organizations or mainnet treasury spending were added. Development fee receipts are administrator-only simulations, not verified on-chain receipts.

Wallet connection is not authentication. Authentication requires a five-minute server challenge, Ed25519 signature, matching wallet and single-use nonce consumed under a transaction lock. Sessions expire after 24 hours, are stored by hash and use HttpOnly/SameSite cookies (Secure on HTTPS). Mutations require exact origin except the public x402 invocation, which uses a signed payment rather than cookie authority.

Every owner operation checks the authenticated creator; token/creator identity is immutable in PostgreSQL. Administrators must authenticate an address in `ADMIN_WALLETS`; there is no public admin signup. Kill-switch changes, service controls, compute allocations and termination are audited. Never put a service role, model key, RPC credential, signer key or private RPC secret in a NEXT_PUBLIC variable.

The private RPC service requires a 32+ character `INTERNAL_API_SECRET`; live workers use a distinct `WORKER_API_SECRET`. Bind to loopback locally and an unexposed private container interface in deployment. Use TLS if crossing hosts. Rate limits apply to authenticated wallet and hashed client IP. Trust an IP header only when ingress strips and overwrites it. JSON, upload, image dimensions, output, schema, URLs, tool calls and deadlines are bounded.

Treasury key material is AES-256-GCM encrypted with a separate 32-byte key. Back up the encryption key independently from database backups. Local `.data` and `.env` are ignored by Git and Docker. The worker receives public treasury data only. The constrained signer checks a server-owned quote and durable policy reservation; it cannot be invoked as a generic tool. Mainnet is hard-locked pending a separate approved deployment.

Research pages cannot override system policy. DNS-pinned fetching blocks localhost/private/link-local/metadata addresses, URL credentials, custom ports and redirects. Browser contexts execute no page JavaScript and load no unapproved subresources. Response and time limits prevent unbounded downloads. Service JSON schemas reject external references and regular-expression features; parameterized SQL handles application values.

Payment security includes V2-only decoding, exact asset/network checks, signed request-bound memo, SDK verification, message-hash uniqueness, durable settlement/recovery and idempotent ledger/request creation. Indeterminate settlement is never treated as an unpaid failure. No incoming Helius/provider webhook endpoint is exposed; unsigned webhooks therefore cannot authorize state changes.

Audit tools: `pnpm security:scan`, `pnpm audit --prod`, `pnpm test`. Production dependency audit after updating the legacy Solana JSON-RPC dependency reported zero known advisories. A passing audit is not a guarantee; review dependency updates and custody/mainnet activation separately.

Before production: live devnet acceptance, fresh managed database/RLS verification, administrator allowlist, HTTPS/private networking, secret backup/rotation, provider budgets, monitoring and documented refund operations. See IMPLEMENTATION_STATUS for unverified external dependencies.

