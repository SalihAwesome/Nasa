"""Fetch NASA POWER values for the pod's UTC log window."""

import argparse
import json
import math
from datetime import UTC, datetime, timedelta
from decimal import Decimal
from pathlib import Path
from statistics import mean
from tempfile import NamedTemporaryFile

import requests

from registries import load_registries

OUTPUT = Path(__file__).resolve().parents[1] / "app/public/data/earth/pod-site-satellite.json"
PERIOD = "2001 to 2025"
CLIMATOLOGY_BASIS = f"monthly climatology, {PERIOD}"
HOURLY_MISSING = "POWER has no hourly value for these hours yet."
DAYLIGHT_PARAMETER = "ALLSKY_SFC_SW_DWN"
MONTH_KEYS = "JAN FEB MAR APR MAY JUN JUL AUG SEP OCT NOV DEC".split()


def parse_start(value):
    try:
        start = datetime.strptime(value, "%Y-%m-%dT%H:%M:%SZ").replace(tzinfo=UTC)
        if start.isoformat().replace("+00:00", "Z") != value:
            raise ValueError
        return start
    except ValueError as error:
        raise argparse.ArgumentTypeError("expected UTC YYYY-MM-DDTHH:MM:SSZ") from error


def fetch_point(base_url, product, params):
    response = requests.get(f"{base_url}/temporal/{product}/point", params=params, timeout=45)
    response.raise_for_status()
    return response.json()


def power_value(response, parameter, key, scale=1):
    value = response["properties"]["parameter"].get(parameter, {}).get(key)
    fill = response["header"].get("fill_value", -999)
    if type(value) not in (int, float) or not math.isfinite(value) or value == fill or value == -999:
        return None
    return float(Decimal(str(value)) * Decimal(str(scale)))


def hourly_points(response, parameter, hours, scale=1):
    points = []
    for hour in hours:
        value = power_value(response, parameter, hour.strftime("%Y%m%d%H"), scale)
        if value is None:
            return None
        points.append({"ts": hour.isoformat().replace("+00:00", "Z"), "value": value})
    return points


def card_value(method, points, daylight):
    values = [point["value"] for point in points]
    if method == "range":
        return max(values) - min(values)
    if method == "daylight_mean":
        values = [value for value, light in zip(values, daylight, strict=True) if light["value"] > 0]
    return mean(values) if values else None


def build_satellite_data(registries, start_override, fetch):
    site = registries["podSite"]
    lat, lon = site["lat"], site["lon"]
    start = start_override if start_override is not None else (
        parse_start(site["start"]) if site["start"] is not None else None
    )
    if lat is None or lon is None or start is None:
        raise ValueError("Pod position and UTC log start are required. See shared/pod_site.json.")

    channels = [channel for channel in registries["channels"] if channel["onCard"]]
    for channel in channels:
        if any(channel[field] is None for field in ("powerParameter", "powerHourlyParameter", "powerScale")):
            raise ValueError(f"Card channel {channel['id']} has no POWER configuration")

    end = start + timedelta(days=1)
    first_hour = start.replace(minute=0, second=0, microsecond=0)
    if first_hour < start:
        first_hour += timedelta(hours=1)
    hours = [first_hour + timedelta(hours=index) for index in range(24)]
    month = MONTH_KEYS[start.month - 1]

    common = {"community": "AG", "latitude": lat, "longitude": lon, "format": "JSON"}
    hourly_query = {
        **common,
        "start": start.strftime("%Y%m%d"),
        "end": (end - timedelta(seconds=1)).strftime("%Y%m%d"),
        "time-standard": "UTC",
    }
    hourly = fetch("hourly", {
        **hourly_query,
        "parameters": ",".join(dict.fromkeys(channel["powerHourlyParameter"] for channel in channels)),
    })
    if hourly["header"]["time_standard"] != "UTC":
        raise ValueError("NASA POWER hourly response did not use UTC")
    climatology = fetch("climatology", {
        **common,
        "parameters": ",".join(dict.fromkeys(channel["powerParameter"] for channel in channels)),
    })

    output = {
        "site": {"lat": lat, "lon": lon, "start": start.isoformat().replace("+00:00", "Z"), "status": site["status"]},
        "channels": {},
    }
    if site.get("reason"):
        output["site"]["reason"] = site["reason"]

    for channel in channels:
        scale = channel["powerScale"]
        monthly_value = power_value(climatology, channel["powerParameter"], month, scale)
        monthly = {"value": monthly_value, "month": month, "period": PERIOD}
        if monthly_value is None:
            monthly["reason"] = f"POWER has no climatology value for {month}."

        points = hourly_points(hourly, channel["powerHourlyParameter"], hours, scale)
        hourly_reason = HOURLY_MISSING if points is None else None
        same_day = None
        card_reason = None
        if points is not None:
            daylight = []
            if channel["cardNumber"] == "daylight_mean":
                light_response = fetch("hourly", {**hourly_query, "parameters": DAYLIGHT_PARAMETER})
                if light_response["header"]["time_standard"] != "UTC":
                    raise ValueError("NASA POWER daylight response did not use UTC")
                daylight = hourly_points(light_response, DAYLIGHT_PARAMETER, hours)
            if daylight is None:
                card_reason = "POWER has no complete hourly irradiance series for daylight selection."
            else:
                same_day = card_value(channel["cardNumber"], points, daylight)
                if same_day is None:
                    card_reason = "POWER reported no daylight hours in the log window."

        card = {"value": same_day, "basis": "same day"} if same_day is not None else {
            "value": monthly_value, "basis": CLIMATOLOGY_BASIS,
        }
        if monthly_value is None and same_day is None:
            card["reason"] = monthly["reason"]
        if card_reason is not None:
            card["sameDayReason"] = card_reason

        row = {"unit": channel["unit"], "climatology": monthly, "hourly": points, "cardNumber": card}
        if hourly_reason is not None:
            row["reason"] = hourly_reason
        output["channels"][channel["id"]] = row
    return output


def write_output(path, output):
    path.parent.mkdir(parents=True, exist_ok=True)
    with NamedTemporaryFile(
        mode="w", encoding="utf-8", newline="\n", dir=path.parent, delete=False
    ) as temporary:
        temp_path = Path(temporary.name)
        try:
            json.dump(output, temporary, indent=2, allow_nan=False)
            temporary.write("\n")
            temporary.close()
            temp_path.replace(path)
        finally:
            temporary.close()
            temp_path.unlink(missing_ok=True)


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--start", type=parse_start, help="Override the log start in UTC")
    parser.add_argument("--output", type=Path, default=OUTPUT, help="Write to an alternate JSON file")
    args = parser.parse_args()
    try:
        registries = load_registries()
        base_url = next(source["url"] for source in registries["sources"] if source["id"] == "power")
        if base_url is None:
            raise ValueError("NASA POWER URL missing from shared/sources.json")
        output = build_satellite_data(
            registries, args.start, lambda product, params: fetch_point(base_url, product, params)
        )
        write_output(args.output, output)
    except (OSError, ValueError, KeyError, StopIteration, requests.RequestException) as error:
        parser.exit(1, f"Could not fetch pod-site satellite data: {error}\n")

    for name, row in output["channels"].items():
        count = len(row["hourly"]) if row["hourly"] is not None else 0
        print(f"{name}: {count} hourly values, {row['cardNumber']['basis']}, {row['cardNumber']['value']}")
        if "reason" in row:
            print(f"  {row['reason']}")


if __name__ == "__main__":
    main()
