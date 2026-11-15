/** A match index expressed on a 0–100% scale, never a success probability. */
export function matchPercent(value: number): string {
  return `${new Intl.NumberFormat('en', { maximumFractionDigits: 1 }).format(value * 100)}%`
}

export function displayReading(value: number, unit: string | null): string {
  if (unit === 'ratio' || unit === '1') return matchPercent(value)
  const number = new Intl.NumberFormat('en', { maximumFractionDigits: unit === 'degrees' || unit === 'm' ? 1 : 2 }).format(value)
  if (unit === '%') return `${number}%`
  return unit === 'degrees' ? `${number}°` : `${number}${unit ? ` ${unit === 'C' ? '°C' : unit}` : ''}`
}

export function displayTolerance(value: number, unit: string): string {
  if (unit === 'ratio' || unit === '1') return `${new Intl.NumberFormat('en', { maximumFractionDigits: 1 }).format(value * 100)} percentage points`
  if (unit === '%') return `${value} percentage points`
  return displayReading(value, unit)
}
