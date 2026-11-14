import { readFileSync } from 'node:fs'
import { renderToStaticMarkup } from 'react-dom/server'
import { expect, test, vi, afterEach } from 'vitest'
import App from '../App'
import { SunComparison } from './SunPanel'
import { loadSunData, readSunSelection, selectEarth } from './sunData'
import type { SunNumbers } from './sunData'

const file = (name: string) => readFileSync(new URL('../../public/data/sun/' + name, import.meta.url))
const assets = (url: string) => Promise.resolve(new Response(new Uint8Array(file(url.split('/').at(-1)!))))
afterEach(() => vi.unstubAllGlobals())

const changedAsset = (name: string, change: (input: Record<string, unknown>) => unknown) => async (url: string) => {
  if (!url.endsWith('/' + name)) return assets(url)
  return new Response(JSON.stringify(change(JSON.parse(file(name).toString()))))
}

test('malformed target paths fail loading so the panel can offer recovery', async () => {
  await expect(loadSunData(changedAsset('shackleton.json', data => ({ ...data, rows: [] })))).rejects.toThrow('incomplete target path')
})

test('missing Earth metric rows fail loading before rendering a selection', async () => {
  await expect(loadSunData(changedAsset('earth-rows.json', data => ({ ...data, months: [] })))).rejects.toThrow('incomplete Earth metrics')
})

test('a missing polar-night metric needs its saved reason', async () => {
  await expect(loadSunData(changedAsset('earth-rows.json', data => {
    const months: SunNumbers[][] = JSON.parse(file('earth-rows.json').toString()).months
    months[0][360].low_sun_share = null
    delete months[0][360].reasons
    return { ...data, months }
  }))).rejects.toThrow()
})

test('polar night keeps missing metrics and their reasons visible', async () => {
  const data = await loadSunData(assets)
  const selection = { target: 'shackleton', lat: 90, month: 1 } as const
  const earth = selectEarth(data, selection)
  expect(earth.numbers.low_sun_share).toBeNull()
  expect(earth.numbers.horizon_sweep).toBeNull()
  const html = renderToStaticMarkup(<SunComparison data={data} selection={selection} />)
  const earthHTML = html.split('class="sun-chart sun-chart-earth"')[1]
  expect(earthHTML).toContain('The Sun does not rise.')
  expect(earthHTML).not.toContain('data-value="0"')
})

test.each([
  '#/sun?target=unknown&lat=NaN&month=13',
  '#/sun?lat=90.5&month=0',
  '#/sun?lat=-85.2&month=3.1',
])('invalid URL selections use the documented initial view (%s)', hash => {
  expect(readSunSelection(hash)).toEqual({ target: 'shackleton', lat: -85, month: 3 })
})

test('the Sun route accepts target, latitude and month from the hash', () => {
  const hash = '#/sun?target=shackleton&lat=-85&month=3'
  const original = Object.getOwnPropertyDescriptor(globalThis, 'window')
  Object.defineProperty(globalThis, 'window', { configurable: true, value: { location: { hash } } })
  try {
    const html = renderToStaticMarkup(<App />)
    expect(html).toContain('Sun panel')
    expect(html).toContain('Compare Sun paths')
    expect(html).toContain('value="-85" selected=""')
    expect(html).toContain('value="3" selected=""')
  } finally {
    if (original) Object.defineProperty(globalThis, 'window', original)
    else Reflect.deleteProperty(globalThis, 'window')
  }
})

test('the Earth readout preserves all three metrics from the selected file row', async () => {
  const data = await loadSunData(assets)
  const selection = readSunSelection('#/sun?target=shackleton&lat=-85&month=3')
  const earth = selectEarth(data, selection)
  const { months } = JSON.parse(file('earth-rows.json').toString())
  const expected = months[2][10]
  expect(earth.numbers).toEqual(expected)
  const html = renderToStaticMarkup(<SunComparison data={data} selection={selection} />)
  expect(html).toContain(`data-metric="peak_elevation" data-value="${expected.peak_elevation}"`)
  expect(html).toContain(`data-metric="low_sun_share" data-value="${expected.low_sun_share}"`)
  expect(html).toContain(`data-metric="horizon_sweep" data-value="${expected.horizon_sweep}"`)
})

test('the decoded paths preserve compass coverage and the signed Earth binary', async () => {
  const data = await loadSunData(assets)
  const moon = data.targets.shackleton.rows
  expect(moon).toHaveLength(721)
  expect(moon.every(point => point.elevation >= 0 && point.elevation <= 3)).toBe(true)
  expect(Math.max(...moon.map(p => p.azimuth)) - Math.min(...moon.map(p => p.azimuth))).toBeGreaterThan(350)
  const earth = selectEarth(data, { target: 'shackleton', lat: -90, month: 1 })
  const raw = file('earth-paths.bin')
  expect(raw.readInt16LE(0)).toBeLessThan(0)
  expect(earth.rows[0].azimuth).toBeCloseTo(360 + raw.readInt16LE(0) / 100, 8)
  expect(earth.rows[0].elevation).toBe(raw.readInt16LE(2) / 100)
  expect(earth.rows).toHaveLength(48)
})
