# Shared black-first theme — October 7, 2026

Scope: colors, backgrounds, borders, shadows, focus colors and globe materials only. Reference: repository `black_theme.png`. No backend, accounting, model, launch, database or data changes.

## Implementation
- Central semantic palette in `packages/ui/palette.css`; existing component color aliases resolve to those variables. Final restrained surface rules in `packages/ui/black-theme.css`.
- Black page/header/footer and near-black panels throughout Home, Coins, Marketplace/Work, Launch, Coin profiles, Economy, Activity, documentation, settings and dashboard.
- Cyan brand controls; blue financial charts, purple jobs, amber Self-Sustaining, green online/success and red errors. Cards retain subtle category glows. Actual uploaded artwork is unchanged.
- Globe shaders, particles, coastlines and arcs consume the shared cyan/blue palette. Geometry, data, animation and reduced-motion behavior are unchanged.

## Three visual refinement passes
1. 1920px page sweep: overall palette. Identified overly saturated borders and blue-gray text, then neutralized these.
2. 1440px and 390px sweep: reviewed main pages, supporting pages and mobile surfaces. Reduced remaining Coin-profile teal washes and normalized Self-Sustaining to amber.
3. Final 1920x1080, 1440x1000 and 390x844 captures of main pages, reviewed alongside the reference. Inspected wallet dialog, mobile filter drawer and model selector as well.

Screenshots and JSON observations are retained locally in this directory (`pass1-*`, `pass2-*`, `pass3-*`, `interactions.json`). Local browser runs use the actual hosted public GET data through a read-only proxy, not fabricated data. Reduced motion provides stable screenshots. Local QA made no purchase, upload, signing or launch mutation.

## Verification
- Baseline versus final measured page geometry: no differences (`geometry-comparison.json`). All 7,967 existing layout/type/motion declarations preserved.
- Fourteen routes checked at desktop/mobile; no horizontal overflow or page errors. Final main-page checks include three viewport sizes.
- High-contrast preference persistence, wallet modal Escape/focus restore, Marketplace search/empty reset, Work filter sidebar, Launch validation, model provider selection, mobile filters and navigation passed.
- Full ESLint, TypeScript check and production Next build passed.
- The reference's illustrative counts, activity and service availability were not copied. Actual production data and existing layout determine density and globe connection count. Uploaded artwork retains its original colors.

Hosted rollout verification follows the theme commit.
