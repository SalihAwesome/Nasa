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

- On the meteorology grid, a tile includes both of its edges. Two neighbor tiles return the same edge cells. Remove the duplicates.
- Longitude runs from -180.0 to 179.375 on the meteorology grid. The tile from longitude 170 to 180 returns 16 columns, and it has no column at 180.0. Latitude runs from -90.0 to 90.0.
- Polar tiles work. `T2M` for latitude 80 to 90, longitude 170 to 180 returned 336 cells. `T2M` for latitude -90 to -80, longitude -180 to -170 returned 357 cells.
- `ALLSKY_SRF_ALB` for latitude 80 to 90 returned -999.0 for January in all 100 cells. The far north has no albedo in the polar night.
- `TS_RANGE` and `PS` come on the meteorology grid. Nobody has requested `RH2M` from the regional endpoint.

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

### Earth site, rise, transit, and set

`CENTER='coord@399'`, `SITE_COORD='51.5,25.3,0'`, `START_TIME='2026-11-14'`, `STOP_TIME='2026-11-15'`, `STEP_SIZE='1 m'`, `R_T_S_ONLY='TVH'`.

| Time (UT) | Flag | Azimuth | Elevation |
|---|---|---|---|
| 2026-Nov-14 02:51 | `r` | 109.876958 | -0.668149 |
| 2026-Nov-14 08:19 | `t` | 180.204314 | 46.438803 |
| 2026-Nov-14 13:47 | `s` | 250.142435 | -0.972968 |

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

## Natural Earth

Called on 12 November 2026.

| URL | Status | Size |
|---|---|---|
| `https://raw.githubusercontent.com/nvkelso/natural-earth-vector/master/geojson/ne_110m_land.geojson` | 200 | 138,160 bytes |
| `https://raw.githubusercontent.com/nvkelso/natural-earth-vector/master/geojson/ne_50m_land.geojson` | 200 | 1,636,166 bytes |

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

## Not verified yet

Confirm each of these with a real call or a real document before you use it. Then move it into a section above.

- The wavelength band of each `RDS_TOP_n` and `RDS_LAT_n` channel, and which one, if any, is UV or total sunlight. The answer should be in the `document/` folder of the archive. Nobody has opened it.
- The unit of `LOCAL_RELATIVE_HUMIDITY`. The label gives none. The sample value 5.76 looks like percent.
- Whether sol 300 has valid values through the whole day in `CAL_TIRS`, `CAL_ATS`, `DER_PS`, and `DER_RHS`.
- The minimum size of a POWER regional request. One reviewer reported that POWER rejects a box smaller than 2 degrees per side. The 10 degree tiles in the plan are not affected.
- The source for the Moon site coordinates `222.69, -89.45` and for the Jezero coordinates `77.45 E, 18.44 N`. The Jezero value passed the MEDA cross-check above. Neither has a citation.
- The count of land cells. The plan says about 62,000. Nobody has counted.
- The exact relation between `SCLK` and UTC.
- The behavior of the Web Serial API after a cable drop.
- The grid of `GWETTOP` and of `AOD_55` on the regional endpoint. Only the point endpoint was called.
- A download for slope and roughness on Earth, the Moon, and Mars, and one for bare ground. The brief names SRTM, LOLA, MOLA, and the MODIS vegetation index. On 12 November 2026 two pages of NASA Earth Observations, for `MOD_NDVI_M` and `SRTM_RAMP2_TOPO`, returned the same 255,301 byte page with no data link, so that site is not a confirmed source.
- The coordinates of the four known sites in `docs/project-brief.md`. The brief gives names and source links only.
- The board name that `arduino-cli` uses for the NodeMCU ESP-32S, and a WebSocket library for it.
