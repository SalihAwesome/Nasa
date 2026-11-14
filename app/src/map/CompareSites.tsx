import { useEffect, useMemo, useState } from 'react'
import { cardHash, cardTests, findPodCell } from '../card/cardData'
import { loadRegistries } from '../data/registries'
import { coverage } from '../score/combine'
import { cachedMapData } from './data'
import type { MapData } from './data'
import { fieldSites } from './fieldSites'
import { computeScores } from './model'

const targets = { jezero: 'Jezero crater · Mars', shackleton: 'Shackleton Connecting Ridge · Moon' }
const months = Array.from({ length: 12 }, (_, index) => new Intl.DateTimeFormat('en', {
  month: 'long', timeZone: 'UTC',
}).format(new Date(Date.UTC(2000, index))))
const { channels, podSite } = loadRegistries()
const quantities = [...channels.filter(channel => channel.onCard), ...[
  { id: 'horizon_sweep', label: 'Horizon sweep', unit: '°' },
  { id: 'low_sun_share', label: 'Low Sun share', unit: '%' },
  { id: 'peak_elevation', label: 'Peak elevation', unit: '°' },
]]
const testLabels: Record<string, string> = { power: 'Power', mobility: 'Mobility', communications: 'Communications', navigation: 'Navigation', science_tools: 'Science tools' }
const format = new Intl.NumberFormat('en', { maximumFractionDigits: 3 })

function CompareForm({ data, hash }: { data: MapData; hash: string }) {
  const params = new URLSearchParams(hash.split('?')[1])
  const pinned = Number(params.get('cell') ?? -1)
  const sites = useMemo(() => {
    const choices = fieldSites(data).flatMap(site => site.index === null ? [] : [{ ...site, index: site.index }])
    if (podSite.lat !== null && podSite.lon !== null) {
      let index: number | null = null
      try { index = findPodCell(data, podSite) } catch { /* The pod has no shipped land cell. */ }
      if (index !== null) choices.unshift({ id: 'pod', name: 'Qatar pod site', index, lat: podSite.lat, lon: podSite.lon })
    }
    if (Number.isSafeInteger(pinned) && data.cells[pinned]) {
      choices.unshift({ id: 'selected', name: 'Selected map cell', index: pinned, ...data.cells[pinned] })
    }
    return choices
  }, [data, pinned])
  const [siteA, setSiteA] = useState(sites[0]?.id ?? '')
  const [siteB, setSiteB] = useState(sites.find(site => site.index !== sites[0]?.index)?.id ?? '')
  const [targetId, setTargetId] = useState(params.get('target') === 'shackleton' ? 'shackleton' : 'jezero')
  const [testId, setTestId] = useState(params.get('test') ?? 'power')
  const requestedMonth = Number(params.get('month') ?? 1)
  const [month, setMonth] = useState(months[requestedMonth - 1] ? requestedMonth : 1)
  const [result, setResult] = useState<{ a: number; b: number; nameA: string; nameB: string; target: string; test: string; month: number } | null>(null)
  const a = sites.find(site => site.id === siteA), b = sites.find(site => site.id === siteB)
  const sameCell = a?.index === b?.index
  const availableTests = cardTests.filter(test => test.enabled)
  const test = availableTests.find(test => test.id === testId) ?? availableTests[0]
  const selection = result && data.targets.find(target => target.id === result.target)
  const layer = result && data.months[result.month - 1]
  const resultTest = result && availableTests.find(test => test.id === result.test)
  const scores = useMemo(() => selection && layer && resultTest
    ? computeScores(layer, selection, data.targetNumbers[selection.id], resultTest) : null,
  [data.targetNumbers, layer, resultTest, selection])

  const siteSelect = (label: string, value: string, setValue: (value: string) => void) =>
    <label>{label}<select value={value} onChange={event => setValue(event.target.value)}>
      {sites.map(site => <option key={site.id} value={site.id}>{site.name} · {site.lat.toFixed(2)}°, {site.lon.toFixed(2)}°</option>)}
    </select></label>

  return <section className="compare-workspace" aria-label="Site comparison">
    <form className="feature-panel compare-form" onChange={() => setResult(null)} onSubmit={event => {
      event.preventDefault()
      if (!a || !b || sameCell || !test) return
      setResult({ a: a.index, b: b.index, nameA: a.name, nameB: b.name, target: targetId, test: test.id, month })
    }}>
      <div className="compare-pickers">
        {siteSelect('Site A', siteA, setSiteA)}
        {siteSelect('Site B', siteB, setSiteB)}
        <button className="feature-primary" type="submit" disabled={!a || !b || sameCell || !test}>Compare sites</button>
      </div>
      <div className="compare-settings">
        <label>Target<select value={targetId} onChange={event => setTargetId(event.target.value)}>
          {Object.entries(targets).map(([id, name]) => <option key={id} value={id}>{name}</option>)}
        </select></label>
        <label>Test<select value={test?.id} onChange={event => setTestId(event.target.value)}>
          {availableTests.map(option => <option value={option.id} key={option.id}>{testLabels[option.id] ?? option.id}</option>)}
        </select></label>
        <label>Month<select value={month} onChange={event => setMonth(Number(event.target.value))}>
          {months.map((name, index) => <option key={name} value={index + 1}>{name}</option>)}
        </select></label>
      </div>
      {sameCell && <p role="status">Choose two different land cells.</p>}
    </form>
    {result && layer && resultTest && scores && selection && <section className="feature-panel" aria-labelledby="comparison-results">
      <h2 id="comparison-results">How the two sites compare</h2>
      <p className="section-explanation">Read across each row to compare the two sites. The overall match shows how closely each site fits the chosen mission target.</p>
      <p className="feature-muted">{targets[selection.id]} · {testLabels[resultTest.id] ?? resultTest.id} · {months[result.month - 1]}</p>
      <div className="compare-table-scroll" tabIndex={0} role="region" aria-label="Side-by-side site scores">
        <table className="compare-table" aria-labelledby="comparison-results">
          <thead><tr><th scope="col">Quantity</th><th scope="col">{result.nameA}</th><th scope="col">{result.nameB}</th></tr></thead>
          <tbody>
            <tr><th scope="row">Overall match</th>{[result.a, result.b].map(index => {
              const item = scores[index]
              const count = coverage(item.missing, resultTest.weights)
              return <td key={index}><strong>{item.score === null ? 'No score' : format.format(item.score)}</strong>
                <small>{item.score === null ? item.reason : `${count.scored} of ${count.total} quantities`}</small></td>
            })}</tr>
            {quantities.filter(quantity => layer.layers[quantity.id]).map(quantity => <tr key={quantity.id}>
              <th scope="row">{quantity.label}</th>
              {[result.a, result.b].map(index => {
                const series = layer.layers[quantity.id]
                const value = series.values[index]
                return <td key={index}>{value == null ? <>Unavailable<small>{series.missingReason}</small></> : `${format.format(value)} ${series.unit}`}</td>
              })}
            </tr>)}
            <tr><th scope="row">Evidence and limits</th>{[result.a, result.b].map(index => <td key={index}><a href={cardHash({
              site: { kind: 'cell', index }, target: selection.id, test: resultTest.id, month: result.month,
            })}>Open fidelity card</a></td>)}</tr>
          </tbody>
        </table>
      </div>
      <p className="feature-muted">Monthly Earth estimates. Each match uses the available quantities for that site.</p>
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
  if (!data) return <section className="placeholder" role="status"><h2>Loading site data</h2></section>
  return <CompareForm key={hash} data={data} hash={hash} />
}
