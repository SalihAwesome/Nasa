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
    expect(Object.values(result.readings).every(item => item.value === null && item.reason?.includes('No local dataset'))).toBe(true)
  }
})

test('Jezero reference values retain unknown units and the saved source values', () => {
  const reference = referenceLocations(data).find(item => item.body === 'mars')
  if (!reference) throw new Error('Mars reference is missing')
  const result = readLocation(data, reference, 1)
  expect(result.readings.humidity.unit).toBeNull()
  expect(result.readings.ground_temp.value).toBe(data.targetNumbers.jezero.ground_temp.value)
  expect(result.readings.peak_elevation.value).toBe(data.targetNumbers.jezero.peak_elevation.value)
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
