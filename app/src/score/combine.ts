import type { ScoreResult } from './score'

export type Weight = Readonly<{ value: number; status: string }>
export type CombinedResult = {
  score: number | { kind: 'no-score'; reason: 'no-weighted-scores' | 'missing-required-quantities' }
  missing: string[]
}

/** DEFAULT D4: weighted mean of available scores, renormalized after omissions.
 * Only positive-weight quantities participate; unweighted rows are ignored.
 * Default weight values and their status come from shared/tests.json (D3).
 */
export function combine(
  scores: Readonly<Record<string, ScoreResult | null | undefined>>,
  weights: Readonly<Record<string, Weight | undefined>>,
): CombinedResult {
  const missing: string[] = []
  const available: { score: number; weight: number }[] = []
  let maxWeight = 0

  for (const [id, weight] of Object.entries(weights)) {
    if (!weight || weight.status !== 'default' || !Number.isFinite(weight.value) || weight.value < 0) {
      throw new RangeError('Weights must be finite, nonnegative and labelled as defaults')
    }
    if (weight.value === 0) continue

    const current = scores[id]
    if (typeof current !== 'number') {
      missing.push(id)
      continue
    }
    if (!Number.isFinite(current) || current < 0 || current > 1) {
      throw new RangeError('Scores must be finite numbers between 0 and 1')
    }
    available.push({ score: current, weight: weight.value })
    maxWeight = Math.max(maxWeight, weight.value)
  }

  if (available.length === 0) {
    return { score: { kind: 'no-score', reason: 'no-weighted-scores' }, missing }
  }

  // Scaling by the largest available weight leaves the mean unchanged and
  // avoids overflowing the sum when the caller supplies large weights.
  let weightedScore = 0
  let totalWeight = 0
  for (const entry of available) {
    const normalized = entry.weight / maxWeight
    weightedScore += entry.score * normalized
    totalWeight += normalized
  }
  return { score: weightedScore / totalWeight, missing }
}

export function coverage(
  missing: readonly string[],
  weights: Readonly<Record<string, Weight | undefined>>,
): { scored: number; total: number } {
  const total = Object.values(weights).filter(weight => weight !== undefined && weight.value > 0).length
  return { scored: total - missing.length, total }
}
