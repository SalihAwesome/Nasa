import { readFileSync } from 'node:fs'
import { renderToStaticMarkup } from 'react-dom/server'
import { afterEach, expect, test, vi } from 'vitest'
import App from '../App'
import { loadRegistries } from '../data/registries'
import { loadTargetSettings } from '../data/targets'
import { loadCardData, readCardSelection, buildCard, findPodCell } from './cardData'
import { FidelityCard } from './FidelityCard'

const publicFile = (path: string) => readFileSync(new URL(`../../public/${path}`, import.meta.url))
const assets = async (path: string) => {
  expect(path).not.toMatch(/^(?:https?:)?\/\//)
  return new Response(new Uint8Array(publicFile(path.replace(/^.*?data\//, 'data/'))))
}
const podSelection = () => readCardSelection('#/card/pod?target=jezero&test=power&month=1')
afterEach(() => vi.unstubAllGlobals())

test('U11: six channel rows, each default tolerance and estimate tag, with six limits last', async () => {
  const selection = podSelection()
  const card = buildCard(await loadCardData(selection, assets), selection)
  const html = renderToStaticMarkup(<FidelityCard card={card} />)
  const channels = loadRegistries().channels.filter(channel => channel.onCard)
  expect(html.match(/<tr data-channel=/g)).toHaveLength(channels.length)
  expect(card.rows).toHaveLength(6)
  for (const channel of channels) expect(html).toContain(`data-channel="${channel.id}"`)
  expect(html.match(/class="evidence-tag evidence-tag--estimate"/g)).toHaveLength(6)
  expect(html.match(/data-tolerance-status="default"/g)).toHaveLength(6)
  const limits = loadTargetSettings().limits.card
  for (const limit of limits) expect(html).toContain(`<dt>${limit.title}</dt>`)
  expect(html).toMatch(/<aside[^>]*data-limits-block="true"[\s\S]*<\/aside><\/article>$/)
  console.info(`U11 card: ${card.rows.length} channel rows; ${limits.length} limits in the last block; all Earth rows estimate.`)
})

test('U11: the pod pressure gap from the real files exceeds tolerance and visibly scores zero', async () => {
  const selection = podSelection()
  const data = await loadCardData(selection, assets)
  const card = buildCard(data, selection)
  const row = card.rows.find(row => row.id === 'pressure')!
  const targetFile = JSON.parse(publicFile('data/mars/jezero-card.json').toString())
  const settings = loadTargetSettings().targets.find(target => target.id === selection.target)!
  const earthPressure = data.month.layers.pressure.values[card.cell.index]!
  const targetPressure = targetFile.channels.pressure.value
  const tolerance = settings.channels.pressure.tolerance
  const gap = Math.abs(earthPressure - targetPressure)
  expect(gap).toBeGreaterThan(tolerance)
  expect(row.earth.value).toBe(earthPressure)
  expect(row.target.value).toBe(targetPressure)
  expect(row.score).toBe(0)
  const html = renderToStaticMarkup(<FidelityCard card={card} />)
  const pressureHTML = html.split('data-channel="pressure"')[1].split('</tr>')[0]
  expect(pressureHTML).toContain('data-score="0"')
  expect(pressureHTML).toContain('Pressure')
  console.info(`U11 pressure: Earth ${earthPressure} hPa; Jezero ${targetPressure} hPa; tolerance ${tolerance} hPa; gap ${gap} hPa; rendered score 0.`)
})

test('missing MEDA values retain their reasons and humidity never acquires an invented unit', async () => {
  const selection = podSelection()
  const card = buildCard(await loadCardData(selection, assets), selection)
  const file = JSON.parse(publicFile('data/mars/jezero-card.json').toString())
  const html = renderToStaticMarkup(<FidelityCard card={card} />)
  for (const id of ['reflectivity', 'uv']) {
    const row = card.rows.find(row => row.id === id)!
    expect(row.target.value).toBeNull()
    expect(row.target.reason).toBe(file.channels[id].reason)
    expect(typeof row.score).not.toBe('number')
    const renderedRow = html.split(`data-channel="${id}"`)[1].split('</tr>')[0]
    expect(renderedRow).toContain(file.channels[id].reason)
    expect(renderedRow).toContain('no score')
  }
  const humidity = card.rows.find(row => row.id === 'humidity')!
  expect(humidity.target.unit).toBeNull()
  expect(humidity.target.unitReason).toBe(file.channels.humidity.reasons.unit)
  expect(html).toContain(file.channels.humidity.note)
})

test('the chosen MEDA sol is read from the shipped manifest', async () => {
  const requested: string[] = []
  const selection = podSelection()
  const data = await loadCardData(selection, path => { requested.push(path); return assets(path) })
  const manifest = JSON.parse(publicFile('data/mars/manifest.json').toString())
  expect(requested.some(path => path.endsWith('/mars/manifest.json'))).toBe(true)
  expect(data.targetSol).toBe(manifest.sol)
  expect(requested.some(path => path.endsWith(`/mars/${manifest.cardFile}`))).toBe(true)
})

test('REVIEW 1: Shackleton pod power includes the three saved Sun scores and omits only the missing channel targets', async () => {
  const selection = readCardSelection('#/card/pod?target=shackleton&test=power')
  const data = await loadCardData(selection, assets)
  const card = buildCard(data, selection)
  expect(typeof card.combined.score).toBe('number')
  expect(card.combined.missing).toEqual(['ground_temp', 'uv'])
  const earthFile = JSON.parse(publicFile('data/sun/earth-rows.json').toString())
  const settings = loadTargetSettings().targets.find(target => target.id === selection.target)!
  const earthRow = earthFile.months[selection.month - earthFile.month_start][(card.cell.lat - earthFile.latitude_start_deg) / earthFile.latitude_step_deg]
  const html = renderToStaticMarkup(<FidelityCard card={card} />)
  for (const [id, setting] of Object.entries(settings.sun)) {
    const file = JSON.parse(readFileSync(new URL(`../../../${setting.valueFile}`, import.meta.url), 'utf8'))
    const row = card.sunRows.find(row => row.id === id)!
    expect(row.earth.value).toBe(earthRow[id])
    expect(row.target.value).toBe(file.numbers[id])
    expect(row.tolerance.value).toBe(setting.tolerance)
    expect(html).toContain(`data-sun-quantity="${id}"`)
    expect(html).toContain(row.label)
  }
  const available = card.sunRows.filter(row => typeof row.score === 'number')
  const numerator = available.reduce((sum, row) => sum + (row.score as number) * row.weight!.value, 0)
  const denominator = available.reduce((sum, row) => sum + row.weight!.value, 0)
  expect(card.combined.score).toBeCloseTo(numerator / denominator)
  console.info(`U11 review 1: Shackleton pod power ${card.combined.score}; omitted ${card.combined.missing.join(', ')}; ${card.sunRows.length} Sun scores.`)
})

test('REVIEW 1: polar-night Sun values retain their saved reasons and readable omitted labels', async () => {
  const selection = readCardSelection('#/card/pod?target=shackleton&test=power&month=1')
  const data = await loadCardData(selection, assets)
  const file = JSON.parse(publicFile('data/sun/earth-rows.json').toString())
  const rows = file.months[selection.month - file.month_start]
  const index = data.cells.findIndex(cell => rows[(cell.lat - file.latitude_start_deg) / file.latitude_step_deg].low_sun_share === null)
  expect(index).toBeGreaterThanOrEqual(0)
  const card = buildCard(data, { ...selection, site: { kind: 'cell', index } })
  const saved = rows[(card.cell.lat - file.latitude_start_deg) / file.latitude_step_deg]
  const html = renderToStaticMarkup(<FidelityCard card={card} />)
  const omitted = html.split('Omitted from the mean: ')[1].split('</p>')[0]
  for (const id of ['low_sun_share', 'horizon_sweep']) {
    const row = card.sunRows.find(row => row.id === id)!
    expect(row.earth.value).toBeNull()
    expect(row.earth.reason).toBe(saved.reasons[id])
    expect(typeof row.score).not.toBe('number')
    expect(card.combined.missing).toContain(id)
    expect(omitted).toContain(row.label)
    expect(omitted).not.toContain(id)
    const rendered = html.split(`data-sun-quantity="${id}"`)[1].split('</dd>')[0]
    expect(rendered).toContain(saved.reasons[id])
    expect(rendered).toContain('no score')
  }
})

test('power counts only its weighted rows, exposes missing weights and lists every notBuilt item', async () => {
  const selection = podSelection()
  const card = buildCard(await loadCardData(selection, assets), selection)
  expect(card.rows.filter(row => row.counts).map(row => row.id)).toEqual(['ground_temp', 'uv'])
  expect(card.combined.missing).toEqual(['uv'])
  const available = [...card.rows, ...card.sunRows].filter(row => row.counts && typeof row.score === 'number')
  expect(available.map(row => row.id)).toEqual(['ground_temp', 'peak_elevation', 'low_sun_share', 'horizon_sweep'])
  const weightedScore = available.reduce((sum, row) => sum + (row.score as number) * row.weight!.value, 0)
  const totalWeight = available.reduce((sum, row) => sum + row.weight!.value, 0)
  expect(card.combined.score).toBeCloseTo(weightedScore / totalWeight)
  const html = renderToStaticMarkup(<FidelityCard card={card} />)
  for (const quantity of card.test.notBuilt) expect(html).toContain(quantity)
  expect(html).toContain('weight')
})

test('pod and cell URLs select the same packed cell, and D18 ties choose higher centers', async () => {
  const selection = podSelection()
  const data = await loadCardData(selection, assets)
  const pod = buildCard(data, selection)
  const cellSelection = readCardSelection(`#/card/cell/${pod.cell.index}?target=jezero&test=power&month=1`)
  const cell = buildCard(data, cellSelection)
  expect(cell.rows).toEqual(pod.rows)
  const grid = data.manifest.quantities.find(quantity => quantity.id === 'ground_temp')!.sourceGrid
  // Arithmetic selection case, not a claimed field position.
  expect(findPodCell(data, { lat: pod.cell.lat - grid.latitudeStep / 2, lon: pod.cell.lon - grid.longitudeStep / 2 })).toBe(pod.cell.index)
  expect(() => buildCard(data, { ...cellSelection, site: { kind: 'cell', index: data.cells.length } })).toThrow()
})

test('Shackleton channel values stay missing; long reasons remain intact and all rows still render', async () => {
  const selection = readCardSelection('#/card/pod?target=shackleton&month=1')
  const card = buildCard(await loadCardData(selection, assets), selection)
  expect(card.rows.every(row => row.target.value === null && row.target.reason)).toBe(true)
  expect(card.rows.every(row => typeof row.score !== 'number')).toBe(true)
  const simulated = { simulated: true, reason: card.rows[0].target.reason!.repeat(40) }
  const stressed = { ...card, rows: card.rows.map((row, i) => i ? row : { ...row, target: { ...row.target, reason: simulated.reason } }) }
  const html = renderToStaticMarkup(<FidelityCard card={stressed} />)
  expect(html).toContain(simulated.reason)
  expect(html.match(/<tr data-channel=/g)).toHaveLength(6)
  const channelRows = html.split('<tbody>')[1].split('</tbody>')[0]
  expect(channelRows).not.toContain('data-score="0"')
})

test('a genuine Earth fill value shows its saved reason and no score', async () => {
  const selection = podSelection()
  const data = await loadCardData(selection, assets)
  const index = data.month.layers.reflectivity.values.findIndex(value => value === null)
  expect(index).toBeGreaterThanOrEqual(0)
  const card = buildCard(data, { ...selection, site: { kind: 'cell', index } })
  const row = card.rows.find(row => row.id === 'reflectivity')!
  expect(row.earth.value).toBeNull()
  expect(row.earth.reason).toBe(data.month.layers.reflectivity.missingReason)
  expect(renderToStaticMarkup(<FidelityCard card={card} />)).toContain(row.earth.reason!)
})

test('both card routes mount the U11 panel in the existing shell', () => {
  for (const hash of ['#/card/pod', '#/card/cell/0?target=jezero&month=1']) {
    vi.stubGlobal('window', { location: { hash } })
    const html = renderToStaticMarkup(<App />)
    expect(html).toContain('Site comparison')
    expect(html).not.toContain('No data is loaded here.')
  }
})

test.each(['#/card/cell/-1', '#/card/cell/NaN', '#/card/pod?month=13', '#/card/pod?target=unknown'])('invalid selections fail clearly: %s', hash => {
  expect(() => readCardSelection(hash)).toThrow()
})
