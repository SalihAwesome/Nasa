# U31 source investigation

Checked on 14 November 2026. U31 allows at most one hour per unverified source. The following checks finished within that limit. The goal was a comparable Earth layer and target value, rather than an image that resembles terrain.

## Confirmed layer

The POWER regional request for `GWETTOP` used latitude bounds 20 to 30 and longitude bounds 50 to 60. It returned HTTP 200, 94,149 bytes, unit `1`, and 357 cells on the existing meteorology grid. The cell at latitude 25.5, longitude 51.25 returned January 0.26. Its raw reply is saved unchanged as `pipeline/tests/fixtures/power/gwettop-regional-20-30-50-60.json` and in the ignored POWER cache.

The downloader uses the existing U04 retry and cache behavior. U04 still fetches its original six parameters by default; U31 selects `GWETTOP` explicitly. `pipeline/pack_mobility.py` reads the existing U05 cell list, preserves its order, and writes `mobility-MM.bin` and `mobility-manifest.json`. It does not recompute the land mask. The targets' fully dry value comes from `docs/project-brief.md`; tolerance and scale are labelled D20 defaults in `shared/targets.json`.

## Terrain candidates

| Candidate | Actual check | Result for U31 |
| --- | --- | --- |
| [SRTM download](https://data.lpdaac.earthdatacloud.nasa.gov/lp-prod-protected/SRTMGL1.003/N41W112.SRTMGL1.hgt/N41W112.SRTMGL1.hgt.zip) | GET followed the server's redirect to Earthdata Login and returned HTTP 401, 27 bytes. The body was not a ZIP. | No Earth elevation tile was obtained from this source. No credentials were entered or requested. |
| [LOLA slope and roughness products](https://pgda.gsfc.nasa.gov/products/70) | Followed the provider's [archive](https://imbrium.mit.edu/EXTRAS/FRACTAL/IMG/) and downloaded the actual `MAS_225M_16.LBL` and `HE_8.LBL` labels. Both returned HTTP 200. The slope label is 4,105 bytes and states degrees; the Hurst label is 4,748 bytes. | Candidate metadata confirmed. A matching Earth/target terrain comparison was not established. No baseline, site value or tolerance was invented. |
| [MOLA roughness grid](https://pgda.gsfc.nasa.gov/data/MOLA/MOLA_roughness_slpcor_1ppd.grd) | Download returned HTTP 200, 260,564 bytes, with classic NetCDF magic `CDF` and version byte 1. SHA256 `f3f9fd7c5ce4d748019e1811fe7ee1120aacc4c66c9fa6675995c171cd72e6b8`. The [provider's description](https://pgda.gsfc.nasa.gov/products/62) identifies the slope-corrected roughness product. | A Mars candidate was downloaded. This does not supply a matching Earth layer or complete the slope comparison. The candidate is not used as a score or a substitute for missing terrain. |

The LOLA slope label's SHA256 is `2d764215d140bd97ae004f0c06f31cc23e1ea23d6f197a709d2d645cc25276c8`. The Hurst label's SHA256 is `a9b5a8ce5f2672bb5a0f8f3dce68a4e694ea9e38808597f0a13ddf12dc24ac1f`. Raw candidate replies remain under ignored `data/raw/u31-sources/`, outside the app. The available lunar and Martian products describe different roughness measures; this unit does not declare them equivalent to a missing Earth measurement.

## Bare-ground candidate

The indexed [MODIS monthly NDVI CSV download](https://neo.gsfc.nasa.gov/archive/csv/MOD_NDVI_M/MOD_NDVI_M_2025-11.CSV.gz) returned HTTP 200 after redirecting to [NASA's NEO retirement notice](https://science.nasa.gov/earth/nasa-earth-observations-neo/). The reply was 255,940 bytes of HTML, not gzip or numeric CSV. Its SHA256 is `7aec4be5cb0fc74b8ce6af75efff8e4f95aeec017e1306b12b60601a1bbbbf47`. NASA states that NEO was decommissioned in September 2026. Cached search listings still advertise the old file; the real download wins.

No numeric bare-ground layer was confirmed by this attempt. The brief's statement that both targets are fully bare was not converted into an invented NDVI or bare-ground fraction. The target entry stays null with a reason.

## Result

Dryness is available as its own packed layer. A comparable slope and roughness layer plus target values was not confirmed, so mobility remains disabled for both targets. The selector displays the reason from `shared/tests.json`. Missing terrain and bare-ground values remain null with reasons in `shared/targets.json`. No HUMAN TASK is claimed as done, and no package was added.

Run the unit checks from `pipeline/` with `python -m pytest tests/test_mobility.py -q -s`, and from `app/` with `npm test -- src/data/mobility.test.tsx --reporter=verbose`. Regenerate the layers from the repo root with `python pipeline/pack_mobility.py`; a second run should reuse the complete cache.


## Regional terrain follow-up (14 November 2026)

The user requested completion using any available public data. This supersedes the earlier source-investigation scope. The feature now compares **regional terrain**, not rover-scale obstacles or an RF propagation model.

- NOAA's ETOPO1 ice-surface grid is available through [NOAA AOML ERDDAP](https://oceanwatch.aoml.noaa.gov/erddap/info/etopo180/index.html). A verified request for `altitude[0:6:10800][0:6:21600]` produced a 13,018,388-byte NetCDF file. It contains 1,801 ascending latitudes from -90 to 90, 3,601 longitudes from -180 to 180, and signed metre elevations on a 0.1-degree grid.
- [NASA SVS's LOLA elevation product](https://svs.gsfc.nasa.gov/4720/) supplied `ldem_4.tif`, 4,153,352 bytes, 1,440 by 720 float32 samples. The DEM is in kilometres relative to a 1,737.4 km sphere, with 0 degrees at the centre. The pipeline converts kilometres to metres. It does not use the aesthetic colour map as measurements.
- [NASA PDS's MOLA MEGDR](https://pds-geosciences.wustl.edu/mgs/mgs-m-mola-5-megdr-l3-v1/mgsl_300x/meg004/) supplied `megt90n000cb.img`, 2,073,600 bytes, and its 4,796-byte label. The label specifies 720 rows, 1,440 columns, big-endian signed 16-bit metre elevations, 0.25-degree bins, east-positive longitude from 0 to 360, and a 3,396 km reference radius. The provider's grid includes interpolated bins; this remains an elevation-derived estimate, not a claim of a laser shot at every sample.
- [Copernicus LC100 Collection 3, 2019](https://doi.org/10.5281/zenodo.3939050) supplies the numeric bare-cover fraction raster. Its published size is 3,204,609,492 bytes and MD5 is `f2c9432c37ced7af02b6d9207036c2dc`. The verified raster header specifies uint8 percentages, nodata 255, 362,880 columns, 141,120 rows, EPSG:4326, and latitude coverage from 60 S to 80 N. The pipeline averages valid source pixels into 0.5-degree regions. Values outside coverage remain missing.

### Method and limits

`shared/terrain.json` defines all sampling choices and tolerances as defaults. For each cell and target, `pipeline/pack_terrain.py` samples a 5-by-5 local tangent-frame stencil with 30 km spacing: a 120 km region. Spherical destinations use each world's radius. The pipeline selects the nearest numeric DEM bin; it does not invent missing elevations. A least-squares plane gives the regional slope. The RMS residual height after removing the plane gives regional relief roughness in metres. The same physical stencil and calculation are used on all three worlds.

To avoid treating ocean bathymetry as land relief, negative Earth elevation samples are excluded from the plane fit. At least 13 of 25 samples and a solvable plane are required. This conservative rule also excludes genuine below-sea-level land. Coastal sites and areas outside bare-ground coverage can have no terrain score. The app shows that absence instead of substituting another cell. These estimates do not establish wheel-scale traversability, antenna visibility, frequency suitability, or a radio link budget.

Target coordinates come from `shared/targets.json`, with the existing west-to-east longitude conversion for Mars. Fully dry and fully bare target values are assumptions from the team brief. Numeric terrain target values live in the generated manifest rather than in settings.

### Reproduce

Install the pipeline development dependencies, including rasterio for GeoTIFF and SciPy for classic NetCDF. These two packages extend the original stack to read the verified public numeric products.

From the repo root, run `python tools/download_terrain.py`, then `python tools/download_bare_ground.py`, then `python pipeline/pack_terrain.py`. The bare-ground source is large; interrupted range downloads retain completed segments. Raw files stay under ignored `data/raw/terrain/`. The app ships only a three-layer float32 file in the existing land-cell order and its provenance manifest. Check with `python -m pytest tests/test_terrain.py` from `pipeline/` and `npm test -- src/data/terrain.test.ts src/map/missionTests.test.tsx` from `app/`.
