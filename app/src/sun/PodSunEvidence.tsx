import { useEffect, useMemo, useRef, useState } from 'react'
import { fetchPodLog } from '../pod/importLog'
import { comparePodSun, fetchPodPrediction, lightThreshold, sunEventNames } from './podSun'
import { initialCamera, rotateCamera, SkyView } from './SunViews'
import './podSunEvidence.css'

const utcClock = new Intl.DateTimeFormat('en-GB', {
  timeZone: 'UTC', hour: '2-digit', minute: '2-digit', hourCycle: 'h23',
})
const asTime = (time: number | null) => time === null ? '—' : utcClock.format(time)
const labels = { sunrise: 'Sunrise', peak: 'Peak light', sunset: 'Sunset' }
const jumpLabels = { sunrise: 'Jump to sunrise', peak: 'Jump to peak', sunset: 'Jump to sunset' }

type Comparison = ReturnType<typeof comparePodSun>

function curve(points: { time: number; value: number | null }[], x: (time: number) => number,
  y: (value: number) => number) {
  let start = true
  return points.map(({ time, value }) => {
    if (value === null) { start = true; return '' }
    const command = start ? 'M' : 'L'
    start = false
    return command + x(time).toFixed(2) + ',' + y(value).toFixed(2)
  }).join(' ')
}

function PodLightChart({ comparison, selectedTime }: { comparison: Comparison; selectedTime: number | null }) {
  const { light, window, samples } = comparison
  if (!window || !light.some(point => point.lux !== null) && !samples.length) {
    return <p>There are too few timestamped readings to draw a curve.</p>
  }
  const fractions = [0, 0.25, 0.5, 0.75, 1]
  const highest = light.reduce((maximum, point) => Math.max(maximum, point.lux ?? 0), lightThreshold)
  const step = 10 ** Math.floor(Math.log10(highest))
  const maxLux = Math.ceil(highest / step) * step
  const x = (time: number) => (time - window.start) / (window.end - window.start) * 1000
  const elevation = curve(samples.map(point => ({ time: point.time, value: point.elevation })), x,
    degrees => (90 - degrees) / 180 * 200)
  const lux = curve(light.map(point => ({ time: point.time, value: point.lux })), x,
    value => (1 - value / maxLux) * 200)
  const multiDay = window.end - window.start > 86_400_000
  const tickTime = (fraction: number) => {
    const time = window.start + (window.end - window.start) * fraction
    return multiDay ? new Date(time).toISOString().slice(5, 16).replace('T', ' ') : asTime(time)
  }
  const formatLux = (value: number) => value >= 1000
    ? (value / 1000).toLocaleString('en-GB') + 'k' : value.toLocaleString('en-GB')
  const selectedElevation = samples.find(point => point.time === selectedTime)?.elevation
  const selectedLux = light.find(point => point.time === selectedTime)?.lux
  const cursorPosition = selectedTime === null ? null : x(selectedTime)
  return <figure className="pod-sun-figure">
    <h4>Predicted Sun height and recorded light over time</h4>
    <p className="section-explanation">The left scale shows Sun height in degrees. The right scale shows light readings from the pod in lux. Both use the same clock.</p>
    <figcaption className="pod-sun-keys">
      {samples.length > 0 && <span className="pod-sun-elevation">
        <i aria-hidden="true" /><span><strong>Predicted elevation</strong><small>Left axis · degrees</small></span>
      </span>}
      <span className="pod-sun-light">
        <i aria-hidden="true" /><span><strong>Pod light</strong><small>Right axis · lux</small></span>
      </span>
      {selectedTime !== null && <span className="pod-sun-selected">
        <i aria-hidden="true" /><span><strong>Selected time</strong><small>{asTime(selectedTime)} UTC</small></span>
      </span>}
    </figcaption>
    <div className="pod-sun-chart">
      <div className="pod-sun-scale pod-sun-elevation" aria-hidden="true">
        {samples.length > 0 && fractions.map(f => <span key={f}>{90 - 180 * f}°</span>)}
      </div>
      <svg viewBox="0 0 1000 200" preserveAspectRatio="none" role="img"
        aria-label={samples.length ? 'Predicted Sun elevation and measured pod light on the same UTC timeline'
          : 'Measured pod light on a UTC timeline'}>
        {samples.length > 0 && <rect x="0" y="100" width="1000" height="100" className="pod-sun-below" />}
        {fractions.map(f => <line key={f} x1="0" x2="1000" y1={f * 200} y2={f * 200}
          className={f === .5 && samples.length ? 'pod-sun-horizon' : 'sun-gridline'} />)}
        {fractions.map(f => <line key={f} x1={f * 1000} x2={f * 1000} y1="0" y2="200" className="sun-gridline" />)}
        {sunEventNames.map(name => {
          const time = comparison.events[name].predicted
          return time === null ? null : <line key={name} x1={x(time)} x2={x(time)} y1="0" y2="200"
            className="pod-sun-event-guide" />
        })}
        {cursorPosition !== null && <line x1={cursorPosition} x2={cursorPosition} y1="0" y2="200" className="pod-sun-cursor" />}
        <path d={elevation} className="pod-sun-elevation" />
        <path d={lux} className="pod-sun-light" />
      </svg>
      <div className="pod-sun-scale pod-sun-light" aria-hidden="true">
        {fractions.map(f => <span key={f}>{maxLux * (1 - f) >= 1000
          ? (maxLux * (1 - f) / 1000).toLocaleString('en-GB') + 'k'
          : (maxLux * (1 - f)).toLocaleString('en-GB')}</span>)}
      </div>
      <div className="pod-sun-ticks" aria-hidden="true">
        {fractions.map(f => <span key={f}>{tickTime(f)}</span>)}
      </div>
    </div>
    <p className="pod-sun-axis">Time (UTC) · {new Date(window.start).toISOString().slice(0, 10)}</p>
    {selectedTime !== null && <dl className="pod-sun-point-values">
      <div><dt>Predicted elevation</dt><dd>{selectedElevation?.toFixed(1) ?? '—'}°</dd></div>
      <div><dt>Pod light at this time</dt><dd>{selectedLux == null ? 'No exact reading' : formatLux(selectedLux) + ' lux'}</dd></div>
    </dl>}
  </figure>
}

export function PodSunEvidence({ comparison }: { comparison: Comparison }) {
  const [camera, setCamera] = useState(initialCamera)
  const [scrollPlaying, setScrollPlaying] = useState(false)
  const [reducedMotion, setReducedMotion] = useState(false)
  const stage = useRef<HTMLDivElement>(null)
  const playbackStart = useRef(0)
  const [selectedIndex, setSelectedIndex] = useState<number | null>(null)
  const sky = useMemo(() => comparison.samples.flatMap(point =>
    point.azimuth === null ? [] : [{ ...point, azimuth: point.azimuth }]
  ), [comparison.samples])
  const peak = comparison.events.peak.predicted
  const peakIndex = Math.max(0, sky.findIndex(point => point.time === peak))
  const index = Math.min(selectedIndex ?? peakIndex, sky.length - 1)
  const position = sky[index]
  const showSky = position && sky.length === comparison.samples.length
  const sunriseGap = comparison.events.sunrise.gap
  const allEqual = sunriseGap !== null && sunEventNames.every(name => comparison.events[name].gap === sunriseGap)
  const gapMinutes = Math.abs(sunriseGap ?? 0)
  const timingSummary = allEqual
    ? 'All three ' + (comparison.simulated ? 'simulated ' : '') + 'events were detected ' +
      (sunriseGap === 0 ? 'at their predicted times.' : gapMinutes.toLocaleString('en-GB', { maximumFractionDigits: 2 }) +
        (gapMinutes === 1 ? ' minute ' : ' minutes ') + (sunriseGap > 0 ? 'later' : 'earlier') + ' than predicted.')
    : null

  useEffect(() => {
    const preference = window.matchMedia('(prefers-reduced-motion: reduce)')
    const sync = () => {
      setReducedMotion(preference.matches)
      if (preference.matches) setScrollPlaying(false)
    }
    sync()
    preference.addEventListener('change', sync)
    return () => preference.removeEventListener('change', sync)
  }, [])

  useEffect(() => {
    if (!scrollPlaying || reducedMotion || sky.length < 2) return
    let frame: number | null = null
    const onScroll = () => {
      if (frame !== null) return
      frame = window.requestAnimationFrame(() => {
        frame = null
        const top = stage.current?.getBoundingClientRect().top
        if (top === undefined) return
        const progress = Math.max(0, Math.min(1, (playbackStart.current - top) / (window.innerHeight * 0.58)))
        setSelectedIndex(Math.round(progress * (sky.length - 1)))
      })
    }
    window.addEventListener('scroll', onScroll, { passive: true })
    return () => {
      window.removeEventListener('scroll', onScroll)
      if (frame !== null) window.cancelAnimationFrame(frame)
    }
  }, [scrollPlaying, reducedMotion, sky.length])

  function toggleScrollPlayback() {
    if (scrollPlaying) {
      setScrollPlaying(false)
      return
    }
    const top = stage.current?.getBoundingClientRect().top
    if (top === undefined) return
    setSelectedIndex(0)
    setScrollPlaying(true)
    playbackStart.current = top
  }

  function selectTime(index: number) {
    setScrollPlaying(false)
    setSelectedIndex(index)
  }

  return <>
    {comparison.simulated && <span className="evidence-tag evidence-tag--simulated">simulated</span>}
    <div className="pod-sun-stage" data-scroll-playing={scrollPlaying || undefined} ref={stage}>
      {showSky && <div className="pod-sky">
        <div className="pod-sky-visual">
          <h4>Predicted Sun path at the Qatar sensor site</h4>
          <p className="section-explanation">Drag the view to rotate it, or move the time slider to see where the Sun is predicted to be.</p>
          <SkyView label="Pod-site Sun" rows={sky} index={index} camera={camera} onCamera={setCamera} />
          <div className="pod-sky-legend sun-legend">
            <span><i />Above horizon</span><span><i />Below horizon</span>
          </div>
        </div>
        <div className="pod-sky-controls">
          <label htmlFor="pod-sky-time">Explore prediction time</label>
          <input id="pod-sky-time" type="range" min="0" max={sky.length - 1} step="1" value={index}
            aria-valuetext={asTime(position.time) + ' UTC'}
            onChange={event => selectTime(Number(event.target.value))} />
          <p><time dateTime={position.time_ut}>{asTime(position.time)} UTC</time></p>
          <dl className="pod-sky-angles">
            <div><dt>Elevation</dt><dd>{position.elevation.toFixed(1)}°</dd></div>
            <div><dt>Compass azimuth</dt><dd>{position.azimuth.toFixed(1)}°</dd></div>
          </dl>
          <p className="pod-sun-note">Elevation is relative to the horizon. Azimuth is measured clockwise from north.</p>
          <div className="pod-sun-story">
            <button type="button" aria-pressed={scrollPlaying} disabled={reducedMotion}
              onClick={toggleScrollPlayback}>{scrollPlaying ? 'Pause scroll playback' : 'Scroll playback'}</button>
            <div className="pod-sun-event-jumps" role="group" aria-label="Predicted times">
              {sunEventNames.map(name => {
                const time = comparison.events[name].predicted
                const index = sky.findIndex(point => point.time === time)
                return index < 0 ? null : <button key={name} type="button" aria-label={jumpLabels[name]}
                  aria-pressed={position.time === time} onClick={() => selectTime(index)}>{labels[name]}</button>
              })}
            </div>
          </div>
          {scrollPlaying && <p className="pod-sun-note">Scroll down to advance through the day. Scroll up to go back.</p>}
          {reducedMotion && <p className="pod-sun-note">Use the slider or event buttons to explore the day.</p>}
          <div className="pod-sky-camera" aria-label="3D camera controls" role="group">
            <button type="button" onClick={() => setCamera(rotateCamera(camera, -18, 0))}>Rotate left</button>
            <button type="button" onClick={() => setCamera(rotateCamera(camera, 18, 0))}>Rotate right</button>
            <button type="button" onClick={() => setCamera(initialCamera)}>Reset view</button>
          </div>
        </div>
      </div>}
      <PodLightChart comparison={comparison} selectedTime={showSky ? position.time : null} />
    </div>
    {timingSummary && <p className="pod-sun-finding">{timingSummary}</p>}
    <p className="pod-sun-note">A positive gap means the pod detected the event later. Sunrise and sunset use the {lightThreshold} lux threshold.</p>
    <dl className="pod-sun-events">
      {sunEventNames.map(name => {
        const { measured, predicted, gap, reason } = comparison.events[name]
        const printed = gap === null ? 'Unavailable'
          : (gap > 0 ? '+' : '') + Number(gap.toFixed(2)) + ' min'
        return <div key={name}>
          <dt>{labels[name]}</dt>
          <dd><strong data-gap={name}>{printed}</strong>
            <span>Predicted {asTime(predicted)} · Pod {asTime(measured)} UTC</span>
            {reason && <span>{reason}</span>}
          </dd>
        </div>
      })}
    </dl>
  </>
}

export function PodSunSection() {
  const [comparison, setComparison] = useState<Comparison | null>(null)
  const [logError, setLogError] = useState(false)
  useEffect(() => {
    const controller = new AbortController()
    const { signal } = controller
    void Promise.all([fetchPodLog(signal), fetchPodPrediction(signal).catch(() => null)])
      .then(([log, prediction]) => {
        if (!signal.aborted) setComparison(comparePodSun(log, prediction))
      }).catch(() => { if (!signal.aborted) setLogError(true) })
    return () => controller.abort()
  }, [])
  return <section className="sun-chart pod-sun-section" aria-labelledby="pod-sun-heading">
    <h3 id="pod-sun-heading">Sun prediction vs. pod light</h3>
    <p className="section-explanation">Check how closely the predicted sunrise, brightest point, and sunset line up with changes in recorded light.</p>
    {comparison ? <PodSunEvidence comparison={comparison} /> : logError
      ? <p role="alert">Could not load the pod light recording.</p>
      : <p role="status">Loading the pod light comparison…</p>}
  </section>
}
