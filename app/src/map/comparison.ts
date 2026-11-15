import type { World } from './PlanetGlobe'
import type { Cell } from './model'
import type { MapData } from './data'
import { cardRegistries, findPodCell } from '../card/cardData'
import { fieldSites } from './fieldSites'
import type { Place } from './places'
import { nearestPlace } from './places'

export type ComparisonLocation = Cell & { body: World; name: string }
export type ComparisonReading = { value: number | null; unit: string | null; reason: string | null }
export const comparisonQuantities = [
  ...cardRegistries.channels.filter(channel => channel.onCard).map(channel => ({ id: channel.id, label: channel.label })),
  { id: 'slope', label: 'Regional slope' },
  { id: 'roughness', label: 'Regional relief roughness' },
  { id: 'bare_ground', label: 'Bare ground (2019)' },
  { id: 'dryness', label: 'Surface wetness (lower is drier)' },
  { id: 'horizon_sweep', label: 'Sun movement along the horizon' },
  { id: 'low_sun_share', label: 'Share of daylight with a low Sun' },
  { id: 'peak_elevation', label: 'Highest Sun elevation' },
]

const normalizeLongitude = (value: number) => ((value + 180) % 360 + 360) % 360 - 180

export function referenceLocations(data: MapData): ComparisonLocation[] {
  return data.targets.map(target => {
    const [horizonsLon, lat] = target.horizons.site.value.split(',').map(Number)
    // Horizons uses IAU west-positive coordinates for Mars. The display uses
    // east-positive geographic longitude on all three globes.
    return { body: target.id === 'jezero' ? 'mars' : 'moon', lat,
      lon: normalizeLongitude(target.id === 'jezero' ? -horizonsLon : horizonsLon),
      name: target.id === 'jezero' ? 'Jezero reference site' : 'Shackleton reference site' }
  })
}

export function locationPresets(data: MapData): ComparisonLocation[] {
  const earth: ComparisonLocation[] = fieldSites(data).map(site => ({ body: 'earth', ...site }))
  const { lat, lon } = cardRegistries.podSite
  if (lat !== null && lon !== null) earth.unshift({ body: 'earth', lat, lon, name: 'Qatar pod site' })
  return [...earth, ...referenceLocations(data)]
}

export function locationName(body: World, point: Cell, cities: readonly Place[], data: MapData) {
  const preset = locationPresets(data).find(site => site.body === body && Math.abs(site.lat - point.lat) < .0001 && Math.abs(site.lon - point.lon) < .0001)
  if (preset) return preset.name
  if (body === 'earth') {
    const place = nearestPlace(point, cities)
    if (place) return 'Near ' + place.name + ' (' + place.distanceKm + ' km)'
  }
  return (body === 'moon' ? 'Lunar' : body === 'mars' ? 'Martian' : 'Earth') + ' location'
}

export function readLocation(data: MapData, location: ComparisonLocation, month: number) {
  const readings: Record<string, ComparisonReading> = {}
  let cell: number | null = null
  if (location.body === 'earth') {
    try { cell = findPodCell(data, location) } catch { /* No nearest-land substitution. */ }
    for (const quantity of comparisonQuantities) {
      const layer = data.months[month - 1].layers[quantity.id]
      const value = cell === null ? null : layer?.values[cell] ?? null
      readings[quantity.id] = {
        value, unit: layer?.unit ?? null,
        reason: value !== null ? null : cell === null ? 'No land-grid sample at these coordinates.' : layer?.missingReason || 'This quantity is unavailable.',
      }
    }
    return { readings, cell, evidence: 'NASA POWER monthly climatology, ETOPO1 terrain, Copernicus 2019 bare ground and precomputed Sun estimates for ' + month + '/12.' }
  }
  const reference = referenceLocations(data).find(point => point.body === location.body)
  const isReference = reference && Math.abs(reference.lat - location.lat) < .0001 && Math.abs(reference.lon - location.lon) < .0001
  const id = location.body === 'moon' ? 'shackleton' : 'jezero'
  const settings = data.targets.find(target => target.id === id)
  for (const quantity of comparisonQuantities) {
    const item = isReference ? data.targetNumbers[id][quantity.id] : undefined
    const sun = settings?.sun[quantity.id]
    const value = item?.value ?? null
    // Some MEDA quantities have no stated source unit. Reuse that unit from the
    // target card rather than attaching the Earth's configured display unit.
    readings[quantity.id] = { value, unit: sun?.unit ?? item?.unit ?? null,
      reason: value !== null ? null : isReference ? item?.reason ?? 'No sourced value for this quantity.'
        : 'No local dataset for this selected point. Choose the reference site to inspect its recorded data.' }
  }
  return { readings, cell: null, evidence: isReference
    ? 'Project reference coordinates (default). Sun values use the saved JPL Horizons window. Jezero weather uses MEDA sol 300. Regional terrain is derived from LOLA/MOLA; fully dry and bare targets are team assumptions.'
    : 'Coordinates selected on the surface image. Local weather and Sun values have not been loaded for this point.' }
}
