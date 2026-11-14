import defaults from '../../../shared/pod-live-defaults.json'
import { parsePodLine } from './parse'
import type { PodLine } from './parse'

export type PodEvent = PodLine
export type PodRecordEvent = Extract<PodEvent, { kind: 'record' }>
type Receive = (event: PodEvent) => void
type Wait = (ms: number, signal: AbortSignal) => Promise<void>

export interface PodSource {
  run(receive: Receive, signal: AbortSignal): Promise<void>
}

export class PodRecordBuffer {
  private readonly records: PodRecordEvent[] = []
  private next = 0

  get size() {
    return this.records.length
  }

  push(record: PodRecordEvent) {
    this.records[this.next] = record
    this.next = (this.next + 1) % defaults.recordLimit
  }

  clear() {
    this.records.length = 0
    this.next = 0
  }

  snapshot(): PodRecordEvent[] {
    if (this.size < defaults.recordLimit) return this.records.slice()
    return [...this.records.slice(this.next), ...this.records.slice(0, this.next)]
  }
}

function lineParser() {
  let luxMax: number | undefined
  return (line: string): PodEvent => {
    const parsed = parsePodLine(line, luxMax)
    if (parsed.kind === 'setting' && parsed.key === 'lux_max') {
      const value = Number(parsed.value)
      luxMax = Number.isFinite(value) && value > 0 ? value : undefined
    }
    return parsed
  }
}

function linesOf(text: string) {
  return text.split(/\r?\n/).filter(line => line.length > 0)
}

const waitFor: Wait = (ms, signal) => new Promise(resolve => {
  if (signal.aborted) {
    resolve()
    return
  }
  const timer = setTimeout(finish, ms)
  function finish() {
    clearTimeout(timer)
    signal.removeEventListener('abort', finish)
    resolve()
  }
  signal.addEventListener('abort', finish, { once: true })
})

async function reconnect(signal: AbortSignal, wait: Wait, runLink: () => Promise<void>) {
  while (!signal.aborted) {
    await runLink()
    if (!signal.aborted) await wait(defaults.reconnectDelayMs, signal)
  }
}

export function createReplaySource({ csv, speed, wait = waitFor }: {
  csv: string; speed: number; wait?: Wait
}): PodSource {
  if (!Number.isFinite(speed) || speed <= 0) throw new RangeError('Replay speed must be positive')
  return {
    async run(receive, signal) {
      const parse = lineParser()
      let previousTime: number | undefined
      for (const line of linesOf(csv.replace(/^\uFEFF/, ''))) {
        if (signal.aborted) return
        const event = parse(line)
        if (event.kind === 'record') {
          const time = Date.parse(event.record.ts)
          if (previousTime !== undefined && time > previousTime) {
            await wait((time - previousTime) / speed, signal)
          }
          previousTime = time
        }
        if (!signal.aborted) receive(event)
      }
    },
  }
}

export interface SocketConnection {
  onmessage: ((event: { data: unknown }) => void) | null
  onclose: (() => void) | null
  onerror: (() => void) | null
  close(): void
}

function browserSocket(url: string): SocketConnection {
  const native = new WebSocket(url)
  const socket: SocketConnection = {
    onmessage: null, onclose: null, onerror: null, close: () => native.close(),
  }
  native.onmessage = event => socket.onmessage?.(event)
  native.onclose = () => socket.onclose?.()
  native.onerror = () => socket.onerror?.()
  return socket
}

function socketUrl(address: string) {
  const input = address.trim()
  const url = new URL(input.includes('://') ? input : 'ws://' + input)
  if (!['ws:', 'wss:'].includes(url.protocol) || url.username || url.password || url.hash) {
    throw new TypeError('Enter a pod hostname, IP address, or WebSocket URL')
  }
  // The D9 port applies to bare pod addresses. An explicit URL keeps its port.
  if (!input.includes('://') && !url.port && !input.endsWith(':80')) {
    url.port = String(defaults.webSocketPort)
  }
  return url.href
}

export function createWebSocketSource({ address, connect = browserSocket, wait = waitFor }: {
  address: string; connect?: (url: string) => SocketConnection; wait?: Wait
}): PodSource {
  const url = socketUrl(address)
  return {
    run(receive, signal) {
      return reconnect(signal, wait, () => new Promise<void>(resolve => {
        const parse = lineParser()
        const socket = connect(url)
        function finish() {
          signal.removeEventListener('abort', finish)
          socket.onmessage = socket.onclose = socket.onerror = null
          socket.close()
          resolve()
        }
        socket.onmessage = event => {
          if (typeof event.data !== 'string') return
          for (const line of linesOf(event.data)) {
            if (signal.aborted) return
            receive(parse(line))
          }
        }
        socket.onclose = socket.onerror = finish
        signal.addEventListener('abort', finish, { once: true })
        if (signal.aborted) finish()
      }))
    },
  }
}

interface PodSerialPort {
  open(options: { baudRate: number }): Promise<void>
  close(): Promise<void>
  readonly readable: ReadableStream<Uint8Array> | null
  readonly writable?: WritableStream<Uint8Array> | null
}

interface PodSerial {
  requestPort(): Promise<PodSerialPort>
}

function hasSerial(value: Navigator): value is Navigator & { serial: PodSerial } {
  return 'serial' in value && typeof value.serial === 'object' && value.serial !== null
    && 'requestPort' in value.serial && typeof value.serial.requestPort === 'function'
}

function requestSerialPort() {
  if (typeof navigator === 'undefined' || !hasSerial(navigator)) {
    throw new Error('Web Serial is unavailable in this browser or context')
  }
  return navigator.serial.requestPort()
}

async function requestHeader(port: PodSerialPort) {
  const writer = port.writable?.getWriter()
  if (!writer) return
  try {
    // U30 sends its settings in response to a newline if opening USB did not reset the board.
    await writer.write(new TextEncoder().encode('\n'))
  } finally {
    writer.releaseLock()
  }
}

async function readSerial(port: PodSerialPort, receive: Receive, signal: AbortSignal) {
  const reader = port.readable?.getReader()
  if (!reader) return
  const parse = lineParser()
  const decoder = new TextDecoder()
  let pending = ''
  const cancel = () => { void reader.cancel().catch(() => {}) }
  signal.addEventListener('abort', cancel, { once: true })
  try {
    if (signal.aborted) return
    await requestHeader(port)
    while (!signal.aborted) {
      const { done, value } = await reader.read()
      if (done || signal.aborted) break
      const lines = (pending + decoder.decode(value, { stream: true })).split('\n')
      pending = lines.pop() ?? ''
      for (const line of lines) {
        if (signal.aborted) return
        if (line !== '' && line !== '\r') receive(parse(line))
      }
    }
  } finally {
    signal.removeEventListener('abort', cancel)
    reader.releaseLock()
  }
}

export async function createSerialSource({ requestPort = requestSerialPort, wait = waitFor }: {
  requestPort?: () => Promise<PodSerialPort>; wait?: Wait
} = {}): Promise<PodSource> {
  // Call directly from a user action so Chrome can show its port chooser.
  const port = await requestPort()
  return {
    run(receive, signal) {
      return reconnect(signal, wait, async () => {
        let opened = false
        try {
          await port.open({ baudRate: defaults.serialBaudRate })
          opened = true
          await readSerial(port, receive, signal)
        } catch (error) {
          // A removed USB device may fail reads or subsequent open attempts.
          if (!(error instanceof DOMException)) throw error
        } finally {
          if (opened) {
            try {
              await port.close()
            } catch (error) {
              if (!(error instanceof DOMException)) throw error
            }
          }
        }
      })
    },
  }
}
