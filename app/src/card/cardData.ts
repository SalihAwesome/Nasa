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
import { fetchPodLog } from '../pod/importLog'
import type { PodLog } from '../pod/importLog'
import { gap, reduceChannel } from '../pod/reduce'

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
type EarthSun = { latitudeStart: number; latitudeStep: number; monthStart: number; months: unknown[][] }
// Quantity names: docs/project-brief.md; values are pipeline outputs from U14/U13.
const sunLabels: Record<string, string> = {
  peak_elevation: 'Highest Sun elevation',
  low_sun_share: 'Share of daylight with the Sun below 10 degrees',
  horizon_sweep: 'Horizon sweep',
}
export type CardData = {
  manifest: EarthManifest; cells: Cell[]; month: EarthMonth
  target: Target['id']; targetValues: Record<string, Reading>; targetSol?: number
  earthSun: EarthSun; targetSun: Record<string, Reading>
}
export type CardRow = {
  id: string; label: string; earth: Reading; target: Reading
  tolerance: { value: number; unit: string; status: 'default' }
  score: ScoreResult; evidence: 'estimate' | 'measured'; counts: boolean; weight?: Weight
  errorBar?: ErrorBar
}
type ErrorBar =
  | { kind: 'missing'; reason: string }
  | { kind: 'gap'; gap: number; basis: string }
  | { kind: 'gap-and-offset'; gap: number; offset: number; basis: string }
export type CardModel = {
  cell: Cell & { index: number }; isPod: boolean; siteNote?: string
  target: Target['id']; targetSol?: number; month: number; period: EarthManifest['period']
  rows: CardRow[]; sunRows: CardRow[]; test: TestDefinition; combined: CombinedResult; limits: Limit[]; simulated?: boolean
}
type CardMeasurements = { log: PodLog; satelliteChannels: Record<string, unknown> }

const podNotes: Readonly<Partial<Record<string, string>>> = {
  reflectivity: 'pod: visible light only, one patch of ground',
  uv: 'pod: approximate UV index',
  air_temp: 'Air sleeve has no fan. Midday readings may run high.',
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

function finite(input: unknown): number {
  if (typeof input !== 'number' || !Number.isFinite(input)) fail('expected a finite Sun number')
  return input
}

function sunReading(row: Record<string, unknown>, id: string, unit: string): Reading {
  return row[id] === null
    ? { value: null, unit, reason: text(object(row.reasons)[id]) }
    : { value: finite(row[id]), unit }
}

function parseEarthSun(input: unknown): EarthSun {
  const root = object(input)
  if (root.simulated === true) fail('simulated Sun data is not accepted by this estimate card')
  const latitudeStart = finite(root.latitude_start_deg), latitudeStep = finite(root.latitude_step_deg)
  const monthStart = finite(root.month_start)
  if (latitudeStep <= 0 || !Number.isInteger(monthStart)) fail('invalid Sun grid metadata')
  if (!Array.isArray(root.months) || root.months.length !== root.month_count) fail('invalid Sun months')
  const months = root.months.map(rows => {
    if (!Array.isArray(rows) || rows.length !== root.latitude_count) fail('invalid Sun latitude rows')
    return rows as unknown[]
  })
  return { latitudeStart, latitudeStep, monthStart, months }
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
  async function loadTargetSun() {
    const sunPaths = [...new Set(Object.values(target.sun).flatMap(row => row.valueFile === null ? [] : [row.valueFile]))]
    const files = new Map(await Promise.all(sunPaths.map(async path => {
      const root = object(await (await request(path.slice('app/public/data/'.length))).json())
      if (root.simulated === true || root.target !== target.id) fail('Sun target file disagrees with the selection')
      return [path, root] as const
    })))
    return Object.fromEntries(Object.entries(target.sun).map(([id, settings]) => {
      if (settings.valueFile === null) return [id, { value: null, unit: settings.unit, reason: settings.reasons.valueFile }]
      const root = files.get(settings.valueFile)!
      if (object(root.source).id !== settings.sourceId) fail('Sun source disagrees with target settings')
      return [id, sunReading(object(root.numbers), id, settings.unit)]
    }))
  }
  const [cells, month, targetData, earthSun, targetSun] = await Promise.all([
    request(`earth/${manifest.cellsFile}`).then(response => response.arrayBuffer()).then(buffer => decodeCells(buffer, manifest)),
    loadMonth(selection.month, { manifest, baseUrl: prefix + 'earth/', fetcher: input => fetcher(String(input)) }),
    loadTargets(),
    request('sun/earth-rows.json').then(response => response.json()).then(parseEarthSun),
    loadTargetSun(),
  ])
  const targetValues: Record<string, Reading> = {}
  for (const [id, settings] of Object.entries(target.channels)) {
    targetValues[id] = settings.valueFile === null
      ? { value: null, unit: settings.unit, reason: settings.reasons.valueFile }
      : targetData.files.get(settings.valueFile)!.values[id]
  }
  return { manifest, cells, month, target: target.id, targetValues, targetSol: targetData.sol, earthSun, targetSun }
}

export async function loadSelectedCard(
  selection: CardSelection,
  fetcher: (path: string) => Promise<Response> = path => fetch(path),
): Promise<CardModel> {
  if (selection.site.kind === 'cell') {
    return buildCard(await loadCardData(selection, fetcher), selection)
  }

  const podSelection = { ...selection, target: 'jezero' } satisfies CardSelection
  const [data, log, satellite] = await Promise.all([
    loadCardData(podSelection, fetcher),
    fetchPodLog(undefined, path => fetcher(String(path))),
    fetcher(`${import.meta.env.BASE_URL}data/earth/pod-site-satellite.json`).then(async response => {
      if (!response.ok) fail(`could not load pod-site satellite data (HTTP ${response.status})`)
      return object(await response.json())
    }),
  ])
  return buildCard(data, podSelection, { log, satelliteChannels: object(satellite.channels) })
}

export function makeErrorBar(earth: Reading, satelliteRow: unknown, offset?: number): ErrorBar {
  if (earth.value === null) return { kind: 'missing', reason: earth.reason ?? 'No pod measurement' }
  const row = object(satelliteRow)
  if (row.unit !== earth.unit) fail('satellite unit disagrees with the pod channel')
  const cardNumber = object(row.cardNumber)
  const value = cardNumber.value
  if (value === null) return { kind: 'missing', reason: text(cardNumber.reason) }
  if (typeof value !== 'number' || !Number.isFinite(value)) fail('invalid satellite card number')
  const basis = text(cardNumber.basis)
  const difference = gap(earth.value, value)
  return offset === undefined
    ? { kind: 'gap', gap: difference, basis }
    : { kind: 'gap-and-offset', gap: difference, basis, offset: Math.abs(offset) }
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

export function buildCard(data: CardData, selection: CardSelection, measurements?: CardMeasurements): CardModel {
  if (data.target !== selection.target || data.month.month !== selection.month) fail('loaded data does not match the selected target and month')
  const target = cardSettings.targets.find(target => target.id === selection.target) ?? fail('unknown target')
  const definition = cardTests.find(test => test.id === selection.test) ?? fail('unknown test')
  const index = selection.site.kind === 'pod' ? findPodCell(data, cardRegistries.podSite) : selection.site.index
  if (!Number.isSafeInteger(index) || index < 0 || index >= data.cells.length) fail('cell index is outside the shipped grid')
  const rows = cardRegistries.channels.filter(channel => channel.onCard).map((channel): CardRow => {
    const settings = target.channels[channel.id], layer = data.month.layers[channel.id]
    const value = layer.values[index]
    let earth: Reading = { value, unit: layer.unit, ...(value === null ? { reason: layer.missingReason } : {}) }
    let errorBar: ErrorBar | undefined
    if (measurements) {
      const { log, satelliteChannels } = measurements
      const calibration = channel.id === 'air_temp' ? log.calibration.airTemperature
        : channel.id === 'reflectivity' ? log.calibration.reflectivity : undefined
      earth = {
        ...reduceChannel(log.records, channel), unit: channel.unit,
        note: [podNotes[channel.id], calibration?.note].filter(Boolean).join('. '),
      }
      const offset = channel.id === 'air_temp' ? log.calibration.airTemperature.value : undefined
      errorBar = makeErrorBar(earth, satelliteChannels[channel.id], offset)
    }
    const targetValue = data.targetValues[channel.id]
    const weight = definition.weights[channel.id]
    return {
      id: channel.id,
      label: channel.id === 'uv' ? 'All Sky Surface UV Index' : channel.label,
      earth, target: targetValue,
      tolerance: { value: settings.tolerance, unit: settings.unit, status: settings.status },
      score: score(earth.value, targetValue.value, settings.tolerance),
      evidence: measurements && earth.value !== null ? 'measured' : 'estimate',
      ...(errorBar === undefined ? {} : { errorBar }),
      counts: definition.enabled && weight !== undefined && weight.value > 0, weight,
    }
  })
  const rowIndex = (data.cells[index].lat - data.earthSun.latitudeStart) / data.earthSun.latitudeStep
  const sunMonth = data.earthSun.months[selection.month - data.earthSun.monthStart]
  if (!Number.isInteger(rowIndex) || !sunMonth?.[rowIndex]) fail('no precomputed Sun row for the selected cell and month')
  const sun = object(sunMonth[rowIndex])
  const sunRows = Object.entries(target.sun).map(([id, settings]): CardRow => {
    const earth = sunReading(sun, id, settings.unit), targetValue = data.targetSun[id]
    const weight = definition.weights[id]
    return {
      id, label: sunLabels[id], earth, target: targetValue,
      tolerance: { value: settings.tolerance, unit: settings.unit, status: settings.status },
      score: score(earth.value, targetValue.value, settings.tolerance), evidence: 'estimate',
      counts: definition.enabled && weight !== undefined && weight.value > 0, weight,
    }
  })
  const scores = Object.fromEntries([...rows, ...sunRows].map(row => [row.id, row.score]))
  return {
    cell: { index, ...data.cells[index] }, isPod: selection.site.kind === 'pod',
    siteNote: selection.site.kind === 'pod' && cardRegistries.podSite.status === 'default' ? cardRegistries.podSite.reason : undefined,
    target: selection.target, targetSol: data.targetSol, month: data.month.month, period: data.manifest.period,
    rows, sunRows, test: definition, combined: combine(definition.enabled ? scores : {}, definition.weights), limits: cardSettings.limits.card,
    simulated: measurements?.log.simulated,
  }
}
