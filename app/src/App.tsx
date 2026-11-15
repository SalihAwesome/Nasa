import { useEffect, useRef, useState, useSyncExternalStore } from 'react'
import { PodLogPanel } from './pod/PodLogPanel'
import { SunPanel } from './sun/SunPanel'
import { CardPanel } from './card/FidelityCard'
import { LivePanel, LivePath } from './pod/LivePanel'
import type { CardHandoff } from './pod/LivePanel'
import './styles/tokens.css'
import './styles/shell.css'
import SiteFinder from './map/SiteFinder'
import { CompareSites } from './map/CompareSites'
import { ProjectAssistant } from './assistant/ProjectAssistant'
import './styles/features.css'

// View names and purpose: docs/mission-plan.md. Routes: software-plan.md, U28.
const views = {
  map: { heading: 'Find Earth sites to test Moon and Mars equipment', description: 'Proving Ground helps mission teams find places on Earth to test equipment before sending it to the Moon or Mars. Pick a mission target and a month to see where Earth conditions are most similar.' },
  card: { heading: 'How this site matches the mission target', description: 'See which conditions are similar, which measurements are missing, and what you would still need to test away from Earth.' },
  sun: { heading: 'Compare sunlight on Earth, the Moon, and Mars', description: 'Choose a Moon or Mars target to see how high the Sun rises and which direction it moves compared with a location on Earth.' },
  truth: { heading: 'Check estimates against field measurements', description: 'See how readings from the Qatar sensor pod compare with satellite estimates for the same site and readings from NASA’s Perseverance rover on Mars.' },
  live: { heading: 'Watch the Qatar sensor pod', description: 'Connect the field sensor pod or replay a sample recording to watch temperature, humidity, light, and other readings update.' },
  compare: { heading: 'Compare locations on Earth, the Moon, and Mars', description: 'Choose any two worlds and explore their surfaces side by side. Select locations on the globes to compare the data available for each point.' },
  ask: { heading: 'Ask Proving Ground', description: 'Ask what a score means, how to use a tool, or where the data comes from. Answers draw on this project’s documentation and website source.' },
}

const navigation = [
  { key: 'map', label: 'Find test sites', href: '#/map' },
  { key: 'sun', label: 'Compare sunlight', href: '#/sun' },
  { key: 'truth', label: 'Field measurements', href: '#/truth' },
  { key: 'live', label: 'Live sensor readings', href: '#/live' },
  { key: 'compare', label: 'Compare sites', href: '#/compare' },
]

function readHash() {
  return typeof window === 'undefined' ? '' : window.location.hash
}

function subscribe(onChange: () => void) {
  window.addEventListener('hashchange', onChange)
  return () => window.removeEventListener('hashchange', onChange)
}

function resolveView(hash: string) {
  switch (hash) {
    case '': case '#': case '#/': case '#/map': return 'map'
    case '#/sun': return 'sun'
    case '#/truth': return 'truth'
    case '#/live': return 'live'
    case '#/compare': return 'compare'
    case '#/ask': return 'ask'
    default: return /^#\/card\/[^/]+(?:\/[^/]+)*$/.test(hash) ? 'card' : 'missing'
  }
}

function App() {
  const hash = useSyncExternalStore(subscribe, readHash, readHash)
  const route = resolveView(hash.split('?')[0])
  const view = route === 'missing' ? null : views[route]
  const previousRoute = useRef(route)
  const [cardHandoff, setCardHandoff] = useState<CardHandoff>()
  const [lightMode, setLightMode] = useState(() => {
    try { return window.localStorage.getItem('proving-ground-theme') === 'light' } catch { return false }
  })

  useEffect(() => {
    document.documentElement.dataset.theme = lightMode ? 'light' : 'dark'
    try { window.localStorage.setItem('proving-ground-theme', lightMode ? 'light' : 'dark') } catch { /* Use the theme for this visit. */ }
  }, [lightMode])

  useEffect(() => {
    document.title = `${view?.heading ?? 'Page not found'} · Proving Ground`
    if (previousRoute.current !== route) {
      if (route !== 'card') setCardHandoff(undefined)
      previousRoute.current = route
      document.getElementById('view-heading')?.focus()
    }
  }, [route, view])

  return (
    <div className={route === 'live' ? 'app-shell app-shell--live' : 'app-shell'}>
      <a className="skip-link" href="#main-content" onClick={event => {
        event.preventDefault()
        document.getElementById('main-content')?.focus()
      }}>Skip to content</a>
      <header className="app-header">
        <a className="brand" href="#/map">Proving Ground</a>
      </header>
      <nav className="app-nav" aria-label="Main navigation">
        {navigation.map(item => <a key={item.key} href={item.href}
          aria-current={route === item.key || (route === 'card' && item.key === 'map') ? 'page' : undefined}>
          {item.label}
        </a>)}
        <a className="ask-nav" href="#/ask" aria-current={route === 'ask' ? 'page' : undefined}>Ask Proving Ground</a>
        <button className="theme-toggle" type="button" onClick={() => setLightMode(current => !current)}>{lightMode ? 'Dark mode' : 'Light mode'}</button>
      </nav>
      <main id="main-content" className={route === 'live' ? 'live-main' : undefined} tabIndex={-1}>
        {view ? <>
          {route === 'card' && <a className="back-link" href="#/map">Back to the Earth test map</a>}
          <h1 id="view-heading" tabIndex={-1}>{view.heading}</h1>
          <p className="view-description">{view.description}</p>
          {route === 'map' ? <SiteFinder /> : route === 'truth' ? <PodLogPanel /> : route === 'sun' ? <SunPanel hash={hash} />
            : route === 'live' ? <LivePanel onHandoff={setCardHandoff} />
            : route === 'compare' ? <CompareSites hash={hash} />
            : route === 'ask' ? <ProjectAssistant />
            : route === 'card' && /^#\/card\/(?:pod(?:\?|$)|cell\/)/.test(hash) ? <>
              {cardHandoff && /^#\/card\/pod(?:\?|$)/.test(hash) && <div className="live-handoff">
                <LivePath handoff={cardHandoff} />
                <p>Last {cardHandoff.simulated ? 'simulated' : 'live'} record received <time dateTime={cardHandoff.timestamp}>{cardHandoff.timestamp}</time>. The card uses the saved log.</p>
              </div>}
              <CardPanel hash={hash} />
            </>
            : <section className="placeholder" aria-labelledby="placeholder-title">
            <h2 id="placeholder-title">Not available yet</h2>
            <p>This view is still being built. No data is loaded here.</p>
          </section>}
        </> : <>
          <h1 id="view-heading" tabIndex={-1}>Page not found</h1>
          <p className="view-description">This address does not match an app view.</p>
          <a href="#/map">Return to site finder</a>
        </>}
      </main>
      <footer className="app-footer">
        <h2>How to read the evidence labels</h2>
        <ul className="evidence-key" aria-label="Evidence label key">
          <li><span className="evidence-tag evidence-tag--estimate">estimate</span><span>Model or satellite estimate</span></li>
          <li><span className="evidence-tag evidence-tag--measured">measured</span><span>Pod observation</span></li>
          <li><span className="evidence-tag evidence-tag--simulated">simulated</span><span>Generated test data</span></li>
        </ul>
      </footer>
    </div>
  )
}

export default App
