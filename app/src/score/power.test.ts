import { readFileSync } from 'node:fs'
import { expect, test } from 'vitest'
import tests from '../../../shared/tests.json'
import earthSun from '../../public/data/sun/earth-rows.json'
import moonSun from '../../public/data/sun/shackleton-numbers.json'
import { decodeCells, decodeMonth, parseEarthManifest } from '../data/earth'
import { loadTargetSettings } from '../data/targets'
import { combine } from './combine'
import { score } from './score'

const fileBuffer = (name: string) => Uint8Array.from(readFileSync(new URL(`../../public/data/earth/${name}`, import.meta.url))).buffer
const manifest = parseEarthManifest(JSON.parse(readFileSync(new URL('../../public/data/earth/manifest.json', import.meta.url), 'utf8')))
const cells = decodeCells(fileBuffer('cells.bin'), manifest)
const moon = loadTargetSettings().targets.find(target => target.id === moonSun.target)
const power = tests.find(definition => definition.id === 'power')
if (!moon || !power) throw new Error('The Moon target and power test must be configured')

test.each([3, 9])('Moon power best land cell for month %i is above 80 degrees north or south', month => {
  expect(power.enabled).toBe(true)
  expect(Object.keys(power.weights)).toEqual(['ground_temp', 'uv', 'peak_elevation', 'low_sun_share', 'horizon_sweep'])
  // U06 has no sourced Moon temperature or UV target. D4 omits their scores.
  expect(moon.channels.ground_temp.valueFile).toBeNull()
  expect(moon.channels.uv.valueFile).toBeNull()
  const targetValues: Record<string, number | null> = { ground_temp: null, uv: null, ...moonSun.numbers }
  const settings = { ...moon.channels, ...moon.sun }
  const earth = decodeMonth(fileBuffer(`month-${String(month).padStart(2, '0')}.bin`), manifest, month)
  const rows = earthSun.months[month - earthSun.month_start]
  expect(rows).toHaveLength(earthSun.latitude_count)
  let best: {
    lat: number
    lon: number
    score: number
    values: Record<string, number | null>
    quantityScores: Record<string, ReturnType<typeof score>>
    missing: string[]
  } | undefined
  let scoredCells = 0

  for (const [index, cell] of cells.entries()) {
    const rowIndex = (cell.lat - earthSun.latitude_start_deg) / earthSun.latitude_step_deg
    if (!Number.isInteger(rowIndex) || !rows[rowIndex]) throw new Error(`No precomputed Sun row for latitude ${cell.lat}`)
    const sun = rows[rowIndex]
    const values: Record<string, number | null> = {
      ground_temp: earth.layers.ground_temp.values[index],
      uv: earth.layers.uv.values[index],
      peak_elevation: sun.peak_elevation,
      low_sun_share: sun.low_sun_share,
      horizon_sweep: sun.horizon_sweep,
    }
    const quantityScores = Object.fromEntries(Object.keys(power.weights).map(id =>
      [id, score(values[id], targetValues[id], settings[id].tolerance)]))
    const result = combine(quantityScores, power.weights)
    if (typeof result.score !== 'number') continue
    scoredCells++
    // Keep the first packed cell on a tie, making the reported result stable.
    if (!best || result.score > best.score) {
      best = { ...cell, score: result.score, values, quantityScores, missing: result.missing }
    }
  }

  if (!best) throw new Error(`No Moon power score for month ${month}`)
  console.info(JSON.stringify({ month, landCells: cells.length, scoredCells, best, target: moonSun.numbers }))
  expect(scoredCells).toBe(cells.length)
  const expectedMissing = Object.keys(power.weights).filter(id => targetValues[id] === null || best.values[id] === null)
  expect(best.missing).toEqual(expectedMissing)
  expect(Math.abs(best.lat), `month ${month} best cell ${JSON.stringify(best)}`).toBeGreaterThan(80)
})

test('power retains missing Sun scores and reweights only the available quantities', () => {
  const missing = score(null, moonSun.numbers.low_sun_share, moon.sun.low_sun_share.tolerance)
  expect(missing).toEqual({ kind: 'no-score', reason: 'missing-value' })
  // Simulated dimensionless scores check D4 with the real D3 configuration.
  expect(combine({ ground_temp: null, uv: null, peak_elevation: 1, low_sun_share: missing, horizon_sweep: 0 }, power.weights))
    .toEqual({ score: 0.5, missing: ['ground_temp', 'uv', 'low_sun_share'] })
  expect(combine({}, power.weights)).toEqual({
    score: { kind: 'no-score', reason: 'no-weighted-scores' },
    missing: Object.keys(power.weights),
  })
})
