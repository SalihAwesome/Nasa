import { PodSunSection } from './PodSunEvidence'
import { useEffect, useMemo, useState } from 'react'
import limits from '../../../shared/limits.json'
import { loadSunData, readSunSelection, selectEarth, sunHash } from './sunData'
import type { SunData, SunNumbers, SunPoint, SunSelection } from './sunData'
import { ElevationChart, fitElevation, fullElevationRange, initialCamera, rotateCamera, sampleIndex, SkyView } from './SunViews'
import type { Camera, ElevationRange } from './SunViews'
import './sun.css'

const months = Array.from({length: 12}, (_, index) =>
  new Intl.DateTimeFormat('en', {month: 'long', timeZone: 'UTC'}).format(new Date(Date.UTC(2026, index, 1))))
const latitudes = Array.from({ length: 361 }, (_, index) => index / 2 - 90)
const labels = { shackleton: 'Shackleton · Moon', jezero: 'Jezero · Mars' }
const descriptions = [
  ['peak_elevation', 'Peak elevation', 'Highest sampled Sun angle. Zero is the horizon.'],
  ['low_sun_share', 'Low Sun share', 'Share of above-horizon samples lower than 10°.'],
  ['horizon_sweep', 'Horizon sweep', 'Smallest compass arc containing the above-horizon samples.'],
] as const

function Metrics({ numbers }: { numbers: SunNumbers }) {
  return <dl className="sun-metrics">
    {descriptions.map(([key, label, description]) => {
      const value = numbers[key]
      return <div key={key}>
        <dt><details className="sun-metric-help"><summary aria-label={label + ', show definition'}>{label}</summary>
          <p className="sun-note">{description}</p>
        </details></dt>
        <dd data-metric={key} data-value={value ?? undefined}>{value === null
          ? numbers.reasons?.[key] ?? 'Unavailable'
          : key === 'low_sun_share' ? (value * 100).toFixed(1) + '%' : value.toFixed(2) + '°'}</dd>
      </div>
    })}
  </dl>
}

function elapsedHours(rows: SunPoint[]) {
  const first = Date.parse(rows[0].time_ut + 'Z')
  const last = Date.parse(rows[rows.length - 1].time_ut + 'Z')
  return (last - first) / 3_600_000
}

function duration(rows: SunPoint[]) {
  const hours = elapsedHours(rows)
  return hours >= 24 && hours % 24 === 0 ? hours / 24 + ' days' : hours + ' hours'
}

type Mode = 'sky' | 'chart'
type Playback = 'both' | 'target' | 'earth' | null

function SkyPlot({ id, label, source, rows, numbers, mode, range, index, camera, onCamera, onPlay, onScrub, playing, reducedMotion }: {
  id: 'target' | 'earth'; label: string; rows: SunPoint[]; numbers: SunNumbers
  source: string
  mode: Mode; range: ElevationRange; index: number; camera: Camera; playing: boolean; reducedMotion: boolean
  onCamera: (camera: Camera) => void; onPlay: () => void; onScrub: (index: number) => void
}) {
  const point = rows[index]
  return <article className={'sun-chart sun-chart-' + id} aria-label={label}>
    <header className="sun-chart-header"><h3>{label}</h3><span className="sun-note">{duration(rows)} of samples</span></header>
    {mode === 'sky'
      ? <SkyView label={label} rows={rows} index={index} camera={camera} onCamera={onCamera} />
      : <ElevationChart label={label} rows={rows} point={point} range={range} />}
    <div className="sun-readout">
      <time dateTime={point.time_ut + 'Z'}>{point.time_ut.replace('T', ' ').slice(0, 16)} UT</time>
      <span><strong>{point.elevation.toFixed(2)}°</strong> elevation</span>
      <span><strong>{point.azimuth.toFixed(2)}°</strong> azimuth</span>
    </div>
    <div className="sun-sample">
      <button type="button" onClick={onPlay}>{reducedMotion ? 'Next sample' : playing ? 'Pause path' : 'Play path'}</button>
      <label htmlFor={id + '-sample'}>Time sample</label>
      <input id={id + '-sample'} type="range" min={0} max={rows.length - 1} value={index}
        aria-valuetext={point.time_ut + ' UT'} onChange={event => onScrub(Number(event.target.value))} />
    </div>
    <Metrics numbers={numbers} />
    <p className="sun-note">{source}</p>
  </article>
}

export function SunComparison({ data, selection }: { data: SunData; selection: SunSelection }) {
  const target = data.targets[selection.target]
  const earth = useMemo(() => selectEarth(data, selection), [data, selection.lat, selection.month])
  const fitted = useMemo(() => fitElevation(target.rows, earth.rows), [target.rows, earth.rows])
  const [mode, setMode] = useState<Mode>('chart')
  const [camera, setCamera] = useState(initialCamera)
  const [full, setFull] = useState(false)
  const [speed, setSpeed] = useState(1)
  const [progress, setProgress] = useState({ target: 0, earth: 0 })
  const [playing, setPlaying] = useState<Playback>(null)
  const [reducedMotion, setReducedMotion] = useState(false)

  useEffect(() => {
    const preference = window.matchMedia('(prefers-reduced-motion: reduce)')
    const sync = () => {
      setReducedMotion(preference.matches)
      if (preference.matches) setPlaying(null)
    }
    sync()
    preference.addEventListener('change', sync)
    return () => preference.removeEventListener('change', sync)
  }, [])

  const primary = playing === 'earth' ? progress.earth : progress.target
  const finished = primary >= 1
  useEffect(() => {
    if (!playing || reducedMotion) return
    if (finished) { setPlaying(null); return }
    let last = performance.now()
    let frame = 0
    const tick = (now: number) => {
      const delta = Math.max(0, now - last) * speed / 14000
      last = now
      setProgress(current => ({
        target: playing === 'earth' ? current.target : Math.min(1, current.target + delta),
        earth: playing === 'target' ? current.earth : Math.min(1, current.earth + delta),
      }))
      frame = requestAnimationFrame(tick)
    }
    frame = requestAnimationFrame(tick)
    return () => cancelAnimationFrame(frame)
  }, [playing, speed, reducedMotion, finished])

  function play(which: Exclude<Playback, null>) {
    if (playing === which || playing === 'both') { setPlaying(null); return }
    if (reducedMotion) {
      setProgress(current => {
        const advance = (position: number, count: number) => ((sampleIndex(position, count) + 1) % count) / (count - 1)
        if (which === 'both') {
          const position = advance(Math.min(current.target, current.earth), Math.min(target.rows.length, earth.rows.length))
          return { target: position, earth: position }
        }
        return { ...current, [which]: advance(current[which], which === 'target' ? target.rows.length : earth.rows.length) }
      })
      return
    }
    setProgress(current => {
      if (which === 'both') {
        const common = Math.min(current.target, current.earth)
        const start = common === 1 ? 0 : common
        return { target: start, earth: start }
      }
      return current[which] === 1 ? { ...current, [which]: 0 } : current
    })
    setPlaying(which)
  }

  const difference = target.numbers.peak_elevation - earth.numbers.peak_elevation
  const shown = Math.abs(difference).toFixed(1)
  const insight = Number(shown) === 0
    ? 'The two paths reach the same peak elevation at the shown precision.'
    : (difference > 0 ? labels[selection.target] : 'Earth') + ' reaches a peak ' + shown + '° higher in these samples.'

  return <>
    <div className="sun-toolbar">
      <div className="sun-view-toggle" role="group" aria-label="Visualization">
        <button type="button" aria-pressed={mode === 'sky'} onClick={() => setMode('sky')}>Sky view</button>
        <button type="button" aria-pressed={mode === 'chart'} onClick={() => setMode('chart')}>Elevation chart</button>
      </div>
      <button className="sun-primary" type="button" onClick={() => play('both')}>
        {reducedMotion ? 'Step both' : playing === 'both' ? 'Pause both' : 'Play both'}
      </button>
      <label className="sun-speed">Playback speed <select value={speed} disabled={reducedMotion} onChange={event => setSpeed(Number(event.target.value))}>
        <option value={.5}>0.5×</option><option value={1}>1×</option><option value={2}>2×</option>
      </select></label>
    </div>
    {mode === 'sky'
      ? <div className="sun-toolbar sun-camera" role="group" aria-label="Shared camera">
        <span className="sun-note">Drag either sky to rotate both.</span>
        <button type="button" onClick={() => setCamera(current => rotateCamera(current, -15, 0))}>Rotate left</button>
        <button type="button" onClick={() => setCamera(current => rotateCamera(current, 15, 0))}>Rotate right</button>
        <button type="button" onClick={() => setCamera(current => rotateCamera(current, 0, 10))}>Tilt up</button>
        <button type="button" onClick={() => setCamera(current => rotateCamera(current, 0, -10))}>Tilt down</button>
        <button type="button" onClick={() => setCamera(initialCamera)}>Reset view</button>
      </div>
      : <div className="sun-toolbar"><label className="sun-range"><input type="checkbox" checked={full} onChange={event => setFull(event.target.checked)} /> Full range (−90° to +90°)</label>
        <span className="sun-note">Both charts share an elevation scale.</span>
      </div>}
    <p className="sun-note sun-legend"><span><i />Above horizon</span><span><i />Below horizon</span></p>
    <div className="sun-charts">
      {([
        { id: 'target', label: labels[selection.target], ...target,
          source: `JPL Horizons · ${target.window.start} to ${target.window.stop} UT (default window). Default coordinates ${target.site.value}. ${target.site.reasons.citation}` },
        { id: 'earth', label: `Earth · ${selection.lat}°, ${months[selection.month - 1]}`, ...earth,
          source: `Computed by the pipeline · ${months[selection.month - 1]} ${data.manifest.day_of_month}, ${data.manifest.year}, at ${data.manifest.longitude_deg}° longitude (default sampling). Path samples every ${data.manifest.sample_step_minutes} minutes; metrics every ${data.metricStepMinutes} minutes.` },
      ] as const).map(path => <SkyPlot key={path.id} {...path} mode={mode} range={full ? fullElevationRange : fitted}
        index={sampleIndex(progress[path.id], path.rows.length)} camera={camera} onCamera={setCamera}
        playing={playing === path.id || playing === 'both'} reducedMotion={reducedMotion}
        onPlay={() => play(path.id)} onScrub={index => {
          setPlaying(null)
          setProgress(current => ({ ...current, [path.id]: index / (path.rows.length - 1) }))
        }} />)}
    </div>
    <p className="sun-insight">{insight}</p>
    <p className="sun-note">Together, both paths advance by the same percentage. Halfway is {elapsedHours(target.rows) / 2} hours on the target path and {elapsedHours(earth.rows) / 2} hours on Earth.</p>
  </>
}

export function SunPanel({ hash }: { hash: string }) {
  const selection = readSunSelection(hash)
  const [data, setData] = useState<SunData | null>(null)
  const [failed, setFailed] = useState(false)
  const [attempt, setAttempt] = useState(0)
  useEffect(() => {
    let active = true
    loadSunData().then(result => { if (active) setData(result) }, () => { if (active) setFailed(true) })
    return () => { active = false }
  }, [attempt])
  const change = (patch: Partial<SunSelection>) => { window.location.hash = sunHash({ ...selection, ...patch }) }
  return <section className="sun-panel" aria-labelledby="sun-comparison-heading">
    <h2 id="sun-comparison-heading">Compare Sun paths</h2>
    <div className="sun-selectors">
      <div><label htmlFor="sun-target">Target</label><select id="sun-target" value={selection.target} onChange={event => change({ target: event.target.value === 'jezero' ? 'jezero' : 'shackleton' })}>
        <option value="shackleton">Shackleton · Moon</option><option value="jezero">Jezero · Mars</option>
      </select></div>
      <div><label htmlFor="sun-latitude">Earth latitude</label><select id="sun-latitude" value={selection.lat} onChange={event => change({ lat: Number(event.target.value) })}>
        {latitudes.map(lat => <option key={lat} value={lat}>{Math.abs(lat)}°{lat === 0 ? ' (equator)' : lat < 0 ? ' S' : ' N'}</option>)}
      </select></div>
      <div><label htmlFor="sun-month">Earth month</label><select id="sun-month" value={selection.month} onChange={event => change({ month: Number(event.target.value) })}>
        {months.map((month, index) => <option key={month} value={index + 1}>{month}</option>)}
      </select></div>
    </div>
    {data ? <SunComparison data={data} selection={selection} /> : failed
      ? <p role="alert">Could not load the Sun paths. <button type="button" onClick={() => { setFailed(false); setAttempt(attempt + 1) }}>Retry</button></p>
      : <p role="status">Loading Sun paths…</p>}
    <PodSunSection />
    <aside className="sun-limits" aria-labelledby="sun-limits-heading">
      <h3 id="sun-limits-heading">What this comparison leaves out</h3>
      <dl>{limits.sunPanel.map(limit => <div key={limit.title}><dt>{limit.title}</dt><dd>{limit.text}</dd></div>)}</dl>
    </aside>
  </section>
}
