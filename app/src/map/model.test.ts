import { readFileSync } from 'node:fs'
import { expect, test } from 'vitest'
import { decodeCells, decodeMonth, parseEarthManifest } from '../data/earth'
import { loadTargetSettings } from '../data/targets'
import tests from '../../../shared/tests.json'
import { computeScores, projectCells, hitCell, readTargetNumbers, rankCells } from './model'

const manifest = parseEarthManifest(JSON.parse(readFileSync(new URL('../../public/data/earth/manifest.json', import.meta.url), 'utf8')))
const buffer = (name: string) => Uint8Array.from(readFileSync(new URL(`../../public/data/earth/${name}`, import.meta.url))).buffer
const cells = decodeCells(buffer('cells.bin'), manifest)
const january = decodeMonth(buffer('month-01.bin'), manifest, 1)
const target = loadTargetSettings().targets.find(t => t.id === 'jezero')!
const power = tests.find(t => t.id === 'power')!

test('unavailable target numbers produce no scores and no invented top cells', () => {
  const numbers = readTargetNumbers(null, target, 'U07 output is not available.')
  const scores = computeScores(january, target, numbers, power)
  expect(scores.every(result => result.score === null && result.reason)).toBe(true)
  expect(rankCells(scores)).toEqual([])
})

test('scores and ranks real Earth cells through U08 and U09, excluding missing targets', () => {
  // An arithmetic identity test, using the fetched Earth value as the comparison
  // operand. This is not a Mars fixture or a substitute target in the app.
  const index = cells.findIndex(cell => cell.lat === 25.5 && cell.lon === 51.25)
  const numbers = Object.fromEntries(Object.entries(january.layers).map(([id, layer]) =>
    [id, { value: layer.values[index], reason: layer.missingReason }]))
  const scores = computeScores(january, target, numbers, power)
  expect(scores[index].score).toBe(1)
  const top = rankCells(scores)
  expect(top).toHaveLength(20)
  expect(top.every((entry, i) => i === 0 || top[i - 1].score >= entry.score)).toBe(true)
  expect(top.some(entry => entry.index === index)).toBe(true)
  expect(computeScores(january, target, numbers, { ...power, enabled: false, reason: 'Disabled test' })
    .every(result => result.score === null && result.reason === 'Disabled test')).toBe(true)
})

test('projection is reusable and hit testing cannot select blank ocean', () => {
  const projected = projectCells(cells)
  expect(projected.positions).toHaveLength(cells.length)
  const index = cells.findIndex(cell => cell.lat === 25.5 && cell.lon === 51.25)
  const point = projected.positions[index]
  expect(hitCell(projected.positions, point[0], point[1])).toBe(index)
  expect(hitCell(projected.positions, -100, -100)).toBeNull()
})

test('a malformed or simulated target file cannot silently turn into a score', () => {
  expect(() => readTargetNumbers({ simulated: true }, target, '')).toThrow()
  expect(() => readTargetNumbers({ channels: { ground_temp: { value: Infinity } } }, target, '')).toThrow()
})
