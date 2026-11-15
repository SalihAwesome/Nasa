import { readFileSync } from 'node:fs'
import { renderToStaticMarkup } from 'react-dom/server'
import { expect, test } from 'vitest'
import { importConfiguredPodLog } from '../pod/importLog'
import { PodSunEvidence } from './PodSunEvidence'
import { comparePodSun, readPodPrediction, sunEventNames } from './podSun'

const dataFile = (name: string) => readFileSync(new URL('../../public/data/' + name, import.meta.url), 'utf8')
const log = importConfiguredPodLog(dataFile('sim/pod-sim.csv'))
const truth = JSON.parse(dataFile('sim/pod-sim.truth.json'))
const prediction = readPodPrediction(JSON.parse(dataFile('sun/pod-prediction.json')))

test('U18 detects the simulator events and prints all three gaps in minutes', () => {
  const comparison = comparePodSun(log, prediction)
  const html = renderToStaticMarkup(<PodSunEvidence comparison={comparison} />)
  for (const event of sunEventNames) {
    const measured = comparison.events[event].measured
    const printed = html.match(new RegExp('data-gap="' + event + '">([^<]+)</'))?.[1]
    expect(measured).not.toBeNull()
    expect(Math.abs(measured! - Date.parse(truth[event])) / 60_000).toBeLessThanOrEqual(1)
    expect(printed).toMatch(/^[+-]?\d+(?:\.\d+)? min$/)
    expect(Math.abs(Number.parseFloat(printed!))).toBeLessThanOrEqual(2)
    console.info(event, new Date(measured!).toISOString(), 'truth', truth[event], 'printed gap', printed)
  }
  expect(html).toContain('simulated')
})

test('a real log cannot use the simulator site and date as its prediction', () => {
  const result = comparePodSun({ ...log, simulated: false }, prediction)
  expect(result.events.sunrise.gap).toBeNull()
  expect(result.events.sunrise.reason).toBeTruthy()
})

test('U18 shows a compass sky view from the published pod prediction', () => {
  const html = renderToStaticMarkup(<PodSunEvidence comparison={comparePodSun(log, prediction)} />)
  expect(html).toContain('Pod-site Sun 360-degree sky with compass directions')
  expect(html).toContain('Explore prediction time')
  expect(html).toContain('Compass azimuth')
  expect(html).toContain('Predicted elevation')
})

test('offers optional scroll playback and direct jumps to the three predicted events', () => {
  const html = renderToStaticMarkup(<PodSunEvidence comparison={comparePodSun(log, prediction)} />)
  expect(html).toContain('Scroll playback')
  for (const label of ['Jump to sunrise', 'Jump to peak', 'Jump to sunset']) {
    expect(html).toContain(label)
  }
})

test('labels both chart axes and identifies the selected prediction time', () => {
  const html = renderToStaticMarkup(<PodSunEvidence comparison={comparePodSun(log, prediction)} />)
  expect(html).toContain('Left axis · degrees')
  expect(html).toContain('Right axis · lux')
  expect(html).toContain('Selected time')
  expect(html).toContain('All three simulated events were detected 1 minute later than predicted.')
})
