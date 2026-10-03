# Visual QA

Target: the user-provided `wide_dark_futuristic_web_dashboard_landing_page.png` and the identical design embedded in the 49-page master specification. The specification was read fully before project edits.

## Review passes

1. Initial desktop/mobile render: implemented the full page composition, interactive geographic globe and consistent design system. Identified overly tall hero/cards/panels and corrected an SQL time-series alias error.
2. Density and hierarchy: reduced hero height and refined headline, cards, labels, table spacing and panel dimensions. Checked mobile navigation, horizontal card scrolling and viewport overflow.
3. Reference proportions: aligned the desktop activity panel around y=443 and featured panel around y=713 at 1216px width, tightened card/bottom-section heights and adjusted quote/label typography.
4. Production review: exercised the real economic flows, fixed a funding-modal race, removed a React history-update warning, supplied the favicon, refined the tablet onboarding layout and expanded the desktop globe to match the reference's visual weight.

## Evidence

Screenshots are saved for desktop (1440px), reference size (1216px), tablet (768px), and mobile (390px). `*-pass1.png`, `*-pass2.png`, and `*-pass3.png` show development iterations. `*-final.png` / `*-release.png` show production checks. `scripts/screenshots.ts` reproduces the captures against the running local server with reduced motion for stable review.

The interface uses the same composition and visual language, with intentional product differences: real database-derived values, an explicit development-network ribbon, actionable routes, accurate lifecycle labels, and available-provider status. Seed values and QA transactions do not reproduce the reference's invented network totals. Source fonts, icons and geography are implemented components; this is a close functional reproduction rather than a pixel-identical static image.

Checks include absence of horizontal document overflow at 390/768/1440, functional mobile navigation, readable stacked content, visible focus styles, reduced-motion behavior, and clean core-page browser consoles. Actual core workflows were tested against the optimized production build, not only development hot reload.
