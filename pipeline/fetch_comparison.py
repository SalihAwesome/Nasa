"""Fetch separately named Jezero evidence; never substitute it into match scores."""
import hashlib
import json
import re
import xml.etree.ElementTree as ET
from pathlib import Path
from urllib.parse import urljoin

import requests
from pypdf import PdfReader

from fetch_meda import ROOT, download, parse_label, rows, settings, write_atomic

PAPER_URL = "https://api-digital.inta.es/api/core/bitstreams/c64568f7-2f03-4948-a3ec-fbdbd7c5de06/content"
PAPER_CITATION = "https://doi.org/10.1029/2022JE007537"
HUMIDITY_URL = "https://an.rsl.wustl.edu/help/Content/About%20the%20data/Data%20sets/M20/MEDA%20bundle.htm"
INSTRUMENT_URL = "https://pmc.ncbi.nlm.nih.gov/articles/PMC8550605/"
# Filename and directory verified against the PDS index and XML, 2026-11-15.
RDS_PATH = "data_calibrated_env/sol_0300_0419/sol_0300/WE__0300___________CAL_RDS_________________P01"


def published_albedo(path):
    # Read section 4's explicit TES retrieval, not the traverse-average MEDA value.
    text = " ".join(" ".join(page.extract_text().split()) for page in PdfReader(path).pages)
    if "relative humidity (RH) with respect to ice" not in text:
        raise ValueError("Published humidity reference context changed")
    match = re.search(r"Bolometric albedos in the (.*?)5\. Discussion", text)
    if not match or "0.25–2.9" not in match[1] or "Thermal Emission Spectrometer" not in match[1]:
        raise ValueError("Published TES albedo context changed")
    value = re.search(r"TES-retrieved value of (0\.\d+)", match[1])
    if not value or not 0 < float(value[1]) < 1:
        raise ValueError("Published TES albedo retrieval is missing")
    return float(value[1]) * 100


def peak_uv(path, label, sol, *, allow_simulated=False):
    bins = {}
    observations = 0
    bin_minutes = settings()["binMinutes"]
    for row in rows(path, label, sol, allow_simulated=allow_simulated):
        value = row["RDS_TOP_3"]
        if value is not None:
            index = row["lmstMinute"] // bin_minutes
            bins.setdefault(index, []).append(value)
            observations += 1
    if not bins:
        raise ValueError("No recorded RDS TOP 3 flux")
    means = {index: sum(values) / len(values) for index, values in bins.items()}
    peak = max(means, key=means.get)
    return {"value": means[peak], "recordedBins": len(bins), "observations": observations,
            "peakBinStartMinute": peak * bin_minutes}


def build_comparison(raw_dir=None, out_dir=None):
    raw_dir = Path(raw_dir or ROOT / "data/raw/comparison")
    out_dir = Path(out_dir or ROOT / "app/public/data/mars")
    source = next(item for item in json.loads((ROOT / "shared/sources.json").read_text()) if item["id"] == "meda")
    urls = {"paper": PAPER_URL, "humidity": HUMIDITY_URL,
            "rdsLabel": urljoin(source["url"], RDS_PATH + ".xml"),
            "rds": urljoin(source["url"], RDS_PATH + ".CSV")}
    names = {"paper": "albedo.pdf", "humidity": "humidity.html", "rdsLabel": "rds.xml", "rds": "rds.csv"}
    with requests.Session() as session:
        paths = {key: download(session, url, raw_dir / names[key]) for key, url in urls.items()}
    humidity = paths["humidity"].read_text(encoding="utf8")
    if "local relative humidity (%RH)" not in humidity:
        raise ValueError("Official humidity unit documentation changed")
    label = parse_label(paths["rdsLabel"], "CAL_RDS")
    expected_md5 = ET.parse(paths["rdsLabel"]).findtext(".//{*}md5_checksum")
    if hashlib.md5(paths["rds"].read_bytes()).hexdigest() != expected_md5:
        raise ValueError("RDS CSV checksum disagrees with the archive label")
    # The downloaded product is specifically sol 300, independent of future D11 changes.
    uv = peak_uv(paths["rds"], label, 300)
    output = {
        "target": "jezero", "sol": 300,
        "unitClarifications": {"humidity": {"unit": "%", "source": HUMIDITY_URL,
            "basis": "Relative to ice", "referenceSource": PAPER_CITATION,
            "note": "MEDA local relative humidity (%RH), resolved from the official bundle documentation; the product XML omits its unit. Martínez et al. (2023), section 2, identifies ice as the saturation reference. Earth uses a separate 2 m RH product; a common saturation reference has not been established, so no direct difference is calculated."}},
        "supplements": {
            "reflectivity": {"value": published_albedo(paths["paper"]), "unit": "%",
                "label": "TES orbital albedo", "source": PAPER_CITATION,
                "note": "Published regional retrieval, 0.25–2.9 µm, around 14:00 local true solar time; about 300 km². Martínez et al. (2023), section 4 / figure 14. Separate from the missing MEDA sol 300 albedo; excluded from match scores."},
            "uv": {**uv, "unit": "W/m²", "label": "MEDA recorded UV detector flux",
                "source": urls["rdsLabel"],
                "note": "Sol 300, RDS TOP 3, 250–400 nm, ±15° field of view. Highest recorded ten-minute mean; incomplete daily coverage. A detector flux, not a UV index or hemispherical daily exposure; excluded from match scores.",
                "instrumentSource": INSTRUMENT_URL, "binMinutes": settings()["binMinutes"]},
        },
        "sources": {key: {"url": url, "sha256": hashlib.sha256(paths[key].read_bytes()).hexdigest()}
                    for key, url in urls.items()},
    }
    write_atomic(out_dir / "jezero-comparison.json", (json.dumps(output, indent=2, ensure_ascii=False, allow_nan=False) + "\n").encode())
    return output


if __name__ == "__main__":
    result = build_comparison()
    print(json.dumps({key: {"value": row["value"], "unit": row["unit"]}
                      for key, row in result["supplements"].items()}))
