import { loadRegistries } from '../data/registries'
import { makeErrorBar } from '../card/cardData'
import type { PodLog } from './importLog'
import { podChannelValue, reduceChannel } from './reduce'

const hourMs = 3_600_000
const dayMs = 24 * hourMs
const minuteMs = 60_000
const { channels, podSite } = loadRegistries()
const cardChannels = channels.filter(channel => channel.onCard)

export type CurvePoint = { hour: number; value: number | null; reason?: string }
export type Curve = { label: string; points: CurvePoint[]; note?: string }
type SatelliteChannel = {
  unit: string
  climatology: { value: number | null; month: string; period: string; reason?: string }
  hourly: { ts: string; value: number }[] | null
  cardNumber: { value: number | null; basis: string; reason?: string }
  reason?: string
}
type MedaChannel = { unit: string | null; points: CurvePoint[]; note?: string }
export type CurveSources = {
  site: { lat: number; lon: number; start: string; reason?: string }
  satellite: Record<string, SatelliteChannel>
  meda: Record<string, MedaChannel>
  sol: number
}
export type ChannelComparison = {
  id: string; label: string; unit: string
  pod: Curve; satellite: Curve; meda: Curve
  medaUnit: string | null; separateMedaAxis: boolean
  errorBar: ReturnType<typeof makeErrorBar>
  gapReferenceNote?: string
  note?: string
}

function object(value: unknown): Record<string, unknown> {
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw new Error('Expected a comparison data object')
  return value as Record<string, unknown>
}
function text(value: unknown): string {
  if (typeof value !== 'string' || !value.trim()) throw new Error('Comparison data needs a nonempty label or missing-data reason')
  return value
}
function finite(value: unknown): number {
  if (typeof value !== 'number' || !Number.isFinite(value)) throw new Error('Comparison data needs a finite number')
  return value
}
function reading(row: Record<string, unknown>): { value: number | null; reason?: string } {
  return row.value === null ? { value: null, reason: text(row.reason) } : { value: finite(row.value) }
}
function timestamp(value: unknown): string {
  const ts = text(value)
  if (!ts.endsWith('Z') || !Number.isFinite(Date.parse(ts))) throw new Error('Satellite timestamps must be UTC')
  return ts
}

export function localSolarHour(time: number, longitude: number): number {
  // U21 uses UTC plus east longitude / 15, independent of civil time zones.
  return ((time % dayMs) / hourMs + longitude / 15 + 24) % 24
}

export function parseCurveSources(satelliteInput: unknown, medaInput: unknown): CurveSources {
  const satelliteRoot = object(satelliteInput), medaRoot = object(medaInput)
  if (satelliteRoot.simulated === true || medaRoot.simulated === true) throw new Error('Reference curves require fetched source data')
  if (medaRoot.sourceId !== 'meda' || medaRoot.timeScale !== 'LMST') throw new Error('Expected MEDA local mean solar time (LMST)')
  const sol = finite(medaRoot.sol)
  if (!Number.isSafeInteger(sol) || sol < 0) throw new Error('Invalid MEDA reference sol')
  const site = object(satelliteRoot.site)
  const latitude = finite(site.lat), longitude = finite(site.lon)
  const start = timestamp(site.start)
  const firstHour = Math.ceil(Date.parse(start) / hourMs) * hourMs
  if (Math.abs(latitude) > 90 || Math.abs(longitude) > 180) throw new Error('Invalid satellite position')
  const satelliteRows = object(satelliteRoot.channels), medaRows = object(medaRoot.channels)
  const satellite: CurveSources['satellite'] = {}, meda: CurveSources['meda'] = {}
  for (const channel of cardChannels) {
    const row = object(satelliteRows[channel.id]), monthly = object(row.climatology), card = object(row.cardNumber)
    const unit = text(row.unit)
    if (unit !== channel.unit) throw new Error(`Satellite unit disagrees with ${channel.id}`)
    let hourly: SatelliteChannel['hourly'] = null
    if (row.hourly !== null) {
      if (!Array.isArray(row.hourly) || row.hourly.length !== 24) throw new Error('Satellite hourly data needs all 24 hours')
      const parsedHourly = row.hourly.map(point => {
        const data = object(point)
        return { ts: timestamp(data.ts), value: finite(data.value) }
      })
      if (parsedHourly.some((point, index) => index > 0 && Date.parse(point.ts) - Date.parse(parsedHourly[index - 1].ts) !== hourMs)) {
        throw new Error('Satellite hourly data must be consecutive')
      }
      if (parsedHourly.some((point, index) => Date.parse(point.ts) !== firstHour + index * hourMs)) {
        throw new Error('Satellite hours disagree with the cached recording window')
      }
      hourly = parsedHourly
    }
    satellite[channel.id] = {
      unit, climatology: { ...reading(monthly), month: text(monthly.month), period: text(monthly.period) },
      hourly, cardNumber: { ...reading(card), basis: text(card.basis) },
      reason: row.hourly === null ? text(row.reason) : undefined,
    }
    const mars = object(medaRows[channel.id])
    if (typeof mars.missing !== 'boolean') throw new Error('MEDA needs its missing flag')
    const medaUnit = mars.unit === null ? null : text(mars.unit)
    if (medaUnit !== null && medaUnit !== channel.unit) throw new Error(`MEDA unit disagrees with ${channel.id}`)
    const unitNote = medaUnit === null ? text(object(mars.reasons).unit) : undefined
    let points: CurvePoint[] = []
    if (!mars.missing) {
      if (!Array.isArray(mars.bins)) throw new Error('MEDA needs its saved LMST bins')
      points = mars.bins.map(bin => {
        const data = object(bin), hour = finite(data.lmstHour)
        if (hour < 0 || hour >= 24) throw new Error('MEDA LMST must be from 0 to below 24')
        return { hour, ...reading(data) }
      })
      if (points.some((point, index) => index > 0 && point.hour <= points[index - 1].hour)) throw new Error('MEDA bins must be ordered')
    }
    meda[channel.id] = { unit: medaUnit, points, note: mars.missing ? text(mars.reason) : unitNote }
  }
  return { site: { lat: latitude, lon: longitude, start, reason: site.reason === undefined ? undefined : text(site.reason) }, satellite, meda, sol }
}

export async function loadCurveSources(signal?: AbortSignal, fetcher: typeof fetch = fetch): Promise<CurveSources> {
  if (podSite.lat === null || podSite.lon === null) throw new Error('The team must supply the pod position before comparing satellite curves')
  async function request(path: string): Promise<unknown> {
    const response = await fetcher(import.meta.env.BASE_URL + 'data/' + path, { signal })
    if (!response.ok) throw new Error(`Could not load ${path} (HTTP ${response.status})`)
    return response.json()
  }
  const manifest = object(await request('mars/manifest.json'))
  const seriesFile = text(manifest.seriesFile)
  if (!/^[\w-]+\.json$/.test(seriesFile)) throw new Error('Invalid MEDA series filename')
  const [satellite, meda] = await Promise.all([request('earth/pod-site-satellite.json'), request('mars/' + seriesFile)])
  const sources = parseCurveSources(satellite, meda)
  if (sources.sol !== manifest.sol || manifest.sourceId !== 'meda') throw new Error('MEDA manifest disagrees with its series')
  if (sources.site.lat !== podSite.lat || sources.site.lon !== podSite.lon) throw new Error('Satellite cache position differs from the pod. Refresh pod-site-satellite.json for this site.')
  return sources
}

function separateAxis(pod: CurvePoint[], meda: MedaChannel): boolean {
  const podValues = pod.flatMap(point => point.value === null ? [] : [point.value])
  const marsValues = meda.points.flatMap(point => point.value === null ? [] : [point.value])
  if (!marsValues.length) return false
  if (meda.unit === null) return true
  if (!podValues.length) return false
  return Math.max(...marsValues) < Math.min(...podValues) || Math.min(...marsValues) > Math.max(...podValues)
}

export function buildChannelComparisons(log: PodLog, sources: CurveSources): ChannelComparison[] {
  const longitude = podSite.lon
  if (longitude === null) throw new Error('The team has not supplied the pod longitude')
  const ordered = [...log.records].sort((a, b) => Date.parse(a.ts) - Date.parse(b.ts))
  const start = ordered[0] ? Date.parse(ordered[0].ts) : Date.parse(sources.site.start)
  // The same first-24-hour window as U23. Card gaps use the complete imported log.
  const window = ordered.filter(record => Date.parse(record.ts) < start + dayMs)
  return cardChannels.map(channel => {
    const satelliteRow = sources.satellite[channel.id], mars = sources.meda[channel.id]
    const points = window.map((record): CurvePoint => {
      const value = podChannelValue(record, channel)
      const reason = channel.id === 'reflectivity' ? record.reflectivity.value === null ? record.reflectivity.reason : undefined : 'Missing pod reading.'
      return { hour: localSolarHour(Date.parse(record.ts), longitude), value, ...(value === null ? { reason } : {}) }
    })
    const solarOrder = [...new Map(points.map(point => [point.hour, point])).values()].sort((a, b) => a.hour - b.hour)
    const podPoints: CurvePoint[] = []
    for (const [index, point] of solarOrder.entries()) {
      const previous = solarOrder[index - 1]
      // Detect gaps after folding into solar hours, including the unrecorded
      // span between the two ends of a partial recording across solar midnight.
      if (previous && Math.round((point.hour - previous.hour) * hourMs) > minuteMs) {
        podPoints.push({ hour: previous.hour + minuteMs / hourMs, value: null, reason: 'No pod record in this interval.' })
      }
      podPoints.push(point)
    }
    const matchingSite = sources.site.lat === podSite.lat && sources.site.lon === longitude
    const referenceStart = Date.parse(sources.site.start)
    // One-minute averages are stamped at the end of their interval, including
    // 00:00 at the following day's boundary in the simulator and pod protocol.
    const sameWindow = ordered.length > 0 && ordered.every(record => {
      const time = Date.parse(record.ts)
      return time >= referenceStart && time <= referenceStart + dayMs
    })
    const hourly = matchingSite && sameWindow ? satelliteRow.hourly : null
    const satellitePoints = hourly === null
      ? [0, 24].map(hour => ({ hour, value: satelliteRow.climatology.value, reason: satelliteRow.climatology.reason }))
      : hourly.map(point => ({ hour: localSolarHour(Date.parse(point.ts), longitude), value: point.value })).sort((a, b) => a.hour - b.hour)
    const reduced = { ...reduceChannel(log.records, channel), unit: channel.unit }
    const offset = channel.id === 'air_temp' ? log.calibration.airTemperature.value : undefined
    const errorBar = makeErrorBar(reduced, satelliteRow, offset)
    return {
      id: channel.id, label: channel.id === 'uv' ? 'All Sky Surface UV Index' : channel.label.split(',')[0], unit: channel.unit,
      pod: { label: 'Pod', points: podPoints },
      satellite: {
        label: hourly === null ? `monthly climatology, ${satelliteRow.climatology.period}` : 'NASA POWER, same day',
        points: satellitePoints,
        note: hourly === null ? `${satelliteRow.climatology.month}. ${matchingSite && sameWindow ? satelliteRow.reason ?? '' : 'Cached hourly data does not match this recording window or position.'}` : undefined,
      },
      meda: { label: `MEDA sol ${sources.sol}`, points: mars.points, note: mars.note },
      medaUnit: mars.unit, separateMedaAxis: separateAxis(podPoints, mars), errorBar,
      gapReferenceNote: !sameWindow && errorBar.kind !== 'missing'
        ? `The gap uses the cached ${satelliteRow.cardNumber.basis} card number for the recording starting ${sources.site.start}. The plotted reference uses ${satelliteRow.climatology.month} monthly climatology, ${satelliteRow.climatology.period}.`
        : undefined,
      note: channel.id === 'ground_temp' ? 'Pod and MEDA curves show temperature. The monthly reference is Earth Skin Temperature Range, a daily-range statistic.' : undefined,
    }
  })
}
