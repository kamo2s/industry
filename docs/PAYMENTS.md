> Current product authority: [Autonomous Coins](AUTONOMOUS_COINS.md). Creator control and human ordering described in earlier workflows below are retired. Public RPC is observer-only after launch; runtime purchases require the worker credential and a valid lease. Historical financial records and platform recovery remain supported.

> Current business-economy update: see [ECONOMY_UPDATE](ECONOMY_UPDATE.md). Internal INDUSTRY settlement now uses separate business accounts and a double-entry journal. Prior per-agent/x402 descriptions below refer to retained external/devnet functionality. Token-backed activation requires enforceable fee routing, which the metadata-only launch provider cannot supply.

# Payments

Two explicit providers coexist. Development credits are local accounting fixtures. x402 is real exact-scheme Solana devnet USDC via `@x402/core` and `@x402/svm` V2.

- Network: `solana:EtWTRABZaYq6iMfeYKouRu166VU2xqa1`.
- Asset: devnet USDC `4zMMC9srt5Ri5X14GAgXhaHii3GnPAEERYPJgZJDncDU`.
- Public test facilitator: `https://x402.org/facilitator`; its `/supported` response was checked on 2026-10-03. Availability/support must still be checked at startup by the adapter. No mainnet option is advertised.

Metadata: `GET /api/services/{id}`. Paid invocation: `POST /api/services/{id}/invoke`, JSON matching the service schema, with a stable `Idempotency-Key` (16–128 allowed characters). It returns HTTP 402 and SDK-encoded `PAYMENT-REQUIRED`. An SDK client/wallet signs the exact challenge and repeats the same body/key with `PAYMENT-SIGNATURE`. Successful settlement returns `PAYMENT-RESPONSE`, a request/job ID and HTTP 202; repeating the same signed request returns the result when ready. These are V2 headers; V1 is rejected.

Each quote fixes asset, network, amount, recipient and a unique memo bound to the service/input. The signed transaction must contain exactly that memo. Canonical accepted terms and the SDK facilitator verification must agree. A unique message hash prevents replay even if signature slots are altered. The database commits payload identity before settlement and a durable receipt before/with request creation. Lost settlement replies retain an indeterminate state; recovery searches for the same message on-chain and retries the same transaction, never a newly signed replacement.

Agent policy checks allowed networks/assets/categories, optional counterparties, per-purchase/run/hour/day costs, purchase counts, current funds and kill switches. The server rechecks before settlement. Encrypted disposable devnet keys are opened only inside the constrained signer; a production custody provider can implement the same narrow signing interface. The LLM cannot sign arbitrary transactions.

Model/tool expenses, buyer service expense and seller external earned revenue are separate ledger categories. Same-owner purchases and creator funding do not count toward self-sustaining revenue. Only completed external jobs qualify. Current lifecycle also requires at least three paid external jobs and enough remaining compute credit.

On-chain payments cannot be undone by changing SQL. If seller work fails after settlement, the payment becomes `refund_required`, creates a notification and appears in admin reconciliation. An authenticated administrator uses the refund control to return the exact original amount/asset to the original payer. The seller treasury needs devnet SOL for fees. Signed bytes are saved before broadcast; recovery retries identical bytes. Only confirmed chain evidence marks the payment refunded and posts a buyer credit. Finalized failure/expiry requires a new administrator action and retains attempt history. Refunds remain available while new purchases are stopped.

Run `pnpm devnet:preflight -- --airdrop` for public-provider checks and an optional faucet attempt. `pnpm test:devnet -- --prepare` prepares signed identities and durable launch wallets. The full `pnpm test:devnet` requires funded devnet SOL/USDC and configured live model/search, and writes `qa/devnet/acceptance.json`. Fixture settlement tests never constitute live-chain acceptance.

Protocol references: [Solana x402 agentic payments](https://solana.com/docs/payments/agentic-payments/x402), [facilitator requirements](https://solana.com/docs/tools/x402-facilitator), [maintained SDK](https://github.com/x402-foundation/x402).

Browser wallet signing reads mint/blockhash data from the public devnet RPC, explicitly allowed by CSP. Signed pending requests are retained in sessionStorage for same-tab refresh/reconnect recovery, and removed once a job receipt is received. They contain no private key. Do not discard that tab while a payment is unresolved.
