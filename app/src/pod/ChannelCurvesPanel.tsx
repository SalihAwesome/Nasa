import { useEffect, useMemo, useRef, useState } from 'react'
import uPlot from 'uplot'
import { buildChannelComparisons, loadCurveSources } from './channelCurves'
import type { ChannelComparison, CurveSources } from './channelCurves'
import type { PodLog } from './importLog'
import 'uplot/dist/uPlot.min.css'
import './channelCurves.css'

const number = (value: number) => value.toLocaleString('en', { maximumFractionDigits: 3 })

function ChannelChart({ chart, simulated }: { chart: ChannelComparison; simulated: boolean }) {
  const mount = useRef<HTMLDivElement>(null)
  const [readingsOpen, setReadingsOpen] = useState(false)
  const curves = useMemo(() => [chart.pod, chart.satellite, chart.meda], [chart])
  const hasValues = curves.some(curve => curve.points.some(point => point.value !== null))

  useEffect(() => {
    const element = mount.current
    if (!element) return
    const style = getComputedStyle(element)
    const token = (name: string) => style.getPropertyValue(name).trim()
    const font = `${style.fontSize} ${style.fontFamily}`
    const axis = { font, labelFont: font, stroke: token('--color-muted'), grid: { stroke: token('--color-border') }, ticks: { stroke: token('--color-border') } }
    const tables: uPlot.AlignedData[] = curves.map(curve => [curve.points.map(point => point.hour), curve.points.map(point => point.value)])
    // Expand explicit gaps across alignment-only undefined values. No values are filled.
    const data = uPlot.join(tables, curves.map(() => [0, 2]))
    const isolatedPoints = curves.map(curve => {
      const hours = new Set(curve.points.filter((point, index, points) => point.value !== null &&
        (index === 0 || points[index - 1].value === null) &&
        (index === points.length - 1 || points[index + 1].value === null)).map(point => point.hour))
      return Array.from(data[0]).flatMap((hour, index) => hours.has(hour) ? [index] : [])
    })
    const colors = [token('--color-pod'), token('--color-satellite'), token('--color-mars')]
    const dashes = [[], [8, 5], [2, 4]]
    const width = () => Math.max(1, Math.floor(element.clientWidth))
    const plot = new uPlot({
      width: width(), height: 290,
      scales: { x: { time: false, range: [0, 24] }, meda: {} },
      legend: { show: false }, cursor: { drag: { setScale: false } },
      axes: [
        { ...axis, label: 'Local mean solar time (hours)', splits: () => [0, 6, 12, 18, 24] },
        { ...axis, label: chart.unit, size: 52 },
        ...(chart.separateMedaAxis ? [{ ...axis, scale: 'meda', side: 1 as const, label: `MEDA (${chart.medaUnit ?? 'unit unstated'})`, size: 52, grid: { show: false }, stroke: token('--color-mars') }] : []),
      ],
      series: [
        {},
        ...curves.map((curve, index): uPlot.Series => ({
          label: curve.label, stroke: colors[index], width: 2, dash: dashes[index],
          scale: index === 2 && chart.separateMedaAxis ? 'meda' : 'y', spanGaps: false,
          // A lone saved sample has no line segment. Keep it visible as a point.
          points: { show: false, size: 5, filter: () => isolatedPoints[index].length ? isolatedPoints[index] : null },
        })),
      ],
    }, data, element)
    const observer = new ResizeObserver(() => plot.setSize({ width: width(), height: 290 }))
    observer.observe(element)
    return () => { observer.disconnect(); plot.destroy() }
  }, [chart, curves])

  const bar = chart.errorBar
  return <figure className="channel-curve" data-channel={chart.id}>
    <figcaption>
      <div className="channel-curve-heading">
        <h3>{chart.label}</h3>
        {simulated && <span className="evidence-tag evidence-tag--simulated">simulated</span>}
      </div>
      {bar.kind === 'missing' ? <p>Satellite gap unavailable. {bar.reason}</p>
        : <p data-chart-gap={bar.gap}>Satellite gap <strong>{number(bar.gap)} {chart.unit}</strong> ({bar.basis})
          {bar.kind === 'gap-and-offset' && <span className="channel-curve-offset">Error bar ±{number(bar.gap + bar.offset)} {chart.unit}, including {number(bar.offset)} {chart.unit} absolute air-temperature offset.</span>}
        </p>}
    </figcaption>
    <ul className="channel-curve-key" aria-label={`${chart.label} sources`}>
      {curves.map((curve, index) => curve.points.some(point => point.value !== null)
        && <li key={curve.label} className={`channel-source-${index}`}><i aria-hidden="true" />{curve.label}</li>)}
    </ul>
    {hasValues ? <div ref={mount} className="channel-curve-plot" role="img" aria-label={`${chart.label} versus local mean solar time from 0 to 24 hours. ${chart.separateMedaAxis ? 'MEDA uses the labelled right axis.' : 'Sources share the left axis.'} Exact readings are available below.`} />
      : <p>No readings are available for this channel.</p>}
    <div className="channel-curve-notes">
      {chart.note && <p>{chart.note}</p>}
      {chart.gapReferenceNote && <p>{chart.gapReferenceNote}</p>}
      {chart.satellite.note && <p>{chart.satellite.note}</p>}
      {chart.meda.note && <p>MEDA. {chart.meda.note}</p>}
      {chart.separateMedaAxis && <p>MEDA uses the right axis. Compare values against their labelled scales.</p>}
    </div>
    <details onToggle={event => setReadingsOpen(event.currentTarget.open)}>
      <summary>View exact readings</summary>
      {readingsOpen && <div className="channel-readings" tabIndex={0} role="region" aria-label={`${chart.label} readings`}>
        {curves.map((curve, index) => <table key={curve.label}>
          <caption>{curve.label}{index === 2 ? ` (${chart.medaUnit ?? 'unit unstated'})` : ` (${chart.unit})`}</caption>
          <thead><tr><th scope="col">Solar hour</th><th scope="col">Value</th></tr></thead>
          <tbody>{curve.points.map((point, pointIndex) => <tr key={pointIndex}><td>{number(point.hour)}</td><td>{point.value === null ? point.reason ?? 'Unavailable' : String(point.value)}</td></tr>)}</tbody>
        </table>)}
      </div>}
    </details>
  </figure>
}

export function ChannelCurves({ log, sources }: { log: PodLog; sources: CurveSources }) {
  const charts = useMemo(() => buildChannelComparisons(log, sources), [log, sources])
  return <section className="channel-comparisons" aria-labelledby="channel-comparisons-heading">
    <h2 id="channel-comparisons-heading">Pod, satellite and Mars</h2>
    <p>First 24 hours of the recording, aligned by local mean solar time. Satellite gaps use every imported record and the same calculation as the Qatar card.</p>
    <p>Pod and satellite time is UTC plus longitude divided by 15. MEDA uses LMST. Missing samples remain gaps.</p>
    {sources.site.reason && <p className="channel-comparison-site">{sources.site.reason}</p>}
    <a className="channel-card-link" href="#/card/pod">Open the saved Qatar card</a>
    <div className="channel-curves-grid">{charts.map(chart => <ChannelChart key={chart.id} chart={chart} simulated={log.simulated} />)}</div>
  </section>
}

type State = { kind: 'loading' } | { kind: 'ready'; sources: CurveSources } | { kind: 'error'; message: string }

export function GroundTruthCurves({ log }: { log: PodLog }) {
  const [state, setState] = useState<State>({ kind: 'loading' })
  const [attempt, setAttempt] = useState(0)
  useEffect(() => {
    const controller = new AbortController()
    setState({ kind: 'loading' })
    loadCurveSources(controller.signal).then(sources => {
      if (!controller.signal.aborted) setState({ kind: 'ready', sources })
    }).catch((error: unknown) => {
      if (!controller.signal.aborted) setState({ kind: 'error', message: error instanceof Error ? error.message : 'Could not load comparison curves' })
    })
    return () => controller.abort()
  }, [attempt])
  if (state.kind === 'loading') return <p role="status">Loading satellite and MEDA curves…</p>
  if (state.kind === 'error') return <p role="alert">{state.message} <button type="button" onClick={() => setAttempt(attempt + 1)}>Retry curves</button></p>
  return <ChannelCurves log={log} sources={state.sources} />
}
