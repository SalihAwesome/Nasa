"""U10: publish the registered Natural Earth land outline without alteration."""
import json
from pathlib import Path

import requests

from registries import load_registries

ROOT = Path(__file__).resolve().parents[1]


def fetch_land(output_dir=ROOT / "app/public/data/geo", *, get=requests.get):
    source = next(s for s in load_registries()["sources"] if s["id"] == "naturalearth_110m")
    response = get(source["url"], timeout=60)
    response.raise_for_status()
    raw = response.content
    data = json.loads(raw)
    if data.get("type") != "FeatureCollection" or not data.get("features"):
        raise ValueError("Natural Earth: expected a nonempty FeatureCollection")
    if any(f.get("geometry", {}).get("type") not in ("Polygon", "MultiPolygon") for f in data["features"]):
        raise ValueError("Natural Earth: expected land polygons")
    output = Path(output_dir) / Path(source["files"][0]).name
    output.parent.mkdir(parents=True, exist_ok=True)
    temporary = output.with_suffix(".tmp")
    temporary.write_bytes(raw)
    temporary.replace(output)
    return output


if __name__ == "__main__":
    path = fetch_land()
    print(f"Natural Earth land outline: {path.name}, {path.stat().st_size} bytes")
