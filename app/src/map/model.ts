import type { EarthMonth } from '../data/earth'
import type { Target } from '../data/targets'
import { terrainTolerances } from '../data/terrain'
import { combine } from '../score/combine'
import type { Weight } from '../score/combine'
import { score } from '../score/score'
import type { ScoreResult } from '../score/score'

export type Cell = { lat: number; lon: number }
export type TargetNumber = { value: number | null; reason?: string; unit?: string | null }
export type TargetNumbers = Record<string, TargetNumber>
export type TestDefinition = { id: string; enabled: boolean; partial?: boolean; requiredQuantities?: string[]; reason?: string; weights: Record<string, Weight | undefined>; notBuilt: string[] }
export type CellScore = { score: number | null; reason: string | null; missing: string[] }

/** Read the channels/value/reason fields of U07's shipped card output.
 * Missing or incompatible output stays missing.
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
    const unit = 'unit' in entry && typeof entry.unit === 'string' ? entry.unit : null
    return [id, { value: value as number | null, unit, ...(typeof reason === 'string' ? { reason } : {}) }]
  }))
}

export function computeScores(month: EarthMonth, target: Target, numbers: TargetNumbers, definition: TestDefinition): CellScore[] {
  if (!definition.enabled) return Array.from({ length: month.cellCount }, () => ({ score: null, reason: definition.reason ?? 'Test not built.', missing: [] }))
  const weighted = Object.entries(definition.weights).filter(([, weight]) => weight && weight.value > 0)
  const settingsById: Record<string, { tolerance: number }> = { ...target.channels, ...target.sun, ...terrainTolerances, ...(target.mobility ? { dryness: { tolerance: target.mobility.dryness.tolerance.value } } : {}) }
  // A missing target is shared by every cell. Preserve it without constructing
  // the same reasons and arithmetic objects tens of thousands of times.
  if (weighted.every(([id]) => !settingsById[id] || numbers[id]?.value == null)) {
    const result: CellScore = {
      score: null,
      reason: weighted.map(([id]) => `${id}: ${numbers[id]?.reason ?? 'Target value is not available.'}`).join(' ') || 'No weighted quantities.',
      missing: weighted.map(([id]) => id),
    }
    return Array.from({ length: month.cellCount }, () => result)
  }
  // Many cells share quantity scores (including zero matches and omissions).
  // Reuse U08 results and U09 combinations without changing their arithmetic.
  const quantities = weighted.map(([id]) => ({
    id, layer: month.layers[id], settings: settingsById[id], number: numbers[id],
    cache: new Map<number | null, ScoreResult>(),
  }))
  const combined = new Map<string, CellScore>()
  return Array.from({ length: month.cellCount }, (_, index) => {
    const scores: Record<string, ScoreResult> = {}
    let key = ''
    for (const { id, layer, settings, number, cache } of quantities) {
      if (!settings) continue
      const value = layer?.values[index] ?? null
      let current = cache.get(value)
      if (current === undefined) {
        current = score(value, number?.value, settings.tolerance)
        cache.set(value, current)
      }
      scores[id] = current
      key += `${typeof current === 'number' ? current : current.reason};`
    }
    const cached = combined.get(key)
    if (cached) return cached
    const reasons: string[] = []
    for (const { id, layer, settings, number } of quantities) {
      if (!settings) { reasons.push(`${id}: target settings are not available.`); continue }
      const value = layer?.values[index] ?? null
      if (value === null) reasons.push(`${id}: ${layer?.missingReason ?? 'Earth layer is not available.'}`)
      if (number?.value == null) reasons.push(`${id}: ${number?.reason ?? 'Target value is not available.'}`)
    }
    const result = combine(scores, definition.weights)
    const requiredMissing = definition.requiredQuantities?.some(id => result.missing.includes(id))
    const entry = { score: !requiredMissing && typeof result.score === 'number' ? result.score : null, reason: reasons.length ? reasons.join(' ') : null, missing: result.missing }
    combined.set(key, entry)
    return entry
  })
}

export function rankCells(scores: readonly CellScore[]) {
  return scores.flatMap((result, index) => result.score === null ? [] : [{ index, score: result.score, missing: result.missing }])
    .sort((a, b) => b.score - a.score || a.index - b.index).slice(0, 20)
}
