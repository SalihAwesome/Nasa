import { readFileSync } from 'node:fs'
import { renderToStaticMarkup } from 'react-dom/server'
import { expect, test } from 'vitest'
import { GroundTemperature } from './GroundTemperature'
import { importConfiguredPodLog } from './importLog'

const csv = readFileSync(new URL('../../public/data/sim/pod-sim.csv', import.meta.url), 'utf8')
const truth = JSON.parse(readFileSync(new URL('../../public/data/sim/pod-sim.truth.json', import.meta.url), 'utf8'))
const log = importConfiguredPodLog(csv)

test('U23 prints peak delay and range ratio within the simulator tolerances', () => {
  const html = renderToStaticMarkup(<GroundTemperature log={log} />)
  const metric = (id: string) => Number(html.match(new RegExp(`data-metric="${id}">(-?[0-9.]+)`))?.[1])
  const delay = metric('delay')
  const ratio = metric('range-ratio')
  expect(Math.abs(delay - truth.soil_delay_minutes)).toBeLessThanOrEqual(5)
  expect(Math.abs(ratio - truth.soil_range_ratio)).toBeLessThanOrEqual(0.05)
  expect(html).toContain('simulated')
  expect(html).toContain('Ground surface')
  expect(html).toContain('10 cm below ground')
  console.info(`Peak delay: ${delay} min (truth ${truth.soil_delay_minutes}); range ratio: ${ratio} (truth ${truth.soil_range_ratio})`)
})

test('a missing depth channel keeps the comparison unavailable', () => {
  const records = log.records.map(record => ({ ...record, t10: null }))
  const html = renderToStaticMarkup(<GroundTemperature log={{ ...log, records }} />)
  expect(html).toContain('No readings at 10 cm')
  expect(html).toContain('data-metric="delay">Unavailable')
  expect(html).toContain('data-metric="range-ratio">Unavailable')
})
