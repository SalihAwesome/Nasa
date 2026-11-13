/// <reference types="node" />

import { describe, expect, test } from 'vitest'
import { readFileSync } from 'node:fs'
import truth from '../../public/data/sim/pod-sim.truth.json'
import podSettings from '../../../shared/pod_settings.json'
import { parsePodLine } from './parse'

const sunEventLux = podSettings.sunEventLux.value

const columns = 'ts,lux_up,lux_dn,tg,tamb,uv,ta,rh,p,t10'
const timestamp = '2026-11-14T02:51:00Z'
const goodLine = [timestamp, 400, 32.4, 25, 22, 0, 22, 50, 1013, 24].join(',')

describe('parsePodLine', () => {
  test('parses a complete record and keeps sensor temperature separate', () => {
    expect(parsePodLine(goodLine, 120000)).toEqual({
      kind: 'record',
      record: { ts: timestamp, lux_up: 400, lux_dn: 32.4, tg: 25, tamb: 22, uv: 0, ta: 22, rh: 50, p: 1013, t10: 24 },
      saturated: { lux_up: false, lux_dn: false },
    })
  })

  test('recognizes the column line with a carriage return', () => {
    expect(parsePodLine(columns + '\r')).toEqual({ kind: 'columns' })
  })

  test('parses settings and keeps the simulation marker', () => {
    expect(parsePodLine('# lux_max=120000')).toEqual({ kind: 'setting', key: 'lux_max', value: '120000' })
    expect(parsePodLine('# simulated=true')).toEqual({ kind: 'setting', key: 'simulated', value: 'true' })
  })

  test('preserves an empty reading', () => {
    expect(parsePodLine(goodLine.replace(',32.4,', ',,'))).toMatchObject({
      kind: 'record', record: { lux_dn: null },
    })
  })

  test('rejects text in a numeric field and non-finite or non-decimal values', () => {
    for (const invalid of ['text', '1e999', '0x10', ' ']) {
      expect(parsePodLine(goodLine.replace(',32.4,', ',' + invalid + ','))).toMatchObject({ kind: 'error' })
    }
  })

  test('rejects a short line, boot text, and an impossible UTC date', () => {
    for (const invalid of [timestamp + ',400', 'ESP32 booting', goodLine.replace('11-14', '11-31')]) {
      expect(parsePodLine(invalid)).toMatchObject({ kind: 'error' })
    }
  })

  test('recognizes a comment', () => {
    expect(parsePodLine('# field note')).toEqual({ kind: 'comment' })
  })

  test('flags either light sensor at or above the supplied maximum', () => {
    const line = goodLine.replace(',400,32.4,', ',120000,120001,')
    expect(parsePodLine(line, 120000)).toMatchObject({
      kind: 'record', saturated: { lux_up: true, lux_dn: true },
    })
  })
})

describe('pod simulator log', () => {
  const lines = readFileSync(new URL('../../public/data/sim/pod-sim.csv', import.meta.url), 'utf8').trimEnd().split('\n')
  const results = lines.map(line => parsePodLine(line, truth.lux_max))
  const records = results.flatMap(result => result.kind === 'record' ? [result.record] : [])

  test('parses 1,440 simulated records without errors', () => {
    expect(results.filter(result => result.kind === 'error')).toEqual([])
    expect(results[0]).toEqual({ kind: 'setting', key: 'simulated', value: 'true' })
    expect(results.slice(1, 7).map(result => result.kind === 'setting' ? result.key : result.kind))
      .toEqual(['pole_height_m', 'tilt_deg', 'facing_deg', 'refl_factor', 'ta_offset_c', 'lux_max'])
    expect(results[7]).toEqual({ kind: 'columns' })
    expect(records).toHaveLength(1440)
    expect(truth).toMatchObject({ simulated: true, status: 'default' })
    records.forEach((record, index) => {
      expect(Date.parse(record.ts)).toBe(Date.parse(truth.start) + (index + 1) * 60_000)
      expect(record.tamb).toBe(record.ta)
    })
  })

  test('crosses the sunrise threshold at the rise and set times and peaks at the expected time', () => {
    const sunrise = records.findIndex(record => record.ts === truth.sunrise)
    const peak = records.findIndex(record => record.ts === truth.peak)
    const sunset = records.findIndex(record => record.ts === truth.sunset)
    expect(records[sunrise - 1].lux_up).toBeLessThan(sunEventLux)
    expect(records[sunrise].lux_up).toBe(sunEventLux)
    expect(records[peak].lux_up).toBe(truth.peak_lux)
    expect(records[peak - 1].lux_up).toBe(records[peak + 1].lux_up)
    expect(records[peak - 1].lux_up).toBeLessThan(truth.peak_lux)
    expect(records[sunset - 1].lux_up).toBeGreaterThan(sunEventLux)
    expect(records[sunset].lux_up).toBe(sunEventLux)
    expect(records[sunset + 1].lux_up).toBeLessThan(sunEventLux)
  })

  test('preserves the corrected reflectivity and delays the smaller soil temperature swing', () => {
    const peak = records.find(record => record.ts === truth.peak)
    if (!peak?.lux_up || peak.lux_dn === null) throw new Error('Missing peak light readings')
    expect(peak.lux_dn / peak.lux_up / truth.refl_factor).toBeCloseTo(truth.reflectivity)

    const ground = records.flatMap(record => record.tg === null ? [] : [record.tg])
    const soil = records.flatMap(record => record.t10 === null ? [] : [record.t10])
    expect(soil).toHaveLength(ground.length)
    const groundRange = Math.max(...ground) - Math.min(...ground)
    const soilRange = Math.max(...soil) - Math.min(...soil)
    expect(soilRange / groundRange).toBeCloseTo(truth.soil_range_ratio)
    const delay = (soil.indexOf(Math.max(...soil)) - ground.indexOf(Math.max(...ground)) + records.length) % records.length
    expect(delay).toBe(truth.soil_delay_minutes)
  })
})
