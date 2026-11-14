import { useEffect, useLayoutEffect, useRef, useState } from 'react'
import type { Cell } from './model'
import { loadGoogleEarth } from './googleMaps'
import GoogleSatelliteView from './GoogleSatelliteView'
import './googleEarth.css'

type Landmark = Cell & { name: string }
type LoadState = 'loading' | 'ready' | 'error'

type GoogleEarthProps = {
  selection: Cell
  landmarks: readonly Landmark[]
  onSelect: (point: Cell) => void
  initialRange?: number
  focusRange?: number
}

export function GoogleEarthView(props: GoogleEarthProps) {
  const [terrain, setTerrain] = useState(false)
  const initialRange = props.initialRange ?? 18000000
  return <>
    <div className="google-earth-toolbar" role="group" aria-label="Google imagery view">
      <button type="button" aria-pressed={!terrain} onClick={() => setTerrain(false)}>Satellite</button>
      <button type="button" aria-pressed={terrain} onClick={() => setTerrain(true)}>3D terrain</button>
    </div>
    {terrain ? <Google3DEarthView {...props} initialRange={initialRange} />
      : <GoogleSatelliteView {...props} initialRange={initialRange} />}
  </>
}

function Google3DEarthView({ selection, landmarks, onSelect, initialRange = 18000000, focusRange }: GoogleEarthProps) {
  const host = useRef<HTMLDivElement>(null)
  const map = useRef<google.maps.maps3d.Map3DElement | null>(null)
  const sdk = useRef<google.maps.Maps3DLibrary | null>(null)
  const callbacks = useRef(onSelect)
  const initial = useRef({ selection, initialRange })
  const previousSelection = useRef(selection)
  const [status, setStatus] = useState<LoadState>('loading')
  const [labels, setLabels] = useState(true)
  useLayoutEffect(() => { callbacks.current = onSelect }, [onSelect])

  useEffect(() => {
    const element = host.current
    if (!element) return
    let active = true
    let removeListeners = () => {}
    const fail = () => { if (active) setStatus('error') }
    window.addEventListener('google-maps-auth-failure', fail)
    const timeout = window.setTimeout(fail, 45000)
    loadGoogleEarth().then(library => {
      if (!active) return
      sdk.current = library
      const view = new library.Map3DElement({
        center: { lat: initial.current.selection.lat, lng: initial.current.selection.lon, altitude: 0 },
        range: initial.current.initialRange,
        tilt: 0,
        heading: 0,
        mode: library.MapMode.HYBRID,
        gestureHandling: library.GestureHandling.COOPERATIVE,
      })
      view.setAttribute('aria-label', 'Google satellite 3D Earth map')
      const choose = (event: Event) => {
        if (event instanceof library.LocationClickEvent && event.position) {
          callbacks.current({ lat: event.position.lat, lon: event.position.lng })
        }
      }
      view.addEventListener('gmp-error', fail)
      view.addEventListener('gmp-click', choose)
      element.replaceChildren(view)
      map.current = view
      // Camera controls work while Google progressively streams sharper imagery.
      window.clearTimeout(timeout)
      setStatus('ready')
      removeListeners = () => {
        view.removeEventListener('gmp-error', fail)
        view.removeEventListener('gmp-click', choose)
        view.remove()
      }
    }).catch(fail)
    return () => {
      active = false
      window.clearTimeout(timeout)
      window.removeEventListener('google-maps-auth-failure', fail)
      removeListeners()
      map.current = null
      sdk.current = null
    }
  }, [])

  useEffect(() => {
    const view = map.current
    if (!view) return
    if (previousSelection.current.lat === selection.lat && previousSelection.current.lon === selection.lon) return
    previousSelection.current = selection
    // Apply the camera atomically and target the terrain, rather than sea level.
    // Independent center/range writes can put the camera below elevated sites.
    moveCamera({ center: { lat: selection.lat, lng: selection.lon },
      range: focusRange ?? view.range ?? initialRange, tilt: focusRange === undefined ? view.tilt : 45 })
  }, [selection.lat, selection.lon, focusRange, status])

  useEffect(() => {
    const view = map.current, library = sdk.current
    if (!view || !library) return
    const markers = landmarks.map(site => {
      const marker = new library.Marker3DInteractiveElement({
        position: { lat: site.lat, lng: site.lon, altitude: 0 },
        altitudeMode: library.AltitudeMode.CLAMP_TO_GROUND,
        label: site.name,
        title: site.name,
      })
      marker.addEventListener('gmp-click', event => {
        event.stopPropagation()
        callbacks.current({ lat: site.lat, lon: site.lon })
      })
      view.append(marker)
      return marker
    })
    return () => markers.forEach(marker => marker.remove())
  }, [landmarks, status])

  function moveCamera(camera: google.maps.maps3d.CameraOptions) {
    const view = map.current
    if (!view || !sdk.current) return
    Promise.resolve(view.flyCameraTo({ endCamera: { ...camera,
      altitudeMode: sdk.current.AltitudeMode.RELATIVE_TO_GROUND }, durationMillis: 0 })).catch(() => setStatus('error'))
  }

  function overview() {
    moveCamera({ range: initial.current.initialRange, tilt: 0, heading: 0,
      center: { lat: initial.current.selection.lat, lng: initial.current.selection.lon } })
  }

  return <div className="google-earth-view">
    <div className="google-earth-stage">
      <div ref={host} className="google-earth-host" />
      {status === 'loading' && <p className="google-earth-status" role="status">Loading Google satellite imagery…</p>}
      {status === 'error' && <div className="google-earth-status google-earth-error" role="alert">
        <strong>Google’s map could not load</strong>
        <p>Check your internet connection and that the Google Maps key allows this website and the Maps JavaScript API.</p>
        <button type="button" onClick={() => window.location.reload()}>Retry map</button>
      </div>}
    </div>
    <div className="google-earth-toolbar" role="group" aria-label="Google Earth view controls">
      <button type="button" disabled={status !== 'ready'} onClick={() => {
        if (map.current) moveCamera({ range: Math.min(60000000, (map.current.range ?? initialRange) * 1.8) })
      }}>Zoom out</button>
      <button type="button" disabled={status !== 'ready'} onClick={() => {
        if (map.current) moveCamera({ range: Math.max(150, (map.current.range ?? initialRange) / 1.8) })
      }}>Zoom in</button>
      <button type="button" disabled={status !== 'ready'} onClick={() => moveCamera({ range: 12000, tilt: 60 })}>Explore terrain</button>
      <button type="button" disabled={status !== 'ready'} onClick={overview}>Reset view</button>
      <button type="button" disabled={status !== 'ready'} aria-pressed={labels} onClick={() => {
        if (!map.current || !sdk.current) return
        map.current.mode = labels ? sdk.current.MapMode.SATELLITE : sdk.current.MapMode.HYBRID
        setLabels(value => !value)
      }}>Place labels</button>
    </div>
    <p className="map-meta">Drag to move. Use the map controls to zoom and tilt. Select the surface or a site marker to inspect a location. Google imagery needs an internet connection.</p>
  </div>
}
