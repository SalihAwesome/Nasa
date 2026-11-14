import { readFileSync } from 'node:fs'
import { expect, test } from 'vitest'
import { loadTerrainData } from './terrain'

const file = (path: string) => readFileSync(new URL(`../../public/${path.replace('./', '')}`, import.meta.url))
const manifest = JSON.parse(file('data/terrain/manifest.json').toString())
const assets = async (path: string) => new Response(new Uint8Array(file(path)))

test('real terrain grid has numeric regional targets and missing values remain null', async () => {
  const data = await loadTerrainData({ cellCount: manifest.cellCount, baseUrl: './data/', fetcher: assets })
  expect(Object.keys(data.layers)).toEqual(['slope', 'roughness', 'bare_ground'])
  expect(data.targets.jezero.slope.value).toBeCloseTo(0.79030788)
  expect(data.targets.jezero.roughness.value).toBeCloseTo(157.28988779)
  expect(data.targets.shackleton.bare_ground.value).toBe(100)
  expect(data.layers.bare_ground.values).toContain(null)
  expect(data.layers.slope.values.some(value => value !== null && value > 0)).toBe(true)
})

test('wrong-grid and simulated terrain are rejected rather than silently producing rankings', async () => {
  for (const changed of [{ ...manifest, cellsSha256: '0'.repeat(64) }, { ...manifest, simulated: true }]) {
    await expect(loadTerrainData({ cellCount: manifest.cellCount, baseUrl: './data/', fetcher: path => path.endsWith('manifest.json')
      ? Promise.resolve(new Response(JSON.stringify(changed))) : assets(path) })).rejects.toThrow()
  }
})
