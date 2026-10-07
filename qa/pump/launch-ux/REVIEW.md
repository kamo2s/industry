# Pump launch usability and activation repair — October 7, 2026

## Completed

- Fixed a verified-routing proof collision: passing a pending launch row to `routingState` spread `status: confirmed` over `status: VERIFIED`. Proof now explicitly contains only verified public routing fields; encrypted signer/config/transaction columns cannot enter it.
- Independently checked SIGNAL's finalized successful transaction and locked 100% Treasury routing, then recovered its existing INDUSTRY profile through the ordinary verified activation path. No second token or blockchain transaction was created.
- Added a persistent success receipt with mint Copy, Coin profile, Pump.fun, Solscan and transaction links. Pending chain confirmation and pending INDUSTRY activation are distinct. Refresh restores the operation; no forced redirect hides the receipt.
- Removed technical "saved launch" labels and the redundant single-option network selector. Retry and editing preserve the existing mint and respect transaction expiry. Wallet rejection explains that nothing was submitted by that attempt.
- Optional initial SOL buy defaults to zero. Amount is bounded/validated, frozen in the prepared operation, and included in the exact wallet-signed message. Tokens go to the creator wallet. Creation, locked fee routing and the buy are atomic; no autonomous or server-held wallet purchase was added.
- Uses the official SDK's SOL `buy` instruction after locking the sharing destination. Quote uses on-chain global/fee configuration; the encoded max SOL cost cannot exceed the selected amount. Existing fee policy and business funding remain unchanged.
- Compact reversible UUID references keep new metadata URLs within packet budget; old metadata URLs continue to resolve. Five regular instructions use Solana's default aggregate compute budget. Tested maximum supported name/ticker with the deployed metadata origin and existing static lookup: 1227 bytes. Oversized transactions are rejected before signing; no split fallback.
- Public Pump readiness now respects the shared operator launch pause as well as Pump-specific flags.

## Verification

- 321 tests / 38 files passed, including routing proof isolation, shared pause, optional-buy instruction order/destination/cost, message alteration, amount validation, and legacy/compact metadata IDs.
- TypeScript, changed-file ESLint and production build passed.
- Three visual review passes: structure and state wording; density and removal of duplicate controls; responsive receipt/actions and fine polish. Screenshots personally reviewed at 1920×1080, 1440×1000 and 390×844. No horizontal overflow or page exceptions in the tested cases.
- Local browser fixtures verify optional amount selection/invalid input/insufficient balance, chain-confirmed state, success links, starting another Coin, wallet rejection then retry of the same mint, exactly one mocked submission and receipt restoration after reload.
- Browser financial responses/wallet are mocked. These tests do not imply a real initial buy occurred. An unsigned mainnet protocol simulation with a funded public simulation-only payer succeeds; the real owner wallet currently cannot fund another launch. No private key for that simulation payer exists in this task and no transaction was submitted.
- SIGNAL real receipt: mint `AZfWTC5p3MinW58Q3Fqu29WJ3ALp9LyNucvT2SKSZp7d`, signature `376AySZf5rr3sj5axtUb6dkQyNdMCiSiZFfcyG1sKWsGG4FRse6pi23r9BgwFq2KSKVWc3UZ2K2HsLzMufRsmY6H`, profile `/coins/signal-0febc9`.

## Boundaries

Owner allowlist remains. Collector/reconciliation remain disabled. An initial buy is a wallet token purchase, not a Compute/Operating credit allocation. Network fees/account rent are additional and reviewed in Phantom. Public launch rollout and actual creator-fee collection acceptance remain separate work.

Official protocol references: [Coin creation](https://github.com/pump-fun/pump-public-docs/blob/main/docs/instructions/COIN_CREATION.md), [SOL buy](https://github.com/pump-fun/pump-public-docs/blob/main/docs/instructions/BUY.md), [locked fee sharing](https://github.com/pump-fun/pump-public-docs/blob/main/docs/instructions/CREATOR_FEE_SHARING.md).

Hosted deployment verification follows the reviewed source update.
