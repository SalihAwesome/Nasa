import { readFileSync } from 'node:fs'
import { expect, test } from 'vitest'
import { decodeCells, decodeMonth, loadMonth, parseEarthManifest } from './earth'

const rawManifest = () => JSON.parse(readFileSync(new URL('../../public/data/earth/manifest.json', import.meta.url), 'utf8'))
const fileBuffer = (name: string) => Uint8Array.from(readFileSync(new URL(`../../public/data/earth/${name}`, import.meta.url))).buffer

test('reads the real Python-packed known cell with each value within its scale', () => {
  const manifest = parseEarthManifest(rawManifest())
  const cells = decodeCells(fileBuffer('cells.bin'), manifest)
  const index = cells.findIndex(cell => cell.lat === 25.5 && cell.lon === 51.25)
  expect(index).toBeGreaterThanOrEqual(0)
  const month = decodeMonth(fileBuffer('month-01.bin'), manifest, 1)
  const expected: Record<string, number> = { ground_temp: 13.52, reflectivity: 0.13, uv: 0.81, air_temp: 17.51, pressure: 1016.2 }
  for (const quantity of manifest.quantities) {
    if (quantity.id in expected) {
      const value = month.layers[quantity.id].values[index]
      expect(value).not.toBeNull()
      expect(Math.abs(value! - expected[quantity.id])).toBeLessThanOrEqual(quantity.scale)
    }
  }
  expect(cells.some(cell => cell.lat === 0 && cell.lon === -140)).toBe(false)
  expect(cells.some(cell => cell.lat === -89.5 && cell.lon === 0)).toBe(true)
  expect(month.layers.reflectivity.values).toContain(null)
  expect(month.layers.reflectivity.missingReason.length).toBeGreaterThan(0)
})

test('loadMonth fetches the manifest and the selected local binary', async () => {
  const requested: string[] = []
  const fetcher: typeof fetch = async input => {
    const path = String(input)
    requested.push(path)
    return new Response(path.endsWith('manifest.json') ? JSON.stringify(rawManifest()) : fileBuffer('month-01.bin'))
  }
  const month = await loadMonth(1, { fetcher, baseUrl: './data/earth/' })
  expect(month.month).toBe(1)
  expect(month.cellCount).toBe(rawManifest().cellCount)
  expect(requested).toEqual(['./data/earth/manifest.json', './data/earth/month-01.bin'])
})

test('rejects malformed lengths, invalid scale and unsupported byte order', () => {
  const manifest = parseEarthManifest(rawManifest())
  expect(() => decodeCells(new ArrayBuffer(1), manifest)).toThrow()
  expect(() => decodeMonth(new ArrayBuffer(1), manifest, 1)).toThrow()
  const scale = rawManifest()
  scale.quantities[0].scale = 0
  expect(() => parseEarthManifest(scale)).toThrow()
  const endian = rawManifest()
  endian.byteOrder = 'big'
  expect(() => parseEarthManifest(endian)).toThrow()
})

test('rejects bad months before any request and reports HTTP errors', async () => {
  let calls = 0
  const fetcher: typeof fetch = async () => { calls++; return new Response('Simulated HTTP failure', { status: 503 }) }
  await expect(loadMonth(0, { fetcher })).rejects.toThrow()
  expect(calls).toBe(0)
  await expect(loadMonth(1, { fetcher })).rejects.toThrow(/503/)
})
