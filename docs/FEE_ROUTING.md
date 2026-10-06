# Creator fee routing and USD credits

Pump token-backed businesses use the official SDK's atomic create → sharing config → update shares V2 flow. Before activation, INDUSTRY independently proves active V2 state, matching mint/PDA/creator, revoked admin and one treasury shareholder at exactly 10,000 bps. The legacy metadata-only Token-2022 adapter still fails closed; setting treasury metadata is not fee routing.

The dedicated collector re-verifies the route, distributes bonding-curve fees, and sweeps PumpSwap fees before distribution when required. Its small operational wallet pays costs; it cannot choose a replacement fee destination. No treasury private key is used.

```text
Finalized Pump distribution → pooled INDUSTRY Treasury (physical SOL)
                          → immutable native receipt / custody journal
                          → Pyth receipt-time SOL/USD price
                          → USD micro-value (accounting only)
                          → resolved V1 Fee Allocation Policy
                             ├─ BUSINESS_COMPUTE
                             ├─ BUSINESS_OPERATING
                             └─ PLATFORM_REVENUE
```

Original SOL, business/mint, signature, slot/time and native units remain immutable. Price/source/time and USD value are added once. No trusted fresh-at-receipt price: **PENDING_CONVERSION**, no USD credit. The approved V1 policy is the default when no operator override exists. Retries are idempotent. No automatic SOL→USDC swap is implemented or authorized. USD credit liabilities do not eliminate the treasury's SOL/USD market exposure; an operator must reconcile backing separately.

See [PUMP_INTEGRATION.md](PUMP_INTEGRATION.md) for pinned programs, source links, oracle trust/freshness rules, quote-asset boundaries, configuration, recovery and controlled acceptance requirements.

## Approved V1 allocation

The single executable source of defaults, validation and splitting is `packages/core/fee-policy.ts`. `system_settings.fee_allocation_policy` is the existing audited operator override; `GET /api/treasury/policy` resolves it for both accounting and every policy display. Configuration changes apply prospectively to unallocated receipts only, never by rewriting history.

| Phase | Cumulative confirmed USD Pump fees | Compute | Operating | INDUSTRY |
| --- | --- | ---: | ---: | ---: |
| BOOTSTRAP | First $20 | 60% | 40% | 0% |
| GROWTH | Above $20 through $100 | 40% | 60% | 0% |
| ESTABLISHED | Above $100 | 20% | 65% | 15% |

INDUSTRY only begins earning a platform share once the business reaches Established. The boundary itself belongs to the preceding band; the next micro-dollar uses the next band. At exactly $100 already received, the next receipt begins in Established.

### Receipt ordering, splitting and rounding

A business row lock serializes valuation and allocation. Cumulative totals include finalized, USD-valued Pump receipts for that business, network and accounting unit, in immutable valuation-completion order (`converted_at`, then receipt ID). Priced receipts awaiting allocation count; unpriced native receipts, test funding and service revenue do not. Late-discovered or late-priced chain receipts enter when their USD valuation is confirmed, without moving or revaluing previous receipts. The oracle price still comes from the original chain receipt time. Allocation retries use the same stored order, including when older priced receipts await allocation.

Each receipt is intersected with the phase intervals using BigInt micro-USD. For $95 previously received and a $20 receipt, $5 receives Growth (Compute $2, Operating $3, INDUSTRY $0), then $15 receives Established (Compute $3, Operating $9.75, INDUSTRY $2.25). Total allocation is $5 / $12.75 / $2.25.

Each segment floors its exact proportional micro-unit amounts, then assigns remaining micro-units to Operating. If an operator configures Operating to zero, dust goes to a nonzero Compute share, or Platform only when it is the sole recipient. Thus the V1 platform share is always zero in the first two phases; Established uses 15%, floored to the accounting micro-unit. Segments and aggregate totals always balance exactly.

The existing receipt policy snapshot, `treasury_fee_receipts.evidence.allocation`, and posting metadata retain segment phase, cumulative start/end, receipt portion and all three allocations as integer strings. Aggregated debit/credit transfers keep existing idempotency keys. Financials shows these historical segment amounts, not recalculated current-policy amounts. Legacy receipts without segment evidence stay intact and are labelled historical. No existing data or schema migration is required for this update.

### Service economics and protections

Successful legitimate service/job revenue goes 100% to seller BUSINESS_OPERATING. V1 marketplace commission and normal business-to-business platform transaction fees are both 0%. Buyer Operating pays seller Operating through existing escrow and settlement; fee-policy percentages never apply to sales.

Creator fees and PLATFORM_REVENUE are excluded from genuine external revenue and Self-Sustaining. Existing measured-cost, external-paid-work, debt and insufficient-compute protections remain unchanged. No dynamic rescue allocation is enabled.

PLATFORM_REVENUE is INDUSTRY's internal economic attribution in the pooled treasury. No owner/personal-wallet transfer, platform withdrawal system, physical SOL swap or autonomous mainnet spending is added.
