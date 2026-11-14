# U10 world map

The site finder reads the U05 Earth files, the U06 target settings, the U07
Jezero card and the U13/U14 Sun outputs, then uses U08 `score` and U09 `combine`.
U16's loader validates the saved Sun values; U15's three Sun quantities count
toward power on both the map and the card. It draws the land cells on a canvas with
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
score. Map clicks and ranked links open `#/card/cell/<index>` with the selected
target, test and month in the query; U11 renders the same comparison.
The test-availability disclosure replaces U31's standalone selector on this
route, including while data loads. Disabled tests retain their actual reasons.

## Target data

U05, U06, U07, U09 and U28 are merged into main. The map consumes U07's actual
`channels` entries, retaining its null UV and reflectivity values with reasons.
Shackleton's six channel values remain missing with U06 reasons. Its power
score uses the three saved Sun quantities, as U15 specifies.

An absent, malformed or incompatible MEDA card yields null channel values with
an explanation. Simulated target files are rejected. No substitute Mars dataset
is loaded. Integration tests compare map scores and omitted quantities with
U11's card for both targets in three months, including the polar Moon ranking.

## Checks

From `app/`, run `npm test`, `npm run build`, then `npm run check:map`.
The last command scans built HTML, JavaScript and CSS for remote requests and
unrecognized remote URLs. Registry provenance, citations in `shared/limits.json`,
and library namespace or error-documentation strings are inert text, not
requests. A regression check proves that a cited URL used in a fetch, script
source or CSS import still fails. The loading test also
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

On 14 November 2026, the production build served at `http://127.0.0.1:4173/`
passed in the ChatGPT in-app browser. The real console output was:

```text
U10 month change: February; 72.6 ms
U10 month change: March; 84.0 ms
```

The first change used Jezero; the second used Shackleton. Both are below the
200 ms limit. A ranked Moon link opened the March power card with the same
displayed score, 0.987. No browser warning or error was logged during those
checks. The earlier draft's missing browser and U07 checks are now complete.
