"""U05: geometry, encoding and the real committed artifact check."""

import json
from pathlib import Path

import numpy as np
import pytest

from fetch_power import Tile
from pack import encode_values, land_mask, read_parameter, solar_indices

ROOT = Path(__file__).resolve().parents[2]
EARTH = ROOT / "app/public/data/earth"
FIXTURES = Path(__file__).parent / "fixtures/power"


def test_even_odd_land_rule_preserves_holes_and_unions_polygons():
    # Explicitly simulated geometry; no actual site or measured value.
    outer = [[0, 0], [4, 0], [4, 4], [0, 4], [0, 0]]
    hole = [[1, 1], [3, 1], [3, 3], [1, 3], [1, 1]]
    data = {"simulated": True, "type": "FeatureCollection", "features": [{"geometry": {"type": "Polygon", "coordinates": [outer, hole]}}]}
    lat = np.array([0.5, 2, 3.5])
    lon = np.array([0.5, 2, 3.5])
    expected = np.ones((3, 3), dtype=bool)
    expected[1, 1] = False
    assert np.array_equal(land_mask(data, lat, lon), expected)
    data["features"][0]["geometry"]["coordinates"] = [outer[::-1], hole[::-1]]
    assert np.array_equal(land_mask(data, lat, lon), expected)
    data["features"].append({"geometry": {"type": "MultiPolygon", "coordinates": [[outer]]}})
    assert land_mask(data, lat, lon).all()


def test_pole_flags_copy_the_adjacent_half_degree_row():
    data = {"simulated": True, "type": "FeatureCollection", "features": [{"geometry": {"type": "Polygon", "coordinates": [[[-180, -90], [180, -90], [180, -89], [-180, -89], [-180, -90]]]}}]}
    mask = land_mask(data, np.array([-90, -89.5, 89.5, 90]), np.array([-10, 0, 10]))
    assert np.array_equal(mask[0], mask[1])
    assert np.array_equal(mask[-1], mask[-2])
    assert mask[0].all()
    assert not mask[-1].any()


def test_d12_selects_containing_solar_cells_including_both_poles_and_dateline():
    rows, cols = solar_indices(np.array([25.5, -90, 90]), np.array([51.25, -180, 179.375]))
    assert rows.tolist() == [115, 0, 179]
    assert cols.tolist() == [231, 0, 359]


def test_encoding_is_little_endian_preserves_fill_and_round_trips():
    values = np.array([13.52, -999, np.nan])  # verified U05 value and POWER fill
    packed = encode_values(values, 0.01)
    assert packed.dtype.str == '<i2'
    assert packed.tolist() == [1352, -32768, -32768]
    assert packed.tobytes()[:2] == bytes([0x48, 0x05])
    assert abs(np.frombuffer(packed.tobytes(), dtype='<i2')[0] * 0.01 - values[0]) <= 0.01


@pytest.mark.parametrize("values,scale", [([40000], 1), ([-32768], 1), ([np.inf], 1), ([1], 0), ([1], -1)])
def test_encoding_rejects_overflow_reserved_fill_collision_and_invalid_inputs(values, scale):
    # Simulated arithmetic errors; they must never silently wrap into Int16.
    with pytest.raises(ValueError):
        encode_values(np.array(values, dtype=float), scale)


def test_duplicate_tile_cells_are_removed_without_changing_values(tmp_path):
    tile = Tile(-90, -180)
    path = tile.path(tmp_path, 'TS_RANGE')
    path.parent.mkdir(parents=True)
    path.write_bytes((FIXTURES / 'ts-range-south-pole.json').read_bytes())
    layer = read_parameter('TS_RANGE', tmp_path, selected_tiles=(tile, tile))
    assert int(layer.present.sum()) == 357
    raw = json.loads(path.read_bytes())['features'][0]
    assert layer.values[0, 0, 0] == raw['properties']['parameter']['TS_RANGE']['JAN']


def test_conflicting_duplicate_cells_fail_instead_of_overwriting(tmp_path):
    first, second = Tile(-90, -180), Tile(-90, -170)
    path = first.path(tmp_path, 'TS_RANGE')
    path.parent.mkdir(parents=True)
    payload = json.loads((FIXTURES / 'ts-range-south-pole.json').read_bytes())
    path.write_text(json.dumps(payload))
    payload['simulated'] = True
    payload['features'][0]['properties']['parameter']['TS_RANGE']['JAN'] += 1
    second.path(tmp_path, 'TS_RANGE').write_text(json.dumps(payload))
    with pytest.raises(ValueError, match='duplicate'):
        read_parameter('TS_RANGE', tmp_path, selected_tiles=(first, second))


def test_real_artifacts_meet_u05_check_without_needing_raw_files():
    manifest = json.loads((EARTH / 'manifest.json').read_text())
    cells = np.frombuffer((EARTH / 'cells.bin').read_bytes(), dtype='<f4').reshape(-1, 2)
    assert len(cells) == manifest['cellCount']
    assert len({tuple(cell) for cell in cells}) == len(cells)
    assert manifest['quantityOrder'] == ['ground_temp', 'reflectivity', 'uv', 'air_temp', 'humidity', 'pressure']
    matches = np.flatnonzero((cells[:, 0] == 25.5) & (cells[:, 1] == 51.25))
    assert len(matches) == 1
    index = int(matches[0])
    january = np.frombuffer((EARTH / 'month-01.bin').read_bytes(), dtype='<i2').reshape(6, len(cells))
    expected = {'ground_temp': 13.52, 'air_temp': 17.51, 'pressure': 1016.2, 'uv': 0.81, 'reflectivity': 0.13}
    for position, quantity in enumerate(manifest['quantities']):
        assert quantity['status'] == 'default'
        if quantity['id'] in expected:
            value = january[position, index] * quantity['scale'] + quantity['offset']
            assert abs(value - expected[quantity['id']]) <= quantity['scale']
    assert not np.any((cells[:, 0] == 0) & (cells[:, 1] == -140))
    assert np.any((cells[:, 0] == -89.5) & (cells[:, 1] == 0))
    assert np.any(january[1] == -32768)
    for month in range(1, 13):
        path = EARTH / f'month-{month:02}.bin'
        assert path.stat().st_size == 6 * len(cells) * 2
        assert path.stat().st_size < 2_000_000
    print(f"U05 real artifacts: {len(cells)} land cells, 12 month files under 2 MB; known values and land checks passed")
