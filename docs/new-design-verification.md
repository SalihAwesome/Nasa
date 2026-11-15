# New design verification

Completed 15 November 2026 for the user's navigation and ranked-results screenshots and the Google Earth integration. The PR is named `new design` and supersedes the paused draft #36; it builds on the feature branch in #35.

## Result

The header separates the brand, assistant and theme controls from five spacious tool tabs. Navigation is 16px, body copy 17px and supporting metadata 15px. The active tab has a clear underline. Smaller screens use an accessible menu with visible focus and Escape support.

Ranked results retain all 20 original cell links and their scores. Five rows are visible on each page, with clear rank, hemisphere coordinates, percentage and available-quantity count. Common missing quantities appear once below the results; full reasons, defaults and limitations remain in a disclosure. Score calculations and original source-card values are preserved.

Google satellite imagery is the default Earth view when a key is configured. Satellite, 3D globe and Match colors share one control row. The 3D view waits for a fully loaded scene before enabling its camera controls. Complete camera commands fix elevated-terrain focusing and reset; duplicate pins and city-pin clutter are removed. Google attribution stays visible. Satellite and 3D failures are explicit, and the original full score map remains available.

Comparison panels have consistent surfaces, larger labels and responsive fields. Earth imagery uses Google while Moon/Mars retain local imagery. Source labels reflect the active provider.

The comparison table adds separately named, pipeline-generated Jezero evidence: published TES orbital albedo and recorded MEDA UV detector flux. Humidity now has its documented percent unit and ice saturation reference. Incompatible products and humidity references have explicit explanations instead of a generic unavailable difference. The condition column has room for readable labels, source details expand in place, and percentage-point differences use at most two decimal places. See [comparison-data.md](comparison-data.md) for sources and methods.

## Checks

- `npm test -- --maxWorkers=2`: 31 test files, 217 tests passed without changing timeouts or weakening tests. Focused comparison tests also pass after the final source-disclosure copy change.
- `npm run build`: passed for both configured online and no-key offline builds.
- `npm run check:map`: both original offline checks passed on the no-key build. The check is unchanged. An online Google build intentionally contains remote requests and is not represented as an offline build.
- `npm run check:ui`: real Google satellite tiles, label toggles, saved-site coordinates, a full 3D scene, elevated-terrain focus, zoom/reset, score-map switching, SDK reuse, theme controls, comparison and authentication-failure recovery passed with no uncaught browser exceptions.
- Browser widths: 320, 390, 768, 820, 1024, 1100, 1280, 1440 and the user's 1510 pixels. No horizontal page overflow; menu opening/closing, Escape and minimum navigation target height passed. All four result pages and disabled pagination boundaries passed.
- The same browser check with `--offline` passed for the local-only variant.
- `npm run check:ui -- --layout-only` after the comparison-data addition: actual Google satellite tiles, ranking pagination, responsive navigation, themes, all routes and auth-error recovery pass. The rendered comparison shows 14.7% TES orbital albedo, 2.79 W/m² recorded UV detector flux, 3.42% ice-relative humidity and expandable source details. No generic unavailable cells or excessive decimal precision remain in the tested Earth/Jezero table. The earlier full 3D check above covers unchanged 3D controls.
- `pipeline/.venv/Scripts/python.exe -m pytest -q`: 112 passed. The raw-source test reproduces the shipped comparison JSON and independently reduces the RDS CSV with numpy.
- Temporarily reversing the humidity-reference guard makes the regression test fail: it receives `0 percentage points` where `Different humidity references` is required. Restoring the guard passes.
- Impeccable detector on the changed production components and styles: zero findings (`[]`).
- `git diff --check`: passed.

Full-page captures are generated under `app/.impeccable/review/`: desktop, the user's 1510px width, 390px mobile, 320px narrow, open menu, light theme, desktop/mobile comparison, and detailed satellite/terrain views. They are local review outputs, not source imagery. The earlier Taste marketing-page gate assumed marketing CTAs, full-screen sections and static anchor links; it does not establish a passing gate for this hash-routed working application. Actual application behavior is checked directly above.

## Scope and configuration

At the owner’s explicit follow-up request, the public Google Maps browser key is committed in `app/google-maps.config.ts`, so new checkouts and hosted builds use Google Maps by default. The key is visible in Git history and browser builds. `VITE_GOOGLE_MAPS_API_KEY` can override it; an explicit empty override retains the local globe and score layer. Other private environment values stay ignored. Google imagery requires internet access. No Google imagery tiles are cached or redistributed by the application.

The static browser smoke test observes expected missing-data responses for the team's absent `data/pod/qatar.csv` recording and for the assistant API when no development server is present. Their existing recovery states remain visible; this work does not supply a physical pod recording or deploy the assistant backend.

The additional comparison evidence does not fill missing scoring inputs or alter weights. Missing local datasets at arbitrary Moon/Mars points stay missing. No deployment or merge is part of this PR.
