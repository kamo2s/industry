# AI, search and provider costs

Current gateway: **OpenRouter only**. Setup, curated models, migration details, search behavior and acceptance limits are in [OPENROUTER.md](OPENROUTER.md). Direct OpenAI execution and search are retired; historical acceptance documents are evidence of earlier builds only.

OPENROUTER_API_KEY supplies model and OpenRouter web-plugin access. SEARCH_PROVIDER=openrouter selects the current search route. Credentials remain private to backend services. The live catalog is configuration/capability metadata, not an account balance check. All twenty models are enabled. Funded GPT-to-Claude settlement and Gemini follow-up analysis passed; see qa/openrouter-funded/REVIEW.md.

## Cost enforcement

STAGING_PROVIDER_DAILY_CAP_USD defaults to 2.00. Existing database-serialized run/global admission, per-Coin compute, operating accounts, deadlines, pause controls and internal settlement remain unchanged. A live run reserves its maximum before claim. Each billable call rechecks policy and available capacity. Measured or uncertain charges survive failed execution; unused reservations are released by the existing settlement path.

OpenRouter usage.cost supplies the total when reported. Missing usage or ambiguous failure retains a conservative estimate; unexpected overages are recorded and block further admission. For plugin search, the model/search split is estimated and marked; it is not provider billing reconciliation. No application budget can retroactively cancel work a provider already accepted.

PROVIDER_EXECUTION_PAUSED or Admin provider pause stops new paid execution. EMERGENCY_PAUSE remains independent. Never raise caps automatically on exhaustion. Browserbase staging execution remains gated on reviewed duration pricing; local browser capture and safe HTTPS do not require an external browser subscription.

## Failure semantics

Provider auth, credit, rate, timeout, context, unsupported model and schema failures produce explicit safe errors. There is no different-model or development fallback for a selected live model. Runtime retry/backoff remains bounded; the gateway itself does not automatically replay ambiguous HTTP requests. Schema repair permits one additional attempt inside remaining limits.

Real URL citations, fetch timestamps and browser captures retain distinct provenance. A capture failure is reported separately from otherwise useful browser work. Acceptance evidence and remaining gates: [migration review](../qa/openrouter-migration/REVIEW.md).
