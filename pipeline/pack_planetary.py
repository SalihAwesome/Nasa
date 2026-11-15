"""Pack global Moon/Mars terrain and Horizons-derived airless solar geometry.

Never extends a rover weather measurement beyond its saved reference location.
"""
import hashlib
import json
import re
from datetime import datetime, timedelta
from pathlib import Path
from urllib.parse import parse_qs, urlencode, urlsplit, urlunsplit

import numpy as np
import rasterio

from fetch_horizons import WINDOW, download, request_url, write_atomic
from pack_terrain import RAW, ROOT, terrain_metrics
from sun import sun_numbers

CONFIG = json.loads((ROOT / 'shared/planetary.json').read_text())
QUANTITIES = ['slope', 'roughness', 'peak_elevation', 'low_sun_share', 'horizon_sweep']


def fetch_path(body, coordinates, cache):
    target = next(t for t in json.loads((ROOT / 'shared/targets.json').read_text())
                  if t['id'] == ('jezero' if body == 'mars' else 'shackleton'))
    site = {'center': target['horizons']['center'], 'site': {'value': coordinates}}
    endpoint = next(s['url'] for s in json.loads((ROOT / 'shared/sources.json').read_text()) if s['id'] == 'horizons')
    parts = urlsplit(request_url(endpoint, site))
    query = parse_qs(parts.query)
    query.update(QUANTITIES=["'4,20'"], RANGE_UNITS=["'KM'"], APPARENT=["'AIRLESS'"])
    url = urlunsplit(parts._replace(query=urlencode(query, doseq=True)))
    path = cache / (body + '-' + hashlib.sha256(url.encode()).hexdigest() + '.txt')
    if not path.exists():
        write_atomic(path, download(url))
    return parse_path(path.read_bytes()), {'url': url, 'sha256': hashlib.sha256(path.read_bytes()).hexdigest()}


def parse_path(raw):
    text = raw.decode('ascii')
    if 'Airless apparent azimuth and elevation' not in text or 'Units: KM and KM/S' not in text:
        raise ValueError('Expected airless Horizons angles and km ranges')
    radii = re.search(r'Center radii\s*:\s*([\d.]+),\s*([\d.]+),\s*([\d.]+) km', text)
    if not radii:
        raise ValueError('Missing Horizons ellipsoid radii')
    table = text.split('$$SOE')[1].split('$$EOE')[0].strip().splitlines()
    expected = datetime.fromisoformat(WINDOW['start'])
    stop = datetime.fromisoformat(WINDOW['stop'])
    step = timedelta(hours=WINDOW['step_hours'])
    if len(table) != (stop - expected) // step + 1:
        raise ValueError('Incomplete Horizons time window')
    values = []
    for line in table:
        fields = line.split()
        if datetime.strptime(' '.join(fields[:2]), '%Y-%b-%d %H:%M') != expected:
            raise ValueError('Unexpected Horizons cadence')
        az, el, distance, _ = map(float, fields[-4:])
        if not (0 <= az <= 360 and -90 <= el <= 90 and np.isfinite(distance) and distance > 0):
            raise ValueError('Invalid Horizons angles/range')
        values.append([az, el, distance])
        expected += step
    return {'values': np.array(values), 'radii': np.array(list(map(float, radii.groups())))}


def directions(origin):
    az, el = np.radians(origin['values'][:, :2]).T
    distance = origin['values'][:, 2]
    # At geographic 0,0, local up/east/north are body-fixed X/Y/Z.
    return np.column_stack([distance*np.sin(el) + origin['radii'][0],
                            distance*np.cos(el)*np.sin(az), distance*np.cos(el)*np.cos(az)])


def angles(cells, origin):
    """Planetocentric latitude/east longitude -> local ellipsoid horizon."""
    lat, lon = np.radians(np.asarray(cells)).T
    a, _, c = origin['radii']
    geographic = np.arctan2(a*a*np.sin(lat), c*c*np.cos(lat))
    radius = 1 / np.sqrt((np.cos(lat)/a)**2 + (np.sin(lat)/c)**2)
    radial = np.column_stack([np.cos(lat)*np.cos(lon), np.cos(lat)*np.sin(lon), np.sin(lat)])
    point = radial * radius[:, None]
    up = np.column_stack([np.cos(geographic)*np.cos(lon), np.cos(geographic)*np.sin(lon), np.sin(geographic)])
    east = np.column_stack([-np.sin(lon), np.cos(lon), np.zeros_like(lon)])
    north = np.cross(up, east)
    delta = directions(origin)[None, :, :] - point[:, None, :]
    vertical = np.einsum('nti,ni->nt', delta, up)
    e = np.einsum('nti,ni->nt', delta, east)
    n = np.einsum('nti,ni->nt', delta, north)
    return np.degrees(np.arctan2(e, n)) % 360, np.degrees(np.arctan2(vertical, np.hypot(e, n)))


def validate(body, origin, cache):
    checks = []
    a, _, c = origin['radii']
    for lat, lon in CONFIG['validationPoints']:
        geographic = np.degrees(np.arctan2(a*a*np.sin(np.radians(lat)), c*c*np.cos(np.radians(lat))))
        direct, source = fetch_path(body, f'{-(lon % 360) if body == "mars" else lon},{geographic:.10f},0', cache)
        az, el = angles([[lat, lon]], origin)
        az_error = np.abs((az[0] - direct['values'][:, 0] + 180) % 360 - 180)
        el_error = np.abs(el[0] - direct['values'][:, 1])
        error = max(float(az_error.max()), float(el_error.max()))
        if error > CONFIG['validationMaxAngleErrorDegrees']:
            raise ValueError(f'{body} Horizons validation failed at {lat},{lon}: {error}')
        checks.append({'latitude': lat, 'longitude': lon, 'maxAngleErrorDegrees': error, **source})
    return checks


def build(output=None):
    output = Path(output or ROOT / 'app/public/data/planetary')
    cache = ROOT / 'data/raw/planetary'
    latitudes = CONFIG['latitudeStart'] - np.arange(CONFIG['rows']) * CONFIG['stepDegrees']
    longitudes = CONFIG['longitudeStart'] + np.arange(CONFIG['columns']) * CONFIG['stepDegrees']
    lon, lat = np.meshgrid(longitudes, latitudes)
    cells = np.column_stack([lat.ravel(), lon.ravel()])
    metadata = {'grid': CONFIG, 'quantities': QUANTITIES, 'dtype': 'float32', 'byteOrder': 'little',
                'layout': 'quantity-major', 'coordinates': 'planetocentric latitude, east-positive longitude',
                'window': WINDOW, 'bodies': {}, 'note': CONFIG['note']}
    for body in ('moon', 'mars'):
        origin, source = fetch_path(body, '0,0,0', cache)
        checks = validate(body, origin, cache)
        if body == 'moon':
            with rasterio.open(RAW / 'moon.tif') as raster:
                dem = raster.read(1).astype(float) * 1000
        else:
            dem = np.fromfile(RAW / 'mars.img', dtype='>i2').reshape(720, 1440)
        slope, roughness = terrain_metrics(cells, body, dem)
        solar = []
        for start in range(0, len(cells), CONFIG['columns']):
            az, el = angles(cells[start:start+CONFIG['columns']], origin)
            solar.extend(sun_numbers(azimuth, elevation) for azimuth, elevation in zip(az, el))
        values = np.array([slope, roughness, *[[row[key] if row[key] is not None else np.nan for row in solar]
                                            for key in QUANTITIES[2:]]], dtype='<f4')
        content = values.tobytes()
        write_atomic(output / (body + '.bin'), content)
        dem_name = 'moon.tif' if body == 'moon' else 'mars.img'
        metadata['bodies'][body] = {'file': body + '.bin', 'sha256': hashlib.sha256(content).hexdigest(),
            'sunSource': source, 'validation': checks,
            'terrainSource': json.loads((ROOT / 'app/public/data/terrain/manifest.json').read_text())['sources'][body],
            'terrainSha256': hashlib.sha256((RAW / dem_name).read_bytes()).hexdigest()}
        print(body, len(cells), 'cells; validation max', max(c['maxAngleErrorDegrees'] for c in checks), flush=True)
    write_atomic(output / 'manifest.json', (json.dumps(metadata, indent=2, allow_nan=False)+'\n').encode())
    return metadata


if __name__ == '__main__':
    build()
