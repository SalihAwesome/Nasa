import grid from '../../../shared/planetary.json'
import type { TargetNumbers } from '../map/model'

export type Planet = 'moon' | 'mars'
export type PlanetPoint = { lat: number; lon: number }
const quantities = ['slope', 'roughness', 'peak_elevation', 'low_sun_share', 'horizon_sweep'] as const
const units = ['degrees', 'm', 'degrees', 'ratio', 'degrees']
export type PlanetaryData = { layers: Record<Planet, Float32Array[]>; note: string }

function object(value: unknown): Record<string, unknown> {
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw new Error('Invalid planetary data.')
  return value as Record<string, unknown>
}

export async function loadPlanetaryData(baseUrl: string, fetcher: (path: string) => Promise<Response> = fetch): Promise<PlanetaryData> {
  async function request(path: string) {
    const response = await fetcher(baseUrl + 'planetary/' + path)
    if (!response.ok) throw new Error(`Planetary data ${path}: HTTP ${response.status}`)
    return response
  }
  const manifest = object(await (await request('manifest.json')).json())
  if ('simulated' in manifest || manifest.dtype !== 'float32' || manifest.byteOrder !== 'little' || manifest.layout !== 'quantity-major'
    || !Array.isArray(manifest.quantities) || manifest.quantities.join(',') !== quantities.join(',')
    || JSON.stringify(manifest.grid) !== JSON.stringify(grid) || typeof manifest.note !== 'string') throw new Error('Unsupported planetary grid.')
  const bodies = object(manifest.bodies)
  async function loadBody(body: Planet) {
    const metadata = object(bodies[body])
    if (metadata.file !== body + '.bin' || typeof metadata.sha256 !== 'string') throw new Error('Invalid planetary file metadata.')
    const bytes = await (await request(metadata.file)).arrayBuffer()
    const hash = Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256', bytes)), b => b.toString(16).padStart(2, '0')).join('')
    const count = grid.rows * grid.columns
    if (bytes.byteLength !== count * quantities.length * 4 || hash !== metadata.sha256) throw new Error('Planetary grid length or checksum disagrees.')
    const view = new DataView(bytes)
    return quantities.map((id, q) => Float32Array.from({ length: count }, (_, i) => {
      const value = view.getFloat32((q * count + i) * 4, true)
      if (Number.isNaN(value) && id === 'low_sun_share') return value
      if (!Number.isFinite(value) || (id === 'peak_elevation' ? Math.abs(value) > 90 : value < 0)
        || (id === 'low_sun_share' && value > 1) || (id === 'horizon_sweep' && value > 360)) throw new Error('Invalid planetary measurement.')
      return value
    }))
  }
  const [moon, mars] = await Promise.all([loadBody('moon'), loadBody('mars')])
  return { layers: { moon, mars }, note: manifest.note }
}

export function samplePlanetary(data: PlanetaryData, body: Planet, point: PlanetPoint) {
  if (!Number.isFinite(point.lat) || !Number.isFinite(point.lon) || Math.abs(point.lat) > 90 || Math.abs(point.lon) > 180) throw new Error('Invalid target coordinates.')
  const row = Math.max(0, Math.min(grid.rows - 1, Math.floor((90 - point.lat) / grid.stepDegrees)))
  const column = Math.floor((((point.lon + 180) % 360) + 360) % 360 / grid.stepDegrees)
  const cell = { lat: grid.latitudeStart - row * grid.stepDegrees, lon: grid.longitudeStart + column * grid.stepDegrees }
  const values: TargetNumbers = Object.fromEntries(quantities.map((id, q) => {
    const value = data.layers[body][q][row * grid.columns + column]
    return [id, Number.isNaN(value) ? { value: null, unit: units[q], reason: 'The Sun does not rise in the saved observation window.' } : { value, unit: units[q] }]
  }))
  return { values, cell, note: data.note }
}
