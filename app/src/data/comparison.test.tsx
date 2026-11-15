import { expect, test } from 'vitest'
import { renderToStaticMarkup } from 'react-dom/server'
import saved from '../../public/data/mars/jezero-comparison.json'
import card from '../../public/data/mars/jezero-card.json'
import { parseComparisonEvidence } from './comparison'
import { Difference, Reading } from '../map/CompareSites'

test('shipped evidence names the separate UV and albedo products and links their sources', () => {
  const evidence = parseComparisonEvidence(saved)
  expect(evidence.supplements.reflectivity.value).toBe(14.7) // Published TES retrieval, figure 14.
  for (const id of ['uv', 'reflectivity'] as const) {
    const item = { value: null, unit: null, reason: card.channels[id].reason, supplement: evidence.supplements[id] }
    const html = renderToStaticMarkup(<Reading item={item} />)
    expect(html).toContain(evidence.supplements[id].label)
    expect(html).toContain(evidence.supplements[id].source.replaceAll('&', '&amp;'))
    expect(html).toContain('<details>')
    expect(html).not.toContain('Unavailable')
    const difference = renderToStaticMarkup(<Difference left={item} right={item} />)
    expect(difference).toContain('Separate measurements')
    expect(difference).not.toContain('0 percentage points')
  }
})

test('resolved humidity retains its ice reference without inventing a compatible Earth difference', () => {
  const evidence = parseComparisonEvidence(saved)
  const item = { value: card.channels.humidity.value, unit: evidence.humidity.unit, reason: null, evidence: evidence.humidity, basis: evidence.humidity.basis }
  // Reuse the real saved reading to isolate the effect of the reference metadata.
  const otherReference = { ...item, basis: undefined }
  const html = renderToStaticMarkup(<><Reading item={item} /><Difference left={item} right={otherReference} /></>)
  expect(html).toContain('3.42%')
  expect(html).toContain('Relative to ice')
  expect(html).toContain('Different humidity references')
  expect(html).not.toContain('0 percentage points')
  expect(renderToStaticMarkup(<Difference left={item} right={item} />)).toContain('0 percentage points')
  expect(html).not.toContain('unit unstated')
})

test('comparison evidence rejects simulated data, incompatible units and untrusted links', () => {
  expect(() => parseComparisonEvidence({ ...saved, simulated: true })).toThrow()
  for (const patch of [{ value: NaN }, { unit: 'UV index' }, { source: 'javascript:alert(1)' }]) {
    const invalid = structuredClone(saved)
    Object.assign(invalid.supplements.uv, patch)
    expect(() => parseComparisonEvidence(invalid)).toThrow()
  }
})
