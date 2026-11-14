"""U10 transport tests use the exact saved Natural Earth response from the app."""
from pathlib import Path
from types import SimpleNamespace

import pytest

from fetch_geo import fetch_land

ROOT = Path(__file__).resolve().parents[2]


def test_downloads_registered_land_outline_unchanged(tmp_path):
    raw = (ROOT / "app/public/data/geo/ne_110m_land.geojson").read_bytes()
    calls = []

    def get(url, **kwargs):
        calls.append((url, kwargs))
        return SimpleNamespace(content=raw, raise_for_status=lambda: None)

    output = fetch_land(tmp_path, get=get)
    assert output.name == "ne_110m_land.geojson"
    assert output.read_bytes() == raw
    assert len(calls) == 1
    assert calls[0][0].endswith("/ne_110m_land.geojson")


def test_bad_response_leaves_no_output(tmp_path):
    # Simulated malformed transport response; never used by the app.
    def get(*args, **kwargs):
        return SimpleNamespace(content=b'{"simulated":true}', raise_for_status=lambda: None)

    with pytest.raises(ValueError):
        fetch_land(tmp_path, get=get)
    assert list(tmp_path.iterdir()) == []
