# Resume checkpoint: Earth imagery and workspace redesign

Paused at the user's request on 14 November 2026. This is a draft checkpoint, not a completed or approved map replacement.

## Saved work

- Workspace redesign from the preceding request: compact navigation, mobile disclosure menu, typography, theme changes, score-list styling, and brighter local Earth rendering.
- Google browser key integration. The real key is only in Git-ignored `app/.env.local`; it is not part of this PR. A future checkout needs its own local configuration.
- Google Earth imagery entry point in Site finder and Earth comparison panels. The current implementation defaults to Google satellite/hybrid maps, with an optional 3D terrain view. Match colors keeps the complete original local score map.
- SDK loader shared between Earth views; loading/authentication errors; analog-site and coordinate selection; Maps TypeScript definitions and four loader tests.
- Original Moon/Mars rendering, scientific values and scoring remain in place.

## Validation at pause

- Latest `npm run build` after adding GoogleSatelliteView: PASS (83 modules).
- Last full suite before the final satellite-wrapper change: 30 files / 212 tests PASS. The final satellite default and wrappers still need a test rerun.
- Last no-key build plus unchanged `npm run check:map`: PASS (two checks), before the final satellite-wrapper change. Restore the online build after checking the offline variant.
- Early Google 3D browser checks rendered imagery with the supplied local key and passed controls, selection, view toggling, comparison composition and an explicit authentication-failure fallback.
- Longer browser checks exposed coarse imagery, a terrain-focus range collapsing to zero, and an intermittent uncaught Google error. They did NOT establish that the 3D integration is ready. The camera now uses a terrain-relative atomic fly command; that correction is not fully verified.
- The final default satellite implementation was added to avoid relying on the problematic 3D renderer. It compiles, but no live browser check was completed before the user asked to stop.
- Impeccable's context engine was unavailable earlier. The preceding redesign's independent visual review passed. Taste's marketing-page gate remained flagged for application-incompatible checks; neither result approves the subsequent Google integration.

## Resume here

1. Run the full suite and offline build check again, then restore the configured online build.
2. Verify GoogleSatelliteView against real Google tiles: initial loading, detailed imagery, site/coordinate selection, markers, labels, reset, mobile sizing, Earth comparison, authentication failure and unmount/re-entry.
3. Diagnose Google 3D full-resolution loading and camera behavior. Do not claim success from a mounted map element or enabled buttons. Capture actual detailed terrain, inspect failures and verify the camera's final position.
4. Inspect the viewport-mode controls and remove any unnecessary duplication. Finish accessibility and responsive checks on the final imagery composition.
5. Refresh the integration documentation and obtain a final visual/code review before marking the PR ready.

This draft is stacked on PR #35 (`codex/proving-ground-website`). Do not merge it as completed work. The existing untracked `app/figma-preview.html` predates this work and is not included. Local diagnostic scripts and screenshots remain under `app/.impeccable/`; they include earlier experiments and must be updated for the final satellite-default UI before reuse.
