import type { Channel } from '../data/registries'
import type { PodLog } from './importLog'
import type { PodRecord } from './parse'

type ReducedReading = { value: number } | { value: null; reason: string }

function isPodField(field: string, record: PodRecord): field is keyof PodRecord {
  return Object.hasOwn(record, field)
}

export function podChannelValue(record: PodLog['records'][number], channel: Pick<Channel, 'cardNumber' | 'podFields'>): number | null {
  if (channel.cardNumber === 'daylight_mean') return record.reflectivity.value
  const field = channel.podFields[0]
  return isPodField(field, record) && field !== 'ts' ? record[field] : null
}

/** D16, using U19's daylight and saturation filtering for reflectivity. */
export function reduceChannel(
  records: Readonly<PodLog['records']>,
  channel: Pick<Channel, 'cardNumber' | 'podFields'>,
): ReducedReading {
  const method = channel.cardNumber
  if (method === null) return { value: null, reason: 'This channel has no card number' }
  const first = records[0]
  if (!first) return { value: null, reason: 'No pod records in the log' }

  const field = channel.podFields[0]
  if (!isPodField(field, first) || field === 'ts') {
    return { value: null, reason: 'No numeric pod field for this channel' }
  }
  const values = records.flatMap(record => {
    const value = podChannelValue(record, channel)
    return value === null ? [] : [value]
  })
  if (!values.length) {
    return {
      value: null,
      reason: method === 'daylight_mean'
        ? 'No valid unsaturated daylight reflectivity readings'
        : 'No valid pod readings for this channel',
    }
  }

  if (method === 'range') {
    const extent = values.reduce(({ low, high }, value) => ({
      low: Math.min(low, value),
      high: Math.max(high, value),
    }), { low: values[0], high: values[0] })
    return { value: extent.high - extent.low }
  }
  return { value: values.reduce((sum, value) => sum + value, 0) / values.length }
}

export function gap(podNumber: number, satelliteNumber: number): number {
  return Math.abs(podNumber - satelliteNumber)
}
