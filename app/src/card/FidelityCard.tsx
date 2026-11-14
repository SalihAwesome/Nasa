import { useEffect, useState } from 'react'
import type { ReactNode } from 'react'
import { buildCard, cardHash, cardTests, loadCardData, readCardSelection } from './cardData'
import type { CardModel, CardSelection, Reading } from './cardData'
import './card.css'

// Names: docs/project-brief.md. All scientific values/settings are loaded data.
const targets = { jezero: 'Jezero crater · Mars', shackleton: 'Shackleton Connecting Ridge · Moon' }
const tests: Record<string, string> = { power: 'Power', mobility: 'Mobility', communications: 'Communications', navigation: 'Navigation', science_tools: 'Science tools' }
const months = Array.from({ length: 12 }, (_, index) => new Intl.DateTimeFormat('en', { month: 'long', timeZone: 'UTC' }).format(new Date(Date.UTC(2000, index))))
const number = (value: number) => value.toLocaleString('en', { maximumFractionDigits: 3 })

function Value({ reading }: { reading: Reading }) {
  return <>{reading.value === null ? <span className="card-missing">{reading.reason}</span>
    : <span className="card-number" data-value={reading.value}>{number(reading.value)}{reading.unit && ` ${reading.unit}`}</span>}
    {reading.unitReason && <small>{reading.unitReason}</small>}
    {reading.note && <small>{reading.note}</small>}
  </>
}

/** Render only the saved Markdown link syntax; all other text stays escaped. */
function SourceText({ text }: { text: string }) {
  const parts: ReactNode[] = []
  let end = 0
  for (const match of text.matchAll(/\[([^\]]+)\]\((https:\/\/[^\s)]+)\)/g)) {
    parts.push(text.slice(end, match.index), <a key={match.index} href={match[2]}>{match[1]}</a>)
    end = match.index + match[0].length
  }
  return <>{parts}{text.slice(end)}</>
}

export function FidelityCard({ card }: { card: CardModel }) {
  return <article className="fidelity-card">
    <header className="card-heading">
      <div><h3>{card.isPod ? 'Qatar card' : `Land cell ${card.cell.index}`}</h3>
        <p className="card-coordinates">{number(card.cell.lat)}°, {number(card.cell.lon)}° · {months[card.month - 1]}</p></div>
      <p>Against <strong>{targets[card.target]}</strong></p>
      <p className="card-basis">Earth: NASA POWER monthly climatology, {card.period.start.slice(0, 4)}–{card.period.end.slice(0, 4)}.
        {card.targetSol !== undefined && <> Target: MEDA sol {card.targetSol}.</>}</p>
      {card.siteNote && <p className="card-basis">{card.siteNote}</p>}
    </header>
    <section className="card-combined" aria-labelledby="card-combined-heading">
      <div><h3 id="card-combined-heading">{tests[card.test.id]} match</h3><p className="card-total">
        {typeof card.combined.score === 'number' ? number(card.combined.score) : 'no score'}
      </p></div>
      <div>{!card.test.enabled && <p>{card.test.reason}</p>}
        <p>Weights and tolerances are defaults. The weighted mean uses only rows with a score.</p>
        {card.combined.missing.length > 0 && <p>Omitted from the mean: {card.combined.missing.map(id => [...card.rows, ...card.sunRows].find(row => row.id === id)?.label ?? id).join(', ')}.</p>}
        <p>Not built for this test: {card.test.notBuilt.join(', ')}.</p></div>
    </section>
    <section className="card-sun" aria-labelledby="card-sun-heading">
      <h3 id="card-sun-heading">Sun comparisons</h3>
      <p>Precomputed Sun estimates for the selected Earth month and target window.</p>
      <dl>{card.sunRows.map(row => <div key={row.id} data-sun-quantity={row.id}>
        <dt>{row.label}</dt>
        <dd><span>Earth: <Value reading={row.earth} /></span><span>Target: <Value reading={row.target} /></span>
          <span>Tolerance: {number(row.tolerance.value)} {row.tolerance.unit} ({row.tolerance.status})</span>
          <span>Score: {typeof row.score === 'number' ? <span className="card-score" data-score={row.score}>{number(row.score)}</span> : 'no score'}</span>
          <span>{row.counts ? `Counts · weight ${row.weight?.value} (${row.weight?.status})` : 'Does not count'}</span>
        </dd>
      </div>)}</dl>
    </section>
    <div className="card-table-scroll" role="region" aria-label="Channel comparisons" tabIndex={0}>
      <table className="card-table"><caption>Each channel keeps its own score. Only marked rows count toward the selected test.</caption>
        <thead><tr><th scope="col">Quantity</th><th scope="col">Earth value</th><th scope="col">Target value</th><th scope="col">Tolerance</th><th scope="col">Score</th><th scope="col">Test role</th></tr></thead>
        <tbody>{card.rows.map(row => <tr data-channel={row.id} key={row.id}>
          <th scope="row">{row.label}</th>
          <td><Value reading={row.earth} /><span className={`evidence-tag evidence-tag--${row.evidence}`}>{row.evidence}</span></td>
          <td><Value reading={row.target} /></td>
          <td data-tolerance-status={row.tolerance.status}><span className="card-number">{number(row.tolerance.value)} {row.tolerance.unit}</span><small>{row.tolerance.status}</small></td>
          <td>{typeof row.score === 'number' ? <span className={`card-score${row.score === 0 ? ' card-score--zero' : ''}`} data-score={row.score}>{number(row.score)}</span>
            : <span className="card-missing">no score</span>}</td>
          <td>{row.counts ? <><strong>Counts</strong><small>weight {row.weight?.value} ({row.weight?.status})</small></> : 'Does not count'}</td>
        </tr>)}</tbody>
      </table>
    </div>
    <aside className="card-limits" aria-labelledby="card-limits-heading" data-limits-block="true">
      <h3 id="card-limits-heading">Where Earth fails</h3>
      <p>These conditions are never scored. Source: docs/project-brief.md.</p>
      <dl>{card.limits.map(limit => <div key={limit.title}><dt>{limit.title}</dt><dd><SourceText text={limit.text} /></dd></div>)}</dl>
    </aside>
  </article>
}

function SelectedCard({ selection }: { selection: CardSelection }) {
  const [card, setCard] = useState<CardModel | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [attempt, setAttempt] = useState(0)
  useEffect(() => {
    let active = true
    setCard(null); setError(null)
    loadCardData(selection).then(data => {
      if (active) setCard(buildCard(data, selection))
    }).catch(error => { if (active) setError(error instanceof Error ? error.message : 'Could not load this card.') })
    return () => { active = false }
  }, [selection, attempt])
  if (error) return <p role="alert">{error} <button type="button" onClick={() => setAttempt(attempt + 1)}>Retry</button></p>
  return card ? <FidelityCard card={card} /> : <p role="status">Loading local card data…</p>
}

export function CardPanel({ hash }: { hash: string }) {
  let selection: CardSelection
  try { selection = readCardSelection(hash) }
  catch (error) { return <section className="card-panel"><h2>Site comparison</h2><p role="alert">{String(error)}</p><a href="#/card/pod">Open the Qatar card</a></section> }
  const change = (patch: Partial<CardSelection>) => { window.location.hash = cardHash({ ...selection, ...patch }) }
  return <section className="card-panel" aria-labelledby="card-panel-heading">
    <h2 id="card-panel-heading">Site comparison</h2>
    <div className="card-controls">
      <label>Target<select value={selection.target} onChange={event => change({ target: event.target.value as CardSelection['target'] })}>
        {Object.entries(targets).map(([id, label]) => <option key={id} value={id}>{label}</option>)}
      </select></label>
      <label>Test<select value={selection.test} onChange={event => change({ test: event.target.value })} aria-describedby="card-test-availability">
        {cardTests.map(test => <option key={test.id} value={test.id} disabled={!test.enabled}>{tests[test.id]}{!test.enabled && ` — ${test.reason}`}</option>)}
      </select></label>
      <label>Earth month<select value={selection.month} onChange={event => change({ month: Number(event.target.value) })}>
        {months.map((month, index) => <option key={month} value={index + 1}>{month}</option>)}
      </select></label>
    </div>
    <details id="card-test-availability"><summary>Test availability</summary><ul>{cardTests.filter(test => !test.enabled).map(test => <li key={test.id}>{tests[test.id]}: {test.reason}</li>)}</ul></details>
    <SelectedCard key={cardHash(selection)} selection={selection} />
  </section>
}
