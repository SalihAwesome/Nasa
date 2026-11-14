import { readFileSync } from 'node:fs'
import { renderToStaticMarkup } from 'react-dom/server'
import { expect, test } from 'vitest'
import satellite from '../../public/data/earth/pod-site-satellite.json'
import mars from '../../public/data/mars/jezero-card.json'
import settings from '../../../shared/pod_settings.json'
import { readCardSelection, loadSelectedCard } from './cardData'
import { FidelityCard } from './FidelityCard'

const simulatorPath = 'data/sim/pod-sim.csv'
const fieldPath = 'data/pod/qatar.csv'
const csv = readFileSync(new URL(`../../public/${simulatorPath}`, import.meta.url), 'utf8')
const selection = readCardSelection('#/card/pod')

function assets(log: string, path = simulatorPath) {
  return async (url: string) => {
    const relative = url.replace(/^.*?data\//, 'data/')
    if (relative === path) return new Response(log)
    if (relative === fieldPath) return new Response(null, { status: 404 })
    const bytes = readFileSync(new URL(`../../public/${relative}`, import.meta.url))
    return new Response(new Uint8Array(bytes))
  }
}

function renderedRow(html: string, id: string) {
  return html.split(`data-channel="${id}"`)[1]?.split('</tr>')[0] ?? ''
}

test('U22 shows six simulated measurements with satellite error bars and MEDA values or reasons', async () => {
  const card = await loadSelectedCard(selection, assets(csv))
  const html = renderToStaticMarkup(<FidelityCard card={card} />)
  expect(html).toContain('>simulated<')
  expect(html.match(/evidence-tag--measured/g)).toHaveLength(6)
  for (const [id, meda] of Object.entries(mars.channels)) {
    const row = renderedRow(html, id)
    const satelliteRow = satellite.channels[id as keyof typeof satellite.channels]
    expect(row).toContain('Error bar')
    expect(row).toContain(satelliteRow.cardNumber.basis)
    expect(row).toContain(meda.value === null ? meda.reason : `data-value="${meda.value}"`)
    if (meda.value === null) expect(row).toContain('no score')
  }
  expect(renderedRow(html, 'reflectivity')).toContain('pod: visible light only, one patch of ground')
  expect(renderedRow(html, 'uv')).toContain('pod: approximate UV index')
  expect(renderedRow(html, 'humidity')).toContain('unit not stated in the MEDA label')
  expect(renderedRow(html, 'air_temp')).toContain('Air sleeve has no fan')

  const records = csv.split(/\r?\n/).filter(line => /^\d/.test(line)).map(line => line.split(','))
  const ground = records.map(columns => Number(columns[3]))
  const measuredRange = Math.max(...ground) - Math.min(...ground)
  const satelliteRange = satellite.channels.ground_temp.cardNumber.value
  const expectedGap = Math.abs(measuredRange - satelliteRange)
  const groundRow = renderedRow(html, 'ground_temp')
  expect(groundRow).toContain(`data-value="${measuredRange}"`)
  expect(groundRow).toContain(`data-error-bar="${expectedGap}"`)
  const factor = Number(/^# refl_factor=(.*)$/m.exec(csv)?.[1])
  const saturation = Number(/^# lux_max=(.*)$/m.exec(csv)?.[1])
  const daylightRatios = records
    .filter(([, up, down]) => Number(up) >= settings.reflectivityMinLux.value && Number(up) < saturation && Number(down) < saturation)
    .map(([, up, down]) => Number(down) / Number(up) / factor)
  const podReflectivity = daylightRatios.reduce((sum, ratio) => sum + ratio, 0) / daylightRatios.length
  const satelliteReflectivity = satellite.channels.reflectivity.cardNumber.value
  const reflectivityGap = Math.abs(podReflectivity - satelliteReflectivity)
  expect(renderedRow(html, 'reflectivity')).toContain(`data-error-bar="${reflectivityGap}"`)
  const airMean = records.reduce((sum, columns) => sum + Number(columns[6]), 0) / records.length
  const airGap = Math.abs(airMean - satellite.channels.air_temp.cardNumber.value)
  const offset = Math.abs(Number(/^# ta_offset_c=(.*)$/m.exec(csv)?.[1]))
  const airRow = renderedRow(html, 'air_temp')
  expect(airRow).toContain(`data-error-bar="${airGap + offset}"`)
  expect(airRow).toContain('satellite gap')
  expect(airRow).toContain('absolute offset')
  console.info(`U22 card: six measured rows marked simulated, each with a satellite basis and a MEDA value or reason.
Ground temperature error bar: |${measuredRange} - ${satelliteRange}| = ${expectedGap} C.
Reflectivity error bar: |${podReflectivity} - ${satelliteReflectivity}| = ${reflectivityGap}.
Air temperature error bar: ${airGap} + ${offset} = ${airGap + offset} C.`)
})

test('U22 applies the calibration notes and preserves missing readings', async () => {
  const missingCalibration = csv.replace(/^# (refl_factor|ta_offset_c)=.*\r?\n/gm, '')
  const uncalibrated = await loadSelectedCard(selection, assets(missingCalibration))
  const html = renderToStaticMarkup(<FidelityCard card={uncalibrated} />)
  expect(renderedRow(html, 'reflectivity')).toContain('correction factor not measured')
  expect(renderedRow(html, 'air_temp')).toContain('offset not measured')

  const empty = await loadSelectedCard(selection, assets('# simulated=true\n'))
  const emptyHtml = renderToStaticMarkup(<FidelityCard card={empty} />)
  expect(renderedRow(emptyHtml, 'reflectivity')).toContain('No pod records in the log')
  expect(renderedRow(emptyHtml, 'reflectivity')).toContain('no score')
  expect(emptyHtml).not.toContain('data-error-bar=')
})

test('U22 uses the field log when present and keeps the cell card estimated', async () => {
  // Keep the fixture marked as simulated even when served at the field path.
  const field = await loadSelectedCard(selection, async url => {
    if (url.endsWith(simulatorPath)) throw new Error('Field log should take priority')
    return assets(csv, fieldPath)(url)
  })
  expect(field.rows.every(row => row.evidence === 'measured')).toBe(true)
  const cellSelection = readCardSelection(`#/card/cell/${field.cell.index}`)
  const cell = await loadSelectedCard(cellSelection, async url => {
    if (url.endsWith('.csv')) throw new Error('Cell cards do not load the pod log')
    return assets(csv)(url)
  })
  expect(cell.rows.every(row => row.evidence === 'estimate')).toBe(true)
  const cellHtml = renderToStaticMarkup(<FidelityCard card={cell} />)
  expect(renderedRow(cellHtml, 'uv')).toContain('All Sky Surface UV Index')
})
