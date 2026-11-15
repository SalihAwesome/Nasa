# Planetary target verification

Verified on 15 November 2026 against the actual production build and the generated
datasets. The branch includes the workspace redesign merged in PR #38 while this
feature was being built. Its sidebar, themes, nearest-place labels, score tracks
and design files are preserved.

## Behavior

The real-browser check drives a Moon/Mars world switch, clicks the rendered Moon
surface, observes a new selected point and rankings, opens a ranked result, checks
that the card score agrees, then reloads the point URL. The chosen coordinates are
preserved. It also checks all four ranking pages, source disclosures, existing
comparison data, light/dark themes, navigation, and all primary routes.

The viewport matrix is 320, 390, 768, 820, 1024, 1100, 1280, 1440 and 1510 pixels.
No horizontal page overflow or uncaught browser exceptions occurred. Known missing
responses for the absent Qatar field recording and assistant backend retain their
existing recovery states.

## Checks

```text
npm test -- --maxWorkers=2
Test Files  32 passed (32)
Tests       231 passed (231)
Duration    20.89s

pipeline/.venv/Scripts/python.exe -m pytest -q
117 passed in 54.61s

npm run build
PASS

npm run check:map
2 passed; no cross-host requests

npm run check:ui -- --offline --layout-only
PASS ranking: all 20 results across four pages
PASS mission targets: Moon/Mars selection, real surface click,
global-data rankings, matching point-specific card, preserved coordinates
and reloadable deep links
PASS responsive: nine viewport widths
PASS comparison data and source disclosure
PASS themes, comparison and all primary routes

git diff --check
PASS
```

A deliberately reversed reference-site guard fails the regression test because it
returns regional data where the original reference measurements are required.
Restoring the guard passes all 14 new target-selection tests. Those tests also
compare map/card scores for every equipment test on both worlds, verify poles and
the longitude seam, reject malformed URLs, and prevent rover-weather substitution.

Earlier local runs hit the existing five-second app-test timeouts, including after
the workspace integration. Point selection previously computed twelve complete
monthly rankings at once. It now computes the selected month and caches visited
months. The full app run above passes without changing test expectations or timeout
settings. The original score formulas and weights are unchanged.

## Data and visual review

The pipeline checks reconstructed Sun angles against three direct Horizons
locations per world before writing the datasets. The largest discrepancy is below
0.001 degrees. The binary layer and source hashes are in the committed manifest.
Raw-response fixtures and unit/cadence checks run in the pipeline test suite.
Methods and limits are in [planetary-targets.md](planetary-targets.md).

The Impeccable detector ran on the initial feature baseline and found only two
pre-existing ranked-result component-value advisories. After the upstream redesign
merged, the integrated captures were reviewed against its updated DESIGN.md.
No design-system repair was performed.

An independent finish reviewer inspected seven supplied captures and both user
screenshots and returned **ship**, with no material findings. The review covers
visual finish and supplied interaction evidence, not scientific validation.
Desktop, 1510px, mobile, narrow, light-theme, dark-theme and selected-Moon captures are local
review artifacts under `app/.impeccable/review/offline/`.

## Limits

UV index remains unscored where there is no compatible dataset. A UV detector flux
is not substituted. Local weather measurements are not extended to arbitrary
points. Surface bare-ground/dryness assumptions remain disclosed. The global data
are regional screening products and do not resolve rocks, ice cover, terrain
shadows, atmospheric refraction, engineering tolerances, or operational safety.

The PR is not merged or deployed. The pre-existing untracked
`app/figma-preview.html` is excluded.
