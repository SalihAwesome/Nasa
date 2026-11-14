"""U17: predict pod-site Sun events over the log's 24-hour UTC window."""

import argparse
from datetime import UTC, datetime, timedelta
import hashlib
import json
import math
from pathlib import Path
import re
from urllib.parse import urlencode

from fetch_horizons import OBSERVER, download, write_atomic
from registries import load_registries, parse_pod_site
from sun import sun_position

ROOT = Path(__file__).resolve().parents[1]
EVENTS = {'sunrise': 'r', 'peak': 't', 'sunset': 's'}


def settings():
    return json.loads((ROOT / 'shared/sun_prediction_settings.json').read_text())


def window(site):
    site = parse_pod_site(site)
    for field in ('lat', 'lon', 'start'):
        if site[field] is None:
            raise ValueError(f'podSite.{field} is required for a Sun prediction')
    start = datetime.fromisoformat(site['start']).astimezone(UTC)
    return start, start + timedelta(hours=settings()['durationHours'])


def utc_text(time):
    return time.astimezone(UTC).isoformat().replace('+00:00', 'Z')


def predict(site):
    start, end = window(site)
    config = settings()
    step = timedelta(minutes=config['stepMinutes'])
    count = (end - start) // step
    # The endpoint supports detection in the final minute but lies outside the log.
    times = [start + index * step for index in range(count + 1)]
    elevations = [sun_position(site['lat'], site['lon'], time)[1] for time in times]
    threshold = config['sunriseElevationDegrees']
    events = {'sunrise': None, 'peak': utc_text(times[max(range(count), key=lambda i: elevations[i])]), 'sunset': None}
    for index, (before, after) in enumerate(zip(elevations, elevations[1:])):
        kind = None
        if before <= threshold < after:
            kind = 'sunrise'
        elif before >= threshold > after:
            kind = 'sunset'
        if kind is not None and events[kind] is None:
            # Report the beginning of the crossing minute. Resolution is one minute.
            events[kind] = utc_text(times[index])
    reasons = {
        name: f'No {name} crossing occurs in the requested 24-hour window.'
        for name, time in events.items() if time is None
    }
    return {
        'site': site.copy(), 'sourceId': 'computed', 'timeScale': 'UT',
        'window': {'start': utc_text(start), 'endExclusive': utc_text(end)},
        'settings': config, 'events': events, 'reasons': reasons,
        'elevationUnit': 'degrees', 'refraction': False,
        'samples': [
            {'time_ut': utc_text(time), 'elevation': elevation}
            for time, elevation in zip(times[:-1], elevations[:-1])
        ],
    }


def reference_url(endpoint, site):
    start, end = window(site)
    query = {
        **OBSERVER, 'CENTER': 'coord@399',
        'SITE_COORD': f"{site['lon']},{site['lat']},0",
        'START_TIME': start.isoformat(sep=' '),
        'STOP_TIME': end.isoformat(sep=' '),
        'STEP_SIZE': '1 m', 'R_T_S_ONLY': 'TVH', 'APPARENT': 'AIRLESS',
    }
    # Horizons receives UT calendar times without a Python timezone suffix.
    query['START_TIME'] = query['START_TIME'].removesuffix('+00:00')
    query['STOP_TIME'] = query['STOP_TIME'].removesuffix('+00:00')
    return endpoint + '?' + urlencode({
        'format': 'text', **{key: f"'{value}'" for key, value in query.items()},
    })


def parse_reference(raw, site):
    text = raw.decode('ascii')
    _, begin, rest = text.partition('$$SOE')
    table, finish, _ = rest.partition('$$EOE')
    if not begin or not finish or 'Airless apparent azimuth and elevation' not in text:
        raise ValueError('Invalid airless Horizons event response')
    start, end = window(site)
    for label, expected in (('Start time', start), ('Stop  time', end)):
        match = re.search(re.escape(label) + r'\s*:\s*A.D. (\S+ \S+) UT', text)
        if match is None:
            raise ValueError('Missing Horizons reference window')
        actual = datetime.strptime(match[1], '%Y-%b-%d %H:%M:%S.%f').replace(tzinfo=UTC)
        if actual != expected:
            raise ValueError('Horizons reference window differs from the pod log window')
    events = dict.fromkeys(EVENTS)
    for line in table.strip().splitlines():
        fields = line.split()
        if not fields:
            continue
        if len(fields) < 5:
            raise ValueError(f'Invalid Horizons event row: {line}')
        time = datetime.strptime(' '.join(fields[:2]), '%Y-%b-%d %H:%M').replace(tzinfo=UTC)
        azimuth, elevation = map(float, fields[-2:])
        if not (math.isfinite(azimuth) and math.isfinite(elevation)):
            raise ValueError('Invalid Horizons event angles')
        flags = ''.join(fields[2:-2])
        for name, flag in EVENTS.items():
            if flags.endswith(flag) and start <= time < end and events[name] is None:
                events[name] = utc_text(time)
    return events


def build_prediction(site, raw):
    result = predict(site)
    reference = parse_reference(raw, site)
    gaps = {}
    reasons = {}
    for name in EVENTS:
        if reference[name] is None or result['events'][name] is None:
            gaps[name] = None
            reasons[name] = 'Both model and reference events are required to compare times.'
            continue
        actual = datetime.fromisoformat(result['events'][name])
        expected = datetime.fromisoformat(reference[name])
        gaps[name] = (actual - expected).total_seconds() / 60
        if abs(gaps[name]) > result['settings']['referenceToleranceMinutes']:
            raise ValueError(f'{name} differs from Horizons by {gaps[name]} minutes')
    result['reference'] = {
        'sourceId': 'horizons', 'timeScale': 'UT', 'events': reference,
        'differenceMinutes': gaps, 'reasons': reasons,
    }
    return result


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--refresh', action='store_true', help='Fetch the reference again')
    args = parser.parse_args()
    try:
        registries = load_registries()
        site = registries['podSite']
        endpoint = next(source['url'] for source in registries['sources'] if source['id'] == 'horizons')
        url = reference_url(endpoint, site)
        key = hashlib.sha256(url.encode()).hexdigest()
        cache = ROOT / 'data/raw/horizons' / f'pod-events-{key}.txt'
        if args.refresh or not cache.exists():
            write_atomic(cache, download(url))
        raw = cache.read_bytes()
        result = build_prediction(site, raw)
        output = ROOT / 'app/public/data/sun'
        result['reference'].update(requestUrl=url, rawFile='pod-prediction-horizons.txt')
        encoded = (json.dumps(result, indent=2, allow_nan=False) + '\n').encode()
        write_atomic(output / 'pod-prediction-horizons.txt', raw)
        write_atomic(output / 'pod-prediction.json', encoded)
    except (OSError, ValueError) as error:
        parser.exit(1, f'{error}\n')
    print(json.dumps({'events': result['events'], 'differenceMinutes': result['reference']['differenceMinutes']}, indent=2))


if __name__ == '__main__':
    main()
