"""U04: resumable, sequential NASA POWER climatology download.

Raw responses are written before parsing, then atomically renamed only after
validation. Grid mismatches stop the run; transient failures get three retries.
"""

import argparse
from dataclasses import dataclass
import json
import math
from pathlib import Path
import sys
import time
from typing import Callable

import requests

from registries import load_registries

ROOT = Path(__file__).resolve().parents[1]
RAW_DIR = ROOT / "data/raw/power"
MONTHS = ("JAN", "FEB", "MAR", "APR", "MAY", "JUN", "JUL", "AUG", "SEP", "OCT", "NOV", "DEC")
# Units and grid assignments: docs/verified-facts.md, NASA POWER.
UNITS = {"TS_RANGE": "C", "T2M": "C", "RH2M": "%", "PS": "kPa", "ALLSKY_SRF_ALB": "dimensionless", "ALLSKY_SFC_UV_INDEX": "W m-2 x 40"}
SOLAR = {"ALLSKY_SRF_ALB", "ALLSKY_SFC_UV_INDEX"}


class GridError(ValueError):
    """The response is not on the documented grid; never retry it."""


class TileFetchError(RuntimeError):
    """All attempts for a tile failed."""


@dataclass(frozen=True)
class Tile:
    south: int
    west: int

    def __post_init__(self):
        if type(self.south) is not int or type(self.west) is not int or not -90 <= self.south <= 80 or not -180 <= self.west <= 170:
            raise ValueError("A ten-degree tile must fit within the world bounds")

    def path(self, raw_dir: Path, parameter: str) -> Path:
        return raw_dir / parameter / f"lat_{self.south}_lon_{self.west}.json"

    def query(self, parameter: str) -> dict:
        return {"parameters": parameter, "community": "AG", "latitude-min": self.south, "latitude-max": self.south + 10, "longitude-min": self.west, "longitude-max": self.west + 10, "format": "JSON"}


@dataclass
class Result:
    fetched: int
    cached: int
    failed: list[dict]


def parameters() -> tuple[str, ...]:
    """Use U02's mappings, in the six-parameter order specified by U04."""
    channels = {c["id"]: c for c in load_registries()["channels"]}
    result = tuple(channels[key]["powerParameter"] for key in ("ground_temp", "air_temp", "humidity", "pressure", "reflectivity", "uv"))
    if len(set(result)) != 6 or set(result) != set(UNITS):
        raise ValueError("U02 POWER mappings do not match U04's six parameters")
    return result


def tiles() -> tuple[Tile, ...]:
    return tuple(Tile(south, west) for south in range(-90, 90, 10) for west in range(-180, 180, 10))


def _finite(value) -> bool:
    try:
        return type(value) in (int, float) and math.isfinite(value)
    except OverflowError:
        return False


def _values(feature: dict, parameter: str) -> dict:
    values = feature["properties"]["parameter"][parameter]
    if not all(key in values and _finite(values[key]) for key in (*MONTHS, "ANN")):
        raise ValueError(f"{parameter}: missing or invalid monthly value")
    return values


def validate_tile(data: dict, parameter: str, tile: Tile) -> None:
    """Check complete coordinates, duplicates, units and all monthly values.

    Fill values remain unchanged. These checks reduce no scientific values.
    """
    try:
        if data["type"] != "FeatureCollection":
            raise GridError("Expected a GeoJSON FeatureCollection")
        features = data["features"]
        coords = [f["geometry"]["coordinates"] for f in features]
        if any(len(c) < 2 or not _finite(c[0]) or not _finite(c[1]) for c in coords):
            raise GridError("Invalid coordinate")
        if parameter in SOLAR:
            expected = {(tile.west + 0.5 + x, tile.south + 0.5 + y) for x in range(10) for y in range(10)}
        else:
            # The real U04 probes confirmed that an exactly-zero lower bound
            # excludes that shared edge. Adjacent negative tiles still have it.
            # See docs/verified-facts.md; no other missing edge is accepted.
            expected = {
                (tile.west + x * 0.625, tile.south + y * 0.5)
                for x in range(17) for y in range(21)
                if tile.west + x * 0.625 < 180
                and not (tile.west == 0 and x == 0)
                and not (tile.south == 0 and y == 0)
            }
        actual = {(c[0], c[1]) for c in coords}
        if actual != expected or len(coords) != len(expected):
            raise GridError(f"{parameter} {tile}: unexpected grid ({len(coords)} cells; expected {len(expected)})")
        if data["parameters"][parameter]["units"] != UNITS[parameter]:
            raise ValueError(f"{parameter}: unexpected unit")
        if data["header"]["fill_value"] != -999:
            raise ValueError("Unexpected POWER fill value")
        for feature in features:
            _values(feature, parameter)
    except (KeyError, TypeError, IndexError) as error:
        raise ValueError(f"Malformed POWER tile: {error}") from error


def _policy() -> dict:
    data = json.loads((ROOT / "shared/power_fetch_settings.json").read_text(encoding="utf-8"))
    if data.get("status") != "default" or len(data["retryWaitSeconds"]) != 3 or not all(_finite(v) and v >= 0 for v in [*data["retryWaitSeconds"], data["http429WaitSeconds"]]) or not _finite(data["requestTimeoutSeconds"]) or data["requestTimeoutSeconds"] <= 0:
        raise ValueError("Invalid POWER retry settings")
    return data


def _session() -> requests.Session:
    session = requests.Session()
    # One retry layer only; redirects are also disabled on each GET.
    session.mount("https://", requests.adapters.HTTPAdapter(max_retries=0))
    return session


def _download(path: Path, url: str, query: dict, validate: Callable, session, sleep: Callable, policy: dict) -> dict:
    path.parent.mkdir(parents=True, exist_ok=True)
    temporary = path.with_suffix(path.suffix + ".tmp")
    for attempt in range(4):
        response = None
        try:
            response = session.get(url, params=query, timeout=policy["requestTimeoutSeconds"], allow_redirects=False)
            # Preserve the exact response before parsing or checking its content.
            temporary.write_bytes(response.content)
            if response.status_code != 200:
                raise requests.HTTPError(f"HTTP {response.status_code}", response=response)
            data = json.loads(temporary.read_bytes())
            validate(data)
            temporary.replace(path)
            return data
        except GridError:
            raise
        except (requests.RequestException, ValueError) as error:
            if attempt == 3:
                raise TileFetchError(f"four attempts failed: {error}") from error
            wait = policy["http429WaitSeconds"] if response is not None and response.status_code == 429 else policy["retryWaitSeconds"][attempt]
            sleep(wait)
    raise AssertionError("unreachable")


def _ledger(path: Path, failures: list[dict]) -> None:
    temporary = path.with_suffix(".json.tmp")
    temporary.write_text(json.dumps(failures, indent=2) + "\n", encoding="utf-8")
    temporary.replace(path)


def fetch_all(raw_dir: Path = RAW_DIR, *, session=None, sleep: Callable = time.sleep, selected_parameters=None, selected_tiles=None, progress: Callable | None = None) -> Result:
    selected_parameters = parameters() if selected_parameters is None else tuple(selected_parameters)
    selected_tiles = tiles() if selected_tiles is None else tuple(selected_tiles)
    if any(parameter not in UNITS for parameter in selected_parameters):
        raise ValueError("Only the six U04 parameters may be fetched")
    raw_dir = Path(raw_dir)
    raw_dir.mkdir(parents=True, exist_ok=True)
    policy = _policy()
    url = next(s["url"] for s in load_registries()["sources"] if s["id"] == "power") + "/temporal/climatology/regional"
    owns_session = session is None
    session = _session() if session is None else session
    result = Result(0, 0, [])
    try:
        for parameter in selected_parameters:
            for tile in selected_tiles:
                path = tile.path(raw_dir, parameter)
                try:
                    if path.exists():
                        try:
                            validate_tile(json.loads(path.read_bytes()), parameter, tile)
                        except GridError:
                            raise
                        except ValueError as error:
                            raise TileFetchError(f"Invalid cached tile {path}; inspect it before removing it: {error}") from error
                        result.cached += 1
                    else:
                        _download(path, url, tile.query(parameter), lambda data: validate_tile(data, parameter, tile), session, sleep, policy)
                        result.fetched += 1
                except (TileFetchError, GridError) as error:
                    result.failed.append({"parameter": parameter, "south": tile.south, "west": tile.west, "error": str(error)})
                    _ledger(raw_dir / "failed.json", result.failed)
                    if isinstance(error, GridError):
                        raise
                if progress is not None:
                    progress(f"{result.fetched} fetched, {result.cached} cached, {len(result.failed)} failed; {parameter} {tile.south},{tile.west}")
        _ledger(raw_dir / "failed.json", result.failed)
        print(f"{result.fetched} fetched, {result.cached} cached" + (f", {len(result.failed)} failed" if result.failed else ""), flush=True)
        return result
    finally:
        if owns_session:
            session.close()


def check_download(raw_dir: Path = RAW_DIR) -> None:
    """Prove the second fetch is offline, then make two separate point checks."""
    class NoNetwork:
        def get(self, *args, **kwargs):
            raise AssertionError("Second fetch attempted a network request; cache is incomplete")

    result = fetch_all(raw_dir, session=NoNetwork())
    if (result.fetched, result.cached, result.failed) != (0, 3888, []):
        raise AssertionError("Full 3888-tile cache check failed")
    base = next(s["url"] for s in load_registries()["sources"] if s["id"] == "power")
    with _session() as session:
        for parameter, lat, lon in [("T2M", 25.5, 51.25), ("ALLSKY_SRF_ALB", 25.5, 51.5)]:
            point_path = Path(raw_dir).parent / "power-check" / f"{parameter}.json"
            point = _download(point_path, base + "/temporal/climatology/point", {"parameters": parameter, "community": "AG", "latitude": lat, "longitude": lon, "format": "JSON"}, lambda data: _values(data, parameter), session, time.sleep, _policy())
            tile = Tile(20, 50)
            regional = json.loads(tile.path(Path(raw_dir), parameter).read_bytes())
            cell = next(f for f in regional["features"] if f["geometry"]["coordinates"][:2] == [lon, lat])
            earth = _values(cell, parameter)
            reference = _values(point, parameter)
            if any(earth[month] != reference[month] for month in MONTHS):
                raise AssertionError(f"{parameter}: regional and point values disagree: {earth} vs {reference}")
            print(f"{parameter} at {lat},{lon}: 12/12 monthly values match; " + json.dumps([earth[m] for m in MONTHS]), flush=True)


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--raw-dir", type=Path, default=RAW_DIR)
    parser.add_argument("--check", action="store_true", help="Check the full cache without fetch requests, then compare two live point responses")
    args = parser.parse_args()
    try:
        if args.check:
            check_download(args.raw_dir)
            return 0
        result = fetch_all(args.raw_dir, progress=lambda line: print(line, flush=True))
        return 1 if result.failed else 0
    except (GridError, TileFetchError, OSError, ValueError, AssertionError) as error:
        print(str(error), file=sys.stderr, flush=True)
        return 1


if __name__ == "__main__":
    raise SystemExit(main())
