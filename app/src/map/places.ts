import type { Cell } from './model'

export type Place = Cell & { name: string; rank: number }

export function parsePlaces(input: unknown): Place[] {
  if (!Array.isArray(input)) throw new Error('Local place labels must be a list.')
  return input.map((item: unknown) => {
    if (!item || typeof item !== 'object' || !('name' in item) || !('lon' in item)
      || !('lat' in item) || !('rank' in item)) throw new Error('Invalid local place label.')
    const { name, lon, lat, rank } = item
    if (typeof name !== 'string' || !name.trim() || typeof lon !== 'number' || !Number.isFinite(lon) || Math.abs(lon) > 180
      || typeof lat !== 'number' || !Number.isFinite(lat) || Math.abs(lat) > 90
      || typeof rank !== 'number' || !Number.isInteger(rank)) throw new Error('Invalid local place label.')
    return { name, lon, lat, rank }
  })
}

let pending: Promise<Place[]> | undefined
export function loadPlaces() {
  pending ??= fetch(import.meta.env.BASE_URL + 'data/geo/city-labels.json').then(async response => {
    if (!response.ok) throw new Error('Could not load city and town names.')
    return parsePlaces(await response.json())
  }).catch(error => { pending = undefined; throw error })
  return pending
}

const rad = Math.PI / 180
export function nearestPlace(point: Cell, places: readonly Place[]) {
  const sinLatitude = Math.sin(point.lat * rad), cosLatitude = Math.cos(point.lat * rad)
  let best = -Infinity
  let nearest: Place | undefined
  for (const place of places) {
    const latitude = place.lat * rad
    const cosine = sinLatitude * Math.sin(latitude) + cosLatitude * Math.cos(latitude) * Math.cos((point.lon - place.lon) * rad)
    if (cosine > best) { best = cosine; nearest = place }
  }
  if (!nearest) return null
  return { name: nearest.name, distanceKm: Math.round(6371 * Math.acos(Math.max(-1, Math.min(1, best)))) }
}
