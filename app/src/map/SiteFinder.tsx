import { useEffect, useMemo, useRef, useState } from 'react'
import testData from '../../../shared/tests.json'
import { loadRegistries } from '../data/registries'
import { cardHash } from '../card/cardData'
import { coverage } from '../score/combine'
import { cachedMapData } from './data'
import type { MapData } from './data'
import { computeScores, rankCells } from './model'
import type { TestDefinition } from './model'
import { EarthGlobe } from './EarthGlobe'
import { fieldSites } from './fieldSites'
import { loadPlaces, nearestPlace } from './places'
import type { Place } from './places'
import './map.css'

// Target/test names: docs/project-brief.md. Score scale: app/DESIGN.md.
const targetLabels: Record<string, string> = { jezero: 'Jezero crater · Mars', shackleton: 'Shackleton Connecting Ridge · Moon' }
const testLabels: Record<string, string> = { power: 'Power', mobility: 'Mobility', communications: 'Communications', navigation: 'Navigation', science_tools: 'Science tools' }
const definitions: TestDefinition[] = testData
const channels = loadRegistries().channels.filter(channel => channel.onCard)
const stops = ['0', '025', '05', '075', '1']
const noPlaces: Place[] = []
const monthLabels = Array.from({ length: 12 }, (_, index) => new Intl.DateTimeFormat('en', { month: 'long', timeZone: 'UTC' }).format(new Date(Date.UTC(2000, index))))

function TestAvailability() {
  return <details id="disabled-tests" className="test-availability"><summary>Test availability</summary>
    <ul>{definitions.filter(test => !test.enabled).map(test => <li key={test.id}><strong>{testLabels[test.id]}.</strong> {test.reason}</li>)}</ul>
  </details>
}

export function MapView({ data }: { data: MapData }) {
  const [targetId, setTargetId] = useState('jezero')
  const [testId, setTestId] = useState(definitions.find(test => test.enabled)!.id)
  const [month, setMonth] = useState(1)
  const [hovered, setHovered] = useState<number | null>(null)
  const [cities, setCities] = useState(noPlaces)
  useEffect(() => {
    let active = true
    loadPlaces().then(items => { if (active) setCities(items) }).catch(() => {})
    return () => { active = false }
  }, [])
  const changeStarted = useRef<number | null>(null)
  const target = data.targets.find(target => target.id === targetId)!
  const definition = definitions.find(test => test.id === testId)!
  const layer = data.months[month - 1]
  const sites = useMemo(() => fieldSites(data), [data])
  // Score and rank the shipped months when the target/test changes. Slider
  // updates reuse these results with the current globe orientation.
  const results = useMemo(() => data.months.map(layer => {
    const scores = computeScores(layer, target, data.targetNumbers[targetId], definition)
    return { scores, top: rankCells(scores), scoredCount: scores.filter(result => result.score !== null).length }
  }), [data.months, target, data.targetNumbers, targetId, definition])
  const { scores, top, scoredCount } = results[month - 1]
  const reasons = useMemo(() => [...new Set(Object.keys(definition.weights).flatMap(id => {
    const number = data.targetNumbers[targetId][id]
    return number?.value == null ? [`${id}: ${number?.reason ?? 'Target value is not available.'}`] : []
  }))], [definition, data.targetNumbers, targetId])

  function reportMonthChange() {
    const start = changeStarted.current
    if (start !== null) {
      changeStarted.current = null
      // Includes React work, scoring, ranking and canvas drawing up to the frame.
      requestAnimationFrame(() => console.info(`U10 month change: ${monthLabels[month - 1]}; ${(performance.now() - start).toFixed(1)} ms`))
    }
  }

  const coverageText = (missing: readonly string[]) => {
    const { scored, total } = coverage(missing, definition.weights)
    return `${scored} of ${total} quantities`
  }
  const cell = hovered === null ? null : data.cells[hovered]
  const nearby = useMemo(() => cell && nearestPlace(cell, cities), [cell, cities])
  const cellLink = (index: number) => cardHash({ site: { kind: 'cell', index }, target: target.id, test: testId, month })
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
    <div className="map-actions">
      <TestAvailability />
      <a href={`#/compare?${new URLSearchParams({ target: targetId, test: testId, month: String(month) })}`}>Compare sites</a>
    </div>
    <div className="map-layout">
      <section className="map-panel" aria-labelledby="map-title">
        <div className="map-caption"><h2 id="map-title">{monthLabels[month - 1]} land-cell matches</h2><span className="evidence-tag evidence-tag--estimate">estimate</span></div>
        <p className="map-meta">NASA POWER monthly climatology · {data.manifest.period.start.slice(0, 4)}–{data.manifest.period.end.slice(0, 4)} · {data.manifest.cellCount.toLocaleString('en')} land cells</p>
        <EarthGlobe data={data} scores={scores} sites={sites} cities={cities} onHover={setHovered}
          onOpen={index => { window.location.hash = cellLink(index) }} onDraw={reportMonthChange} />
        <div className="map-legend" aria-label="Match score legend"><span>Match</span>{stops.map((stop, index) => <span className="legend-item" key={stop}>
          <i style={{ background: `var(--color-score-${stop})` }} />{index / (stops.length - 1)}
        </span>)}<span className="legend-item"><i className="no-score-swatch" />No score</span></div>
        <div className="cell-readout" aria-live="polite">
          {cell && hovered !== null ? <><strong>{cell.lat.toFixed(2)}°, {cell.lon.toFixed(3)}°</strong>
            {nearby && <p>Nearest mapped place: {nearby.name} · {nearby.distanceKm} km away</p>}
            <span>{scores[hovered].score === null ? 'No score' : `Match ${scores[hovered].score.toFixed(3)} · ${coverageText(scores[hovered].missing)}`}</span>
            <dl>{channels.map(channel => <div key={channel.id}><dt>{channel.label}</dt><dd>{layer.layers[channel.id].values[hovered]?.toFixed(2) ?? layer.layers[channel.id].missingReason} {channel.unit}</dd></div>)}</dl>
            {scores[hovered].reason && <p>{scores[hovered].reason}</p>}
          </> : <p>Point to a land cell or choose an analog site to see its Earth estimates.</p>}
        </div>
      </section>
      <aside className="rank-panel" aria-labelledby="ranking-title">
        <h2 id="ranking-title">Top 20 cells</h2><p className="map-meta">{targetLabels[targetId]} · {testLabels[testId]} · {monthLabels[month - 1]}</p>
        <p className="map-meta" role="status">{scoredCount.toLocaleString('en')} cells with a score</p>
        {top.length ? <ol className="ranked-cells">{top.map(entry => <li key={entry.index}><a href={cellLink(entry.index)}>
          <span>{data.cells[entry.index].lat.toFixed(2)}°, {data.cells[entry.index].lon.toFixed(3)}°</span><strong>{entry.score.toFixed(3)}</strong>
          <small data-coverage={coverageText(entry.missing)}>{coverageText(entry.missing)}{entry.missing.length > 0 && ` · Missing: ${entry.missing.join(', ')}`}</small>
        </a></li>)}</ol> : <div className="missing-target"><h3>No score</h3><p>No cells can be ranked until a weighted quantity has both an Earth value and a target value.</p></div>}
        {reasons.length > 0 && <ul className="missing-reasons">{reasons.map(reason => <li key={reason}>{reason}</li>)}</ul>}
        <p className="map-meta">Weights and tolerances are defaults. Missing quantities are omitted from the weighted mean.</p>
        <p className="map-meta">Not built for this test: {definition.notBuilt.join(', ')}.</p>
      </aside>
    </div>
    <p className="map-meta">Land outline and place labels: Natural Earth. Grey cells have no score.</p>
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
  if (!data) return <><TestAvailability /><section className="placeholder" role="status"><h2>Not available yet</h2><p>Loading the map and all monthly layers from this build…</p></section></>
  return <MapView data={data} />
}
