import hashlib
import gzip
import json
from pathlib import Path

import numpy as np
import pytest

from pack_planetary import CONFIG, QUANTITIES, ROOT, angles, parse_path

FIXTURES = Path(__file__).parent / 'fixtures/planetary'


@pytest.mark.parametrize('body', ['moon', 'mars'])
def test_origin_coordinate_transform_reproduces_real_horizons_angles(body):
    raw = gzip.decompress((FIXTURES / (body + '-origin.txt.gz')).read_bytes())
    manifest = json.loads((ROOT / 'app/public/data/planetary/manifest.json').read_text())
    assert hashlib.sha256(raw).hexdigest() == manifest['bodies'][body]['sunSource']['sha256']
    origin = parse_path(raw)
    az, el = angles([[0, 0]], origin)
    np.testing.assert_allclose(az[0], origin['values'][:, 0], atol=1e-8)
    np.testing.assert_allclose(el[0], origin['values'][:, 1], atol=1e-8)
    assert len(el[0]) == 721


@pytest.mark.parametrize('body', ['moon', 'mars'])
def test_shipped_global_grid_has_verified_coverage_and_point_validation(body):
    folder = ROOT / 'app/public/data/planetary'
    manifest = json.loads((folder / 'manifest.json').read_text())
    product = manifest['bodies'][body]
    content = (folder / product['file']).read_bytes()
    assert hashlib.sha256(content).hexdigest() == product['sha256']
    values = np.frombuffer(content, dtype='<f4').reshape(len(QUANTITIES), CONFIG['rows'], CONFIG['columns'])
    assert np.isfinite(values[:3]).all()
    assert (values[0] >= 0).all() and (values[1] >= 0).all()
    assert ((values[2] >= -90) & (values[2] <= 90)).all()
    assert len(product['validation']) == len(CONFIG['validationPoints'])
    assert all(check['maxAngleErrorDegrees'] <= CONFIG['validationMaxAngleErrorDegrees'] for check in product['validation'])


def test_incomplete_or_wrong_unit_ephemeris_is_rejected():
    raw = gzip.decompress((FIXTURES / 'moon-origin.txt.gz').read_bytes())
    with pytest.raises(ValueError):
        parse_path(raw.replace(b'$$EOE', b'2026-Dec-01 01:00 0 0 1 0\n$$EOE'))
    with pytest.raises(ValueError):
        parse_path(raw.replace(b'Airless apparent azimuth and elevation', b'Invalid axes'))
    with pytest.raises(ValueError):
        parse_path(raw.replace(b'Units: KM and KM/S', b'Units: AU and AU/D'))
