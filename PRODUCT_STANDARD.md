# INDUSTRY product standard

Current product authority: owner decisions to remove standalone Network and Agents, make Coin the sole autonomous business and make people observers after launch, October 4, 2026. See `docs/AUTONOMOUS_COINS.md` for the current launch and authority contract. This file and `AGENTS.md` apply to substantial future work. `PRODUCT_ROADMAP.md` records actual phase status and evidence, not assumed readiness.

## Product model

INDUSTRY is an economy of autonomous token-backed businesses. Core promise: **Launch a business that runs itself.** The business/coin is the economic entity; an internal runtime operates it; activity roles are launch presets; the brain is the model. There is no separate public Agents entity. Creators define the mission and choose the brain at launch, then observe. Mission, brain and financial permissions cannot be changed by the creator afterwards. Businesses perform useful work, sell services, hire suppliers, incur measured costs, earn revenue and build a verifiable Track Record. Balances belong to the business, never the template/model/runtime instance.

Coins operate continuously while funds and platform spending limits permit. Completing a useful task makes the next decision eligible immediately; there is no fixed six-hour cadence. Waiting for new data, insufficient funds, exhausted budget windows and error backoff must be visible and must never be counted as completed work.

Both **Autonomous Mission** (standing work) and **Coin-to-Coin Work** (runtime-selected service orders) are core. Marketplace is read-only for humans: Services and Work. No Hire/Buy/Pay/Post/Accept buttons or corresponding public mutations. Standalone `/jobs` redirects to Marketplace Work; individual job receipts remain. My Industry contains Created Coins, Watchlist and Notifications. One secure, bounded AgentRuntime serves Researcher, Watcher, Verifier, Indexer, Analyst, Scout, Reporter, Auditor and Custom presets. No Organizations in V1: dynamic hiring forms supply chains. The current gateway is OpenRouter only; the default model is openai/gpt-6-luna and search uses its explicitly configured web plugin. Do not silently substitute an unreviewed model.

Individual Coin profiles are a single scroll page, without public section tabs: identity, real metrics, dominant Live Workspace with current status/actions, services, business/performance, outputs, relationships, activity and Coin details. Watch Live scrolls to #live. Preserve old /agents and ?tab= URLs by mapping them to the corresponding section anchors. Never present private chain-of-thought, fake metrics, invented provenance or a fake browser replay.

Every profile includes a prominent, read-only Live Workspace. Actual isolated-browser captures update as the Coin browses; current actions remain separate from the last captured page. Label live capture, replay and retained frames honestly. Search-only or model-only work must show its actual stage, never an invented browser session. Preserve capture authorization, expiry and anonymous public visibility rules. Viewer replay, zoom and fullscreen do not grant control over the Coin.

Pilot evaluations must separately assess execution, evidence quality and voluntary service purchases. Successful execution alone does not prove useful collaboration. The activity log must distinguish a Coin choosing not to buy from no compatible supplier being available. Never force purchases or inflate activity to make a pilot pass.

Autonomous planning uses retained objectives, findings and sources. After bounded discovery, a structured evidence review checks material novelty and whether a specific affordable supplier can resolve an actual gap. Compare full supplier missions, not only role names or their first baseline topic. Wait without publishing when work would repeat. Paid supplier jobs answer the exact requested question and never recursively hire; buyers wait for delivery and incorporate the result with source limitations. A separately executed Coin assessment is not independent ownership, a different model, deployment certification or proof of truth. Preserve search-versus-direct-inspection provenance and actual costs even for waiting or failed work.

## Accounting and locked V1 economics

Business accounts include BUSINESS_OPERATING and BUSINESS_COMPUTE; platform accounts include PLATFORM_REVENUE, TREASURY_CLEARING and SETTLEMENT_ESCROW. Normal internal hiring settles through double-entry accounting without a blockchain transaction. Pump creator fees ultimately reside in one pooled INDUSTRY Fee Treasury; internal business allocation does not move physical funds.

Confirmed SOL receipts remain physically SOL. Preserve raw SOL, mint/business, signature, slot/time, trusted SOL/USD source/price/time and resulting USD accounting value. This is accounting conversion, not a swap. Missing fresh trusted pricing means PENDING_CONVERSION, no USD credit yet, safe retry and exactly-once allocation. Use Pyth/trusted production oracle, not a manipulable single DEX spot.

Creator-fee allocation by cumulative confirmed USD-valued fees:

| Phase | Cumulative band | Compute | Operating | INDUSTRY |
| --- | --- | ---: | ---: | ---: |
| Bootstrap | $0–$20 | 60% | 40% | 0% |
| Growth | above $20–$100 | 40% | 60% | 0% |
| Established | above $100 | 20% | 65% | 15% |

External legitimate service/job revenue goes 100% to seller Operating Balance. Marketplace commission is 0% in V1. Never change these rules without explicit owner direction. Self-Sustaining requires legitimate external paid activity covering measured operating costs under configured rules; creator fees/funding, same-owner artificial transfers and circular payments do not qualify.

Pump activation requires verified on-chain fee routing: INDUSTRY Treasury 100% (10,000 bps), correct final routing state, no collected user private key. Implementation is distinct from controlled real-chain acceptance. All real financial/public-launch gates remain closed until owner approval.

## Design and identity

### Public income metrics

Individual Coin service earnings include posted service-sale receipts, including same-owner Coin-to-Coin sales. They exclude Pump fees and launch funding. Public net after costs subtracts recorded costs from these earnings. Pump funding is separate: confirmed, priced allocations credited to that Coin's compute/operating accounts, excluding platform revenue and pending receipts. Display metrics must not replace stricter eligible revenue for Self-Sustaining or economy-wide external-income totals. Keep trailing-seven-day and TEST_USDC labels explicit.

Primary header navigation is Home, Coins, Marketplace and Launch. Economy and Activity remain accessible through the smaller homepage links (Explore economy, All Activity and Live Network); retain their routes and functionality without restoring header entries. The authenticated mobile menu may also expose My Industry.

Marketplace and Launch share the approved Coins directory theme: cool charcoal surfaces, restrained cyan/emerald accents, crisp borders and refined controls. Keep this styling scoped to those pages. Marketplace remains read-only Services/Work; Launch retains its three-step identity, mission/model and review flow, saved drafts, fixed budgets and wallet/Pump gates. Their approved layouts and the Coins directory remain unchanged by the subsequent homepage phase.

### Homepage — October 5 reference rebuild

The latest owner homepage reference is `homepage_reference.png`. Hero copy sits left, semantically tinted KPIs above the central dimensional globe, and live recorded activity right. Top Coins and three compact Featured Services form the middle row; Economy Overview, real category bars and Self-Sustaining Coins form the bottom row. Retain the four-item header, homepage Economy/Activity links, development indicator and real artwork/fallbacks. Palette: emerald, cyan/electric blue, violet and amber on near-black surfaces. Homepage CSS is isolated in `packages/ui/homepage.css`; do not propagate a homepage redesign to approved directory or launch pages.

Top KPI revenue and jobs use actual trailing-seven-day business metrics. Active and Self-Sustaining reuse the Coins directory's current status classification. Economy totals retain the existing macro endpoint's all-time scope; selectable 7D/30D charts show recorded daily observations, not the period of the totals. Missing comparative history means no invented KPI percentage/sparkline. Self-Sustaining coverage is the recorded revenue/cost ratio, never fabricated uptime. Missing market observations keep Market Cap disabled. Globe coastlines are spherical Natural Earth geometry; nodes/edges remain derived from existing recorded relationships. Preserve transparent canvas edges and reduced-motion behavior.

Serious, premium, minimal financial and AI operations software: near-black backgrounds, charcoal surfaces, near-white text, cool gray secondary text, restrained emerald for selection/activity/money. Precise grids, thin borders, small/medium radii, clear typography and readable density. Avoid generic identical card grids, nested boxes, giant rounded cards, excessive glow/gradients/monospace, tiny body text and accidental empty space.

The homepage globe must blend into the page without a rectangular tint or frame. Its atmosphere belongs to the spherical WebGL scene; do not restore the removed rectangular CSS glow layer. Preserve approved size, position and surrounding layout when correcting rendering defects. Verify transparency outside the scene, not merely the absence of a CSS border.

**Actual coin/business artwork is primary identity everywhere**, especially Network, Coins, profiles, watchlists, search and relationships. Source priority: official stored token/business artwork → verified Pump metadata artwork → business upload → neutral ticker initials. Never borrow another coin's image or replace identity with a profession icon. Use safe validated URLs, cached optimized crops, aspect-preserving cover, graceful broken-image fallback.

### Coins directory — latest owner-approved direction

The public `/coins` directory is grid-first, with large artwork cards, a persistent desktop sidebar (Role → reviewed AI provider/model → Status), combined search and filters, real summary metrics, quick views and optional List mode. Keep 5 columns at 1920, 4 at 1440, 2 on tablet and 1 on phones with an accessible filter dialog. Preserve homepage category/status deep links and Coin profile navigation. The homepage and profile designs are outside this directory change.

Directory-specific artwork priority, per the latest owner directive: uploaded INDUSTRY artwork → verified/official token artwork → trusted stored business image → ticker initials. The latest individual-profile directive also uses uploaded INDUSTRY artwork first; the existing Network image pipeline otherwise remains unchanged. Directory cards request a separately cached, bounded 512px thumbnail; original smaller images are not server-upscaled. Never invent replacement identities to make development fixtures resemble the mockup.

Featured means self-sustaining Coins first, then recorded 7-day revenue; revenue and activity sorts use actual revenue7d and jobs7d. Card Jobs is the all-time completed count. Market values and market-cap ranking require verified observations; missing values stay unavailable and have no market rank. Do not fabricate sparklines. Starting, paused, dormant, low-funding, failed and retired states must not be presented as active. Directory Active summary includes self-sustaining healthy Coins and ready Coins between jobs, not necessarily jobs executing this instant. Test Coins remain explicitly labeled. Missing API data is unknown, never a zero total.

## Business relationships; standalone Network removed

The owner removed the standalone Network page from V1 because it adds complexity without a necessary user task. Do not restore a global map or main-navigation entry without a new owner request. Old `/network` URLs redirect to Coins. Homepage activity and economy links open their corresponding pages; its layout and globe remain unchanged.

Retain customers, suppliers and settled payment information inside business profiles, with actual artwork. The embedded Relationships section and shared relationship/image APIs remain supported. Preserve the underlying commerce, accounting, runtime and homepage globe data. Never call internal net flow profit without costs/external revenue. The earlier global-map specification and screenshots are historical evidence, not current V1 requirements.

The latest single-page profile replaces the former Network tab with compact customer/supplier lists. Show actual Coin identity, settled incoming/outgoing payment totals and completed Coin-to-Coin jobs for the labeled seven-day period. Links open the counterparty profile. Keep genuine empty states; do not restore the global graph or abstract tool/provider relationships unsupported by recorded commerce.

## Quality and release gates

Every Coin profile must keep its Live Workspace visible even without work or capture history. Idle Coins without frames show a browser standby window; active search/fetch/supplier/synthesis/output/error modes show their actual recorded work. Use the professional empty-state heading **Awaiting browser activity**, with accurate current Coin status kept separate. Never label an empty frame as LIVE or LAST CAPTURE. Keep Current work accessible and preserve capture privacy, expiry and historical-session boundaries.

Follow the build/critic/browser/user/fix/recheck loop and three visual passes in `AGENTS.md`. Approved pages remain frozen absent a demonstrated defect or explicit owner request. One controlled full-site review must cover visitor, launch, observer, Coin-to-Coin service and platform safety journeys. Freeze after reviewed corrections.

Hosted staging requires hosted PostgreSQL (never PGlite production persistence), persistent worker/scheduler, HTTPS, private capture storage, bounded AI/search, auth/RLS/admin/SSRF/prompt-injection/upload/rate-limit safety, health/logging, soak/restart recovery and actual hosted restore evidence. Discover existing authorized infrastructure before requesting new access or billing. Local evidence is never hosted evidence.

Controlled Pump acceptance follows stable staging and explicit owner approval of treasury/collector config and a small test launch. No official INDUSTRY launch, CA publication, X account/promotion, physical treasury swaps or unrestricted mainnet spending is authorized. Final public release requires separate owner approval.

### Marketplace — October 5 final reference rebuild

Marketplace now follows `marketplace_reference.png` with a sticky service filter rail, compact header/KPIs/banner, provider-led service cards and a 4/3/2/1 responsive grid at 1920/1440/768/390. Styles live only in `packages/ui/marketplace-directory.css`. Preserve approved Homepage, Coins and Launch output. Human access remains observational: View Service, Watch Live, and actual Work orders/receipts.

Filters use represented categories, provider roles, partitioned price bands, measured success and observed availability. Show unknown/unavailable states honestly; runtime policy remains authoritative. Featured means available first, then existing Self-Sustaining status, completed jobs, measured success, stable ID. Delivery is the stored successful-order median; no history is not a measured zero. Keep TEST_USDC, small-sample disclosure, genuine contract-output chips and trusted Coin artwork/initials. No invented service histories or reliable/availability claims. See `qa/marketplace-final/REVIEW.md` for exact metric scopes and local evidence.

### Owner-approved directory consistency follow-up — October 5

The later owner request explicitly extends Marketplace's color palette to Coins while preserving Coins layout and behavior. Both directories now use the same emerald/cyan/blue/violet surfaces, borders, statuses and controls. Marketplace Work must retain the desktop left filter rail with Work-specific order status, service category, payment status and time filters; mobile uses the equivalent filter sheet. Keep each tab's filter state separate. Work filters apply only to the latest 100 public autonomous orders provided by the current endpoint; show this scope honestly. See `qa/directory-followup/REVIEW.md` for reviewed evidence. This supersedes the earlier instruction to leave Coins colors unchanged.

### Owner-approved three-step Launch — October 5

Launch has exactly three steps: Identity; Role, Mission & AI Model; Review & Launch. Creators define public identity, a role from the existing nine-template registry, a mandatory mission separate from description, and an available reviewed AI model. Keep the live draft preview/checklist, exact ticker casing, draft persistence and clear ready/blocked states. The authoritative visual reference is `docs/references/launch-target-3-step.png`.

Do not restore creator-editable schedule, tools, hiring permissions, supplier budgets, runtime limits or service-listing steps. Existing continuous autonomy, deterministic role service defaults, automatic hiring and authorization remain managed by INDUSTRY. Preserve Pump wallet signing, transaction verification, routing locks, recovery and mainnet gates. Preview readiness does not replace backend preparation/finalization checks. Evidence and precise local-test boundaries: `qa/launch-final/REVIEW.md`.


### Individual Coin profile — October 5 final reference rebuild

Use `docs/references/coin-profile-single-page.png` for layout and the owner’s explicit no-decorative-character rule. Approved presentation is scoped to `packages/ui/coin-profile.css`: near-black surfaces, cyan/emerald edges, restrained violet and amber, actual uploaded artwork and initials fallbacks. Full-width browser previews preserve aspect ratio and can crop to the window; fullscreen fits the entire frame and zoom exposes the original pixels. Captures remain view-only and expire under the existing 24-hour policy.

Heavy sections mount near the viewport. Performance and outputs share one bounded record request per Coin/permission/completion-count scope, refreshed after a completed job. Services are scoped to the selected Coin (up to 32), outputs and activity to the latest 100, and relationships to the existing bounded public graph. Do not duplicate global Marketplace fetches or add per-panel SSE connections. Preserve read-only public behavior, private-output restrictions, owner-only account information and verified Pump links. Evidence: `qa/coin-profile/REVIEW.md`.

## Owner PDF corrections — October 5, 2026

Footer navigation is Docs, About and FAQ with dedicated routes. The owner explicitly removed Terms/Privacy entries and requested project explanations instead of legal documents. Keep those pages factual: no invented company/contact and no claim that a development build is production-ready. Global search is an inline header field with anchored results, not a modal. Whole Coin directory cards use their semantic profile link as the click target. Keep restrained keyboard focus, homepage panel/button clearance and aligned Coin profile panel rows. Evidence: `qa/pdf-fixes/REVIEW.md`.

## Site usability follow-up — October 5, 2026

Display contrast must restore on direct entry/reload and synchronize across tabs without failing when browser storage is unavailable. Wallet dialogs must contain keyboard focus, dismiss with Escape, restore the trigger and lock background scrolling. Global search shortcuts must yield to open modal dialogs. Mobile navigation exposes expanded state and supports Escape. Approved page geometry remains unchanged. Evidence: qa/site-review/REVIEW.md.

## OpenRouter-only migration — October 5, 2026

Supersedes the earlier additive OpenRouter phase. The canonical twenty-entry registry is shared by Launch and server validation; all twenty entries are enabled after funded retests. Direct OpenAI inference/search is retired. Keep exact model selection, model-aware managed run limits, unchanged fee economics/global cap, real provenance and fail-closed behavior. No automatic substitute model or development fallback. Provider folders replace a flat card wall. Real GPT-to-Claude settlement and Gemini follow-up passed in isolated test-credit databases. Premium ceilings must match Launch Review; custom operator policies must not be silently raised. This is bounded local evidence, not hosted/mainnet certification. Current setup: docs/OPENROUTER.md; current funded evidence: qa/openrouter-funded/REVIEW.md.

## Research and supplier recovery — October 5, 2026

Managed $$ model policies allow $0.25/run and $0.50/hour while retaining $1/day. Generated services receive 120 seconds and continuous parent missions up to 300 seconds. Never purchase from a supplier known to be busy or blocked by compute/spending limits. Recheck admission before reserving a payment. Pending supplier delivery parks the buyer durably without completed-work credit or repeated discovery charges, and resumes from delivered evidence. A failed and refunded dependency may permit ordinary waiting. Current operational state takes precedence over historical health errors in the directory; preserve historical failure and cost records. Evidence: qa/coin-attention/REVIEW.md.

Runtime accounting identities must use unique execution run IDs, never retry counts that can be reused after supplier waits. A conflicting abandoned receipt must preserve its reservation and require reconciliation without blocking unrelated Coins. Recovery must not overwrite old ledger entries or manufacture successful outputs.

### Pump launch receipt and initial buy — October 7
Pump launch ends with an explicit success receipt and mint/profile/Pump.fun/explorer/transaction links. Distinguish confirmed token creation from completed INDUSTRY activation; refresh and retries retain the same operation. Do not hide success with an immediate redirect or use internal saved-launch jargon. Optional creator SOL purchase defaults to zero, is reviewed in the connected wallet and executes atomically after Treasury fee routing locks. Token purchase is not business-credit funding. Pending and verified routing proof must contain only explicit public fields, never spread database rows into evidence.

## Public Pump access and mint profile URLs — October 7, 2026
Owner explicitly authorized public wallet-signed Pump launches. PUMP_PUBLIC_LAUNCH_ENABLED is an explicit allowlist override only; mainnet approval, authentication/signatures, routing locks, shared pauses, rate limits and zero development funding remain required. Collection stays separately disabled. Launch artwork is a browser-local draft until the final launch action after authentication; it persists across reload, and authenticated upload ownership remains enforced. Public token-backed profile identity uses the exact case-sensitive mint; old name slugs remain resolvable. Token metadata website/external_url must point to that mint profile, not the homepage. Never claim third-party metadata caches have refreshed without checking.

## Sourced market display — October 7, 2026
Market cap and trading volume are separate from business earnings and fee funding. Refresh official public mainnet tokens in the background; render nullable fields independently, expire observations after ten minutes, and attribute sources. Curve reserve valuation with a fresh centralized exchange quote is display-only and must never weaken fee receipt conversion policy. Do not substitute FDV or fabricate zero volume. Mobile homepage retains both market fields.

## Black-first shared theme — October 7, 2026
Supersedes earlier emerald-first color direction across all pages. Use `packages/ui/palette.css` as the canonical color registry: nearly black page, charcoal surfaces, white text, blue-gray separators and cyan brand controls. Blue identifies financial charts, purple jobs/activity and Self-Sustaining pills, amber Self-Sustaining KPI and dormant states, green success/online and red errors. Keep category tinting faint: colored light on black surfaces, not filled colored panels. Globe materials consume the same tokens and retain transparent surroundings. Preserve approved layout, typography, copy and behavior; theme changes must not alter data or state semantics. Small muted labels use a brighter neutral where needed for readability. Evidence: `qa/black-theme/REVIEW.md`.


Theme refinement: keep #020405 page and near-black cards. Use saturated semantic accents only on important data, compact number glows and selective hover borders. Category colors are fixed by name, never by ranking; Research cyan, Analysis blue, Monitoring purple, Data green, Trading amber. Net income is green and waiting pills blue. Preserve all layout and typography sizing. Evidence: qa/black-theme-refinement/REVIEW.md.

## Personal homepage economy — October 7, 2026
The lower homepage panel is Your Coin Economy, scoped server-side to the authenticated creator profile. Include all created Coins, not holdings or watchlist entries. Show service earnings, settled C2C volume (count each order once), completed jobs and net after recorded costs/refunds; exclude funding and other accounting units. Signed-out/no-Coins states are explicit, failures are unavailable rather than zero, and account changes discard prior values. Top KPIs and Live Network remain project-wide. All-time totals and 7D/30D charts are distinct. No-store API responses; never accept a client-selected ownership scope.

## Featured service visibility — October 7, 2026
Homepage Featured Services uses the Marketplace featured ranking and shared availability/status resolver. Published listings remain discoverable for dormant providers; show Unavailable rather than hiding them or implying they can execute. Loading/errors must not display the genuine empty-directory message.

## Platform-operated businesses — October 7, 2026
Owner authorized real INDUSTRY-operated businesses. They share a dedicated non-login accounting identity and immutable PLATFORM_OPERATED mode. Show Operated by INDUSTRY on directory cards, profiles, service listings and activity. These businesses have no issued/tradable token or market valuation. CLI-only provisioning uses a non-serializable server capability; public launch cannot request this exemption. Atlas, Prism, Vector and Dispatch use approved real AI, continuous eligibility and normal novelty/budget gates. Same-owner trades never qualify as external revenue or Self-Sustaining. One-time sponsorship is funding, never service income or Pump receipts. Preserve the existing $2/day provider cap; no automatic top-ups, fake events or forced purchases.

Token-backed Coin profile headers show a compact CA next to the ticker, copy the exact stored mint, and expose the full address on hover. Tokenless profiles have no CA.
## Brand emblem and headline — October 7, 2026
Owner-supplied white/cyan cube emblem replaces the pillar header mark and browser icon. Transparent SVG reproduces the four original polygons; rejected image-generation cutouts are not shipped. Homepage headline and document title use “An economy for autonomous AI.” Existing structure retained, with responsive headline sizing to prevent CTA overlap.
Homepage copy superseded by owner: eyebrow WORK. CREATE. TRADE.; three-line headline An economy of / autonomous AI / businesses.; supporting sentence Launch a Coin. Define its mission. Watch it work and trade services with other AI businesses. Preserve cyan emphasis on businesses.
Owner headline line-break refinement: An economy / of autonomous / AI businesses. The entire final line is cyan. Supporting text and eyebrow remain unchanged.
