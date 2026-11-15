import { useEffect, useRef, useState, useSyncExternalStore } from 'react'
import type { CSSProperties } from 'react'
import { Activity, ChartNoAxesCombined, ChevronRight, Columns2, Globe2, Menu, MessageCircle, Moon, Sun, X } from 'lucide-react'
import { animate } from 'motion/mini'
import { TayfMark } from './TayfMark'
import { PodLogPanel } from './pod/PodLogPanel'
import { SunPanel } from './sun/SunPanel'
import { CardPanel } from './card/FidelityCard'
import { LivePanel, LivePath } from './pod/LivePanel'
import type { CardHandoff } from './pod/LivePanel'
import './styles/tokens.css'
import SiteFinder from './map/SiteFinder'
import { CompareSites } from './map/CompareSites'
import { ProjectAssistant } from './assistant/ProjectAssistant'
import './styles/features.css'
import './styles/shell.css'
import './styles/components.css'

// View names and purpose: docs/mission-plan.md. Routes: software-plan.md, U28.
const views = {
  map: { heading: 'Find Earth sites to test Moon and Mars equipment', description: 'Help mission teams find places on Earth to test equipment before sending it to the Moon or Mars. Choose a target, equipment test, and month to compare conditions.' },
  card: { heading: 'How this site matches the mission target', description: 'See which conditions are similar, which measurements are missing, and what you would still need to test away from Earth.' },
  sun: { heading: 'Compare sunlight on Earth, the Moon, and Mars', description: 'Choose a Moon or Mars target to see how high the Sun rises and which direction it moves compared with a location on Earth.' },
  truth: { heading: 'Check estimates against field measurements', description: 'See how readings from the Qatar sensor pod compare with satellite estimates for the same site and readings from NASA’s Perseverance rover on Mars.' },
  live: { heading: 'Watch the Qatar sensor pod', description: 'Connect the field sensor pod or replay a sample recording to watch temperature, humidity, light, and other readings update.' },
  compare: { heading: 'Compare locations on Earth, the Moon, and Mars', description: 'Choose any two worlds and explore their surfaces side by side. Select locations on the maps to compare the data available for each point.' },
  ask: { heading: 'Ask Tayf', description: 'Ask what a score means, how to use a tool, or where the data comes from. Answers draw on this project’s documentation and website source.' },
}

const navigation = [
  { key: 'map', label: 'Find test sites', href: '#/map', icon: Globe2 },
  { key: 'sun', label: 'Sunlight', href: '#/sun', icon: Sun },
  { key: 'truth', label: 'Field measurements', href: '#/truth', icon: ChartNoAxesCombined },
  { key: 'live', label: 'Sensor pod', href: '#/live', icon: Activity },
  { key: 'compare', label: 'Compare sites', href: '#/compare', icon: Columns2 },
]

const routeLabels: Record<string, string> = { map: 'Site finder', card: 'Site evidence', sun: 'Sunlight', truth: 'Field measurements', live: 'Sensor pod', compare: 'Compare sites', ask: 'Project assistant', missing: 'Page not found' }

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
  const currentIndex = navigation.findIndex(item => item.key === (route === 'card' ? 'map' : route))
  const [cardHandoff, setCardHandoff] = useState<CardHandoff>()
  const [menuOpen, setMenuOpen] = useState(false)
  const [lightMode, setLightMode] = useState(() => {
    try { return window.localStorage.getItem('tayf-theme') !== 'dark' } catch { return true }
  })

  const themeIcon = useRef<HTMLSpanElement>(null)
  const shownTheme = useRef(lightMode)

  useEffect(() => {
    document.documentElement.dataset.theme = lightMode ? 'light' : 'dark'
    if (shownTheme.current !== lightMode && themeIcon.current && !window.matchMedia('(prefers-reduced-motion: reduce)').matches)
      animate(themeIcon.current, { transform: ['rotate(-90deg) scale(0.6)', 'rotate(0deg) scale(1)'], opacity: [0, 1] }, { duration: 0.22, ease: [0.23, 1, 0.32, 1] })
    shownTheme.current = lightMode
    try { window.localStorage.setItem('tayf-theme', lightMode ? 'light' : 'dark') } catch { /* Use the theme for this visit. */ }
  }, [lightMode])

  useEffect(() => {
    if (menuOpen) document.querySelector<HTMLAnchorElement>('#main-navigation a[aria-current="page"], #main-navigation a')?.focus()
  }, [menuOpen])

  useEffect(() => {
    document.title = `${view?.heading ?? 'Page not found'} · Tayf`
    if (previousRoute.current !== route) {
      if (route !== 'card') setCardHandoff(undefined)
      previousRoute.current = route
      document.getElementById('view-heading')?.focus()
    }
  }, [route, view])

  return (
    <div className={route === 'live' ? 'app-shell app-shell--live' : 'app-shell'} onKeyDown={event => {
      if (menuOpen && event.key === 'Escape') {
        event.preventDefault()
        setMenuOpen(false)
        const toggle = document.getElementById('menu-toggle')
        if (toggle?.getClientRects().length) toggle.focus()
      }
    }}>
      <a className="skip-link" href="#main-content" onClick={event => {
        event.preventDefault()
        document.getElementById('main-content')?.focus()
      }}>Skip to content</a>
      <header className="app-header">
        <a className="brand" href="#/map" onClick={() => setMenuOpen(false)}>
          <TayfMark size={32} />
          <span className="brand-wordmark">Tayf<small>Analog site finder</small></span>
        </a>
        <nav id="main-navigation" className="app-nav" data-open={menuOpen} aria-label="Main navigation">
          <span className="nav-label">Tools</span>
          <div className="nav-links" style={{ '--nav-index': currentIndex } as CSSProperties}>
            <span className="nav-pill" aria-hidden="true" data-visible={currentIndex >= 0} />
            {navigation.map((item, index) => {
              const Icon = item.icon
              return <a key={item.key} href={item.href} onClick={() => setMenuOpen(false)} aria-current={index === currentIndex ? 'page' : undefined}>
                <Icon aria-hidden="true" size={18} /><span>{item.label}</span>
              </a>
            })}
          </div>
        </nav>
      </header>
      <div className="workspace-shell">
        <div className="workspace-topbar">
          <div className="workspace-breadcrumb"><span>Tayf</span><ChevronRight aria-hidden="true" size={14} /><strong>{routeLabels[route]}</strong></div>
          <div className="header-actions">
            <a className="ask-nav" href="#/ask" aria-label="Ask Tayf" onClick={() => setMenuOpen(false)} aria-current={route === 'ask' ? 'page' : undefined}>
              <MessageCircle aria-hidden="true" size={17} /><span>Ask Tayf</span>
            </a>
            <button className="theme-toggle" type="button" aria-label={lightMode ? 'Switch to dark mode' : 'Switch to light mode'} title={lightMode ? 'Switch to dark mode' : 'Switch to light mode'} onClick={() => setLightMode(current => !current)}>
              <span ref={themeIcon} className="theme-icon">{lightMode ? <Moon aria-hidden="true" size={18} /> : <Sun aria-hidden="true" size={18} />}</span>
            </button>
            <button id="menu-toggle" className="menu-toggle" type="button" aria-expanded={menuOpen} aria-controls="main-navigation" onClick={() => setMenuOpen(open => !open)}>{menuOpen ? 'Close' : 'Menu'}
              {menuOpen ? <X aria-hidden="true" size={18} /> : <Menu aria-hidden="true" size={18} />}
            </button>
          </div>
        </div>
        <div className="workspace-sheet">
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
      </div>
    </div>
  )
}

export default App
