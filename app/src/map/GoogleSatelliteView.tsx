import { useEffect, useLayoutEffect, useRef, useState } from 'react'
import type { Cell } from './model'
import { loadGoogleSatellite } from './googleMaps'

type Landmark = Cell & { name: string }

export default function GoogleSatelliteView({ selection, landmarks, onSelect, initialRange, focusRange }: {
  selection: Cell; landmarks: readonly Landmark[]; onSelect: (point: Cell) => void
  initialRange: number; focusRange?: number
}) {
  const host = useRef<HTMLDivElement>(null)
  const map = useRef<google.maps.Map | null>(null)
  const sdk = useRef<Awaited<ReturnType<typeof loadGoogleSatellite>> | null>(null)
  const callback = useRef(onSelect)
  const initial = useRef({ selection, zoom: initialRange < 2000000 ? 6 : 2 })
  const [status, setStatus] = useState<'loading' | 'ready' | 'error'>('loading')
  const [labels, setLabels] = useState(true)
  useLayoutEffect(() => { callback.current = onSelect }, [onSelect])

  useEffect(() => {
    const element = host.current
    if (!element) return
    let active = true
    let removeListeners = () => {}
    const fail = () => { if (active) setStatus('error') }
    window.addEventListener('google-maps-auth-failure', fail)
    loadGoogleSatellite().then(library => {
      if (!active) return
      sdk.current = library
      const view = new library.Map(element, {
        center: { lat: initial.current.selection.lat, lng: initial.current.selection.lon },
        zoom: initial.current.zoom, mapTypeId: 'hybrid', mapId: 'DEMO_MAP_ID',
        gestureHandling: 'cooperative', mapTypeControl: false, streetViewControl: false,
        fullscreenControl: true, tilt: 0,
      })
      map.current = view
      const click = view.addListener('click', (event: google.maps.MapMouseEvent) => {
        if (event.latLng) callback.current({ lat: event.latLng.lat(), lon: event.latLng.lng() })
      })
      const ready = view.addListener('tilesloaded', () => { if (active) setStatus('ready') })
      removeListeners = () => { click.remove(); ready.remove(); element.replaceChildren() }
    }).catch(fail)
    return () => {
      active = false
      window.removeEventListener('google-maps-auth-failure', fail)
      removeListeners()
      map.current = null
      sdk.current = null
    }
  }, [])

  useEffect(() => {
    if (!map.current) return
    map.current.panTo({ lat: selection.lat, lng: selection.lon })
    if (focusRange !== undefined) map.current.setZoom(11)
  }, [selection.lat, selection.lon, focusRange, status])

  useEffect(() => {
    const view = map.current, library = sdk.current
    if (!view || !library) return
    const markers = landmarks.map(site => {
      const marker = new library.AdvancedMarkerElement({ map: view,
        position: { lat: site.lat, lng: site.lon }, title: site.name, gmpClickable: true })
      const click = () => callback.current({ lat: site.lat, lon: site.lon })
      marker.addEventListener('gmp-click', click)
      return () => { marker.removeEventListener('gmp-click', click); marker.map = null }
    })
    return () => markers.forEach(remove => remove())
  }, [landmarks, status])

  return <div className="google-satellite-view">
    <div className="google-earth-stage">
      <div ref={host} className="google-earth-host" aria-label="Google satellite Earth map" />
      {status === 'loading' && <p className="google-earth-status" role="status">Loading Google satellite imagery…</p>}
      {status === 'error' && <div className="google-earth-status google-earth-error" role="alert">
        <strong>Google’s map could not load</strong>
        <p>Check your connection and the Google Maps key’s website and API settings.</p>
        <button type="button" onClick={() => window.location.reload()}>Retry map</button>
      </div>}
    </div>
    <div className="google-earth-toolbar" role="group" aria-label="Google satellite view controls">
      <button type="button" disabled={status !== 'ready'} onClick={() => {
        map.current?.setCenter({ lat: initial.current.selection.lat, lng: initial.current.selection.lon })
        map.current?.setZoom(initial.current.zoom)
      }}>Reset view</button>
      <button type="button" disabled={status !== 'ready'} aria-pressed={labels} onClick={() => {
        map.current?.setMapTypeId(labels ? 'satellite' : 'hybrid')
        setLabels(value => !value)
      }}>Place labels</button>
    </div>
    <p className="map-meta">Zoom for satellite detail. Select the map or a site marker to inspect a location. Google imagery needs an internet connection.</p>
  </div>
}
