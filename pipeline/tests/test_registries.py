"""U02 contract checks; values come from software-plan.md U02, D7, D10, D16, D19."""

import json
from pathlib import Path

import pytest

from registries import (
    RegistryError, load_registries, parse_channels, parse_sources,
    parse_pod_site, parse_pod_settings,
)

SHARED = Path(__file__).resolve().parents[2] / "shared"


def raw(name):
    return json.loads((SHARED / f"{name}.json").read_text(encoding="utf-8"))


def test_loads_all_four_registries_and_preserves_u02_contract():
    data = load_registries()
    assert [
        [c["id"], c["podFields"], c["powerParameter"], c["powerHourlyParameter"],
         c["powerScale"], c["medaFile"], c["medaColumn"], c["cardNumber"], c["onCard"]]
        for c in data["channels"]
    ] == [
        ["ground_temp", ["tg"], "TS_RANGE", "TS", 1, "CAL_TIRS", "GROUND_TEMP", "range", True],
        ["reflectivity", ["lux_dn", "lux_up"], "ALLSKY_SRF_ALB", "ALLSKY_SRF_ALB", 1, None, None, "daylight_mean", True],
        ["uv", ["uv"], "ALLSKY_SFC_UV_INDEX", "ALLSKY_SFC_UV_INDEX", 1, None, None, "daily_mean", True],
        ["air_temp", ["ta"], "T2M", "T2M", 1, "CAL_ATS", "ATS_LOCAL_TEMP1", "daily_mean", True],
        ["humidity", ["rh"], "RH2M", "RH2M", 1, "DER_RHS", "LOCAL_RELATIVE_HUMIDITY", "daily_mean", True],
        ["pressure", ["p"], "PS", "PS", 10, "DER_PS", "PRESSURE", "daily_mean", True],
        ["ground_temp_10cm", ["t10"], None, None, None, None, None, None, False],
    ]
    assert [s["id"] for s in data["sources"]] == ["power", "horizons", "meda", "naturalearth_50m", "naturalearth_110m", "pod", "computed"]
    site = data["podSite"]
    assert [site["lat"], site["lon"], site["start"], site["exclude"], site["status"]] == [25.3, 51.5, "2026-11-14T00:00:00Z", [], "default"]
    assert [(s["value"], s["status"]) for s in data["podSettings"].values()] == [(400, "default"), (1000, "default"), (0.27, "default"), (0, "default")]
    assert all(c["status"] == "default" for c in data["channels"])
    assert all(s["accessed"] == "2026-11-12" for s in data["sources"] if s["url"] is not None)


def test_rejects_channel_with_no_unit():
    data = raw("channels")
    del data[0]["unit"]
    with pytest.raises(RegistryError):
        parse_channels(data)


def test_rejects_null_without_corresponding_reason():
    data = raw("channels")
    del data[1]["reasons"]["medaFile"]
    with pytest.raises(RegistryError, match="medaFile"):
        parse_channels(data)


PARSERS = [("channels", parse_channels), ("sources", parse_sources), ("pod_site", parse_pod_site), ("pod_settings", parse_pod_settings)]


@pytest.mark.parametrize("name,parse", PARSERS)
def test_rejects_unknown_fields(name, parse):
    data = raw(name)
    entry = data[0] if isinstance(data, list) else data
    entry["unexpected"] = True
    with pytest.raises(RegistryError, match="unknown field"):
        parse(data)


def test_rejects_nested_unknown_settings_and_unexplained_source_nulls():
    settings = raw("pod_settings")
    settings["sunEventLux"]["unexpected"] = True
    with pytest.raises(RegistryError, match="unknown field"):
        parse_pod_settings(settings)
    sources = raw("sources")
    del next(s for s in sources if s["id"] == "pod")["reasons"]["url"]
    with pytest.raises(RegistryError, match="url"):
        parse_sources(sources)


def test_rejects_unknown_reason_keys_and_empty_reasons():
    data = raw("channels")
    data[1]["reasons"]["typo"] = "not a field"
    with pytest.raises(RegistryError, match="reason"):
        parse_channels(data)
    del data[1]["reasons"]["typo"]
    data[1]["reasons"]["medaFile"] = " "
    with pytest.raises(RegistryError, match="reason"):
        parse_channels(data)


def test_rejects_duplicate_ids_and_invalid_types():
    channels = raw("channels")
    channels[1]["id"] = channels[0]["id"]
    with pytest.raises(RegistryError, match="duplicate"):
        parse_channels(channels)
    settings = raw("pod_settings")
    settings["sunEventLux"]["value"] = "400"
    with pytest.raises(RegistryError, match="number"):
        parse_pod_settings(settings)


def test_checks_site_coordinates_utc_dates_and_ordered_exclusions():
    for changes in [{"lat": 91}, {"start": "2026-11-31T00:00:00Z"}, {"exclude": [{"start": "2026-11-14T03:00:00Z", "end": "2026-11-14T02:00:00Z"}]}]:
        with pytest.raises(RegistryError):
            parse_pod_site({**raw("pod_site"), **changes})
    site = raw("pod_site")
    site["exclude"] = [{"start": "2026-11-14T02:00:00Z", "end": "2026-11-14T03:00:00Z"}]
    assert parse_pod_site(site)["exclude"] == site["exclude"]


def test_preserves_missing_field_site_without_substituting_defaults():
    site = {"lat": None, "lon": None, "start": None, "exclude": [], "status": "needs_human", "reasons": {"lat": "Team input pending", "lon": "Team input pending", "start": "Team input pending"}}
    assert parse_pod_site(site) == site
    del site["reasons"]["lat"]
    with pytest.raises(RegistryError, match="lat"):
        parse_pod_site(site)


@pytest.mark.parametrize("name,parse", PARSERS)
def test_rejects_wrong_root_type(name, parse):
    with pytest.raises(RegistryError):
        parse(None)
