import { useEffect, useRef, useState } from 'react'
import { loadRegistries } from '../data/registries'
import { readReflectivity } from './importLog'
import { createReplaySource, createSerialSource, createWebSocketSource, PodRecordBuffer } from './live'
import type { PodEvent, PodRecordEvent, PodSource } from './live'
import { fetchLiveMeda, medaAtTime, podSolarTime } from './liveMeda'
import type { MedaReference } from './liveMeda'
import './livePanel.css'

type SourceKind = 'Wi-Fi' | 'USB' | 'replay'
type Snapshot = {
  source: SourceKind | null
  latest: PodRecordEvent | null
  reflectivity: ReturnType<typeof readReflectivity> | null
  simulated: boolean
  badLines: number
  bufferedRecords: number
}

const empty: Snapshot = {
  source: null, latest: null, reflectivity: null, simulated: false, badLines: 0, bufferedRecords: 0,
}

export function createLiveSession(source: SourceKind) {
  let current: Snapshot = { ...empty, source }
  const settings = new Map<string, string>()
  const buffer = new PodRecordBuffer()
  return {
    snapshot: () => current,
    resetBuffer() {
      buffer.clear()
      current = { ...current, latest: null, reflectivity: null, bufferedRecords: buffer.size }
    },
    receive(event: PodEvent) {
      if (event.kind === 'setting') {
        settings.set(event.key, event.value)
        if (event.key === 'simulated') current = { ...current, simulated: event.value === 'true' }
      } else if (event.kind === 'error') {
        current = { ...current, badLines: current.badLines + 1 }
      } else if (event.kind === 'record') {
        buffer.push(event)
        current = { ...current, latest: event, reflectivity: readReflectivity(event.record, settings), bufferedRecords: buffer.size }
      }
    },
  }
}

const { channels, podSite } = loadRegistries()

// Light field names and units come from the pod line format, docs/pod-protocol.md.
const lightRows = [
  { field: 'lux_up', label: 'Upward light', unit: 'lux' },
  { field: 'lux_dn', label: 'Downward light', unit: 'lux' },
] as const
const channelRows = [
  { field: 'tg', id: 'ground_temp', label: 'Ground temperature' },
  { field: 'reflectivity', id: 'reflectivity' },
  { field: 'uv', id: 'uv' },
  { field: 'ta', id: 'air_temp' },
  { field: 'rh', id: 'humidity' },
  { field: 'p', id: 'pressure' },
  { field: 't10', id: 'ground_temp_10cm' },
] as const
const rows = [
  ...lightRows.map(row => ({ ...row, channel: undefined })),
  ...channelRows.map(row => {
    const channel = channels.find(channel => channel.id === row.id)
    if (!channel) throw new Error('Missing channel ' + row.id)
    return {
      field: row.field, channel, unit: channel.unit,
      label: 'label' in row ? row.label : channel.label,
    }
  }),
]

const number = new Intl.NumberFormat('en', { maximumFractionDigits: 4 })

export function LiveReadings({ snapshot, meda, medaError }: {
  snapshot: Snapshot
  meda: MedaReference | null
  medaError?: string
}) {
  const { latest, reflectivity, simulated, badLines } = snapshot
  const time = latest && podSolarTime(latest.record.ts)
  return <section className="pod-readings" aria-labelledby="pod-readings-heading">
    <div className="live-readings-header">
      <h2 id="pod-readings-heading">Pod readings</h2>
      {simulated && <span className="evidence-tag evidence-tag--simulated">simulated</span>}
      <p role="status" data-bad-lines={badLines}>Bad lines · {badLines}</p>
    </div>
    <p className="live-time">
      {latest && <><time dateTime={latest.record.ts}>{latest.record.ts}</time> · </>}
      {time ? <>Local mean solar time {time.label}{podSite.status === 'default' && ' · default site'}</>
        : latest ? (podSite.reasons.lon ?? 'Pod longitude is unavailable.') : 'Waiting for a pod record.'}
    </p>
    <table className="live-table">
      <thead><tr><th scope="col">Channel</th><th scope="col">Pod</th>
        <th scope="col">MEDA{meda && ' · Sol ' + meda.sol}</th></tr></thead>
      <tbody>{rows.map(({ field, channel, unit, label }) => {
        const value = field === 'reflectivity' ? reflectivity?.value : latest?.record[field]
        const saturated = (field === 'lux_up' || field === 'lux_dn') && latest?.saturated[field]
        const mars = medaAtTime(channel, meda, time?.minutes ?? null, medaError)
        const reason = field === 'reflectivity' && reflectivity && 'reason' in reflectivity
          ? reflectivity.reason : 'Missing reading'
        return <tr key={field}>
          <th scope="row">{label} <code>{field}</code></th>
          <td data-field={field} data-value={value ?? undefined}>
            {value == null ? latest && <span className="live-note">{reason}</span>
              : <><span className="live-number">{number.format(value)}</span> {unit}</>}
            {saturated && <small className="live-note">Saturated</small>}
            {field === 'reflectivity' && reflectivity?.note && <small className="live-note">{reflectivity.note}</small>}
          </td>
          <td data-meda-value={mars.value ?? undefined}>
            {mars.value === null ? <span className="live-note">{mars.reason}</span>
              : <><span className="live-number">{number.format(mars.value)}</span> {mars.unit}
                {mars.unitReason && <small className="live-note">{mars.unitReason}</small>}</>}
          </td>
        </tr>
      })}</tbody>
    </table>
  </section>
}

export type CardHandoff = { timestamp: string; simulated: boolean; source: SourceKind | null }

export function LivePath({ snapshot, handoff, onHandoff }: {
  snapshot?: Snapshot
  handoff?: CardHandoff
  onHandoff?: (handoff: CardHandoff) => void
}) {
  const received = Boolean(snapshot?.latest || handoff)
  const replayed = (snapshot?.source ?? handoff?.source) === 'replay'
    || Boolean(snapshot?.simulated || handoff?.simulated)
  const steps = [
    { name: 'Sensor', state: received && !replayed ? 'Received' : replayed ? 'Replay' : 'Waiting' },
    { name: 'ESP32', state: received && !replayed ? 'Received' : replayed ? 'Replay' : 'Waiting' },
    { name: 'Website', state: received ? 'Received' : 'Waiting' },
    { name: 'Qatar card', state: handoff ? 'Opened' : 'Open saved log' },
  ]
  return <ol className="live-path" aria-label="Pod data path">
    {steps.map(({ name, state }) => <li key={name} data-stage={state}>
      {name === 'Qatar card' && !handoff
        ? <a href="#/card/pod" onClick={event => {
          if (event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return
          if (snapshot?.latest) onHandoff?.({
            timestamp: snapshot.latest.record.ts, simulated: snapshot.simulated, source: snapshot.source,
          })
        }}>{name}</a>
        : <strong>{name}</strong>}
      <small>{state}</small>
    </li>)}
  </ol>
}

type MedaState = { reference: MedaReference | null; error?: string }

export function LivePanel({ onHandoff }: { onHandoff: (handoff: CardHandoff) => void }) {
  const [snapshot, setSnapshot] = useState(empty)
  const [meda, setMeda] = useState<MedaState>({ reference: null })
  const [address, setAddress] = useState('')
  const [speed, setSpeed] = useState('1')
  const [connection, setConnection] = useState<{ source: SourceKind; running: boolean; error?: string } | null>(null)
  const active = useRef<AbortController | null>(null)
  const liveSession = useRef<ReturnType<typeof createLiveSession> | null>(null)

  useEffect(() => {
    const controller = new AbortController()
    void fetchLiveMeda(controller.signal).then(
      reference => { if (!controller.signal.aborted) setMeda({ reference }) },
      () => { if (!controller.signal.aborted) setMeda({ reference: null, error: 'Could not load the MEDA reference.' }) },
    )
    return () => {
      controller.abort()
      active.current?.abort()
    }
  }, [])

  async function start(source: SourceKind, prepare: (signal: AbortSignal) => PodSource | Promise<PodSource>) {
    active.current?.abort()
    const controller = new AbortController()
    active.current = controller
    const { signal } = controller
    const session = createLiveSession(source)
    liveSession.current = session
    setSnapshot(session.snapshot())
    setConnection({ source, running: true })
    try {
      const link = await prepare(signal)
      if (signal.aborted) return
      await link.run(event => {
        if (signal.aborted) return
        session.receive(event)
        setSnapshot(session.snapshot())
      }, signal)
      if (!signal.aborted) setConnection({ source, running: false })
    } catch (error) {
      if (!signal.aborted) setConnection({ source, running: false, error: error instanceof Error ? error.message : String(error) })
    }
  }

  return <div className="live-panel">
    <form className="live-controls" aria-label="Pod connection" onSubmit={event => {
      event.preventDefault()
      void start('Wi-Fi', () => createWebSocketSource({ address }))
    }}>
      <label>Pod address <input value={address} onChange={event => setAddress(event.target.value)} required /></label>
      <button type="submit">Connect Wi-Fi</button>
      <button type="button" onClick={() => void start('USB', () => createSerialSource())}>Connect USB</button>
      <label>Replay speed <input type="number" min="0" step="any" value={speed} onChange={event => setSpeed(event.target.value)} /></label>
      <button type="button" onClick={() => void start('replay', async signal => {
        const response = await fetch(import.meta.env.BASE_URL + 'data/sim/pod-sim.csv', { signal })
        if (!response.ok) throw new Error('Could not load the simulator log.')
        return createReplaySource({ csv: await response.text(), speed: Number(speed) })
      })}>Replay simulator</button>
      {connection?.running && <button type="button" onClick={() => {
        active.current?.abort()
        setConnection({ source: connection.source, running: false })
      }}>Stop</button>}
      <button type="button" disabled={!snapshot.bufferedRecords} onClick={() => {
        const session = liveSession.current
        if (!session) return
        session.resetBuffer()
        setSnapshot(session.snapshot())
      }}>Reset buffer</button>
    </form>
    <p role={connection?.error ? 'alert' : 'status'} className="live-status">
      {connection && <>{connection.error ?? (connection.running
        ? connection.source === 'replay' ? 'Replaying simulator' : connection.source + ' listener active'
        : connection.source === 'replay' ? 'Replay ended' : connection.source + ' listener stopped')} · </>}
      Buffered records: <span data-buffered-records={snapshot.bufferedRecords}>{snapshot.bufferedRecords}</span>
    </p>
    <LivePath snapshot={snapshot} onHandoff={onHandoff} />
    <LiveReadings snapshot={snapshot} meda={meda.reference} medaError={meda.error} />
  </div>
}
