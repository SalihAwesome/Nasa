import { beforeAll, expect, test, vi } from 'vitest'
import { readFileSync } from 'node:fs'
import { renderToStaticMarkup } from 'react-dom/server'
import { loadMapData } from './data'
import type { MapData } from './data'
import { missionNumbers, missionReference } from './missionTarget'
import { samplePlanetary } from '../data/planetary'
import { cardHash, loadSelectedCard, readCardSelection } from '../card/cardData'
import { computeScores } from './model'
import { FidelityCard } from '../card/FidelityCard'
import { TargetPicker } from './TargetPicker'
import definitions from '../../../shared/tests.json'

const assets = async (path: string) => new Response(new Uint8Array(readFileSync(new URL(
  '../../public/' + path.replace(/^.*?data\//, 'data/'), import.meta.url,
))))
let data: MapData
beforeAll(async () => {
  vi.stubGlobal('fetch', assets)
  try { data = await loadMapData() } finally { vi.unstubAllGlobals() }
})

test.each(['moon', 'mars'] as const)('%s selection has global terrain and Sun coverage with no weather substitution', body => {
  const reference = missionReference(data, body)
  const id = body === 'mars' ? 'jezero' : 'shackleton'
  expect(missionNumbers(data, body, reference)).toBe(data.targetNumbers[id])
  for (const point of [{ lat: 35, lon: -110 }, { lat: -45, lon: 120 }, { lat: 90, lon: 180 }, { lat: -90, lon: -180 }]) {
    const numbers = missionNumbers(data, body, point)
    expect(numbers.slope.value).toBeGreaterThanOrEqual(0)
    expect(numbers.roughness.value).toBeGreaterThanOrEqual(0)
    expect(numbers.peak_elevation.value).not.toBeNull()
    expect(numbers.ground_temp.value).toBeNull()
    expect(numbers.uv.value).toBeNull()
    expect(numbers.ground_temp.reason).toContain('not substituted')
  }
  expect(samplePlanetary(data.planetary, body, { lat: 0, lon: 180 }).values)
    .toEqual(samplePlanetary(data.planetary, body, { lat: 0, lon: -180 }).values)
  const equator = missionNumbers(data, body, { lat: 0, lon: 0 }).peak_elevation.value
  const polar = missionNumbers(data, body, { lat: 80, lon: 0 }).peak_elevation.value
  if (equator === null || polar === null) throw new Error('Global solar geometry is missing')
  expect(Math.abs(equator - polar)).toBeGreaterThan(1)
})

test.each((['moon', 'mars'] as const).flatMap(body => definitions.map(definition => ({ body, definition }))))('$body $definition.id ranked links preserve the point and the card score', async ({ body, definition }) => {
  const point = { lat: 35, lon: -110 }
  const id = body === 'mars' ? 'jezero' : 'shackleton'
  const index = data.cells.findIndex((_, i) => ['slope', 'roughness', 'bare_ground'].every(key => data.months[2].layers[key].values[i] !== null))
  expect(index).toBeGreaterThanOrEqual(0)
  const selection = readCardSelection(cardHash({ site: { kind: 'cell', index }, target: id, test: definition.id, month: 3, targetPoint: point }))
  expect(selection.targetPoint).toEqual(point)
  const card = await loadSelectedCard(selection, assets)
  expect(card.targetPoint).toEqual(point)
  expect(card.targetSol).toBeUndefined()
  const month = data.months[2]
  const one = { ...month, cellCount: 1, layers: Object.fromEntries(Object.entries(month.layers).map(([id, row]) => [id, { ...row, values: [row.values[index]] }])) }
  const scores = computeScores(one, data.targets.find(row => row.id === id)!, missionNumbers(data, body, point), definition)
  expect(card.combined.score).toBe(scores[0].score)
  expect(typeof card.combined.score).toBe('number')
  expect(card.combined.missing).toEqual(scores[0].missing)
  const html = renderToStaticMarkup(<FidelityCard card={card} />)
  expect(html).toContain(body === 'mars' ? 'Mars · 35.0000°' : 'Moon · 35.0000°')
  expect(html).toContain('targetLat=35')
})

test('target picker names each starting location without a default suffix', () => {
  for (const body of ['moon', 'mars'] as const) {
    const html = renderToStaticMarkup(<TargetPicker data={data} body={body} point={missionReference(data, body)} onChange={() => {}} />)
    expect(html).toContain(body === 'mars' ? 'Jezero crater' : 'Shackleton Connecting Ridge')
    expect(html).toContain('aria-pressed="true"')
    expect(html).not.toContain('(default)')
  }
})

test('malformed or partial target coordinates cannot silently become a different mission point', () => {
  for (const query of ['targetLat=35', 'targetLon=-110', 'targetLat=&targetLon=0', 'targetLat=NaN&targetLon=0', 'targetLat=91&targetLon=0']) {
    expect(() => readCardSelection('#/card/cell/0?' + query)).toThrow()
  }
})
