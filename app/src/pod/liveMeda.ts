import { loadRegistries } from '../data/registries'
import type { Channel } from '../data/registries'

type Bin = { value: number | null; reason?: string }
type MedaChannel = {
  missing: boolean
  reason?: string
  unit: string | null
  reasons?: { unit: string }
  bins?: Bin[]
}

export type MedaReference = {
  sol: number
  settings: { binMinutes: number }
  channels: Record<string, MedaChannel | undefined>
}

const { podSite } = loadRegistries()
const minutesPerHour = 60
const hoursPerDay = 24
const millisecondsPerMinute = 60 * 1000
const minutesPerDay = hoursPerDay * minutesPerHour

export async function fetchLiveMeda(signal: AbortSignal): Promise<MedaReference> {
  const directory = import.meta.env.BASE_URL + 'data/mars/'
  const manifest = await fetch(directory + 'manifest.json', { signal })
  if (!manifest.ok) throw new Error('MEDA manifest unavailable.')
  const { seriesFile, sol } = await manifest.json()
  if (typeof seriesFile !== 'string' || !/^meda-sol-\d+\.json$/.test(seriesFile)) {
    throw new Error('Invalid MEDA series filename.')
  }
  const response = await fetch(directory + seriesFile, { signal })
  if (!response.ok) throw new Error('MEDA series unavailable.')
  const reference: MedaReference = await response.json()
  if (reference.sol !== sol || !Number.isInteger(sol) || !reference.channels
    || !Number.isFinite(reference.settings?.binMinutes) || reference.settings.binMinutes <= 0) {
    throw new Error('Invalid MEDA series.')
  }
  return reference
}

export function podSolarTime(timestamp: string) {
  if (podSite.lon === null) return null
  // Software plan time axis: UTC plus longitude / 15, modulo 24 hours.
  const utcMinutes = (Date.parse(timestamp) % (minutesPerDay * millisecondsPerMinute)) / millisecondsPerMinute
  const shifted = utcMinutes + podSite.lon * (minutesPerHour / 15)
  const minutes = Math.floor((shifted + minutesPerDay) % minutesPerDay)
  const pad = (value: number) => String(value).padStart(2, '0')
  return { minutes, label: pad(Math.floor(minutes / minutesPerHour)) + ':' + pad(minutes % minutesPerHour) }
}

type Comparison = { value: null; reason: string } | { value: number; unit: string | null; unitReason?: string }

export function medaAtTime(channel: Channel | undefined, reference: MedaReference | null,
  minutes: number | null, loadError?: string): Comparison {
  if (!channel) return { value: null, reason: 'No direct MEDA comparison' }
  const series = reference?.channels[channel.id]
  if (series?.missing) return { value: null, reason: series.reason ?? 'Channel unavailable on this MEDA sol.' }
  if (channel.medaFile === null) return { value: null, reason: channel.reasons.medaFile }
  if (!reference) return { value: null, reason: loadError ?? 'Loading MEDA reference…' }
  if (!series) return { value: null, reason: 'Channel absent from this MEDA sol.' }
  if (minutes === null) return { value: null, reason: 'Local mean solar time unavailable.' }

  const index = Math.floor(minutes / reference.settings.binMinutes)
  const bin = series.bins?.[index]
  if (typeof bin?.value !== 'number' || !Number.isFinite(bin.value)) {
    return { value: null, reason: bin?.reason ?? 'No MEDA reading in this time bin.' }
  }
  return { value: bin.value, unit: series.unit, unitReason: series.reasons?.unit }
}
