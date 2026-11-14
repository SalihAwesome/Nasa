"""U17 event checks against the verified Horizons recipe and saved reply."""

from datetime import UTC, datetime, timedelta
import json
from pathlib import Path

import pytest

from sun_predict import predict, parse_reference, build_prediction, reference_url

ROOT = Path(__file__).resolve().parents[2]
# Keep the verified D10 reference independent of later real field-site updates.
SITE = {
    'lat': 25.3, 'lon': 51.5, 'start': '2026-11-14T00:00:00Z',
    'exclude': [], 'status': 'default', 'reason': 'D10 reference inputs.',
}
START = datetime(2026, 11, 14, tzinfo=UTC)


def test_default_site_predictions_agree_with_verified_horizons_times():
    result = predict(SITE)
    assert len(result['samples']) == 1440
    for name, hour, minute in [('sunrise', 2, 51), ('peak', 8, 19), ('sunset', 13, 47)]:
        actual = datetime.fromisoformat(result['events'][name])
        expected = START + timedelta(hours=hour, minutes=minute)
        assert abs((actual - expected).total_seconds()) <= 120


def test_saved_reference_checks_same_window_and_all_three_events():
    raw = (Path(__file__).parent / 'fixtures/horizons-pod-events-2026-11-14.txt').read_bytes()
    result = build_prediction(SITE, raw)
    assert result['site'] == SITE
    assert result['settings']['status'] == 'default'
    assert result['reference']['timeScale'] == 'UT'
    assert all(abs(gap) <= 2 for gap in result['reference']['differenceMinutes'].values())


def test_published_prediction_matches_the_configured_site_and_reference_bytes():
    from registries import load_registries
    site = load_registries()['podSite']
    output = ROOT / 'app/public/data/sun'
    published = json.loads((output / 'pod-prediction.json').read_text())
    raw = (output / published['reference']['rawFile']).read_bytes()
    computed = build_prediction(site, raw)
    assert published['site'] == site
    assert published['events'] == computed['events']
    assert len(published['samples']) == 1440
    assert published['samples'][0]['time_ut'] == computed['samples'][0]['time_ut']
    assert published['samples'][-1]['time_ut'] == computed['samples'][-1]['time_ut']
    assert [row['elevation'] for row in published['samples']] == pytest.approx([
        row['elevation'] for row in computed['samples']
    ])


def test_shifted_window_and_polar_events_have_explicit_reasons():
    site = {**SITE, 'start': '2026-11-14T12:00:00Z'}
    result = predict(site)
    assert result['samples'][0]['time_ut'] == site['start']
    assert result['samples'][-1]['time_ut'] == '2026-11-15T11:59:00Z'
    assert result['events']['sunrise'].startswith('2026-11-15')
    polar = predict({**SITE, 'lat': 90})
    assert polar['events']['sunrise'] is None
    assert polar['events']['sunset'] is None
    assert polar['reasons']['sunrise'] and polar['reasons']['sunset']


@pytest.mark.parametrize('field', ['lat', 'lon', 'start'])
def test_missing_field_input_is_rejected_without_substituting_values(field):
    with pytest.raises(ValueError, match=field):
        predict({**SITE, field: None})


def test_naive_time_is_rejected():
    with pytest.raises(ValueError):
        predict({**SITE, 'start': '2026-11-14T00:00:00'})


def test_reference_rejects_invalid_response():
    with pytest.raises(ValueError):
        parse_reference(b'API error: no ephemeris', SITE)


def test_reference_rejects_a_reply_for_a_different_window():
    raw = (Path(__file__).parent / 'fixtures/horizons-pod-events-2026-11-14.txt').read_bytes()
    with pytest.raises(ValueError, match='window'):
        parse_reference(raw, {**SITE, 'start': '2026-11-15T00:00:00Z'})


def test_query_uses_site_and_the_exact_24_hour_window():
    from urllib.parse import parse_qs, urlsplit
    query = parse_qs(urlsplit(reference_url('https://example.invalid/api', SITE)).query)
    assert query['CENTER'] == ["'coord@399'"]
    assert query['SITE_COORD'] == ["'51.5,25.3,0'"]
    assert query['R_T_S_ONLY'] == ["'TVH'"]
    assert query['START_TIME'] == ["'2026-11-14 00:00:00'"]
    assert query['STOP_TIME'] == ["'2026-11-15 00:00:00'"]
