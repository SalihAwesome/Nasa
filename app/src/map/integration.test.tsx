import { readFileSync } from 'node:fs'
import { renderToStaticMarkup } from 'react-dom/server'
import { afterEach, expect, test, vi } from 'vitest'
import { buildCard, loadCardData, readCardSelection } from '../card/cardData'
import { loadMapData } from './data'
import { computeScores, rankCells } from './model'
import { MapView } from './SiteFinder'
import tests from '../../../shared/tests.json'

const assets = async (path: string) => new Response(new Uint8Array(readFileSync(
  new URL(`../../public/${path.replace(/^.*?data\//, 'data/')}`, import.meta.url),
)))
afterEach(() => vi.unstubAllGlobals())

test.each(['jezero', 'shackleton'] as const)('map scores and missing quantities agree with the %s card using shipped data', async targetId => {
  vi.stubGlobal('fetch', assets)
  const data = await loadMapData()
  const target = data.targets.find(target => target.id === targetId)!
  const power = tests.find(test => test.id === 'power')!
  for (const month of [1, 3, 9]) {
    const scores = computeScores(data.months[month - 1], target, data.targetNumbers[targetId], power)
    const top = rankCells(scores)
    expect(top).toHaveLength(20)
    const selection = readCardSelection(`#/card/cell/${top[0].index}?target=${targetId}&test=power&month=${month}`)
    const card = buildCard(await loadCardData(selection, assets), selection)
    expect(scores[top[0].index].score).toBe(card.combined.score)
    expect(scores[top[0].index].missing).toEqual(card.combined.missing)
    if (targetId === 'shackleton' && month !== 1) expect(Math.abs(card.cell.lat)).toBeGreaterThan(80)
  }
})

test('ranked links preserve the current target, test and month for the card', async () => {
  vi.stubGlobal('fetch', assets)
  const data = await loadMapData()
  const html = renderToStaticMarkup(<MapView data={data} />)
  const links = [...html.matchAll(/href="(#\/card\/cell\/[^\"]+)"/g)]
  expect(links).toHaveLength(20)
  for (const [, href] of links) {
    const selection = readCardSelection(href.replaceAll('&amp;', '&'))
    expect(selection.target).toBe('jezero')
    expect(selection.test).toBe('power')
    expect(href).toContain('month=1')
  }
})

test('each ranked row states how many weighted quantities its score uses', async () => {
  vi.stubGlobal('fetch', assets)
  const data = await loadMapData()
  const power = tests.find(test => test.id === 'power')!
  const target = data.targets.find(target => target.id === 'jezero')!
  const top = rankCells(computeScores(data.months[0], target, data.targetNumbers.jezero, power))
  const total = Object.values(power.weights).filter(weight => weight.value > 0).length
  const html = renderToStaticMarkup(<MapView data={data} />)
  const shown = [...html.matchAll(/data-coverage="([^"]+)"/g)].map(match => match[1])
  expect(shown).toEqual(top.map(entry => `${total - entry.missing.length} of ${total} quantities`))
})
