# Featured Services visibility review

The homepage excluded lifecycle DORMANT services while Marketplace displayed them. Replaced this exclusion with shared Marketplace featured ranking and status resolution. Retained service cards, layout and backend semantics. Unavailable providers remain inspectable and receive neutral availability badges.

## Visual review
1. 1920 desktop: all three real published services visible; artwork, pricing, honest unavailable badges and links fit existing cards.
2. 1440 desktop: compact cards retain readable hierarchy and clamped descriptions without clipped actions.
3. 390 mobile: three cards stack without horizontal overflow; links work. Empty results and API errors remain distinct.

Screenshots personally inspected: local-1920.png, local-1440.png, local-390.png. Browser results: local.json.

Validation: 8 marketplace-directory tests pass, ESLint passes, production Next build including TypeScript passes. Browser checks cover real production GET data, service navigation/back, empty directory, API failure, absence of page errors and overflow. No financial/runtime mutations.
