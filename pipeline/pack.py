"""U05: reduce the cached POWER grids to monthly land-only binary layers."""

import argparse
from dataclasses import dataclass
import json
from pathlib import Path

import numpy as np
import requests

from fetch_power import MONTHS, ROOT, SOLAR, Tile, fetch_all, tiles
from registries import load_registries

LATITUDES = np.arange(-90, 90.5, 0.5)
LONGITUDES = np.arange(-180, 180, 0.625)
# DEFAULT D17, emitted with status: default in each manifest quantity.
SCALES = {'ground_temp': 0.01, 'reflectivity': 0.0001, 'uv': 0.01, 'air_temp': 0.01, 'humidity': 0.01, 'pressure': 0.1}
FILL = -32768


def land_mask(geojson, latitudes=LATITUDES, longitudes=LONGITUDES):
    """DEFAULT D13: even-odd rings within each polygon, union of polygons.

    At each grid latitude, NumPy computes and sorts the ring's ray crossings.
    Counting crossings strictly right of a point avoids a points-by-edges array.
    """
    latitudes, longitudes = np.asarray(latitudes), np.asarray(longitudes)
    land = np.zeros((len(latitudes), len(longitudes)), dtype=bool)
    for feature in geojson['features']:
        geometry = feature['geometry']
        if geometry['type'] == 'Polygon':
            polygons = [geometry['coordinates']]
        elif geometry['type'] == 'MultiPolygon':
            polygons = geometry['coordinates']
        else:
            raise ValueError('Expected Polygon or MultiPolygon land geometry')
        for rings in polygons:
            polygon = np.zeros_like(land)
            for ring in rings:
                points = np.asarray(ring, dtype=float)
                if points.ndim != 2 or points.shape[1] < 2 or len(points) < 4 or not np.isfinite(points).all() or not np.array_equal(points[0], points[-1]):
                    raise ValueError('Invalid closed land ring')
                x1, y1 = points[:-1, 0], points[:-1, 1]
                x2, y2 = points[1:, 0], points[1:, 1]
                rows = np.flatnonzero((latitudes >= points[:, 1].min()) & (latitudes <= points[:, 1].max()))
                columns = np.flatnonzero((longitudes >= points[:, 0].min()) & (longitudes <= points[:, 0].max()))
                for row in rows:
                    y = latitudes[row]
                    crosses = (y1 > y) != (y2 > y)
                    intersections = np.sort(x1[crosses] + (y - y1[crosses]) * (x2[crosses] - x1[crosses]) / (y2[crosses] - y1[crosses]))
                    right = len(intersections) - np.searchsorted(intersections, longitudes[columns], side='right')
                    polygon[row, columns] ^= right % 2 == 1
            land |= polygon
    for pole, adjacent in [(-90, -89.5), (90, 89.5)]:
        pole_rows = np.flatnonzero(latitudes == pole)
        if len(pole_rows):
            neighbor = np.flatnonzero(latitudes == adjacent)
            if len(neighbor) != 1:
                raise ValueError('Pole land flags require the adjacent half-degree row')
            land[pole_rows[0]] = land[neighbor[0]]
    return land


def solar_indices(latitudes, longitudes):
    """DEFAULT D12: use the one-degree cell containing each weather center."""
    latitudes, longitudes = np.asarray(latitudes), np.asarray(longitudes)
    if not np.isfinite(latitudes).all() or not np.isfinite(longitudes).all() or np.any((latitudes < -90) | (latitudes > 90)) or np.any((longitudes < -180) | (longitudes >= 180)):
        raise ValueError('Coordinates outside the documented grids')
    return (np.minimum(np.floor(latitudes), 89) + 90).astype(int), (np.floor(longitudes) + 180).astype(int)


def encode_values(values, scale, offset=0):
    """D17: round to nearest (ties to even); never wrap or clip an Int16."""
    if not np.isfinite(scale) or scale <= 0 or not np.isfinite(offset):
        raise ValueError('Invalid packing scale or offset')
    values = np.asarray(values, dtype=float)
    missing = np.isnan(values) | (values == -999)
    valid = values[~missing]
    if not np.isfinite(valid).all():
        raise ValueError('Nonfinite source value')
    rounded = np.rint((valid - offset) / scale)
    if np.any((rounded <= FILL) | (rounded > 32767)):
        raise ValueError('Int16 overflow or reserved fill collision')
    packed = np.full(values.shape, FILL, dtype='<i2')
    packed[~missing] = rounded.astype('<i2')
    return packed


@dataclass
class Layer:
    values: np.ndarray
    present: np.ndarray
    period: tuple[str, str]


def read_parameter(parameter, raw_dir, selected_tiles=None):
    solar = parameter in SOLAR
    shape = (180, 360) if solar else (len(LATITUDES), len(LONGITUDES))
    layer = Layer(np.full((12, *shape), np.nan), np.zeros(shape, dtype=bool), ('', ''))
    for tile in tiles() if selected_tiles is None else selected_tiles:
        data = json.loads(tile.path(Path(raw_dir), parameter).read_bytes())
        period = (data['header']['start'], data['header']['end'])
        if layer.period != ('', '') and layer.period != period:
            raise ValueError('Mixed climatology periods in raw tiles')
        layer.period = period
        features = data['features']
        coordinates = np.asarray([f['geometry']['coordinates'][:2] for f in features], dtype=float)
        if solar:
            row_numbers, col_numbers = coordinates[:, 1] + 89.5, coordinates[:, 0] + 179.5
        else:
            row_numbers, col_numbers = (coordinates[:, 1] + 90) / 0.5, (coordinates[:, 0] + 180) / 0.625
        rows, cols = np.rint(row_numbers).astype(int), np.rint(col_numbers).astype(int)
        if not np.array_equal(rows, row_numbers) or not np.array_equal(cols, col_numbers) or np.any((rows < 0) | (rows >= shape[0])) or np.any((cols < 0) | (cols >= shape[1])):
            raise ValueError('Raw tile does not match its documented source grid')
        values = np.asarray([[f['properties']['parameter'][parameter][month] for month in MONTHS] for f in features], dtype=float).T
        if not np.isfinite(values).all():
            raise ValueError('Invalid monthly source value')
        values = np.where(values == data['header']['fill_value'], np.nan, values)
        duplicate = layer.present[rows, cols]
        if duplicate.any() and not np.array_equal(layer.values[:, rows[duplicate], cols[duplicate]], values[:, duplicate], equal_nan=True):
            raise ValueError('Conflicting duplicate cells on shared tile edges')
        layer.values[:, rows, cols] = values
        layer.present[rows, cols] = True
    return layer


def _write(path, content):
    path.parent.mkdir(parents=True, exist_ok=True)
    temporary = path.with_suffix(path.suffix + '.tmp')
    temporary.write_bytes(content)
    temporary.replace(path)


def pack(raw_dir=ROOT / 'data/raw/power', output=ROOT / 'app/public/data/earth'):
    result = fetch_all(raw_dir)
    if result.failed:
        raise ValueError('U04 fetch has unresolved failures; no layers packed')
    registry = load_registries()
    land_source = next(s for s in registry['sources'] if s['id'] == 'naturalearth_50m')
    land_file = ROOT / 'data/raw/naturalearth/ne_50m_land.geojson'
    if not land_file.exists():
        response = requests.get(land_source['url'], timeout=60)
        response.raise_for_status()
        _write(land_file, response.content)
    mask = land_mask(json.loads(land_file.read_bytes()))
    flat = np.flatnonzero(mask.ravel())
    rows, cols = flat // len(LONGITUDES), flat % len(LONGITUDES)
    cells = np.empty((len(flat), 2), dtype='<f4')
    cells[:, 0], cells[:, 1] = LATITUDES[rows], LONGITUDES[cols]
    solar_rows, solar_cols = solar_indices(cells[:, 0], cells[:, 1])
    channels = [c for c in registry['channels'] if c['onCard']]
    packed = np.empty((12, len(channels), len(cells)), dtype='<i2')
    quantities = []
    period = None
    for index, channel in enumerate(channels):
        parameter = channel['powerParameter']
        source = read_parameter(parameter, raw_dir)
        if not source.present.all():
            raise ValueError(f'{parameter}: incomplete global cell coverage')
        if period is not None and source.period != period:
            raise ValueError('Mixed climatology periods across quantities')
        period = source.period
        values = source.values[:, solar_rows, solar_cols] if parameter in SOLAR else source.values[:, rows, cols]
        values = values * channel['powerScale']
        packed[:, index, :] = encode_values(values, SCALES[channel['id']])
        quantities.append({
            'id': channel['id'], 'unit': channel['unit'], 'scale': SCALES[channel['id']],
            'offset': 0, 'fillValue': FILL, 'status': 'default',
            'powerParameter': parameter, 'powerScale': channel['powerScale'],
            'sourceGrid': {'latitudeStep': 1 if parameter in SOLAR else 0.5, 'longitudeStep': 1 if parameter in SOLAR else 0.625},
            'missingReason': 'POWER returned fill value -999; no source value is available.',
        })
        print(f"Packed {channel['id']} from {parameter}", flush=True)
    manifest = {
        'cellCount': len(cells), 'cellsFile': 'cells.bin', 'cellCoordinates': ['latitude', 'longitude'],
        'cellsDtype': 'float32', 'dtype': 'int16', 'byteOrder': 'little', 'layout': 'quantity-major',
        'quantityOrder': [c['id'] for c in channels], 'quantities': quantities,
        'monthFiles': [f'month-{month:02}.bin' for month in range(1, 13)],
        'period': {'start': period[0], 'end': period[1]}, 'sourceId': 'power', 'landSourceId': land_source['id'],
        'defaults': {
            'join': {'status': 'default', 'rule': 'D12: floor(latitude)+0.5 and floor(longitude)+0.5; latitude 90 uses 89.5'},
            'land': {'status': 'default', 'rule': 'D13: even-odd polygon rings; pole flags copy the adjacent half-degree row'},
            'packing': {'status': 'default', 'rule': 'D17: per-quantity scales, zero offset, nearest integer with ties to even; -32768 is missing'},
        },
    }
    output = Path(output)
    _write(output / 'cells.bin', cells.tobytes(order='C'))
    for month in range(12):
        if packed[month].nbytes >= 2_000_000:
            raise ValueError('Month binary exceeds the U05 size limit')
        _write(output / manifest['monthFiles'][month], packed[month].tobytes(order='C'))
    _write(output / 'manifest.json', (json.dumps(manifest, indent=2) + '\n').encode())
    print(f'{len(cells)} land cells; 12 month files, {packed[0].nbytes} bytes each', flush=True)
    return manifest


if __name__ == '__main__':
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--raw-dir', type=Path, default=ROOT / 'data/raw/power')
    parser.add_argument('--output', type=Path, default=ROOT / 'app/public/data/earth')
    args = parser.parse_args()
    pack(args.raw_dir, args.output)
