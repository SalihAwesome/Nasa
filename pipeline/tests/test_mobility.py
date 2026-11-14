"""U31 checks use the saved GWETTOP reply and published packed layers."""
import hashlib
import json
from pathlib import Path
from types import SimpleNamespace

import numpy as np

from fetch_power import Tile, fetch_all, parameters, validate_tile
from pack_mobility import pack_mobility

ROOT = Path(__file__).resolve().parents[2]
EARTH = ROOT / 'app/public/data/earth'
FIXTURE = Path(__file__).parent / 'fixtures/power/gwettop-regional-20-30-50-60.json'


def test_gwettop_real_grid_and_cache_reuse_without_changing_the_u04_default(tmp_path):
    tile = Tile(20, 50)
    raw = FIXTURE.read_bytes()
    validate_tile(json.loads(raw), 'GWETTOP', tile)
    calls = []

    class Session:
        def get(self, url, **kwargs):
            calls.append(kwargs)
            return SimpleNamespace(status_code=200, content=raw)

    first = fetch_all(tmp_path, session=Session(), selected_parameters=('GWETTOP',), selected_tiles=(tile,))
    second = fetch_all(tmp_path, session=Session(), selected_parameters=('GWETTOP',), selected_tiles=(tile,))
    assert (first.fetched, second.cached, len(calls)) == (1, 1, 1)
    assert 'GWETTOP' not in parameters()
    assert tile.path(tmp_path, 'GWETTOP').read_bytes() == raw


def test_u31_january_known_cell_round_trip_from_published_layer():
    manifest = json.loads((EARTH / 'mobility-manifest.json').read_text())
    earth = json.loads((EARTH / 'manifest.json').read_text())
    cells = np.frombuffer((EARTH / earth['cellsFile']).read_bytes(), dtype='<f4').reshape(-1, 2)
    index = np.flatnonzero((cells[:, 0] == 25.5) & (cells[:, 1] == 51.25)).item()
    quantity = manifest['quantities'][0]
    values = np.frombuffer((EARTH / manifest['monthFiles'][0]).read_bytes(), dtype='<i2')
    assert manifest['cellCount'] == earth['cellCount'] == len(cells)
    assert manifest['cellsSha256'] == hashlib.sha256((EARTH / earth['cellsFile']).read_bytes()).hexdigest()
    assert manifest['quantityOrder'] == ['dryness']
    assert quantity['status'] == 'default'
    assert quantity['powerParameter'] == 'GWETTOP'
    assert quantity['scale'] == 0.0001
    value = values[index] * quantity['scale'] + quantity['offset']
    assert abs(value - 0.26) <= quantity['scale']
    for filename in manifest['monthFiles']:
        assert (EARTH / filename).stat().st_size == len(cells) * 2
    print(f'U31 January dryness at 25.5,51.25: {value:.4f}; scale {quantity["scale"]}; {len(cells)} cells; 12 month files.')


def test_packer_refuses_missing_source_tiles(tmp_path):
    # No source payload is synthesized or substituted when a download is absent.
    import pytest
    with pytest.raises((FileNotFoundError, ValueError)):
        pack_mobility(raw_dir=tmp_path, output=tmp_path / 'output', fetch=False)
