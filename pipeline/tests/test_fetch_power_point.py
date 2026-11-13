import json
from pathlib import Path

from fetch_power_point import build_satellite_data, parse_start
from registries import load_registries


FIXTURES = Path(__file__).parent / "fixtures"


def load_power_fixture(name):
    return json.loads((FIXTURES / name).read_text(encoding="utf-8"))


def test_power_hourly_and_climatology():
    registries = load_registries()
    requests = []

    def fetch(product, params):
        requests.append((product, params))
        fixture = "power-point-climatology.json" if product == "climatology" else "power-point-hourly-20261109.json"
        return load_power_fixture(fixture)

    output = build_satellite_data(registries, parse_start("2026-11-09T00:00:00Z"), fetch)
    channels = output["channels"]
    assert set(channels) == {"ground_temp", "reflectivity", "uv", "air_temp", "humidity", "pressure"}
    for channel in channels.values():
        assert isinstance(channel["climatology"]["value"], (int, float))
        assert channel["climatology"]["period"] == "2001 to 2025"
    for channel_id in ("ground_temp", "air_temp", "humidity", "pressure"):
        assert len(channels[channel_id]["hourly"]) == 24
        assert channels[channel_id]["cardNumber"]["basis"] == "same day"
    for channel_id in ("reflectivity", "uv"):
        assert channels[channel_id]["hourly"] is None
        assert channels[channel_id]["reason"] == "POWER has no hourly value for these hours yet."
        assert channels[channel_id]["cardNumber"]["basis"] == "monthly climatology, 2001 to 2025"
    assert channels["ground_temp"]["cardNumber"]["value"] == (
        max(point["value"] for point in channels["ground_temp"]["hourly"])
        - min(point["value"] for point in channels["ground_temp"]["hourly"])
    )
    assert channels["pressure"]["climatology"]["value"] == 1013.2
    assert requests[0][0] == "hourly"
    assert requests[0][1]["time-standard"] == "UTC"
    assert requests[0][1]["start"] == requests[0][1]["end"] == "20261109"


def test_one_fill_value_suppresses_hourly_series_and_uses_climatology():
    registries = load_registries()

    def fetch(product, params):
        if product == "climatology":
            return load_power_fixture("power-point-climatology.json")
        response = load_power_fixture("power-point-hourly-20261109.json")
        response["properties"]["parameter"]["TS"]["2026110912"] = -999
        return response

    output = build_satellite_data(registries, parse_start("2026-11-09T00:00:00Z"), fetch)
    ground = output["channels"]["ground_temp"]
    assert ground["hourly"] is None
    assert ground["reason"] == "POWER has no hourly value for these hours yet."
    assert ground["cardNumber"] == {"value": 14.5, "basis": "monthly climatology, 2001 to 2025"}


def test_window_crosses_midnight_without_using_the_hour_before_the_log():
    registries = load_registries()
    requests = []

    def fetch(product, params):
        if product == "climatology":
            return load_power_fixture("power-point-climatology.json")
        requests.append(params)
        return load_power_fixture("power-point-hourly-20261109.json")

    output = build_satellite_data(registries, parse_start("2026-11-08T23:59:59Z"), fetch)
    assert requests[0]["start"] == "20261108"
    assert requests[0]["end"] == "20261109"
    assert output["channels"]["ground_temp"]["hourly"][0]["ts"] == "2026-11-09T00:00:00Z"
    assert output["channels"]["ground_temp"]["hourly"][-1]["ts"] == "2026-11-09T23:00:00Z"


def test_non_midnight_start_requests_both_dates():
    registries = load_registries()
    requests = []

    def fetch(product, params):
        if product == "climatology":
            return load_power_fixture("power-point-climatology.json")
        requests.append(params)
        return load_power_fixture("power-point-hourly-20261109.json")

    output = build_satellite_data(registries, parse_start("2026-11-09T12:00:00Z"), fetch)
    assert requests[0]["start"] == "20261109"
    assert requests[0]["end"] == "20261110"
    assert output["channels"]["ground_temp"]["hourly"] is None
