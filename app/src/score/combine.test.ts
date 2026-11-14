import { expect, test } from 'vitest'
import tests from '../../../shared/tests.json'
import { combine, coverage } from './combine'
import { score } from './score'

const weight = (value: number) => ({ value, status: 'default' })

test('records all five tests and explains each disabled test', () => {
  expect(tests.map(t => t.id)).toEqual(['power', 'mobility', 'communications', 'navigation', 'science_tools'])
  expect(tests.filter(t => t.enabled).map(t => t.id)).toEqual(['power', 'mobility', 'communications', 'navigation', 'science_tools'])
  for (const definition of tests) {
    expect(Array.isArray(definition.notBuilt)).toBe(true)
    if (!definition.enabled) expect(definition.reason?.trim().length).toBeGreaterThan(0)
    for (const setting of Object.values(definition.weights)) {
      expect(setting.status).toBe('default')
    }
  }
})

test('power gives equal weights to ground temperature, UV and three Sun quantities, summing to one', () => {
  const power = tests.find(t => t.id === 'power')!
  expect(power.weights).toEqual({
    ground_temp: weight(0.2),
    uv: weight(0.2),
    peak_elevation: weight(0.2),
    low_sun_share: weight(0.2),
    horizon_sweep: weight(0.2),
  })
  expect(Object.values(power.weights).reduce((sum, w) => sum + w.value, 0)).toBe(1)
  expect(power.notBuilt).toEqual(['Bare ground', 'Sunlight', 'Airborne dust'])
  // Simulated dimensionless scores exercise the configured five-way mean.
  expect(combine({ ground_temp: 1, uv: 0, peak_elevation: 1, low_sun_share: 0, horizon_sweep: 0.5 }, power.weights))
    .toEqual({ score: 0.5, missing: [] })
})

test('mobility and communications require terrain instead of ranking on dryness alone', () => {
  for (const id of ['mobility', 'communications']) {
    const test = tests.find(test => test.id === id)!
    expect(test.enabled).toBe(true)
    expect(test.requiredQuantities).toEqual(['slope', 'roughness', 'bare_ground'])
    expect(test.notBuilt).toEqual([])
    for (const quantity of test.requiredQuantities!) expect(test.weights[quantity as keyof typeof test.weights]).toEqual(weight(1))
  }
})

test('does not give diagnostic card channels a weight in any test', () => {
  for (const definition of tests) {
    for (const id of ['air_temp', 'humidity', 'pressure', 'reflectivity']) {
      expect(Object.hasOwn(definition.weights, id)).toBe(false)
    }
  }
})

// Simulated, dimensionless arithmetic cases; no scientific weights or data.
test('uses the weighted mean and includes a genuine zero in the denominator', () => {
  expect(combine({ ground_temp: 1, uv: 0 }, { ground_temp: weight(3), uv: weight(1) }))
    .toEqual({ score: 0.75, missing: [] })
})

test('uses only available scores and reports the missing weighted quantity', () => {
  expect(combine({ ground_temp: score(null, 0, 1), uv: 0.5 }, { ground_temp: weight(0.5), uv: weight(0.5) }))
    .toEqual({ score: 0.5, missing: ['ground_temp'] })
})

test('reports absent map keys and explicit nulls without filling their scores', () => {
  expect(combine({ ground_temp: null }, { ground_temp: weight(0.5), uv: weight(0.5) }))
    .toEqual({ score: { kind: 'no-score', reason: 'no-weighted-scores' }, missing: ['ground_temp', 'uv'] })
})

test('returns a typed no-score result when all supplied scores are unavailable', () => {
  expect(combine({ ground_temp: score(null, 0, 1), uv: score(0, null, 1) }, { ground_temp: weight(0.5), uv: weight(0.5) }))
    .toEqual({ score: { kind: 'no-score', reason: 'no-weighted-scores' }, missing: ['ground_temp', 'uv'] })
})

test('ignores unweighted channels and does not mutate either input', () => {
  const scores = Object.freeze({ ground_temp: 0.5, pressure: 1 })
  const weights = Object.freeze({ ground_temp: Object.freeze(weight(1)) })
  expect(combine(scores, weights)).toEqual({ score: 0.5, missing: [] })
})

test('empty and zero-weight selections produce no score', () => {
  expect(combine({}, {})).toEqual({ score: { kind: 'no-score', reason: 'no-weighted-scores' }, missing: [] })
  expect(combine({ ground_temp: 1 }, { ground_temp: weight(0) })).toEqual({ score: { kind: 'no-score', reason: 'no-weighted-scores' }, missing: [] })
})

test.each([-1, NaN, Infinity])('rejects invalid weight %s', value => {
  expect(() => combine({ ground_temp: 1 }, { ground_temp: weight(value) })).toThrow(RangeError)
})

test.each([-1, 2, NaN, Infinity])('rejects an invalid numeric score %s', value => {
  expect(() => combine({ ground_temp: value }, { ground_temp: weight(1) })).toThrow(RangeError)
})

test('requires the default status on weights', () => {
  expect(() => combine({ ground_temp: 1 }, { ground_temp: { value: 1, status: '' } })).toThrow(RangeError)
})

test('normalizes very large weights without overflowing the mean', () => {
  expect(combine({ ground_temp: 1, uv: 0 }, { ground_temp: weight(Number.MAX_VALUE), uv: weight(Number.MAX_VALUE) }))
    .toEqual({ score: 0.5, missing: [] })
})

test('coverage counts the positive-weight quantities a combined score used', () => {
  const weights = { ground_temp: weight(0.5), uv: weight(0.5), pressure: weight(0) }
  const result = combine({ ground_temp: 1, uv: null, pressure: 1 }, weights)
  expect(coverage(result.missing, weights)).toEqual({ scored: 1, total: 2 })
  expect(coverage(combine({}, weights).missing, weights)).toEqual({ scored: 0, total: 2 })
})
