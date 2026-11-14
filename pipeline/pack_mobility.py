"""U31: pack verified soil wetness in U05's existing land-cell order."""
import argparse
import hashlib
import json
from pathlib import Path

import numpy as np

from fetch_power import ROOT, fetch_all, tiles, validate_tile
from pack import FILL, LATITUDES, LONGITUDES, _write, encode_values, read_parameter


def dryness_settings():
    targets = json.loads((ROOT / 'shared/targets.json').read_text(encoding='utf-8'))
    settings = [target['mobility']['dryness'] for target in targets]
    first = settings[0]
    for row in settings:
        if row != first or row['value'] != 0 or row['source'] != 'docs/project-brief.md' or row['unit'] != '1':
            raise ValueError('Both targets must use the brief\'s fully dry value and the same D20 packing')
        for field in ('tolerance', 'scale'):
            if row[field]['status'] != 'default' or not np.isfinite(row[field]['value']) or row[field]['value'] <= 0:
                raise ValueError('Invalid D20 default setting')
    return first


def pack_mobility(raw_dir=ROOT / 'data/raw/power', output=ROOT / 'app/public/data/earth', *, fetch=True):
    if fetch:
        result = fetch_all(Path(raw_dir), selected_parameters=('GWETTOP',))
        if result.failed:
            raise ValueError('GWETTOP has unresolved fetch failures; no mobility layers packed')
    else:
        for tile in tiles():
            validate_tile(json.loads(tile.path(Path(raw_dir), 'GWETTOP').read_bytes()), 'GWETTOP', tile)
    earth_root = ROOT / 'app/public/data/earth'
    earth = json.loads((earth_root / 'manifest.json').read_text(encoding='utf-8'))
    cells_bytes = (earth_root / earth['cellsFile']).read_bytes()
    cells = np.frombuffer(cells_bytes, dtype='<f4').reshape(-1, 2)
    if len(cells) != earth['cellCount']:
        raise ValueError('U05 cell count does not match cells.bin')
    rows_raw, cols_raw = (cells[:, 0] - LATITUDES[0]) / (LATITUDES[1] - LATITUDES[0]), (cells[:, 1] - LONGITUDES[0]) / (LONGITUDES[1] - LONGITUDES[0])
    rows, cols = np.rint(rows_raw).astype(int), np.rint(cols_raw).astype(int)
    if not np.array_equal(rows, rows_raw) or not np.array_equal(cols, cols_raw):
        raise ValueError('U05 cells are not on the verified GWETTOP grid')
    source = read_parameter('GWETTOP', raw_dir)
    if not source.present.all():
        raise ValueError('Incomplete GWETTOP global coverage')
    if source.period != (earth['period']['start'], earth['period']['end']):
        raise ValueError('GWETTOP and U05 climatology periods disagree')
    values = source.values[:, rows, cols]
    valid = values[~np.isnan(values)]
    if np.any((valid < 0) | (valid > 1)):
        raise ValueError('GWETTOP is outside its verified dry-to-saturated range')
    setting = dryness_settings()
    packed = encode_values(values, setting['scale']['value'])
    manifest = {
        'cellCount': len(cells), 'cellsFile': earth['cellsFile'],
        'cellsSha256': hashlib.sha256(cells_bytes).hexdigest(),
        'dtype': 'int16', 'byteOrder': 'little', 'layout': 'quantity-major',
        'quantityOrder': ['dryness'],
        'quantities': [{
            'id': 'dryness', 'unit': setting['unit'], 'scale': setting['scale']['value'],
            'offset': 0, 'fillValue': FILL, 'status': 'default', 'powerParameter': 'GWETTOP',
            'sourceGrid': {'latitudeStep': float(LATITUDES[1] - LATITUDES[0]), 'longitudeStep': float(LONGITUDES[1] - LONGITUDES[0])},
            'missingReason': 'POWER returned fill value -999; no soil wetness value is available.',
        }],
        'monthFiles': [f'mobility-{month:02}.bin' for month in range(1, 13)],
        'period': earth['period'], 'sourceId': earth['sourceId'],
    }
    output = Path(output)
    for index, filename in enumerate(manifest['monthFiles']):
        _write(output / filename, packed[index].tobytes())
    _write(output / 'mobility-manifest.json', (json.dumps(manifest, indent=2) + '\n').encode())
    print(f"Packed GWETTOP dryness: {len(cells)} existing U05 land cells; 12 month files, {packed[0].nbytes} bytes each.")
    return manifest


if __name__ == '__main__':
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--raw-dir', type=Path, default=ROOT / 'data/raw/power')
    parser.add_argument('--output', type=Path, default=ROOT / 'app/public/data/earth')
    parser.add_argument('--no-fetch', action='store_true', help='Use a complete verified GWETTOP cache without making requests')
    args = parser.parse_args()
    pack_mobility(args.raw_dir, args.output, fetch=not args.no_fetch)
