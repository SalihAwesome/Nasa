"""Airless solar angles and representative Earth paths for U14."""

import json
from collections.abc import Sequence
from datetime import UTC, datetime, timedelta
from functools import lru_cache
from math import atan2, cos, degrees, hypot, radians, sin
from pathlib import Path
from struct import Struct


@lru_cache(maxsize=144)
def _solar_coordinates(utc: datetime) -> tuple[float, float]:
    """Return sin-declination and Greenwich hour angle in degrees.

    Coefficients and equation of time: US Naval Observatory, Computing
    Approximate Solar Coordinates (see docs/verified-facts.md).
    """
    days = (utc - datetime(2000, 1, 1, 12, tzinfo=UTC)) / timedelta(days=1)
    anomaly = radians((357.529 + 0.98560028 * days) % 360)
    mean_longitude = (280.459 + 0.98564736 * days) % 360
    longitude = radians(mean_longitude + 1.915 * sin(anomaly) + 0.020 * sin(2 * anomaly))
    obliquity = radians(23.439 - 0.00000036 * days)
    right_ascension = degrees(atan2(cos(obliquity) * sin(longitude), cos(longitude)))
    equation_of_time = (mean_longitude - right_ascension + 180) % 360 - 180
    hours = (utc - utc.replace(hour=0, minute=0, second=0, microsecond=0)) / timedelta(hours=1)
    return sin(obliquity) * sin(longitude), 15 * (hours - 12) + equation_of_time


def sun_position(lat: float, lon: float, utc: datetime) -> tuple[float, float]:
    """Return (clockwise azimuth from north, elevation) in degrees.

    Longitude is positive eastward. The timestamp must include a time zone.
    No atmospheric refraction or terrain is included.
    """
    if utc.utcoffset() is None:
        raise ValueError('Sun position requires a timezone-aware datetime')
    if not -90 <= lat <= 90:
        raise ValueError('Latitude must be between -90 and 90 degrees')

    sin_declination, greenwich_hour_angle = _solar_coordinates(utc.astimezone(UTC))
    cos_declination = (1 - sin_declination**2)**0.5
    latitude = radians(lat)
    hour_angle = radians((greenwich_hour_angle + lon) % 360)

    east = -cos_declination * sin(hour_angle)
    north = sin_declination * cos(latitude) - cos_declination * cos(hour_angle) * sin(latitude)
    up = sin_declination * sin(latitude) + cos_declination * cos(hour_angle) * cos(latitude)
    return degrees(atan2(east, north)) % 360, degrees(atan2(up, hypot(east, north)))


def sun_numbers(azimuths: Sequence[float], elevations: Sequence[float]) -> dict:
    """Compute the U14 metrics from paired, equally spaced angular samples."""
    if len(elevations) == 0 or len(azimuths) != len(elevations):
        raise ValueError('Sun metrics require nonempty, paired samples')

    daylight = [(azimuth % 360, elevation) for azimuth, elevation in zip(azimuths, elevations) if elevation > 0]
    peak = max(elevations)
    if not daylight:
        return {
            'peak_elevation': peak,
            'low_sun_share': None,
            'horizon_sweep': None,
            'reasons': dict.fromkeys(('low_sun_share', 'horizon_sweep'), 'The Sun does not rise.'),
        }

    directions = sorted(azimuth for azimuth, _ in daylight)
    gaps = [right - left for left, right in zip(directions, directions[1:])]
    wrap_gap = 360 + directions[0] - directions[-1]
    return {
        'peak_elevation': peak,
        'low_sun_share': sum(elevation < 10 for _, elevation in daylight) / len(daylight),
        'horizon_sweep': 360 - max([wrap_gap, *gaps]),
    }


# Representative date, longitude and metric cadence come from D5. U14
# specifies the path cadence and scale. The team's signed encoding is recorded
# in the manifest so a reader can recover the normal compass angle.
SAMPLE_YEAR = 2026
SAMPLE_DAY = 15
SAMPLE_LONGITUDE = 0
METRIC_STEP_MINUTES = 10
PATH_STEP_MINUTES = 30
LATITUDE_START = -90
LATITUDE_END = 90
LATITUDE_STEP = 0.5
ANGLE_SCALE = 100
ANGLE_PAIR = Struct('<hh')


def write_earth_sun_data(output: Path) -> None:
    """Write 12 months × 361 latitude rows with no network dependency."""
    output.mkdir(parents=True, exist_ok=True)
    latitude_count = round((LATITUDE_END - LATITUDE_START) / LATITUDE_STEP) + 1
    latitudes = [LATITUDE_START + index * LATITUDE_STEP for index in range(latitude_count)]
    months = []
    paths = bytearray()
    minutes_per_day = 24 * 60
    path_stride = PATH_STEP_MINUTES // METRIC_STEP_MINUTES
    half_circle = 180 * ANGLE_SCALE

    for month in range(1, 13):
        midnight = datetime(SAMPLE_YEAR, month, SAMPLE_DAY, tzinfo=UTC)
        times = [midnight + timedelta(minutes=minute) for minute in range(0, minutes_per_day, METRIC_STEP_MINUTES)]
        month_rows = []
        for latitude in latitudes:
            angles = [sun_position(latitude, SAMPLE_LONGITUDE, utc) for utc in times]
            azimuths, elevations = zip(*angles)
            month_rows.append(sun_numbers(azimuths, elevations))
            for azimuth, elevation in angles[::path_stride]:
                signed_azimuth = (round(azimuth * ANGLE_SCALE) + half_circle) % (2 * half_circle) - half_circle
                paths.extend(ANGLE_PAIR.pack(signed_azimuth, round(elevation * ANGLE_SCALE)))
        months.append(month_rows)

    sampling = {
        'status': 'default',
        'year': SAMPLE_YEAR,
        'day_of_month': SAMPLE_DAY,
        'longitude_deg': SAMPLE_LONGITUDE,
        'time_zone': 'UTC',
        'latitude_start_deg': LATITUDE_START,
        'latitude_step_deg': LATITUDE_STEP,
        'latitude_count': len(latitudes),
        'month_start': 1,
        'month_count': len(months),
    }
    rows_data = {**sampling, 'sample_step_minutes': METRIC_STEP_MINUTES, 'months': months}
    (output / 'earth-rows.json').write_text(
        json.dumps(rows_data, indent=2) + '\n', encoding='utf-8', newline='\n'
    )

    manifest = {
        **sampling,
        'file': 'earth-paths.bin',
        'layout': ['month', 'latitude', 'sample', 'angle'],
        'angles': ['azimuth', 'elevation'],
        'dtype': 'int16',
        'byte_order': 'little',
        'degrees_per_count': 1 / ANGLE_SCALE,
        'sample_start_minute_utc': 0,
        'sample_step_minutes': PATH_STEP_MINUTES,
        'samples_per_path': minutes_per_day // PATH_STEP_MINUTES,
        'azimuth_encoding': 'Signed compass degrees in [-180, 180). Add 360 to a negative decoded angle.',
    }
    (output / 'earth-paths-manifest.json').write_text(json.dumps(manifest, indent=2) + '\n', encoding='utf-8', newline='\n')
    (output / 'earth-paths.bin').write_bytes(paths)


if __name__ == '__main__':
    write_earth_sun_data(Path(__file__).resolve().parents[1] / 'app/public/data/sun')
