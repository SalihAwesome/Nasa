"""Separate source products must stay out of the scored UV-index/albedo slots."""
import csv
import io
import json
from pathlib import Path

import numpy as np
import pytest

from fetch_comparison import build_comparison, peak_uv, published_albedo
from fetch_meda import ROOT, MedaError, parse_label

FIXTURES = Path(__file__).parent / "fixtures/meda-sol-300"


def test_peak_uses_recorded_ten_minute_means_and_keeps_empty_bins_missing(tmp_path):
    path = tmp_path / "simulated.csv"
    path.write_text("# simulated=true\nLMST,RDS_TOP_3\n"
                    "00300M11:00:00.000,2\n00300M11:01:00.000,4\n"
                    "00300M11:10:00.000,\n00300M11:20:00.000,1\n")
    label = parse_label(FIXTURES / "rds.xml", "CAL_RDS")
    with pytest.raises(MedaError, match="simulated"):
        peak_uv(path, label, 300)
    result = peak_uv(path, label, 300, allow_simulated=True)
    assert result == {"value": 3, "recordedBins": 2, "observations": 3, "peakBinStartMinute": 660}


def test_shipped_supplement_is_separate_from_scored_card():
    data = json.loads((ROOT / "app/public/data/mars/jezero-comparison.json").read_text(encoding="utf8"))
    card = json.loads((ROOT / "app/public/data/mars/jezero-card.json").read_text())
    assert data["unitClarifications"]["humidity"]["unit"] == "%"
    assert card["channels"]["humidity"]["unit"] is None
    assert data["supplements"]["reflectivity"]["value"] == pytest.approx(14.7)
    for key in ("uv", "reflectivity"):
        assert card["channels"][key]["value"] is None
        assert "excluded from match scores" in data["supplements"][key]["note"]
        assert data["supplements"][key]["source"].startswith("https://")


@pytest.mark.raw_data("comparison/rds.csv", "comparison/rds.xml", "comparison/albedo.pdf", "comparison/humidity.html")
def test_cached_sources_reproduce_shipped_data_and_independent_uv_reduction(tmp_path):
    result = build_comparison(out_dir=tmp_path)
    saved = json.loads((ROOT / "app/public/data/mars/jezero-comparison.json").read_text(encoding="utf8"))
    assert result == saved
    assert published_albedo(ROOT / "data/raw/comparison/albedo.pdf") == pytest.approx(14.7)
    # Independent numpy reduction of the raw archive response.
    raw = (ROOT / "data/raw/comparison/rds.csv").read_text()
    by_bin = {}
    for row in csv.DictReader(io.StringIO(raw)):
        if row["RDS_TOP_3"].strip():
            clock = row["LMST"].split("M")[1]
            index = (int(clock[:2]) * 60 + int(clock[3:5])) // 10
            by_bin.setdefault(index, []).append(float(row["RDS_TOP_3"]))
    assert result["supplements"]["uv"]["value"] == pytest.approx(max(np.mean(values) for values in by_bin.values()))
    assert result["supplements"]["uv"]["recordedBins"] == len(by_bin)
