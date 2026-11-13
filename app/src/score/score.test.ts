import { expect, test } from 'vitest'
import { score } from './score'

// Simulated, dimensionless arithmetic cases for software-plan.md U08.
// These are not measured values or scientific tolerance defaults.
test.each([
  ['exact match', 0, 0, 1, 1],
  ['one tolerance apart', 1, 0, 1, 0],
  ['half a tolerance apart', 0.5, 0, 1, 0.5],
  ['half a tolerance below the target', -0.5, 0, 1, 0.5],
  ['beyond the tolerance', 2, 0, 1, 0],
  ['zero is a present value', 0, 1, 2, 0.5],
] as const)('%s', (_name, value, target, tolerance, expected) => {
  expect(score(value, target, tolerance)).toBe(expected)
})

test.each([
  ['missing value', null, 0, 'missing-value'],
  ['missing target', 0, null, 'missing-target'],
  ['both missing', null, null, 'missing-value-and-target'],
  ['undefined value', undefined, 0, 'missing-value'],
  ['undefined target', 0, undefined, 'missing-target'],
] as const)('%s gives a typed no-score result', (_name, value, target, reason) => {
  expect(score(value, target, 1)).toEqual({ kind: 'no-score', reason })
})

test.each([0, -1, NaN, Infinity, -Infinity])('rejects invalid tolerance %s', tolerance => {
  expect(() => score(0, 0, tolerance)).toThrow(RangeError)
})

test.each([NaN, Infinity, -Infinity])('rejects a nonfinite measurement or target (%s)', invalid => {
  expect(() => score(invalid, 0, 1)).toThrow(RangeError)
  expect(() => score(0, invalid, 1)).toThrow(RangeError)
})
