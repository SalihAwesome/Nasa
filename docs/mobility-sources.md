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
