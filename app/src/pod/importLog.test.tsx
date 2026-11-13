/// <reference types="node" />

import { readFileSync } from 'node:fs'
import { renderToStaticMarkup } from 'react-dom/server'
import { expect, test, vi } from 'vitest'
import { importPodLog, fetchPodLog } from './importLog'
import { PodLogSummary } from './PodLogPanel'

const csv = readFileSync(new URL('../../public/data/sim/pod-sim.csv', import.meta.url), 'utf8')
const log = importPodLog(csv, [])

test('imports and labels all 1,440 simulated records', () => {
  expect(log).toMatchObject({ simulated: true, goodLines: 1440, badLines: 0, excludedLines: 0 })
  expect(log.records).toHaveLength(1440)
  expect(log.header).toMatchObject({
    pole_height_m: 1, tilt_deg: 30, facing_deg: 180, refl_factor: 0.27,
    ta_offset_c: 0.5, lux_max: 120000,
  })
  const summary = renderToStaticMarkup(<PodLogSummary log={log} />)
  expect(summary).toContain('simulated')
  expect(summary).toContain('1440 good lines')
})

test('computes daylight reflectivity and explains missing night readings', () => {
  const daylight = log.records.find(row => row.ts === '2026-11-14T08:19:00Z')
  expect(daylight?.reflectivity.value).toBeCloseTo(0.30, 2)
  expect(log.records[0].reflectivity).toEqual({ value: null, reason: 'Below daylight threshold' })
})

test('applies and labels defaults for missing header calibration', () => {
  const uncalibrated = importPodLog(csv.replace(/^# refl_factor=.*\r?\n/m, '')
    .replace(/^# ta_offset_c=.*\r?\n/m, '# ta_offset_c=\n'), [])
  expect(uncalibrated.header.refl_factor).toBeNull()
  expect(uncalibrated.calibration).toEqual({
    reflectivity: { value: 0.27, status: 'default', note: 'correction factor not measured' },
    airTemperature: { value: 0, status: 'default', note: 'offset not measured' },
  })
  expect(uncalibrated.records.find(row => row.ts === '2026-11-14T08:19:00Z')
    ?.reflectivity.value).toBeCloseTo(0.30, 2)
})

test('counts bad lines and drops records in the excluded UTC range', () => {
  const result = importPodLog(csv.trimEnd() + '\nboot text\n', [
    { start: '2026-11-14T08:19:00Z', end: '2026-11-14T08:20:00Z' },
  ])
  expect(result).toMatchObject({ goodLines: 1440, badLines: 1, excludedLines: 2 })
  expect(result.records).toHaveLength(1438)
  expect(result.records.some(row => row.ts === '2026-11-14T08:19:00Z')).toBe(false)
})

test('uses the header saturation threshold and preserves missing light readings', () => {
  const input = csv.replace('# lux_max=120000', '# lux_max=80000')
    .replace('80000.000000,6480.000000', '80000.000000,')
  const saturated = importPodLog(input, [])
  expect(saturated.records.find(row => row.ts === '2026-11-14T08:19:00Z')?.reflectivity)
    .toEqual({ value: null, reason: 'Up-facing light reading is saturated' })
  const missing = importPodLog(input.replace('# lux_max=80000', '# lux_max=120000'), [])
  expect(missing.records.find(row => row.ts === '2026-11-14T08:19:00Z')?.reflectivity)
    .toEqual({ value: null, reason: 'Missing light reading' })
})

test('prefers the field log and falls back only when it is absent', async () => {
  const field = new Response(csv.replace(/^# simulated=true\r?\n/, ''))
  const fetcher = vi.fn<typeof fetch>().mockResolvedValueOnce(field)
    .mockResolvedValueOnce(new Response(null, { status: 404 }))
    .mockResolvedValueOnce(new Response(csv))
    .mockResolvedValueOnce(new Response(null, { status: 500 }))
  expect((await fetchPodLog(undefined, fetcher)).simulated).toBe(false)
  expect((await fetchPodLog(undefined, fetcher)).simulated).toBe(true)
  await expect(fetchPodLog(undefined, fetcher)).rejects.toThrow('500')
  const base = import.meta.env.BASE_URL
  expect(fetcher.mock.calls.map(([url]) => url)).toEqual([
    base + 'data/pod/qatar.csv', base + 'data/pod/qatar.csv',
    base + 'data/sim/pod-sim.csv', base + 'data/pod/qatar.csv',
  ])
})

test('treats a static host HTML fallback as a missing field CSV', async () => {
  const fetcher = vi.fn<typeof fetch>()
    .mockResolvedValueOnce(new Response('<html></html>', { headers: { 'content-type': 'text/html' } }))
    .mockResolvedValueOnce(new Response(csv))
  expect((await fetchPodLog(undefined, fetcher)).goodLines).toBe(1440)
})
