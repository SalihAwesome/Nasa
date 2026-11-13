"""U04 checks. The fixture is the saved response of the documented RH2M call."""

import json
from pathlib import Path
from types import SimpleNamespace

import pytest
import requests

from fetch_power import GridError, Tile, fetch_all, parameters, tiles, validate_tile

FIXTURE = Path(__file__).parent / "fixtures/power/rh2m-regional-20-30-45-55.json"
TILE = Tile(20, 45)


class Session:
    """Simulated transport; successful payloads are saved real responses."""

    def __init__(self, replies):
        self.replies = iter(replies)
        self.calls = []

    def get(self, url, **kwargs):
        self.calls.append((url, kwargs))
        reply = next(self.replies)
        if isinstance(reply, Exception):
            raise reply
        return reply


def response(status=200, content=None):
    return SimpleNamespace(status_code=status, content=FIXTURE.read_bytes() if content is None else content)


def test_world_plan_is_exactly_3888_unique_single_parameter_jobs():
    world = tiles()
    assert len(world) == len(set(world)) == 648
    assert world[0] == Tile(-90, -180)
    assert world[-1] == Tile(80, 170)
    assert parameters() == ("TS_RANGE", "T2M", "RH2M", "PS", "ALLSKY_SRF_ALB", "ALLSKY_SFC_UV_INDEX")
    assert len(world) * len(parameters()) == 3888


def test_real_rh2m_fixture_confirms_grid_and_preserves_monthly_values():
    raw = json.loads(FIXTURE.read_bytes())
    validate_tile(raw, "RH2M", TILE)
    coords = [f["geometry"]["coordinates"] for f in raw["features"]]
    assert len(coords) == 357
    assert sorted({c[1] for c in coords}) == [20 + i * 0.5 for i in range(21)]
    assert sorted({c[0] for c in coords}) == [45 + i * 0.625 for i in range(17)]


def test_real_south_pole_response_includes_the_pole_and_negative_dateline():
    raw = json.loads((FIXTURE.parent / "ts-range-south-pole.json").read_bytes())
    validate_tile(raw, "TS_RANGE", Tile(-90, -180))
    coords = {tuple(f["geometry"]["coordinates"][:2]) for f in raw["features"]}
    assert (-180, -90) in coords
    assert (-170, -80) in coords
    assert len(coords) == 357


def test_real_north_dateline_response_stops_at_179_375():
    raw = json.loads((FIXTURE.parent / "ts-range-north-dateline.json").read_bytes())
    validate_tile(raw, "TS_RANGE", Tile(80, 170))
    coords = [f["geometry"]["coordinates"] for f in raw["features"]]
    assert len(coords) == 336
    assert max(c[0] for c in coords) == 179.375
    assert max(c[1] for c in coords) == 90


def test_real_albedo_response_uses_one_degree_cell_centers():
    raw = json.loads((FIXTURE.parent / "albedo-south-pole.json").read_bytes())
    validate_tile(raw, "ALLSKY_SRF_ALB", Tile(-90, -180))
    coords = [f["geometry"]["coordinates"] for f in raw["features"]]
    assert len(coords) == 100
    assert sorted({c[1] for c in coords}) == [-89.5 + i for i in range(10)]
    assert sorted({c[0] for c in coords}) == [-179.5 + i for i in range(10)]


@pytest.mark.parametrize("south,west,count", [(-90, 0, 336), (0, 10, 340), (0, 0, 320)])
def test_verified_zero_lower_bound_excludes_only_that_shared_edge(south, west, count):
    raw = json.loads((FIXTURE.parent / f"ts-range-lat{south}-lon{west}.json").read_bytes())
    validate_tile(raw, "TS_RANGE", Tile(south, west))
    assert len(raw["features"]) == count
    coords = [f["geometry"]["coordinates"] for f in raw["features"]]
    if south == 0:
        assert min(c[1] for c in coords) == 0.5
    if west == 0:
        assert min(c[0] for c in coords) == 0.625


def test_cli_returns_nonzero_when_any_tile_fails(monkeypatch, tmp_path):
    import fetch_power
    monkeypatch.setattr("sys.argv", ["fetch_power.py", "--raw-dir", str(tmp_path)])
    monkeypatch.setattr(fetch_power, "fetch_all", lambda *args, **kwargs: fetch_power.Result(0, 0, [{"error": "simulated failure"}]))
    assert fetch_power.main() == 1


def test_solar_grid_accepts_only_the_documented_cell_centers_and_preserves_fill():
    # Explicitly simulated schema/geometry test, not a scientific fixture.
    # Centers and -999 fill come from docs/verified-facts.md.
    from fetch_power import MONTHS
    raw = {
        "simulated": True, "type": "FeatureCollection", "header": {"fill_value": -999},
        "parameters": {"ALLSKY_SRF_ALB": {"units": "dimensionless"}},
        "features": [
            {"geometry": {"coordinates": [45.5 + x, 20.5 + y]}, "properties": {"parameter": {"ALLSKY_SRF_ALB": {key: -999 for key in (*MONTHS, "ANN")}}}}
            for x in range(10) for y in range(10)
        ],
    }
    validate_tile(raw, "ALLSKY_SRF_ALB", TILE)
    assert raw["features"][0]["properties"]["parameter"]["ALLSKY_SRF_ALB"]["JAN"] == -999
    raw["features"][0]["geometry"]["coordinates"][0] += 0.5
    with pytest.raises(GridError):
        validate_tile(raw, "ALLSKY_SRF_ALB", TILE)


def test_second_run_makes_zero_requests_and_preserves_raw_bytes(tmp_path, capsys):
    session = Session([response()])
    first = fetch_all(tmp_path, session=session, selected_parameters=("RH2M",), selected_tiles=(TILE,))
    assert (first.fetched, first.cached, first.failed) == (1, 0, [])
    assert TILE.path(tmp_path, "RH2M").read_bytes() == FIXTURE.read_bytes()
    second = fetch_all(tmp_path, session=session, selected_parameters=("RH2M",), selected_tiles=(TILE,))
    assert (second.fetched, second.cached, second.failed) == (0, 1, [])
    assert len(session.calls) == 1
    assert "0 fetched, 1 cached" in capsys.readouterr().out
    _, kwargs = session.calls[0]
    assert kwargs["params"] == {"parameters": "RH2M", "community": "AG", "latitude-min": 20, "latitude-max": 30, "longitude-min": 45, "longitude-max": 55, "format": "JSON"}
    assert kwargs["allow_redirects"] is False


def test_retries_exactly_three_times_with_documented_waits(tmp_path):
    session = Session([requests.ConnectionError("simulated outage")] * 3 + [response()])
    waits = []
    result = fetch_all(tmp_path, session=session, sleep=waits.append, selected_parameters=("RH2M",), selected_tiles=(TILE,))
    assert (result.fetched, result.failed) == (1, [])
    assert len(session.calls) == 4
    assert waits == [5, 20, 60]


def test_429_wait_replaces_retry_delay_and_is_not_doubled(tmp_path):
    session = Session([response(429), response(503), response()])
    waits = []
    result = fetch_all(tmp_path, session=session, sleep=waits.append, selected_parameters=("RH2M",), selected_tiles=(TILE,))
    assert result.fetched == 1
    assert waits == [60, 20]


def test_exhaustion_records_failure_and_continues_to_next_tile(tmp_path):
    session = Session([response(503)] * 4 + [response()])
    result = fetch_all(tmp_path, session=session, sleep=lambda _: None, selected_parameters=("RH2M",), selected_tiles=(Tile(10, 45), TILE))
    assert result.fetched == 1
    assert len(result.failed) == 1
    assert len(session.calls) == 5
    ledger = json.loads((tmp_path / "failed.json").read_text())
    assert ledger == result.failed
    assert ledger[0]["parameter"] == "RH2M"
    assert ledger[0]["south"] == 10
    assert not Tile(10, 45).path(tmp_path, "RH2M").exists()


def test_unexpected_grid_is_saved_for_diagnosis_and_stops_without_retry(tmp_path):
    raw = json.loads(FIXTURE.read_bytes())
    raw["features"][0]["geometry"]["coordinates"][0] += 0.1
    content = json.dumps(raw).encode()
    session = Session([response(content=content)])
    waits = []
    with pytest.raises(GridError):
        fetch_all(tmp_path, session=session, sleep=waits.append, selected_parameters=("RH2M",), selected_tiles=(TILE, Tile(30, 45)))
    assert len(session.calls) == 1
    assert waits == []
    assert not TILE.path(tmp_path, "RH2M").exists()
    assert TILE.path(tmp_path, "RH2M").with_suffix(".json.tmp").read_bytes() == content


def test_existing_unexpected_grid_is_not_silently_accepted_as_cached(tmp_path):
    path = TILE.path(tmp_path, "RH2M")
    path.parent.mkdir(parents=True)
    raw = json.loads(FIXTURE.read_bytes())
    raw["features"] = raw["features"][:-1]
    path.write_text(json.dumps(raw))
    session = Session([])
    with pytest.raises(GridError):
        fetch_all(tmp_path, session=session, selected_parameters=("RH2M",), selected_tiles=(TILE,))
    assert not session.calls


def test_interrupted_atomic_write_never_leaves_a_completed_tile(tmp_path, monkeypatch):
    original = Path.replace

    def interrupted(source, destination):
        if Path(destination) == TILE.path(tmp_path, "RH2M"):
            raise OSError("simulated interrupted rename")
        return original(source, destination)

    monkeypatch.setattr(Path, "replace", interrupted)
    session = Session([response()])
    with pytest.raises(OSError, match="interrupted"):
        fetch_all(tmp_path, session=session, selected_parameters=("RH2M",), selected_tiles=(TILE,))
    assert not TILE.path(tmp_path, "RH2M").exists()
    assert len(session.calls) == 1


def test_malformed_json_is_retried_without_caching_it(tmp_path):
    session = Session([response(content=b"simulated invalid JSON"), response()])
    waits = []
    result = fetch_all(tmp_path, session=session, sleep=waits.append, selected_parameters=("RH2M",), selected_tiles=(TILE,))
    assert result.fetched == 1
    assert waits == [5]
    assert TILE.path(tmp_path, "RH2M").read_bytes() == FIXTURE.read_bytes()


def test_missing_month_is_not_a_successful_cache_entry(tmp_path):
    raw = json.loads(FIXTURE.read_bytes())
    del raw["features"][0]["properties"]["parameter"]["RH2M"]["JAN"]
    session = Session([response(content=json.dumps(raw).encode())] * 4)
    result = fetch_all(tmp_path, session=session, sleep=lambda _: None, selected_parameters=("RH2M",), selected_tiles=(TILE,))
    assert len(result.failed) == 1
    assert result.fetched == 0
    assert not TILE.path(tmp_path, "RH2M").exists()
