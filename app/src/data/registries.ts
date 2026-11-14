import channels from '../../../shared/channels.json'
import sources from '../../../shared/sources.json'
import podSite from '../../../shared/pod_site.json'
import podSettings from '../../../shared/pod_settings.json'

export class RegistryError extends Error {
  constructor(message: string) { super(message); this.name = 'RegistryError' }
}

type Reasons = Record<string, string>
type Status = 'default' | 'verified' | 'needs_human'
export type CardNumber = 'range' | 'daylight_mean' | 'daily_mean'
export type Channel = {
  id: string; label: string; unit: string; podFields: string[]
  powerParameter: string | null; powerHourlyParameter: string | null; powerScale: number | null
  medaFile: string | null; medaColumn: string | null; cardNumber: CardNumber | null
  onCard: boolean; status: Status; reasons: Reasons
}
export type Source = {
  version?: string
  id: string; name: string; url: string | null; usedFor: string; accessed: string | null
  files: string[]; reasons: Reasons
}
export type PodSite = {
  lat: number | null; lon: number | null; start: string | null
  exclude: { start: string; end: string }[]; status: Status; reason?: string; reasons: Reasons
}
export type DefaultSetting = { value: number; unit: string; status: 'default' }
export type PodSettings = {
  sunEventLux: DefaultSetting; reflectivityMinLux: DefaultSetting
  reflFactorFallback: DefaultSetting; taOffsetFallbackC: DefaultSetting
}

function fail(path: string, message: string): never { throw new RegistryError(`${path}: ${message}`) }
function object(value: unknown, path: string, required: readonly string[], optional: readonly string[] = []): Record<string, unknown> {
  if (value === null || typeof value !== 'object' || Array.isArray(value)) fail(path, 'expected an object')
  const data = value as Record<string, unknown>
  for (const key of Object.keys(data)) if (!required.includes(key) && !optional.includes(key)) fail(`${path}.${key}`, 'unknown field')
  for (const key of required) if (!Object.hasOwn(data, key)) fail(`${path}.${key}`, 'missing field')
  return data
}
function text(value: unknown, path: string): string {
  if (typeof value !== 'string' || !value.trim()) fail(path, 'expected nonempty text')
  return value
}
function number(value: unknown, path: string): number {
  if (typeof value !== 'number' || !Number.isFinite(value)) fail(path, 'expected a finite number')
  return value
}
function boolean(value: unknown, path: string): boolean {
  if (typeof value !== 'boolean') fail(path, 'expected a boolean')
  return value
}
function choice<T extends string>(value: unknown, path: string, values: readonly T[]): T {
  const parsed = text(value, path)
  const found = values.find(v => v === parsed)
  return found ?? fail(path, `expected one of ${values.join(', ')}`)
}
function list<T>(value: unknown, path: string, parse: (v: unknown, p: string) => T): T[] {
  if (!Array.isArray(value)) fail(path, 'expected an array')
  return value.map((v, i) => parse(v, `${path}[${i}]`))
}
function nullable<T>(value: unknown, path: string, parse: (v: unknown, p: string) => T): T | null {
  return value === null ? null : parse(value, path)
}
function reasons(data: Record<string, unknown>, path: string): Reasons {
  const raw = data.reasons === undefined ? {} : object(data.reasons, `${path}.reasons`, [], Object.keys(data).filter(k => data[k] === null))
  const parsed: Reasons = {}
  for (const [key, value] of Object.entries(data)) {
    if (value === null) parsed[key] = text(raw[key], `${path}.reasons.${key} (null requires a reason)`)
  }
  return parsed
}
function unique<T extends { id: string }>(items: T[], path: string): T[] {
  const seen = new Set<string>()
  for (const item of items) { if (seen.has(item.id)) fail(path, `duplicate id ${item.id}`); seen.add(item.id) }
  return items
}
function utc(value: unknown, path: string): string {
  const result = text(value, path)
  if (!/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}Z$/.test(result)) fail(path, 'expected UTC YYYY-MM-DDTHH:MM:SSZ')
  const date = new Date(result)
  if (!Number.isFinite(date.getTime()) || date.toISOString().replace('.000Z', 'Z') !== result) fail(path, 'invalid UTC date')
  return result
}
function date(value: unknown, path: string): string {
  const result = text(value, path)
  utc(`${result}T00:00:00Z`, path)
  return result
}

export function parseChannels(input: unknown): Channel[] {
  return unique(list(input, 'channels', (value, path) => {
    const d = object(value, path, ['id', 'label', 'unit', 'podFields', 'powerParameter', 'powerHourlyParameter', 'powerScale', 'medaFile', 'medaColumn', 'cardNumber', 'onCard', 'status'], ['reasons'])
    const fields = list(d.podFields, `${path}.podFields`, text)
    if (!fields.length || new Set(fields).size !== fields.length) fail(path, 'podFields must be nonempty and unique')
    const scale = nullable(d.powerScale, `${path}.powerScale`, number)
    if (scale !== null && scale <= 0) fail(path, 'powerScale must be positive')
    const channel: Channel = {
      id: text(d.id, `${path}.id`), label: text(d.label, `${path}.label`), unit: text(d.unit, `${path}.unit`), podFields: fields,
      powerParameter: nullable(d.powerParameter, `${path}.powerParameter`, text), powerHourlyParameter: nullable(d.powerHourlyParameter, `${path}.powerHourlyParameter`, text), powerScale: scale,
      medaFile: nullable(d.medaFile, `${path}.medaFile`, text), medaColumn: nullable(d.medaColumn, `${path}.medaColumn`, text),
      cardNumber: nullable(d.cardNumber, `${path}.cardNumber`, (v, p) => choice(v, p, ['range', 'daylight_mean', 'daily_mean'])),
      onCard: boolean(d.onCard, `${path}.onCard`), status: choice(d.status, `${path}.status`, ['default', 'verified', 'needs_human']), reasons: reasons(d, path),
    }
    if ((channel.medaFile === null) !== (channel.medaColumn === null)) fail(path, 'MEDA file and column must be supplied together')
    if ((channel.powerParameter === null) !== (channel.powerHourlyParameter === null) || (channel.powerParameter === null) !== (scale === null)) fail(path, 'POWER parameters and scale must be supplied together')
    if (channel.onCard !== (channel.cardNumber !== null)) fail(path, 'cardNumber must match onCard')
    return channel
  }), 'channels')
}

export function parseSources(input: unknown): Source[] {
  return unique(list(input, 'sources', (value, path) => {
    const d = object(value, path, ['id', 'name', 'url', 'usedFor', 'accessed', 'files'], ['reasons', 'version'])
    const url = nullable(d.url, `${path}.url`, text)
    if (url !== null) {
      let parsed: URL
      try { parsed = new URL(url) } catch { return fail(path, 'invalid source URL') }
      if (parsed.protocol !== 'https:') fail(path, 'source URL must use HTTPS')
    }
    const version = d.version === undefined ? undefined : text(d.version, `${path}.version`)
    const files = list(d.files, `${path}.files`, text)
    if ((!files.length && version === undefined) || files.some(f => !f.startsWith('app/public/data/') || f.includes('..') || f.includes('\\') || f.slice(16).includes(':'))) fail(path, 'files must be patterns under app/public/data/')
    return { id: text(d.id, `${path}.id`), name: text(d.name, `${path}.name`), url, usedFor: text(d.usedFor, `${path}.usedFor`), accessed: nullable(d.accessed, `${path}.accessed`, date), files, ...(version === undefined ? {} : { version }), reasons: reasons(d, path) }
  }), 'sources')
}

export function parsePodSite(input: unknown): PodSite {
  const d = object(input, 'podSite', ['lat', 'lon', 'start', 'exclude', 'status'], ['reason', 'reasons'])
  const lat = nullable(d.lat, 'podSite.lat', number), lon = nullable(d.lon, 'podSite.lon', number)
  if (lat !== null && (lat < -90 || lat > 90)) fail('podSite.lat', 'outside latitude bounds')
  if (lon !== null && (lon < -180 || lon > 180)) fail('podSite.lon', 'outside longitude bounds')
  const exclude = list(d.exclude, 'podSite.exclude', (value, path) => {
    const range = object(value, path, ['start', 'end'])
    const start = utc(range.start, `${path}.start`), end = utc(range.end, `${path}.end`)
    if (start >= end) fail(path, 'start must precede end')
    return { start, end }
  })
  return { lat, lon, start: nullable(d.start, 'podSite.start', utc), exclude, status: choice(d.status, 'podSite.status', ['default', 'verified', 'needs_human']), ...(d.reason === undefined ? {} : { reason: text(d.reason, 'podSite.reason') }), reasons: reasons(d, 'podSite') }
}

export function parsePodSettings(input: unknown): PodSettings {
  const keys = ['sunEventLux', 'reflectivityMinLux', 'reflFactorFallback', 'taOffsetFallbackC'] as const
  const d = object(input, 'podSettings', keys)
  function setting(key: typeof keys[number], unit: string): DefaultSetting {
    const path = `podSettings.${key}`, raw = object(d[key], path, ['value', 'unit', 'status'])
    const value = number(raw.value, `${path}.value`)
    if (text(raw.unit, `${path}.unit`) !== unit) fail(path, `expected unit ${unit}`)
    if ((key === 'sunEventLux' || key === 'reflectivityMinLux') && value <= 0) fail(path, 'light threshold must be positive')
    if (key === 'reflFactorFallback' && (value <= 0 || value > 1)) fail(path, 'correction factor must be in (0, 1]')
    return { value, unit, status: choice(raw.status, `${path}.status`, ['default']) }
  }
  return { sunEventLux: setting('sunEventLux', 'lux'), reflectivityMinLux: setting('reflectivityMinLux', 'lux'), reflFactorFallback: setting('reflFactorFallback', 'ratio'), taOffsetFallbackC: setting('taOffsetFallbackC', 'C') }
}

export function loadRegistries() {
  return { channels: parseChannels(channels), sources: parseSources(sources), podSite: parsePodSite(podSite), podSettings: parsePodSettings(podSettings) }
}
