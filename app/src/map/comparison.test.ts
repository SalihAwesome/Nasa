import { beforeAll, expect, test, vi } from 'vitest'
import { readFileSync } from 'node:fs'
import { loadMapData } from './data'
import type { MapData } from './data'
import { readLocation, referenceLocations } from './comparison'
import { globePoint } from './surface'

let data: MapData
beforeAll(async () => {
  vi.stubGlobal('fetch', async (path: string) => new Response(new Uint8Array(readFileSync(
    new URL('../../public/' + path.replace(/^.*?data\//, 'data/'), import.meta.url),
  ))))
  try { data = await loadMapData() } finally { vi.unstubAllGlobals() }
})

test('Moon and Mars references use east-positive display longitude', () => {
  const references = referenceLocations(data)
  expect(references.find(item => item.body === 'mars')?.lat).toBe(18.44)
  expect(references.find(item => item.body === 'mars')?.lon).toBeCloseTo(77.45, 8)
  expect(references.find(item => item.body === 'moon')?.lat).toBe(-89.45)
  expect(references.find(item => item.body === 'moon')?.lon).toBeCloseTo(-137.31, 8)
})

test('arbitrary Moon and Mars points keep local data missing', () => {
  for (const body of ['moon', 'mars'] as const) {
    const location = { body, lat: 0, lon: 0, name: 'Selected point' }
    const result = readLocation(data, location, 1)
    expect(Object.values(result.readings).every(item => item.value === null && item.reason?.includes('No local dataset') && item.supplement === undefined)).toBe(true)
  }
})

test('Jezero humidity uses the documented unit while the original XML-derived card is preserved', () => {
  const reference = referenceLocations(data).find(item => item.body === 'mars')
  if (!reference) throw new Error('Mars reference is missing')
  const result = readLocation(data, reference, 1)
  expect(data.targetNumbers.jezero.humidity.unit).toBeNull()
  expect(result.readings.humidity.unit).toBe('%')
  expect(result.readings.humidity.evidence?.source).toContain('10.1029/2022JE007537')
  expect(result.readings.humidity.basis).toBe('Relative to ice')
  expect(result.readings.ground_temp.value).toBe(data.targetNumbers.jezero.ground_temp.value)
  expect(result.readings.peak_elevation.value).toBe(data.targetNumbers.jezero.peak_elevation.value)
})

test('Jezero supplemental products keep the missing scored measurements null', () => {
  const reference = referenceLocations(data).find(item => item.body === 'mars')
  if (!reference) throw new Error('Mars reference is missing')
  const readings = readLocation(data, reference, 1).readings
  for (const id of ['uv', 'reflectivity'] as const) {
    expect(readings[id].value).toBeNull()
    expect(data.targetNumbers.jezero[id].value).toBeNull()
    expect(readings[id].supplement).toEqual(data.comparisonEvidence?.supplements[id])
  }
})

test('both sides of an Earth pair read their own grid values', () => {
  const points = data.cells.filter(item => (item.lat === 25.5 && item.lon === 51.25) || (item.lat === -24 && item.lon === -70))
  expect(points).toHaveLength(2)
  for (const point of points) {
    const result = readLocation(data, { body: 'earth', name: 'Selected cell', ...point }, 1)
    expect(result.cell).not.toBeNull()
    if (result.cell === null) throw new Error('Land cell is missing')
    expect(result.readings.air_temp.value).toBe(data.months[0].layers.air_temp.values[result.cell])
  }
})

test('globe click coordinates match the camera and ignore space outside the sphere', () => {
  const camera = { lat: 25, lon: 51, zoom: 1 }
  const center = globePoint(camera, 600, 400, 300, 200)
  expect(center?.lat).toBeCloseTo(25, 9)
  expect(center?.lon).toBeCloseTo(51, 9)
  expect(globePoint(camera, 600, 400, 0, 0)).toBeNull()
  const east = globePoint(camera, 600, 400, 330, 200)
  expect(east?.lon).toBeGreaterThan(51)
})
