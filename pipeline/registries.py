"""Parse the U02 shared contracts. Only standard-library modules are needed."""

import json
import math
import re
from datetime import datetime
from pathlib import Path
from typing import Literal, NotRequired, TypedDict, cast
from urllib.parse import urlsplit


class RegistryError(ValueError):
    """A registry is malformed; the message identifies the field."""


Status = Literal["default", "verified", "needs_human"]
CardNumber = Literal["range", "daylight_mean", "daily_mean"]


class Channel(TypedDict):
    id: str
    label: str
    unit: str
    podFields: list[str]
    powerParameter: str | None
    powerHourlyParameter: str | None
    powerScale: float | None
    medaFile: str | None
    medaColumn: str | None
    cardNumber: CardNumber | None
    onCard: bool
    status: Status
    reasons: dict[str, str]


class Source(TypedDict):
    id: str
    name: str
    url: str | None
    usedFor: str
    accessed: str | None
    files: list[str]
    reasons: dict[str, str]


class Exclusion(TypedDict):
    start: str
    end: str


class PodSite(TypedDict):
    lat: float | None
    lon: float | None
    start: str | None
    exclude: list[Exclusion]
    status: Status
    reason: NotRequired[str]
    reasons: dict[str, str]


class DefaultSetting(TypedDict):
    value: float
    unit: str
    status: Literal["default"]


class PodSettings(TypedDict):
    sunEventLux: DefaultSetting
    reflectivityMinLux: DefaultSetting
    reflFactorFallback: DefaultSetting
    taOffsetFallbackC: DefaultSetting


class Registries(TypedDict):
    channels: list[Channel]
    sources: list[Source]
    podSite: PodSite
    podSettings: PodSettings


def _fail(path, message):
    raise RegistryError(f"{path}: {message}")


def _object(value, path, required, optional=()):
    if not isinstance(value, dict):
        _fail(path, "expected an object")
    for key in value:
        if key not in required and key not in optional:
            _fail(f"{path}.{key}", "unknown field")
    for key in required:
        if key not in value:
            _fail(f"{path}.{key}", "missing field")
    return value


def _text(value, path):
    if not isinstance(value, str) or not value.strip():
        _fail(path, "expected nonempty text")
    return value


def _number(value, path):
    if type(value) not in (int, float) or not math.isfinite(value):
        _fail(path, "expected a finite number")
    return value


def _boolean(value, path):
    if type(value) is not bool:
        _fail(path, "expected a boolean")
    return value


def _choice(value, path, choices):
    value = _text(value, path)
    if value not in choices:
        _fail(path, f"expected one of {', '.join(choices)}")
    return value


def _list(value, path, parse):
    if not isinstance(value, list):
        _fail(path, "expected an array")
    return [parse(v, f"{path}[{i}]") for i, v in enumerate(value)]


def _nullable(value, path, parse):
    return None if value is None else parse(value, path)


def _reasons(data, path):
    missing = [key for key, value in data.items() if value is None]
    raw = _object(data.get("reasons", {}), f"{path}.reasons", [], missing)
    return {key: _text(raw.get(key), f"{path}.reasons.{key} (null requires a reason)") for key in missing}


def _unique(items, path):
    seen = set()
    for item in items:
        if item["id"] in seen:
            _fail(path, f"duplicate id {item['id']}")
        seen.add(item["id"])
    return items


def _utc(value, path):
    value = _text(value, path)
    if not re.fullmatch(r"\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}Z", value):
        _fail(path, "expected UTC YYYY-MM-DDTHH:MM:SSZ")
    try:
        datetime.fromisoformat(value)
    except ValueError:
        _fail(path, "invalid UTC date")
    return value


def _date(value, path):
    value = _text(value, path)
    _utc(f"{value}T00:00:00Z", path)
    return value


def parse_channels(value: object) -> list[Channel]:
    def parse(value, path):
        d = _object(value, path, ["id", "label", "unit", "podFields", "powerParameter", "powerHourlyParameter", "powerScale", "medaFile", "medaColumn", "cardNumber", "onCard", "status"], ["reasons"])
        fields = _list(d["podFields"], f"{path}.podFields", _text)
        if not fields or len(set(fields)) != len(fields):
            _fail(path, "podFields must be nonempty and unique")
        scale = _nullable(d["powerScale"], f"{path}.powerScale", _number)
        if scale is not None and scale <= 0:
            _fail(path, "powerScale must be positive")
        channel = {
            **{key: _text(d[key], f"{path}.{key}") for key in ("id", "label", "unit")},
            **{key: _nullable(d[key], f"{path}.{key}", _text) for key in ("powerParameter", "powerHourlyParameter", "medaFile", "medaColumn")},
            "podFields": fields, "powerScale": scale,
            "cardNumber": _nullable(d["cardNumber"], f"{path}.cardNumber", lambda v, p: _choice(v, p, ["range", "daylight_mean", "daily_mean"])),
            "onCard": _boolean(d["onCard"], f"{path}.onCard"),
            "status": _choice(d["status"], f"{path}.status", ["default", "verified", "needs_human"]),
            "reasons": _reasons(d, path),
        }
        if (channel["medaFile"] is None) != (channel["medaColumn"] is None):
            _fail(path, "MEDA file and column must be supplied together")
        if ((channel["powerParameter"] is None) != (channel["powerHourlyParameter"] is None)
                or (channel["powerParameter"] is None) != (scale is None)):
            _fail(path, "POWER parameters and scale must be supplied together")
        if channel["onCard"] != (channel["cardNumber"] is not None):
            _fail(path, "cardNumber must match onCard")
        return channel
    return cast(list[Channel], _unique(_list(value, "channels", parse), "channels"))


def parse_sources(value: object) -> list[Source]:
    def parse(value, path):
        d = _object(value, path, ["id", "name", "url", "usedFor", "accessed", "files"], ["reasons"])
        url = _nullable(d["url"], f"{path}.url", _text)
        if url is not None:
            try:
                parsed = urlsplit(url)
                if parsed.scheme != "https" or not parsed.hostname or any(c.isspace() for c in url):
                    _fail(path, "source URL must use HTTPS with a valid hostname")
            except ValueError:
                _fail(path, "invalid source URL")
        files = _list(d["files"], f"{path}.files", _text)
        if not files or any(not f.startswith("app/public/data/") or ".." in f or "\\" in f or ":" in f[16:] for f in files):
            _fail(path, "files must be patterns under app/public/data/")
        return {
            **{key: _text(d[key], f"{path}.{key}") for key in ("id", "name", "usedFor")},
            "url": url, "accessed": _nullable(d["accessed"], f"{path}.accessed", _date),
            "files": files, "reasons": _reasons(d, path),
        }
    return cast(list[Source], _unique(_list(value, "sources", parse), "sources"))


def parse_pod_site(value: object) -> PodSite:
    d = _object(value, "podSite", ["lat", "lon", "start", "exclude", "status"], ["reason", "reasons"])
    lat = _nullable(d["lat"], "podSite.lat", _number)
    lon = _nullable(d["lon"], "podSite.lon", _number)
    if lat is not None and not -90 <= lat <= 90:
        _fail("podSite.lat", "outside latitude bounds")
    if lon is not None and not -180 <= lon <= 180:
        _fail("podSite.lon", "outside longitude bounds")

    def exclusion(value, path):
        item = _object(value, path, ["start", "end"])
        start, end = _utc(item["start"], f"{path}.start"), _utc(item["end"], f"{path}.end")
        if start >= end:
            _fail(path, "start must precede end")
        return {"start": start, "end": end}

    return cast(PodSite, {
        "lat": lat, "lon": lon, "start": _nullable(d["start"], "podSite.start", _utc),
        "exclude": _list(d["exclude"], "podSite.exclude", exclusion),
        "status": _choice(d["status"], "podSite.status", ["default", "verified", "needs_human"]),
        **({"reason": _text(d["reason"], "podSite.reason")} if "reason" in d else {}),
        "reasons": _reasons(d, "podSite"),
    })


def parse_pod_settings(value: object) -> PodSettings:
    keys = ["sunEventLux", "reflectivityMinLux", "reflFactorFallback", "taOffsetFallbackC"]
    d = _object(value, "podSettings", keys)

    def setting(key, unit):
        path = f"podSettings.{key}"
        raw = _object(d[key], path, ["value", "unit", "status"])
        value = _number(raw["value"], f"{path}.value")
        if _text(raw["unit"], f"{path}.unit") != unit:
            _fail(path, f"expected unit {unit}")
        if key in ("sunEventLux", "reflectivityMinLux") and value <= 0:
            _fail(path, "light threshold must be positive")
        if key == "reflFactorFallback" and not 0 < value <= 1:
            _fail(path, "correction factor must be in (0, 1]")
        return {"value": value, "unit": unit, "status": _choice(raw["status"], f"{path}.status", ["default"])}

    return cast(PodSettings, {key: setting(key, unit) for key, unit in zip(keys, ["lux", "lux", "ratio", "C"])})


def load_registries(shared_dir: Path | None = None) -> Registries:
    shared_dir = shared_dir if shared_dir is not None else Path(__file__).resolve().parents[1] / "shared"

    def read(name, parse):
        path = shared_dir / f"{name}.json"
        try:
            value = json.loads(path.read_text(encoding="utf-8"))
        except (OSError, ValueError) as error:
            raise RegistryError(f"{path}: {error}") from error
        return parse(value)

    return {"channels": read("channels", parse_channels), "sources": read("sources", parse_sources), "podSite": read("pod_site", parse_pod_site), "podSettings": read("pod_settings", parse_pod_settings)}
