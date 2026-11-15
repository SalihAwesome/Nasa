export type Supplement = { value: number; unit: string; label: string; source: string; note: string }
export type ComparisonEvidence = {
  humidity: { unit: string; source: string; note: string; basis: string }
  supplements: Record<'uv' | 'reflectivity', Supplement>
}

function object(value: unknown): Record<string, unknown> {
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw new Error('Invalid comparison evidence.')
  return value as Record<string, unknown>
}
function text(value: unknown): string {
  if (typeof value !== 'string' || !value.trim()) throw new Error('Missing comparison provenance.')
  return value
}
function source(value: unknown): string {
  const url = text(value)
  if (new URL(url).protocol !== 'https:') throw new Error('Invalid comparison source URL.')
  return url
}
function supplement(value: unknown, unit: string): Supplement {
  const row = object(value)
  if (typeof row.value !== 'number' || !Number.isFinite(row.value) || row.value < 0
    || row.unit !== unit || (unit === '%' && row.value > 100)) throw new Error('Invalid comparison measurement.')
  return { value: row.value, unit, label: text(row.label), source: source(row.source), note: text(row.note) }
}

export function parseComparisonEvidence(input: unknown): ComparisonEvidence {
  const data = object(input)
  if ('simulated' in data || data.target !== 'jezero' || data.sol !== 300) throw new Error('Expected sourced Jezero comparison evidence.')
  const humidity = object(object(data.unitClarifications).humidity)
  if (humidity.unit !== '%') throw new Error('Unexpected relative-humidity unit.')
  const supplements = object(data.supplements)
  return {
    humidity: { unit: humidity.unit, source: source(humidity.referenceSource), note: text(humidity.note), basis: text(humidity.basis) },
    supplements: { uv: supplement(supplements.uv, 'W/m²'), reflectivity: supplement(supplements.reflectivity, '%') },
  }
}
