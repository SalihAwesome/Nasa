"""Analytic geometry tests and checks against downloaded numeric source grids."""
import json
from pathlib import Path

import numpy as np
import pytest

from pack_terrain import SETTINGS, destinations, plane_metrics, terrain_metrics

ROOT = Path(__file__).resolve().parents[2]


def test_plane_slope_and_relief_are_independent_of_vertical_datum():
    simulated = {'simulated': True, 'cells': np.array([[0., 0.]])}
    _, _, x, y = destinations(simulated['cells'], SETTINGS['radiusM']['earth'])
    slope, roughness = plane_metrics(np.array([x]), x, y)
    assert slope.item() == pytest.approx(45)
    assert roughness.item() == pytest.approx(0, abs=1e-9)
    raised = plane_metrics(np.array([x + 3000]), x, y)
    assert raised[0] == pytest.approx(slope)
    assert raised[1] == pytest.approx(roughness, abs=1e-9)


def test_stencil_uses_the_same_physical_distances_at_poles_and_on_different_worlds():
    simulated = {'simulated': True, 'cells': np.array([[0., 0.], [90., 0.], [-89.45, 222.69]])}
    for radius in SETTINGS['radiusM'].values():
        lat, lon, x, y = destinations(simulated['cells'], radius)
        center_lat, center_lon = np.radians(simulated['cells']).T
        a, b = np.radians(lat), np.radians(lon)
        cosine = np.sin(center_lat[:, None])*np.sin(a) + np.cos(center_lat[:, None])*np.cos(a)*np.cos(b-center_lon[:, None])
        distances = np.arccos(np.clip(cosine, -1, 1))*radius
        assert distances == pytest.approx(np.broadcast_to(np.hypot(x, y), distances.shape), abs=0.2)


def test_coastal_fit_excludes_bathymetry_and_requires_a_majority_of_land_samples():
    simulated = {'simulated': True, 'grid': np.full((1801, 3601), -5000, dtype=np.int16)}
    lat, lon, _, _ = destinations(np.array([[0., 0.]]), SETTINGS['radiusM']['earth'])
    rows = np.rint((lat[0]+90)*10).astype(int)
    cols = np.rint((lon[0]+180)*10).astype(int)
    minimum = SETTINGS['minimumLandSamples']
    simulated['grid'][rows[:minimum], cols[:minimum]] = 100
    slope, roughness = terrain_metrics([[0., 0.]], 'earth', simulated['grid'])
    assert slope.item() == pytest.approx(0, abs=1e-7)
    assert roughness.item() == pytest.approx(0, abs=1e-7)
    simulated['grid'][rows[minimum-1], cols[minimum-1]] = -5000
    slope, roughness = terrain_metrics([[0., 0.]], 'earth', simulated['grid'])
    assert np.isnan(slope.item()) and np.isnan(roughness.item())


@pytest.mark.raw_data('terrain/mars.img')
def test_jezero_from_the_real_big_endian_mola_product():
    mars = np.fromfile(ROOT / 'data/raw/terrain/mars.img', dtype='>i2').reshape(720, 1440)
    slope, roughness = terrain_metrics([[18.44, 77.45]], 'mars', mars)
    # Independent direct-source probe recorded in docs/verified-facts.md.
    assert slope.item() == pytest.approx(0.79030788, abs=1e-7)
    assert roughness.item() == pytest.approx(157.28988779, abs=1e-6)


def test_shipped_terrain_has_all_quantities_targets_and_real_missing_values():
    root = ROOT / 'app/public/data/terrain'
    manifest = json.loads((root / 'manifest.json').read_text())
    values = np.fromfile(root / manifest['file'], dtype='<f4').reshape(3, manifest['cellCount'])
    assert manifest['quantityOrder'] == ['slope', 'roughness', 'bare_ground']
    assert np.isnan(values).any()  # Unsupported regions are not invented zeros.
    assert np.isfinite(values).all(axis=0).sum() > 10000
    assert np.nanmin(values) >= 0
    assert np.nanmax(values[2]) <= 100
    for target in manifest['targets'].values():
        assert set(target) == set(manifest['quantityOrder'])
        assert all(np.isfinite(row['value']) and row['source'] for row in target.values())
