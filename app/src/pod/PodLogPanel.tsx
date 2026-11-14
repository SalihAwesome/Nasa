import { useEffect, useRef, useState } from 'react'
import type { DragEvent } from 'react'
import { fetchPodLog, importConfiguredPodLog } from './importLog'
import type { PodLog } from './importLog'

type LoadState =
  | { kind: 'loading' }
  | { kind: 'ready'; log: PodLog }
  | { kind: 'error'; message: string }

export function PodLogSummary({ log }: { log: PodLog }) {
  return (
    <>
      <p>
        {log.simulated && <span className="evidence-tag evidence-tag--simulated">simulated</span>}
        {' '}{log.goodLines} good lines, {log.badLines} bad lines, {log.excludedLines} excluded
      </p>
      {log.calibration.reflectivity.note && <p>Reflectivity correction factor not measured.</p>}
      {log.calibration.airTemperature.note && <p>Air temperature offset not measured.</p>}
    </>
  )
}

export function PodLogPanel() {
  const [state, setState] = useState<LoadState>({ kind: 'loading' })
  const latestLoad = useRef(0)

  useEffect(() => {
    const controller = new AbortController()
    const load = ++latestLoad.current
    void fetchPodLog(controller.signal).then(
      log => {
        if (load === latestLoad.current && !controller.signal.aborted) setState({ kind: 'ready', log })
      },
      (error: unknown) => {
        if (load === latestLoad.current && !controller.signal.aborted) {
          setState({ kind: 'error', message: error instanceof Error ? error.message : 'Could not load pod log' })
        }
      },
    )
    return () => {
      controller.abort()
      latestLoad.current++
    }
  }, [])

  async function openFile(file: File) {
    const load = ++latestLoad.current
    setState({ kind: 'loading' })
    try {
      const log = importConfiguredPodLog(await file.text())
      if (load === latestLoad.current) setState({ kind: 'ready', log })
    } catch (error) {
      if (load === latestLoad.current) {
        setState({ kind: 'error', message: error instanceof Error ? error.message : 'Could not open pod log' })
      }
    }
  }

  function dropFile(event: DragEvent<HTMLElement>) {
    event.preventDefault()
    const file = event.dataTransfer.files[0]
    if (file) void openFile(file)
  }

  return (
    <section aria-labelledby="pod-log-title" onDragOver={event => event.preventDefault()} onDrop={dropFile}>
      <h2 id="pod-log-title">Pod log</h2>
      <label>
        Drop a pod CSV here or choose a file{' '}
        <input type="file" accept=".csv,text/csv" onChange={event => {
          const file = event.currentTarget.files?.[0]
          if (file) void openFile(file)
          event.currentTarget.value = ''
        }} />
      </label>
      <div role="status">
        {state.kind === 'loading' && <p>Loading pod log…</p>}
        {state.kind === 'error' && <p>{state.message}</p>}
        {state.kind === 'ready' && <PodLogSummary log={state.log} />}
      </div>
    </section>
  )
}
