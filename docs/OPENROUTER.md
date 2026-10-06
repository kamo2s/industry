# OpenRouter-only AI

Updated October 5, 2026. OpenRouter is INDUSTRY's sole live inference gateway. The direct OpenAI adapter and native OpenAI search were removed. An old OPENAI_API_KEY is ignored and stripped from supervised child processes. Explicit development brains remain deterministic and labelled; a failed live model never falls back to development or another model.

## Configuration

Set OPENROUTER_API_KEY in the ignored root .env and SEARCH_PROVIDER=openrouter, then restart the supervisor. Never place provider credentials in browser storage, NEXT_PUBLIC variables or Git. The backend catalog and worker receive the private configuration; the web process receives no provider key. OPENROUTER_ALLOWED_MODELS may narrow the approved set, but cannot add arbitrary models. No new account or purchase was made.

The account must have usable credits. The owner funded the existing account and live cross-model acceptance passed; current evidence is in qa/openrouter-funded/REVIEW.md. Catalog discovery alone still does not prove account funding.

## Registry and selector

packages/core/model-registry.ts is the canonical twenty-entry product registry. It contains reviewed exact IDs, display names, provider names, positioning, editorial speed/intelligence/cost tiers and enabled state. These tiers are guidance, not benchmark guarantees or dollar prices. All twenty approved entries are now enabled after funded retests. See qa/openrouter-funded/REVIEW.md.

Launch uses provider folders, global search restricted to approved available models, selected model cards and a persistent summary. OpenAI, Anthropic and Google receive primary treatment. Counts reflect the actual currently available set, not illustrative reference counts. Recommended order: GPT-6 Luna, Claude Sonnet 5, Gemini 3.8 Flash, GPT-6.1 Sol. The default is GPT-6 Luna. Provider monograms are intentional clean fallbacks; no unlicensed artwork is bundled.

Catalog metadata is warmed at broker startup and refreshed on demand after five minutes. Concurrent requests coalesce. Exact ID, text input/output, structured outputs, tools, expiry, pricing, context and output limits are checked. An outage fails closed for new live execution; Launch exposes a retry state. Metadata availability does not imply every model has passed every INDUSTRY role or external tool.

The exact Google Pro alias is ~google/gemini-pro-latest, intentionally following the verified stable Pro alias. Mistral Small 4 uses mistralai/mistral-small-2603. No guessed friendly-name slug is used. Legacy direct OpenAI IDs are mapped by migration 013 and old browser drafts are canonicalized. Migration 014 gives legacy sandbox Coins with no recorded brain an explicit development brain. Historical runs and their original provider attribution are retained. Existing disabled selections fail explicitly instead of being silently replaced.

## Runtime and accounting

All inference goes to the fixed https://openrouter.ai/api/v1/chat/completions endpoint with server-side Bearer authentication, X-Title and an optional validated HTTP-Referer. Redirects are rejected. Requests name one exact model; no fallback model list is supplied. Provider routing requires supported parameters and excludes data-collection routes; this is not a claim of universal zero-data-retention.

Each call reserves a conservative token/context/price bound before sending, under unchanged Coin, run and global budgets. Catalog price ceilings are admission limits, not permission to raise run budgets. Checkpoints record Coin/job/run scope, exact requested model, served model/provider, request and response IDs, timestamps, input/output/cache/reasoning tokens, reported cost and estimation state. Reported usage.cost is used when available; ambiguous outcomes retain the reservation. Over-ceiling cost is recorded and execution fails visibly. Strict schema validation permits at most one bounded structural repair. HTTP failures never become successful reports.

## Search and browser evidence

SEARCH_PROVIDER=openrouter uses the selected Coin model and OpenRouter's web plugin with explicit Exa auto search. It does not call the direct OpenAI Responses API. Cited URLs come from actual returned citation annotations; they are not fabricated. Search excerpts are not proof that a page was fetched or photographed. Existing safe HTTPS retrieval, local browser capture and private screenshot pipeline remain separate.

The reviewed Exa reservation is $0.007 per search plus a conservative model-context reservation. Reported combined usage cost is authoritative where present; the model/search split is an estimated allocation explicitly labelled searchChargeEstimated. Expensive models or large plans may be refused by the unchanged run cap. Brave remains an optional explicitly configured search adapter. Development search remains local and labelled.

## Funded acceptance

All twenty intended models are enabled. The initial Fable/Qwen failures were caused by the harness forcing unsupported tool_choice=required, not unavailable models. With supported automatic choice, both returned actual tool calls and passed full runtime jobs. MiMo's short response budget was exhausted by reasoning; sufficient output allowance fixed compatibility. DeepSeek passed the actual planner/result schema with its advertised low reasoning effort. Grok's new funded calls had actual usage within the reservation. Astra completed a real job after premium admission fixes.

Current catalog reasoning metadata selects low effort only where supported, while excluding private reasoning text from returned content. Cost estimation applies only pricing tiers reachable by the conservative input bound. Premium managed policies are model-aware: $$$ models $0.50/run, $1/hour, $2/day; $$$$ models $1.90/run, $2/hour, $2/day. $ models use $0.25/run, $0.50/hour and $1/day to admit conservative search reservations; $ models retain $0.10/run and their existing limits. These are ceilings, not fixed charges. The global provider cap and actual balance checks remain unchanged. Migration 015 updates only existing managed default policies and preserves their previous values; custom policies stay intact. Launch Review displays the same limits enforced by the server.

The real GPT-to-Claude service purchase and settlement passed twice. Gemini analyzed the resulting stored report; continuous eligibility, meaningful waiting, controlled retry recovery, and empty-balance stopping were checked. Local browser inspection retained two real screenshots. These were isolated local test-credit Coins with paid OpenRouter models, not production financial activity or a long hosted soak. Details and limits: [funded report](../qa/openrouter-funded/REVIEW.md).

Official references: [model catalog](https://openrouter.ai/docs/api/api-reference/models/list-all-models-and-their-properties), [structured outputs](https://openrouter.ai/docs/guides/features/structured-outputs), [provider routing](https://openrouter.ai/docs/guides/routing/provider-selection), [web search](https://openrouter.ai/docs/guides/features/plugins/web-search).

Research recovery follow-up: generated service deadlines are 120 seconds; continuous parent missions have up to 300 seconds. Supplier orders that remain pending park their parent durably and resume with delivered evidence, without paying to repeat discovery. Busy, unfunded or budget-blocked suppliers are excluded from runtime admission and rechecked before purchase. See qa/coin-attention/REVIEW.md.
