# Pod line format

The pod uses the same CSV record on USB serial, on WebSocket, and in its stored log. Each record occupies one line. Use the following column line.

```csv
ts,lux_up,lux_dn,tg,tamb,uv,ta,rh,p,t10
```

| Field | Reading | Unit |
| --- | --- | --- |
| `ts` | UTC timestamp | ISO 8601, for example `2026-11-14T02:51:00Z` |
| `lux_up` | Up-facing light sensor | lux |
| `lux_dn` | Down-facing light sensor | lux |
| `tg` | Infrared ground temperature | °C |
| `tamb` | Infrared sensor's own temperature | °C |
| `uv` | Approximate UV index | UV index |
| `ta` | Air temperature | °C |
| `rh` | Relative humidity | % |
| `p` | Pressure | hPa |
| `t10` | Ground temperature at 10 cm | °C |

Keep `tamb` in the record and use `ta` for air temperature. Leave a field empty when its sensor gives no reading. Keep the comma separators. Write numbers with a decimal point and no thousands separators. End each timestamp with `Z`.

## Log header

A line beginning with `#` is a comment. A line in the form `# key=value` carries a setting. The log begins with these settings, followed by the column line.

| Setting | Meaning |
| --- | --- |
| `pole_height_m` | Height of the pod above the ground, in metres |
| `tilt_deg` | Tilt of the ground-facing sensors, in degrees |
| `facing_deg` | Compass direction in degrees clockwise from north. South is 180 degrees. |
| `refl_factor` | Correction factor measured with the grey card |
| `ta_offset_c` | Air-temperature offset, in °C |
| `lux_max` | Highest reportable reading at the selected light-sensor setting, in lux |

A light reading at or above `lux_max` is saturated. Pass the active `lux_max` to `parsePodLine` when parsing a record to get a saturation flag for each light sensor. The parser returns separate results for records, columns, settings, comments, and errors. Boot text returns an error.

## Live links and stored log

The pod gets UTC from the internet at startup. It begins sending and logging records once it has the time. It samples every two seconds and sends each record over WebSocket on port 81 and USB serial at 115,200 baud. It sends the six settings when a link opens. Send a newline over USB serial to request the six settings and the column line again. The port and baud rate are D9 defaults.

The pod writes one-minute averages to `/log.csv` in its own memory and serves the file over HTTP. It timestamps each average at the end of the minute in UTC. The log path is a D9 default. Record the start and end of the field run in `docs/field-log.md`.

## Simulator

Run `python tools/pod_sim.py` from the repository root to regenerate the sample log and its inputs under `app/public/data/sim/`. The log begins with `# simulated=true`, followed by the six settings and the column line. It contains 1,440 records timestamped at minute ends. Run `python tools/pod_sim.py --live` to stream the same line format to standard output at two-second intervals. Use `--help` for the D8 input flags.

The simulator uses synthetic curves seeded by the November POWER climatology for the test site. It uses the D8 Sun times recorded from Horizons. The simulated values are for testing the protocol.

[Software plan defaults](software-plan.md#defaults) · [Mission plan timing and parts](mission-plan.md#parts-the-code-talks-to) · [Verified data](verified-facts.md)
