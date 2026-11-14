import settings from '../../../shared/terrain.json'
import type { EarthMonth } from './earth'
import type { TargetNumbers } from '../map/model'

export const terrainSettings = settings
export const terrainTolerances = Object.fromEntries(settings.quantities.map(row => [row.id, row]))
export type TerrainData = { layers: EarthMonth['layers']; targets: Record<string, TargetNumbers>; note: string }
function object(value: unknown): Record<string, unknown> {
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw new Error('Invalid terrain metadata.')
  return value as Record<string, unknown>
}
function text(value: unknown): string {
  if (typeof value !== 'string' || !value.trim()) throw new Error('Missing terrain provenance.')
  return value
}

export async function loadTerrainData(options: { cellCount: number; baseUrl?: string; fetcher?: (path: string) => Promise<Response> }): Promise<TerrainData> {
  const prefix = options.baseUrl ?? `${import.meta.env.BASE_URL}data/`
  const fetcher = options.fetcher ?? fetch
  async function request(path: string) {
    const response = await fetcher(prefix + path)
    if (!response.ok) throw new Error(`Terrain data: ${path} (HTTP ${response.status}).`)
    return response
  }
  const manifest = object(await (await request('terrain/manifest.json')).json())
  const order = settings.quantities.map(row => row.id)
  if (manifest.simulated || manifest.cellCount !== options.cellCount || manifest.dtype !== 'float32' || manifest.byteOrder !== 'little' || manifest.layout !== 'quantity-major'
    || !Array.isArray(manifest.quantityOrder) || manifest.quantityOrder.join(',') !== order.join(',') || manifest.file !== 'earth.bin') throw new Error('Unsupported terrain grid.')
  const [bytes, cells] = await Promise.all([request('terrain/earth.bin').then(r => r.arrayBuffer()), request('earth/cells.bin').then(r => r.arrayBuffer())])
  const fingerprint = Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256', cells)), b => b.toString(16).padStart(2, '0')).join('')
  if (fingerprint !== manifest.cellsSha256 || cells.byteLength !== options.cellCount * 8 || bytes.byteLength !== options.cellCount * order.length * 4) throw new Error('Terrain and weather grids disagree.')
  const view = new DataView(bytes)
  const layers: EarthMonth['layers'] = {}
  for (const [q, quantity] of settings.quantities.entries()) {
    const values = Array.from({ length: options.cellCount }, (_, i) => {
      const value = view.getFloat32((q * options.cellCount + i) * 4, true)
      if (Number.isNaN(value)) return null
      if (!Number.isFinite(value) || value < 0 || (quantity.id === 'bare_ground' && value > 100) || (quantity.id === 'slope' && value > 90)) throw new Error('Invalid terrain value.')
      return value
    })
    layers[quantity.id] = { values, unit: quantity.unit, missingReason: text(manifest.missingReason) }
  }
  const targets: Record<string, TargetNumbers> = {}
  const rawTargets = object(manifest.targets)
  for (const id of ['jezero', 'shackleton']) {
    const rows = object(rawTargets[id])
    targets[id] = Object.fromEntries(settings.quantities.map(quantity => {
      const row = object(rows[quantity.id])
      if (typeof row.value !== 'number' || !Number.isFinite(row.value) || row.value < 0 || row.unit !== quantity.unit
        || (quantity.id === 'bare_ground' && row.value > 100) || (quantity.id === 'slope' && row.value > 90)) throw new Error('Invalid target terrain value.')
      return [quantity.id, { value: row.value, unit: quantity.unit, note: text(row.source) }]
    }))
  }
  return { layers, targets, note: text(manifest.note) }
}
