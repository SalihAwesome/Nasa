import { useEffect, useId, useMemo, useRef } from 'react'
import type { SunPoint } from './sunData'

export type Camera = { bearing: number; tilt: number; zoom?: number }
export type ElevationRange = { min: number; max: number }
type Point = { azimuth: number; elevation: number }

export const initialCamera: Camera = { bearing: 32, tilt: 28, zoom: 1 }
export const fullElevationRange: ElevationRange = { min: -90, max: 90 }

export function fitElevation(...paths: SunPoint[][]): ElevationRange {
  // Include the horizon and leave room around the extrema of both paths.
  const values = paths.flatMap(path => path.map(point => point.elevation))
  const min = Math.min(0, ...values)
  const max = Math.max(0, ...values)
  const padding = Math.max(3, (max - min) * .08)
  return {
    min: Math.max(-90, 5 * Math.floor((min - padding) / 5)),
    max: Math.min(90, 5 * Math.ceil((max + padding) / 5)),
  }
}

export function sampleIndex(progress: number, count: number) {
  return Math.round(Math.max(0, Math.min(1, progress)) * (count - 1))
}

function pathParts(rows: Point[], project: (point: Point) => number[], splitCompass: boolean) {
  const parts = { day: '', night: '' }
  function segment(a: Point, b: Point) {
    const group = a.elevation + b.elevation >= 0 ? 'day' : 'night'
    parts[group] += `M${project(a).join(',')}L${project(b).join(',')}`
  }
  function splitHorizon(a: Point, b: Point) {
    if (a.elevation * b.elevation < 0) {
      const fraction = -a.elevation / (b.elevation - a.elevation)
      const delta = splitCompass ? b.azimuth - a.azimuth : ((b.azimuth-a.azimuth+540)%360)-180
      const horizon = {azimuth: a.azimuth + delta * fraction, elevation: 0}
      segment(a, horizon)
      segment(horizon, b)
    } else segment(a, b)
  }
  for (let i = 1; i < rows.length; i++) {
    const a = rows[i - 1], b = rows[i]
    const delta = b.azimuth - a.azimuth
    if (splitCompass && Math.abs(delta) > 180) {
      const edge = delta > 0 ? 0 : 360
      const adjusted = delta + (edge === 0 ? -360 : 360)
      const fraction = adjusted ? (edge - a.azimuth) / adjusted : 0
      const elevation = a.elevation + (b.elevation - a.elevation) * fraction
      splitHorizon(a, { azimuth: edge, elevation })
      splitHorizon({ azimuth: 360 - edge, elevation }, b)
    } else splitHorizon(a, b)
  }
  return parts
}

export function ElevationChart({ label, rows, point, range }: {
  label: string; rows: SunPoint[]; point: SunPoint; range: ElevationRange
}) {
  const { min, max } = range
  const x = (azimuth: number) => 55 + azimuth / 360 * 425
  const y = (elevation: number) => 25 + (max - elevation) / (max - min) * 218
  const paths = useMemo(() => pathParts(rows, p => [x(p.azimuth), y(p.elevation)], true), [rows, min, max])
  const ticks = Array.from({length: 5}, (_, index) => min + (max - min) * index / 4)
  return <svg viewBox="0 0 500 290" className="sun-plot" role="img" aria-label={label + ' compass azimuth and Sun elevation'}>
    <text x="55" y="15">Elevation (°)</text>
    <rect x="55" y={y(0)} width="425" height={y(min)-y(0)} className="sun-night-band" />
    {ticks.map(e => <g key={e}>
      <line x1="55" x2="480" y1={y(e)} y2={y(e)} className="sun-gridline" />
      <text x="47" y={y(e)+5} textAnchor="end">{Number(e.toFixed(1))}</text>
    </g>)}
    <line x1="55" x2="480" y1={y(0)} y2={y(0)} className="sun-horizon" />
    {['N','E','S','W','N'].map((direction,i) => <g key={i}>
      <line x1={x(i*90)} x2={x(i*90)} y1="25" y2="243" className="sun-gridline" />
      <text x={x(i*90)} y="262" textAnchor={i === 4 ? 'end' : 'middle'}>{i*90}° {direction}</text>
    </g>)}
    <text x="267" y="284" textAnchor="middle">Compass azimuth</text>
    <path d={paths.day} className="sun-path" />
    <path d={paths.night} className="sun-path sun-path-night" />
    <circle data-sun-marker r="6" cx={x(point.azimuth)} cy={y(point.elevation)} className="sun-marker" />
  </svg>
}

const radians = Math.PI / 180
const circle = Array.from({length: 73}, (_, i) => i * 5)
const meridian = Array.from({length: 37}, (_, i) => i * 5 - 90)
const wrapAngle = (angle: number) => ((angle % 360) + 360) % 360

export function rotateCamera(camera: Camera, dx: number, dy: number): Camera {
  return { ...camera, bearing: wrapAngle(camera.bearing + dx), tilt: wrapAngle(camera.tilt + dy) }
}

export function zoomCamera(camera: Camera, delta: number): Camera {
  return { ...camera, zoom: Math.max(.7, Math.min(1.8, Math.round(((camera.zoom ?? 1) + delta) * 100) / 100)) }
}

export function SkyView({ label, rows, index, camera, onCamera }: {
  label: string; rows: SunPoint[]; index: number; camera: Camera; onCamera: (camera: Camera) => void
}) {
  const glow = useId()
  const drag = useRef<{ id: number; x: number; y: number; camera: Camera } | null>(null)
  const pending = useRef<{ frame: number; camera: Camera } | null>(null)
  useEffect(() => () => {
    if (pending.current) cancelAnimationFrame(pending.current.frame)
    pending.current = null
  }, [])
  const geometry = useMemo(() => {
    const tilt = camera.tilt * radians
    function project(point: Point, distance = 1) {
      const a = (point.azimuth - camera.bearing) * radians
      const e = point.elevation * radians
      const horizontal = Math.cos(e) * distance * 143
      return [
        250 + Math.sin(a) * horizontal * 1.37,
        158 - Math.sin(e) * distance * 143 * Math.cos(tilt) - Math.cos(a) * horizontal * Math.sin(tilt),
      ]
    }
    const ring = (elevation: number) => circle.map(azimuth => project({azimuth,elevation}).join(',')).join(' ')
    const arcs = [0,90,180,270].map(azimuth => meridian.map(elevation => project({azimuth,elevation}).join(',')).join(' '))
    return { project, arcs, rings: [-60, -30, 0, 30, 60].map(ring), paths: pathParts(rows, project, false) }
  }, [rows, camera.bearing, camera.tilt])
  const { project, rings, arcs, paths } = geometry
  const selected = rows[index]
  const [cx, cy] = project(selected)
  const trail = rows.slice(Math.max(0,index-8), index+1)
  return <svg viewBox="0 0 500 316" className="sun-plot sun-sky" role="img"
    aria-label={label + ' 360-degree sky with compass directions, horizon and Sun marker'}
    tabIndex={0}
    onKeyDown={event => {
      const turns: Record<string, [number, number]> = { ArrowLeft: [-15, 0], ArrowRight: [15, 0], ArrowUp: [0, 15], ArrowDown: [0, -15] }
      const turn = turns[event.key]
      if (!turn) return
      event.preventDefault()
      onCamera(rotateCamera(camera, ...turn))
    }}
    onPointerDown={event => {
      if (event.button !== 0 || drag.current) return
      drag.current = { id: event.pointerId, x: event.clientX, y: event.clientY, camera }
      event.currentTarget.setPointerCapture(event.pointerId)
    }}
    onPointerMove={event => {
      const start = drag.current
      if (!start || start.id !== event.pointerId) return
      const next = rotateCamera(start.camera, (event.clientX - start.x) * .75, (start.y - event.clientY) * .75)
      if (pending.current) { pending.current.camera = next; return }
      const frame = requestAnimationFrame(() => {
        const update = pending.current
        pending.current = null
        if (update) onCamera(update.camera)
      })
      pending.current = { frame, camera: next }
    }}
    onLostPointerCapture={() => { drag.current = null }}>
    <defs>
      <radialGradient id={glow}><stop offset="0" className="sun-glow-core" /><stop offset="1" className="sun-glow-edge" /></radialGradient>
    </defs>
    <g transform={`translate(250 158) scale(${camera.zoom ?? 1}) translate(-250 -158)`}>
    {arcs.map(arc => <polyline key={arc} points={arc} className="sun-dome" />)}
    {rings.map((ring, index) => index === 2 ? null : <polygon key={index} points={ring} className="sun-dome" />)}
    <polygon points={rings[2]} className="sun-ground" />
    <polygon points={rings[2]} className="sun-horizon-rim" />
    <path d={paths.night} className="sun-path sun-path-night" />
    {[['N',0],['E',90],['S',180],['W',270]].map(([direction, angle]) => {
      const [x,y] = project({azimuth:Number(angle),elevation:0}, 1.12)
      const [rimX,rimY] = project({azimuth:Number(angle),elevation:0})
      return <g key={direction}>
        <line x1="250" y1="158" x2={rimX} y2={rimY} className="sun-gridline" />
        <text x={x} y={y+5} textAnchor="middle" className="sun-compass">{direction}</text>
      </g>
    })}
    <path d={paths.day} className="sun-path" />
    {trail.slice(1).map((point,i) => {
      const [a,b]=project(trail[i]), [c,d]=project(point)
      return <line key={i} x1={a} y1={b} x2={c} y2={d} className={'sun-trail'+(point.elevation<0?' sun-path-night':'')} opacity={(i+1)/trail.length} />
    })}
    <line x1="250" y1="158" x2={cx} y2={cy} className="sun-observer-ray" />
    <circle cx="250" cy="158" r="4" className="sun-observer" />
    <circle cx={cx} cy={cy} r="24" fill={`url(#${glow})`} className={selected.elevation<0?'sun-dim':''} />
    <circle cx={cx} cy={cy} r="6" className={'sun-marker'+(selected.elevation<0?' sun-dim':'')} data-sun-marker />
    </g>
  </svg>
}
