import { useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react'
import { geoPath } from 'd3-geo'
import testData from '../../../shared/tests.json'
import { loadRegistries } from '../data/registries'
import { cachedMapData } from './data'
import type { MapData } from './data'
import { computeScores, hitCell, MAP_HEIGHT, MAP_WIDTH, projectCells, rankCells } from './model'
import type { TestDefinition } from './model'
import './map.css'

// Target/test names: docs/project-brief.md. Score scale: app/DESIGN.md.
const targetLabels: Record<string, string> = { jezero: 'Jezero crater · Mars', shackleton: 'Shackleton Connecting Ridge · Moon' }
const testLabels: Record<string, string> = { power: 'Power', mobility: 'Mobility', communications: 'Communications', navigation: 'Navigation', science_tools: 'Science tools' }
const definitions: TestDefinition[] = testData
const channels = loadRegistries().channels.filter(channel => channel.onCard)
const stops = ['0', '025', '05', '075', '1']
const monthLabels = Array.from({ length: 12 }, (_, index) => new Intl.DateTimeFormat('en', { month: 'long', timeZone: 'UTC' }).format(new Date(Date.UTC(2000, index))))

function palette(styles: CSSStyleDeclaration) {
  const colors = stops.map(stop => styles.getPropertyValue(`--color-score-${stop}`).trim())
  const rgb = colors.map(hex => [1, 3, 5].map(offset => Number.parseInt(hex.slice(offset, offset + 2), 16)))
  return Array.from({ length: 256 }, (_, index) => {
    const position = index / 255 * (rgb.length - 1), low = Math.min(Math.floor(position), rgb.length - 2), share = position - low
    return `rgb(${rgb[low].map((value, channel) => Math.round(value + (rgb[low + 1][channel] - value) * share)).join(',')})`
  })
}

export function MapView({ data }: { data: MapData }) {
  const [targetId, setTargetId] = useState('jezero')
  const [testId, setTestId] = useState(definitions.find(test => test.enabled)!.id)
  const [month, setMonth] = useState(1)
  const [hovered, setHovered] = useState<number | null>(null)
  const canvas = useRef<HTMLCanvasElement>(null)
  const changeStarted = useRef<number | null>(null)
  const target = data.targets.find(target => target.id === targetId)!
  const definition = definitions.find(test => test.id === testId)!
  const layer = data.months[month - 1]
  const projected = useMemo(() => projectCells(data.cells), [data.cells])
  const outline = useMemo(() => geoPath(projected.projection)(data.land) ?? '', [projected, data.land])
  // Score and rank the shipped months when the target/test changes. Slider
  // updates reuse these results as well as the projected positions.
  const results = useMemo(() => data.months.map(layer => {
    const scores = computeScores(layer, target, data.targetNumbers[targetId], definition)
    return { scores, top: rankCells(scores), scoredCount: scores.filter(result => result.score !== null).length }
  }), [data.months, target, data.targetNumbers, targetId, definition])
  const { scores, top, scoredCount } = results[month - 1]
  const reasons = useMemo(() => [...new Set(Object.keys(definition.weights).flatMap(id => {
    const number = data.targetNumbers[targetId][id]
    return number?.value == null ? [`${id}: ${number?.reason ?? 'Target value is not available.'}`] : []
  }))], [definition, data.targetNumbers, targetId])

  useLayoutEffect(() => {
    const element = canvas.current, ctx = element?.getContext('2d')
    if (!ctx || !element) return
    const ratio = window.devicePixelRatio || 1
    element.width = MAP_WIDTH * ratio
    element.height = MAP_HEIGHT * ratio
    ctx.scale(ratio, ratio)
    const styles = getComputedStyle(element), colors = palette(styles)
    ctx.clearRect(0, 0, MAP_WIDTH, MAP_HEIGHT)
    const missing = styles.getPropertyValue('--color-no-score').trim()
    projected.positions.forEach(([x, y], index) => {
      const value = scores[index].score
      ctx.fillStyle = value === null ? missing : colors[Math.round(value * 255)]
      ctx.fillRect(x - 1, y - 1, 2, 2)
    })
    ctx.beginPath()
    geoPath(projected.projection, ctx)(data.land)
    ctx.strokeStyle = styles.getPropertyValue('--color-text').trim()
    ctx.lineWidth = 0.5
    ctx.stroke()
    const start = changeStarted.current
    if (start !== null) {
      changeStarted.current = null
      // Includes React work, scoring, ranking and canvas drawing up to the frame.
      const frame = requestAnimationFrame(() => console.info(`U10 month change: ${monthLabels[month - 1]}; ${(performance.now() - start).toFixed(1)} ms`))
      return () => cancelAnimationFrame(frame)
    }
  }, [projected, scores, data.land, month])

  function pointerCell(event: React.PointerEvent<HTMLCanvasElement> | React.MouseEvent<HTMLCanvasElement>) {
    const rect = event.currentTarget.getBoundingClientRect()
    return hitCell(projected.positions, (event.clientX - rect.left) / rect.width * MAP_WIDTH, (event.clientY - rect.top) / rect.height * MAP_HEIGHT)
  }

  const cell = hovered === null ? null : data.cells[hovered]
  return <div className="site-finder">
    <div className="map-controls">
      <label>Target<select value={targetId} onChange={event => { setTargetId(event.target.value); setHovered(null) }}>
        {data.targets.map(target => <option key={target.id} value={target.id}>{targetLabels[target.id]}</option>)}
      </select></label>
      <label>Test<select value={testId} onChange={event => setTestId(event.target.value)} aria-describedby="disabled-tests">
        {definitions.map(test => <option key={test.id} value={test.id} disabled={!test.enabled} title={test.reason}>
          {testLabels[test.id]}{!test.enabled ? ` — ${test.reason}` : ''}
        </option>)}
      </select></label>
      <label className="month-control" htmlFor="map-month">Month <output htmlFor="map-month">{monthLabels[month - 1]}</output>
        <input id="map-month" aria-valuetext={monthLabels[month - 1]} type="range" min="1" max={data.months.length} step="1" value={month}
          onChange={event => { changeStarted.current = performance.now(); setMonth(Number(event.target.value)) }} />
      </label>
    </div>
    <details id="disabled-tests" className="test-availability"><summary>Test availability</summary>
      <ul>{definitions.filter(test => !test.enabled).map(test => <li key={test.id}><strong>{testLabels[test.id]}.</strong> {test.reason}</li>)}</ul>
    </details>
    <div className="map-layout">
      <section className="map-panel" aria-labelledby="map-title">
        <div className="map-caption"><h2 id="map-title">{monthLabels[month - 1]} land-cell matches</h2><span className="evidence-tag evidence-tag--estimate">estimate</span></div>
        <p className="map-meta">NASA POWER monthly climatology · {data.manifest.period.start.slice(0, 4)}–{data.manifest.period.end.slice(0, 4)} · {data.manifest.cellCount.toLocaleString('en')} land cells</p>
        <canvas ref={canvas} className="world-map" role="img" aria-label="World map of land-cell match scores. Select a land cell to open its fidelity card. Ranked cells are linked beside the map."
          onPointerMove={event => setHovered(pointerCell(event))} onPointerLeave={() => setHovered(null)}
          onClick={event => { const index = pointerCell(event); if (index !== null) window.location.hash = `/card/cell/${index}` }} />
        <div className="map-legend" aria-label="Match score legend"><span>Match</span>{stops.map((stop, index) => <span className="legend-item" key={stop}>
          <i style={{ background: `var(--color-score-${stop})` }} />{index / (stops.length - 1)}
        </span>)}<span className="legend-item"><i className="no-score-swatch" />No score</span></div>
        <p className="map-meta">Equal Earth projection (default). Select a cell on the map or a ranked row to open its card.</p>
        <div className="cell-readout" aria-live="polite">
          {cell && hovered !== null ? <><strong>{cell.lat.toFixed(2)}°, {cell.lon.toFixed(3)}°</strong>
            <span>{scores[hovered].score === null ? 'No score' : `Match ${scores[hovered].score.toFixed(3)}`}</span>
            <dl>{channels.map(channel => <div key={channel.id}><dt>{channel.label}</dt><dd>{layer.layers[channel.id].values[hovered]?.toFixed(2) ?? layer.layers[channel.id].missingReason} {channel.unit}</dd></div>)}</dl>
            {scores[hovered].reason && <p>{scores[hovered].reason}</p>}
          </> : <p>Point to a land cell to inspect its Earth estimates.</p>}
        </div>
      </section>
      <aside className="rank-panel" aria-labelledby="ranking-title">
        <h2 id="ranking-title">Top 20 cells</h2><p className="map-meta">{targetLabels[targetId]} · {testLabels[testId]} · {monthLabels[month - 1]}</p>
        <p className="map-meta" role="status">{scoredCount.toLocaleString('en')} cells with a score</p>
        {top.length ? <ol className="ranked-cells">{top.map(entry => <li key={entry.index}><a href={`#/card/cell/${entry.index}`}>
          <span>{data.cells[entry.index].lat.toFixed(2)}°, {data.cells[entry.index].lon.toFixed(3)}°</span><strong>{entry.score.toFixed(3)}</strong>
          {entry.missing.length > 0 && <small>Missing: {entry.missing.join(', ')}</small>}
        </a></li>)}</ol> : <div className="missing-target"><h3>No score</h3><p>No cells can be ranked until a weighted quantity has both an Earth value and a target value.</p></div>}
        {reasons.length > 0 && <ul className="missing-reasons">{reasons.map(reason => <li key={reason}>{reason}</li>)}</ul>}
        <p className="map-meta">Weights and tolerances are defaults. Missing quantities are omitted from the weighted mean.</p>
        <p className="map-meta">Not built for this test: {definition.notBuilt.join(', ')}.</p>
      </aside>
    </div>
    <p className="map-meta">Land outline: Natural Earth. A grey cell has no score; it does not mean a zero match.</p>
    {/* Outline computed once with the positions; included as a noninteractive fallback. */}
    <noscript><svg viewBox={`0 0 ${MAP_WIDTH} ${MAP_HEIGHT}`} aria-label="Land outline"><path d={outline} /></svg></noscript>
  </div>
}

export default function SiteFinder() {
  const [data, setData] = useState<MapData | null>(null)
  const [error, setError] = useState<string | null>(null)
  useEffect(() => {
    let active = true
    cachedMapData().then(value => { if (active) setData(value) }).catch(error => { if (active) setError(String(error)) })
    return () => { active = false }
  }, [])
  if (error) return <section className="placeholder" role="alert"><h2>Map could not load</h2><p>{error}</p><button onClick={() => window.location.reload()}>Retry</button></section>
  if (!data) return <section className="placeholder" role="status"><h2>Not available yet</h2><p>Loading the map and all monthly layers from this build…</p></section>
  return <MapView data={data} />
}
