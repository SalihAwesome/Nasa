import type { GeoPermissibleObjects } from 'd3-geo'
import { decodeCells, loadMonth, parseEarthManifest } from '../data/earth'
import { parseTargets } from '../data/targets'
import targetData from '../../../shared/targets.json'
import { readTargetNumbers } from './model'
import type { TargetNumbers } from './model'

// Vitest/dev may expose '/', while the deployable build uses './'. Both use
// local paths and work when the build is hosted below a project directory.
const prefix = `${import.meta.env.BASE_URL === '/' ? './' : import.meta.env.BASE_URL}data/`

// All app data requests stay relative to the build, including missing U07 output.
async function request(path: string) {
  const response = await fetch(prefix + path)
  if (!response.ok) throw new Error(`Local data ${path}: HTTP ${response.status}`)
  return response
}

export async function loadMapData() {
  const manifest = parseEarthManifest(await (await request('earth/manifest.json')).json())
  const targets = parseTargets(targetData)
  const [cells, land, months, targetNumbers] = await Promise.all([
    request(`earth/${manifest.cellsFile}`).then(r => r.arrayBuffer()).then(b => decodeCells(b, manifest)),
    request('geo/ne_110m_land.geojson').then(r => r.json()).then((data: unknown) => {
      if (!data || typeof data !== 'object' || !('type' in data) || data.type !== 'FeatureCollection' || !('features' in data) || !Array.isArray(data.features)) throw new Error('Local land outline is not a FeatureCollection.')
      return data as GeoPermissibleObjects
    }),
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
  ])
  return { manifest, targets, cells, land, months, targetNumbers }
}

export type MapData = Awaited<ReturnType<typeof loadMapData>>
let pending: Promise<MapData> | undefined
export function cachedMapData() {
  pending ??= loadMapData().catch(error => { pending = undefined; throw error })
  return pending
}
