import { lazy, Suspense, useId, useLayoutEffect, useMemo, useRef, useState } from 'react'
import type { KeyboardEvent, PointerEvent } from 'react'
import type { MapData } from './data'
import type { CellScore } from './model'
import { createScoreRaster, drawGlobe, globeColors, globeRadius, globeVectors, hitGlobe, homeView, maxZoom, moveGlobe, scorePalette } from './globe'
import type { FieldSite, GlobeFrame, GlobeView } from './globe'
import { nearestPlace } from './places'
import type { Place } from './places'
import type { Cell } from './model'
import { findPodCell } from '../card/cardData'
import { createSurface, globePoint } from './surface'

type Point = { x: number; y: number }
type Gesture = {
  pointers: Map<number, Point>
  origin: Point
  view: GlobeView
  moved: boolean
  pinchDistance: number
  radius: number
}

const distance = (a: Point, b: Point) => Math.hypot(a.x - b.x, a.y - b.y)
const zoomStep = 1.4

export type EarthGlobeProps = {
  data: MapData
  scores: readonly CellScore[]
  sites: readonly FieldSite[]
  cities: readonly Place[]
  onHover: (index: number | null) => void
  onOpen: (index: number) => void
  onDraw: () => void
}

const GoogleEarthExplorer = import.meta.env.VITE_GOOGLE_MAPS_API_KEY
  ? lazy(() => import('./GoogleEarthExplorer')) : null

export function EarthGlobe(props: EarthGlobeProps) {
  const [satellite, setSatellite] = useState(true)
  if (!GoogleEarthExplorer) return <LocalEarthGlobe {...props} />
  return <>
    <div className="earth-map-modes" role="group" aria-label="Earth map layer">
      <button type="button" aria-pressed={satellite} onClick={() => setSatellite(true)}>Google Earth</button>
      <button type="button" aria-pressed={!satellite} onClick={() => setSatellite(false)}>Match colors</button>
    </div>
    {satellite ? <Suspense fallback={<p role="status">Loading Google Earth view…</p>}><GoogleEarthExplorer {...props} /></Suspense>
      : <LocalEarthGlobe {...props} />}
  </>
}

function LocalEarthGlobe({ data, scores, sites, cities, onHover, onOpen, onDraw }: EarthGlobeProps) {
  const canvas = useRef<HTMLCanvasElement>(null)
  const surfaceCanvas = useRef<HTMLCanvasElement>(null)
  const surfaceRenderer = useRef<ReturnType<typeof createSurface>>(null)
  const frame = useRef<GlobeFrame | null>(null)
  const gesture = useRef<Gesture | null>(null)
  const currentView = useRef(homeView)
  const [zoomLimits, setZoomLimits] = useState({ atMin: true, atMax: false })
  const [dragging, setDragging] = useState(false)
  const [focusSite, setFocusSite] = useState('')
  const [unavailable, setUnavailable] = useState(false)
  const [latitude, setLatitude] = useState('')
  const [longitude, setLongitude] = useState('')
  const [coordinate, setCoordinate] = useState<Cell | null>(null)
  const coordinatePlace = useMemo(() => coordinate && nearestPlace(coordinate, cities), [coordinate, cities])
  const pin = useMemo(() => coordinate && { ...coordinate, name: coordinatePlace && coordinatePlace.distanceKm < 50
    ? 'Near ' + coordinatePlace.name : 'Selected coordinates' }, [coordinate, coordinatePlace])
  const coordinateCell = useMemo(() => {
    if (!coordinate) return null
    try { return findPodCell(data, coordinate) } catch { return null }
  }, [coordinate, data])
  const instructions = useId()
  const vectors = useMemo(() => globeVectors(data.cells), [data.cells])
  const colors = useMemo(() => globeColors(scores), [scores])
  const draw = useRef<() => void>(() => {})
  const pendingDraw = useRef(0)
  const drawComplete = useRef(onDraw)

  useLayoutEffect(() => { drawComplete.current = onDraw }, [onDraw])
  const activeColors = useRef(colors)
  useLayoutEffect(() => { activeColors.current = colors }, [colors])

  useLayoutEffect(() => {
    const element = surfaceCanvas.current
    if (!element) return
    const renderer = createSurface(element, import.meta.env.BASE_URL + 'data/surfaces/earth.jpg',
      () => draw.current(), () => draw.current(), true)
    surfaceRenderer.current = renderer
    return () => { renderer?.dispose(); surfaceRenderer.current = null }
  }, [])

  function changeView(next: GlobeView) {
    currentView.current = next
    if (!pendingDraw.current) pendingDraw.current = requestAnimationFrame(() => {
      pendingDraw.current = 0
      draw.current()
    })
    const atMin = next.zoom <= 1, atMax = next.zoom >= maxZoom
    setZoomLimits(previous => previous.atMin === atMin && previous.atMax === atMax ? previous : { atMin, atMax })
  }

  useLayoutEffect(() => {
    const element = canvas.current
    const ctx = element?.getContext('2d')
    if (!element || !ctx) { setUnavailable(true); return }
    const nextFrame: GlobeFrame = { x: new Float32Array(data.cells.length), y: new Float32Array(data.cells.length), markers: [] }
    frame.current = nextFrame
    const palette = scorePalette(getComputedStyle(element))
    const raster = createScoreRaster()
    draw.current = () => {
      const { width, height } = element.getBoundingClientRect()
      if (!width || !height) return
      const ratio = Math.min(window.devicePixelRatio || 1, 2)
      const pxWidth = Math.round(width * ratio), pxHeight = Math.round(height * ratio)
      if (element.width !== pxWidth || element.height !== pxHeight) {
        element.width = pxWidth
        element.height = pxHeight
      }
      ctx.setTransform(pxWidth / width, 0, 0, pxHeight / height, 0, 0)
      const surfaceReady = surfaceRenderer.current?.draw(currentView.current, width, height) ?? false
      drawGlobe({ ctx, width, height, view: currentView.current, vectors, scores: activeColors.current, palette,
        land: data.land, countries: data.countries, sites, cities, pin, frame: nextFrame, raster, surfaceReady })
      drawComplete.current()
    }
    const observer = new ResizeObserver(() => draw.current())
    observer.observe(element)
    return () => {
      observer.disconnect()
      cancelAnimationFrame(pendingDraw.current)
      pendingDraw.current = 0
      draw.current = () => {}
      frame.current = null
    }
  }, [data.cells.length, data.countries, data.land, sites, cities, pin, vectors])

  useLayoutEffect(() => {
    // A new score layer is painted in the current commit. Only navigation
    // gestures need frame coalescing.
    draw.current()
  }, [colors, data.countries, data.land, sites, cities, pin, vectors])

  function zoom(factor: number) {
    const camera = currentView.current
    changeView(moveGlobe(camera, camera.lon, camera.lat, camera.zoom * factor))
    onHover(null)
  }

  function reset() {
    changeView(homeView)
    setFocusSite('')
    setCoordinate(null)
    onHover(null)
  }

  useLayoutEffect(() => {
    const element = canvas.current
    if (!element) return
    function wheel(event: WheelEvent) {
      // Leave page scrolling alone unless the user has focused the globe.
      if (document.activeElement !== element || event.ctrlKey || event.metaKey) return
      event.preventDefault()
      const camera = currentView.current
      const delta = event.deltaMode === WheelEvent.DOM_DELTA_LINE ? event.deltaY * 16 : event.deltaY
      changeView(moveGlobe(camera, camera.lon, camera.lat, camera.zoom * Math.exp(-delta * 0.002)))
    }
    element.addEventListener('wheel', wheel, { passive: false })
    return () => element.removeEventListener('wheel', wheel)
  }, [])

  function hit(event: PointerEvent<HTMLCanvasElement>) {
    if (!frame.current) return null
    const rect = event.currentTarget.getBoundingClientRect()
    return hitGlobe(frame.current, event.clientX - rect.left, event.clientY - rect.top, event.pointerType === 'touch' ? 9 : 5)
  }

  function press(event: PointerEvent<HTMLCanvasElement>) {
    if (event.button !== 0) return
    const point = { x: event.clientX, y: event.clientY }
    if (!gesture.current) {
      const { width, height } = event.currentTarget.getBoundingClientRect()
      gesture.current = { origin: point, view: currentView.current, pointers: new Map(), moved: false,
        pinchDistance: 0, radius: globeRadius(width, height) }
    }
    const active = gesture.current
    active.pointers.set(event.pointerId, point)
    if (active.pointers.size === 2) {
      const [a, b] = [...active.pointers.values()]
      active.pinchDistance = distance(a, b)
      active.view = currentView.current
      active.moved = true
      setDragging(true)
      onHover(null)
    }
    event.currentTarget.setPointerCapture(event.pointerId)
  }

  function move(event: PointerEvent<HTMLCanvasElement>) {
    const active = gesture.current
    if (!active) { if (event.pointerType === 'mouse') onHover(hit(event)); return }
    if (!active.pointers.has(event.pointerId)) return
    const point = { x: event.clientX, y: event.clientY }
    active.pointers.set(event.pointerId, point)
    if (active.pointers.size >= 2) {
      const [a, b] = [...active.pointers.values()]
      const start = active.view
      changeView(moveGlobe(start, start.lon, start.lat, start.zoom * distance(a, b) / Math.max(1, active.pinchDistance)))
      return
    }
    if (!active.moved && distance(active.origin, point) < 5) return
    if (!active.moved) { active.moved = true; setDragging(true); onHover(null) }
    const start = active.view, degreesPerPixel = 180 / Math.PI / (active.radius * start.zoom)
    changeView(moveGlobe(start, start.lon - (point.x - active.origin.x) * degreesPerPixel, start.lat + (point.y - active.origin.y) * degreesPerPixel))
  }

  function release(event: PointerEvent<HTMLCanvasElement>, open: boolean) {
    const active = gesture.current
    if (!active?.pointers.delete(event.pointerId)) return
    if (active.pointers.size) {
      const origin = active.pointers.values().next().value
      if (origin) active.origin = origin
      active.view = currentView.current
      return
    }
    gesture.current = null
    setDragging(false)
    if (open && !active.moved) {
      const rect = event.currentTarget.getBoundingClientRect()
      const point = globePoint(currentView.current, rect.width, rect.height, event.clientX - rect.left, event.clientY - rect.top)
      if (point && currentView.current.zoom >= 4) focusCoordinates(point)
      else {
        const index = hit(event)
        if (index !== null) onOpen(index)
      }
    }
  }

  function keys(event: KeyboardEvent<HTMLCanvasElement>) {
    const camera = currentView.current
    const turn = 15 / Math.sqrt(camera.zoom)
    switch (event.key) {
      case 'ArrowLeft': changeView(moveGlobe(camera, camera.lon - turn, camera.lat)); break
      case 'ArrowRight': changeView(moveGlobe(camera, camera.lon + turn, camera.lat)); break
      case 'ArrowUp': changeView(moveGlobe(camera, camera.lon, camera.lat + turn)); break
      case 'ArrowDown': changeView(moveGlobe(camera, camera.lon, camera.lat - turn)); break
      case '+': case '=': zoom(zoomStep); break
      case '-': zoom(1 / zoomStep); break
      case 'Home': reset(); break
      default: return
    }
    event.preventDefault()
    onHover(null)
  }

  const chosenSite = sites.find(site => site.id === focusSite)
  function focusCoordinates(point: Cell) {
    setCoordinate(point)
    setFocusSite('')
    const view = currentView.current
    changeView(moveGlobe(view, point.lon, point.lat, Math.max(18, view.zoom)))
    let index: number | null = null
    try { index = findPodCell(data, point) } catch { /* Coordinates can be outside the land grid. */ }
    onHover(index)
  }

  return <div className="globe-explorer">
    {unavailable ? <p role="status">The globe could not render. Use the ranked list to open a cell’s fidelity card.</p> : <>
      <div className="globe-stage">
        <canvas ref={surfaceCanvas} className="earth-surface" aria-hidden="true" />
        <canvas ref={canvas} className="earth-globe" tabIndex={0} role="img" aria-label="Interactive Earth globe"
          aria-describedby={instructions} data-dragging={dragging || undefined}
          onPointerDown={press} onPointerMove={move} onPointerUp={event => release(event, true)}
          onPointerCancel={event => release(event, false)} onLostPointerCapture={event => release(event, false)}
          onPointerLeave={() => onHover(null)} onKeyDown={keys} />
      </div>
      <div className="globe-tools">
        <label className="globe-sites">Analog sites
          <select value={focusSite} onChange={event => {
            setFocusSite(event.target.value)
            const site = sites.find(item => item.id === event.target.value)
            if (!site) { reset(); return }
            setCoordinate(null)
            changeView(moveGlobe(currentView.current, site.lon, site.lat, 2))
            onHover(site.index)
          }}>
            <option value="">Choose a site</option>
            {sites.map(site => <option value={site.id} key={site.id}>{site.name}</option>)}
          </select>
        </label>
        <div className="globe-buttons" role="group" aria-label="Globe view controls">
          <button type="button" aria-label="Zoom out" disabled={zoomLimits.atMin} onClick={() => zoom(1 / zoomStep)}>
            <svg aria-hidden="true" width="18" height="18" viewBox="0 0 18 18"><path d="M4 9h10" /></svg>
          </button>
          <button type="button" aria-label="Zoom in" disabled={zoomLimits.atMax} onClick={() => zoom(zoomStep)}>
            <svg aria-hidden="true" width="18" height="18" viewBox="0 0 18 18"><path d="M4 9h10M9 4v10" /></svg>
          </button>
          <button type="button" onClick={reset}>Reset view</button>
        </div>
      </div>
      {chosenSite && (chosenSite.index === null
        ? <p className="map-meta" role="status">No shipped land cell for {chosenSite.name}.</p>
        : <button className="globe-site-card" type="button" onClick={() => {
          if (chosenSite.index !== null) onOpen(chosenSite.index)
        }}>Open fidelity card for {chosenSite.name}</button>)}
      <form className="coordinate-form" onSubmit={event => {
        event.preventDefault()
        if (!latitude.trim() || !longitude.trim()) return
        const lat = Number(latitude), lon = Number(longitude)
        if (Number.isFinite(lat) && Number.isFinite(lon) && Math.abs(lat) <= 90 && Math.abs(lon) <= 180) focusCoordinates({ lat, lon })
      }}>
        <label>Latitude<input type="number" step="any" min={-90} max={90} required value={latitude} onChange={event => setLatitude(event.target.value)} /></label>
        <label>Longitude<input type="number" step="any" min={-180} max={180} required value={longitude} onChange={event => setLongitude(event.target.value)} /></label>
        <button type="submit">Go to coordinates</button>
      </form>
      {coordinate && <p className="map-meta" role="status">
        {coordinatePlace && <><strong>Nearest mapped place: {coordinatePlace.name}</strong> · {coordinatePlace.distanceKm} km away · </>}
        {coordinate.lat.toFixed(4)}°, {coordinate.lon.toFixed(4)}°
      </p>}
      {coordinate && (coordinateCell === null
        ? <p className="map-meta">No land cell in the dataset at these coordinates.</p>
        : <button type="button" className="globe-site-card" onClick={() => onOpen(coordinateCell)}>Open fidelity card for this cell</button>)}
      <p className="map-meta">Score colors fade at close zoom to reveal the surface. Climate values describe the original grid cell.</p>
      <p className="map-meta">Surface imagery: NASA Earth Observatory. Coastline and labels: Natural Earth.</p>
      <p id={instructions} className="map-meta globe-help">Drag to rotate. Pinch or use the zoom buttons. At close zoom, click to pin a location and open its grid-cell card below.
        <span> With the globe focused, use arrow keys to rotate and + or − to zoom.</span>
      </p>
    </>}
  </div>
}
