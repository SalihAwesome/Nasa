import { expect, test } from 'vitest'
import { displayReading, matchPercent, displayTolerance } from './format'

test('match percentages and physical quantities use readable units without changing their meaning', () => {
  expect(matchPercent(0.372)).toBe('37.2%')
  expect(matchPercent(0)).toBe('0%')
  expect(matchPercent(1)).toBe('100%')
  expect(displayReading(0.25, 'ratio')).toBe('25%')
  expect(displayReading(0.26, '1')).toBe('26%')
  expect(displayReading(-12.345, 'C')).toBe('-12.35 °C')
  expect(displayReading(12.34, 'degrees')).toBe('12.3°')
  expect(displayReading(67, '%')).toBe('67%')
  expect(displayTolerance(0.25, 'ratio')).toBe('25 percentage points')
  expect(displayTolerance(20, '%')).toBe('20 percentage points')
})
