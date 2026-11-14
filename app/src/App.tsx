import { useEffect, useRef, useSyncExternalStore } from 'react'
import { PodLogPanel } from './pod/PodLogPanel'
import { SunPanel } from './sun/SunPanel'
import { MobilityAvailability } from './mobility/TestSelector'
import { CardPanel } from './card/FidelityCard'
import './styles/tokens.css'
import './styles/shell.css'
import SiteFinder from './map/SiteFinder'

// View names and purpose: docs/mission-plan.md. Routes: software-plan.md, U28.
const views = {
  map: { heading: 'Site finder', description: 'Compare Earth sites for a chosen target, test and month.' },
  card: { heading: 'Fidelity card', description: 'Inspect the quantities, evidence and limits for a selected site.' },
  sun: { heading: 'Sun panel', description: 'Compare the target’s Sun path with the path at an Earth site.' },
  truth: { heading: 'Ground truth', description: 'Compare pod measurements with satellite estimates and a Mars reference.' },
  live: { heading: 'Live panel', description: 'Follow the sensor pod as measurements arrive.' },
}

const navigation = [
  { key: 'map', label: 'Site finder', href: '#/map' },
  { key: 'sun', label: 'Sun panel', href: '#/sun' },
  { key: 'truth', label: 'Ground truth', href: '#/truth' },
  { key: 'live', label: 'Live panel', href: '#/live' },
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
    default: return /^#\/card\/[^/]+(?:\/[^/]+)*$/.test(hash) ? 'card' : 'missing'
  }
}

function App() {
  const hash = useSyncExternalStore(subscribe, readHash, readHash)
  const route = resolveView(hash.split('?')[0])
  const view = route === 'missing' ? null : views[route]
  const previousRoute = useRef(route)

  useEffect(() => {
    document.title = `${view?.heading ?? 'Page not found'} · Proving Ground`
    if (previousRoute.current !== route) {
      previousRoute.current = route
      document.getElementById('view-heading')?.focus()
    }
  }, [route, view])

  return (
    <div className="app-shell">
      <a className="skip-link" href="#main-content" onClick={event => {
        event.preventDefault()
        document.getElementById('main-content')?.focus()
      }}>Skip to content</a>
      <header className="app-header">
        <a className="brand" href="#/map">Proving Ground<span>Earth tests. Planetary questions.</span></a>
      </header>
      <nav className="app-nav" aria-label="Main navigation">
        {navigation.map(item => <a key={item.key} href={item.href}
          aria-current={route === item.key || (route === 'card' && item.key === 'map') ? 'page' : undefined}>
          {item.label}
        </a>)}
      </nav>
      <main id="main-content" tabIndex={-1}>
        {view ? <>
          {route === 'card' && <a className="back-link" href="#/map">Back to site finder</a>}
          <h1 id="view-heading" tabIndex={-1}>{view.heading}</h1>
          <p className="view-description">{view.description}</p>
          {route === 'map' && <MobilityAvailability />}
          {route === 'map' ? <SiteFinder /> : route === 'truth' ? <PodLogPanel /> : route === 'sun' ? <SunPanel hash={hash} />
            : route === 'card' && /^#\/card\/(?:pod(?:\?|$)|cell\/)/.test(hash) ? <CardPanel hash={hash} />
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
        <p>Evidence labels used throughout the app</p>
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
