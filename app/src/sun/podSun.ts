import { loadRegistries } from '../data/registries'
import type { PodLog } from '../pod/importLog'
import type { PodRecord } from '../pod/parse'

export const sunEventNames = ['sunrise', 'peak', 'sunset'] as const
type EventName = typeof sunEventNames[number]
type EventTimes = Record<EventName, number | null>
const minute = 60_000
export const lightThreshold = loadRegistries().podSettings.sunEventLux.value

function orderedLight(records: readonly PodRecord[]) {
  return records.map(record => ({ time: Date.parse(record.ts), lux: record.lux_up }))
    .sort((a, b) => a.time - b.time)
}

export function detectSunEvents(records: readonly PodRecord[]): EventTimes {
  const points = orderedLight(records)
  let sunrise: number | null = null
  let sunset: number | null = null
  for (let index = 1; index < points.length; index++) {
    const previous = points[index - 1]
    const current = points[index]
    if (previous.lux === null || current.lux === null || current.time <= previous.time) continue
    if (previous.lux < lightThreshold && current.lux >= lightThreshold) sunrise ??= current.time
    if (previous.lux > lightThreshold && current.lux <= lightThreshold) sunset = current.time
    else if (previous.lux === lightThreshold && current.lux < lightThreshold &&
      (sunset === null || sunset < previous.time)) sunset = previous.time
  }

  const values = points.flatMap(point => point.lux === null ? [] : [point.lux]).sort((a, b) => a - b)
  // U18 uses the midpoint of the samples at or above the 95th percentile.
  const cutoff = values[Math.ceil(0.95 * values.length) - 1]
  const peaks = points.filter(point => point.lux !== null && point.lux >= cutoff)
  const peak = peaks.length && values.at(-1)! >= lightThreshold
    ? (peaks[0].time + peaks[peaks.length - 1].time) / 2 : null
  return { sunrise, peak, sunset }
}

function timestamp(value: unknown): number {
  if (typeof value !== 'string' || !value.endsWith('Z') || !Number.isFinite(Date.parse(value))) {
    throw new Error('Invalid UTC time in the pod prediction')
  }
  return Date.parse(value)
}

export function readPodPrediction(input: unknown) {
  const data = input as {
    site?: { status?: unknown }
    window?: { start?: unknown; endExclusive?: unknown }
    samples?: { time_ut: unknown; elevation: unknown; azimuth?: unknown }[]
    events?: Partial<Record<EventName, unknown>>
  } | null
  if (!data?.window || !Array.isArray(data.samples) || !data.events ||
      (data.site?.status !== 'default' && data.site?.status !== 'verified')) {
    throw new Error('Pod Sun prediction is unavailable')
  }
  const start = timestamp(data.window.start)
  const end = timestamp(data.window.endExclusive)
  const samples = data.samples.map(({ time_ut, elevation, azimuth }) => {
    if (typeof elevation !== 'number' || !Number.isFinite(elevation) || Math.abs(elevation) > 90) {
      throw new Error('Invalid elevation in the pod prediction')
    }
    const time = timestamp(time_ut)
    const direction = typeof azimuth === 'number' && azimuth >= 0 && azimuth < 360 ? azimuth : null
    return { time, time_ut: new Date(time).toISOString(), elevation, azimuth: direction }
  })
  if (end <= start || !samples.length ||
      samples.some(({ time }, index) => time < start || time >= end || (index > 0 && time <= samples[index - 1].time))) {
    throw new Error('Invalid range in the pod prediction')
  }
  const events = {} as EventTimes
  for (const name of sunEventNames) {
    const raw = data.events[name]
    const time = raw === null ? null : timestamp(raw)
    if (time !== null && (time < start || time >= end)) throw new Error('Pod Sun event is outside the prediction')
    events[name] = time
  }
  return { start, end, samples, events, usesTestSite: data.site.status === 'default' }
}

type PodPrediction = ReturnType<typeof readPodPrediction>

export async function fetchPodPrediction(signal: AbortSignal) {
  const response = await fetch(import.meta.env.BASE_URL + 'data/sun/pod-prediction.json', { signal })
  if (!response.ok) throw new Error('Could not load the pod Sun prediction')
  return readPodPrediction(await response.json())
}

type EventComparison = { measured: number | null; predicted: number | null; gap: number | null; reason: string | null }

export function comparePodSun(log: PodLog, prediction: PodPrediction | null) {
  const matches = prediction !== null && log.simulated === prediction.usesTestSite &&
    log.records.some(({ ts }) => {
      const time = Date.parse(ts)
      return time >= prediction.start && time < prediction.end
    })
  const records = matches ? log.records.filter(({ ts }) => {
    const time = Date.parse(ts)
    return time >= prediction.start && time < prediction.end
  }) : log.records
  const detected = detectSunEvents(records)
  const events = {} as Record<EventName, EventComparison>
  for (const name of sunEventNames) {
    const measured = detected[name]
    const predicted = matches ? prediction.events[name] : null
    const gap = measured !== null && predicted !== null ? (measured - predicted) / minute : null
    const reason = !matches ? 'No prediction for this recording’s site and time window.'
      : measured === null ? 'Event not detected in the light readings.'
      : predicted === null ? 'No event in the prediction window.' : null
    events[name] = { measured, predicted, gap, reason }
  }
  const light = orderedLight(records)
  const window = matches ? { start: prediction.start, end: prediction.end }
    : light.length > 1 && light[0].time < light[light.length - 1].time
      ? { start: light[0].time, end: light[light.length - 1].time } : null
  return { events, light, window, samples: matches ? prediction.samples : [], simulated: log.simulated }
}
