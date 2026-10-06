# Pump integration — implementation and operator handoff

Updated October 3, 2026 (America/New_York). The local implementation is complete; controlled chain acceptance remains unperformed. No public token, platform token, or mainnet transaction was launched. General mainnet and autonomous mainnet-spending switches remain locked.

## Official dependencies and sources

Direct packages are pinned to `@pump-fun/pump-sdk@2.0.0` and `@coral-xyz/anchor@0.31.1`; the lockfile also pins transitive dependencies. The SDK's Pump, Pump Fees and Pump AMM IDLs exactly match official `pump-public-docs` commit `cb188ce08b5069196eef1f3e4a0c43b70099793b`. See `qa/pump/protocol-review.json` for SHA-256 comparisons. `scripts/pump-protocol-review.ts` reproduces the read-only review. No Pump frontend endpoints are used.

| Program | Address | Instructions used |
| --- | --- | --- |
| Pump | `6EF8rrecthR5Dkzon8Nwu78hRvfCKubJ14M5uBEwF6P` | `create_v2`, `distribute_creator_fees_v2` |
| Pump Fees | `pfeeUxB6jkeY1Hxd7CsFCAjcbHA9rWtchMGdZ6VojVZ` | `create_fee_sharing_config`, `update_fee_shares_v2` |
| Pump AMM | `pAMMBay6oceH9fJKBRHGP5D4bD4sWpmSwMn52FMfXEA` | `transfer_creator_fees_to_pump_v2` |
| Mayhem account required by creation SDK | `MAyhSmzXzV1pTf7LsNkrNwkWKTo4ougAJ1PPg47MD4e` | No Mayhem mode enabled |

Official references: [coin creation](https://github.com/pump-fun/pump-public-docs/blob/cb188ce08b5069196eef1f3e4a0c43b70099793b/docs/instructions/COIN_CREATION.md), [creator fee sharing](https://github.com/pump-fun/pump-public-docs/blob/cb188ce08b5069196eef1f3e4a0c43b70099793b/docs/instructions/CREATOR_FEE_SHARING.md), [public IDLs](https://github.com/pump-fun/pump-public-docs/tree/cb188ce08b5069196eef1f3e4a0c43b70099793b/idl), [Pyth fetching](https://docs.pyth.network/price-feeds/core/fetch-price-updates).

## Launch composition and proof

The signed version-0 transaction contains, in order:

1. Compute-budget limit of 600,000 units; no priority price instruction.
2. Official SDK `createV2Instruction`: launching wallet is creator and payer, newly generated mint is the second signer, SOL quote, mayhem/cashback/holder rewards all false.
3. `createFeeSharingConfig`, initially under the authenticated creator.
4. `updateFeeSharesV2`: sole shareholder is the configured INDUSTRY treasury at 10,000 bps.

No initial buy is included. Name is limited to 32 characters, symbol to the product's 10 characters, HTTPS metadata URI to 200 bytes. Instruction bytes, order, program IDs, writable/signing account metas, creator, mint and treasury are rebuilt through the official SDK and compared before signing. The server simulates before returning a transaction. The browser requests one Wallet Standard transaction signature; the server independently verifies the complete returned message and both signatures before submission.

The full transaction needs an address lookup table. A reusable table containing 16 common SDK-derived accounts produces a **1,090-byte** transaction with maximum name, symbol and URI lengths, below Solana's 1,232-byte packet limit. This was verified locally, not submitted to chain. `scripts/pump-lookup-plan.ts` emits an unsigned setup plan; it does not create a table. An operator must provision a real table on the selected chain, wait for activation, and set `PUMP_LOOKUP_TABLES`. Missing/oversized tables fail closed. The launch is never split into partially configured transactions.

At finalized confirmation, the service independently reads the mint, bonding curve, sharing config and canonical pool where present. It checks program owners, expected PDA/mint/creator, active sharing-config version 2, `adminRevoked=true`, exactly one 10,000-bps treasury shareholder, supported quote identity, standard coin flags, curve creator pointing to the sharing PDA, and pool routing where present. Only then are the immutable business, official token identity and ledger accounts created. Initial accounts have zero credit: fee routing verification does not invent funding. A funded operational business may then run under the existing runtime policy.

Failed proof keeps the operation unactivated with **FEE ROUTING VERIFICATION FAILED**. No private method is exposed that accepts browser-asserted VERIFIED state. The collector re-verifies routing later. Revocation prevents ordinary creator/admin edits; it does not promise immunity to Pump program governance, upgrades or protocol-level exceptional interventions.

## Signers and identity

The user never gives INDUSTRY a private key. A server-generated mint keypair is AES-256-GCM encrypted using the existing separate `WALLET_ENCRYPTION_KEY` solely to make the same launch recoverable. Its encrypted value is erased on verification/cancellation, or after 24 hours by the collector scheduler / next preparation. Copies used for signing are wiped after use. Prepared and signed transactions remain as audit/recovery evidence. Backup retention must also age out encrypted ephemeral material; erasure of the live row cannot erase old backups.

`businesses` stores immutable `token_mode=PUMP`, mint and creator wallet. `pump_businesses` also protects network, treasury, sharing PDA and quote identity with a database trigger. Brain/template edits preserve that business ID, its accounts and all receipts. Pump businesses do not receive per-business blockchain treasury keys.

## Collector architecture

`apps/collector/index.ts` is a separate scheduler, outside AgentRuntime. It calls a private `/collector` endpoint with a distinct 32-character credential. The trusted database service executes `PumpCollector`; the endpoint accepts only a bounded tick, never arbitrary instructions/destinations. The local supervisor strips collector secrets and the operational key path from the AI worker and web processes. Production process isolation must preserve the same separation. Compose provides the optional `pump` scheduler profile; `compose.pump.yaml` mounts the protected collector key file read-only into the DB service only. The override enables no chain flags and has not been deployed in this task.

The signing wallet is `INDUSTRY_FEE_COLLECTOR`, loaded from an operator-managed JSON keypair file. It pays network/rent costs and is explicitly forbidden from being the treasury. **The pooled treasury private key is not required anywhere in this integration.** Final destinations come from independently verified Pump sharing state.

Each tick takes a database lease and processes a bounded batch. It re-verifies routing, reconciles third-party transactions, resolves its own outstanding signed attempts, observes pending vault balances, then considers spending. A canonical decoded pool determines graduation; bonding-curve completion alone is not treated as a graduated pool. Before graduation it calls V2 distribution. When AMM vault funds exist it includes the permissionless AMM V2 sweep followed by V2 distribution in one atomic collection transaction. Thus an INDUSTRY-triggered sweep cannot land alone. If a third party previously swept, the observed bonding vault is distributed on the next eligible run.

Simulation, packet size, gas balance, per-transaction cost, rolling-day cost, minimum collectible SOL and cost/receipt ratio are checked before signing. The signed bytes and signature are persisted **before** broadcast. A timeout retains an unknown attempt; only identical bytes are rebroadcast while valid. New attempts require finalized success/failure or expiry. Emergency pause and the separate collection flags gate every broadcast.

Admin → Pump Fees → Collect Now sets a durable request consumed by this same pipeline, normally within the scheduler's 30-second wake interval. It does not send SOL to Pump or bypass cost limits. Automatic business collection defaults to five-minute intervals, up to three businesses per batch. Defaults are development limits, not chosen production policy.

## Receipts and accounting conversion

An archival, trusted Solana RPC is required. The reconciler pages finalized signatures involving the immutable sharing config, persists discovered signatures/cursors, and retries unavailable transactions without dropping them. Authentic Pump Anchor event CPIs, event authority, business mint/PDA/creator/shareholder/quote, successful finality, and treasury balance increases substantiate each receipt. The initiator need not be INDUSTRY. Unproven or imprecise balance evidence is withheld for reconciliation.

Each immutable receipt includes network, mint/business, sharing config, transaction signature, instruction/event indexes, slot/block timestamp, quote mint/decimals, original raw amount, normalized amount, treasury, operation and proof. A unique reconciliation key plus SQL uniqueness, row locks, atomic balanced postings and allocation keys prevent duplicate ingestion/conversion. Original native values are never replaced by USD values.

For SOL, `PUMP:<network>:<native-mint>` custody postings record the native receipt. The physical SOL remains in the pooled treasury. **USD conversion is accounting only. No swap, DEX trade, USDC minting or on-chain allocation transaction is constructed.** Mainnet credits use existing `USDC_CREDIT` accounting units; devnet receipts use explicitly test-valued `TEST_USDC`.

Pyth SOL/USD feed: `ef0d8b6fda2ceba41da15d4095d1da392a0d2f8ed0c6c7bc0f4cfac8c280b56d`. The trusted HTTPS Hermes endpoint must be either `https://pyth.dourolabs.app/hermes` (default) or `https://hermes.pyth.network`; redirects and arbitrary replacement endpoints are rejected. Configure `PYTH_API_KEY` as required by the current Hermes service.

The price policy is **receipt-time valuation**: request the first oracle observation at/after the chain block timestamp, at most 60 seconds later. Reject a future observation beyond five seconds of local time, nonpositive values, wrong feed, invalid exponent, or confidence wider than 1%. Delayed reconciliation and retries use the original receipt time, not a later market quote. This requires historical oracle coverage for the receipt interval. A missing historical observation remains pending for operator investigation; it is never silently valued using a DEX spot or today's price.

Store the exact integer price and exponent, confidence, feed ID, source, publication/retrieval timestamps, response SHA-256, and resulting integer USD micro-value. The trust boundary is authenticated HTTPS to the allowlisted oracle service; this implementation does not claim on-chain verification of the Hermes binary attestation. BigInt arithmetic floors only the final USD micro-value; sub-micro rounding remains visible through the original receipt and proof.

Unavailable/stale/untrusted prices leave **PENDING_CONVERSION** and issue no USD balance. The scheduler retries up to 25 pending receipts per tick, with at least a minute between failed attempts. Successful pricing becomes immutable, then the resolved USD Fee Allocation Policy splits the receipt across cumulative phase boundaries and allocates Compute, Operating and Platform shares in one DB transaction. Approved V1 defaults apply when no operator override exists; invalid overrides fail closed for retry. The first $20 uses 60/40/0, the next $80 uses 40/60/0, and value above $100 uses 20/65/15. See [FEE_ROUTING.md](FEE_ROUTING.md) for exact rounding and immutable allocation history. Fees remain excluded from external service revenue and self-sustaining metrics.

Other quote assets retain their own raw units and receipts; V1 UI launch and automatic cost policy are SOL-only. Unsupported USD oracle mapping stays pending instead of treating an arbitrary token as SOL or USDC.

## Configuration

| Setting | Purpose |
| --- | --- |
| `INDUSTRY_FEE_TREASURY` | Public pooled fee destination; no treasury secret |
| `PUMP_NETWORK`, `PUMP_RPC_URL` | `devnet` or `mainnet-beta`, HTTPS archival RPC; genesis/program checks |
| `PUMP_METADATA_BASE_URL` | Public HTTPS origin serving stable metadata and uploaded icons |
| `PUMP_LOOKUP_TABLES` | Comma-separated reviewed active lookup-table addresses |
| `PUMP_LAUNCH_ENABLED` | Explicit launch enablement; defaults false |
| `PUMP_MAINNET_LAUNCH_ENABLED`, `PUMP_MAINNET_APPROVAL_REFERENCE`, `PUMP_LAUNCH_ALLOWLIST` | Separate controlled-mainnet approval and exact creator wallets; live unseeded environment required |
| `PUMP_RECONCILIATION_ENABLED` | Read-only chain receipt discovery without enabling broadcasts |
| `PUMP_FEE_COLLECTION_ENABLED`, `PUMP_MAINNET_COLLECTION_ENABLED` | Separate collection enablement and mainnet approval gate |
| `INDUSTRY_FEE_COLLECTOR`, `PUMP_COLLECTOR_KEYPAIR_FILE` | Public gas wallet and protected operational JSON keypair file |
| `PUMP_COLLECTOR_API_SECRET` | Distinct private scheduler credential; local supervisor generates an ephemeral value |
| `PYTH_HERMES_URL`, `PYTH_API_KEY` | Trusted historical oracle access |
| Existing `WALLET_ENCRYPTION_KEY`, `ADMIN_WALLETS` | Mint-recovery encryption and wallet-authenticated administration |

Conservative development collector defaults: interval 300 seconds, minimum 0.01 SOL, cost ratio 0.05, batch 3, gas-wallet ceiling 0.1 SOL, transaction cost cap 0.0001 SOL, rolling-day cap 0.001 SOL. Simulation cost conservatively includes payer balance consumption plus quoted fees. Production operators must review all values and funding/rent needs. `EMERGENCY_PAUSE=true` prevents collection broadcasts. Do not turn on the general unrestricted mainnet switches.

## Recovery

Use the saved launch displayed in Review & Launch. Status/Recover do not prompt another signature. If signed submission timed out, recover against finalized history; do not create another mint. Once expired and absent from chain, Resume prepares the same mint with a new blockhash. Cancellation is accepted only when all relevant validity has elapsed and the mint is absent; it erases the ephemeral signer. Existing mints must be reconciled, not cancelled. After 24-hour signer expiry, an absent expired mint can be explicitly cancelled before starting a fresh operation.

For collector errors, check Admin → Pump Fees and `pump_collection_attempts` / `pump_scan_signatures`. Restore the original network/RPC and small gas-wallet funding where needed. Never manually credit a signature or mutate a locked receipt. Restore historical RPC/oracle availability and let the reconciler replay safely. A routing failure blocks subsequent business runtime activity under the existing routing gate.

## Acceptance and limits

Local tests cover official instruction ordering/metas, packet sizing, exact signatures, changed mint/treasury, decoded locked state, both distribution paths, third-party event parsing, wrong mappings, duplicate receipt/conversion, immutable evidence, balanced allocation, oracle failures, cost bounds, runtime denial, and unknown/expired launch recovery. All 122 unit/integration tests pass. The eight existing browser flows pass (the upload/launch flow was rerun after correcting a hydration timing issue). Dedicated Pump desktop/mobile captures report no console errors or horizontal overflow. A read-only request to the default Hermes endpoint without a configured API key was unavailable; no real receipt was priced or credited.

`qa/pump/preflight.json` confirms the public devnet genesis and executable Pump/Fees/AMM/Mayhem programs. It **does not prove** that all deployed code, global configuration, allowed quote assets and behavior match the reviewed production path. No actual wallet prompt, funded launch, on-chain fee distribution, or real-value conversion has been accepted in this task.

Before a deliberately controlled real launch: provision an unseeded live database, HTTPS metadata hosting, archival RPC, reviewed actual lookup table, wallet extension, treasury public address, separate minimally funded gas wallet, encryption key, Pyth historical access, reviewed resolved fee policy, internal-ledger backing/reconciliation controls and narrow approval/allowlist. First verify the complete path on the selected safe test deployment where equivalent behavior can be proven. Otherwise obtain operator approval for one deliberately small, isolated mainnet acceptance. Inspect the single wallet prompt, atomic success, finalized locked shares, fee-generating activity, pre-graduation distribution, independent third-party distribution, exactly-once USD valuation/allocation and expiry/timeout recovery. Post-graduation acceptance requires a suitable controlled graduated fixture; do not manufacture trading volume or force graduation to claim completion.

Review the final decoded shares/treasury and backup/recovery procedure before broad enablement. No public announcement or token publication is part of this handoff.

## Staging readiness and offline ALT workflow — 2026-10-04

Latest protocol review rechecked the pinned official commit and all reviewed IDL hashes. No transaction was sent. Current test counts/status supersede the historical acceptance counts above; use STAGING_STATUS and the completion report.

Treasury and Collector remain NOT CONFIGURED. Do not generate final keys here. Later the operator supplies INDUSTRY_FEE_TREASURY, INDUSTRY_FEE_COLLECTOR and a separately secured PUMP_COLLECTOR_KEYPAIR_FILE. Invalid, sentinel, program and repeated-byte addresses fail validation. Funding, RPC genesis/programs, metadata, ALT contents/warmup, historical Pyth pricing and separate approval remain independent prerequisites.

`pnpm pump:lookup plan --fixture`, `create --fixture`, `extend --fixture`, `verify --fixture`, `activate --fixture` and `check --fixture` exercise the offline workflow. Six commands submit zero transactions. The fixture contains 16 required accounts and a 1090-byte atomic launch message. Without --fixture, valid real public addresses and HTTPS RPC are required. create/extend emit UNSIGNED instructions only. extend targets the existing PUMP_LOOKUP_TABLES address and checks authority; verify/activate/check read the actual table and require a later slot. Review and submission occur separately through an operator-controlled wallet. No automatic ALT creation or funding exists.

Admin's Pump acceptance checklist stays blocked until real prerequisites are verified. A configured URL/address is not on-chain acceptance. Public icons were tested through the isolated hosted bucket; stable token JSON hosting still requires the real application HTTPS origin. All four Pump launch/collection flags remain false in staging.
