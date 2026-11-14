import { readFileSync } from 'node:fs'
import { afterEach, expect, test, vi } from 'vitest'
import { loadMapData } from './data'
import { computeScores, rankCells } from './model'
import { buildCard, loadCardData, loadSelectedCard } from '../card/cardData'
import type { CardSelection } from '../card/cardData'
import definitions from '../../../shared/tests.json'
import { renderToStaticMarkup } from 'react-dom/server'
import { CardPanel, FidelityCard } from '../card/FidelityCard'

const assets = async (input: string) => {
  const path = input.replace(/^.*?data\//, 'data/')
  try { return new Response(new Uint8Array(readFileSync(new URL(`../../public/${path}`, import.meta.url)))) }
  catch { return new Response(null, { status: 404 }) }
}
afterEach(() => vi.unstubAllGlobals())

test.each(['mobility', 'communications', 'navigation', 'science_tools'])('%s map and card comparisons agree for both targets and every month', async testId => {
  vi.stubGlobal('fetch', assets)
  const data = await loadMapData()
  const podIndex = data.cells.findIndex(cell => cell.lat === 25.5 && cell.lon === 51.25)
  const index = data.cells.findIndex((_, index) => ['slope', 'roughness', 'bare_ground'].every(id => data.months[0].layers[id].values[index] !== null))
  expect(index).toBeGreaterThanOrEqual(0)
  expect(data.months[0].layers.dryness.values[podIndex]).toBeCloseTo(0.26)
  for (const target of data.targets) {
    const definition = definitions.find(test => test.id === testId)!
    for (const month of data.months) {
      const selection: CardSelection = { site: { kind: 'cell', index }, target: target.id, test: testId, month: month.month }
      const card = buildCard(await loadCardData(selection, assets), selection)
      const selectedMonth = { ...month, cellCount: 1, layers: Object.fromEntries(Object.entries(month.layers).map(([id, layer]) => [id, { ...layer, values: [layer.values[index]] }])) }
      const result = computeScores(selectedMonth, target, data.targetNumbers[target.id], definition)[0]
      if (month.month === 1) {
        const global = computeScores(month, target, data.targetNumbers[target.id], definition)
        expect(global[index].score).toBe(result.score)
        expect(rankCells(global)).toHaveLength(20)
      }
      expect(typeof result.score).toBe('number')
      expect(card.combined.score).toBeCloseTo(result.score!)
      expect(card.combined.missing).toEqual(result.missing)
      expect(card.test.enabled).toBe(true)
      if (testId === 'science_tools') {
        expect(card.rows.find(row => row.id === 'dryness')?.counts).toBe(true)
        expect(result.missing).toContain('uv')
      }
    }
  }
  const mobility = definitions.find(test => test.id === 'mobility')!
  const withoutSlope = { ...data.months[0], layers: { ...data.months[0].layers, slope: { unit: 'degrees', values: Array(data.cells.length).fill(null), missingReason: 'Simulated source outage' } } }
  expect(computeScores(withoutSlope, data.targets[0], data.targetNumbers[data.targets[0].id], mobility).every(cell => cell.score === null && cell.missing.includes('slope'))).toBe(true)
  // Missing science evidence stays missing rather than turning into zero.
  const definition = definitions.find(test => test.id === 'science_tools')!
  const unavailable = computeScores(data.months[0], data.targets[0], {}, definition)
  expect(unavailable.every(cell => cell.score === null)).toBe(true)
}, 30000)

test('U22 science comparison reuses measured channels while identifying dryness as an estimate', async () => {
  const card = await loadSelectedCard({ site: { kind: 'pod' }, target: 'jezero', test: 'science_tools', month: 1 }, assets)
  expect(card.rows.filter(row => row.evidence === 'measured')).toHaveLength(6)
  expect(card.rows.find(row => row.id === 'ground_temp')?.counts).toBe(true)
  const dryness = card.rows.find(row => row.id === 'dryness')!
  expect(dryness.evidence).toBe('estimate')
  expect(dryness.earth.value).toBeCloseTo(0.26)
  expect(typeof card.combined.score).toBe('number')
})

test('the score card displays 0.372 as 37.2% and option names have no partial suffix', async () => {
  const card = await loadSelectedCard({ site: { kind: 'pod' }, target: 'jezero', test: 'navigation', month: 1 }, assets)
  const simulated = { ...card, simulated: true, combined: { ...card.combined, score: 0.372 } }
  const html = renderToStaticMarkup(<FidelityCard card={simulated} />)
  expect(html).toContain('37.2%')
  expect(html).toContain('Overall navigation match')
  expect(html).toContain('not a probability of mission success')
  expect(html).toContain('class="match-meter"')
  const controls = renderToStaticMarkup(<CardPanel hash="#/card/pod?test=navigation" />)
  expect(controls).not.toContain('(partial)')
  expect(controls).not.toMatch(/<option[^>]+disabled/)
})
