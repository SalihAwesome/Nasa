/// <reference types="node" />

import { readFileSync } from 'node:fs'
import { expect, test, vi } from 'vitest'
import { createReplaySource, createWebSocketSource, createSerialSource, PodRecordBuffer } from './live'
import type { PodEvent, SocketConnection } from './live'

const csv = readFileSync(new URL('../../public/data/sim/pod-sim.csv', import.meta.url), 'utf8')
const lines = csv.trimEnd().split(/\r?\n/)
const records = lines.slice(8)
const timestamps = records.map(line => line.split(',')[0])

function collect(events: PodEvent[]) {
  return (event: PodEvent) => events.push(event)
}

function recordTimes(events: PodEvent[]) {
  return events.flatMap(event => event.kind === 'record' ? [event.record.ts] : [])
}

test('replays the entire simulator in order and keeps only the latest 600 records', async () => {
  const events: PodEvent[] = []
  const buffer = new PodRecordBuffer()
  const wait = vi.fn(async (_ms: number, _signal: AbortSignal) => {})
  await createReplaySource({ csv, speed: 60, wait }).run(event => {
    events.push(event)
    if (event.kind === 'record') buffer.push(event)
    expect(buffer.size).toBeLessThanOrEqual(600)
  }, new AbortController().signal)
  expect(events).toContainEqual({ kind: 'setting', key: 'simulated', value: 'true' })
  expect(recordTimes(events)).toEqual(timestamps)
  expect(buffer.snapshot().map(event => event.record.ts)).toEqual(timestamps.slice(-600))
  expect(wait).toHaveBeenCalledTimes(1439)
  expect(wait.mock.calls[0][0]).toBe(1000)
})

test('WebSocket parses the same records and reconnects until cancelled', async () => {
  const events: PodEvent[] = []
  const controller = new AbortController()
  const sockets: SocketConnection[] = []
  const connect = vi.fn((_url: string) => {
    const socket: SocketConnection = { onmessage: null, onclose: null, onerror: null, close: vi.fn() }
    sockets.push(socket)
    return socket
  })
  const running = createWebSocketSource({ address: '192.168.1.2', connect, wait: async () => {} })
    .run(collect(events), controller.signal)
  expect(connect).toHaveBeenCalledWith('ws://192.168.1.2:81/')
  sockets[0].onmessage?.({ data: lines.slice(0, 10).join('\r\n') })
  sockets[0].onclose?.()
  await vi.waitFor(() => expect(sockets).toHaveLength(2))
  for (const line of records.slice(2)) sockets[1].onmessage?.({ data: line })
  expect(recordTimes(events)).toEqual(timestamps)
  controller.abort()
  await running
  expect(sockets[1].close).toHaveBeenCalledOnce()
})

test('USB handles split CRLF lines and reopens the same port after EOF', async () => {
  const events: PodEvent[] = []
  const controller = new AbortController()
  const encoder = new TextEncoder()
  let stream = new ReadableStream<Uint8Array>({
    start(sink) {
      sink.enqueue(encoder.encode(lines.slice(0, 8).join('\r\n') + '\r\n' + records[0].slice(0, 15)))
      sink.enqueue(encoder.encode(records[0].slice(15) + '\r'))
      sink.enqueue(encoder.encode('\n'))
      sink.close()
    },
  })
  const open = vi.fn(async (_options: { baudRate: number }) => {
    if (open.mock.calls.length === 2) {
      stream = new ReadableStream<Uint8Array>({ start(sink) {
        sink.enqueue(encoder.encode(records[1] + '\n'))
      } })
    }
  })
  const port = { open, close: vi.fn(async () => {}), get readable() { return stream } }
  const source = await createSerialSource({ requestPort: async () => port, wait: async () => {} })
  await source.run(event => {
    events.push(event)
    if (recordTimes(events).length === 2) controller.abort()
  }, controller.signal)
  expect(recordTimes(events)).toEqual(timestamps.slice(0, 2))
  expect(open.mock.calls).toEqual([[{ baudRate: 115200 }], [{ baudRate: 115200 }]])
  expect(port.close).toHaveBeenCalledTimes(2)
})
