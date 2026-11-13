import { loadRegistries, RegistryError } from './registries'

export type EarthQuantity = {
  id: string; unit: string; scale: number; offset: number; fillValue: number; status: 'default'
  powerParameter: string; powerScale: number
  sourceGrid: { latitudeStep: number; longitudeStep: number }
  missingReason: string
}
export type EarthManifest = {
  cellCount: number; cellsFile: string; cellsDtype: 'float32'; cellCoordinates: string[]
  dtype: 'int16'; byteOrder: 'little'; layout: 'quantity-major'
  quantityOrder: string[]; quantities: EarthQuantity[]; monthFiles: string[]
  period: { start: string; end: string }; sourceId: string; landSourceId: string
}
export type EarthMonth = {
  month: number; cellCount: number
  layers: Record<string, { unit: string; values: (number | null)[]; missingReason: string }>
}

function fail(message: string): never { throw new RegistryError(`Earth data: ${message}`) }
function object(value: unknown): Record<string, unknown> {
  if (value === null || typeof value !== 'object' || Array.isArray(value)) fail('expected an object')
  return value as Record<string, unknown>
}
function text(value: unknown): string {
  if (typeof value !== 'string' || !value.trim()) fail('expected nonempty text')
  return value
}
function finite(value: unknown): number {
  if (typeof value !== 'number' || !Number.isFinite(value)) fail('expected a finite number')
  return value
}
function strings(value: unknown): string[] {
  if (!Array.isArray(value)) fail('expected a string array')
  return value.map(text)
}
function monthNumber(month: number) {
  if (!Number.isInteger(month) || month < 1 || month > 12) fail('month must be 1 through 12')
}

export function parseEarthManifest(input: unknown): EarthManifest {
  const data = object(input)
  const cellCount = finite(data.cellCount)
  if (!Number.isSafeInteger(cellCount) || cellCount <= 0) fail('invalid cell count')
  if (data.cellsFile !== 'cells.bin' || data.cellsDtype !== 'float32' || data.dtype !== 'int16' || data.byteOrder !== 'little' || data.layout !== 'quantity-major') fail('unsupported binary format')
  const cellCoordinates = strings(data.cellCoordinates)
  if (cellCoordinates.join(',') !== 'latitude,longitude') fail('unsupported coordinate order')
  const expected = loadRegistries().channels.filter(channel => channel.onCard)
  const quantityOrder = strings(data.quantityOrder)
  if (quantityOrder.join(',') !== expected.map(q => q.id).join(',')) fail('unexpected quantity order')
  if (!Array.isArray(data.quantities) || data.quantities.length !== expected.length) fail('wrong quantity count')
  const quantities = data.quantities.map((value, index): EarthQuantity => {
    const q = object(value), grid = object(q.sourceGrid)
    const id = text(q.id), unit = text(q.unit), scale = finite(q.scale), offset = finite(q.offset), fillValue = finite(q.fillValue)
    if (id !== expected[index].id || unit !== expected[index].unit) fail('quantity id or unit disagrees with registry')
    if (scale <= 0 || fillValue !== -32768 || q.status !== 'default') fail('invalid default packing settings')
    const latitudeStep = finite(grid.latitudeStep), longitudeStep = finite(grid.longitudeStep), powerScale = finite(q.powerScale)
    if (latitudeStep <= 0 || longitudeStep <= 0 || powerScale <= 0) fail('invalid source grid or scale')
    const powerParameter = text(q.powerParameter)
    if (powerParameter !== expected[index].powerParameter || powerScale !== expected[index].powerScale) fail('POWER mapping disagrees with registry')
    return { id, unit, scale, offset, fillValue, status: 'default', powerParameter, powerScale, sourceGrid: { latitudeStep, longitudeStep }, missingReason: text(q.missingReason) }
  })
  const monthFiles = strings(data.monthFiles)
  if (monthFiles.length !== 12 || monthFiles.some((name, index) => name !== `month-${String(index + 1).padStart(2, '0')}.bin`)) fail('invalid month filenames')
  const period = object(data.period)
  const sourceId = text(data.sourceId), landSourceId = text(data.landSourceId)
  const sourceIds = new Set(loadRegistries().sources.map(source => source.id))
  if (!sourceIds.has(sourceId) || !sourceIds.has(landSourceId)) fail('unknown source id')
  return { cellCount, cellsFile: 'cells.bin', cellsDtype: 'float32', cellCoordinates, dtype: 'int16', byteOrder: 'little', layout: 'quantity-major', quantityOrder, quantities, monthFiles, period: { start: text(period.start), end: text(period.end) }, sourceId, landSourceId }
}

export function decodeCells(buffer: ArrayBuffer, manifest: EarthManifest): { lat: number; lon: number }[] {
  if (buffer.byteLength !== manifest.cellCount * 8) fail('wrong cells binary length')
  const view = new DataView(buffer)
  return Array.from({ length: manifest.cellCount }, (_, index) => {
    const lat = view.getFloat32(index * 8, true), lon = view.getFloat32(index * 8 + 4, true)
    if (!Number.isFinite(lat) || !Number.isFinite(lon) || lat < -90 || lat > 90 || lon < -180 || lon >= 180 || (lat + 90) % 0.5 !== 0 || (lon + 180) % 0.625 !== 0) fail('invalid grid coordinate')
    return { lat, lon }
  })
}

export function decodeMonth(buffer: ArrayBuffer, manifest: EarthManifest, month: number): EarthMonth {
  monthNumber(month)
  if (buffer.byteLength !== manifest.cellCount * manifest.quantities.length * 2) fail('wrong month binary length')
  const view = new DataView(buffer)
  const layers: EarthMonth['layers'] = {}
  manifest.quantities.forEach((quantity, position) => {
    const values = Array.from({ length: manifest.cellCount }, (_, index) => {
      const packed = view.getInt16((position * manifest.cellCount + index) * 2, true)
      return packed === quantity.fillValue ? null : packed * quantity.scale + quantity.offset
    })
    // The layer's missingReason applies to every null in its values array.
    layers[quantity.id] = { unit: quantity.unit, values, missingReason: quantity.missingReason }
  })
  return { month, cellCount: manifest.cellCount, layers }
}

export async function loadMonth(month: number, options: { fetcher?: typeof fetch; baseUrl?: string; manifest?: EarthManifest } = {}): Promise<EarthMonth> {
  monthNumber(month)
  const fetcher = options.fetcher ?? fetch
  const prefix = options.baseUrl ?? `${import.meta.env.BASE_URL}data/earth/`
  const base = prefix.endsWith('/') ? prefix : `${prefix}/`
  async function request(name: string) {
    const response = await fetcher(base + name)
    if (!response.ok) fail(`HTTP ${response.status} loading ${name}`)
    return response
  }
  const manifest = options.manifest ?? parseEarthManifest(await (await request('manifest.json')).json())
  return decodeMonth(await (await request(manifest.monthFiles[month - 1])).arrayBuffer(), manifest, month)
}
