"""Pytest plugin for the raw_data marker.

A test marked raw_data("a.nc", "b.csv") needs those files under data/raw/ at
the repo root. The workflow has no data/raw/, so the test skips there and
names the first missing file.
"""

from pathlib import Path

import pytest

RAW_DIR = Path(__file__).resolve().parent.parent / "data" / "raw"


def pytest_runtest_setup(item: pytest.Item) -> None:
    for marker in item.iter_markers(name="raw_data"):
        for name in marker.args:
            if not (RAW_DIR / name).exists():
                pytest.skip(f"data/raw/{name} is absent. Fetch it first.")
