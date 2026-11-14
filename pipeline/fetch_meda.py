"""U07: download and reduce one measured MEDA sol for the Jezero reference."""

import argparse
import csv
from dataclasses import dataclass
from html.parser import HTMLParser
import hashlib
import json
import math
from pathlib import Path
import re
import tempfile
from urllib.parse import urljoin
import xml.etree.ElementTree as ET

import requests

from registries import load_registries

ROOT = Path(__file__).resolve().parents[1]
# Column names and native units are from docs/verified-facts.md, MEDA labels.
EXPECTED_UNITS = {
    "CAL_TIRS": {
        "GROUND_TEMP": "kelvin",
        "AIR_TEMP": "kelvin",
        "UPWARD_SW_IRRADIANCE": "watt/m2",
        "TIRS_GROUND_FOOTPRINT_NOT_IN_SHADOW": None,
    },
    "CAL_ATS": {f"ATS_LOCAL_TEMP{number}": "kelvin" for number in range(1, 6)},
    "DER_PS": {"PRESSURE": "pascal"},
    "DER_RHS": {
        "LOCAL_RELATIVE_HUMIDITY": None,
        "HUMIDITY_LOCAL_TEMP": "kelvin",
    },
}
NO_UNIT_REASON = "The MEDA label gives no unit."


class MedaError(ValueError):
    """A MEDA input violates the documented contract."""


@dataclass(frozen=True)
class Field:
    unit: str | None
    missing: tuple[float, ...]


@dataclass(frozen=True)
class Label:
    kind: str
    fields: dict[str, Field]
    records: int


class Listing(HTMLParser):
    def __init__(self):
        super().__init__()
        self.links = []

    def handle_starttag(self, tag, attrs):
        if tag == "a":
            self.links.extend(value for key, value in attrs if key == "href" and value)


def settings():
    config = json.loads((ROOT / "shared/meda_settings.json").read_text(encoding="utf-8"))
    for key in ("referenceSol", "lastFallbackSol", "binMinutes", "minimumBins", "downloadChunkBytes"):
        if type(config.get(key)) is not int:
            raise MedaError(f"Invalid MEDA setting {key}")
    minutes = config["binMinutes"]
    if (
        config.get("status") != "default"
        or config["referenceSol"] < 0
        or config["lastFallbackSol"] < config["referenceSol"]
        or minutes <= 0
        or 1440 % minutes != 0
        or not 1 <= config["minimumBins"] <= 1440 // minutes
        or config["downloadChunkBytes"] <= 0
        or config.get("groundShadowColumn") not in EXPECTED_UNITS["CAL_TIRS"]
    ):
        raise MedaError("Invalid MEDA D11 settings")
    return config


def write_atomic(path, content):
    path = Path(path)
    path.parent.mkdir(parents=True, exist_ok=True)
    if path.exists() and path.read_bytes() == content:
        return
    with tempfile.NamedTemporaryFile(
        dir=path.parent, prefix=path.name + ".", suffix=".tmp", delete=False
    ) as stream:
        temporary = Path(stream.name)
        try:
            stream.write(content)
        except BaseException:
            stream.close()
            temporary.unlink(missing_ok=True)
            raise
    try:
        temporary.replace(path)
    finally:
        temporary.unlink(missing_ok=True)


def download(session, url, path):
    """Reuse complete files and fetch new ones in bounded HTTP byte ranges."""
    path = Path(path)
    if path.exists():
        return path
    chunks = []
    offset = 0
    total = None
    etag = None
    chunk_size = settings()["downloadChunkBytes"]
    while True:
        end = offset + chunk_size - 1
        headers = {"Range": f"bytes={offset}-{end}", "Accept-Encoding": "identity"}
        if etag:
            headers["If-Range"] = etag
        with session.get(url, headers=headers, timeout=(15, 120)) as response:
            response.raise_for_status()
            content = response.content
            if response.status_code == 200:
                # Directory indexes and servers without range support return a full reply.
                chunks = [content]
                break
            match = re.fullmatch(r"bytes (\d+)-(\d+)/(\d+)", response.headers.get("Content-Range", ""))
            if response.status_code != 206 or match is None:
                raise MedaError(f"{url}: invalid byte-range response")
            first, last, size = map(int, match.groups())
            if first != offset or last > end or last >= size or len(content) != last - first + 1 or not content:
                raise MedaError(f"{url}: incomplete or out-of-order byte range")
            if total is not None and (size != total or response.headers.get("ETag") != etag):
                raise MedaError(f"{url}: source changed during download; run again")
            total = size
            etag = response.headers.get("ETag")
            chunks.append(content)
            offset = last + 1
            if offset == total:
                break
    write_atomic(path, b"".join(chunks))
    return path


def list_folder(session, base_url, raw_dir, folder):
    path = download(session, urljoin(base_url, folder), Path(raw_dir) / folder / "index.html")
    parser = Listing()
    parser.feed(path.read_text(encoding="utf-8"))
    # Archive links must name a direct child, so cached HTML cannot change host.
    return [
        name for name in parser.links
        if re.fullmatch(r"[A-Za-z0-9_.-]+/?", name) and name not in (".", "..", "../")
    ]


def discover_products(sol, session, base_url, raw_dir):
    products = {}
    collections = (
        ("data_calibrated_env/", ("CAL_TIRS", "CAL_ATS")),
        ("data_derived_env/", ("DER_PS", "DER_RHS")),
    )
    for collection, kinds in collections:
        ranges = list_folder(session, base_url, raw_dir, collection)
        matching = [
            name for name in ranges
            if (match := re.fullmatch(r"sol_(\d+)_(\d+)/", name))
            and int(match[1]) <= sol <= int(match[2])
        ]
        if len(matching) != 1:
            return None
        range_folder = collection + matching[0]
        sols = list_folder(session, base_url, raw_dir, range_folder)
        sol_folder = f"sol_{sol:04d}/"
        if sol_folder not in sols:
            return None
        folder = range_folder + sol_folder
        files = list_folder(session, base_url, raw_dir, folder)
        for kind in kinds:
            candidates = []
            for name in files:
                match = re.fullmatch(rf"WE__{sol:04d}_+{kind}_+P(\d+)\.CSV", name)
                if match and name[:-4] + ".xml" in files:
                    candidates.append((int(match[1]), name))
            if not candidates:
                return None
            products[kind] = folder + max(candidates)[1]
    return products


def parse_label(path, kind):
    try:
        root = ET.parse(path).getroot()
    except (OSError, ET.ParseError) as error:
        raise MedaError(f"Cannot read MEDA label {path}: {error}") from error
    table = root.find(".//{*}Table_Delimited")
    if table is None:
        raise MedaError(f"{path}: no delimited table")
    fields = {}
    for node in table.findall(".//{*}Field_Delimited"):
        name = node.findtext("{*}name")
        if name not in EXPECTED_UNITS[kind]:
            continue
        unit = node.findtext("{*}unit")
        if unit != EXPECTED_UNITS[kind][name]:
            raise MedaError(f"{path}: {name} unit {unit!r}, expected {EXPECTED_UNITS[kind][name]!r}")
        missing = []
        for constant in node.findall("{*}Special_Constants/*"):
            if constant.tag.split("}")[-1] not in ("valid_minimum", "valid_maximum"):
                try:
                    missing.append(float(constant.text))
                except (TypeError, ValueError):
                    raise MedaError(f"{path}: invalid special constant for {name}") from None
        if name in fields:
            raise MedaError(f"{path}: duplicate field {name}")
        fields[name] = Field(unit, tuple(missing))
    if fields.keys() != EXPECTED_UNITS[kind].keys():
        raise MedaError(f"{path}: missing required columns")
    try:
        records = int(table.findtext("{*}records"))
    except (TypeError, ValueError):
        raise MedaError(f"{path}: invalid record count") from None
    if records <= 0:
        raise MedaError(f"{path}: empty product")
    return Label(kind, fields, records)


def parse_lmst(text, sol):
    match = re.fullmatch(r"(\d+)M(\d{2}):(\d{2}):(\d{2}(?:\.\d+)?)", text)
    if match is None:
        raise MedaError(f"Invalid LMST: {text!r}")
    row_sol, hour, minute = map(int, match.groups()[:3])
    second = float(match[4])
    if row_sol != sol or hour >= 24 or minute >= 60 or second >= 60:
        raise MedaError(f"LMST outside sol {sol}: {text!r}")
    return hour + minute / 60 + second / 3600


def numeric(text, field, column):
    if text is None or not text.strip():
        return None
    try:
        value = float(text)
    except ValueError:
        raise MedaError(f"Invalid numeric {column}: {text!r}") from None
    if not math.isfinite(value) or value in field.missing:
        return None
    return value


def rows(path, label, sol, *, allow_simulated=False):
    with Path(path).open(encoding="utf-8-sig", newline="") as stream:
        first = stream.readline()
        simulated = first.strip() == "# simulated=true"
        if simulated and not allow_simulated:
            raise MedaError(f"{path}: simulated rows cannot become a measured Mars reference")
        if not simulated:
            stream.seek(0)
        reader = csv.DictReader(stream)
        if not reader.fieldnames or not {"LMST", *label.fields}.issubset(reader.fieldnames):
            raise MedaError(f"{path}: missing CSV columns")
        count = 0
        for raw in reader:
            if None in raw or any(value is None for value in raw.values()):
                raise MedaError(f"{path}: incomplete CSV record {count + 1}")
            hour = parse_lmst(raw["LMST"], sol)
            clock = raw["LMST"].split("M")[1]
            minute = int(clock[:2]) * 60 + int(clock[3:5])
            values = {name: numeric(raw[name], field, name) for name, field in label.fields.items()}
            count += 1
            yield {"lmstHour": hour, "lmstMinute": minute, **values}
        if not simulated and count != label.records:
            raise MedaError(f"{path}: {count} records, label declares {label.records}")


def read_first_row(path, label, sol):
    iterator = rows(path, label, sol)
    try:
        return next(iterator)
    except StopIteration:
        raise MedaError(f"{path}: no measurement rows") from None
    finally:
        iterator.close()


def channel_contract(channel_id):
    return next(channel for channel in load_registries()["channels"] if channel["id"] == channel_id)


def reduce_product(path, label, channel_id, sol, *, allow_simulated=False):
    config = settings()
    channel = channel_contract(channel_id)
    column = channel["medaColumn"]
    if channel["medaFile"] != label.kind or column not in label.fields:
        raise MedaError(f"Registry mapping disagrees with label for {channel_id}")
    minutes = config["binMinutes"]
    totals = [0.0] * (24 * 60 // minutes)
    counts = [0] * len(totals)
    source_unit = label.fields[column].unit
    for row in rows(path, label, sol, allow_simulated=allow_simulated):
        value = row[column]
        if channel_id == "ground_temp" and row[config["groundShadowColumn"]] != 1:
            continue
        if value is None:
            continue
        if source_unit == "kelvin":
            value -= 273.15
        elif source_unit == "pascal":
            value /= 100
        # Integer clock minutes keep exact bin edges out of floating-point math.
        index = row["lmstMinute"] // minutes
        totals[index] += value
        counts[index] += 1
    bins = []
    for index, count in enumerate(counts):
        entry = {
            "lmstHour": (index + 0.5) * minutes / 60,
            "value": totals[index] / count if count else None,
            "count": count,
        }
        if count == 0:
            entry["reason"] = f"No valid MEDA measurements in this {minutes}-minute bin."
        bins.append(entry)
    result = {
        "missing": False,
        "unit": channel["unit"] if source_unit is not None else None,
        "sourceUnit": source_unit,
        "sourceColumn": column,
        "bins": bins,
    }
    if source_unit is None:
        result["reasons"] = {"unit": NO_UNIT_REASON, "sourceUnit": NO_UNIT_REASON}
        result["note"] = "unit not stated in the MEDA label"
    return result


def missing_channel(channel):
    return {
        "missing": True,
        "value": None,
        "unit": channel["unit"],
        "sourceFile": None,
        "sourceColumn": None,
        "reason": channel["reasons"]["medaFile"],
    }


def build_meda(
    sol=None, *, raw_dir=None, output_dir=None, docs_path=None, session=None, last_sol=None
):
    config = settings()
    sol = config["referenceSol"] if sol is None else sol
    if type(sol) is not int or sol < 0:
        raise MedaError("The reference sol must be a nonnegative integer")
    raw_dir = Path(raw_dir) if raw_dir is not None else ROOT / "data/raw/meda"
    output_dir = Path(output_dir) if output_dir is not None else ROOT / "app/public/data/mars"
    docs_path = Path(docs_path) if docs_path is not None else ROOT / "docs/meda-files.md"
    registries = load_registries()
    base_url = next(source["url"] for source in registries["sources"] if source["id"] == "meda")
    last_sol = max(sol, config["lastFallbackSol"]) if last_sol is None else last_sol
    owns_session = session is None
    session = requests.Session() if session is None else session
    rejected = []
    try:
        for candidate in range(sol, last_sol + 1):
            print(f"Inspecting MEDA sol {candidate}", flush=True)
            products = discover_products(candidate, session, base_url, raw_dir)
            if products is None:
                rejected.append({
                    "sol": candidate,
                    "reason": "One or more required CSV/XML pairs are absent.",
                })
                continue
            channels = {}
            files = []
            for channel in registries["channels"]:
                if not channel["onCard"]:
                    continue
                kind = channel["medaFile"]
                if kind is None:
                    channels[channel["id"]] = missing_channel(channel)
                    continue
                csv_name = products[kind]
                label_name = csv_name[:-4] + ".xml"
                label_path = download(session, urljoin(base_url, label_name), raw_dir / label_name)
                label = parse_label(label_path, kind)
                csv_path = download(session, urljoin(base_url, csv_name), raw_dir / csv_name)
                series = reduce_product(csv_path, label, channel["id"], candidate)
                channels[channel["id"]] = {
                    **series, "sourceFile": csv_name, "sourceLabel": label_name,
                }
                files.append({
                    "kind": kind,
                    "file": csv_name,
                    "label": label_name,
                    "url": urljoin(base_url, csv_name),
                    "labelUrl": urljoin(base_url, label_name),
                    "sha256": hashlib.sha256(csv_path.read_bytes()).hexdigest(),
                    "labelSha256": hashlib.sha256(label_path.read_bytes()).hexdigest(),
                })
            coverage = {
                key: sum(bin["count"] > 0 for bin in series["bins"])
                for key, series in channels.items() if not series["missing"]
            }
            print(f"Sol {candidate} coverage: {coverage}", flush=True)
            if any(count < config["minimumBins"] for count in coverage.values()):
                rejected.append({
                    "sol": candidate,
                    "reason": "Fewer than the required measured bins.",
                    "coverage": coverage,
                })
                continue
            break
        else:
            raise MedaError(f"No MEDA sol passed from {sol} through {last_sol}: {json.dumps(rejected)}")
    finally:
        if owns_session:
            session.close()
    data = {
        "sol": candidate, "sourceId": "meda", "timeScale": "LMST",
        "settings": config, "channels": channels,
    }
    card = {"sol": candidate, "sourceId": "meda", "settings": config, "channels": {}}
    for channel in registries["channels"]:
        if not channel["onCard"]:
            continue
        series = channels[channel["id"]]
        if series["missing"]:
            card["channels"][channel["id"]] = series.copy()
            continue
        values = [bin["value"] for bin in series["bins"] if bin["value"] is not None]
        if channel["cardNumber"] == "range":
            value = max(values) - min(values)
        else:
            value = math.fsum(values) / len(values)
        card["channels"][channel["id"]] = {
            key: item for key, item in series.items() if key != "bins"
        }
        card["channels"][channel["id"]].update(
            value=value, validBins=len(values), reduction=channel["cardNumber"]
        )
    filename = f"meda-sol-{candidate}.json"
    manifest = {
        "sol": candidate, "sourceId": "meda", "seriesFile": filename,
        "cardFile": "jezero-card.json", "settings": config, "coverage": coverage,
        "files": files, "rejectedSols": rejected,
    }
    text = [
        "# MEDA reference files",
        "",
        f"The Jezero reference uses sol {candidate}. Run `python pipeline/fetch_meda.py` "
        "from the repository root to regenerate the outputs.",
        "",
        "The pipeline reads native units from the XML labels. It averages measurements "
        "in ten-minute LMST bins and keeps empty bins missing. The D11 reduction settings "
        "are in `shared/meda_settings.json`.",
        "",
        "| Product | CSV | XML label |",
        "| --- | --- | --- |",
    ]
    text.extend(
        f"| {entry['kind']} | [{Path(entry['file']).name}]({entry['url']}) "
        f"| [{Path(entry['label']).name}]({entry['labelUrl']}) |"
        for entry in files
    )
    text.extend([
        "",
        "Humidity has no unit in its MEDA label. UV and reflectivity stay missing "
        "pending the team's decision about how to compare them.",
        "",
    ])
    # Parse every product and serialize every output before publishing the manifest.
    outputs = [
        (output_dir / filename, data),
        (output_dir / "jezero-card.json", card),
        (output_dir / "manifest.json", manifest),
    ]
    encoded = [
        (path, (json.dumps(product, indent=2, allow_nan=False) + "\n").encode())
        for path, product in outputs
    ]
    write_atomic(docs_path, "\n".join(text).encode())
    for path, content in encoded:
        write_atomic(path, content)
    return manifest


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument(
        "--sol", type=int, default=settings()["referenceSol"],
        help="First sol to try, followed by later sols through 310. Sols above 310 are tried alone.",
    )
    args = parser.parse_args()
    try:
        result = build_meda(args.sol)
    except (ValueError, OSError, requests.RequestException) as error:
        parser.exit(1, f"{error}\n")
    print(f"Wrote MEDA sol {result['sol']}: four measured channels, UV and reflectivity missing.")


if __name__ == "__main__":
    main()
