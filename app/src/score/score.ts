export type ScoreResult = number | {
  kind: 'no-score'
  reason: 'missing-value' | 'missing-target' | 'missing-value-and-target'
}

/** U08: one quantity's linear match against a caller-supplied tolerance. */
export function score(
  value: number | null | undefined,
  target: number | null | undefined,
  tolerance: number,
): ScoreResult {
  if (value == null && target == null) {
    return { kind: 'no-score', reason: 'missing-value-and-target' }
  }
  if (value == null) return { kind: 'no-score', reason: 'missing-value' }
  if (target == null) return { kind: 'no-score', reason: 'missing-target' }

  if (!Number.isFinite(value) || !Number.isFinite(target)) {
    throw new RangeError('Value and target must be finite numbers')
  }
  if (!Number.isFinite(tolerance) || tolerance <= 0) {
    throw new RangeError('Tolerance must be a positive finite number')
  }

  return Math.max(0, 1 - Math.abs(value - target) / tolerance)
}
