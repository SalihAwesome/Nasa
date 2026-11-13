import { loadRegistries } from '../data/registries'
import type { DefaultSetting, PodSite } from '../data/registries'
import { parsePodLine } from './parse'
import type { PodRecord } from './parse'

type Exclusion = PodSite['exclude'][number]
type Reflectivity = { value: number } | { value: null; reason: string }
type Header = {
  pole_height_m: number | null
  tilt_deg: number | null
  facing_deg: number | null
  refl_factor: number | null
  ta_offset_c: number | null
  lux_max: number | null
}

const { podSite, podSettings } = loadRegistries()

function headerNumber(settings: Map<string, string>, key: keyof Header): number | null {
  const text = settings.get(key)
  if (!text || !/^[+-]?(?:\d+(?:\.\d*)?|\.\d+)(?:e[+-]?\d+)?$/i.test(text)) return null
  const value = Number(text)
  return Number.isFinite(value) ? value : null
}

function positiveHeaderNumber(settings: Map<string, string>, key: keyof Header): number | null {
  const value = headerNumber(settings, key)
  return value !== null && value > 0 ? value : null
}

function readHeader(settings: Map<string, string>): Header {
  return {
    pole_height_m: positiveHeaderNumber(settings, 'pole_height_m'),
    tilt_deg: headerNumber(settings, 'tilt_deg'),
    facing_deg: headerNumber(settings, 'facing_deg'),
    refl_factor: positiveHeaderNumber(settings, 'refl_factor'),
    ta_offset_c: headerNumber(settings, 'ta_offset_c'),
    lux_max: positiveHeaderNumber(settings, 'lux_max'),
  }
}

function calibratedValue(measured: number | null, fallback: DefaultSetting, note: string) {
  return measured === null ? { value: fallback.value, status: fallback.status, note } : { value: measured }
}

function reflectivity(record: PodRecord, header: Header, factor: number): Reflectivity {
  const { lux_up, lux_dn } = record
  if (lux_up === null) return { value: null, reason: 'Missing light reading' }
  if (lux_up < podSettings.reflectivityMinLux.value) return { value: null, reason: 'Below daylight threshold' }
  if (header.lux_max === null) return { value: null, reason: 'Missing lux_max saturation threshold' }
  if (lux_up >= header.lux_max) return { value: null, reason: 'Up-facing light reading is saturated' }
  if (lux_dn === null) return { value: null, reason: 'Missing light reading' }
  if (lux_dn < 0) return { value: null, reason: 'Invalid down-facing light reading' }
  if (lux_dn >= header.lux_max) return { value: null, reason: 'Down-facing light reading is saturated' }
  const value = (lux_dn / lux_up) / factor
  return Number.isFinite(value) ? { value } : { value: null, reason: 'Invalid reflectivity' }
}

export function importPodLog(csv: string, exclusions: Exclusion[]) {
  const lines = csv.replace(/^\uFEFF/, '').replace(/(?:\r?\n)+$/, '').split(/\r?\n/)
  const settings = new Map<string, string>()
  const parsedRecords: PodRecord[] = []
  let badLines = 0
  for (const line of lines) {
    if (line === '') continue
    const parsed = parsePodLine(line)
    if (parsed.kind === 'setting' && parsedRecords.length === 0) settings.set(parsed.key, parsed.value)
    if (parsed.kind === 'record') parsedRecords.push(parsed.record)
    if (parsed.kind === 'error') badLines++
  }

  const header = readHeader(settings)
  const calibration = {
    reflectivity: calibratedValue(header.refl_factor, podSettings.reflFactorFallback, 'correction factor not measured'),
    airTemperature: calibratedValue(header.ta_offset_c, podSettings.taOffsetFallbackC, 'offset not measured'),
  }
  const ranges = exclusions.map(({ start, end }) => ({
    from: Date.parse(start),
    through: Date.parse(end),
  }))
  const records = parsedRecords.filter(({ ts }) => {
    const time = Date.parse(ts)
    return !ranges.some(({ from, through }) => time >= from && time <= through)
  }).map(record => ({
    ...record,
    reflectivity: reflectivity(record, header, calibration.reflectivity.value),
  }))

  return {
    simulated: lines[0] === '# simulated=true',
    header,
    calibration,
    records,
    goodLines: parsedRecords.length,
    badLines,
    excludedLines: parsedRecords.length - records.length,
  }
}

export function importConfiguredPodLog(csv: string) {
  return importPodLog(csv, podSite.exclude)
}

export type PodLog = ReturnType<typeof importPodLog>

export async function fetchPodLog(signal?: AbortSignal, fetcher: typeof fetch = fetch): Promise<PodLog> {
  const base = import.meta.env.BASE_URL
  let response = await fetcher(base + 'data/pod/qatar.csv', { signal })
  if (response.status === 404 || (response.ok && response.headers.get('content-type')?.includes('text/html'))) {
    response = await fetcher(base + 'data/sim/pod-sim.csv', { signal })
  }
  if (!response.ok) throw new Error('Could not load pod log (HTTP ' + response.status + ')')
  return importConfiguredPodLog(await response.text())
}
