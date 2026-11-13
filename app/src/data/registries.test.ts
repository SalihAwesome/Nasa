/// <reference types="node" />
import { readFileSync } from 'node:fs'
import { expect, test } from 'vitest'
import { loadRegistries, parseChannels, parseSources, parsePodSite, parsePodSettings, RegistryError } from './registries'

function raw(name: string) {
  return JSON.parse(readFileSync(new URL(`../../../shared/${name}.json`, import.meta.url), 'utf8'))
}

test('loads all four shared registries and preserves the U02 channel contract', () => {
  const data = loadRegistries()
  // Expected mappings: software-plan.md, U02; reductions: DEFAULT D16.
  expect(data.channels.map(c => [c.id, c.podFields, c.powerParameter, c.powerHourlyParameter, c.powerScale, c.medaFile, c.medaColumn, c.cardNumber, c.onCard])).toEqual([
    ['ground_temp', ['tg'], 'TS_RANGE', 'TS', 1, 'CAL_TIRS', 'GROUND_TEMP', 'range', true],
    ['reflectivity', ['lux_dn', 'lux_up'], 'ALLSKY_SRF_ALB', 'ALLSKY_SRF_ALB', 1, null, null, 'daylight_mean', true],
    ['uv', ['uv'], 'ALLSKY_SFC_UV_INDEX', 'ALLSKY_SFC_UV_INDEX', 1, null, null, 'daily_mean', true],
    ['air_temp', ['ta'], 'T2M', 'T2M', 1, 'CAL_ATS', 'ATS_LOCAL_TEMP1', 'daily_mean', true],
    ['humidity', ['rh'], 'RH2M', 'RH2M', 1, 'DER_RHS', 'LOCAL_RELATIVE_HUMIDITY', 'daily_mean', true],
    ['pressure', ['p'], 'PS', 'PS', 10, 'DER_PS', 'PRESSURE', 'daily_mean', true],
    ['ground_temp_10cm', ['t10'], null, null, null, null, null, null, false],
  ])
  expect(data.sources.map(s => s.id)).toEqual(['power', 'horizons', 'meda', 'naturalearth_50m', 'naturalearth_110m', 'pod', 'computed'])
  expect(data.podSite).toMatchObject({ lat: 25.3, lon: 51.5, start: '2026-11-14T00:00:00Z', exclude: [], status: 'default' })
  expect(Object.values(data.podSettings).map(s => [s.value, s.status])).toEqual([
    [400, 'default'], [1000, 'default'], [0.27, 'default'], [0, 'default'],
  ])
  expect(data.channels.every(c => c.status === 'default')).toBe(true)
  expect(data.sources.filter(s => s.url !== null).every(s => s.accessed === '2026-11-12')).toBe(true)
})

test('rejects a channel with no unit', () => {
  const data = raw('channels')
  delete data[0].unit
  expect(() => parseChannels(data)).toThrow(RegistryError)
})

test('rejects a null with no corresponding reason', () => {
  const data = raw('channels')
  delete data[1].reasons.medaFile
  expect(() => parseChannels(data)).toThrow(/medaFile/)
})

const parsers = [
  ['channels', parseChannels], ['sources', parseSources],
  ['pod_site', parsePodSite], ['pod_settings', parsePodSettings],
] as const

test.each(parsers)('%s rejects unknown fields', (name, parse) => {
  const data = raw(name)
  const entry = Array.isArray(data) ? data[0] : data
  entry.unexpected = true
  expect(() => parse(data)).toThrow(/unknown field/)
})

test('rejects unknown nested settings and unexplained source nulls', () => {
  const settings = raw('pod_settings')
  settings.sunEventLux.unexpected = true
  expect(() => parsePodSettings(settings)).toThrow(/unknown field/)
  const sources = raw('sources')
  delete sources.find((s: { id: string }) => s.id === 'pod').reasons.url
  expect(() => parseSources(sources)).toThrow(/url/)
})

test('rejects unknown reason keys and empty reasons', () => {
  const data = raw('channels')
  data[1].reasons.typo = 'not a field'
  expect(() => parseChannels(data)).toThrow(/reason/)
  delete data[1].reasons.typo
  data[1].reasons.medaFile = ' '
  expect(() => parseChannels(data)).toThrow(/reason/)
})

test('rejects duplicate ids and invalid field types instead of coercing them', () => {
  const channels = raw('channels')
  channels[1].id = channels[0].id
  expect(() => parseChannels(channels)).toThrow(/duplicate/)
  const settings = raw('pod_settings')
  settings.sunEventLux.value = '400'
  expect(() => parsePodSettings(settings)).toThrow(/number/)
})

test('checks site coordinates, real UTC dates and ordered exclusion intervals', () => {
  for (const changes of [{ lat: 91 }, { start: '2026-11-31T00:00:00Z' }, { exclude: [{ start: '2026-11-14T03:00:00Z', end: '2026-11-14T02:00:00Z' }] }]) {
    expect(() => parsePodSite({ ...raw('pod_site'), ...changes })).toThrow(RegistryError)
  }
  const site = raw('pod_site')
  site.exclude = [{ start: '2026-11-14T02:00:00Z', end: '2026-11-14T03:00:00Z' }]
  expect(parsePodSite(site).exclude).toEqual(site.exclude)
})

test('preserves an explicitly missing field site without substituting defaults', () => {
  const site = { lat: null, lon: null, start: null, exclude: [], status: 'needs_human', reasons: { lat: 'Team input pending', lon: 'Team input pending', start: 'Team input pending' } }
  expect(parsePodSite(site)).toEqual(site)
  delete (site.reasons as Partial<typeof site.reasons>).lat
  expect(() => parsePodSite(site)).toThrow(/lat/)
})

test.each(parsers)('%s rejects a wrong root type', (_name, parse) => {
  expect(() => parse(null)).toThrow(RegistryError)
})
