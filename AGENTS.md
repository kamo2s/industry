# INDUSTRY permanent engineering and QA instructions

Before every substantial INDUSTRY task, read this file, `PRODUCT_STANDARD.md`, and `PRODUCT_ROADMAP.md`. Read more specific directory instructions too. Keep these documents current after each reviewed phase. The owner's latest instructions override older project documents.

## Completion means reviewed product quality

Compilation, passing tests, an existing component, or an implementation report alone do not complete a task. Completion requires correct functionality, acceptable visuals, understandable UX, responsive behavior, preserved security and architecture, relevant edge-case coverage, inspection of the actual running product, **reviewed** screenshots and interactions, and a result suitable to show publicly. Distinguish implementation ready for review, self-QA approved, and owner/public-release approval. Never claim hosted, mainnet, restore, or live-provider evidence from a local simulation.

For meaningful work repeat: **Build → Critic → Browser QA → First-time-user QA → Fix → Recheck**. Critique the work as if another engineer wrote it. Fix objective problems without asking the owner to supervise ordinary engineering decisions.

Meaningful UI work requires at least three deliberate visual passes: (1) purpose, structure, hierarchy; (2) spacing, alignment, typography, proportions, density; (3) interactions, responsiveness, edge states and polish. Inspect actual screenshots at 100% zoom at 1920×1080, 1440×1000 and 390×844; use 768×1024 when relevant. Look at the screenshots, do not merely capture them. Continue if problems remain. Ask whether a first-time visitor understands the purpose within five seconds, sees the main information and next action, and encounters readable, intentional, useful UI without duplication or accidental blank areas.

## Product and scope boundaries

Follow `PRODUCT_STANDARD.md` for the business-first model, visual identity, fixed V1 economics and safety gates. Reuse established systems rather than repeatedly rebuilding them. Preserve unrelated dirty files and user data. Never print secrets. Use real stored metrics and honest empty/error states; no invented revenue, fake browser activity or private chain-of-thought. Business artwork is primary identity; profession icons are secondary metadata only.

Approved pages are frozen except for demonstrated bugs or explicit owner changes. A controlled full-site QA pass is not permission to redesign every page. Check affected journeys and tests, current architecture/security boundaries, loading/error/empty states and mobile. Run appropriate checks once, and repeat when subsequent changes justify it.

## Autonomous work and external gates

Continue implementation, reviews, tests and independent preparation without asking routine engineering questions. Record exact external blockers and continue other independent work. Audit existing authorized infrastructure before requesting accounts. Never invent credentials or buy services. Hosted staging must use persistent hosted PostgreSQL and services independent of the owner's PC, with HTTPS, bounded provider spend (approximately $2/day unless deliberately changed), security, recovery and actual backup/restore evidence.

Require owner authorization for external access that is unavailable, billing, final treasury/collector wallets, mainnet/value actions, irreversible launch, official public communications and major product/legal strategy. Do not autonomously create financial wallets, broadcast Pump transactions, launch the official token, publish a CA, create/promote X accounts or enable unrestricted mainnet spending. Prepare a concrete reviewable result before requesting a gate. After stable hosted staging, prepare controlled Pump acceptance, but stop before real value/mainnet action without explicit approval.

## Continuity and reporting

Update the roadmap with evidence, remaining limitations and exact blockers after each self-approved phase. Correct contradictory current docs; preserve older evidence with a historical label. Maintain `pnpm readiness` with secret-free READY / OPTIONAL / DISABLED / BLOCKED / MISSING states. Public readiness requires tests, lint, typecheck, build, reviewed browser QA, secret/dependency checks, RLS/auth/ledger/Pump/provider/SSRF/admin safety, no known unresolved critical/high issue, operational monitoring and verified restoration.

Keep owner reports concise: TASK, STATUS, ITERATIONS, VERIFIED, FIXED, NEXT, HUMAN ACTION REQUIRED. Put detailed engineering evidence in project artifacts. Do not confuse self-QA approval with owner authorization to launch publicly.
