import json
from datetime import UTC, datetime, timedelta
from pathlib import Path
from struct import unpack

import pytest

from sun import sun_numbers, sun_position, write_earth_sun_data


REFERENCE_LATITUDE, REFERENCE_LONGITUDE = 25.3, 51.5  # docs/verified-facts.md
ANGLE_TOLERANCE = 0.5  # docs/software-plan.md, U14 check
ROOT = Path(__file__).resolve().parents[2]


def horizons_rows():
    response = (Path(__file__).parent / 'fixtures/horizons-earth-2026-11-14.txt').read_text()
    table = response.split('$$SOE', 1)[1].split('$$EOE', 1)[0]
    for line in table.strip().splitlines():
        date, time, *fields = line.split()
        utc = datetime.strptime(f'{date} {time}', '%Y-%b-%d %H:%M').replace(tzinfo=UTC)
        yield utc, float(fields[-2]), float(fields[-1])


def assert_matches_horizons(utc, expected_azimuth, expected_elevation):
    azimuth, elevation = sun_position(REFERENCE_LATITUDE, REFERENCE_LONGITUDE, utc)
    azimuth_error = abs((azimuth - expected_azimuth + 180) % 360 - 180)
    elevation_error = abs(elevation - expected_elevation)
    print(f'{utc:%H:%M} UTC: azimuth error {azimuth_error:.4f}°, elevation error {elevation_error:.4f}°')
    assert azimuth_error <= ANGLE_TOLERANCE
    assert elevation_error <= ANGLE_TOLERANCE


@pytest.mark.parametrize('utc,azimuth,elevation', list(horizons_rows()))
def test_six_airless_horizons_times(utc, azimuth, elevation):
    assert_matches_horizons(utc, azimuth, elevation)


def test_verified_transit():
    facts = (ROOT / 'docs/verified-facts.md').read_text(encoding='utf-8')
    row = next(line for line in facts.splitlines() if line.startswith('| 2026-Nov-14 08:19 |'))
    timestamp, _, azimuth, elevation = (field.strip() for field in row.strip('|').split('|'))
    utc = datetime.strptime(timestamp, '%Y-%b-%d %H:%M').replace(tzinfo=UTC)
    assert_matches_horizons(utc, float(azimuth), float(elevation))


def test_low_sun_path_from_east_to_west():
    directions = list(range(90, 271, 2))
    result = sun_numbers(directions, [5] * len(directions))
    assert result['peak_elevation'] == 5
    assert result['low_sun_share'] == 1
    assert result['horizon_sweep'] == 180


def test_sweep_crosses_north_and_excludes_night():
    result = sun_numbers([350, 0, 10, 180], [5, 10, 15, 0])
    assert result['horizon_sweep'] == 20
    assert result['low_sun_share'] == pytest.approx(1 / 3)


def test_no_daylight_and_single_sample():
    result = sun_numbers([10, 20], [-1, 0])
    assert result['peak_elevation'] == 0
    for key in ('low_sun_share', 'horizon_sweep'):
        assert result[key] is None
        assert result['reasons'][key] == 'The Sun does not rise.'
    assert sun_numbers([20], [5])['horizon_sweep'] == 0


def test_generated_rows_and_signed_int16_paths(tmp_path):
    write_earth_sun_data(tmp_path)
    rows = json.loads((tmp_path / 'earth-rows.json').read_text())
    manifest = json.loads((tmp_path / 'earth-paths-manifest.json').read_text())
    paths = (tmp_path / 'earth-paths.bin').read_bytes()
    assert rows['status'] == manifest['status'] == 'default'
    assert len(rows['months']) == 12
    assert all(len(month) == 361 for month in rows['months'])
    assert len(paths) == 12 * 361 * 48 * 2 * 2
    for row_index, latitude in [(0, -90), (180, 0), (230, 25), (360, 90)]:
        for sample in (0, 10, 28, 47):
            azimuth_raw, elevation_raw = unpack('<hh', paths[(row_index * 48 + sample) * 4:][:4])
            utc = datetime(2026, 1, 15, tzinfo=UTC) + timedelta(minutes=sample * 30)
            azimuth, elevation = sun_position(latitude, 0, utc)
            assert -18000 <= azimuth_raw < 18000
            assert abs((azimuth_raw / 100 - azimuth + 180) % 360 - 180) <= 0.005001
            assert elevation_raw / 100 == pytest.approx(elevation, abs=0.005001)
