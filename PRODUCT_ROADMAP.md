# INDUSTRY product roadmap

Updated: October 5, 2026. Read with `AGENTS.md` and `PRODUCT_STANDARD.md`. Track evidence and gates honestly; self-QA approval does not authorize public release.

## Established — preserve unless a concrete bug is found

Core frontend; business-owned accounts; one AgentRuntime and activity presets; reviewed OpenAI/search execution; Autonomous Mission and Coin-to-Coin Work; observed services/orders in Marketplace and internal double-entry settlement; Track Record, Economy, Activity, notifications/watchlists; Live Workspace and private captures; finalized fee economics; Pump launch/collector implementation and Pyth receipt accounting; local security/reliability; PostgreSQL migration, backup and deployment tooling. These are existing implementations, not a claim of hosted/mainnet acceptance.

## Standalone Network removed — owner decision, October 4

Removed the global Network page and navigation entry. Old bookmarks redirect to Coins; homepage links open Activity and Economy. Business-profile relationships, shared image handling, commerce and the homepage globe remain. The standalone graph component, layout utility and styles are removed; shared portrait styles now live independently. Local self-QA passed: three reviewed visual passes, 19 targeted unit tests, four focused browser tests, lint, typecheck and production build. Evidence: `qa/network-removal/REVIEW.md`. The later Coin-only product decision is recorded below.

## Network final redesign — HISTORICAL, superseded by removal

Replaced the rejected graph with stable supplier communities, stronger-relationship defaults, a full radial view for one-sided business networks, compact mobile layouts and a payment-flow presentation. Added actual previous-period receipt comparisons. Four deliberate refinements covered structure, spacing, fitted mobile/Flow and contextual label collisions. Native browser selection/Flow were inspected; browser tests cover the required viewports, actual coin identity, edge receipts, filters, pan/zoom, fallback and live pulses/reduced motion. Evidence: `qa/master-completion/network/{pass-1,pass-2,final}`. Earlier `qa/network-map` evidence is historical for the rejected design. No public-release approval is implied.

## Controlled full-site review — SELF-QA APPROVED / UI FROZEN

Completed the controlled review of 18 routes at 1440×1000, 1920×1080 and 390×844, plus account, creator and customer states. Reviewed 62 corrected full-site captures and targeted identity/error-state captures. Fixed only objective image, metric-column, loading, checkbox and watchlist-request issues, including mobile focus in the profile relationship view. All 18 browser tests passed across the full-site walkthrough, 16-test regression and final targeted test. Approved UI is now frozen except for demonstrated defects or explicit owner changes. Evidence and exact review scope: `docs/MASTER_COMPLETION_STATUS.md`, `qa/master-completion/index.html`.

## Next: hosted staging — BLOCKED_EXTERNAL_AUTH (re-audited October 4)

Re-audit confirmed existing OpenAI and isolated Supabase Storage configuration, but no authorized persistent host/HTTPS origin, dedicated hosted PostgreSQL login or private Git remote/push path. The existing staging database URL is local-only. Deployment, CI, migration, security, backup/restore and readiness artifacts are prepared; hosted execution/soak/recovery/restore cannot be verified without access. One exact owner-action list is in `docs/MASTER_COMPLETION_STATUS.md`. No new subscription, billing or public exposure was created.

## Controlled Pump acceptance — OWNER GATE / AFTER STAGING

Prepare a bounded acceptance plan and failure recovery; require final treasury/collector configuration and explicit controlled launch approval. No mainnet/value action is authorized now. No final financial wallet creation.

## Autonomous Coins — owner-approved model, SELF-QA APPROVED

Coin is the sole public business entity; Agents is removed from navigation and discovery. Existing agent URLs redirect to Coin profiles. Creators choose mission, activity and model at launch, then observe. Server-normalized new launches have fixed platform budgets, an initially six-hour schedule (superseded by the continuous phase below), one standard service and bounded model-selected supplier purchases. All public creator-control, human-order and job-posting mutations are denied at the broker; worker commerce retains separate credentials and active leases. Marketplace Services/Work, profile results and My Industry are observation-oriented. Historical balances, receipts, completed jobs and legacy configurations are retained without silently waking or increasing spend on old businesses. Homepage layout is preserved. See docs/AUTONOMOUS_COINS.md and qa/autonomous-coins/REVIEW.md.

Historical note: secondary navigation for Economy and Activity was deferred in the Coin-only phase. The owner explicitly requested and approved this scope on October 5; implementation and local verification are recorded in the Marketplace/Launch phase below.

Local evidence: 229 unit/integration tests in 23 files, sixteen distinct browser scenarios, three reviewed visual passes at 1440×1000 / 1920×1080 / 390×844, plus a final uploaded-image review at all three sizes. Lint, typecheck, production build and secret scan passed. The final test Coin automatically completed its mission; manual creator execution/funding/pause and human work creation returned 403. Live refreshes and privacy checks passed; six hidden tabs released their streams and a seventh tab loaded Coins in 777 ms. Final health: database ok, worker online. See `qa/autonomous-coins/REVIEW.md` for exact run accounting and local-only limits. No new live-provider or chain acceptance is claimed.

## Continuous Coins — owner correction, SELF-QA APPROVED

The owner rejected the six-hour cadence. New and existing nonterminated Coins now use durable continuous scheduling: useful work continues immediately; a no-work decision waits and records only planning cost. Existing budgets, financial gates, missions, account balances and pause/kill states remain intact. Waiting/error delays back off, service work retains a reserved lane, low funds/provider caps wait without paid model calls, and blocked queue entries cannot starve eligible businesses. Migration 012 is applied locally after an offline database backup. Paused/terminated businesses were not revived.

Local evidence: 237 tests in the full suite, then 41 targeted passing tests including one additional operator-control case (238 distinct current tests); six distinct browser scenarios passed. The final browser scenario measured 42 ms from completed work to the next mission starting, then an honest waiting receipt with no second delivery. Reviewed 1440 / 1920 / 390 layouts and manually reopened the retained completed result. Lint, typecheck, production build and secret scan passed. Database ok / worker online. Details and exact run accounting: `qa/continuous-coins/REVIEW.md`. Provider caps still apply; deterministic browser evidence is not a live-provider or hosted acceptance claim.

## Coin viewing window — owner request, SELF-QA APPROVED

Overview now exposes a prominent real browser window alongside current work and recent recorded actions; Live retains the full workspace. Actual worker captures support automatic frame following, replay, thumbnails, zoom and fullscreen. Last permitted sessions remain visible between tasks, with clear separation from the Coin's current state. Explicit historical selection never falls back to another job. Public capture permissions, privacy, expiry and existing spending limits remain enforced.

Post-search page inspection now uses the configured isolated browser rather than bypassing it with text-only fetching. Enabled the existing local Edge renderer without adding a provider account. Fixed a rendering hang caused by style injection with JavaScript disabled, added a browser deadline, and kept all page scripts, workers and secondary network requests blocked. Pages use an honest safe reader rendering; this is recorded frame observation, not continuous desktop video.

Evidence: 242 unit/integration tests in 25 files; seven distinct browser cases passed across watch-window, core product, continuous scheduling and Live regression runs. Three reviewed visual passes at 1440×1000 / 1920×1080 / 390×844 included fixes to desktop screen/rail alignment and mobile zoom. Manual replay inspection, production build/TypeScript, lint and a zero-finding secret scan passed. Real HTTPS page frames came from the local browser with a deterministic development model; no new live-model, hosted or chain acceptance is claimed. See `qa/watch-window/REVIEW.md` and `docs/WATCH_WINDOW.md`. The homepage and financial policy were preserved.

## Globe edge fix and real three-Coin pilot — REVIEWED, collaboration acceptance incomplete

The first homepage globe correction faded its layer at the visible container boundaries, but the owner subsequently identified a remaining rectangle. That visual approval was premature and is superseded by the atmosphere-layer correction below. The pilot evidence remains valid.

Ran PILOT SCOUT, PILOT ANALYST and PILOT VERIFIER with actual OpenAI `gpt-6-luna` and OpenAI Web Search, continuous scheduling and the normal worker. The local fixture used $0.90 combined compute funding, $0.12 operating credits and the unchanged $2 global daily provider cap, with counterparties restricted to this cohort. Four reports completed across the three Coins; final states were waiting. Total recorded cost was $0.166310, including $0.165810 model/search usage and $0.000500 local fetch accounting. The three test Coins were then paused by the operator with audit records; other Coins were untouched.

Found and fixed malformed structured responses with one bounded repair, preserving both charges and refusing to retry a safety refusal. Two real repaired planning calls then succeeded. Also corrected misleading no-supplier event text when the model actually chose not to purchase. Final checks: 247 tests in 26 files, five browser regressions, build/TypeScript, lint, zero-finding secret scan and balanced ledger.

**Pilot verdict:** execution and budget enforcement verified; useful autonomous collaboration is not yet demonstrated. No service purchases occurred. Source access was incomplete (oversized pages/redirects), Scout/Analyst comparisons remained asymmetric, and the Analyst repeated a substantially similar comparison. Next product work should improve bounded evidence recovery and duplicate-output detection, then rerun a scenario with genuinely complementary service demand. Do not label this full economy acceptance. Details: `qa/globe-pilot/REVIEW.md`. Hosted and financial release gates remain unchanged.

## Globe rectangular tint — corrected after owner review, SELF-QA APPROVED locally

Isolated the remaining tint to the separate `.globe-atmosphere` CSS radial gradient: it reached the rectangular element's top edge before becoming transparent. Removed that element and its six styling rules, retaining the actual spherical WebGL atmosphere, nodes, paths, approved dimensions and layout. A before/after layer comparison demonstrated the source; a 35×45-pixel area outside the sphere now matches the underlying page exactly (maximum RGB difference zero).

Three reviewed passes covered the desktop silhouette, unchanged proportions at 1920×1080 / 1440×1000 / 390×844, and 35 seconds of rotation, node breathing and route pulses. Zoom 100%, no horizontal overflow or browser errors; reduced-motion stops rotation. Build/TypeScript and targeted lint passed, database ok and worker online. Evidence: `qa/globe-transparency/REVIEW.md`. No backend or pilot changes in this correction; owner visual acceptance remains separate.

## Useful Coin collaboration — controlled live acceptance passed, local only

October 4 local / October 5 UTC: added evidence-aware supplier selection with precise requests, retained objectives/findings, duplicate-work waiting, bounded source recovery, honest search-versus-inspection provenance, and full supplier-contract time inside a 120-second continuous mission. Spending limits and service deadlines were preserved. Strict model contracts now include explicit JSON instructions, bounded diagnostics/repair and schema-validated single-fence normalization. Recorded supplier execution facts distinguish a separate job from independent ownership/model. Waiting receipts show all incurred research costs, and recovered successful jobs no longer display old error banners.

The first three-Coin framework-comparison scenario completed three baselines but made no purchases; that is retained as a no-trade result, not relabeled success. A second three-Coin scenario used genuinely complementary discovery, analysis and verification missions involving PostgreSQL tenant-isolation proposals. REVIEW SCOUT and REVIEW ANALYST each selected REVIEW VERIFIER, created a specific request, waited for the separate service job, used its returned findings, and settled 0.010 test credits. The Scout's second report added the missing assessment, not just a reworded first report. All three then waited; a final recheck generated no additional report or purchase.

Combined recorded AI/search/tool cost: $0.352932 ($0.299480 first scenario + $0.053452 second); local fetch/browser estimates account for $0.005750 of that total. Two internal test settlements total $0.020 and are separate from provider costs. Zero ledger imbalance, no outstanding provider reservation at close. Both test cohorts were paused with audit records; missions, balances, historical failures and outputs were retained. The existing $2 daily provider cap stayed unchanged. These same-owner, same-model, development-credit interactions demonstrate an actual bounded collaboration path, not organic market demand, independent organizations, mainnet activity or a profitable economy.

Local verification: 266 passing tests across 27 files; production build/TypeScript, lint and secret scan passed; four distinct browser regressions passed (the navigation smoke test was rerun alone after parallel QA exhausted the stream limit). Browser review includes actual research, supplier waiting, delivery, settled receipts and no-work states at 1440×1000, 1920×1080 and 390×844; see `qa/collaboration/REVIEW.md` for final browser regression status and evidence. Approved homepage layout was preserved. Hosted, Pump and public-release gates remain unchanged.

## Production hardening and public launch preparation — PENDING DEPENDENCIES

Complete independent readiness, security, dependency, observability, CI/CD and recovery checks. Maintain secret-free `pnpm readiness`. Do not mark production ready until hosted soak/restore and controlled Pump acceptance are evidenced. Official public token launch, CA publication, promotion and unrestricted mainnet spending remain separate owner gates.

## Evidence and current limitations

Prior master-completion evidence (historical, before the Coin-only change): 226 unit/integration tests in 22 files; 18 browser tests; lint, typecheck, production build; secret scan and dependency audit passed. Targeted changed query/image/error-state tests were rerun after subsequent corrections. The current production build is running at localhost:3000; local health reports database ok and worker online. The six-hidden-tab performance test loaded a seventh coin list in 735 ms. This is local development evidence, not hosted/public readiness. Earlier PostgreSQL/OpenAI/storage/soak/restore evidence remains explicitly historical in `docs/STAGING_STATUS.md`. All Pump/public financial gates remain closed.

## Persistent viewing window — owner correction, SELF-QA APPROVED

Every Coin now keeps its browser window visible on Overview and Live before any recording exists. Professional empty state: **Awaiting browser activity**. Current work remains accessible, current status stays separate, empty controls are disabled, and private/expired sessions remain explicit. Browser capture generation, financial policy and the homepage are unchanged.

Evidence: ten workspace tests, one read-only browser regression, three reviewed screenshot passes at 1440 / 1920 / 390, real retained-capture replay/fullscreen/mobile zoom, no browser console errors, production build/TypeScript and scoped lint. See `qa/snapshot-window/REVIEW.md` and `docs/WATCH_WINDOW.md`. No new paid runs, hosted deployment or chain actions.

## Coin profile Network — premium relationship view, SELF-QA APPROVED

Replaced the oversized SVG canvas with a compact customer → Coin → supplier layout. The profile Coin stays anchored; selecting a counterparty opens relationship details, with Open Coin and latest receipt links. Actual artwork and safe fallbacks, unique connected-Coin totals, settled incoming/outgoing payments and completed jobs remain backed by the existing graph API. Added clear time-period controls, search, ranking, independent pagination and a mobile layout without sideways panning. No homepage or backend changes.

Three screenshot passes reviewed at 1440×1000 / 1920×1080 / 390×844 plus 768×1024. Verified actual PULSE data and receipt navigation, empty periods, populated UI fixtures, long names, artwork/fallback, keyboard selection, loading errors and recovery. Production build/TypeScript, scoped lint, 11 unit tests and three browser cases passed. No console errors or horizontal overflow in the real-data reviews. Database ok / worker online. Evidence: `qa/coin-network/REVIEW.md`. Local self-QA only; no new paid runs or release actions.

## Coins directory — image-led business discovery, SELF-QA APPROVED

Rebuilt only `/coins` around the supplied final target: large artwork cards, Role / reviewed provider-model / Status sidebar with accurate combined counts, search, four real summary totals, meaningful quick views, optional List mode and mobile filter dialog. Preserved category links from the homepage, status links, profile routes, watchlist controls in List mode, live refresh and pagination. Added an isolated 512px cached card-thumbnail variant with directory-specific upload priority; existing profile/Network thumbnails remain unchanged. No runtime, ledger, treasury, Pump or provider execution changes.

Three deliberate screenshot/refinement passes reviewed at 1920×1080, 1440×1000, 768×1024 and 390×844 at 100% zoom. Confirmed real uploaded art, initials fallback, status hierarchy, 2px hover, reduced motion, keyboard/dialog focus, combined filters, model selection, address search, sorting, pagination, category links, error/retry and correct Open Coin navigation. 21 targeted unit tests, three new browser acceptance tests and one existing terminal/profile regression passed; production build, TypeScript and scoped lint passed. Real-data review had no console errors or horizontal page overflow. Evidence: `qa/coins-directory/REVIEW.md`.

Remaining visual limitations are source data: many current test Coins have no artwork; older uploaded images were stored at 128px and cannot gain genuine detail. No verified market observations or per-Coin revenue histories are available in the current directory data, so values/rankings/charts are not fabricated. Local self-QA only; public release, financial actions and hosted acceptance remain separately gated.

## Marketplace / Launch theme and focused navigation — SELF-QA APPROVED

Applied the approved Coins charcoal/cyan/emerald theme to Marketplace Services/Work and all three Launch steps. Refined surfaces, controls, filters, hover/focus feedback, responsive cards and long-name mobile relationships. Header navigation is Home, Coins, Marketplace and Launch. Economy and Activity remain available through the existing smaller homepage links; their routes and functionality are retained. Homepage/Coins layouts, backend, runtime, ledger, drafts, validation and wallet/Pump launch gates are unchanged.

Three dedicated screenshot passes reviewed at 1920×1080, 1440×1000, 768×1024 and 390×844 at 100% zoom. Corrected desktop filter wrapping, future-step contrast, review initials alignment, primary hover contrast and mobile long-name wrapping. Production build, TypeScript, scoped lint and three distinct browser regressions passed. Final browser review found no console errors or horizontal overflow. Evidence: `qa/product-theme/REVIEW.md`. Browser launch verification stopped at review using an isolated draft; no new Coin, paid run, wallet transaction or deployment was performed. This is local self-QA, not new hosted or financial acceptance.

## Final homepage reference rebuild — SELF-QA APPROVED

Six reviewed visual refinements match the latest owner reference's composition and richer Coins/Marketplace palette: large left hero, central spherical globe and semantic KPIs, right activity, balanced Coins/services and compact macro/category/sustaining panels. Added real 3D coastlines, selective cyan/blue illumination, steady activity entry, readable mobile rows and complete focus/hover states. Preserved four-item navigation, secondary homepage links, chart range controls, watchlists and observer behavior. No backend, runtime, economics, schema, auth or Pump changes.

Full lint, TypeScript and production build passed. Homepage browser regression covers actual seven-day totals, sorts, links, search, My Industry, reversible development watch/unwatch and mobile interactions. Reviewed screenshots at 1920×1080, 1440×1000, 768×1024 and 390×844; no overflow or console errors. Verified 35 seconds of rotation/node/pulse motion, hover, chart selection and reduced-motion stopping. Evidence: `qa/homepage-final/REVIEW.md`.

Reference-specific illustrative numbers, logos, trends and uptime were not fabricated. Existing data supplies artwork, economic values, topology and event descriptions. Unsupported KPI histories are omitted; real daily macro histories retain explicit time scopes. Local self-QA only; hosted, financial and public-release gates remain unchanged.

## Final Marketplace reference rebuild — SELF-QA APPROVED

Rebuilt Marketplace only around `marketplace_reference.png`: sticky service-category/role/price/reliability/availability rail, real summary totals, compact observer banner and search/sort, provider-first cards with genuine artwork, category accents, measured performance, explicit credit units and View Service / Watch Live. Retained meaningful Work orders and receipts. No changes to backend, ledger, runtime, settlement, fees, Pump, or approved Home/Coins/Launch designs.

Six deliberate visual passes reviewed at 1920×1080, 1440×1000, 768×1024 and 390×844, including actual provider artwork, keyboard/mobile filters, long content, busy/unavailable providers, small/no history, error/retry and empty results. Final real-data screenshots have no console errors or horizontal overflow. Full lint, TypeScript, production build, 13 focused unit tests and 10 distinct browser regressions passed; two affected edge cases passed again after the final sidebar alignment fix. Evidence: `qa/marketplace-final/REVIEW.md`. Real data and contract metadata replace the reference's invented figures/art/tags; unavailable histories are omitted. Local self-QA only; no hosted or financial release actions.

## Coins palette and Work filter follow-up — SELF-QA APPROVED

Owner-requested color-only alignment of Coins with Marketplace is complete; approved Coins geometry and functionality are preserved. Marketplace Work now keeps the directory rail and provides order status, category, payment and time filters, search, sort, pagination and a mobile filter sheet. Each tab preserves its own URL filters. Work scope remains the existing latest 100 public autonomous orders and is explicitly labeled.

Three visual passes reviewed desktop 1920/1440, tablet 768 and mobile 390. Fixed tab-switch keyboard focus and narrow Work card identity wrapping. Full lint, TypeScript, production build, 16 focused unit tests and 8 distinct browser scenarios pass; Work scenarios rechecked after final responsive polish. Evidence: `qa/directory-followup/REVIEW.md`. No backend or economic changes; local self-QA only.

## Final three-step Launch — SELF-QA APPROVED

Rebuilt `/launch` to the owner-supplied three-step reference: Identity; Role, Mission & AI Model; Review & Launch. Added persistent live draft preview, checklist, current catalog model cards, all nine actual role templates, required separate mission, inline validation and accessible progression. Preserved managed defaults, automatic service creation/hiring, draft recovery and secure Pump architecture. Ticker casing now survives UI, schema/defaults and database persistence; serialized length validation replaces the former uppercase-only constraint. No runtime, economics or unrelated page redesigns.

Five deliberate visual passes reviewed at 1920×1080, 1440×1000, 768×1024 and 390×844, including empty/completed Identity, Custom, selected model/mission and ready/blocked review. Full lint, TypeScript, production build, 38 focused tests and six browser scenarios pass. Isolated wallet-signing regression confirms unchanged bytes proceed and altered instruction bytes are refused before submission; no actual chain submission. Evidence: `qa/launch-final/REVIEW.md`. Local Pump remains disabled; hosted/mainnet/financial acceptance is not claimed. The final build is running locally for owner review.

## Individual Coin profile — final single-page rebuild, SELF-QA APPROVED

The October 5 owner directive supersedes the former seven-tab profile and earlier Network-tab design. Coin identity and real metrics now lead into one dominant Live Workspace, current status/actions, embedded services, measured performance, outputs, settled relationships, recent activity and Coin details. Actual artwork remains primary; the reference’s decorative cat is intentionally omitted. Old agent/tab URLs map to single-page anchors. Public human access remains observational.

Six screenshot/refinement passes were personally inspected across 1920×1080, 1440×1000, 768×1024 and 390×844. Real uploaded artwork, retained browser frames and professional standby states were reviewed. Search/supplier/output/private/long-name/Pump-link/owner states used explicitly isolated UI fixtures. Replay, zoom, fullscreen, watchlist, copy, links, period controls, Show more and lazy shared-record refresh pass. Lint, TypeScript, production build, 46 unit/integration tests and 17 distinct browser scenarios pass. Database ok / worker online; final build remains on localhost:3000.

Only read-only selected-Coin service scoping and supplier artwork metadata were added to APIs. Runtime, settlement, accounting, economics, auth and Pump behavior are unchanged. Reference differences are attributable to real data/status, no invented runtime/progress and retained history controls. No new live-provider/mainnet/hosted readiness claim. Evidence and reviewed screenshots: `qa/coin-profile/REVIEW.md`.

## Owner PDF bug list — self-QA approved, October 5

Resolved all seven items from the three-page fixes PDF: profile panel alignment, entire Coin-card links, homepage service-button padding, quieter accessible focus, working footer guides, inline header search, and separation between Live Activity and Featured Services. Owner replaced legal-page request with Docs/About/FAQ and removed Terms/Privacy footer entries. Three deliberate visual passes plus final detail checks at desktop/tablet/mobile. Final lint, typecheck and production build pass; 21 distinct affected browser tests passed across focused runs, including final 7/7 Coins/PDF acceptance cases. Local production server restarted. No backend/economics changes or public/mainnet actions. Review: `qa/pdf-fixes/REVIEW.md`.

## Whole-site usability review — local self-QA approved, October 5

Reviewed core pages and observation journeys on desktop/tablet/mobile in three deliberate passes. Fixed non-persistent display contrast, wallet keyboard/focus/scroll behavior, a modal/global-search shortcut conflict, and mobile menu Escape/expanded state. No major document overflow or layout regression found in exercised pages; approved designs and backend behavior preserved. 25 distinct browser scenarios passed, followed by four affected final rechecks; lint, typecheck and production build passed. Local database healthy and worker online. No mainnet, hosted, native-wallet or new live-provider acceptance claim. Detailed scope, reviewed screenshots and limitations: qa/site-review/REVIEW.md.

## OpenRouter multi-model extension — implementation reviewed; credential gate remains

Extended the existing adapter into a usable multi-provider launch catalog: eight exact starter IDs across OpenAI, Google, Anthropic, DeepSeek, xAI, Qwen and Mistral, live catalog/capability/price checks, fail-soft discovery for direct models, model-specific bounded generation, and searchable provider-filtered cards with route/pricing labels. Missing OpenRouter credentials no longer fall back to simulated work. Existing Coin brains, search, economics, settlement and mainnet gates remain unchanged.

Three visual passes at 1920/1440/768/390 plus final polished screenshots reviewed. 60 focused tests, 9 distinct browser scenarios, final two-scenario recheck, lint, typecheck and production build pass. Public catalog metadata verified; no paid OpenRouter generation attempted. Actual local catalog correctly remains direct OpenAI plus development because no OpenRouter key exists in project/process/user/machine environment. Owner action: set OPENROUTER_API_KEY in the project .env; restart and complete bounded live acceptance. Evidence: qa/openrouter/REVIEW.md. Local production server left running.

## OpenRouter-only migration — current October 5, 2026 state

Supersedes the earlier eight-model additive phase and its credential status. Implemented the canonical twenty-model registry, sole OpenRouter gateway, plugin search, legacy brain migration and provider-folder Launch selector. Fourteen choices remain enabled after live compatibility, runtime and unchanged-budget admission checks. Direct OpenAI execution/search is retired. Full runtime successes include Luna, Sonnet, Gemini Flash, GLM and MiniMax. The real GPT-to-Claude settlement retest is blocked by HTTP 402 and zero purchased account credits; no purchase made. Deterministic cross-model settlement passes locally. Current evidence and exact model exclusions: qa/openrouter-migration/REVIEW.md.

## Owner update: premium-model availability

Price/budget alone must not hide approved models. Restored GPT-6 Astra and Grok 4.7: sixteen live catalog choices are enabled. Fable, Qwen, DeepSeek and MiMo remain disabled for availability/response/schema failures. Runtime budget and cost-accounting checks remain intact; restoring selection is not a claim that the prior Astra admission limit or Grok cost discrepancy has passed live retesting. No new paid calls or purchases.

## Funded OpenRouter acceptance — October 5, 2026

All twenty approved models are enabled. Fixed compatibility-harness forced-tool assumptions for Fable/Qwen, reasoning/output-budget handling for MiMo/DeepSeek, context-tier reservation pricing, bounded premium managed policy defaults, interrupted-response normalization and stale error state after recovery. Real full jobs passed for Astra, Grok, Fable, Qwen, DeepSeek, MiMo and Mistral. GPT purchased Claude verification with settled internal payment and measured per-Coin compute; Gemini analyzed the stored result. Continuous waiting, injected-failure backoff/recovery, zero-funds stopping and actual local browser captures verified. Tests ran in isolated TEST_USDC databases and were paused afterwards. Current evidence: qa/openrouter-funded/REVIEW.md. No hosted/mainnet or unbounded reliability claim.

## SIGNAL / PROOF / LENS runtime recovery — October 5, 2026

Owner-launched research exposed gaps not covered by the earlier small arithmetic acceptance: Gemini search admission exceeded its managed run ceiling; Sonnet long reports truncated within the former output allowance/one-minute service window; buyers could purchase from suppliers in budget cooldown; stale health errors hid current execution. Fixed bounded research defaults, concise 3200-token result generation, 120-second generated supplier and 300-second continuous parent deadlines, supplier admission checks, refunded-failure waiting, and durable paid-dependency suspension/resumption. Exact SIGNAL parent recovery preserved its existing payment and audited the previous failure. LENS completed a real report and deferred normally; isolated real Sonnet browser/report passed. PROOF remains in a genuine hourly cooldown; existing three-Coin chain completion after cooldown is not claimed. Current state/evidence: qa/coin-attention/REVIEW.md. 307 tests passed; approved page styling preserved.

## Overnight queue recovery — October 6, 2026

Fixed reused retry-number accounting keys after supplier suspension by keying compute/overage/tool receipts to execution run IDs. Added transactional isolation and financial-reservation-preserving quarantine for inconsistent abandoned receipts, with an honest public error state and audit record. SIGNAL's original parent completed using retained supplier results; LENS completed another analysis; PROOF resumed checks. All three subsequently wait for new useful data. 308 tests, lint, typecheck and production build passed; actual profile inspected. Evidence: qa/overnight-oct6/REVIEW.md. Local recovery verified; a new overnight soak and hosted reliability remain unproven.

## Pump wallet configuration — October 6, 2026

Owner supplied Treasury D3e8Jb3TUoAHFbDN6ShonULzNekhNE5NRHRqycDnc9Fh and separate Collector 5YqYKz8jrRgwXrbbozqC6N3hzMTe7nFzLqr2hetZPudW. Both parse as canonical on-curve Solana addresses and are saved in ignored local .env. This does not prove wallet control, funding or on-chain readiness. Existing SOLANA_RPC_URL is public devnet, not an approved archival mainnet endpoint. Pump RPC, protected collector keypair path, creator allowlist, public metadata origin and active lookup table remain missing. Local demo database remains unchanged; broadcasts and collection remain disabled pending valid live configuration. No private keys requested in chat and no chain transaction submitted.

## Live infrastructure preparation — October 6, 2026

Owner supplied treasury/collector, imported collector locally, configured a working Helius mainnet RPC, and plans a new INDUSTRY domain while reusing suitable Splice infrastructure. Read-only mainnet program/genesis and unsigned ALT planning passed (16 accounts, 1090-byte sample). No ALT or launch broadcast. Prepared separate production Compose/environment/Caddy templates with OpenRouter, default-disabled Pump gates and no test DB reuse. Splice audit found Supabase REST credentials and historical static hosting, but no proven persistent Node host or PostgreSQL login. Deployment/backup/restore/browser parity remain unverified. See deploy/LIVE_PREPARATION.md. Splice remains unchanged.

## Splice shutdown and INDUSTRY cutover — October 6, 2026 (supersedes preceding host audit)

Authenticated Railway browser/CLI and Supabase dashboard access confirmed. Owner explicitly authorized stopping Splice and temporary memesplice.fun reuse. All three Railway deployments stopped; old GitHub sources disconnected to prevent accidental restart. Service history, old variables, Supabase data, Pinata objects and DNS preserved. CLI administrative authorization explicitly confirmed. Owner declined new Railway PostgreSQL in favor of existing Supabase. Prepared private industry schema support with fail-closed search_path and a migration isolation regression (11 staging tests, typecheck and targeted lint pass). Fixed production template's legacy SOLANA_NETWORK to devnet so existing safety gate remains intact; Pump mainnet broadcasting remains disabled. INDUSTRY is not yet hosted: missing existing PostgreSQL password is the concrete blocker; REST API key is insufficient and dashboard only shows password placeholder. Evidence and rollback: deploy/RAILWAY_CUTOVER.md. Public Splice is offline during replacement; no false hosted-ready claim.

## Dedicated INDUSTRY hosted deployment — October 6, 2026

Supersedes the preceding Splice-reuse and missing-password status. Owner created private kamo2s/industry, dedicated Railway industry and Supabase zymgxltobmiknyafwlqr. Code pushed to main; all three services build from GitHub and run independently of the PC. Verified TLS, 17 migrations in private industry schema, isolated private buckets, production Docker builds and fallback HTTPS health (database ok / worker online). 310 tests, lint, typecheck and source secret scan passed. DNS for temporary memesplice.fun updated to the new service; custom HTTPS verification follows propagation. Canonical origin configured consistently. No fixtures migrated, so production starts empty. Chromium installed; hosted capture/paid-work acceptance, wallet signing, soak and backup restore remain unverified. Pump flags disabled and collector key stays local. See deploy/RAILWAY_CUTOVER.md and deploy/LIVE_PREPARATION.md for current resources and limits.

## Phantom authentication network mismatch — October 6, 2026

Removed hardcoded solana:devnet from the optional SIWS Chain ID field. Wallet identity sessions are network-independent; transaction network validation and all Pump/mainnet gates remain unchanged. Domain/URI, nonce, expiry, stored-message signature verification and single-use challenges remain enforced. Regression verifies successful signing without chain binding and rejection of altered messages; existing replay/expiry cases pass (20 economy tests). Typecheck and targeted lint pass. Deploying via main; real Phantom confirmation still requires the owner's wallet.

## Larger launch artwork — October 6, 2026

Owner confirmed hosted Phantom login now works. Launch artwork accepts PNG/JPEG/WebP sources up to 10 MiB (40 megapixel decoded limit), replacing the old 256 KiB input cap and 128px forced crop. Server decodes and validates content, honors orientation, preserves aspect ratio/transparency, strips metadata and outputs up to 1024px WebP within the existing 256 KiB private-storage limit; difficult-to-compress artwork can fall back to 512px. Shared client/server size policy and truthful upload copy added. Ten artwork/image tests pass, including multi-megabyte input, invalid/disguised content, byte ceiling, transparency and no enlargement. No economics or launch gates changed. Previously uploaded 128px images require re-upload for higher quality.

## Hosted owner-only test launch — October 6, 2026

Temporary memesplice.fun deployment now uses APP_ENV=staging, APP_MODE=live and separate industry_test schema. Original industry schema retained. Only explicitly allowlisted STAGING_TEST_WALLETS may create sandbox Coins; staging has no Pump choice and broadcast gates remain false. Real wallet signature required; no development identity shortcut. On successful authentication the approved wallet receives one ledger-backed allocation of 33 TEST_USDC (three normal 10-compute/1-operating launches). Re-authentication cannot refill it. OpenRouter remains real, with $2/day global provider cap and managed per-Coin limits. Prior approved-wallet profile/artwork references copied to preserve drafts; no production balances, Coins or sessions copied. Shared project-wide storage migration 002 recorded from existing verified application; private configured buckets retained. Twelve staging tests, typecheck and targeted lint passed. Owner must reconnect Phantom to authenticate in the isolated schema. No token or financial transaction created.

## Clear Coin service earnings — October 6, 2026

Separated public service earnings (including Coin-to-Coin receipts), net after costs and Pump funding. Preserved eligible revenue for Self-Sustaining and external-only macro totals. Coin profiles, charts, directory sorts/cards, homepage Coin summaries and owner/watch lists now use the correct display measure. 315 tests, production build/typecheck and changed-file lint pass. Three desktop/mobile browser passes reviewed; no layout redesign or economic-policy change. Evidence: qa/income-metrics/REVIEW.md. Hosted verification follows deployment.


## Pump launch enablement — awaiting owner setup signature, October 6, 2026

Owner requested launch enablement. Read-only Helius/program checks passed; production industry schema has 17 migrations, no Coins, no demo seed and no pending launches. Mandatory lookup table is absent; atomic launch without it exceeds Solana packet size. Unsigned lookup create/extend simulation passed at 0.00354068 SOL. Local Phantom handoff page is running at http://localhost:3011 with a 0.0036 SOL ceiling. No signing/broadcast performed. Hosted staging/test Coins remain unchanged; production cutover and owner-allowlisted launch flags follow finalized lookup verification. Collection remains separately disabled. Evidence and next configuration: qa/pump/mainnet-enable/PLAN.md.


## Pump setup confirmed — October 6, 2026

Owner completed lookup-table setup. Finalized on-chain contents/warmup verified and full unsigned mainnet launch simulation passed (949 bytes). Production cutover requested with existing industry ledger, no test-balance migration, owner-allowlisted wallet signing and collector disabled. Public launch access remains the target after controlled acceptance. No token created by Codex. Deployment/health verification follows. See qa/pump/mainnet-enable/PLAN.md.


## Pump shared launch gate correction — October 7, 2026
Owner encountered operator-paused error. Root cause: prior Pump-specific enablement left TOKEN_LAUNCH_ENABLED=false, which requireEnabled checks during prepare and confirm. Verified no database launch pause or emergency pause. Enabled shared gate on all three Railway services; explicitly kept legacy devnet launch disabled. Approved wallet passes both gate functions; unapproved wallet remains rejected. Collector unchanged/disabled. Deployment verification pending; no token transaction signed or broadcast.

Deployment verified: industry-web, industry-database and industry-worker all SUCCESS; hosted health database=ok and worker=online. Shared launch gate correction is live. Actual wallet-signed launch remains user acceptance; no transaction signed by assistant.

## Pump launch receipt, activation repair and optional initial buy — October 7, 2026
Fixed pending-row status overriding verified routing evidence. SIGNAL independently verified and activated from its existing finalized transaction, no new chain action. Launch now retains a readable confirmation/success receipt with mint and links; no automatic redirect or saved-launch jargon. Optional capped wallet-funded SOL buy is part of the atomic create/routing transaction, with zero default and no business-credit subsidy. Readiness includes the shared pause. 321 tests, typecheck, changed-file lint, production build and reviewed desktop/mobile browser states pass. Scope, actual-versus-mocked evidence and protocol constraints: qa/pump/launch-ux/REVIEW.md. Collector remains disabled and owner allowlist unchanged.

## Anonymous artwork, CA profiles and public launch rollout — October 7, 2026
Owner requested these changes and explicitly authorized opening Pump launch access to every wallet. Artwork selection no longer invokes wallet connection or uploads; IndexedDB retains the file locally, and final Launch authenticates then uploads with wallet ownership. Retry reuses the same uploaded asset. Mint lookup resolves the existing business, directory and receipt use CA, legacy profile visits normalize their URL preserving anchors. Pump metadata exposes website and external_url at /coins/<mint>. Explicit public-launch flag removes only the allowlist gate. 323 full-suite tests passed; additional metadata regression passes (324 total tests now), typecheck/lint/build pass. Browser regression at 1920/1440/390 confirms anonymous upload, reload retention, modal only from final review, upload-on-launch and retry reuse. No financial transaction made. Hosted rollout verification follows.

Hosted follow-up verified: f4cfaa3 / 707bc1f deployed on all services, health healthy, publicLaunch=true. PATCH on-chain URI resolves to its exact CA website; old link normalizes and direct CA refresh works. Signed-out hosted image selection no longer invokes wallet login. Collector remains disabled. Detailed evidence: qa/pump/public-launch/REVIEW.md.

## Market data ingestion — October 7, 2026
Added bounded DEX Screener snapshots plus finalized active Pump curve valuation fallback with fresh SOL/USD pricing. Exact mint/pool matching, nullable values, stale hiding and durable refresh claims covered by tests. All 329 tests, lint, typecheck and build pass; desktop/mobile QA reviewed, including mobile hidden-field correction. Hosted rollout verification pending. Evidence: qa/market-data/REVIEW.md. Fee collection/accounting unchanged.

Market rollout verified: ea87689 live on all three services, healthy database/worker; production snapshots for SIGNAL, Patch and stack refreshed automatically across two cycles. Hosted desktop/mobile homepage, directory and expanded mint profile screenshots reviewed. No credentials or owner action required for market display. Collector remains outside this change.

## Shared black-first theme — October 7, 2026
Applied centralized near-black/cyan colors across all pages, with blue/purple/amber metrics and restrained surfaces. Globe retains its behavior with cyan/blue materials. Three visual refinement passes, 14-route desktop/mobile checks, modal/filter/launch interactions and lint/typecheck/production build passed. Measured geometry unchanged; existing layout/type/motion declarations preserved. No data or backend changes. Evidence: qa/black-theme/REVIEW.md. Hosted verification follows deployment.

Theme rollout verified: 969abf1 live on all services; 42 hosted desktop/mobile views passed, database ok and worker online. Shared black/cyan palette confirmed on hosted pages.

## Black theme selective saturation refinement — October 7, 2026
Kept existing black layout; strengthened semantic data colors, localized number glows, fixed category color mapping, purple Self-Sustaining pills, blue waiting and restrained cyan hover. Globe coast/node contrast increased slightly. Three visual passes and browser state assertions passed with lint/typecheck/build. Evidence: qa/black-theme-refinement/REVIEW.md. Hosted verification follows.

Refinement rollout verified: 2a1fe09 live on all services, public health healthy, all 18 hosted main-page desktop/mobile checks passed. Layout geometry comparison remains unchanged.

## Personal Coin economy homepage — October 7, 2026
Replaced lower macro panel with authenticated Your Coin Economy; retained global top KPIs and Live Network. Separate bounded aggregate endpoint, owner isolation, private Coins, funding/unit exclusions, net after refunds, account reset and honest empty/error states. 332 tests, lint/typecheck/build and reviewed 1920/1440/390 browser states pass. Evidence: qa/personal-economy/REVIEW.md. Hosted verification follows.

Personal economy rollout verified: 315a92b live on all services. Hosted desktop/mobile signed-out panel, explicit wallet prompt, no anonymous personal requests and endpoint 401 passed. Authenticated scope verified by integration tests; no user session impersonation.

## Homepage featured services correction — October 7, 2026
Removed dormant-provider exclusion and shared Marketplace ranking/status presentation. Three published services now remain visible with honest unavailable badges. Eight directory tests, lint and production build/typecheck pass; 1920/1440/390 browser checks and three visual passes reviewed. Service links and empty/error states pass. Evidence: qa/featured-services/REVIEW.md. Hosted verification follows.

Featured services rollout verified: 2fcc164 live on web; hosted desktop/mobile checks pass, three published services visible with Unavailable badges, database healthy and worker online.

## INDUSTRY-operated cohort — October 7, 2026
Prepared Atlas (research), Prism (verification), Vector (analysis), Dispatch (reporting), original vector/WebP artwork and public operator disclosure. Dedicated non-login owner, immutable platform mode, CLI-only idempotent provisioning/activation, one-time $3 compute + $0.25 operating per business ($13 total), normal runtime and $2/day global cap. Corrected internal-credit labels to use actual accounting units. Full 336 tests pass; targeted post-review 17 tests, lint and build/typecheck pass. Three visual passes reviewed at 1920/1440/390; twelve local page checks and service navigation pass. Production activation/evidence pending. See qa/platform-coins/REVIEW.md.

Platform cohort activated in production: Atlas, Prism, Vector and Dispatch. Nine completed real jobs and four settled autonomous service orders verified; source-bearing results retained and same-owner external revenue remains zero. Hosted 1920/1440/390 checks passed. Follow-up completes compact homepage service ownership disclosure.

Final homepage service disclosure verified live on desktop/mobile after 31747cd. All four have completed real jobs; later check recorded 14 completions and about 0.143 provider cost. Normal waiting for new input observed. Health database=ok, worker=online.

## Coin header CA — October 7, 2026
Added compact mint copy control next to the profile name/ticker. Desktop/mobile visual and clipboard checks, failure fallback and tokenless exclusion pass; lint/build/typecheck pass. Evidence: qa/profile-ca/REVIEW.md. Hosted verification follows.

CA rollout verified on hosted d37f1c3: desktop/mobile copy, full-address title and tokenless exclusion passed.
## Brand emblem and headline — October 7, 2026
Header and browser icon now use the supplied cube emblem as a transparent vector. Homepage/title copy updated. Three visual passes checked mark/hierarchy, corrected longer-headline wrapping, then reviewed 1920/1440/390 final screenshots with real read-only hosted data. Lint and production build/TypeScript pass. Evidence: qa/brand-update/REVIEW.md.

## Approved hero copy — October 7, 2026
Updated exact owner wording, three headline lines and matching metadata. Reviewed 1920/1440/390 screenshots; no overflow or layout/CSS changes. Targeted lint and production build/TypeScript passed. Screenshots: qa/hero-copy.
Headline line-break follow-up reviewed at 1920/1440/390: An economy / of autonomous / AI businesses. Final line cyan; no other layout changes. Build/TypeScript and targeted lint pass.

## New public domain — October 7, 2026
Owner selected industrypad.fun. DNS, ownership, Cloudflare/Railway certificates verified; HTTPS 200. Public origin and new Pump metadata origin staged across all services. Added permanent old-host redirect preserving paths/queries; local redirect/no-loop check, lint and production build/TypeScript pass. Deployment verification follows.
