"""U07 checks use real MEDA excerpts or explicitly simulated CSV rows."""

import csv
import hashlib
import io
import json
from pathlib import Path

import pytest
import requests

from fetch_meda import (
    MedaError, build_meda, discover_products, download, parse_label, parse_lmst,
    read_first_row, reduce_product,
)


FIXTURES = Path(__file__).parent / "fixtures/meda-sol-300"
PRODUCTS = {
    "CAL_TIRS": "WE__0300___________CAL_TIRS________________P02",
    "CAL_ATS": "WE__0300___________CAL_ATS_________________P01",
    "DER_PS": "WE__0300___________DER_PS__________________P01",
    "DER_RHS": "WE__0300___________DER_RHS_________________P01",
}


def paths(kind):
    stem = FIXTURES / PRODUCTS[kind]
    return stem.with_suffix(".CSV"), stem.with_suffix(".xml")


def test_parse_lmst_preserves_mars_clock_and_bin_boundaries():
    assert parse_lmst("00300M00:00:00.716", 300) == pytest.approx(0.716 / 3600)
    assert parse_lmst("00300M23:59:59.999", 300) < 24
    assert parse_lmst("00300M00:10:00.000", 300) == pytest.approx(1 / 6)


@pytest.mark.parametrize("text", ["00301M00:00:00.000", "00300M24:00:00.000", "00300M00:60:00.000", "00300M00:00:60.000", "00:00:00", "garbage"])
def test_rejects_wrong_sol_or_invalid_lmst(text):
    with pytest.raises(MedaError, match="LMST"):
        parse_lmst(text, 300)


@pytest.mark.parametrize("kind,expected", [
    ("CAL_TIRS", {"GROUND_TEMP": 202.00, "AIR_TEMP": 208.38, "UPWARD_SW_IRRADIANCE": -0.30}),
    ("CAL_ATS", {"ATS_LOCAL_TEMP1": 203.30}),
    ("DER_PS", {"PRESSURE": 633.03}),
    ("DER_RHS", {"LOCAL_RELATIVE_HUMIDITY": 5.76, "HUMIDITY_LOCAL_TEMP": 208.77}),
])
def test_real_sol_300_first_rows_match_verified_facts(kind, expected):
    csv_path, xml_path = paths(kind)
    row = read_first_row(csv_path, parse_label(xml_path, kind), 300)
    for column, value in expected.items():
        assert row[column] == pytest.approx(value)


def test_runtime_label_units_and_missing_humidity_unit(tmp_path):
    _, label_path = paths("DER_RHS")
    label = parse_label(label_path, "DER_RHS")
    assert label.fields["LOCAL_RELATIVE_HUMIDITY"].unit is None
    original = paths("CAL_ATS")[1].read_text()
    changed = tmp_path / "wrong-unit.xml"
    changed.write_text(original.replace("<unit>kelvin</unit>", "<unit>celsius</unit>"))
    with pytest.raises(MedaError, match="unit"):
        parse_label(changed, "CAL_ATS")


def simulated_csv(tmp_path, kind, entries):
    """Repeat a real CSV row, replacing its timestamp and the requested fields."""
    original, label_path = paths(kind)
    reader = csv.DictReader(io.StringIO(original.read_text()))
    first = next(reader)
    stream = io.StringIO(newline="")
    writer = csv.DictWriter(stream, fieldnames=reader.fieldnames)
    writer.writeheader()
    for index, changes in enumerate(entries):
        writer.writerow({**first, "LMST": f"00300M{index // 6:02d}:{index % 6 * 10:02d}:00.000", **changes})
    target = tmp_path / f"{kind}.CSV"
    target.write_text("# simulated=true\n" + stream.getvalue(), newline="")
    return target, parse_label(label_path, kind)


def test_bin_means_counts_shadow_filter_and_missing_values(tmp_path):
    path, label = simulated_csv(tmp_path, "CAL_TIRS", [
        {"GROUND_TEMP": "273.15", "TIRS_GROUND_FOOTPRINT_NOT_IN_SHADOW": "1", "LMST": "00300M00:00:00.000"},
        {"GROUND_TEMP": "275.15", "TIRS_GROUND_FOOTPRINT_NOT_IN_SHADOW": "1", "LMST": "00300M00:09:59.999"},
        {"GROUND_TEMP": "999", "TIRS_GROUND_FOOTPRINT_NOT_IN_SHADOW": "0", "LMST": "00300M00:05:00.000"},
        {"GROUND_TEMP": "", "TIRS_GROUND_FOOTPRINT_NOT_IN_SHADOW": "1", "LMST": "00300M00:10:00.000"},
        {"GROUND_TEMP": "283.15", "TIRS_GROUND_FOOTPRINT_NOT_IN_SHADOW": "1", "LMST": "00300M00:20:00.000"},
    ])
    series = reduce_product(path, label, "ground_temp", 300, allow_simulated=True)
    assert len(series["bins"]) == 144
    assert series["bins"][0]["value"] == pytest.approx(1)
    assert series["bins"][0]["count"] == 2
    assert series["bins"][1]["value"] is None
    assert series["bins"][1]["count"] == 0
    assert series["bins"][1]["reason"]
    assert series["bins"][2]["value"] == pytest.approx(10)
    assert series["unit"] == "C"


def test_pressure_conversion_and_nonfinite_measurements_stay_missing(tmp_path):
    path, label = simulated_csv(tmp_path, "DER_PS", [
        {"PRESSURE": "633.03"}, {"PRESSURE": "NaN"}, {"PRESSURE": "Infinity"}, {"PRESSURE": ""},
    ])
    series = reduce_product(path, label, "pressure", 300, allow_simulated=True)
    assert series["bins"][0]["value"] == pytest.approx(6.3303)
    assert all(row["value"] is None for row in series["bins"][1:])
    assert series["unit"] == "hPa"


def test_every_exact_ten_minute_boundary_goes_into_its_own_bin(tmp_path):
    path, label = simulated_csv(tmp_path, "CAL_TIRS", [
        {"GROUND_TEMP": "273.15", "TIRS_GROUND_FOOTPRINT_NOT_IN_SHADOW": "1"}
        for _ in range(144)
    ])
    series = reduce_product(path, label, "ground_temp", 300, allow_simulated=True)
    assert [entry["count"] for entry in series["bins"]] == [1] * 144


def test_download_reuses_cached_file_without_network_and_preserves_it_on_failure(tmp_path):
    class Offline:
        def get(self, *args, **kwargs):
            raise requests.ConnectionError("simulated offline session")

    cached = tmp_path / "cached.CSV"
    cached.write_bytes(b"saved raw bytes")
    assert download(Offline(), "https://example.invalid/cached.CSV", cached) == cached
    assert cached.read_bytes() == b"saved raw bytes"
    absent = tmp_path / "absent.CSV"
    with pytest.raises(requests.ConnectionError):
        download(Offline(), "https://example.invalid/absent.CSV", absent)
    assert not absent.exists()
    assert not list(tmp_path.glob("*.tmp"))


def test_simulated_rows_cannot_be_published_as_mars_measurements(tmp_path):
    path, label = simulated_csv(tmp_path, "CAL_TIRS", [{"GROUND_TEMP": "273.15"}])
    with pytest.raises(MedaError, match="simulated"):
        reduce_product(path, label, "ground_temp", 300)


def simulated_archive():
    """The injected HTTP responses are simulated HTML and saved real excerpts."""
    base = "https://example.invalid/"
    replies = {}
    for group, kinds in [("data_calibrated_env", ["CAL_TIRS", "CAL_ATS"]), ("data_derived_env", ["DER_PS", "DER_RHS"])]:
        def listing(names):
            return ("<!-- simulated=true -->" + "".join(f'<a href="{name}">{name}</a>' for name in names)).encode()
        replies[base + group + "/"] = listing(["sol_0300_0419/"])
        replies[base + group + "/sol_0300_0419/"] = listing(["sol_0300/", "sol_0301/"])
        for sol in (300, 301):
            folder = f"{group}/sol_0300_0419/sol_{sol:04d}/"
            names = []
            for kind in kinds:
                stem = PRODUCTS[kind].replace("0300", f"{sol:04d}")
                for extension, source in zip((".CSV", ".xml"), paths(kind)):
                    name = stem + extension
                    names.append(name)
                    replies[base + folder + name] = source.read_bytes()
            replies[base + folder] = listing(names)

    class Response:
        status_code = 200
        headers = {}

        def __init__(self, content):
            self.content = content

        def __enter__(self):
            return self

        def __exit__(self, *args):
            pass

        def raise_for_status(self):
            pass

    class Session:
        calls = []

        def get(self, url, **kwargs):
            self.calls.append(url)
            return Response(replies[url])

    return base, replies, Session()


def test_download_checks_ranges_and_publishes_only_a_complete_unchanged_file(tmp_path):
    class Response:
        status_code = 206

        def __init__(self, content, span, etag='"source-v1"'):
            self.content = content
            self.headers = {"Content-Range": span, "ETag": etag}

        def __enter__(self):
            return self

        def __exit__(self, *args):
            pass

        def raise_for_status(self):
            pass

    class Session:
        def __init__(self, replies):
            self.replies = iter(replies)
            self.calls = []

        def get(self, url, **kwargs):
            self.calls.append(kwargs["headers"])
            return next(self.replies)

    session = Session([Response(b"abc", "bytes 0-2/6"), Response(b"def", "bytes 3-5/6")])
    result = download(session, "https://example.invalid/source.CSV", tmp_path / "good.CSV")
    assert result.read_bytes() == b"abcdef"
    assert session.calls[1]["Range"].startswith("bytes=3-")
    assert session.calls[1]["If-Range"] == '"source-v1"'

    bad_replies = [
        [Response(b"abc", "bytes 0-2/6"), Response(b"def", "bytes 3-5/6", '"changed"')],
        [Response(b"abc", "bytes 1-3/6")],
        [Response(b"ab", "bytes 0-2/6")],
    ]
    for index, replies in enumerate(bad_replies):
        absent = tmp_path / f"invalid-{index}.CSV"
        with pytest.raises(MedaError):
            download(Session(replies), "https://example.invalid/source.CSV", absent)
        assert not absent.exists()


def test_discovery_skips_incomplete_sol_before_downloading_products(tmp_path):
    base, replies, session = simulated_archive()
    listing_url = base + "data_derived_env/sol_0300_0419/sol_0300/"
    replies[listing_url] = b'<!-- simulated=true --><a href="unrelated.xml">unrelated</a>'
    assert discover_products(300, session, base, tmp_path / "raw") is None
    assert not any(url.endswith((".CSV", ".xml")) for url in session.calls)


def test_fallback_applies_per_channel_and_card_averages_bins_equally(tmp_path, monkeypatch):
    import fetch_meda

    base, replies, session = simulated_archive()
    registries = fetch_meda.load_registries()
    next(source for source in registries["sources"] if source["id"] == "meda")["url"] = base
    monkeypatch.setattr(fetch_meda, "load_registries", lambda: registries)

    def reduction(path, label, channel, sol):
        # Sol 300 has enough pressure bins, but too few ground bins.
        coverage = 71 if sol == 300 and channel == "ground_temp" else 72
        bins = [{"value": float(index), "count": index + 1} for index in range(coverage)]
        contract = next(entry for entry in registries["channels"] if entry["id"] == channel)
        return {
            "missing": False,
            "unit": contract["unit"],
            "sourceColumn": contract["medaColumn"],
            "bins": bins,
        }

    monkeypatch.setattr(fetch_meda, "reduce_product", reduction)
    raw = tmp_path / "raw"
    output = tmp_path / "output"
    docs = tmp_path / "meda-files.md"
    manifest = build_meda(raw_dir=raw, output_dir=output, docs_path=docs, session=session, last_sol=301)
    assert manifest["sol"] == 301
    assert manifest["rejectedSols"][0]["sol"] == 300
    assert manifest["coverage"] == dict.fromkeys(["ground_temp", "air_temp", "humidity", "pressure"], 72)
    card = json.loads((output / "jezero-card.json").read_text())
    assert card["channels"]["ground_temp"]["value"] == 71
    assert card["channels"]["pressure"]["value"] == 35.5
    for channel in ("uv", "reflectivity"):
        assert card["channels"][channel]["missing"] is True
        assert card["channels"][channel]["reason"]
    assert len(manifest["files"]) == 4
    assert all(entry["file"].endswith(".CSV") and entry["label"].endswith(".xml") for entry in manifest["files"])
    before = {path.name: path.read_bytes() for path in output.iterdir()}
    calls = len(session.calls)
    build_meda(raw_dir=raw, output_dir=output, docs_path=docs, session=session, last_sol=301)
    assert len(session.calls) == calls
    assert {path.name: path.read_bytes() for path in output.iterdir()} == before
    with pytest.raises(MedaError, match="No MEDA sol passed"):
        build_meda(raw_dir=raw, output_dir=output, docs_path=docs, session=session, last_sol=300)
    assert {path.name: path.read_bytes() for path in output.iterdir()} == before


def test_published_reference_has_four_series_two_missing_channels_and_mars_pressure():
    root = Path(__file__).resolve().parents[2] / "app/public/data/mars"
    manifest = json.loads((root / "manifest.json").read_text())
    data = json.loads((root / manifest["seriesFile"]).read_text())
    card = json.loads((root / manifest["cardFile"]).read_text())
    assert manifest["sol"] == data["sol"] == card["sol"]
    assert data["timeScale"] == "LMST"
    assert data["settings"]["status"] == "default"
    assert len(manifest["files"]) == 4
    if manifest["sol"] == 300:
        for source in manifest["files"]:
            label = FIXTURES / Path(source["label"]).name
            assert hashlib.sha256(label.read_bytes()).hexdigest() == source["labelSha256"]
    for channel in ("ground_temp", "air_temp", "humidity", "pressure"):
        series = data["channels"][channel]
        assert series["missing"] is False
        assert len(series["bins"]) == 144
        coverage = sum(entry["value"] is not None for entry in series["bins"])
        assert coverage >= 72
        assert manifest["coverage"][channel] == coverage
        assert card["channels"][channel]["validBins"] == coverage
        assert series["sourceFile"] and series["sourceColumn"] and series["sourceLabel"]
        assert all(entry["count"] == 0 and entry["reason"] for entry in series["bins"] if entry["value"] is None)
    for channel in ("reflectivity", "uv"):
        assert data["channels"][channel]["missing"] is True
        assert data["channels"][channel]["reason"]
        assert card["channels"][channel]["value"] is None
    humidity = card["channels"]["humidity"]
    assert humidity["unit"] is None
    assert humidity["reasons"]["unit"] == "The MEDA label gives no unit."
    assert card["channels"]["pressure"]["unit"] == "hPa"
    assert 0 < card["channels"]["pressure"]["value"] < 20


@pytest.mark.raw_data(*[f"meda/{'data_calibrated_env' if kind.startswith('CAL') else 'data_derived_env'}/sol_0300_0419/sol_0300/{stem}.CSV" for kind, stem in PRODUCTS.items()])
def test_downloaded_sol_300_full_files_match_the_same_first_values():
    root = Path(__file__).resolve().parents[2] / "data/raw/meda"
    for kind in PRODUCTS:
        folder = root / ("data_calibrated_env" if kind.startswith("CAL") else "data_derived_env") / "sol_0300_0419/sol_0300"
        row = read_first_row(folder / f"{PRODUCTS[kind]}.CSV", parse_label(folder / f"{PRODUCTS[kind]}.xml", kind), 300)
        expected = {"CAL_TIRS": ("GROUND_TEMP", 202), "CAL_ATS": ("ATS_LOCAL_TEMP1", 203.3), "DER_PS": ("PRESSURE", 633.03), "DER_RHS": ("LOCAL_RELATIVE_HUMIDITY", 5.76)}
        column, value = expected[kind]
        assert row[column] == pytest.approx(value)
