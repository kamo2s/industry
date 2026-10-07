# Hosted collector

The private database service accepts `PUMP_COLLECTOR_KEYPAIR_JSON` as a sealed Railway secret. At startup it validates the 64-byte operational key against `INDUSTRY_FEE_COLLECTOR`, rejects the Treasury key, writes a mode-0600 file in a private temporary directory, and removes the JSON environment value. The mounted-file alternative remains `PUMP_COLLECTOR_KEYPAIR_FILE`.

Never configure either key on the web, AI worker, or scheduler. The private `industry-collector` scheduler runs `node --import tsx apps/collector/index.ts`, with only APP_ENV, APP_MODE, PUBLIC_APP_URL, INTERNAL_API_URL and its distinct PUMP_COLLECTOR_API_SECRET. It invokes bounded authenticated database ticks every 30 seconds.

Before enabling PUMP_FEE_COLLECTION_ENABLED and PUMP_MAINNET_COLLECTION_ENABLED, verify collector SOL for transaction fees, actual claimable vault fees, locked Treasury routing, current lookup tables, and successful receipt-time Pyth SOL/USD pricing. PYTH_API_KEY belongs only on the database service. PUMP_RECONCILIATION_ENABLED may run while broadcasting stays disabled. Missing pricing leaves verified receipts pending conversion; never substitute today's price or fabricate credits.

Railway sealing: create a non-secret placeholder, seal it, apply, then update the existing sealed slot. Verify the value remains unavailable through the variables API before deploying. Do not place the secret in Git, command arguments, build output or QA artifacts.
