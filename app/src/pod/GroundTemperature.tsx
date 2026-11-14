import { useEffect, useMemo, useRef } from 'react'
import uPlot from 'uplot'
import type { PodLog } from './importLog'
import bands from '../../../shared/ground_temperature_bands.json'
import 'uplot/dist/uPlot.min.css'
import './groundTemperature.css'

const minute = 60_000
const day = 24 * 60 * minute // One recording day, as specified in docs/mission-plan.md.
const clock = new Intl.DateTimeFormat('en-GB', { timeZone: 'UTC', hour: '2-digit', minute: '2-digit' })

function compare(log: PodLog) {
  const ordered = log.records.map(row => ({ ...row, time: Date.parse(row.ts) })).sort((a, b) => a.time - b.time)
  const start = ordered[0]?.time
  const rows = ordered.filter(row => row.time < start + day)
  const series: [number[], (number | null)[], (number | null)[]] = [[], [], []]
  const surface = { peak: -Infinity, low: Infinity, time: 0, count: 0 }
  const depth = { ...surface }
  function observe(summary: typeof surface, time: number, value: number | null) {
    if (value === null) return
    if (value > summary.peak) { summary.peak = value; summary.time = time }
    summary.low = Math.min(summary.low, value)
    summary.count++
  }
  let previous: number | undefined
  for (const { time, tg, t10 } of rows) {
    // The pod records one-minute averages. Keep gaps from excluded or missing rows visible.
    if (previous !== undefined && time - previous > minute) {
      series[0].push((previous + minute) / 1000)
      series[1].push(null)
      series[2].push(null)
    }
    series[0].push(time / 1000)
    series[1].push(tg)
    series[2].push(t10)
    observe(surface, time, tg)
    observe(depth, time, t10)
    previous = time
  }
  const missing = surface.count === 0 ? 'No surface readings.' : depth.count === 0
    ? 'No readings at 10 cm.' : Math.min(surface.count, depth.count) < 2
      ? 'Each sensor needs at least two readings in the comparison window.' : null
  const surfaceRange = surface.peak - surface.low
  const depthRange = depth.peak - depth.low
  const ratio = missing || surfaceRange === 0 ? null : depthRange / surfaceRange
  const delay = missing || surfaceRange === 0 || depthRange === 0 ? null : (depth.time - surface.time) / minute
  return {
    series, delay, ratio, missing,
    delayReason: missing ?? 'A constant temperature series has no distinct peak.',
    ratioReason: missing ?? 'The surface range is zero.',
  }
}

export function GroundTemperature({ log }: { log: PodLog }) {
  const comparison = useMemo(() => compare(log), [log])
  const mount = useRef<HTMLDivElement>(null)
  const { series, delay, ratio } = comparison

  useEffect(() => {
    const element = mount.current
    if (!element) return
    const styles = getComputedStyle(element)
    const token = (name: string) => styles.getPropertyValue(name).trim()
    const width = () => Math.max(1, Math.floor(element.clientWidth))
    const cold = token('--color-temperature-cold')
    const mild = token('--color-temperature-mild')
    const warm = token('--color-temperature-warm')
    const axis = { stroke: token('--color-temperature-text'), grid: { stroke: token('--color-temperature-grid') },
      ticks: { stroke: token('--color-temperature-grid') } }
    const temperatureStroke = (chart: uPlot) => {
      const { top, height } = chart.bbox
      if (height <= 0) return mild
      const warmStop = (chart.valToPos(bands.warmFromC, 'y', true) - top) / height
      const coldStop = (chart.valToPos(bands.coldBelowC, 'y', true) - top) / height
      if (warmStop >= 1) return warm
      if (coldStop <= 0) return cold
      const gradient = chart.ctx.createLinearGradient(0, top, 0, top + height)
      gradient.addColorStop(0, warmStop > 0 ? warm : mild)
      if (warmStop > 0) {
        gradient.addColorStop(warmStop, warm)
        gradient.addColorStop(warmStop, mild)
      }
      if (coldStop < 1) {
        gradient.addColorStop(coldStop, mild)
        gradient.addColorStop(coldStop, cold)
      }
      gradient.addColorStop(1, coldStop < 1 ? cold : mild)
      return gradient
    }
    const plot = new uPlot({
      width: width(),
      height: 285,
      scales: { x: { time: false } },
      legend: { show: false },
      cursor: { drag: { setScale: false } },
      axes: [
        { ...axis, label: 'Time (UTC)',
          values: (_plot, ticks) => ticks.map(tick => clock.format(tick * 1000)) },
        { ...axis, label: 'Temperature (°C)' },
      ],
      series: [
        {},
        { label: 'Ground surface', stroke: temperatureStroke, width: 3.5, spanGaps: false },
        { label: '10 cm below ground', stroke: temperatureStroke, width: 3, dash: [8, 5], spanGaps: false },
      ],
    }, series, element)
    const observer = new ResizeObserver(() => plot.setSize({ width: width(), height: 285 }))
    observer.observe(element)
    return () => { observer.disconnect(); plot.destroy() }
  }, [series])

  return <section className="ground-temperature" aria-labelledby="ground-temperature-heading">
    <div className="ground-temperature-heading">
      <h2 id="ground-temperature-heading">Ground temperature at two depths</h2>
      {log.simulated && <span className="evidence-tag evidence-tag--simulated">simulated</span>}
    </div>
    <p className="ground-temperature-note">First 24 hours of the recording · UTC</p>
    <div className="ground-temperature-metrics">
      <div><h3>Peak delay at 10 cm</h3>
        <strong data-metric="delay">{delay === null ? 'Unavailable' : Number(Math.abs(delay).toFixed(2)) + ' min'}</strong>
        <p>{delay === null ? comparison.delayReason : delay === 0 ? 'The peaks coincide.' : 'The 10 cm peak occurred ' + (delay > 0 ? 'after' : 'before') + ' the surface peak.'}</p>
      </div>
      <div><h3>Temperature range ratio</h3>
        <strong data-metric="range-ratio">{ratio === null ? 'Unavailable' : ratio.toFixed(2) + '×'}</strong>
        <p>{ratio === null ? comparison.ratioReason : 'Range at 10 cm divided by the surface range.'}</p>
      </div>
    </div>
    <div className="ground-temperature-chart">
    <div className="ground-temperature-legend">
      <span><i />Ground surface</span>
      <span><i />10 cm below ground</span>
    </div>
    <div className="ground-temperature-bands" aria-label="Temperature color bands">
      <span className="temperature-cold"><i />Cold: below {bands.coldBelowC}°C</span>
      <span className="temperature-mild"><i />Mild: {bands.coldBelowC} to below {bands.warmFromC}°C</span>
      <span className="temperature-warm"><i />Warm: {bands.warmFromC}°C and up</span>
    </div>
    {series[1].some(value => value !== null) || series[2].some(value => value !== null)
      ? <div ref={mount} className="ground-temperature-plot" role="img" aria-label="Ground surface and 10 cm temperature versus UTC time, using a common Celsius scale." />
      : <p>No ground temperature readings in this recording.</p>}
    </div>
  </section>
}
