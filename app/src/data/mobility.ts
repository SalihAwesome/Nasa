import type { EarthManifest, EarthMonth } from './earth'
import { loadTargetSettings } from './targets'

export type MobilityManifest = {
  cellCount: number; cellsFile: string; cellsSha256: string
  dtype: 'int16'; byteOrder: 'little'; layout: 'quantity-major'; quantityOrder: string[]
  quantities: { id: 'dryness'; unit: '1'; scale: number; offset: number; fillValue: number; status: 'default'; powerParameter: 'GWETTOP'; missingReason: string }[]
  monthFiles: string[]; period: { start: string; end: string }; sourceId: string
}
function fail(message: string): never { throw new Error(`Mobility data: ${message}`) }
function object(input: unknown): Record<string, unknown> {
  if (!input || typeof input !== 'object' || Array.isArray(input)) fail('expected an object')
  return input as Record<string, unknown>
}
function text(input: unknown): string {
  if (typeof input !== 'string' || !input.trim()) fail('expected nonempty text')
  return input
}

export function parseMobilityManifest(input: unknown, earth: EarthManifest): MobilityManifest {
  const data = object(input)
  if (data.cellCount !== earth.cellCount || data.cellsFile !== earth.cellsFile) fail('cell list disagrees with U05')
  if (data.dtype !== 'int16' || data.byteOrder !== 'little' || data.layout !== 'quantity-major') fail('unsupported binary format')
  if (!Array.isArray(data.quantityOrder) || data.quantityOrder.join(',') !== 'dryness' || !Array.isArray(data.quantities) || data.quantities.length !== 1) fail('unexpected mobility quantities')
  const quantity = object(data.quantities[0])
  const settings = loadTargetSettings().targets.map(target => target.mobility?.dryness ?? fail('missing D20 target settings'))
  if (settings.some(setting => setting.scale.value !== quantity.scale)) fail('packing scale disagrees with D20')
  if (quantity.id !== 'dryness' || quantity.unit !== '1' || quantity.offset !== 0 || quantity.fillValue !== -32768 || quantity.status !== 'default' || quantity.powerParameter !== 'GWETTOP') fail('invalid soil wetness metadata')
  const months = data.monthFiles
  if (!Array.isArray(months) || months.length !== earth.monthFiles.length || months.some((name, i) => name !== `mobility-${String(i + 1).padStart(2, '0')}.bin`)) fail('invalid month files')
  const period = object(data.period)
  if (period.start !== earth.period.start || period.end !== earth.period.end || data.sourceId !== earth.sourceId) fail('source or period disagrees with U05')
  const cellsSha256 = text(data.cellsSha256)
  if (!/^[a-f0-9]{64}$/.test(cellsSha256)) fail('invalid cell fingerprint')
  return {
    cellCount: earth.cellCount, cellsFile: earth.cellsFile, cellsSha256,
    dtype: 'int16', byteOrder: 'little', layout: 'quantity-major', quantityOrder: ['dryness'],
    quantities: [{ id: 'dryness', unit: '1', scale: settings[0].scale.value, offset: 0, fillValue: -32768, status: 'default', powerParameter: 'GWETTOP', missingReason: text(quantity.missingReason) }],
    monthFiles: months as string[], period: earth.period, sourceId: earth.sourceId,
  }
}

export function decodeMobilityMonth(buffer: ArrayBuffer, manifest: MobilityManifest, month: number): EarthMonth {
  if (!Number.isInteger(month) || month < 1 || month > manifest.monthFiles.length) fail('invalid month')
  if (buffer.byteLength !== manifest.cellCount * 2) fail('wrong monthly binary length')
  const view = new DataView(buffer), quantity = manifest.quantities[0]
  const values = Array.from({ length: manifest.cellCount }, (_, index) => {
    const raw = view.getInt16(index * 2, true)
    if (raw === quantity.fillValue) return null
    const value = raw * quantity.scale + quantity.offset
    if (value < 0 || value > 1) fail('soil wetness is outside the verified range')
    return value
  })
  return { month, cellCount: manifest.cellCount, layers: { dryness: { unit: quantity.unit, values, missingReason: quantity.missingReason } } }
}

export async function loadMobilityMonth(month: number, options: { earthManifest: EarthManifest; baseUrl?: string; fetcher?: typeof fetch }): Promise<EarthMonth> {
  if (!Number.isInteger(month) || month < 1 || month > options.earthManifest.monthFiles.length) fail('invalid month')
  const prefix = options.baseUrl ?? `${import.meta.env.BASE_URL}data/earth/`
  const base = prefix.endsWith('/') ? prefix : prefix + '/'
  async function request(name: string) {
    const response = await (options.fetcher ?? fetch)(base + name)
    if (!response.ok) fail(`HTTP ${response.status} loading ${name}`)
    return response
  }
  const manifest = parseMobilityManifest(await (await request('mobility-manifest.json')).json(), options.earthManifest)
  return decodeMobilityMonth(await (await request(manifest.monthFiles[month - 1])).arrayBuffer(), manifest, month)
}
