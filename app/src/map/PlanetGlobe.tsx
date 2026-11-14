import { lazy, Suspense, useEffect, useId, useLayoutEffect, useRef, useState } from 'react'
import type { KeyboardEvent, PointerEvent } from 'react'
import type { Cell } from './model'
import type { GlobeView } from './globe'
import { createSurface, globePoint, surfaceRadius } from './surface'

export type World = 'earth' | 'moon' | 'mars'
export type GlobeLandmark = Cell & { name: string }
export const worldNames = { earth: 'Earth', moon: 'Moon', mars: 'Mars' }

function cameraAt(view: GlobeView, lon: number, lat: number, zoom = view.zoom): GlobeView {
  let latitude = ((lat + 180) % 360 + 360) % 360 - 180
  let longitude = lon
  if (latitude > 90) { latitude = 180 - latitude; longitude += 180 }
  if (latitude < -90) { latitude = -180 - latitude; longitude += 180 }
  return { lon: ((longitude + 180) % 360 + 360) % 360 - 180, lat: latitude, zoom: Math.max(1, Math.min(24, zoom)) }
}

type PlanetGlobeProps = {
  body: World; selection: Cell; landmarks: readonly GlobeLandmark[]; onSelect: (point: Cell) => void
}

const GoogleEarthView = import.meta.env.VITE_GOOGLE_MAPS_API_KEY
  ? lazy(() => import('./GoogleEarthView').then(module => ({ default: module.GoogleEarthView }))) : null

export function PlanetGlobe(props: PlanetGlobeProps) {
  return props.body === 'earth' && GoogleEarthView
    ? <Suspense fallback={<p role="status">Loading Google Earth view…</p>}><GoogleEarthView selection={props.selection} landmarks={props.landmarks} onSelect={props.onSelect} initialRange={1000000} /></Suspense>
    : <LocalPlanetGlobe {...props} />
}

function LocalPlanetGlobe({ body, selection, landmarks, onSelect }: PlanetGlobeProps) {
  const stage = useRef<HTMLDivElement>(null)
  const surface = useRef<HTMLCanvasElement>(null)
  const overlay = useRef<HTMLCanvasElement>(null)
  const camera = useRef<GlobeView>({ ...selection, zoom: 1 })
  const model = useRef({ selection, landmarks, onSelect })
  const draw = useRef(() => {})
  const pending = useRef(0)
  const drag = useRef<{ start: Cell; x: number; y: number; moved: boolean; radius: number; zoom: number } | null>(null)
  const pointers = useRef(new Map<number, { x: number; y: number }>())
  const pinch = useRef<{ distance: number; zoom: number } | null>(null)
  const [load, setLoad] = useState<'loading' | 'ready' | 'error'>('loading')
  const [zoom, setZoom] = useState(1)
  const help = useId()

  function schedule() {
    if (!pending.current) pending.current = requestAnimationFrame(() => { pending.current = 0; draw.current() })
  }
  function change(view: GlobeView) {
    camera.current = view
    setZoom(view.zoom)
    schedule()
  }

  useLayoutEffect(() => {
    model.current = { selection, landmarks, onSelect }
    schedule()
  }, [selection, landmarks, onSelect])
  useLayoutEffect(() => {
    camera.current = cameraAt(camera.current, selection.lon, selection.lat)
    schedule()
  }, [selection.lon, selection.lat])

  useEffect(() => {
    const base = surface.current, labels = overlay.current, host = stage.current
    const ctx = labels?.getContext('2d')
    if (!base || !labels || !host || !ctx) return
    let active = true
    setLoad('loading')
    const renderer = createSurface(base, import.meta.env.BASE_URL + 'data/surfaces/' + body + '.jpg',
      () => { if (active) { setLoad('ready'); schedule() } },
      () => { if (active) setLoad('error') }, body === 'earth')
    draw.current = () => {
      const { width, height } = host.getBoundingClientRect()
      if (!width || !height) return
      const view = camera.current
      renderer?.draw(view, width, height)
      const ratio = Math.min(window.devicePixelRatio || 1, 2)
      const w = Math.round(width * ratio), h = Math.round(height * ratio)
      if (labels.width !== w || labels.height !== h) { labels.width = w; labels.height = h }
      ctx.setTransform(w / width, 0, 0, h / height, 0, 0)
      ctx.clearRect(0, 0, width, height)
      const radius = surfaceRadius(width, height, view.zoom), rad = Math.PI / 180
      const cp = Math.cos(view.lat * rad), sp = Math.sin(view.lat * rad)
      function project(point: Cell) {
        const lat = point.lat * rad, delta = (point.lon - view.lon) * rad
        const depth = cp * Math.cos(lat) * Math.cos(delta) + sp * Math.sin(lat)
        if (depth < 0.05) return null
        const x = width / 2 + radius * Math.cos(lat) * Math.sin(delta)
        const y = height / 2 - radius * (cp * Math.sin(lat) - sp * Math.cos(lat) * Math.cos(delta))
        return x < 5 || y < 5 || x > width - 5 || y > height - 5 ? null : { x, y }
      }
      ctx.font = "600 13px 'IBM Plex Sans', system-ui, sans-serif"
      ctx.textBaseline = 'middle'
      ctx.lineJoin = 'round'
      ctx.lineWidth = 3
      ctx.strokeStyle = '#081019'
      const occupied: { x: number; y: number; width: number }[] = []
      const label = (point: Cell, name: string, selected = false) => {
        const projected = project(point)
        if (!projected) return
        const { x, y } = projected, textWidth = ctx.measureText(name).width
        const left = x + 10 + textWidth < width - 4 ? x + 8 : x - textWidth - 8
        if (!selected && occupied.some(box => Math.abs(y - box.y) < 20 && left < box.x + box.width && left + textWidth > box.x)) return
        occupied.push({ x: left, y, width: textWidth })
        ctx.fillStyle = selected ? '#ffe19c' : '#f5f8fa'
        ctx.beginPath(); ctx.arc(x, y, selected ? 5 : 2.5, 0, Math.PI * 2); ctx.stroke(); ctx.fill()
        ctx.strokeText(name, left, y)
        ctx.fillText(name, left, y)
      }
      label(model.current.selection, 'Selected location', true)
      for (const landmark of model.current.landmarks) label(landmark, landmark.name)
    }
    const resize = new ResizeObserver(schedule)
    resize.observe(host)
    const wheel = (event: WheelEvent) => {
      if (document.activeElement !== labels || event.ctrlKey || event.metaKey) return
      event.preventDefault()
      const view = camera.current
      change(cameraAt(view, view.lon, view.lat, view.zoom * Math.exp(-event.deltaY * .002)))
    }
    const lost = (event: Event) => { event.preventDefault(); setLoad('error') }
    labels.addEventListener('wheel', wheel, { passive: false })
    base.addEventListener('webglcontextlost', lost)
    schedule()
    return () => {
      active = false
      resize.disconnect()
      renderer?.dispose()
      labels.removeEventListener('wheel', wheel)
      base.removeEventListener('webglcontextlost', lost)
      cancelAnimationFrame(pending.current)
      pending.current = 0
      draw.current = () => {}
    }
  }, [body])

  function down(event: PointerEvent<HTMLCanvasElement>) {
    if (event.button !== 0) return
    const { width, height } = event.currentTarget.getBoundingClientRect()
    pointers.current.set(event.pointerId, { x: event.clientX, y: event.clientY })
    if (!drag.current) drag.current = { start: { ...camera.current }, x: event.clientX, y: event.clientY,
      radius: surfaceRadius(width, height, camera.current.zoom), moved: false, zoom: camera.current.zoom }
    if (pointers.current.size === 2) {
      const [a, b] = [...pointers.current.values()]
      pinch.current = { distance: Math.hypot(a.x - b.x, a.y - b.y), zoom: camera.current.zoom }
      drag.current.moved = true
    }
    event.currentTarget.setPointerCapture(event.pointerId)
  }
  function move(event: PointerEvent<HTMLCanvasElement>) {
    const start = drag.current
    if (!start || !pointers.current.has(event.pointerId)) return
    pointers.current.set(event.pointerId, { x: event.clientX, y: event.clientY })
    if (pinch.current && pointers.current.size === 2) {
      const [a, b] = [...pointers.current.values()]
      const view = camera.current
      change(cameraAt(view, view.lon, view.lat, pinch.current.zoom * Math.hypot(a.x - b.x, a.y - b.y) / Math.max(1, pinch.current.distance)))
      return
    }
    const dx = event.clientX - start.x, dy = event.clientY - start.y
    if (!start.moved && Math.hypot(dx, dy) < 5) return
    start.moved = true
    const scale = 180 / Math.PI / start.radius
    change(cameraAt(camera.current, start.start.lon - dx * scale, start.start.lat + dy * scale, start.zoom))
  }
  function up(event: PointerEvent<HTMLCanvasElement>, select: boolean) {
    if (!pointers.current.delete(event.pointerId)) return
    const start = drag.current
    if (pointers.current.size) {
      const next = pointers.current.values().next().value
      if (start && next) {
        const rect = event.currentTarget.getBoundingClientRect()
        drag.current = { start: { ...camera.current }, ...next, zoom: camera.current.zoom, moved: true,
          radius: surfaceRadius(rect.width, rect.height, camera.current.zoom) }
      }
      pinch.current = null
      return
    }
    drag.current = null
    pinch.current = null
    if (!select || !start || start.moved) return
    const rect = event.currentTarget.getBoundingClientRect()
    const point = globePoint(camera.current, rect.width, rect.height, event.clientX - rect.left, event.clientY - rect.top)
    if (point) model.current.onSelect(point)
  }
  function key(event: KeyboardEvent<HTMLCanvasElement>) {
    const view = camera.current, angle = 12 / view.zoom
    const shifts: Record<string, [number, number]> = { ArrowLeft: [-angle, 0], ArrowRight: [angle, 0], ArrowUp: [0, angle], ArrowDown: [0, -angle] }
    const shift = shifts[event.key]
    if (shift) change(cameraAt(view, view.lon + shift[0], view.lat + shift[1]))
    else if (event.key === '+' || event.key === '=') change(cameraAt(view, view.lon, view.lat, view.zoom * 1.5))
    else if (event.key === '-') change(cameraAt(view, view.lon, view.lat, view.zoom / 1.5))
    else if (event.key === 'Enter') model.current.onSelect({ lat: view.lat, lon: view.lon })
    else return
    event.preventDefault()
  }
  return <div className="planet-viewer">
    <div className="planet-stage" ref={stage}>
      <canvas className="planet-surface" ref={surface} aria-hidden="true" />
      <canvas className="planet-labels" ref={overlay} tabIndex={0} role="img" aria-label={'Interactive ' + worldNames[body] + ' selection globe'}
        aria-describedby={help} onPointerDown={down} onPointerMove={move} onPointerUp={event => up(event, true)}
        onPointerCancel={event => up(event, false)} onLostPointerCapture={event => up(event, false)} onKeyDown={key} />
      {load !== 'ready' && <p className="planet-loading" role="status">{load === 'error'
        ? 'The surface image could not render. Use the coordinates below to choose a location.' : 'Loading ' + worldNames[body] + ' surface…'}</p>}
    </div>
    <div className="planet-toolbar" role="group" aria-label={worldNames[body] + ' globe controls'}>
      <button type="button" disabled={zoom <= 1} onClick={() => change(cameraAt(camera.current, camera.current.lon, camera.current.lat, zoom / 1.5))}>Zoom out</button>
      <output>{zoom.toFixed(1)}×</output>
      <button type="button" disabled={zoom >= 24} onClick={() => change(cameraAt(camera.current, camera.current.lon, camera.current.lat, zoom * 1.5))}>Zoom in</button>
      <button type="button" onClick={() => change({ ...selection, zoom: 1 })}>Reset view</button>
    </div>
    <p id={help} className="feature-muted">Drag to rotate. Pinch or zoom for detail. Click the surface to choose a point. Arrow keys rotate, and Enter selects the center.</p>
  </div>
}
