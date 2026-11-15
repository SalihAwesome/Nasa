# Moon and Mars target points

The site finder starts at Jezero crater on Mars or Shackleton Connecting Ridge on
the Moon. A world switch selects that world's starting point. Clicking the surface,
pressing Enter after keyboard rotation, or submitting coordinates selects a new point.
The app preserves that point in the map URL, ranked-result links, fidelity cards,
and the side-by-side comparison. Earth rankings use the selected point's data.
Point selection calculates the selected month's ranking and caches visited months,
avoiding twelve global ranking calculations on each surface click.

## Data and resolution

`app/public/data/planetary/` contains a manifest and two binary datasets, each with
64,800 cells on a one-degree global grid. Each file is 1,296,000 bytes, with five
quantity-major float32 layers in little-endian order:

- Regional slope and relief roughness, derived from the existing numeric LOLA
  and MOLA elevation products using the same 25-sample, 120 km method as Earth.
- Highest Sun elevation, daylight fraction with a Sun below 10 degrees, and
  horizon sweep, computed by the pipeline from fetched JPL Horizons data.

Coordinates use planetocentric latitude and east-positive longitude. A selected
point reads the containing cell's center, with no browser interpolation. The poles
use the end rows, and +180 and -180 longitude refer to the same cell.

The original reference sites retain their existing exact-site measurements and
Sun outputs. A new point never inherits Jezero's weather or its supplementary UV
detector reading. Bare and dry target surfaces retain the project brief's explicit
assumptions. These are not local measurements, and ice cover is unresolved.

## Solar method

The pipeline requests airless apparent Sun azimuth, elevation, and range in km
from JPL Horizons at the equator and prime meridian, hourly from 1 November to
1 December 2026. It reconstructs body-fixed Sun directions from those observations,
then projects them onto the ellipsoid horizon at each grid center. Body radii come
from the actual Horizons response. Local terrain shadows are not modeled.

Before writing a body's dataset, the pipeline compares its angles with direct
Horizons queries at three separate points, including a polar point and both
longitude hemispheres. The maximum measured discrepancy was 0.000003411 degrees
for the Moon and 0.000142342 degrees for Mars. The acceptance threshold is an
explicit screening setting in `shared/planetary.json`, not an instrument accuracy
claim. Mars request longitudes use Horizons' required negative east-longitude
representation, and planetocentric latitudes are converted to geodetic latitude
for the validation calls.

The time window, grid spacing, and validation threshold are labeled settings.
Source URLs, SHA-256 hashes, validation errors, and raw DEM fingerprints are
recorded in the generated manifest. No network service is required to choose a
point after the app and its local datasets load.

## UV and ranking coverage

The ranking labels the number of conditions actually compared. Full requested
counts, excluded quantities, reasons, and assumptions are in Data coverage &
limitations. This changes presentation without changing scores or weights.

A UV detector flux cannot replace a UV index. UV index remains unscored where no
compatible measurement exists. The recorded Jezero flux remains available under
its own name in Compare sites. The app does not invent UV values for other points.

## Reproduction

Acquire the numeric DEMs as described in [mobility-sources.md](mobility-sources.md),
then run these commands from `pipeline/`:

```powershell
./.venv/Scripts/python.exe pack_planetary.py
./.venv/Scripts/python.exe -m pytest tests/test_planetary.py -q
```

The pipeline caches source responses in ignored `data/raw/planetary/`. Two complete
original Horizons responses are saved as lossless gzip test fixtures, preserving
provider whitespace and source hashes. Raw responses are validated
for units, cadence, sample count, angle ranges, and ellipsoid metadata.
