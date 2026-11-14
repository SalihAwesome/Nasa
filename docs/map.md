# U10 world map

The site finder reads the U05 Earth files and the U06 target settings, then uses
U08 `score` and U09 `combine`. It draws the land cells on a canvas with
`geoEqualEarth` from d3-geo and puts the Natural Earth outline above them.
Colors, fonts and the score legend use U28's tokens in `app/DESIGN.md`.

`python pipeline/fetch_geo.py` downloads the outline from the
`naturalearth_110m` entry in `shared/sources.json`. It writes the unchanged
response to that entry's output path. The deployed app fetches only paths
relative to its own build; it never downloads map tiles or remote outlines.

All monthly layers load before the controls appear. Cell positions are
projected once per loaded cell list. The chosen target and test are scored and
ranked for every loaded month before the month slider changes. A month change
reuses those results and logs elapsed time from the input event through React
and canvas work, at the next animation frame. The console line starts with
`U10 month change:`. The required limit is in `docs/software-plan.md`, U10.

Cells with no score use the separate no-score color and never enter the top
list. Partial scores identify their missing quantities. Disabled tests have
their reasons both in their options and in the Test availability disclosure.
The Earth values for a pointed-at cell remain visible even without a target
score. Map clicks and ranked links open `#/card/cell/<index>`; the fidelity-card
contents belong to U11.

## Dependency exception

On 14 November 2026, Yahia explicitly instructed the agent to proceed after
being told that U07 had not merged. U05, U06, U09 and U28 were merged into main.
This unit does not fetch or invent MEDA numbers. Until U07 supplies compatible
output, the map shows the missing target reason and no ranked Jezero cells.
Shackleton's values also remain missing, with the U06 reasons.

The consumer in `app/src/map/model.ts` has an explicit interface for the future
U07 file: a `channels` object keyed by channel id, each containing `value` and
a nonempty `reason` when `value` is null. This interface is a consumer contract,
not a verified description of U07 output. When U07 merges, its actual output
must be checked against this interface. An absent, malformed or incompatible
file yields null target values with an explanation. Simulated target files are
rejected. There is no placeholder Mars dataset in this unit.

## Checks

From `app/`, run `npm test`, `npm run build`, then `npm run check:map`.
The last command scans built HTML, JavaScript and CSS for remote requests and
unrecognized remote URLs. Registry provenance strings and library namespace or
error-documentation strings are inert text, not requests. The loading test also
checks that every data request is relative to `./data/` and all months load.
The build scan runs after the build in CI.

From `pipeline/`, run `python -m pytest`. The outline tests use the saved real
Natural Earth response shipped by this unit.
On this Windows sandbox, the default temporary directory made a U13 cache
filename exceed the available path length. The complete suite passed with
`PYTEST_DEBUG_TEMPROOT` set to the repo's ignored `data/raw/` directory. No test
was changed or excluded.

For the performance check, serve the build with `npm run preview`, open the map,
move the month slider, and save the real `U10 month change:` console line. An
automated test in Node is not a substitute for this browser measurement.

The browser tools could not complete this check in this session: the in-app
browser timed out reaching localhost, and Windows Computer Use stopped because
it could not confidently identify Chrome's current URL. No browser timing or
visual QA result is claimed. The pull request must remain a draft until a real
logged month change confirms the plan's limit.
