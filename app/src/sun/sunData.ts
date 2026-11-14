const targets = ['shackleton', 'jezero'] as const
export type SunTarget = typeof targets[number]
export type SunSelection = { target: SunTarget; lat: number; month: number }
export type SunPoint = { azimuth: number; elevation: number; time_ut: string }
export type SunNumbers = {
  peak_elevation: number
  low_sun_share: number | null
  horizon_sweep: number | null
  reasons?: Record<string, string>
}
type Manifest = {
  year: number; day_of_month: number; longitude_deg: number
  latitude_start_deg: number; latitude_step_deg: number; latitude_count: number
  month_start: number; month_count: number; samples_per_path: number
  sample_start_minute_utc: number; sample_step_minutes: number; degrees_per_count: number
  file: string; dtype: string; byte_order: string; layout: string[]; angles: string[]
}
type TargetData = {
  rows: SunPoint[]
  numbers: SunNumbers
  window: { start: string; stop: string; status: 'default' }
  site: { value: string; status: 'default'; citation: null; reasons: { citation: string } }
}
export type SunData = {
  manifest: Manifest
  earth: SunNumbers[][]
  metricStepMinutes: number
  binary: DataView
  targets: Record<SunTarget, TargetData>
}

function fail(message: string): never { throw new Error('Sun data: ' + message) }

function object(input: unknown): Record<string, unknown> {
  if (!input || typeof input !== 'object' || Array.isArray(input)) fail('expected an object')
  return input as Record<string, unknown>
}

function finite(input: unknown): number {
  if (typeof input !== 'number' || !Number.isFinite(input)) fail('expected a finite number')
  return input
}

function text(input: unknown): string {
  if (typeof input !== 'string' || !input.trim()) fail('expected text')
  return input
}

function array(input: unknown): unknown[] {
  if (!Array.isArray(input)) fail('expected an array')
  return input
}

function positiveInteger(input: unknown): number {
  const value = finite(input)
  if (!Number.isSafeInteger(value) || value <= 0) fail('expected a positive integer')
  return value
}

function parseNumbers(input: unknown): SunNumbers {
  const data = object(input)
  const peak_elevation = finite(data.peak_elevation)
  if (peak_elevation < -90 || peak_elevation > 90) fail('invalid peak elevation')
  const reasons: Record<string, string> = {}
  function metric(key: string, maximum: number) {
    if (data[key] === null) {
      reasons[key] = text(object(data.reasons)[key])
      return null
    }
    const value = finite(data[key])
    if (value < 0 || value > maximum) fail('invalid ' + key)
    return value
  }
  const low_sun_share = metric('low_sun_share', 1)
  const horizon_sweep = metric('horizon_sweep', 360)
  const numbers: SunNumbers = { peak_elevation, low_sun_share, horizon_sweep }
  if (low_sun_share === null || horizon_sweep === null) numbers.reasons = reasons
  return numbers
}

function parseManifest(input: unknown): Manifest {
  const data = object(input)
  const manifest = {
    year: positiveInteger(data.year), day_of_month: positiveInteger(data.day_of_month),
    longitude_deg: finite(data.longitude_deg), latitude_start_deg: finite(data.latitude_start_deg),
    latitude_step_deg: finite(data.latitude_step_deg), latitude_count: positiveInteger(data.latitude_count),
    month_start: positiveInteger(data.month_start), month_count: positiveInteger(data.month_count),
    samples_per_path: positiveInteger(data.samples_per_path),
    sample_start_minute_utc: finite(data.sample_start_minute_utc),
    sample_step_minutes: positiveInteger(data.sample_step_minutes), degrees_per_count: finite(data.degrees_per_count),
    file: text(data.file), dtype: text(data.dtype), byte_order: text(data.byte_order),
    layout: array(data.layout).map(text), angles: array(data.angles).map(text),
  }
  if (manifest.dtype !== 'int16' || manifest.byte_order !== 'little' ||
      manifest.layout.join() !== 'month,latitude,sample,angle' ||
      manifest.angles.join() !== 'azimuth,elevation' || manifest.file !== 'earth-paths.bin') {
    fail('unsupported Earth path format')
  }
  if (data.status !== 'default' || data.time_zone !== 'UTC' ||
      manifest.latitude_start_deg !== -90 || manifest.latitude_step_deg !== 0.5 || manifest.latitude_count !== 361 ||
      manifest.month_start !== 1 || manifest.month_count !== 12 || manifest.day_of_month > 28 ||
      manifest.year > 9999 || Math.abs(manifest.longitude_deg) > 180 || manifest.samples_per_path < 2 ||
      manifest.degrees_per_count <= 0 || !Number.isInteger(manifest.sample_start_minute_utc) ||
      manifest.sample_start_minute_utc < 0 ||
      manifest.sample_start_minute_utc + (manifest.samples_per_path - 1) * manifest.sample_step_minutes >= 1440) {
    fail('unsupported Earth sampling')
  }
  return manifest
}

function parseTarget(pathInput: unknown, metricsInput: unknown, name: SunTarget): TargetData {
  const path = object(pathInput)
  const metrics = object(metricsInput)
  if (path.target !== name || metrics.target !== name || path.time_scale !== 'UT' ||
      path.angle_units !== 'degrees') fail('inconsistent target metadata')
  const rows = array(path.rows).map((input): SunPoint => {
    const point = object(input)
    const azimuth = finite(point.azimuth), elevation = finite(point.elevation), time_ut = text(point.time_ut)
    if (azimuth < 0 || azimuth > 360 || Math.abs(elevation) > 90 ||
        !/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}$/.test(time_ut) || !Number.isFinite(Date.parse(time_ut + 'Z'))) {
      fail('invalid target sample')
    }
    return { azimuth, elevation, time_ut }
  })
  if (rows.length < 2 || metrics.sample_count !== rows.length ||
      rows.some((point, index) => index > 0 && point.time_ut <= rows[index - 1].time_ut)) fail('incomplete target path')
  const window = object(path.window), site = object(path.site)
  if (window.status !== 'default' || site.status !== 'default' || site.citation !== null) fail('unsupported target defaults')
  return {
    rows, numbers: parseNumbers(metrics.numbers),
    window: { start: text(window.start), stop: text(window.stop), status: 'default' },
    site: { value: text(site.value), status: 'default', citation: null, reasons: { citation: text(object(site.reasons).citation) } },
  }
}

// The initial view is the example route given in U16.
export function readSunSelection(hash: string): SunSelection {
  const params = new URLSearchParams(hash.split('?')[1])
  const target = params.get('target') === 'jezero' ? 'jezero' : 'shackleton'
  const latitude = params.get('lat')?.trim()
  const lat = latitude ? Number(latitude) : -85
  const month = Number(params.get('month') ?? 3)
  return {
    target,
    lat: Math.abs(lat) <= 90 && Number.isInteger(lat * 2) ? lat : -85,
    month: Number.isInteger(month) && month >= 1 && month <= 12 ? month : 3,
  }
}

export function sunHash(selection: SunSelection) {
  return '#/sun?' + new URLSearchParams({
    target: selection.target, lat: String(selection.lat), month: String(selection.month),
  })
}

export async function loadSunData(fetcher: (url: string) => Promise<Response> = fetch): Promise<SunData> {
  const read = async (file: string) => {
    const response = await fetcher(import.meta.env.BASE_URL + 'data/sun/' + file)
    if (!response.ok) throw new Error(`Sun data unavailable (${file})`)
    return response
  }
  const readJSON = async (file: string): Promise<unknown> => (await read(file)).json()
  const readTarget = async (name: SunTarget): Promise<TargetData> => {
    const [path, metrics] = await Promise.all([
      readJSON(name + '.json'),
      readJSON(name + '-numbers.json'),
    ])
    return parseTarget(path, metrics, name)
  }
  const [manifestInput, earthInput, moon, mars] = await Promise.all([
    readJSON('earth-paths-manifest.json'),
    readJSON('earth-rows.json'),
    readTarget(targets[0]), readTarget(targets[1]),
  ])
  const manifest = parseManifest(manifestInput)
  const earth = object(earthInput)
  for (const key of ['year', 'day_of_month', 'longitude_deg', 'latitude_start_deg', 'latitude_step_deg', 'latitude_count', 'month_start', 'month_count'] as const) {
    if (earth[key] !== manifest[key]) fail('Earth metrics disagree with path sampling')
  }
  if (earth.status !== 'default' || earth.time_zone !== 'UTC') fail('unsupported Earth metric defaults')
  const metricStepMinutes = positiveInteger(earth.sample_step_minutes)
  const months = array(earth.months).map(month => array(month).map(parseNumbers))
  if (months.length !== manifest.month_count || months.some(month => month.length !== manifest.latitude_count)) fail('incomplete Earth metrics')
  const binary = new DataView(await (await read(manifest.file)).arrayBuffer())
  if (binary.byteLength !== manifest.month_count * manifest.latitude_count * manifest.samples_per_path * 4) {
    throw new Error('Incomplete Earth Sun paths')
  }
  for (let byte = 0; byte < binary.byteLength; byte += 4) {
    if (Math.abs(binary.getInt16(byte, true) * manifest.degrees_per_count) > 180 ||
        Math.abs(binary.getInt16(byte + 2, true) * manifest.degrees_per_count) > 90) fail('invalid Earth path sample')
  }
  return { manifest, earth: months, metricStepMinutes, binary, targets: { shackleton: moon, jezero: mars } }
}

export function selectEarth(data: SunData, selection: SunSelection) {
  const m = data.manifest
  const month = selection.month - m.month_start
  const row = (selection.lat - m.latitude_start_deg) / m.latitude_step_deg
  const numbers = data.earth[month]?.[row]
  if (!numbers) throw new Error('Earth Sun row unavailable')
  const start = Date.UTC(m.year, selection.month - 1, m.day_of_month, 0, m.sample_start_minute_utc)
  const offset = (month * m.latitude_count + row) * m.samples_per_path * 4
  const rows = Array.from({ length: m.samples_per_path }, (_, index) => {
    const byte = offset + index * 4
    const signed = data.binary.getInt16(byte, true) * m.degrees_per_count
    return {
      azimuth: signed < 0 ? signed + 360 : signed,
      elevation: data.binary.getInt16(byte + 2, true) * m.degrees_per_count,
      time_ut: new Date(start + index * m.sample_step_minutes * 60000).toISOString().slice(0, 19),
    }
  })
  return { rows, numbers }
}
