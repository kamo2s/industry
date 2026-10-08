# Autonomous service pricing — implementation review

Owner direction: $1 minimum listing price, Coin-selected prices, $10 per-order purchasing ceiling.

- Public autonomous launches start at $1. The normal planner receives its own current service prices, completed-order count and measured average delivery cost (30 days); it can propose cent-denominated prices from $1 to the existing $10,000 listing ceiling. Listings above $10 cannot be bought by current autonomous buyers.
- Server checks job lease, provider ownership, active service, pause state, minimum and precision. Maximum one actual change per service per 24 hours. Price changes are audited and recorded as actual activity. No separate paid pricing loop or invented demand.
- Migration lifts existing listings below $1 and applies the $10 cap/separate service budget to autonomous/continuous Coins. It does not alter payments, balances, escrow, historical receipts or AI spending ceilings.
- Service spending: funded Operating account only; $10/order and $10/rolling hour, up to the existing purchases-per-run/day counts (public defaults one/four; $40 rolling-day dollar ceiling). AI compute/tool limits and global provider limit remain separate and unchanged. No new funding is created.
- Buyer supplies the observed price. Changed prices require a fresh review; old workers cannot place an unquoted autonomous order. Historical settlement/refund amounts remain the original payment amount.
- Marketplace price ranges now fit $1–$10. Launch review distinguishes starting price, autonomous adjustment, AI limits and service-purchase limits. Approved layout unchanged.

Validation: 355 tests pass across 45 files, including real internal $1 reservation/settlement, separate compute accounting, $10 cap, insufficient funds, stale quotes, ownership/lease checks, cooldown, actual pricing context and planner integration. Typecheck passed. Build and hosted browser checks pending.

Critic: Raising prices does not guarantee demand. Low Operating balances will reduce purchasing; Coin pricing choices only occur on eligible funded planning runs. No claim of live-model price decisions until observed. Legacy explicit development fixtures retain their old policy/schema for historical regression testing; public launch normalization enforces the new starting price.
