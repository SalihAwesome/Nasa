import { useEffect, useMemo, useState } from 'react'
import { GoogleEarthView } from './GoogleEarthView'
import type { EarthGlobeProps } from './EarthGlobe'
import type { Cell } from './model'
import { homeView } from './globe'
import { findPodCell } from '../card/cardData'
import { nearestPlace } from './places'

export default function GoogleEarthExplorer({ data, sites, cities, scores, onHover, onOpen, onDraw }: EarthGlobeProps) {
  const [selected, setSelected] = useState<Cell | null>(null)
  const [latitude, setLatitude] = useState('')
  const [longitude, setLongitude] = useState('')
  const [siteId, setSiteId] = useState('')
  const cellIndex = useMemo(() => {
    if (!selected) return null
    try { return findPodCell(data, selected) } catch { return null }
  }, [data, selected])
  const nearest = useMemo(() => selected && nearestPlace(selected, cities), [selected, cities])
  const landmarks = useMemo(() => selected
    ? [...sites, { ...selected, name: 'Selected location' }] : sites, [sites, selected])
  useEffect(() => { onHover(cellIndex) }, [cellIndex, onHover])
  useEffect(() => { const frame = requestAnimationFrame(onDraw); return () => cancelAnimationFrame(frame) }, [scores, onDraw])

  function choose(point: Cell) {
    setSelected(point)
    setLatitude(point.lat.toFixed(4))
    setLongitude(point.lon.toFixed(4))
    setSiteId('')
  }

  return <div className="globe-explorer">
    <GoogleEarthView selection={selected ?? homeView} landmarks={landmarks} onSelect={choose} focusRange={selected ? 30000 : undefined} />
    <label className="globe-sites">Analog sites
      <select value={siteId} onChange={event => {
        const site = sites.find(item => item.id === event.target.value)
        if (!site) { setSelected(null); setSiteId(''); return }
        choose(site)
        setSiteId(site.id)
      }}>
        <option value="">Choose a site</option>
        {sites.map(site => <option key={site.id} value={site.id}>{site.name}</option>)}
      </select>
    </label>
    <form className="coordinate-form" onSubmit={event => {
      event.preventDefault()
      const lat = Number(latitude), lon = Number(longitude)
      if (latitude.trim() && longitude.trim() && Number.isFinite(lat) && Number.isFinite(lon) && Math.abs(lat) <= 90 && Math.abs(lon) <= 180) choose({ lat, lon })
    }}>
      <label>Latitude<input type="number" step="any" min={-90} max={90} required value={latitude} onChange={event => setLatitude(event.target.value)} /></label>
      <label>Longitude<input type="number" step="any" min={-180} max={180} required value={longitude} onChange={event => setLongitude(event.target.value)} /></label>
      <button type="submit">Go to coordinates</button>
    </form>
    {selected && <p className="map-meta" role="status">
      {selected.lat.toFixed(4)}°, {selected.lon.toFixed(4)}°{nearest && <> · Nearest mapped place: {nearest.name}</>}
    </p>}
    {selected && (cellIndex === null ? <p className="map-meta">No land cell in the dataset at these coordinates.</p>
      : <button type="button" className="globe-site-card" onClick={() => onOpen(cellIndex)}>Open fidelity card for this cell</button>)}
    <p className="map-meta">Scores use the original climate grid. Google’s terrain and imagery are visual context, not new climate measurements. Select Match colors to see the complete score layer.</p>
  </div>
}
