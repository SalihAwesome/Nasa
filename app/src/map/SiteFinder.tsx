import { useEffect, useMemo, useRef, useState } from 'react'
import { ArrowUpRight, Crosshair, Globe2, SlidersHorizontal } from 'lucide-react'
import testData from '../../../shared/tests.json'
import { loadRegistries } from '../data/registries'
import { cardHash } from '../card/cardData'
import { matchPercent, displayReading } from '../score/format'
import { terrainSettings } from '../data/terrain'
import { coverage } from '../score/combine'
import { cachedMapData } from './data'
import type { MapData } from './data'
import { computeScores, rankCells } from './model'
import type { TestDefinition } from './model'
import { EarthGlobe } from './EarthGlobe'
import { fieldSites } from './fieldSites'
import { loadPlaces, nearestPlace } from './places'
import type { Place } from './places'
import { TargetPicker } from './TargetPicker'
import { isMissionReference, missionNumbers, missionReference, pointParams, readTargetPoint } from './missionTarget'
import type { Planet } from '../data/planetary'
import type { Cell } from './model'
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
    <ul>{definitions.filter(test => test.reason).map(test => <li key={test.id}><strong>{testLabels[test.id]}.</strong> {test.reason}</li>)}</ul>
  </details>
}

export function MapView({ data }: { data: MapData }) {
  const params = new URLSearchParams(typeof window === 'undefined' ? '' : window.location.hash.split('?')[1])
  const [targetId, setTargetId] = useState(params.get('target') === 'shackleton' ? 'shackleton' : 'jezero')
  const body: Planet = targetId === 'jezero' ? 'mars' : 'moon'
  const [point, setPoint] = useState<Cell>(() => {
    try { return readTargetPoint(params) ?? missionReference(data, body) } catch { return missionReference(data, body) }
  })
  const [testId, setTestId] = useState(definitions.find(test => test.enabled && test.id === params.get('test'))?.id ?? definitions.find(test => test.enabled)!.id)
  const requestedMonth = Number(params.get('month') ?? 1)
  const [month, setMonth] = useState(Number.isInteger(requestedMonth) && requestedMonth >= 1 && requestedMonth <= 12 ? requestedMonth : 1)
  const [hovered, setHovered] = useState<number | null>(null)
  const [rankPage, setRankPage] = useState(0)
  const [cities, setCities] = useState(noPlaces)
  useEffect(() => {
    let active = true
    loadPlaces().then(items => { if (active) setCities(items) }).catch(() => {})
    return () => { active = false }
  }, [])
  const changeStarted = useRef<number | null>(null)
  const target = data.targets.find(target => target.id === targetId)!
  const definition = definitions.find(test => test.id === testId)!
  const numbers = useMemo(() => missionNumbers(data, body, point), [data, body, point])
  const reference = isMissionReference(data, body, point)
  const targetLabel = reference ? targetLabels[targetId] : `${body === 'moon' ? 'Moon' : 'Mars'} · ${point.lat.toFixed(2)}°, ${point.lon.toFixed(2)}°`
  useEffect(() => {
    const query = new URLSearchParams({ target: targetId, test: testId, month: String(month), ...pointParams(point) })
    window.history.replaceState(null, '', '#/map?' + query)
  }, [targetId, testId, month, point])
  const layer = data.months[month - 1]
  const sites = useMemo(() => fieldSites(data), [data])
  // A point selection needs only the current month. Cache visited months rather
  // than blocking every surface click on twelve complete global rankings.
  const results = useMemo(() => new Map<number, {
    scores: ReturnType<typeof computeScores>; top: ReturnType<typeof rankCells>; scoredCount: number; tiedAtTop: number
  }>(), [data.months, target, numbers, definition])
  let result = results.get(month)
  if (!result) {
    const scores = computeScores(layer, target, numbers, definition)
    const top = rankCells(scores, data.cells)
    result = { scores, top, scoredCount: scores.filter(row => row.score !== null).length,
      tiedAtTop: top.length ? scores.filter(row => row.score === top[0].score).length : 0 }
    results.set(month, result)
  }
  const { scores, top, scoredCount, tiedAtTop } = result
  const rowsPerPage = 5
  const rankPages = Math.max(1, Math.ceil(top.length / rowsPerPage))
  const visibleRankPage = Math.min(rankPage, rankPages - 1)
  const commonMissing = top.length ? top[0].missing.filter(id => top.every(entry => entry.missing.includes(id))) : []
  const rankContext = `${targetId}/${point.lat}/${point.lon}/${testId}/${month}`
  useEffect(() => { setRankPage(0) }, [rankContext])
  const reasons = useMemo(() => [...new Set(Object.keys(definition.weights).flatMap(id => {
    const number = numbers[id]
    return number?.value == null ? [id === 'uv'
      ? 'UV index: no compatible local UV-index dataset. Recorded UV detector flux is a different quantity and cannot be substituted. ' + (number?.reason ?? '')
      : `${id}: ${number?.reason ?? 'Target value is not available.'}`] : []
  }))], [definition, numbers])

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
  const cellLink = (index: number) => cardHash({ site: { kind: 'cell', index }, target: target.id, test: testId, month, ...(!reference ? { targetPoint: point } : {}) })
  return <div className="site-finder">
    <div className="planning-heading"><SlidersHorizontal aria-hidden="true" size={17} /><h2>Plan your field test</h2><span>Change a setting to update the matches</span></div>
    <TargetPicker data={data} body={body} point={point} onChange={(body, point) => {
      setTargetId(body === 'mars' ? 'jezero' : 'shackleton'); setPoint(point); setHovered(null)
    }} />
    <div className="map-controls">
      <div className="selected-mission"><span>Mission target</span><strong>{targetLabel}</strong></div>
      <label>Equipment test<select value={testId} onChange={event => setTestId(event.target.value)} aria-describedby="disabled-tests">
        {definitions.map(test => <option key={test.id} value={test.id} disabled={!test.enabled} title={test.reason}>
          {testLabels[test.id]}{!test.enabled ? ' (unavailable)' : ''}
        </option>)}
      </select></label>
      <label className="month-control" htmlFor="map-month">Test month <output htmlFor="map-month">{monthLabels[month - 1]}</output>
        <input id="map-month" aria-valuetext={monthLabels[month - 1]} type="range" min="1" max={data.months.length} step="1" value={month}
          onChange={event => { changeStarted.current = performance.now(); setMonth(Number(event.target.value)) }} />
        <span className="month-endpoints" aria-hidden="true"><span>{monthLabels[0].slice(0, 3)}</span><span>{monthLabels[monthLabels.length - 1].slice(0, 3)}</span></span>
      </label>
    </div>
    {definition.reason && <p className="map-meta" role="status">{definition.reason}</p>}
    <div className="map-actions">
      <TestAvailability />
      <a href={`#/compare?${new URLSearchParams({ target: targetId, test: testId, month: String(month), ...pointParams(point) })}`}>Compare sites <ArrowUpRight aria-hidden="true" size={16} /></a>
    </div>
    <div className="map-layout">
      <section className="map-panel" aria-labelledby="map-title">
        <div className="map-panel-heading"><div className="map-caption"><Globe2 aria-hidden="true" size={19} /><h2 id="map-title">Earth test site map for {monthLabels[month - 1]}</h2><span className="evidence-tag evidence-tag--estimate">estimate</span></div>
        <p className="map-meta">NASA POWER · {data.manifest.period.start.slice(0, 4)}–{data.manifest.period.end.slice(0, 4)} monthly climatology · {data.manifest.cellCount.toLocaleString('en')} land cells</p></div>
        <EarthGlobe data={data} scores={scores} sites={sites} cities={cities} onHover={setHovered}
          onOpen={index => { window.location.hash = cellLink(index) }} onDraw={reportMonthChange} />
        <p className="section-explanation">{import.meta.env.VITE_GOOGLE_MAPS_API_KEY && 'In Match colors, '}{import.meta.env.VITE_GOOGLE_MAPS_API_KEY ? 'the' : 'The'} colors show how closely each area matches the chosen mission target. 100% is the closest match on this index; it is not a probability of mission success. Select an area to see its conditions.</p>
        <div className="map-legend" aria-label="Match score legend"><span>Match</span>{stops.map((stop, index) => <span className="legend-item" key={stop}>
          <i style={{ background: `var(--color-score-${stop})` }} />{matchPercent(index / (stops.length - 1))}
        </span>)}<span className="legend-item"><i className="no-score-swatch" />No score</span></div>
        <div className="cell-readout" aria-live="polite">
          {cell && hovered !== null ? <><strong>{cell.lat.toFixed(2)}°, {cell.lon.toFixed(3)}°</strong>
            {nearby && <p>Nearest mapped place: {nearby.name} · {nearby.distanceKm} km away</p>}
            <span>{scores[hovered].score === null ? 'No score' : `Match ${matchPercent(scores[hovered].score)} · ${coverageText(scores[hovered].missing)}`}</span>
            <dl>{channels.map(channel => { const reading = layer.layers[channel.id]; const value = reading.values[hovered]; return <div key={channel.id}><dt>{channel.label}</dt><dd>{value === null ? reading.missingReason : displayReading(value, reading.unit)}</dd></div> })}</dl>
            {scores[hovered].reason && <p>{scores[hovered].reason}</p>}
          </> : <p className="readout-empty"><Crosshair aria-hidden="true" size={20} /><span><strong>A closer look starts with a location</strong>Point to a land cell or choose an analog site to see its Earth estimates.</span></p>}
        </div>
      </section>
      <aside className="rank-panel" aria-labelledby="ranking-title">
        <div className="ranking-heading"><h2 id="ranking-title">20 highest-scoring Earth areas</h2><Crosshair aria-hidden="true" size={20} /></div>
        <p className="section-explanation">Open an area to inspect its conditions and missing measurements.</p>
        <div className="rank-context"><strong>{targetLabel}</strong><span>{testLabels[testId]} · {monthLabels[month - 1]}</span></div>
        <p className="map-meta rank-count" role="status">{scoredCount.toLocaleString('en')} cells with a score</p>
        {tiedAtTop > 1 && <p className="rank-tie-note">{tiedAtTop.toLocaleString('en')} areas share the top score of {matchPercent(top[0].score)}. The list spreads tied areas around the world rather than showing neighbours.</p>}
        {top.length ? <>
          <ol id="ranked-results" className="ranked-cells">{top.map((entry, index) => {
            const place = nearestPlace(data.cells[entry.index], cities)
            return <li key={entry.index} value={index + 1}
            hidden={Math.floor(index / rowsPerPage) !== visibleRankPage}>
            <a href={cellLink(entry.index)}>
              <span className="rank-number" aria-hidden="true">{index + 1}</span>
              <span className="rank-location">{place && <span className="rank-place"><span className="rank-name">{place.name}</span><span className="rank-place-distance">Nearest mapped place · {place.distanceKm.toLocaleString('en')} km</span></span>}<span className="rank-coordinates">{Math.abs(data.cells[entry.index].lat).toFixed(2)}° {data.cells[entry.index].lat < 0 ? 'S' : 'N'}<span className="coordinate-divider"> / </span>{Math.abs(data.cells[entry.index].lon).toFixed(3)}° {data.cells[entry.index].lon < 0 ? 'W' : 'E'}</span></span>
              <strong className="rank-score">{matchPercent(entry.score)}<span>match</span></strong>
              <small data-coverage={coverageText(entry.missing)} aria-label={coverageText(entry.missing)}>{coverage(entry.missing, definition.weights).scored} conditions compared{entry.missing.some(id => !commonMissing.includes(id)) && <span className="rank-missing">Missing: {entry.missing.filter(id => !commonMissing.includes(id)).map(id => channels.find(channel => channel.id === id)?.label ?? id).join(', ')}</span>}</small>
              <span className="rank-track" aria-hidden="true"><span style={{ width: `${(entry.score ?? 0) * 100}%` }} /></span>
            </a>
          </li>})}</ol>
          <div className="rank-pagination" aria-label="Ranked results pages">
            <button type="button" aria-controls="ranked-results" disabled={visibleRankPage === 0} onClick={() => setRankPage(page => Math.max(0, page - 1))}>Previous</button>
            <span role="status">{visibleRankPage + 1} / {rankPages}</span>
            <button type="button" aria-controls="ranked-results" disabled={visibleRankPage === rankPages - 1} onClick={() => setRankPage(page => Math.min(rankPages - 1, page + 1))}>Next</button>
          </div>
        </> : <div className="missing-target"><h3>No score</h3><p>No cells can be ranked until a weighted quantity has both an Earth value and a target value.</p></div>}
        <details className="ranking-notes"><summary>Data coverage &amp; limitations</summary>
          <p className="rank-coverage-note">{top[0] ? coverageText(top[0].missing) + ' contribute to the leading score.' : 'No comparable measurements.'}</p>
          {commonMissing.length > 0 && <p>Excluded from every score: {commonMissing.map(id => channels.find(channel => channel.id === id)?.label ?? id).join(', ')}.</p>}
          {reasons.length > 0 && <ul className="missing-reasons">{reasons.map(reason => <li key={reason}>{reason}</li>)}</ul>}
          <p className="map-meta">Weights and tolerances are defaults. Missing quantities are omitted from the weighted mean.</p>
          {definition.notBuilt.length > 0 && <p className="map-meta">Not included: {definition.notBuilt.join(', ')}.</p>}
          {definition.weights.slope && <p className="map-meta">{terrainSettings.note}</p>}
        </details>
      </aside>
    </div>
    <p className="map-meta">{import.meta.env.VITE_GOOGLE_MAPS_API_KEY && 'Match colors view: '}Land outline and place labels: Natural Earth. Grey cells have no score.</p>
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
  if (!data) return <><TestAvailability /><section className="placeholder map-loading" role="status"><h2>Loading the Earth test site map</h2><p>Preparing the globe and monthly match scores…</p><div className="map-loading-shape" aria-hidden="true"><Globe2 size={64} /></div></section></>
  return <MapView data={data} />
}
