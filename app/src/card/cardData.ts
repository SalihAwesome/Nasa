import testData from '../../../shared/tests.json'
import { decodeCells, loadMonth, parseEarthManifest } from '../data/earth'
import type { EarthManifest, EarthMonth } from '../data/earth'
import { loadRegistries } from '../data/registries'
import { loadTargetSettings } from '../data/targets'
import type { Limit, Target } from '../data/targets'
import { score } from '../score/score'
import type { ScoreResult } from '../score/score'
import { combine } from '../score/combine'
import type { CombinedResult, Weight } from '../score/combine'

export const cardRegistries = loadRegistries()
export const cardSettings = loadTargetSettings()
export type TestDefinition = { id: string; enabled: boolean; reason?: string; weights: Record<string, Weight | undefined>; notBuilt: string[] }
export const cardTests: TestDefinition[] = testData
export type CardSelection = {
  site: { kind: 'pod' } | { kind: 'cell'; index: number }
  target: Target['id']; test: string; month: number
}
export type Reading = { value: number | null; unit: string | null; reason?: string; unitReason?: string; note?: string }
type Cell = { lat: number; lon: number }
export type CardData = {
  manifest: EarthManifest; cells: Cell[]; month: EarthMonth
  target: Target['id']; targetValues: Record<string, Reading>; targetSol?: number
}
export type CardRow = {
  id: string; label: string; earth: Reading; target: Reading
  tolerance: { value: number; unit: string; status: 'default' }
  score: ScoreResult; evidence: 'estimate' | 'measured'; counts: boolean; weight?: Weight
}
export type CardModel = {
  cell: Cell & { index: number }; isPod: boolean; siteNote?: string
  target: Target['id']; targetSol?: number; month: number; period: EarthManifest['period']
  rows: CardRow[]; test: TestDefinition; combined: CombinedResult; limits: Limit[]
}

function fail(message: string): never { throw new Error(`Fidelity card: ${message}`) }
function object(input: unknown): Record<string, unknown> {
  if (!input || typeof input !== 'object' || Array.isArray(input)) fail('expected an object')
  return input as Record<string, unknown>
}
function text(input: unknown): string {
  if (typeof input !== 'string' || !input.trim()) fail('expected a nonempty reason or unit')
  return input
}

/** Selection defaults are UI choices: Jezero/power, the log's month for the
 * pod, and the first calendar month for a cell. No data value is substituted.
 */
export function readCardSelection(hash: string): CardSelection {
  const [path, query] = hash.split('?')
  const match = /^#\/card\/(pod|cell\/(\d+))$/.exec(path)
  if (!match) fail('use a pod card or a nonnegative cell index')
  const site: CardSelection['site'] = match[1] === 'pod' ? { kind: 'pod' } : { kind: 'cell', index: Number(match[2]) }
  if (site.kind === 'cell' && !Number.isSafeInteger(site.index)) fail('invalid cell index')
  const params = new URLSearchParams(query)
  const target = params.get('target') ?? 'jezero'
  if (target !== 'jezero' && target !== 'shackleton') fail('unknown target')
  const test = params.get('test') ?? cardTests.find(test => test.enabled)!.id
  if (!cardTests.some(definition => definition.id === test)) fail('unknown test')
  const start = cardRegistries.podSite.start
  const initialMonth = site.kind === 'pod' && start !== null ? new Date(start).getUTCMonth() + 1 : 1
  const month = params.has('month') ? Number(params.get('month')) : initialMonth
  if (!Number.isInteger(month) || month < 1 || month > 12) fail('month must be from 1 through 12')
  return { site, target, test, month }
}

export function cardHash(selection: CardSelection): string {
  const site = selection.site.kind === 'pod' ? 'pod' : `cell/${selection.site.index}`
  const query = new URLSearchParams({ target: selection.target, test: selection.test, month: String(selection.month) })
  return `#/card/${site}?${query}`
}

/** Consume the actual U07 channels/value/unit/reason fields. Metadata and raw
 * filenames remain in the pipeline output; missing units remain null here.
 */
function parseTargetFile(input: unknown, target: Target): { values: Record<string, Reading>; sol: number } {
  const root = object(input)
  if (root.simulated === true) fail('simulated target data is not accepted by this estimate card')
  if (!Number.isSafeInteger(root.sol) || (root.sol as number) < 0) fail('invalid MEDA reference sol')
  const rows = object(root.channels)
  const values: Record<string, Reading> = {}
  for (const [id, settings] of Object.entries(target.channels)) {
    if (settings.valueFile === null) continue
    if (root.sourceId !== settings.sourceId) fail('target source does not match the registry')
    const row = object(rows[id])
    const unit = row.unit === null ? null : text(row.unit)
    if (unit !== null && unit !== settings.unit) fail(`${id} unit disagrees with the channel registry`)
    const unitReason = unit === null ? text(object(row.reasons).unit) : undefined
    if (typeof row.missing !== 'boolean') fail(`${id} needs its missing flag`)
    const value = row.value
    if (row.missing ? value !== null : typeof value !== 'number' || !Number.isFinite(value)) fail(`${id} has an invalid target value`)
    const reason = value === null ? text(row.reason) : undefined
    const note = row.note === undefined ? undefined : text(row.note)
    values[id] = { value: value as number | null, unit, reason, unitReason, note }
  }
  return { values, sol: root.sol as number }
}

export async function loadCardData(selection: CardSelection, fetcher: (path: string) => Promise<Response> = path => fetch(path)): Promise<CardData> {
  const prefix = `${import.meta.env.BASE_URL}data/`
  async function request(path: string) {
    const response = await fetcher(prefix + path)
    if (!response.ok) fail(`could not load local ${path} (HTTP ${response.status})`)
    return response
  }
  const target = cardSettings.targets.find(target => target.id === selection.target) ?? fail('unknown target')
  const manifest = parseEarthManifest(await (await request('earth/manifest.json')).json())
  const paths = [...new Set(Object.values(target.channels).flatMap(row => row.valueFile === null ? [] : [row.valueFile]))]
  async function loadTargets() {
    if (!paths.length) return { files: new Map<string, ReturnType<typeof parseTargetFile>>(), sol: undefined }
    const meda = object(await (await request('mars/manifest.json')).json())
    if (meda.simulated === true || !Number.isSafeInteger(meda.sol) || (meda.sol as number) < 0) fail('invalid MEDA manifest reference sol')
    if (paths.length !== 1 || paths[0] !== `app/public/data/mars/${text(meda.cardFile)}`) fail('MEDA manifest card file disagrees with target settings')
    const file = parseTargetFile(await (await request(paths[0].slice('app/public/data/'.length))).json(), target)
    if (meda.sol !== file.sol || meda.sourceId !== Object.values(target.channels).find(row => row.valueFile !== null)!.sourceId) fail('MEDA manifest and card reference disagree')
    return { files: new Map([[paths[0], file]]), sol: meda.sol as number }
  }
  const [cells, month, targetData] = await Promise.all([
    request(`earth/${manifest.cellsFile}`).then(response => response.arrayBuffer()).then(buffer => decodeCells(buffer, manifest)),
    loadMonth(selection.month, { manifest, baseUrl: prefix + 'earth/', fetcher: input => fetcher(String(input)) }),
    loadTargets(),
  ])
  const targetValues: Record<string, Reading> = {}
  for (const [id, settings] of Object.entries(target.channels)) {
    targetValues[id] = settings.valueFile === null
      ? { value: null, unit: settings.unit, reason: settings.reasons.valueFile }
      : targetData.files.get(settings.valueFile)!.values[id]
  }
  return { manifest, cells, month, target: target.id, targetValues, targetSol: targetData.sol }
}

/** DEFAULT D18: snap each coordinate independently; Math.round's ties go to
 * the higher coordinate. If that grid cell is not land, keep it missing.
 */
export function findPodCell(data: Pick<CardData, 'manifest' | 'cells'>, site: { lat: number | null; lon: number | null }): number {
  if (site.lat === null || site.lon === null) fail('the team has not supplied the pod position')
  const grid = data.manifest.quantities.find(quantity => quantity.id === 'ground_temp')!.sourceGrid
  const lat = Math.round(site.lat / grid.latitudeStep) * grid.latitudeStep
  const lon = Math.min(180 - grid.longitudeStep, Math.round(site.lon / grid.longitudeStep) * grid.longitudeStep)
  const index = data.cells.findIndex(cell => cell.lat === lat && cell.lon === lon)
  if (index < 0) fail('the pod grid cell is not in the shipped land grid; no other land cell was substituted')
  return index
}

export function buildCard(data: CardData, selection: CardSelection): CardModel {
  if (data.target !== selection.target || data.month.month !== selection.month) fail('loaded data does not match the selected target and month')
  const target = cardSettings.targets.find(target => target.id === selection.target) ?? fail('unknown target')
  const definition = cardTests.find(test => test.id === selection.test) ?? fail('unknown test')
  const index = selection.site.kind === 'pod' ? findPodCell(data, cardRegistries.podSite) : selection.site.index
  if (!Number.isSafeInteger(index) || index < 0 || index >= data.cells.length) fail('cell index is outside the shipped grid')
  const rows = cardRegistries.channels.filter(channel => channel.onCard).map((channel): CardRow => {
    const settings = target.channels[channel.id], layer = data.month.layers[channel.id]
    const value = layer.values[index]
    const earth: Reading = { value, unit: layer.unit, ...(value === null ? { reason: layer.missingReason } : {}) }
    const targetValue = data.targetValues[channel.id]
    const weight = definition.weights[channel.id]
    return {
      id: channel.id, label: channel.label, earth, target: targetValue,
      tolerance: { value: settings.tolerance, unit: settings.unit, status: settings.status },
      score: score(earth.value, targetValue.value, settings.tolerance), evidence: 'estimate',
      counts: definition.enabled && weight !== undefined && weight.value > 0, weight,
    }
  })
  const scores = Object.fromEntries(rows.map(row => [row.id, row.score]))
  return {
    cell: { index, ...data.cells[index] }, isPod: selection.site.kind === 'pod',
    siteNote: selection.site.kind === 'pod' && cardRegistries.podSite.status === 'default' ? cardRegistries.podSite.reason : undefined,
    target: selection.target, targetSol: data.targetSol, month: data.month.month, period: data.manifest.period,
    rows, test: definition, combined: combine(definition.enabled ? scores : {}, definition.weights), limits: cardSettings.limits.card,
  }
}
