import { useEffect, useId, useMemo, useState } from 'react'
import { cardHash, cardTests } from '../card/cardData'
import { matchPercent, displayReading, displayTolerance } from '../score/format'
import { coverage } from '../score/combine'
import { cachedMapData } from './data'
import type { MapData } from './data'
import { computeScores } from './model'
import type { Cell } from './model'
import { loadPlaces } from './places'
import type { Place } from './places'
import { PlanetGlobe, worldNames } from './PlanetGlobe'
import type { World } from './PlanetGlobe'
import { comparisonQuantities, locationName, locationPresets, readLocation } from './comparison'
import type { ComparisonLocation, ComparisonReading } from './comparison'
import { missionNumbers, readTargetPoint } from './missionTarget'

const worlds: World[] = ['earth', 'moon', 'mars']
const emptyPlaces: Place[] = []
const months = Array.from({ length: 12 }, (_, index) => new Intl.DateTimeFormat('en', {
  month: 'long', timeZone: 'UTC',
}).format(new Date(Date.UTC(2000, index))))

function LocationPicker({ label, value, data, cities, onChange }: {
  label: string; value: ComparisonLocation; data: MapData; cities: readonly Place[]
  onChange: (site: ComparisonLocation) => void
}) {
  const id = useId()
  const presets = useMemo(() => locationPresets(data), [data])
  const options = presets.filter(site => site.body === value.body)
  const landmarks = useMemo(() => {
    const saved = presets.filter(site => site.body === value.body)
    if (value.body !== 'earth') return saved
    if (import.meta.env.VITE_GOOGLE_MAPS_API_KEY) {
      // Google already labels cities. Reserve our pins for saved/selected sites.
      return saved.some(site => site.lat === value.lat && site.lon === value.lon) ? saved : [...saved, value]
    }
    return [...saved, ...cities.filter(place => place.rank <= 4)]
  }, [cities, presets, value])
  const [lat, setLat] = useState(String(value.lat))
  const [lon, setLon] = useState(String(value.lon))
  useEffect(() => { setLat(value.lat.toFixed(4)); setLon(value.lon.toFixed(4)) }, [value.lat, value.lon])
  function choose(point: Cell) {
    onChange({ body: value.body, ...point, name: locationName(value.body, point, cities, data) })
  }
  const selectedPreset = options.findIndex(site => Math.abs(value.lat - site.lat) < .0001 && Math.abs(value.lon - site.lon) < .0001)
  return <section className="location-picker" aria-labelledby={id}>
    <h2 id={id}>{label} · {worldNames[value.body]}</h2>
    <div className="location-selectors">
      <label>World<select aria-label={label + ' world'} value={value.body} onChange={event => {
        const body = worlds.find(world => world === event.target.value)
        const site = presets.find(site => site.body === body)
        if (site) onChange(site)
      }}>{worlds.map(world => <option value={world} key={world}>{worldNames[world]}</option>)}</select></label>
      <label>Saved reference location<select aria-label={label + ' reference location'} value={selectedPreset} onChange={event => {
        const site = options[Number(event.target.value)]
        if (site) onChange(site)
      }}>
        <option value={-1}>Point selected on globe</option>
        {options.map((site, index) => <option key={site.name} value={index}>{site.name}</option>)}
      </select></label>
    </div>
    <PlanetGlobe key={value.body} body={value.body} selection={value} landmarks={landmarks} onSelect={choose} />
    <p className="selected-location" role="status"><strong>{value.name}</strong><span>{value.lat.toFixed(4)}°, {value.lon.toFixed(4)}°</span></p>
    <form className="coordinate-form" onSubmit={event => {
      event.preventDefault()
      const latitude = Number(lat), longitude = Number(lon)
      if (lat.trim() && lon.trim() && Number.isFinite(latitude) && Number.isFinite(longitude)
        && Math.abs(latitude) <= 90 && Math.abs(longitude) <= 180) choose({ lat: latitude, lon: longitude })
    }}>
      <label>Latitude<input aria-label={label + ' latitude'} type="number" step="any" min={-90} max={90} required value={lat} onChange={event => setLat(event.target.value)} /></label>
      <label>Longitude<input aria-label={label + ' longitude'} type="number" step="any" min={-180} max={180} required value={lon} onChange={event => setLon(event.target.value)} /></label>
      <button type="submit">Use coordinates</button>
    </form>
  </section>
}

export function Reading({ item }: { item: ComparisonReading }) {
  if (item.value === null && item.supplement) return <>
    <strong>{displayReading(item.supplement.value, item.supplement.unit)}</strong>
    <small><a href={item.supplement.source} target="_blank" rel="noreferrer">{item.supplement.label} ↗</a></small>
    <details><summary>Source &amp; coverage</summary><small>{item.supplement.note}</small><small>Primary measurement not recorded. {item.reason}</small></details>
  </>
  return item.value === null ? <>Not recorded<small>{item.reason}</small></> : <>
    {displayReading(item.value, item.unit)}{item.unit === null && ' (unit unstated)'}
    {item.basis && <small>{item.basis}</small>}
    {item.evidence && <details><summary>Source &amp; unit</summary><small>{item.evidence.note} <a href={item.evidence.source} target="_blank" rel="noreferrer">Documentation ↗</a></small></details>}
  </>
}

export function Difference({ left, right }: { left: ComparisonReading; right: ComparisonReading }) {
  if (left.value !== null && right.value !== null && left.basis !== right.basis) {
    return <>Different humidity references<small>A common saturation reference is needed for subtraction.</small></>
  }
  if (left.value !== null && right.value !== null && left.unit !== null && left.unit === right.unit) {
    return <>{displayTolerance(Math.abs(left.value - right.value), left.unit)}</>
  }
  if (left.supplement || right.supplement) return <>Separate measurements<small>Different products; no direct difference.</small></>
  if (left.value !== null && right.value !== null) return <>Different units<small>These readings cannot be subtracted directly.</small></>
  return <>No paired measurement<small>A recorded value is needed at both locations.</small></>
}

function Comparison({ data, hash }: { data: MapData; hash: string }) {
  const params = new URLSearchParams(hash.split('?')[1])
  const presets = useMemo(() => locationPresets(data), [data])
  const pinnedIndex = Number(params.get('cell') ?? -1)
  const pinned = Number.isSafeInteger(pinnedIndex) ? data.cells[pinnedIndex] : undefined
  const [a, setA] = useState<ComparisonLocation>(() => pinned ? { ...pinned, body: 'earth', name: 'Selected Earth area' } : presets[0])
  const [b, setB] = useState<ComparisonLocation>(() => {
    const site = presets.find(site => site.body === (params.get('target') === 'shackleton' ? 'moon' : 'mars')) ?? presets[1]
    try { const point = readTargetPoint(params); return point ? { ...site, ...point, name: 'Selected mission point' } : site } catch { return site }
  })
  const [cities, setCities] = useState(emptyPlaces)
  const [cityError, setCityError] = useState(false)
  const requestedMonth = Number(params.get('month') ?? 1)
  const [month, setMonth] = useState(months[requestedMonth - 1] ? requestedMonth : 1)
  const [result, setResult] = useState<{ a: ComparisonLocation; b: ComparisonLocation; month: number } | null>(null)
  const [targetId, setTargetId] = useState(params.get('target') === 'shackleton' ? 'shackleton' : 'jezero')
  const tests = cardTests.filter(item => item.enabled)
  const [testId, setTestId] = useState(tests.find(item => item.id === params.get('test'))?.id ?? tests[0]?.id ?? 'power')

  useEffect(() => {
    let active = true
    loadPlaces().then(value => { if (active) setCities(value) }).catch(() => { if (active) setCityError(true) })
    return () => { active = false }
  }, [])
  const readings = useMemo(() => result && [readLocation(data, result.a, result.month), readLocation(data, result.b, result.month)], [data, result])
  const scoreRows = useMemo(() => {
    if (!result || !readings) return null
    const planet = result.b.body !== 'earth' ? result.b : result.a.body !== 'earth' ? result.a : null
    const selectedTarget = planet ? planet.body === 'mars' ? 'jezero' : 'shackleton' : targetId
    const target = data.targets.find(item => item.id === selectedTarget)
    const test = tests.find(item => item.id === testId)
    if (!target || !test) return null
    const numbers = planet && planet.body !== 'earth' ? missionNumbers(data, planet.body, planet) : data.targetNumbers[target.id]
    const scores = computeScores(data.months[result.month - 1], target, numbers, test)
    return { target, test, scores, planet }
  }, [data, readings, result, targetId, testId])

  const change = (setter: (site: ComparisonLocation) => void) => (site: ComparisonLocation) => { setter(site); setResult(null) }
  return <section className="compare-workspace" aria-label="Site comparison">
    {cityError && <p role="status">City labels could not load. Coordinates and saved locations are still available.</p>}
    <div className="comparison-globes">
      <LocationPicker label="Location A" value={a} data={data} cities={cities} onChange={change(setA)} />
      <LocationPicker label="Location B" value={b} data={data} cities={cities} onChange={change(setB)} />
    </div>
    <div className="compare-run">
      <label>Earth month<select aria-label="Earth comparison month" value={month} onChange={event => { setMonth(Number(event.target.value)); setResult(null) }}>
        {months.map((name, index) => <option value={index + 1} key={name}>{name}</option>)}
      </select></label>
      <button type="button" className="feature-primary" onClick={() => setResult({ a: { ...a }, b: { ...b }, month })}>Compare selected locations</button>
    </div>
    <p className="feature-muted">Earth values use monthly climate-grid estimates. Moon and Mars have global regional terrain and Sun data on a 1° grid. Local weather measurements are available only at their recorded sites.</p>
    <p className="feature-muted">Surface imagery: {import.meta.env.VITE_GOOGLE_MAPS_API_KEY ? 'Google Maps' : 'NASA Earth Observatory'} (Earth), NASA LRO (Moon), and USGS Viking MDIM 2.1 (Mars).</p>
    {result && readings && <section className="feature-panel" aria-labelledby="comparison-results">
      <h2 id="comparison-results">How the two locations compare</h2>
      <p className="section-explanation">Read across each row to compare the selected locations. Surface imagery helps you choose a point. The evidence row explains where each numeric value comes from.</p>
      <div className="compare-table-scroll" tabIndex={0} role="region" aria-label="Side-by-side location conditions">
        <table className="compare-table" aria-labelledby="comparison-results">
          <thead><tr><th scope="col">Condition</th>{[result.a, result.b].map((location, index) => <th key={index} scope="col">
            {worldNames[location.body]} · {location.name}<small>{location.lat.toFixed(4)}°, {location.lon.toFixed(4)}°</small>
          </th>)}<th scope="col">Absolute difference</th></tr></thead>
          <tbody>
            {comparisonQuantities.map(quantity => {
              const left = readings[0].readings[quantity.id], right = readings[1].readings[quantity.id]
              return <tr key={quantity.id}><th scope="row">{quantity.label}</th>
                <td><Reading item={left} /></td><td><Reading item={right} /></td>
                <td><Difference left={left} right={right} /></td>
              </tr>
            })}
            <tr><th scope="row">Evidence and coverage</th>{readings.map((reading, index) => <td key={index}>{reading.evidence}</td>)}<td>Sources and observation windows differ.</td></tr>
          </tbody>
        </table>
      </div>
      {readings.some(item => item.cell !== null) && scoreRows && <>
        <h3>Earth-site mission match</h3>
        <p className="section-explanation">Score the selected Earth areas against {scoreRows.planet ? 'the selected ' + worldNames[scoreRows.planet.body] + ' point' : 'a saved mission reference'}. Scores use the project’s tolerances and available quantities.</p>
        <div className="compare-settings">
          {!scoreRows.planet && <label>Mission reference<select value={targetId} onChange={event => setTargetId(event.target.value)}>
            <option value="jezero">Jezero · Mars</option><option value="shackleton">Shackleton · Moon</option>
          </select></label>}
          <label>Equipment test<select value={testId} onChange={event => setTestId(event.target.value)}>
            {tests.map(item => <option value={item.id} key={item.id}>{item.id === 'science_tools' ? 'Science tools' : item.id === 'navigation' ? 'Navigation' : item.id === 'mobility' ? 'Mobility' : item.id === 'communications' ? 'Communications' : 'Power'}</option>)}
          </select></label>
        </div>
        {scoreRows.test.reason && <p role="status">{scoreRows.test.reason}</p>}
        <div className="comparison-score-links">
          {readings.map((reading, index) => {
            if (reading.cell === null) return null
            const item = scoreRows.scores[reading.cell]
            const count = coverage(item.missing, scoreRows.test.weights)
            return <p key={index}><strong>{index === 0 ? result.a.name : result.b.name} · {item.score === null ? 'No score' : matchPercent(item.score)}</strong>
              <span>{count.scored} of {count.total} quantities</span>
              <a href={cardHash({ site: { kind: 'cell', index: reading.cell }, target: scoreRows.target.id, test: scoreRows.test.id, month: result.month, ...(scoreRows.planet ? { targetPoint: scoreRows.planet } : {}) })}>Open fidelity card</a>
            </p>
          })}
        </div>
      </>}
    </section>}
  </section>
}

export function CompareSites({ hash }: { hash: string }) {
  const [data, setData] = useState<MapData | null>(null)
  const [error, setError] = useState(false)
  useEffect(() => {
    let active = true
    cachedMapData().then(value => { if (active) setData(value) }).catch(() => { if (active) setError(true) })
    return () => { active = false }
  }, [])
  if (error) return <section className="placeholder" role="alert"><h2>Site data could not load</h2><p>Reload the page to try again.</p></section>
  if (!data) return <section className="placeholder" role="status"><h2>Loading comparison globes</h2></section>
  return <Comparison key={hash} data={data} hash={hash} />
}
