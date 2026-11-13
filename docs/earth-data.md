# U05 Earth data contract

Run `python pipeline/pack.py` at the repository root. It first runs U04, reusing
completed raw tiles, then reads the Natural Earth 50m land file from
`data/raw/naturalearth/` or downloads it from the registered source. It writes
only the cells, twelve month files and manifest under `app/public/data/earth/`.

The cell order is latitude then longitude, with duplicate tile edges removed.
The land mask uses NumPy ray crossings, even-odd parity across a polygon's
rings, and the union of polygons. Pole flags copy the adjacent half-degree
row. Solar data uses the containing one-degree cell by D12; no interpolation
is performed. Conflicting duplicates or mixed climatology periods fail.

`cells.bin` contains little-endian Float32 latitude/longitude pairs. A month
contains little-endian Int16 blocks in `manifest.quantityOrder`: all cells of
one quantity precede all cells of the next. Decode a present value as
`integer * scale + offset`. The reserved fill integer is -32768. Source -999
values become that fill before any pressure conversion; pressure's present
values are converted from kPa to hPa using the channel registry.

D17 scales, zero offsets and the fill encoding carry `status: default` on
each manifest quantity. This status applies to those packing choices. The
manifest separately records the default joining and land rules, source grids,
source IDs, period and a missing-value explanation. The encoder uses NumPy's
nearest-integer rounding with ties to even; it rejects overflow and collisions
with the reserved fill instead of clipping or wrapping.

In `app/src/data/earth.ts`, `parseEarthManifest` validates the metadata,
`decodeCells` reads the coordinates, and `decodeMonth` reads a supplied binary.
`loadMonth(month, options)` fetches the manifest and month from the local
Vite base path. A previously parsed manifest can be supplied in options to
avoid repeating its request. Tests inject a fetcher; production uses fetch.

Each decoded layer has `unit`, `values` and `missingReason`. Every null in
`values` means the source was missing, and `missingReason` explains that null.
No default or nearby value replaces it. The full artifact checks run without
`data/raw/`, so they run in CI as well as on the machine holding the cache.
