import type { GeoPermissibleObjects } from 'd3-geo'
import { decodeCells, loadMonth, parseEarthManifest } from '../data/earth'
import { loadTerrainData } from '../data/terrain'
import { loadMobilityMonth } from '../data/mobility'
import { parseTargets } from '../data/targets'
import targetData from '../../../shared/targets.json'
import { readTargetNumbers } from './model'
import type { TargetNumbers } from './model'
import { loadSunData } from '../sun/sunData'
import type { SunNumbers } from '../sun/sunData'
import { parsePlaces } from './places'

type SunQuantity = Exclude<keyof SunNumbers, 'reasons'>

// Vitest/dev may expose '/', while the deployable build uses './'. Both use
// local paths and work when the build is hosted below a project directory.
const prefix = `${import.meta.env.BASE_URL === '/' ? './' : import.meta.env.BASE_URL}data/`

// All app data requests stay relative to the build.
async function request(path: string) {
  const response = await fetch(prefix + path)
  if (!response.ok) throw new Error(`Local data ${path}: HTTP ${response.status}`)
  return response
}

export async function loadMapData() {
  const manifest = parseEarthManifest(await (await request('earth/manifest.json')).json())
  const targets = parseTargets(targetData)
  const [cells, land, countries, months, targetNumbers, sun] = await Promise.all([
    request(`earth/${manifest.cellsFile}`).then(r => r.arrayBuffer()).then(b => decodeCells(b, manifest)),
    request('geo/ne_50m_land.geojson').then(r => r.json()).then((data: unknown) => {
      if (!data || typeof data !== 'object' || !('type' in data) || data.type !== 'FeatureCollection' || !('features' in data) || !Array.isArray(data.features)) throw new Error('Local land outline is not a FeatureCollection.')
      return data as GeoPermissibleObjects
    }),
    request('geo/country-labels.json').then(r => r.json()).then(parsePlaces),
    // Preload all shipped months; changing the slider never starts a fetch.
    Promise.all(manifest.monthFiles.map((_, i) => loadMonth(i + 1, { manifest, baseUrl: `${prefix}earth/` }))),
    Promise.all(targets.map(async target => {
      const paths = [...new Set(Object.values(target.channels).map(row => row.valueFile).filter((path): path is string => path !== null))]
      if (!paths.length) return [target.id, readTargetNumbers(null, target, 'No sourced target values in the repo.')] as const
      try {
        if (paths.length !== 1) throw new Error('Expected one target card file.')
        const path = paths[0].slice('app/public/data/'.length)
        const response = await fetch(prefix + path)
        if (!response.ok) throw new Error(`Local target card: HTTP ${response.status}. U07 output is not available.`)
        return [target.id, readTargetNumbers(await response.json(), target, '')] as const
      } catch (error) {
        const reason = error instanceof Error ? error.message : 'Target card could not be loaded.'
        return [target.id, readTargetNumbers(null, target, reason)] as const
      }
    })).then(entries => Object.fromEntries(entries) as Record<string, TargetNumbers>),
    loadSunData(path => fetch(path.startsWith('/') ? `.${path}` : path)),
  ])
  const mobilityMonths = await Promise.all(months.map(month => loadMobilityMonth(month.month, { earthManifest: manifest, baseUrl: prefix + 'earth/' })))
  for (const month of months) Object.assign(month.layers, mobilityMonths[month.month - 1].layers)
  for (const target of targets) {
    if (target.mobility) targetNumbers[target.id].dryness = { value: target.mobility.dryness.value, unit: target.mobility.dryness.unit }
  }
  const terrain = await loadTerrainData({ cellCount: cells.length, baseUrl: prefix })
  for (const month of months) Object.assign(month.layers, terrain.layers)
  for (const target of targets) Object.assign(targetNumbers[target.id], terrain.targets[target.id])
  // U15 adds the three Sun quantities to power. Reuse U16's validated pipeline
  // outputs so the map and U11 card compare the same values with U08/U09.
  const sunSettings = targets[0].sun
  for (const target of targets) {
    const numbers = sun.targets[target.id].numbers
    for (const id of Object.keys(target.sun)) {
      const value = numbers[id as SunQuantity]
      targetNumbers[target.id][id] = { value, ...(value === null ? { reason: numbers.reasons![id] } : {}) }
    }
  }
  for (const month of months) {
    const rows = sun.earth[month.month - sun.manifest.month_start]
    for (const [id, settings] of Object.entries(sunSettings)) {
      const key = id as SunQuantity
      month.layers[id] = {
        unit: settings.unit,
        values: cells.map(cell => {
          const row = rows[(cell.lat - sun.manifest.latitude_start_deg) / sun.manifest.latitude_step_deg]
          if (!row) throw new Error(`No precomputed Sun row for latitude ${cell.lat}.`)
          return row[key]
        }),
        missingReason: [...new Set(rows.flatMap(row => row[key] === null ? [row.reasons![key]] : []))].join(' '),
      }
    }
  }
  return { manifest, targets, cells, land, countries, months, targetNumbers }
}

export type MapData = Awaited<ReturnType<typeof loadMapData>>
let pending: Promise<MapData> | undefined
export function cachedMapData() {
  pending ??= loadMapData().catch(error => { pending = undefined; throw error })
  return pending
}
