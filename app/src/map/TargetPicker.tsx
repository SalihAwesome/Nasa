import { useEffect, useState } from 'react'
import { PlanetGlobe } from './PlanetGlobe'
import type { Planet, PlanetPoint } from '../data/planetary'
import type { MapData } from './data'
import { isMissionReference, missionReference } from './missionTarget'

export function TargetPicker({ data, body, point, onChange }: {
  data: MapData; body: Planet; point: PlanetPoint; onChange: (body: Planet, point: PlanetPoint) => void
}) {
  const [lat, setLat] = useState(String(point.lat)), [lon, setLon] = useState(String(point.lon))
  useEffect(() => { setLat(point.lat.toFixed(4)); setLon(point.lon.toFixed(4)) }, [point.lat, point.lon])
  const name = body === 'mars' ? 'Jezero crater' : 'Shackleton Connecting Ridge'
  const reference = missionReference(data, body)
  return <section className="target-picker" aria-labelledby="target-picker-title">
    <div className="target-picker-heading"><div><h2 id="target-picker-title">Choose your mission target</h2>
      <p>Pick a world, then select a point on its surface.</p></div>
      <div className="target-worlds" role="group" aria-label="Mission world">
        {(['moon', 'mars'] as const).map(world => <button key={world} type="button" aria-pressed={body === world}
          onClick={() => { if (world !== body) onChange(world, missionReference(data, world)) }}>{world === 'moon' ? 'Moon' : 'Mars'}</button>)}
      </div>
    </div>
    <div className="target-picker-body">
      <PlanetGlobe key={body} body={body} selection={point} landmarks={[{ ...reference, name }]} onSelect={point => onChange(body, point)} />
      <div className="target-location-settings">
        <h3>{isMissionReference(data, body, point) ? name : (body === 'moon' ? 'Lunar' : 'Martian') + ' surface point'}</h3>
        <p className="target-coordinates" role="status">{point.lat.toFixed(4)}°, {point.lon.toFixed(4)}°</p>
        <form className="coordinate-form" onSubmit={event => {
          event.preventDefault()
          const latitude = Number(lat), longitude = Number(lon)
          if (lat.trim() && lon.trim() && Number.isFinite(latitude) && Number.isFinite(longitude)
            && Math.abs(latitude) <= 90 && Math.abs(longitude) <= 180) onChange(body, { lat: latitude, lon: longitude })
        }}>
          <label>Latitude<input aria-label="Mission target latitude" type="number" min={-90} max={90} step="any" required value={lat} onChange={event => setLat(event.target.value)} /></label>
          <label>Longitude<input aria-label="Mission target longitude" type="number" min={-180} max={180} step="any" required value={lon} onChange={event => setLon(event.target.value)} /></label>
          <button type="submit">Use coordinates</button>
        </form>
        <button className="target-reference" type="button" onClick={() => onChange(body, reference)}>Return to {name}</button>
        <p className="section-explanation">Matches update for your selected point. Regional terrain and Sun data cover both worlds on a 1° grid. Rover weather stays at its recorded site.</p>
        <details><summary>Sources &amp; coverage</summary><p className="map-meta">LOLA (Moon), MOLA (Mars), and JPL Horizons. {data.planetary.note}</p></details>
      </div>
    </div>
  </section>
}
