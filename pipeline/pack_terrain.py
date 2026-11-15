"""Derive comparable regional terrain metrics from cached numeric DEMs.

Acquisition scripts in tools/ record the source URLs. No synthetic values or
application-side interpolation is used. The provider's MOLA gridded product
includes interpolated cells, as documented in its original PDS label.
"""
import hashlib
import json
from pathlib import Path

import numpy as np
import rasterio
from scipy.io import netcdf_file
from pack import _write

ROOT = Path(__file__).resolve().parents[1]
RAW = ROOT / 'data/raw/terrain'
SETTINGS = json.loads((ROOT / 'shared/terrain.json').read_text())


def destinations(cells, radius):
    """Spherical exponential map in a local east/north frame, including poles."""
    offsets = np.array(SETTINGS['sampleOffsets']) * SETTINGS['sampleSpacingM']
    x, y = np.meshgrid(offsets, offsets)
    x, y = x.ravel(), y.ravel()
    lat, lon = np.radians(cells).T
    origin = np.array([np.cos(lat)*np.cos(lon), np.cos(lat)*np.sin(lon), np.sin(lat)]).T
    east = np.array([-np.sin(lon), np.cos(lon), np.zeros_like(lon)]).T
    north = np.array([-np.sin(lat)*np.cos(lon), -np.sin(lat)*np.sin(lon), np.cos(lat)]).T
    distance = np.hypot(x, y)
    direction = (east[:, None, :]*x[None, :, None] + north[:, None, :]*y[None, :, None]) / np.where(distance == 0, 1, distance)[None, :, None]
    point = origin[:, None, :]*np.cos(distance/radius)[None, :, None] + direction*np.sin(distance/radius)[None, :, None]
    return np.degrees(np.arcsin(np.clip(point[:, :, 2], -1, 1))), np.degrees(np.arctan2(point[:, :, 1], point[:, :, 0])), x, y


def plane_metrics(heights, x, y):
    center = heights.mean(axis=1)
    dx = (heights*x).sum(axis=1)/(x*x).sum()
    dy = (heights*y).sum(axis=1)/(y*y).sum()
    residual = heights-center[:, None]-dx[:, None]*x-dy[:, None]*y
    return np.degrees(np.arctan(np.hypot(dx, dy))), np.sqrt(np.mean(residual**2, axis=1))


def terrain_metrics(cells, body, grid):
    lat, lon, x, y = destinations(np.asarray(cells), SETTINGS['radiusM'][body])
    if body == 'earth':
        rows = np.rint((lat+90)*10).astype(int).clip(0, 1800)
        cols = np.rint((lon+180)*10).astype(int).clip(0, 3600)
    else:
        rows = np.floor((90-lat)*4).astype(int).clip(0, 719)
        longitude = lon+180 if body == 'moon' else lon % 360
        cols = np.floor(longitude*4).astype(int) % 1440
    heights = grid[rows, cols].astype(float)
    invalid = (~np.isfinite(heights)).any(axis=1)
    if body == 'earth':
        valid = np.isfinite(heights) & (heights >= 0) & (heights != 32767)
        design = np.column_stack([x, y, np.ones_like(x)])
        normal = np.einsum('pi,np,pj->nij', design, valid, design)
        rhs = np.einsum('pi,np,np->ni', design, valid, np.where(valid, heights, 0))
        coefficients = np.einsum('nij,nj->ni', np.linalg.pinv(normal), rhs)
        residual = np.where(valid, heights-np.einsum('pi,ni->np', design, coefficients), 0)
        count = valid.sum(axis=1)
        slope = np.degrees(np.arctan(np.hypot(coefficients[:, 0], coefficients[:, 1])))
        roughness = np.sqrt((residual**2).sum(axis=1)/np.maximum(count, 1))
        invalid = (count < SETTINGS['minimumLandSamples']) | (np.linalg.matrix_rank(normal) < 3)
        slope[invalid] = np.nan
        roughness[invalid] = np.nan
        return slope, roughness
    slope, roughness = plane_metrics(heights, x, y)
    slope[invalid] = np.nan
    roughness[invalid] = np.nan
    return slope, roughness


def pack():
    output = ROOT / 'app/public/data/terrain'
    output.mkdir(parents=True, exist_ok=True)
    cells_path = ROOT / 'app/public/data/earth/cells.bin'
    cells_bytes = cells_path.read_bytes()
    cells = np.frombuffer(cells_bytes, dtype='<f4').reshape(-1, 2)
    with netcdf_file(RAW / 'earth.nc', mmap=False) as nc:
        earth = nc.variables['altitude'][:].copy()
    with rasterio.open(RAW / 'moon.tif') as src:
        moon = src.read(1).astype(float)*1000  # SVS float TIFF is kilometres.
    mars = np.fromfile(RAW / 'mars.img', dtype='>i2').reshape(720, 1440)
    slope, roughness = terrain_metrics(cells, 'earth', earth)
    bare_source = np.load(RAW / 'bare.npz')
    bare = bare_source['values']
    west, south, east, north = bare_source['bounds']
    rows = np.floor((north-cells[:, 0])/(north-south)*bare.shape[0]).astype(int)
    cols = np.floor((cells[:, 1]-west)/(east-west)*bare.shape[1]).astype(int) % bare.shape[1]
    fraction = bare[rows.clip(0, bare.shape[0]-1), cols].astype(float)
    fraction[(cells[:, 0] <= south) | (cells[:, 0] >= north) | (fraction > 100)] = np.nan
    packed = np.vstack([slope, roughness, fraction]).astype('<f4').tobytes()
    targets = {}
    for target in json.loads((ROOT / 'shared/targets.json').read_text()):
        lon, lat, _ = map(float, target['horizons']['site']['value'].split(','))
        body = 'moon' if target['id'] == 'shackleton' else 'mars'
        if body == 'mars': lon = -lon  # Horizons Mars longitude is west-positive.
        a, b = terrain_metrics([[lat, lon]], body, moon if body == 'moon' else mars)
        targets[target['id']] = {
            'slope': {'value': float(a[0]), 'unit': 'degrees', 'source': 'LOLA' if body == 'moon' else 'MOLA'},
            'roughness': {'value': float(b[0]), 'unit': 'm', 'source': 'LOLA' if body == 'moon' else 'MOLA'},
            'bare_ground': {'value': 100, 'unit': '%', 'source': 'docs/project-brief.md', 'status': 'default', 'note': 'Fully bare target assumption from the team brief.'},
        }
    sources = {
        'earth': 'https://oceanwatch.aoml.noaa.gov/erddap/info/etopo180/index.html',
        'moon': 'https://svs.gsfc.nasa.gov/4720/',
        'mars': 'https://pds-geosciences.wustl.edu/mgs/mgs-m-mola-5-megdr-l3-v1/mgsl_300x/meg004/megt90n000cb.lbl',
        'bare_ground': 'https://doi.org/10.5281/zenodo.3939050',
    }
    metadata = {
        'cellCount': len(cells), 'cellsSha256': hashlib.sha256(cells_bytes).hexdigest(),
        'dtype': 'float32', 'byteOrder': 'little', 'layout': 'quantity-major',
        'quantityOrder': [q['id'] for q in SETTINGS['quantities']], 'file': 'earth.bin',
        'targets': targets, 'sources': sources, 'note': SETTINGS['note'],
        'bareGroundSourceMd5': 'f2c9432c37ced7af02b6d9207036c2dc',
        'bareGroundAttribution': 'Buchhorn, M., et al. (2020). Copernicus Global Land Service: Land Cover 100m, Collection 3, epoch 2019, V3.0.1. DOI: 10.5281/zenodo.3939050.',
        'missingReason': 'No regional sample: fewer than 13 usable land elevations, invalid source data, or outside 2019 bare-ground coverage.',
        'rawSha256': {name: hashlib.file_digest((RAW / name).open('rb'), 'sha256').hexdigest() for name in ['earth.nc', 'moon.tif', 'mars.img', 'mars.lbl', 'bare.npz']},
    }
    _write(output / 'earth.bin', packed)
    _write(output / 'manifest.json', (json.dumps(metadata, indent=2)+'\n').encode())
    print(json.dumps({'targets': targets, 'validEarthCells': dict(zip(metadata['quantityOrder'], [int(np.isfinite(a).sum()) for a in [slope, roughness, fraction]]))}, indent=2))
    return metadata


if __name__ == '__main__':
    pack()
