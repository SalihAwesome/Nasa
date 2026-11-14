import json
from pathlib import Path
from urllib.parse import parse_qs, urlsplit

import pytest

from fetch_horizons import build_target_data
from sun import sun_numbers


FIXTURES = Path(__file__).parent / "fixtures"


def test_u13_target_paths(tmp_path):
    targets = {"'coord@301'": ("shackleton", "'222.69,-89.45,0'"),
               "'coord@499'": ("jezero", "'-77.45,18.44,0'")}
    fetched = {}

    def fetch(url):
        query = parse_qs(urlsplit(url).query)
        target, coordinates = targets[query["CENTER"][0]]
        assert query["SITE_COORD"] == [coordinates]
        assert query["START_TIME"] == ["'2026-11-01'"]
        assert query["STOP_TIME"] == ["'2026-12-01'"]
        assert query["STEP_SIZE"] == ["'1 h'"]
        assert query["QUANTITIES"] == ["'4'"]
        raw = (FIXTURES / f"horizons-{target}-2026-11.txt").read_bytes()
        assert target not in fetched
        fetched[target] = raw
        return raw

    raw_dir, output = tmp_path / "raw", tmp_path / "sun"
    build_target_data(raw_dir, output, fetch=fetch)
    assert set(fetched) == {"shackleton", "jezero"}
    assert sorted(file.read_bytes() for file in raw_dir.glob("*.txt")) == sorted(fetched.values())

    for target in fetched:
        path = json.loads((output / f"{target}.json").read_text(encoding="utf-8"))
        metrics = json.loads((output / f"{target}-numbers.json").read_text(encoding="utf-8"))
        rows = path["rows"]
        azimuths = [row["azimuth"] for row in rows]
        elevations = [row["elevation"] for row in rows]
        assert len(rows) == 721
        assert path["window"]["status"] == metrics["window"]["status"] == "default"
        assert path["site"]["citation"] is None and path["site"]["reasons"]["citation"]
        assert rows[0]["time_ut"] == "2026-11-01T00:00:00"
        assert rows[-1]["time_ut"] == "2026-12-01T00:00:00"
        assert metrics["numbers"] == sun_numbers(azimuths, elevations)
        extent = max(azimuths) - min(azimuths)
        print(f"{target}: {len(rows)} rows, elevation {min(elevations):.6f} to "
              f"{max(elevations):.6f} degrees, azimuth span {extent:.6f} degrees")
        if target == "shackleton":
            assert 0 <= min(elevations) <= max(elevations) <= 3
            assert extent > 350
        else:
            assert min(elevations) < 0 < max(elevations)

    original = {file.name: file.read_bytes() for file in output.glob("*.json")}

    def unexpected_fetch(url):
        pytest.fail(f"Warm-cache run requested {url}")

    build_target_data(raw_dir, output, fetch=unexpected_fetch)
    assert original == {file.name: file.read_bytes() for file in output.glob("*.json")}
    print("Warm-cache run: no HTTP calls and identical outputs.")


def test_incomplete_response_is_saved_and_never_published(tmp_path):
    raw = (FIXTURES / "horizons-shackleton-2026-11.txt").read_bytes()
    header, table = raw.split(b"$$SOE", 1)
    _, footer = table.split(b"$$EOE", 1)
    incomplete = header + b"$$SOE\n$$EOE" + footer
    raw_dir, output = tmp_path / "raw", tmp_path / "sun"
    with pytest.raises(ValueError, match="expected 721"):
        build_target_data(raw_dir, output, fetch=lambda url: incomplete)
    assert [file.read_bytes() for file in raw_dir.glob("*.txt")] == [incomplete]
    assert not list(output.glob("*.json"))
