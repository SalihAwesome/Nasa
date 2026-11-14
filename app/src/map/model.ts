import { geoEqualEarth } from 'd3-geo'
import type { EarthMonth } from '../data/earth'
import type { Target } from '../data/targets'
import { combine } from '../score/combine'
import type { Weight } from '../score/combine'
import { score } from '../score/score'
import type { ScoreResult } from '../score/score'

export type Cell = { lat: number; lon: number }
export type TargetNumber = { value: number | null; reason?: string }
export type TargetNumbers = Record<string, TargetNumber>
export type TestDefinition = { id: string; enabled: boolean; reason?: string; weights: Record<string, Weight | undefined>; notBuilt: string[] }
export type CellScore = { score: number | null; reason: string | null; missing: string[] }

/** Explicit consumer contract for U07: channel id -> card-number entry.
 * U07 is not on main yet. Missing or incompatible output stays missing.
 */
export function readTargetNumbers(input: unknown, target: Target, missingReason: string): TargetNumbers {
  if (input === null) return Object.fromEntries(Object.entries(target.channels).map(([id, row]) =>
    [id, { value: null, reason: row.reasons.valueFile ?? missingReason }]))
  if (typeof input !== 'object' || !input || 'simulated' in input) throw new Error('Expected fetched target card numbers; simulated data is not accepted.')
  const channels = (input as { channels?: unknown }).channels
  if (!channels || typeof channels !== 'object' || Array.isArray(channels)) throw new Error('Target card needs a channels object from U07.')
  return Object.fromEntries(Object.keys(target.channels).map(id => {
    const entry: unknown = (channels as Record<string, unknown>)[id]
    if (!entry || typeof entry !== 'object') throw new Error(`Target card is missing ${id}.`)
    const { value, reason } = entry as { value?: unknown; reason?: unknown }
    if (value !== null && (typeof value !== 'number' || !Number.isFinite(value))) throw new Error(`Invalid target number: ${id}.`)
    if (value === null && (typeof reason !== 'string' || !reason.trim())) throw new Error(`Missing target needs a reason: ${id}.`)
    return [id, { value: value as number | null, ...(typeof reason === 'string' ? { reason } : {}) }]
  }))
}

export function computeScores(month: EarthMonth, target: Target, numbers: TargetNumbers, definition: TestDefinition): CellScore[] {
  if (!definition.enabled) return Array.from({ length: month.cellCount }, () => ({ score: null, reason: definition.reason ?? 'Test not built.', missing: [] }))
  const weighted = Object.entries(definition.weights).filter(([, weight]) => weight && weight.value > 0)
  // A missing target is shared by every cell. Preserve it without constructing
  // the same reasons and arithmetic objects tens of thousands of times.
  if (weighted.every(([id]) => !target.channels[id] || numbers[id]?.value == null)) {
    const result: CellScore = {
      score: null,
      reason: weighted.map(([id]) => `${id}: ${numbers[id]?.reason ?? 'Target value is not available.'}`).join(' ') || 'No weighted quantities.',
      missing: weighted.map(([id]) => id),
    }
    return Array.from({ length: month.cellCount }, () => result)
  }
  return Array.from({ length: month.cellCount }, (_, index) => {
    const scores: Record<string, ScoreResult> = {}
    const reasons: string[] = []
    for (const [id] of weighted) {
      const layer = month.layers[id], settings = target.channels[id], number = numbers[id]
      if (!settings) {
        reasons.push(`${id}: target settings are not available.`)
        continue
      }
      const value = layer?.values[index] ?? null
      scores[id] = score(value, number?.value, settings.tolerance)
      if (value === null) reasons.push(`${id}: ${layer?.missingReason ?? 'Earth layer is not available.'}`)
      if (number?.value == null) reasons.push(`${id}: ${number?.reason ?? 'Target value is not available.'}`)
    }
    const result = combine(scores, definition.weights)
    return { score: typeof result.score === 'number' ? result.score : null, reason: reasons.length ? reasons.join(' ') : null, missing: result.missing }
  })
}

// Presentation dimensions, not measured values or scoring parameters.
export const MAP_WIDTH = 960, MAP_HEIGHT = 500
export function projectCells(cells: readonly Cell[]) {
  const projection = geoEqualEarth().fitExtent([[12, 12], [MAP_WIDTH - 12, MAP_HEIGHT - 12]], { type: 'Sphere' })
  const positions = cells.map(cell => projection([cell.lon, cell.lat])!)
  return { projection, positions }
}

export function hitCell(positions: readonly [number, number][], x: number, y: number): number | null {
  let closest: number | null = null, distance = 16 // four display pixels for pointer selection
  positions.forEach(([px, py], index) => {
    const squared = (px - x) ** 2 + (py - y) ** 2
    if (squared < distance) { distance = squared; closest = index }
  })
  return closest
}

export function rankCells(scores: readonly CellScore[]) {
  return scores.flatMap((result, index) => result.score === null ? [] : [{ index, score: result.score, missing: result.missing }])
    .sort((a, b) => b.score - a.score || a.index - b.index).slice(0, 20)
}
