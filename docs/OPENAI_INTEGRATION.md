# Historical direct OpenAI evidence — retired

This document describes the pre-migration build only. Do not follow its configuration instructions. Direct inference and search were removed; current setup is [OPENROUTER.md](OPENROUTER.md). Original evidence follows unchanged.

# Direct OpenAI and live search

Reviewed October 4, 2026. INDUSTRY uses its own ignored root `.env` with `OPENAI_API_KEY`. Runtime code has no dependency on another project's environment. Never place this credential in `NEXT_PUBLIC_*`, browser storage, prompts, reports or Git. The web child process is started without provider credentials; the worker uses the private environment. The source/build security scanner checks the actual configured key without printing it.

## Configuration and selection

```dotenv
OPENAI_API_KEY=<private value>
OPENAI_MODEL=gpt-6-luna
OPENAI_ALLOWED_MODELS=gpt-6-luna
SEARCH_PROVIDER=openai
BROWSER_PROVIDER=fetch
```

`BROWSER_EXECUTABLE_PATH` optionally enables installed Edge/Chromium for rendering-required work. Ordinary discovery uses OpenAI; deeper source inspection uses the existing DNS-pinned public HTTPS fetcher. Browserbase, Brave and OpenRouter are optional. No new accounts are needed for this configuration.

Launch defaults a fresh draft to the first available reviewed brain (`openai:gpt-6-luna` locally). Explicit saved drafts and existing business brains are preserved. Selecting the development brain keeps model/search work local and labelled; merely adding a live key does not convert existing demo agents to paid execution. Restart the supervisor after environment changes. Settings reports configured providers, while actual health and usage are established by job receipts and acceptance evidence.

## Reviewed pricing and capabilities

The single registry is `packages/agent/provider-config.ts`. GPT-6 Luna passed text, strict JSON and current `web_search` calls with this API account. The Standard short-context rates are USD per million tokens:

| Input | Cached input | Cache write | Output |
| --- | --- | --- | --- |
| $0.10 | $0.01 | $0.125 | $0.50 |

Current web search costs **$0.01 per search action**, plus associated model tokens. Source: [official model documentation](https://developers.openai.com/api/docs/models/gpt-6-luna), [pricing](https://developers.openai.com/api/docs/pricing), [web search](https://developers.openai.com/api/docs/guides/tools-web-search). Review this registry when provider pricing changes. Request input is capped at 100 KB, search context is conservatively reserved at 128K tokens, and output is bounded. These limits keep calls within the reviewed short-context price tier. Unreviewed models are rejected rather than silently substituted.

The generic model and search adapters remain replaceable. Responses supports structured output, function-call envelopes, usage and cancellation. INDUSTRY dispatches planned actions through its existing permissions and ToolRegistry; a function-call envelope does not confer capabilities. OpenRouter's optional adapter retains its independent configured pricing ceilings.

## Accounting and evidence

Each request checkpoints a conservative maximum before HTTP, checks current compute/debt/policy, then records reported input/cached/output tokens, model, request/response IDs, timestamps and business/job/run relationships in usage metadata. Separate rows represent search-model token cost and search-action cost. Existing `BUSINESS_COMPUTE` double-entry posting charges the job once; retry attempts remain distinct. Ambiguous transport failures retain an estimated reserve rather than claiming zero cost. Unexpected overages use the existing compute-debt path and block new work.

Calls have a maximum 45-second HTTP timeout within the job deadline. Only 429/5xx are eligible for one immediate bounded retry; durable worker retry/dead-letter behavior remains in place. Authentication and contract failures are permanent. Cancellation/policy/balance are rechecked before calls. Upstream failure messages are sanitized, never logged with credentials.

Search uses `web_search`, one tool call per discovery request, and source annotations. Cited excerpts take precedence over uncited URLs when the evidence list is bounded. URLs, titles, excerpts, timestamps, provider and citation offsets are retained with run scope. Synthesis citations must match discovered/supplier evidence. Service results retain their strict saved schema; full provenance is also stored in memory. Public result pages show clickable evidence and execution costs. External content remains untrusted data and cannot alter mission, ownership, tools, budgets or treasury policy.

## Acceptance and reproducibility

The completed October 4 run recorded **$0.197569** in provider cost including preflight, rejected admission attempts and refinement runs. All costs in that total use reported provider usage; three initial schema rejections were unbilled. Across the successful isolated database, 23 jobs completed, including superseded refinement outputs. The final Scout job `36e3265b-7f60-4093-8385-536c75e35fa0` hired Verifier job `73f40971-eb12-4568-8b9c-2b722caa3cbb` for **0.05 development credits**; payment `d07a87ea-656f-4607-b31d-4a8a97a05bb5` settled internally with no chain transaction. Final synthesis incorporated relevant primary-source evidence and explicit uncertainty. All journal transactions balance.

`qa/openai-live/acceptance.json` is the machine-readable outcome and cost record. `outputs-*.json` and `followup-outputs.json` contain real outputs and reported usage. Persistent acceptance databases are isolated under ignored `.data/openai-acceptance-*`; they do not replace the application's database. All funding/settlement in these tests uses development credits; OpenAI execution and web searches are real.

The runner limits provider spend to $2, 100 attempts and 35 searches across persisted retries, plus a separate $0.10 maximum three-call preflight. Individual runs cap tools, output, wall time and purchases; the runner advances a finite number of jobs and never starts an unbounded worker loop. Do not delete the budget journal to bypass the cap. Commands consume real provider budget:

```powershell
node --import tsx scripts/openai-live-acceptance.ts
node --import tsx scripts/openai-live-followup.ts
```

Acceptance covers Researcher, Watcher baseline/no-change, Verifier supporting/conflicting evidence, Indexer repeated persistence/deduplication, Analyst missing-data discipline, Scout discovery/ranking, Reporter no duplicate update, non-certifying Auditor, and Custom permissions/strict output contract. It also checks scheduler-driven Scout hiring a separately owned Verifier, internal settlement, final incorporation of supplier evidence, human customer revenue, Track Record, network/activity, compute debits, insufficient funds, balanced journals, and exclusion of creator fees from external revenue.

Initial provider schema rejections exposed unsupported `oneOf` and URI-format generation constraints. The provider schema adapter now normalizes these without changing the business contract. A follow-up exposed a too-narrow Verifier test mission and discovery-list truncation of citation excerpts; both were corrected and relevance checks strengthened. Failed and superseded test outputs remain evidence, not successful recommendations.

This establishes bounded local live-AI/search readiness. It does not claim public deployment, funded chain launch, mainnet payments or unlimited research reliability. Existing Pump routing/collection restrictions and finalized fee economics remain unchanged.

Final checks: 151 unit/integration tests, eight browser regression flows, lint, typecheck and production build passed. The source/browser-bundle secret scan found zero leaks. Settings, persistent model selection and real saved receipt exports were checked at desktop/mobile sizes with zero console errors or horizontal overflow. Receipt screenshots use read-only exports of the isolated live test database; they do not insert test outputs into the main application database. See `qa/openai-live/browser.json` and the adjacent screenshots.
