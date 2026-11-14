# Verified facts

Every entry here came back from a real call. Each section gives the date of the call and a command you can run again. If a new call disagrees with an entry, the new call wins. Update the entry and say so in the pull request.

A value that is not in this file is not verified. See "Not verified yet" at the end.

## NASA POWER

Called on 12 November 2026. Base URL: `https://power.larc.nasa.gov/api`.

### Climatology, point endpoint

```
curl "https://power.larc.nasa.gov/api/temporal/climatology/point?parameters=TS,TS_MAX,TS_MIN,TS_RANGE,T2M_RANGE,PS,ALLSKY_SFC_UV_INDEX&community=AG&latitude=25.3&longitude=51.5&format=JSON"
```

- The point endpoint accepts several parameters in one request.
- `geometry.coordinates` is `[51.5, 25.3, 21.13]`, in the order longitude, latitude, elevation in meters.
- `properties.parameter.<NAME>` holds the keys `JAN` to `DEC` and `ANN`.
- `parameters.<NAME>.units` holds the unit.

Values for latitude 25.3, longitude 51.5 (near Doha). Use them as test values.

| Parameter | Unit in the response | JAN | JUL | NOV | ANN |
|---|---|---|---|---|---|
| `TS` | C | 17.8 | 37.31 | 25.64 | 28.67 |
| `TS_MAX` | C | 32.35 | 55.86 | 42.32 | 55.86 |
| `TS_MIN` | C | 6.61 | 25.53 | 13.91 | 6.45 |
| `TS_RANGE` | C | 13.52 | 19.5 | 14.5 | 17.49 |
| `T2M_RANGE` | C | 8.36 | 12.68 | 8.08 | 10.96 |
| `PS` | kPa | 101.62 | 99.47 | 101.32 | 100.67 |
| `ALLSKY_SFC_UV_INDEX` | `W m-2 x 40` | 0.81 | 2.0 | 0.89 | 1.46 |

### Simulator baseline

Called again on 13 November 2026 for the D10 test site.

```sh
curl "https://power.larc.nasa.gov/api/temporal/climatology/point?parameters=TS,TS_RANGE,T2M,T2M_RANGE,RH2M,PS,ALLSKY_SFC_UV_INDEX&community=AG&latitude=25.3&longitude=51.5&format=JSON"
```

The November response gives `T2M` 24.95 C and `RH2M` 56.98%. The other values match the November column above. U03 uses these climatology values to seed its simulated readings.

### Parameter definitions

```
curl "https://power.larc.nasa.gov/api/system/manager/parameters/TS_RANGE?community=AG&temporal=climatology"
```

| Parameter | POWER definition, quoted |
|---|---|
| `TS` | "The average temperature at the earth's surface." |
| `TS_MAX` | "The maximum hourly earth skin temperature in the period of interest." |
| `TS_MIN` | "The minimum hourly earth skin temperature in the period of interest." |
| `TS_RANGE` | "The minimum and maximum hourly earth skin temperature range in the period of interest." |
| `ALLSKY_SFC_UV_INDEX` | "The ultraviolet radiation exposure index." |

What the numbers show:

- `TS_MAX` and `TS_MIN` in the climatology are extremes over the whole period. The annual `TS_MAX` equals the July value, and the annual `TS_MIN` is below every monthly mean.
- `TS_MAX` minus `TS_MIN` for January is 25.74 C. `TS_RANGE` for January is 13.52 C. So `TS_RANGE` is not the difference of the two extremes. It is the right size for a mean daily range. The POWER definition does not say "mean daily range" in words, so the card must label the row with the POWER name "Earth Skin Temperature Range".
- `ALLSKY_SFC_UV_INDEX` is about 1 to 2 at Doha. That is an average over the day, not the midday peak that a UV sensor reports.
- `TS_RANGE`, `TS_MAX`, and `TS_MIN` exist for the daily, monthly, and climatology products. The parameter list gives no hourly product for them. `TS` has an hourly product.

### Soil wetness and aerosol parameters

```
curl "https://power.larc.nasa.gov/api/system/manager/parameters/GWETTOP?community=AG&temporal=climatology"
curl "https://power.larc.nasa.gov/api/system/manager/parameters/AOD_55?community=AG&temporal=climatology"
curl "https://power.larc.nasa.gov/api/temporal/climatology/point?parameters=GWETTOP,AOD_55&community=AG&latitude=25.3&longitude=51.5&format=JSON"
```

- `GWETTOP` is "Surface Soil Wetness". POWER defines it as the water in the upper 5 cm of soil, from 0 for completely dry to 1 for completely saturated. Its unit is `1`.
- `AOD_55` is "Aerosol Optical Depth 55", the optical thickness at 0.55 um measured vertically. Its unit is `dimensionless`.
- Both exist for the hourly, daily, and monthly products and in the climatology.
- At latitude 25.3, longitude 51.5 the climatology gives `GWETTOP` JAN 0.26, NOV 0.12, ANN 0.14, and `AOD_55` JAN 0.42, NOV 0.40, ANN 0.56.

### Climatology, regional endpoint

```
curl "https://power.larc.nasa.gov/api/temporal/climatology/regional?parameters=T2M&community=AG&latitude-min=20&latitude-max=30&longitude-min=45&longitude-max=55&format=JSON"
```

- One parameter per request. Two parameters return this error: "A maximum of 1 parameters are can currently be requested in one submission."
- At most 10 degrees of latitude per request. A 12 degree request returns this error: "Please provide a maximum of 10 degree range in latitude."
- The response is a GeoJSON `FeatureCollection`. Each feature has `geometry.coordinates` as `[longitude, latitude, elevation]` and `properties.parameter.<NAME>` with the keys `JAN` to `DEC` and `ANN`.
- `header.start` is `20010101`, `header.end` is `20251231`, and `header.fill_value` is `-999.0`.
- One request took between 0.5 and 2.2 seconds.

POWER serves two different grids. The plan must not assume one grid.

| Parameters tested | Latitude values in the 20 to 30 tile | Longitude values in the 45 to 55 tile | Cells per tile |
|---|---|---|---|
| `T2M`, `TS_MAX` | 20.0, 20.5, 21.0 to 30.0. Step 0.5. | 45.0, 45.625, 46.25 to 55.0. Step 0.625. | 357 (21 by 17) |
| `ALLSKY_SFC_SW_DWN`, `ALLSKY_SRF_ALB`, `ALLSKY_SFC_UV_INDEX` | 20.5, 21.5 to 29.5. Step 1. | 45.5, 46.5 to 54.5. Step 1. | 100 (10 by 10) |

- On the meteorology grid, a tile normally includes both edges. An exactly-zero lower bound omits that shared edge, as confirmed in the U04 calls below. Neighbor tiles otherwise return the same edge cells. Remove the duplicates.
- Longitude runs from -180.0 to 179.375 on the meteorology grid. The tile from longitude 170 to 180 returns 16 columns, and it has no column at 180.0. Latitude runs from -90.0 to 90.0.
- Polar tiles work. `T2M` for latitude 80 to 90, longitude 170 to 180 returned 336 cells. `T2M` for latitude -90 to -80, longitude -180 to -170 returned 357 cells.
- `ALLSKY_SRF_ALB` for latitude 80 to 90 returned -999.0 for January in all 100 cells. The far north has no albedo in the polar night.
- `TS_RANGE` and `PS` come on the meteorology grid. The U04 call below also confirmed `RH2M` on that grid.

The point endpoint returns the value of the grid cell. At a cell center, all 13 values of the two endpoints are equal.

| Parameter | Cell center (latitude, longitude) | JAN from the regional endpoint | JAN from the point endpoint |
|---|---|---|---|
| `TS_RANGE` | 25.5, 51.25 | 13.52 | 13.52 |
| `PS` | 25.5, 51.25 | 101.62 | 101.62 |
| `T2M` | 25.5, 51.25 | 17.51 | 17.51 |
| `ALLSKY_SFC_UV_INDEX` | 25.5, 51.5 | 0.81 | 0.81 |
| `ALLSKY_SRF_ALB` | 25.5, 51.5 | 0.13 | 0.13 |
- Units seen: `T2M` in C, `TS_MAX` in C, `ALLSKY_SFC_SW_DWN` in `MJ/m^2/day`, `ALLSKY_SRF_ALB` as `dimensionless`, `ALLSKY_SFC_UV_INDEX` as `W m-2 x 40`.

### Hourly, point endpoint

```
curl "https://power.larc.nasa.gov/api/temporal/hourly/point?parameters=T2M,RH2M,PS,TS&community=AG&latitude=25.3&longitude=51.5&start=20261109&end=20261109&format=JSON&time-standard=LST"
```

- The keys are `YYYYMMDDHH`. One day returns 24 keys per parameter.
- `time-standard` accepts `LST` and `UTC`.
- Units: `T2M` in C, `RH2M` in %, `PS` in kPa, `TS` in C.
- Lag measured at 05:50 UTC on 12 November 2026: the last valid hour for `T2M` and `TS` was `2026111023` UTC, which is 31 hours earlier. Later hours hold `-999.0`.
- `ALLSKY_SFC_SW_DWN`, `ALLSKY_SRF_ALB`, and `ALLSKY_SFC_UV_INDEX` had no valid hourly value at all from 20 October to 12 November 2026.

### U20 point requests

On 13 November 2026, POWER returned HTTP 200 for these requests at the D10 test site.

```sh
curl "https://power.larc.nasa.gov/api/temporal/climatology/point?community=AG&latitude=25.3&longitude=51.5&format=JSON&parameters=TS_RANGE,ALLSKY_SRF_ALB,ALLSKY_SFC_UV_INDEX,T2M,RH2M,PS"
curl "https://power.larc.nasa.gov/api/temporal/hourly/point?community=AG&latitude=25.3&longitude=51.5&format=JSON&parameters=TS,ALLSKY_SRF_ALB,ALLSKY_SFC_UV_INDEX,T2M,RH2M,PS&start=20261109&end=20261109&time-standard=UTC"
```

The saved raw responses are in `pipeline/tests/fixtures/power-point-climatology.json` and `pipeline/tests/fixtures/power-point-hourly-20261109.json`. The climatology header gives January 2001 through December 2025. November values are `TS_RANGE` 14.5 C, `ALLSKY_SRF_ALB` 0.14, `ALLSKY_SFC_UV_INDEX` 0.89, `T2M` 24.95 C, `RH2M` 56.98%, and `PS` 101.32 kPa.

The hourly response header reports UTC. On 9 November, `TS`, `T2M`, `RH2M`, and `PS` each had 24 valid values. Albedo and UV each had 24 fill values. Repeating the hourly request with both dates set to `20261114` returned an empty object for each parameter. A separate 9 November UTC request with `parameters=ALLSKY_SFC_SW_DWN` returned the hourly unit `MJ/hr` and 24 fill values.

### U04 regional RH2M grid verification

Called on 13 November 2026 for U04:

```
https://power.larc.nasa.gov/api/temporal/climatology/regional?parameters=RH2M&community=AG&latitude-min=20&latitude-max=30&longitude-min=45&longitude-max=55&format=JSON
```

- HTTP 200 in 2.2 seconds. The raw response is saved unchanged as
  `pipeline/tests/fixtures/power/rh2m-regional-20-30-45-55.json`.
- 357 features: latitudes 20 through 30 inclusive in steps of 0.5 degrees,
  longitudes 45 through 55 inclusive in steps of 0.625 degrees.
- The `RH2M` unit is `%`. The response reports API v2.10.1, period
  `20010101` through `20251231`, fill value `-999.0`, and time standard `LST`.
- This confirms the UNVERIFIED RH2M grid input of U04; it agrees with the plan.
- The first tile of the full U04 run, `TS_RANGE` at latitude -90 to -80 and
  longitude -180 to -170, also returned 357 cells. Its unchanged raw response
  is saved as `pipeline/tests/fixtures/power/ts-range-south-pole.json`.
- The `TS_RANGE` tile at latitude 80 to 90 and longitude 170 to 180 returned
  336 cells, with a maximum longitude of 179.375 and maximum latitude of 90.
  Its unchanged response is `pipeline/tests/fixtures/power/ts-range-north-dateline.json`.
- The first `ALLSKY_SRF_ALB` tile, latitude -90 to -80 and longitude -180 to
  -170, returned 100 cells on the one-degree grid. Latitude centers run from
  -89.5 to -80.5 and longitude centers from -179.5 to -170.5. Its unchanged
  response is `pipeline/tests/fixtures/power/albedo-south-pole.json`.

U04's retry delays (5, 20, 60 seconds; 60 seconds for HTTP 429) are plan defaults,
not measured scientific values. `shared/power_fetch_settings.json` labels them
`status: default`. The 60-second request timeout in that file is an operational
default chosen by this implementation, not an API fact.

### U04 zero-boundary regional requests

The full fetch stopped on a grid mismatch at `TS_RANGE`, latitude -90 to -80,
longitude 0 to 10. Three sequential calls on 13 November 2026 then confirmed
that an exactly-zero lower bound excludes the zero row or column:

| Parameter | Latitude bounds | Longitude bounds | Latitude centers | Longitude centers | Cells |
|---|---|---|---|---|---|
| `TS_RANGE` | -90, -80 | 0, 10 | -90 to -80, step 0.5 | 0.625 to 10, step 0.625 | 336 |
| `TS_RANGE` | 0, 10 | 10, 20 | 0.5 to 10, step 0.5 | 10 to 20, step 0.625 | 340 |
| `TS_RANGE` | 0, 10 | 0, 10 | 0.5 to 10, step 0.5 | 0.625 to 10, step 0.625 | 320 |

Each request used the regional endpoint above, `parameters=TS_RANGE`,
`community=AG`, `format=JSON`, and the four bounds in its row. Each returned
HTTP 200. The unchanged raw responses are the fixtures
`ts-range-lat-90-lon0.json`, `ts-range-lat0-lon10.json`, and
`ts-range-lat0-lon0.json` under `pipeline/tests/fixtures/power/`.

The preceding full-run tile, latitude -90 to -80 and longitude -10 to 0,
includes longitude `-0.0`, so the shared edge is still present in the combined
grid. This refines the earlier statement that all tile edges are included.
U04 accepts this exact boundary rule; any other missing or displaced cell still
stops the fetch. Existing tests were retained, and new failing fixture tests
were added before implementing this confirmed rule.

### U04 complete download and point comparison

Completed on 13 November 2026 on machine `YAHIA`. All six U04 parameters have
648 validated raw tiles each, 3,888 total, under `data/raw/power/`. The files
total 288,425,945 bytes. The full run resumed the first 18 completed tiles and
finished with `3870 fetched, 18 cached`. `failed.json` is an empty list.

`python pipeline/fetch_power.py --check` revalidated the cache with network
requests disabled during the fetch phase, then separately called the two point
endpoints below. Its real output was:

```text
0 fetched, 3888 cached
T2M at 25.5,51.25: 12/12 monthly values match; [17.51, 18.63, 22.21, 26.91, 32.1, 34.45, 36.14, 36.3, 34.1, 30.38, 24.95, 19.89]
ALLSKY_SRF_ALB at 25.5,51.5: 12/12 monthly values match; [0.13, 0.15, 0.15, 0.15, 0.16, 0.16, 0.17, 0.16, 0.16, 0.14, 0.14, 0.13]
```

The point requests were:

```
https://power.larc.nasa.gov/api/temporal/climatology/point?parameters=T2M&community=AG&latitude=25.5&longitude=51.25&format=JSON
https://power.larc.nasa.gov/api/temporal/climatology/point?parameters=ALLSKY_SRF_ALB&community=AG&latitude=25.5&longitude=51.5&format=JSON
```

Their raw responses are in `data/raw/power-check/T2M.json` and
`data/raw/power-check/ALLSKY_SRF_ALB.json`. The cache and these responses are
ignored by Git; U05 must reuse this machine's raw files. The complete run
confirmed the documented meteorology and solar grids for all six parameters,
including the zero-lower-bound rule on all four meteorology parameters.

## JPL Horizons

Called on 12 November 2026. Endpoint: `https://ssd.jpl.nasa.gov/api/horizons.api`.

Parameters that every call below used: `format=text`, `COMMAND='10'`, `OBJ_DATA='NO'`, `MAKE_EPHEM='YES'`, `EPHEM_TYPE='OBSERVER'`, `COORD_TYPE='GEODETIC'`, `QUANTITIES='4'`. Send the values with their single quotes, URL-encoded.

- Data rows sit between the lines `$$SOE` and `$$EOE`.
- The column header is `Date__(UT)__HR:MN     Azi____(a-app)___Elev`. Each row has the date, a flags field that can be empty, the azimuth, and the elevation.
- Horizons describes the angles as "Airless apparent azimuth and elevation". Azimuth runs clockwise from north. The angles have no refraction.

### Moon site

`CENTER='coord@301'`, `SITE_COORD='222.69,-89.45,0'`, `START_TIME='2026-11-01'`, `STEP_SIZE='1 h'`.

| Time (UT) | Azimuth | Elevation |
|---|---|---|
| 2026-Nov-01 00:00 | 62.454246 | 1.710963 |
| 2026-Nov-01 03:00 | 60.933106 | 1.725009 |

A reviewer's call on 12 November 2026 with `STOP_TIME='2026-12-01'` returned 721 rows. The elevation ran from 0.991 to 2.063 degrees, and the azimuth from 0.51 to 359.998 degrees.

### Mars site

- `CENTER='coord@499'` with `SITE_COORD='282.55,18.44,0'` returns no rows and this message: "Input east-longitude as negative for IAU west-positive body #499".
- `CENTER='coord@499'` with `SITE_COORD='-77.45,18.44,0'` returns rows. Horizons echoes the site as `282.55, 18.44` with the label `W-lon(deg)`.
- Cross-check against MEDA. The sol 300 ancillary file gives `SOLAR_ZENITHAL_ANGLE` 146.75 at `SCLK` 693526530, which is an elevation of -56.75 degrees. Horizons with `-77.45` gives -57.45 at 2021-Dec-23 10:10 UT and -56.98 at 10:20 UT. The two agree within 0.5 degrees. The time match assumes that `SCLK` counts seconds from 2000-01-01 12:00, which gives about 10:14 UT.
- `SITE_COORD='-282.55,18.44,0'` also returns rows, for the wrong place. It gives +60 degrees at the same time. Do not use it.

### U13 monthly target paths

On 14 November 2026 (Qatar time), the observer requests above returned 721
hourly rows for each target from 1 November 2026 00:00 UT through 1 December
2026 00:00 UT, inclusive. The window and hourly step are default D15.
The calls used `CENTER='coord@301'` with `SITE_COORD='222.69,-89.45,0'` and
`CENTER='coord@499'` with `SITE_COORD='-77.45,18.44,0'`. They used
`START_TIME='2026-11-01'`, `STOP_TIME='2026-12-01'`, and `STEP_SIZE='1 h'`.
Both responses describe airless angles.

| Site | Samples | Elevation min / max (degrees) | Azimuth max minus min (degrees) |
|---|---:|---:|---:|
| Shackleton | 721 | 0.990925 / 2.062514 | 359.491613 |
| Jezero | 721 | -64.670464 / 83.139531 | 359.006364 |

Raw verification replies are in `pipeline/tests/fixtures/horizons-shackleton-2026-11.txt`
and `pipeline/tests/fixtures/horizons-jezero-2026-11.txt`. Run
`python pipeline/fetch_horizons.py` from the repository root to regenerate
the four public files. The script saves replies under `data/raw/horizons/`
before parsing. It reuses files for the same request on subsequent runs.
Use `--refresh` to fetch again. The three Sun metrics aggregate the entire
requested window for each target, including all the Mars sols in that window.
The site coordinate citations remain null under the shared target registry's
default status. The API call verifies that the queries return these paths.

### Earth site, rise, transit, and set

`CENTER='coord@399'`, `SITE_COORD='51.5,25.3,0'`, `START_TIME='2026-11-14'`, `STOP_TIME='2026-11-15'`, `STEP_SIZE='1 m'`, `R_T_S_ONLY='TVH'`.

| Time (UT) | Flag | Azimuth | Elevation |
|---|---|---|---|
| 2026-Nov-14 02:51 | `r` | 109.876958 | -0.668149 |
| 2026-Nov-14 08:19 | `t` | 180.204314 | 46.438803 |
| 2026-Nov-14 13:47 | `s` | 250.142435 | -0.972968 |

## U17 pod-site Sun prediction

Checked on 14 November 2026 using the Earth rise, transit, and set recipe
above. `python pipeline/sun_predict.py` queries the location and exact
24-hour window from `shared/pod_site.json`. The current D10 defaults are
latitude 25.3, longitude 51.5, and start `2026-11-14T00:00:00Z`.
The real field location and log start remain NEEDS HUMAN.

The query uses `APPARENT='AIRLESS'`, `STEP_SIZE='1 m'`, and
`R_T_S_ONLY='TVH'`, from 14 November 00:00 UT to 15 November 00:00 UT.
The raw response is saved beside the output as
`app/public/data/sun/pod-prediction-horizons.txt`, and an exact copy is the
test fixture `pipeline/tests/fixtures/horizons-pod-events-2026-11-14.txt`.
Its full request URL is recorded in `pod-prediction.json`.

| Event | U14 model prediction in UT | Horizons in UT | Model minus Horizons |
| --- | --- | --- | --- |
| Sunrise | 02:50 | 02:51 | -1 minute |
| Peak | 08:18 | 08:19 | -1 minute |
| Sunset | 13:46 | 13:47 | -1 minute |

The model calls the shared `sun_position` function once per minute.
The output contains 1,440 elevation samples in the half-open log window.
An extra endpoint calculation detects a crossing during the final minute.
Rise and set use D6's -0.833-degree centre-elevation threshold and report
the start of the crossing minute. Peak is the highest sampled elevation
within the window. `shared/sun_prediction_settings.json` labels the sampling
and threshold choices as defaults. Missing crossings remain null with reasons.
The parser checks the reference window, and the command rejects event gaps
larger than U17's two-minute tolerance when both events are available.

## MEDA archive

Called on 12 November 2026. Base URL: `https://atmos.nmsu.edu/PDS/data/PDS4/Mars2020/mars2020_meda/`.

- The base folder holds `data_raw_env/`, `data_partially_processed_env/`, `data_calibrated_env/`, `data_derived_env/`, `data_skycam/`, `browse_skycam/`, `document/`, `context/`, and `xml_schema/`.
- `data_derived_env/` and `data_calibrated_env/` hold range folders: `sol_0000_0089/`, `sol_0090_0179/`, `sol_0180_0299/`, `sol_0300_0419/`, and so on to `sol_1740_1859/`. Each range folder holds one folder per sol, such as `sol_0300/`. The last sol is `sol_1859/`.
- Each `.CSV` file has an `.xml` label with the same name.
- The first three columns of every file are `SCLK`, `LMST`, and `LTST`. A sample row starts `693526530,00300M00:00:00.716,0300 00:31:49`.
- An empty field means no value. The wind file also uses `999999999`.

### Derived files for sol 300

Folder: `data_derived_env/sol_0300_0419/sol_0300/`.

| File | Columns after `SCLK,LMST,LTST` |
|---|---|
| `WE__0300___________DER_ANCILLARY___________P01.CSV` | `SOLAR_LONGITUDE_ANGLE`, `SOLAR_ZENITHAL_ANGLE`, `ROVER_POSITION_X`, `ROVER_POSITION_Y`, `ROVER_POSITION_Z`, `ROVER_VELOCITY`, `ROVER_PITCH`, `ROVER_YAW`, `ROVER_ROLL`, `MASTHEAD_AZIMUTH`, `MASTHEAD_ELEVATION` |
| `WE__0300___________DER_PS__________________P01.CSV` | `PRESSURE`, `PRESSURE_UNCERTAINTY`, `TRANSDUCER` |
| `WE__0300___________DER_RHS_________________P01.CSV` | `LOCAL_RELATIVE_HUMIDITY`, `LOCAL_RELATIVE_HUMIDITY_UNCERTAINTY`, `HUMIDITY_LOCAL_TEMP`, `HUMIDITY_LOCAL_TEMP_UNCERTAINTY`, `VOLUME_MIXING_RATIO`, `VOLUME_MIXING_RATIO_UNCERTAINTY` |
| `WE__0300___________DER_TIRS________________P02.CSV` | `DOWNWARD_LW_IRRADIANCE`, `DOWNWARD_LW_IRRADIANCE_UNCERTAINTY`, `UPWARD_LW_IRRADIANCE`, `UPWARD_LW_UNCERTAINTY`, then eight flag columns |
| `WE__0300___________DER_WS__________________P01.CSV` | `HORIZONTAL_WIND_SPEED`, `HORIZONTAL_WIND_SPEED_UNCERTAINTY`, `VERTICAL_WIND_SPEED`, `VERTICAL_WIND_SPEED_UNCERTAINTY`, `WIND_DIRECTION`, `WIND_DIRECTION_UNCERTAINTY`, `BOTH_BOOMS_USED_FOR_RETRIEVAL`, `ROVER_STILL` |

The derived folder for sol 300 has no ground temperature, no air temperature, no UV, and no reflected sunlight. Those are in the calibrated folder.

### Calibrated files for sol 300

Folder: `data_calibrated_env/sol_0300_0419/sol_0300/`.

| File | Columns after `SCLK,LMST,LTST` |
|---|---|
| `WE__0300___________CAL_TIRS________________P02.CSV` | `DOWNWARD_LW_IRRADIANCE`, `DOWNWARD_LW_IRRADIANCE_UNCERTAINTY`, `AIR_TEMP`, `AIR_TEMP_UNCERTAINTY`, `UPWARD_SW_IRRADIANCE`, `UPWARD_SW_IRRADIANCE_UNCERTAINTY`, `UPWARD_LW_IRRADIANCE`, `UPWARD_LW_IRRADIANCE_UNCERTAINTY`, `GROUND_TEMP`, `GROUND_TEMP_UNCERTAINTY`, then eight flag columns |
| `WE__0300___________CAL_ATS_________________P01.CSV` | `ATS_LOCAL_TEMP1` to `ATS_LOCAL_TEMP5` |
| `WE__0300___________CAL_PS__________________P02.CSV` | `BAROCAP1_PRESSURE`, `BAROCAP2_PRESSURE`, `BAROCAP3_PRESSURE` with uncertainties, `THERMOCAP1_TEMP`, `THERMOCAP2_TEMP` with uncertainties, `PRESSURE_MEASUREMENT_MODE`, `TRANSDUCER` |
| `WE__0300___________CAL_RHS_________________P01.CSV` | `HUMICAP_A_HUMIDITY`, `HUMICAP_B_HUMIDITY`, `HUMICAP_TEMP`, `THERMOCAP1_TEMP`, `THERMOCAP2_TEMP`, each with an uncertainty column |
| `WE__0300___________CAL_RDS_________________P01.CSV` | `RDS_LAT_1` to `RDS_LAT_8`, `RDS_TOP_1` to `RDS_TOP_8`, the same sixteen names with the suffix `_HG`, `ROVER_HGA_STILL`, `ROVER_STILL` |
| `WE__0300___________CAL_WS__________________P01.CSV` | Wind columns per boom. The pod has no wind sensor. |
| `WE__0300___________CAL_ENG_________________P01.CSV` | Engineering values. Not used. |

First data row of sol 300, as test values: `PRESSURE` 633.03, `LOCAL_RELATIVE_HUMIDITY` 5.76, `HUMIDITY_LOCAL_TEMP` 208.77, `GROUND_TEMP` 202.00, `AIR_TEMP` 208.38, `UPWARD_SW_IRRADIANCE` -0.30, `ATS_LOCAL_TEMP1` 203.30.

### Units and descriptions from the sol 300 labels

Read from the `.xml` label beside each file. The label gives `<name>`, `<unit>`, and `<description>` per column.

| File | Column | Unit in the label | Description in the label |
|---|---|---|---|
| `DER_PS` | `PRESSURE` | pascal | "Pressure" |
| `DER_RHS` | `LOCAL_RELATIVE_HUMIDITY` | none given | "Local relative humidity" |
| `DER_RHS` | `HUMIDITY_LOCAL_TEMP` | kelvin | "Humidity local temperature" |
| `CAL_TIRS` | `GROUND_TEMP` | kelvin | "TIRS Ground brightness temperature" |
| `CAL_TIRS` | `AIR_TEMP` | kelvin | "TIRS Air Temperature" |
| `CAL_TIRS` | `UPWARD_SW_IRRADIANCE` | watt/m2 | "TIRS Upward SW (0.3-3 μm band), for a hemispherical FoV" |
| `CAL_TIRS` | `TIRS_GROUND_FOOTPRINT_NOT_IN_SHADOW` | none | "0 = Ground focused area is shadowed by the rover, 1 = Ground focused area not shadowed by the rover" |
| `CAL_ATS` | `ATS_LOCAL_TEMP1` | kelvin | "Local air temperature near the unit mounted on the RSM at 50º" |
| `CAL_ATS` | `ATS_LOCAL_TEMP2` | kelvin | "Local air temperature near the unit mounted on the RSM at 155º" |
| `CAL_ATS` | `ATS_LOCAL_TEMP3` | kelvin | "Local air temperature near the unit mounted on the RSM at 290º" |
| `CAL_ATS` | `ATS_LOCAL_TEMP4` | kelvin | "Local air temperature near the unit mounted on the RFB at Port side/Pilot" |
| `CAL_ATS` | `ATS_LOCAL_TEMP5` | kelvin | "Local air temperature near the unit mounted on the RFB at Starboard/Co-pilot" |
| `CAL_RDS` | `RDS_TOP_1` to `RDS_TOP_8` | watt/m2 | "Top Mount Photodiode n radiance integrated over Field of View" |
| `CAL_RDS` | `RDS_LAT_1` | amp | "Lateral Mount Photodiode 1 temperature corrected current in amps (non-optical channel)" |
| `CAL_RDS` | `RDS_LAT_2` to `RDS_LAT_8` | watt/m2 | "Lateral Mount Photodiode n radiance integrated over Field of View" |

- The labels give no wavelength for any `RDS` channel. Nothing in the labels says which channel is UV or which one measures total sunlight.
- The labels give no height above the ground for any `ATS` sensor.
- Row counts for sol 300: `CAL_TIRS` 54,654, `CAL_RDS` 54,425, `CAL_ATS` 54,655, `DER_PS` 54,301, `DER_RHS` 54,243. That is about one row per second for 15 hours, so a sol has gaps.

### Other sols

A reviewer's call on 12 November 2026 listed `data_derived_env/sol_1740_1859/sol_1800/`. It holds `DER_ANCILLARY`, `DER_PS`, `DER_RHS`, and `DER_TIRS` only, each 2.5 to 5 MB. The set of files changes from sol to sol.

### RDS wavelength bands checked for U07

Checked on 14 November 2026. The archive's `document/` listing includes
`meda_env_rdr_sis.pdf`. Its calibrated RDS table on pages 47 and 48 gives
column meanings and units, without wavelength bands. The downloaded copy
is retained under `data/raw/meda/document/`.
[MEDA RDR specification](https://atmos.nmsu.edu/PDS/data/PDS4/Mars2020/mars2020_meda/document/meda_env_rdr_sis.pdf)

Table 24 of Rodriguez-Manfredi et al. (2021), section 7, gives these bands.
The following table retains the published wavelength notation in nanometres.
[Instrument paper and table 24](https://pmc.ncbi.nlm.nih.gov/articles/PMC8550605/)

| Detector | Wavelength in nm |
| --- | --- |
| TOP 1 | 255 +/- 5 |
| TOP 2 | 295 +/- 5 |
| TOP 3 | 250-400 |
| TOP 4 | 450 +/- 40 |
| TOP 5 | 650 +/- 25 |
| TOP 6 | 750 +/- 10 |
| TOP 7 | 190-1100 |
| TOP 8 | 950 +/- 50 |
| LAT 1 | 750 +/- 10, blinded detector |
| LAT 2 through LAT 8 | 750 +/- 10 |

Section 7 describes LAT 1 as blinded for radiation-damage monitoring.
The table identifies TOP 3 with surface UV flux. Choosing a channel for the
project's UV-index or reflectivity comparison remains a team decision.
[Instrument paper](https://doi.org/10.1007/s11214-021-00816-9)

### U07 sol 300 download and reduction

Checked on 14 November 2026. The calibrated and derived directory listings
above contained all four required CSV/XML pairs. The full downloads passed
the native-unit checks against their XML labels. The first data records
matched every sol 300 test value listed above. XML file sizes also matched
the saved CSV byte counts.

Run `python pipeline/fetch_meda.py --sol 300` from the repository root.
The command selected sol 300 without a fallback. Default D11 requires at
least 72 measured bins per channel. The output keeps all 144 ten-minute
LMST bins, with a reason and a count of zero for every missing bin.

| Product | Data records excluding the header | Channel | Measured bins |
| --- | ---: | --- | ---: |
| CAL_TIRS | 54,653 | ground_temp, after the shadow filter | 85 |
| CAL_ATS | 54,654 | air_temp, ATS_LOCAL_TEMP1 | 96 |
| DER_RHS | 54,242 | humidity | 96 |
| DER_PS | 54,300 | pressure | 96 |

The earlier row counts include the header. These counts are the
`Table_Delimited` data-record counts in the labels and agree with the parser.
Sol 300 has gaps in every channel. Empty bins remain missing.

The Jezero card reports a ground-temperature range of 89.465162 C, an
air-temperature mean of -45.771896 C, a humidity mean of 3.423849 with an
unstated unit, and a pressure mean of 6.245185 hPa. The means weight each
available bin equally, as D16 specifies. Humidity's native and output units
are null with the required reason. UV and reflectivity are missing with
reasons pending the team's comparison decision.

`app/public/data/mars/manifest.json` records the chosen sol, filenames, URLs,
CSV and XML SHA-256 hashes, coverage counts, and default settings.
`docs/meda-files.md` lists the selected products. A cached rerun made no
network requests and preserved the public files' bytes and modification times.
The transport requests 524,288-byte ranges by default, a labelled default in
`shared/meda_settings.json`. It checks range boundaries and source ETags before
publishing a complete cache file. A live test with smaller ranges reproduced
the complete 10,298-byte humidity XML label byte for byte.

## Natural Earth

Called on 12 November 2026.

| URL | Status | Size |
|---|---|---|
| `https://raw.githubusercontent.com/nvkelso/natural-earth-vector/master/geojson/ne_110m_land.geojson` | 200 | 138,160 bytes |
| `https://raw.githubusercontent.com/nvkelso/natural-earth-vector/master/geojson/ne_50m_land.geojson` | 200 | 1,636,166 bytes |

### U05 land grid and monthly binary layers

Computed on 14 November 2026 by `python pipeline/pack.py`, using the complete
U04 cache on machine `YAHIA`. The initial fetch printed `0 fetched, 3888 cached`.

The Natural Earth 50m URL above returned HTTP 200 and 1,636,166 bytes. Its
GeoJSON has 1,420 features, with Polygon and MultiPolygon geometries. The raw
response is saved at `data/raw/naturalearth/ne_50m_land.geojson`.

The D13 even-odd land rule, including its pole-row copies, retained **68,816
unique land cells**. This replaces the earlier uncounted estimate of about
62,000. No threshold or land rule was changed to obtain that count.

- `cells.bin`: 550,528 bytes, little-endian Float32 latitude/longitude pairs,
  ordered by latitude then longitude.
- `month-01.bin` through `month-12.bin`: 825,792 bytes each, all below 2 MB.
  Each holds six quantity blocks as little-endian Int16, in the order U05 gives.
- `manifest.json` records the count, order, units, scales, offsets, fill value,
  source parameters, source grids and the climatology period 2001 through 2025.
- The January cell at latitude 25.5, longitude 51.25 reads back as range
  13.52 C, air temperature 17.51 C, pressure 1016.2 hPa, UV 0.81, and
  reflectivity 0.13, within each scale step, in both Python and TypeScript.
- Latitude 0, longitude -140 is excluded. Latitude -89.5, longitude 0 is
  included. Missing polar-night albedo remains missing.

D12 joining, D13 land selection and D17 encoding choices are labelled
`status: default` in the manifest. Its per-quantity status applies to the
packing scale, offset and fill encoding, not to the verified POWER mapping.
Encoding rounds to nearest integer with ties to even and rejects overflow or
a valid value colliding with -32768. The loader returns null for that fill
value, with the layer's `missingReason` applying to each null.

## U28 environment and package inspection

Checked on 13 November 2026 in the U28 checkout. These are software observations,
not scientific inputs. `git checkout main` and `git pull` completed before work.
The GitHub pull-request API returned U01 PR #2 as merged on 12 November 2026,
with merge commit `985eaee93d30ea142097ecc37f2803a54eefc724`; that commit is in main.

Commands run:

```
node --version
python --version
python -m pip --version
```

The configured tools returned Node v24.12.0, Python 3.14.10, and pip 26.2.2.
Python and pip were invoked from the Python 3.14 installation on the D drive;
the pre-existing default Python was 3.13.1 and was not used for the pipeline check.

After `npm ci`, a Node command read each package's installed `package.json`
and its `exports`, and dynamically imported the React entry points:

```js
import fs from 'node:fs'
for (const name of ['react', 'react-dom', 'vitest', 'vite', 'typescript']) {
  const pkg = JSON.parse(fs.readFileSync(`node_modules/${name}/package.json`, 'utf8'))
  console.log(name, pkg.version, pkg.exports)
}
for (const name of ['react', 'react-dom/client', 'react-dom/server']) {
  console.log(name, Object.keys(await import(name)))
}
```

Results: React 19.3.1, React DOM 19.3.1, Vitest 5.1.0, Vite 8.3.8,
TypeScript 7.0.2. React exports `useEffect` and `useSyncExternalStore`;
React DOM's client entry exports `createRoot`, and its server entry exports
`renderToStaticMarkup`. No npm package was added or updated for U28.

## U14 Earth angle check

Called Horizons on 13 November 2026 with the common observer parameters above
and the Earth site `CENTER='coord@399'`, `SITE_COORD='51.5,25.3,0'`.
Set `APPARENT='AIRLESS'`, `START_TIME='2026-11-14 00:00'`,
`STOP_TIME='2026-11-14 20:00'`, and `STEP_SIZE='4 h'`.
The response contained exactly six airless azimuth/elevation rows, including
negative nighttime elevations. The complete response is saved at
`pipeline/tests/fixtures/horizons-earth-2026-11-14.txt`.

U14 uses the US Naval Observatory's [Computing Approximate Solar Coordinates](https://aa.usno.navy.mil/faq/sun_approx)
for the apparent ecliptic longitude, declination, and equation of time, and its
[altitude and azimuth equations](https://aa.usno.navy.mil/faq/alt_az) for the
horizon projection. The local hour angle uses the equation of time and east
longitude. The model omits atmospheric refraction and does not resolve terrain.

D5's longitude-zero rows are representative daily paths. Longitude is modelled
as an hour-angle shift within those rows. Solar declination and the equation of
time change through the day, so the representative paths are an approximation
when reused at other longitudes. To evaluate a particular time and location,
pass the longitude and timestamp to `sun_position`.

U14's Earth path file stores signed azimuth and elevation in little-endian
Int16 hundredths of a degree. Ali confirmed using the signed azimuth range
`[-180, 180)` because compass angles near 360 degrees exceed Int16 at this
scale. After decoding a negative azimuth, add 360 to obtain the compass angle.
The row order, angular encoding and default sampling are in
`app/public/data/sun/earth-paths-manifest.json`.

## Browser links for the pod

Checked on 13 November 2026 in desktop Chrome 157.0.8103.51 with a fresh headless profile. A temporary WebSocket server listened on the laptop's private IPv4 address and sent one text frame. From an HTTP localhost page, Chrome received the frame. From an HTTPS test origin, Chrome initially reported `net::ERR_BLOCKED_BY_LOCAL_NETWORK_ACCESS_CHECKS`. After granting the HTTPS origin local-network access through the browser automation context, Chrome received the same frame.

Use localhost for the direct Wi-Fi link during the field demo. A hosted HTTPS page can also connect if Chrome grants it local-network access. USB serial and replay are available when the Wi-Fi link is blocked. The WebSocket probe used a temporary server. The physical pod and USB reconnect checks remain open.

Both origins reported a secure context, exposed `navigator.serial.requestPort`, and returned an empty list from `navigator.serial.getPorts()` in the fresh profile. Chrome documents selecting a port from a user action, opening it with `baudRate`, reading from its byte stream, and releasing the stream lock before closing the port.

[WebSocket standard](https://websockets.spec.whatwg.org/) · [Chrome Web Serial](https://developer.chrome.com/docs/capabilities/serial) · [Chrome Local Network Access](https://developer.chrome.com/blog/local-network-access)

## Pod firmware toolchain

Checked on 13 November 2026. Arduino CLI `1.6.0` with the Espressif package index installed ESP32 core `3.3.12`. The index is `https://espressif.github.io/arduino-esp32/package_esp32_index.json`. The command `arduino-cli board listall NodeMCU-32S` returned `NodeMCU-32S` with FQBN `esp32:esp32:nodemcu-32s`.

`arduino-cli lib list` returned these external libraries. The project URLs in [the sources registry](../shared/sources.json) come from the installed `library.properties` files or the Arduino library index. The Arduino index lists `https://github.com/PaulStoffregen/OneWire.git` as the repository for OneWire 2.3.8.

| Library | Version |
| --- | --- |
| BH1750 | 1.3.0 |
| Adafruit MLX90614 Library | 2.1.7 |
| Adafruit BMP280 Library | 3.0.0 |
| DHT sensor library | 1.4.7 |
| Adafruit Unified Sensor | 1.1.15 |
| Adafruit BusIO | 1.17.4 |
| OneWire | 2.3.8 |
| DallasTemperature | 4.0.6 |
| WebSockets | 2.7.2 |

The installed WebSockets library includes `examples/esp32/WebSocketServer/WebSocketServer.ino`. The example starts a server on port 81, handles `WStype_CONNECTED`, and uses `sendTXT` and `broadcastTXT`. The firmware uses this server to send CSV lines. The installed ESP32 core example `libraries/ESP32/examples/Time/SimpleTime/SimpleTime.ino` uses `pool.ntp.org` for time synchronization.

BH1750 `1.3.0` reads an unsigned 16-bit count. In continuous high-resolution mode at MTreg 31, its `readLightLevel` scales the count by `69 / 31 / 1.2`. The maximum is approximately 121,556 lux. D8's 120,000 lux remains the simulator input. The firmware header uses the library-derived maximum.

## U31 soil wetness and source checks

On 14 November 2026, a GET to `https://power.larc.nasa.gov/api/temporal/climatology/regional` with `parameters=GWETTOP`, `community=AG`, `latitude-min=20`, `latitude-max=30`, `longitude-min=50`, `longitude-max=60`, and `format=JSON` returned HTTP 200 and 94,149 bytes. Its unchanged response is `pipeline/tests/fixtures/power/gwettop-regional-20-30-50-60.json`. The unit is `1`; latitude runs from 20 to 30 in 0.5-degree steps, longitude from 50 to 60 in 0.625-degree steps, with 357 cells. The cell at latitude 25.5, longitude 51.25 returns January 0.26, November 0.12, and annual 0.14, matching the earlier point call. The climatology period is 20010101 to 20251231. This confirms GWETTOP on the existing meteorology grid, rather than a new grid.

The source attempts and exact download URLs are recorded in `docs/mobility-sources.md`. The SRTM download returned HTTP 401 through Earthdata Login. The LOLA slope and Hurst labels returned HTTP 200, and the MOLA roughness grid returned HTTP 200 with 260,564 bytes, but no matched Earth/target terrain comparison was established. The MODIS NDVI CSV URL redirected to HTML at `https://science.nasa.gov/earth/nasa-earth-observations-neo/`; NASA's notice says NEO was decommissioned in September 2026. The actual NDVI reply was not numeric data. No terrain or bare-ground value is inferred from those unsuccessful comparison inputs.

The complete GWETTOP run on machine `YAHIA` printed `647 fetched, 1 cached` with no failures; the initial probe was the cached tile. All 648 tiles matched the existing meteorology grid, including its zero-boundary rule. `python pipeline/pack_mobility.py` then printed `0 fetched, 648 cached` and `Packed GWETTOP dryness: 68816 existing U05 land cells; 12 month files, 137632 bytes each.` The new files are `app/public/data/earth/mobility-01.bin` through `mobility-12.bin`, plus `mobility-manifest.json`. The manifest records the unchanged U05 cell-file fingerprint, source, period, fill value and D20 scale. The raw probe fixture's SHA256 is `62b603b60b3a8191fbbafe0b70b7d233b207b947d7226f45be228409c6e4236b`.

## U10 map outline and package inspection

On 14 November 2026, `.venv/Scripts/python pipeline/fetch_geo.py` fetched the
registered `naturalearth_110m` URL from `shared/sources.json` and wrote the
unchanged response to `app/public/data/geo/ne_110m_land.geojson`. It printed:

```text
Natural Earth land outline: ne_110m_land.geojson, 138160 bytes
```

Parsing that saved response returned a `FeatureCollection` with 127 features,
all with `Polygon` geometry. `Get-FileHash -Algorithm SHA256` returned
`9E0729EE253CA7D7A5C4AE9395FB1902264C5377C52E224D13DD85010E2835D9`.
This agrees with the earlier verified outline size.

The installed d3-geo package reports version 3.1.2, with its default export
entry at `dist/d3-geo.mjs`. Reading that file and importing the installed module
confirmed named exports `geoEqualEarth` and `geoPath`. The installed
`@types/d3-geo` version is 3.1.1; its declarations include `fitExtent`,
`GeoProjection`, `GeoPermissibleObjects`, and canvas-context `geoPath`.
On 14 November 2026, after rebasing U10 onto main with U07, U11 and U15 merged,
`npm run preview -- --host 127.0.0.1 --port 4173` served the production build.
The ChatGPT in-app browser opened that URL. Pressing ArrowRight on the Month
slider produced these real console messages, read through `tab.dev.logs`:

```text
U10 month change: February; 72.6 ms
U10 month change: March; 84.0 ms
```

The first change used Jezero and the second used Shackleton. Both meet U10's
under-200-ms limit. The loaded asset was `assets/index-fF7l71zp.js`. The March
Moon ranking displayed 0.987; clicking its first link opened
`#/card/cell/0?target=shackleton&test=power&month=3` and the loaded card also
displayed 0.987. The browser's warning/error log was empty. This completes the
browser check that the original draft could not obtain. Map/card integration
tests also compare the unrounded scores using the shipped data files.

## Not verified yet

Confirm each of these with a real call or a real document before you use it. Then move it into a section above.

- The unit of `LOCAL_RELATIVE_HUMIDITY`. The label gives none. The sample value 5.76 looks like percent.
- The minimum size of a POWER regional request. One reviewer reported that POWER rejects a box smaller than 2 degrees per side. The 10 degree tiles in the plan are not affected.
- The source for the Moon site coordinates `222.69, -89.45` and for the Jezero coordinates `77.45 E, 18.44 N`. The Jezero value passed the MEDA cross-check above. Neither has a citation.
- The exact relation between `SCLK` and UTC.
- The behavior of the Web Serial API after a cable drop.
- The grid of `AOD_55` on the regional endpoint. Only the point endpoint was called.
- Matched slope and roughness layers for Earth and both targets, and a numeric bare-ground layer. U31 confirmed candidate LOLA metadata and downloaded a MOLA roughness grid, but its SRTM and MODIS download attempts did not supply usable Earth layers. See `docs/mobility-sources.md` for the actual calls. On 12 November 2026 the earlier NEO pages for `MOD_NDVI_M` and `SRTM_RAMP2_TOPO` returned the same 255,301-byte page; the later U31 calls identify the retirement notice.
- The coordinates of the four known sites in `docs/project-brief.md`. The brief gives names and source links only.
