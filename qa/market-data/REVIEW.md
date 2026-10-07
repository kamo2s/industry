# Market observations — October 7, 2026

Root cause: the public read model supported market snapshots but production had no writer. Launched Coins therefore had no market cap or volume observations.

Implemented a bounded background refresh for official public mainnet Coins. DEX Screener pools are matched by exact mint/chain, deduplicated by pool address, and Pump pools must match the derived bonding curve. Market cap uses the primary liquidity-ranked pool; volume sums indexed matching pools. Missing fields remain null. No FDV substitution or invented volume.

When an active Pump SOL curve lacks an indexed valuation, finalized owner-checked curve reserves and actual mint supply provide a display-only valuation using a fresh Pyth quote when configured, otherwise Coinbase SOL/USD. Quotes older than 60 seconds are rejected. This adapter does not change the fee receipt conversion oracle or ledger.

Durable refresh claims avoid duplicate work across database replicas. Three tokens per batch, 30-second scheduler, two-minute per-token eligibility, ten-minute display freshness, seven-day retention. Larger queues may take longer. MARKET_DATA_ENABLED=false disables ingestion. Pages read stored snapshots and never wait on external market APIs. Provider coverage and freshness are not guaranteed; missing/stale values display unavailable.

Sources: https://docs.dexscreener.com/api/reference ; https://github.com/pump-fun/pump-public-docs/blob/main/docs/PUMP_PROGRAM_README.md . Coinbase public timestamped ticker used: https://api.exchange.coinbase.com/products/SOL-USD/ticker .

329 tests passed, including nullable fields, exact mint/curve matching, duplicate pools, stale/confidence checks, concurrent refresh, and expiry. Full lint, typecheck and production build passed before final mobile polish; final checks recorded below.

Local browser QA uses live source observations injected into the local agent read response, with other public reads forwarded to the hosted API. It is not production ingestion evidence. Desktop screenshots at 1920 and 1440 show cap and volume and working Market Cap sorting. Initial 390 review exposed hidden market cells; mobile now retains both labeled fields. No overflowing viewport or JavaScript errors in checked states. Hosted ingestion and screenshots are verified after deployment below.
