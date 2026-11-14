"""Fetch the U13 airless Sun paths and compute the target Sun metrics."""

import argparse
import hashlib
import json
from datetime import datetime, timedelta
from math import isfinite
from pathlib import Path
from tempfile import NamedTemporaryFile
from urllib.parse import urlencode
from urllib.request import urlopen

from registries import parse_sources
from sun import sun_numbers


ROOT = Path(__file__).resolve().parents[1]
TARGETS = ("shackleton", "jezero")
WINDOW = {
    "start": "2026-11-01",
    "stop": "2026-12-01",
    "step_hours": 1,
    "status": "default",
}
OBSERVER = {
    "COMMAND": "10",
    "OBJ_DATA": "NO",
    "MAKE_EPHEM": "YES",
    "EPHEM_TYPE": "OBSERVER",
    "COORD_TYPE": "GEODETIC",
    "QUANTITIES": "4",
}


def request_url(endpoint, coordinates):
    query = dict(
        OBSERVER,
        CENTER=coordinates["center"],
        SITE_COORD=coordinates["site"]["value"],
        START_TIME=WINDOW["start"],
        STOP_TIME=WINDOW["stop"],
        STEP_SIZE=f"{WINDOW['step_hours']} h",
    )
    return endpoint + "?" + urlencode({"format": "text", **{key: f"'{value}'" for key, value in query.items()}})


def download(url):
    with urlopen(url, timeout=30) as response:
        return response.read()


def write_atomic(path, content):
    path.parent.mkdir(parents=True, exist_ok=True)
    with NamedTemporaryFile(dir=path.parent, delete=False) as stream:
        pending = Path(stream.name)
    try:
        pending.write_bytes(content)
        pending.replace(path)
    finally:
        pending.unlink(missing_ok=True)


def parse_rows(raw):
    text = raw.decode("ascii")
    _, start, table = text.partition("$$SOE")
    table, end, _ = table.partition("$$EOE")
    if not start or not end:
        raise ValueError("missing Horizons ephemeris markers")
    if "Airless apparent azimuth and elevation" not in text:
        raise ValueError("expected airless apparent azimuth and elevation")

    start_time = datetime.fromisoformat(WINDOW["start"])
    stop_time = datetime.fromisoformat(WINDOW["stop"])
    step = timedelta(hours=WINDOW["step_hours"])
    expected_count = (stop_time - start_time) // step + 1
    lines = table.strip().splitlines()
    if len(lines) != expected_count:
        raise ValueError(f"expected {expected_count} hourly rows, got {len(lines)}")

    rows = []
    for index, line in enumerate(lines):
        fields = line.split()
        if len(fields) < 4:
            raise ValueError(f"incomplete Horizons row {index + 1}")
        time = datetime.strptime(" ".join(fields[:2]), "%Y-%b-%d %H:%M")
        if time != start_time + index * step:
            raise ValueError(f"unexpected UT time in row {index + 1}: {time}")
        azimuth, elevation = map(float, fields[-2:])
        if not (isfinite(azimuth) and isfinite(elevation) and 0 <= azimuth <= 360 and -90 <= elevation <= 90):
            raise ValueError(f"invalid angles in row {index + 1}")
        rows.append({"time_ut": time.isoformat(), "azimuth": azimuth, "elevation": elevation})
    return rows


def build_target_data(raw_dir, output_dir, *, fetch=download, refresh=False):
    sources = parse_sources(json.loads((ROOT / "shared/sources.json").read_text(encoding="utf-8")))
    endpoint = next(source["url"] for source in sources if source["id"] == "horizons")
    settings = json.loads((ROOT / "shared/targets.json").read_text(encoding="utf-8"))
    targets = {entry["id"]: entry["horizons"] for entry in settings if entry["id"] in TARGETS}
    products = {}
    checks = {}

    for name in TARGETS:
        target = targets[name]
        url = request_url(endpoint, target)
        key = hashlib.sha256(url.encode("ascii")).hexdigest()
        cache = raw_dir / f"{name}-{key}.txt"
        if refresh or not cache.exists():
            write_atomic(cache, fetch(url))
        try:
            rows = parse_rows(cache.read_bytes())
        except ValueError as error:
            raise ValueError(f"{cache}: {error}. Use --refresh to replace the raw reply.") from error

        metadata = {
            "target": name,
            "source": {"id": "horizons", "request_url": url},
            "site": target["site"],
            "window": WINDOW,
            "time_scale": "UT",
            "angle_units": "degrees",
        }
        azimuths = [row["azimuth"] for row in rows]
        elevations = [row["elevation"] for row in rows]
        products[f"{name}.json"] = {**metadata, "rows": rows}
        products[f"{name}-numbers.json"] = {
            **metadata,
            "sample_count": len(rows),
            "numbers": sun_numbers(azimuths, elevations),
        }
        checks[name] = len(rows)

    # Finish parsing both replies before replacing any public output.
    for filename, product in products.items():
        content = json.dumps(product, indent=2, allow_nan=False) + "\n"
        write_atomic(output_dir / filename, content.encode("utf-8"))
    return checks


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--refresh", action="store_true", help="Download both raw replies again")
    args = parser.parse_args()
    try:
        checks = build_target_data(
            ROOT / "data/raw/horizons", ROOT / "app/public/data/sun", refresh=args.refresh
        )
    except (OSError, ValueError, KeyError) as error:
        parser.exit(1, f"{error}\n")
    for target, count in checks.items():
        print(f"{target}: {count} hourly samples and Sun metrics written")


if __name__ == "__main__":
    main()
