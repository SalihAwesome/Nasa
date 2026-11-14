import { readFileSync } from 'node:fs'
import { renderToStaticMarkup } from 'react-dom/server'
import { expect, test } from 'vitest'
import satellite from '../../public/data/earth/pod-site-satellite.json'
import meda from '../../public/data/mars/meda-sol-300.json'
import { loadSelectedCard, readCardSelection } from '../card/cardData'
import { importConfiguredPodLog, importPodLog } from './importLog'
import { buildChannelComparisons, loadCurveSources, localSolarHour, parseCurveSources } from './channelCurves'
import { ChannelCurves } from './ChannelCurvesPanel'

const csv = readFileSync(new URL('../../public/data/sim/pod-sim.csv', import.meta.url), 'utf8')
const log = importConfiguredPodLog(csv)
const sources = parseCurveSources(satellite, meda)
const cloneSatellite = () => JSON.parse(JSON.stringify(satellite))
const cloneMeda = () => JSON.parse(JSON.stringify(meda))

const assets: typeof fetch = async input => {
  const path = String(input).replace(/^.*?data\//, 'data/')
  if (path === 'data/pod/qatar.csv') return new Response(null, { status: 404 })
  return new Response(new Uint8Array(readFileSync(new URL(`../../public/${path}`, import.meta.url))))
}

test('U21 renders six simulated channel charts with exactly the U22 card gaps and bases', async () => {
  const loaded = await loadCurveSources(undefined, assets)
  const charts = buildChannelComparisons(log, loaded)
  const card = await loadSelectedCard(readCardSelection('#/card/pod'), path => assets(path))
  const html = renderToStaticMarkup(<ChannelCurves log={log} sources={loaded} />)
  expect(html.match(/<figure /g)).toHaveLength(6)
  expect(html.match(/evidence-tag--simulated/g)).toHaveLength(6)
  for (const chart of charts) {
    const row = card.rows.find(row => row.id === chart.id)
    expect(chart.errorBar).toEqual(row?.errorBar)
    const figure = html.split(`data-channel="${chart.id}"`)[1]?.split('</figure>')[0] ?? ''
    if (chart.errorBar.kind !== 'missing') {
      expect(figure).toContain(`data-chart-gap="${chart.errorBar.gap}"`)
      expect(figure).toContain(chart.errorBar.basis)
    }
    expect(figure).toContain('monthly climatology, 2001 to 2025')
  }
  const reflectivity = charts.find(chart => chart.id === 'reflectivity')
  if (reflectivity?.errorBar.kind !== 'gap') throw new Error('Expected the real reflectivity comparison gap')
  expect(reflectivity.errorBar.gap).toBeCloseTo(Math.abs(0.3 - satellite.channels.reflectivity.cardNumber.value))
  console.info(`U21 renders ${charts.length} charts. Reflectivity chart and U22 card gap both equal ${reflectivity.errorBar.gap}, basis ${reflectivity.errorBar.basis}.`)
})

test('solar hours use UTC and longitude, wrap at midnight and support west longitude', () => {
  expect(localSolarHour(Date.parse('2026-11-14T00:00:00Z'), 51.5)).toBeCloseTo(51.5 / 15)
  expect(localSolarHour(Date.parse('2026-11-14T23:00:00Z'), 51.5)).toBeCloseTo((23 + 51.5 / 15) % 24)
  expect(localSolarHour(Date.parse('2026-11-14T00:00:00Z'), -30)).toBe(22)
})

test('uses tg for the ground curve and preserves excluded pod intervals and night reflectivity', () => {
  const excluded = importPodLog(csv, [{ start: '2026-11-14T09:00:00Z', end: '2026-11-14T09:10:00Z' }])
  const charts = buildChannelComparisons(excluded, sources)
  const ground = charts.find(chart => chart.id === 'ground_temp')
  const first = log.records[0]
  expect(ground?.pod.points.find(point => Math.abs(point.hour - localSolarHour(Date.parse(first.ts), 51.5)) < 1e-10)?.value).toBe(first.tg)
  expect(ground?.pod.points.some(point => point.value === null && point.reason === 'No pod record in this interval.')).toBe(true)
  const reflectivity = charts.find(chart => chart.id === 'reflectivity')
  expect(reflectivity?.pod.points.some(point => point.value === null && point.reason === 'Below daylight threshold')).toBe(true)
  for (const chart of charts) {
    expect(chart.pod.points.every((point, index, points) => point.hour >= 0 && point.hour < 24 && (index === 0 || point.hour > points[index - 1].hour))).toBe(true)
  }
})

test('a partial recording crossing solar midnight keeps the unrecorded hours as a gap', () => {
  const partial = { ...log, records: log.records.filter(record => record.ts >= '2026-11-14T19:00:00Z' && record.ts <= '2026-11-14T21:00:00Z') }
  const ground = buildChannelComparisons(partial, sources).find(chart => chart.id === 'ground_temp')
  const points = ground?.pod.points ?? []
  expect(points.some(point => point.value === null && point.reason === 'No pod record in this interval.')).toBe(true)
  expect(points.filter(point => point.value !== null)).toHaveLength(partial.records.length)
})

test('satellite hours must belong to the recording window stated in the cache', () => {
  const raw = JSON.parse(readFileSync(new URL('../../../pipeline/tests/fixtures/power-point-hourly-20261109.json', import.meta.url), 'utf8'))
  const data = cloneSatellite()
  data.channels.ground_temp.hourly = Object.entries(raw.properties.parameter.TS).map(([key, value]) => ({
    ts: `${key.slice(0, 4)}-${key.slice(4, 6)}-${key.slice(6, 8)}T${key.slice(8, 10)}:00:00Z`, value,
  }))
  expect(() => parseCurveSources(data, meda)).toThrow(/recording window/)
})

test('uses saved MEDA LMST bins with gaps, missing-channel reasons and separate pressure and unknown-unit axes', () => {
  const charts = buildChannelComparisons(log, sources)
  const pressure = charts.find(chart => chart.id === 'pressure')
  expect(pressure?.separateMedaAxis).toBe(true)
  expect(pressure?.meda.points[0]).toMatchObject({ hour: meda.channels.pressure.bins[0].lmstHour, value: meda.channels.pressure.bins[0].value })
  expect(pressure?.meda.points.some(point => point.value === null && point.reason)).toBe(true)
  const humidity = charts.find(chart => chart.id === 'humidity')
  expect(humidity?.medaUnit).toBeNull()
  expect(humidity?.separateMedaAxis).toBe(true)
  expect(humidity?.meda.note).toBe(meda.channels.humidity.reasons.unit)
  for (const id of ['uv', 'reflectivity']) {
    const chart = charts.find(chart => chart.id === id)
    expect(chart?.meda.points).toEqual([])
    expect(chart?.meda.note?.length).toBeGreaterThan(0)
  }
})

test('missing MEDA channels show their reason without a legend key suggesting a plotted curve', () => {
  const html = renderToStaticMarkup(<ChannelCurves log={log} sources={sources} />)
  for (const id of ['uv', 'reflectivity']) {
    const figure = html.split(`data-channel="${id}"`)[1]?.split('</figure>')[0] ?? ''
    expect(figure).not.toContain('class="channel-source-2"')
    expect(figure).toContain(sources.meda[id].note)
  }
})

test('a partial recording crossing midnight keeps the unobserved solar-time interval missing', () => {
  const partial = { ...log, records: log.records.filter(record => record.ts >= '2026-11-14T18:00:00Z') }
  const chart = buildChannelComparisons(partial, sources).find(chart => chart.id === 'ground_temp')
  expect(partial.records).toHaveLength(361)
  const startOfMissingInterval = localSolarHour(Date.parse('2026-11-15T00:00:00Z'), 51.5)
  expect(chart?.pod.points.some(point => point.hour > startOfMissingInterval && point.hour < 21 && point.value === null)).toBe(true)
})

test('uses captured POWER hourly values only for their own recording window', () => {
  const raw = JSON.parse(readFileSync(new URL('../../../pipeline/tests/fixtures/power-point-hourly-20261109.json', import.meta.url), 'utf8'))
  const data = cloneSatellite()
  const hourly = Object.entries(raw.properties.parameter.TS).map(([key, value]) => ({
    ts: `${key.slice(0, 4)}-${key.slice(4, 6)}-${key.slice(6, 8)}T${key.slice(8, 10)}:00:00Z`, value,
  }))
  data.site.start = hourly[0].ts
  data.channels.ground_temp.hourly = hourly
  const values = hourly.map(point => Number(point.value))
  data.channels.ground_temp.cardNumber = { value: Math.max(...values) - Math.min(...values), basis: 'same day' }
  delete data.channels.ground_temp.reason
  const parsed = parseCurveSources(data, meda)
  // A shifted simulator log stays explicitly marked simulated.
  const shifted = importConfiguredPodLog(csv.replaceAll('2026-11-14', '2026-11-09').replaceAll('2026-11-15', '2026-11-10'))
  const chart = buildChannelComparisons(shifted, parsed).find(chart => chart.id === 'ground_temp')
  expect(chart?.satellite.label).toBe('NASA POWER, same day')
  expect(chart?.satellite.points).toHaveLength(24)
  expect(chart?.satellite.points.find(point => Math.abs(point.hour - 51.5 / 15) < 1e-10)?.value).toBe(raw.properties.parameter.TS['2026110900'])
  const otherDay = buildChannelComparisons(log, parsed).find(chart => chart.id === 'ground_temp')
  expect(otherDay?.satellite.label).toBe('monthly climatology, 2001 to 2025')
  expect(otherDay?.satellite.note).toContain('does not match')
  expect(otherDay?.gapReferenceNote).toContain('2026-11-09T00:00:00Z')
  data.channels.ground_temp.hourly[1].ts = data.channels.ground_temp.hourly[0].ts
  expect(() => parseCurveSources(data, meda)).toThrow(/consecutive/)
})

test('empty logs retain all six charts with missing card-gap reasons', () => {
  const empty = { ...log, records: [] }
  const charts = buildChannelComparisons(empty, sources)
  expect(charts).toHaveLength(6)
  expect(charts.every(chart => chart.pod.points.length === 0 && chart.errorBar.kind === 'missing')).toBe(true)
  expect(renderToStaticMarkup(<ChannelCurves log={empty} sources={sources} />)).toContain('No pod records in the log')
})

test('rejects malformed references, a missing reason and incomplete or nonconsecutive hourly data', () => {
  // Simulated malformed copies of saved reference data exercise the input boundary.
  const missingReason = cloneSatellite()
  delete missingReason.channels.uv.reason
  expect(() => parseCurveSources(missingReason, meda)).toThrow(/reason/)
  const incomplete = cloneSatellite()
  incomplete.channels.ground_temp.hourly = []
  expect(() => parseCurveSources(incomplete, meda)).toThrow(/24 hours/)
  const wrongClock = cloneMeda()
  wrongClock.timeScale = 'UTC'
  expect(() => parseCurveSources(satellite, wrongClock)).toThrow(/LMST/)
  const blankUnit = cloneMeda()
  delete blankUnit.channels.humidity.reasons.unit
  expect(() => parseCurveSources(satellite, blankUnit)).toThrow(/reason/)
})
