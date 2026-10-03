# INDUSTRY final visual polish

Reviewed on 2026-10-03 against the supplied INDUSTRY PNG. The approved layout is preserved: this pass changes lighting, surface paint and motion. Backend, API, authentication, wallet, database, worker, jobs and data subscriptions are unchanged.

## Visual verification

Microsoft Edge, 100% zoom, device scale factor 1. Desktop captures use the same 1440 × 1000 viewport before and after. Additional checks use 1216 × 1296, 768 × 1024 and 390 × 844.

| Pass | Inspection and refinement | Evidence |
| --- | --- | --- |
| Baseline | Captured the approved layout and measured its geometry before editing. | [Top](baseline-desktop-top.png), [bottom](baseline-desktop-bottom.png), [measurements](baseline.json) |
| Initial implementation | Added depth attenuation, local node lighting, soft halos, varied selected arcs/pulses, glass labels, layered charcoal surfaces, restrained hover illumination and payment-only highlights. | [Top](initial-desktop-top.png), [bottom](initial-desktop-bottom.png), [measurements](initial.json) |
| Additional refinement 1 | Comparison exposed too distinct an atmospheric rim. Reduced its radius and softened its Fresnel falloff; changed the quotation graphic to a quiet filled mark. | [Top](pass1-desktop-top.png), [bottom](pass1-desktop-bottom.png), [measurements](pass1.json) |
| Additional refinement 2 | Softened card boundaries and chart glow; kept status-dot breathing to opacity and floating labels to composited transforms. Checked desktop and mobile again. | [Top](pass2-desktop-top.png), [bottom](pass2-desktop-bottom.png), [measurements](pass2.json) |
| Final production review | Repeated the geometry/overflow/console checks on the optimized build and visually reviewed the complete desktop and mobile pages against the reference. | [Top](final-desktop-top.png), [bottom](final-desktop-bottom.png), [desktop](final-desktop.png), [mobile](final-mobile.png), [measurements](final.json) |

The initial implementation and both additional refinement passes each capture top, bottom and full-page views at all four viewport sizes. The reference remains a comparison asset; the page uses HTML, CSS, SVG charts and real Three.js geometry.

`scripts/visual-polish.ts` compares x, y, width and height of 13 regions against the baseline, plus headline, supporting text, button and statistics font size/line height. There are no geometry differences above the 0.5px check tolerance, no changed measured text sizes and no horizontal overflow. At 1440px the content starts at x=36; the hero remains 1368 × 468px, the activity panel 1017 × 308px, and the quote panel 339 × 308px. The max-width, grids, margins, responsive layout and overall footprint were not changed.

## Motion and idle observation

The running page was exercised through real browser interactions and inspected through captured animation frames, hover/loading/chart captures and the recorded sequence. [Motion recording](motion-review.webm), [machine-readable samples](motion-review.json), [30-second globe sequence](idle-globe-sequence.png).

- The three-dimensional globe turns at 0.006 radians/second. Its desktop particle count remains 36,318; the constrained/mobile count remains 18,932. Foreground particles brighten, the far side is occluded, and selected nodes illuminate nearby surface particles.
- Selected node halos breathe slowly; selected arcs intermittently transmit small pulses with faint trails. Floating labels drift only a few pixels on a ten-second cycle. Most of the interface remains still.
- A real development SEARCH service job was queued before the hands-off observation. During the following 30 seconds no input, navigation or data mutation was sent. The existing worker completed the job and SSE refreshed the actual feed and job counter. No timer-generated fake feed events or mocked API values were introduced.
- The activity panel's top position stayed constant through the observation. Incoming rows fade in from 5px below, and only payment/earning amounts briefly glow. Sampled frames confirm live counter interpolation and row opacity animation.
- Hero reveal/counter frames and progressive skeletons were captured. The loading check delays delivery of the real agents API response without changing its contents.
- Primary buttons lift 1px on hover; agent cards lift 3px with a brighter border and icon. Keyboard focus remains visible. Navigation hover and navigation to the actual Agents route work.
- Charts draw progressively from left to right and complete at path length 1. Green, violet and orange accents follow the existing real chart values.
- Reduced-motion emulation freezes globe rotation and disables label drift, status breathing and payment flashes. Mobile keeps the existing responsive composition, with reduced particle/effect costs.
- Browser console and page-error collections are empty. The final production observation lasted 30.123 seconds. All six initial visible-globe samples and the six settled idle samples reported 60 FPS. A first sample after returning from offscreen includes the intentional offscreen render suspension and is not a steady-state performance measurement.

## Functional checks

Lint, TypeScript, the optimized production build, all 63 unit/integration tests and all four browser tests passed. Browser tests cover signed development-wallet login, launch, worker execution, funding/policy, service purchases, responsive navigation, core-page console checks and security cases. QA uses the existing test economy and retains its real test records.

The local production build is served at http://localhost:3000 with the persistent database and separate worker. Mainnet remains disabled. New jobs, counters, earnings and activity continue to reflect the database, so their displayed values can differ between screenshots.

Reproduce while the app is running:

```powershell
node --import tsx scripts/visual-polish.ts final
node --import tsx scripts/motion-review.ts qa/polish --idle
```
