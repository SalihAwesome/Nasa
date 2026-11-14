import { readFileSync } from 'node:fs'
import { renderToStaticMarkup } from 'react-dom/server'
import { expect, test } from 'vitest'
import App from '../App'
import { TestSelector } from '../mobility/TestSelector'
import { decodeCells, parseEarthManifest } from './earth'
import { loadTargetSettings, parseTargets } from './targets'
import tests from '../../../shared/tests.json'
import { decodeMobilityMonth, loadMobilityMonth, parseMobilityManifest } from './mobility'

const file = (name: string) => readFileSync(new URL(`../../public/data/earth/${name}`, import.meta.url))
const buffer = (name: string) => new Uint8Array(file(name)).buffer
const earth = parseEarthManifest(JSON.parse(file('manifest.json').toString()))

test('U31: the January dryness of the pod cell reads back as 0.26 within its scale', () => {
  const manifest = parseMobilityManifest(JSON.parse(file('mobility-manifest.json').toString()), earth)
  const cells = decodeCells(buffer(earth.cellsFile), earth)
  const index = cells.findIndex(cell => cell.lat === 25.5 && cell.lon === 51.25)
  expect(index).toBeGreaterThanOrEqual(0)
  const january = decodeMobilityMonth(buffer(manifest.monthFiles[0]), manifest, 1)
  const value = january.layers.dryness.values[index]
  expect(value).not.toBeNull()
  expect(Math.abs(value! - 0.26)).toBeLessThanOrEqual(manifest.quantities[0].scale)
  console.info(`U31 browser loader: January dryness ${value}; scale ${manifest.quantities[0].scale}; cell 25.5,51.25.`)
})

test('both targets retain sourced dryness and D20 defaults, and missing terrain keeps reasons', () => {
  for (const target of loadTargetSettings().targets) {
    expect(target.mobility?.dryness).toEqual({ value: 0, source: 'docs/project-brief.md', unit: '1', tolerance: { value: 0.2, status: 'default' }, scale: { value: 0.0001, status: 'default' } })
    for (const id of ['slope', 'roughness', 'bare_ground'] as const) {
      expect(target.mobility?.[id].value).toBeNull()
      expect(target.mobility?.[id].reason.length).toBeGreaterThan(0)
    }
  }
  const raw = JSON.parse(readFileSync(new URL('../../../shared/targets.json', import.meta.url), 'utf8'))
  delete raw[0].mobility.slope.reason
  expect(() => parseTargets(raw)).toThrow()
})

test('U31: the selector disables mobility with its actual reason for both targets', () => {
  const mobility = tests.find(test => test.id === 'mobility')!
  expect(mobility.enabled).toBe(false)
  for (const target of loadTargetSettings().targets) {
    const html = renderToStaticMarkup(<TestSelector value="power" target={target.id} onChange={() => {}} />)
    expect(html).toMatch(/<option value="mobility" disabled=""/)
    expect(html).toContain(mobility.reason)
    expect(html.match(/<option/g)).toHaveLength(5)
  }
  console.info(`U31 mobility selector: disabled — ${mobility.reason}`)
})

test('the site finder mounts the selector and its reason', () => {
  // The default route is the site finder, so no browser window is needed.
  const html = renderToStaticMarkup(<App />)
  expect(html).toContain(tests.find(test => test.id === 'mobility')!.reason)
})

test('loads shipped mobility assets locally and preserves the reserved fill as missing', async () => {
  const manifest = parseMobilityManifest(JSON.parse(file('mobility-manifest.json').toString()), earth)
  const requested: string[] = []
  const month = await loadMobilityMonth(1, { earthManifest: earth, baseUrl: './data/earth/', fetcher: async input => {
    const path = String(input); requested.push(path)
    return new Response(new Uint8Array(file(path.split('/').at(-1)!)))
  } })
  expect(month.cellCount).toBe(earth.cellCount)
  expect(requested).toEqual(['./data/earth/mobility-manifest.json', './data/earth/mobility-01.bin'])
  const simulated = { simulated: true, manifest: { ...manifest, cellCount: 1 }, bytes: new ArrayBuffer(2) }
  new DataView(simulated.bytes).setInt16(0, manifest.quantities[0].fillValue, true)
  const missing = decodeMobilityMonth(simulated.bytes, simulated.manifest, 1).layers.dryness
  expect(missing.values).toEqual([null])
  expect(missing.missingReason.length).toBeGreaterThan(0)
})
