import type { MapData } from './data'
import type { Cell, TargetNumbers } from './model'
import type { Planet } from '../data/planetary'
import { samplePlanetary } from '../data/planetary'

export function missionReference(data: Pick<MapData, 'targets'>, body: Planet): Cell {
  const target = data.targets.find(row => row.id === (body === 'mars' ? 'jezero' : 'shackleton'))
  if (!target) throw new Error('Missing mission reference.')
  const [sourceLon, lat] = target.horizons.site.value.split(',').map(Number)
  const lon = body === 'mars' ? -sourceLon : sourceLon
  return { lat, lon: ((lon + 180) % 360 + 360) % 360 - 180 }
}

export function isMissionReference(data: Pick<MapData, 'targets'>, body: Planet, point: Cell) {
  const reference = missionReference(data, body)
  return Math.abs(reference.lat - point.lat) < .0001 && Math.abs(reference.lon - point.lon) < .0001
}

export function missionNumbers(data: Pick<MapData, 'targets' | 'targetNumbers' | 'planetary'>, body: Planet, point: Cell): TargetNumbers {
  const id = body === 'mars' ? 'jezero' : 'shackleton'
  if (isMissionReference(data, body, point)) return data.targetNumbers[id]
  const numbers: TargetNumbers = Object.fromEntries(Object.keys(data.targetNumbers[id]).map(key => [key, {
    value: null, reason: 'No local weather measurement for this selected point; reference-site weather is not substituted.',
  }]))
  Object.assign(numbers, samplePlanetary(data.planetary, body, point).values)
  // Retain the brief's explicit surface assumptions, never rover weather.
  for (const key of ['bare_ground', 'dryness']) {
    const reading = data.targetNumbers[id][key]
    if (reading !== undefined) numbers[key] = reading
  }
  return numbers
}

export function pointParams(point: Cell): Record<string, string> {
  return { targetLat: String(point.lat), targetLon: String(point.lon) }
}

export function readTargetPoint(params: URLSearchParams): Cell | undefined {
  if (!params.has('targetLat') && !params.has('targetLon')) return undefined
  const lat = Number(params.get('targetLat')), lon = Number(params.get('targetLon'))
  if (!params.get('targetLat')?.trim() || !params.get('targetLon')?.trim() || !Number.isFinite(lat) || !Number.isFinite(lon)
    || Math.abs(lat) > 90 || Math.abs(lon) > 180) throw new Error('Target coordinates must be valid latitude and longitude.')
  return { lat, lon }
}
