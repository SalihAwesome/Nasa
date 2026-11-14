import targetData from '../../../shared/targets.json'
import limitData from '../../../shared/limits.json'
import { loadRegistries, RegistryError } from './registries'
import type { Source } from './registries'

type Reasons = Record<string, string>
export type TargetChannel = {
  tolerance: number; unit: string; status: 'default'
  valueFile: string | null; sourceId: string | null; reasons: Reasons
}
export type Target = {
  id: 'shackleton' | 'jezero'
  horizons: {
    center: string
    site: { value: string; status: 'default' | 'verified'; citation: string | null; reasons: Reasons }
  }
  channels: Record<string, TargetChannel>
}
export type Limit = { title: string; text: string; source: 'docs/project-brief.md' }
export type Limits = { card: Limit[]; sunPanel: Limit[] }

function fail(path: string, message: string): never { throw new RegistryError(`${path}: ${message}`) }
function object(input: unknown, path: string, required: readonly string[], optional: readonly string[] = []): Record<string, unknown> {
  if (input === null || typeof input !== 'object' || Array.isArray(input)) fail(path, 'expected an object')
  const data = input as Record<string, unknown>
  for (const key of Object.keys(data)) if (!required.includes(key) && !optional.includes(key)) fail(`${path}.${key}`, 'unknown field')
  for (const key of required) if (!Object.hasOwn(data, key)) fail(`${path}.${key}`, 'missing field')
  return data
}
function text(input: unknown, path: string): string {
  if (typeof input !== 'string' || !input.trim()) fail(path, 'expected nonempty text')
  return input
}
function nullableText(input: unknown, path: string): string | null {
  return input === null ? null : text(input, path)
}
function reasons(data: Record<string, unknown>, path: string): Reasons {
  const missing = Object.keys(data).filter(key => data[key] === null)
  const raw = data.reasons === undefined ? {} : object(data.reasons, `${path}.reasons`, [], missing)
  const result: Reasons = {}
  for (const key of missing) result[key] = text(raw[key], `${path}.reasons.${key} (null requires a reason)`)
  return result
}

/** U06 validates references, not the existence of the later U07 output. */
export function parseTargets(input: unknown, sources: readonly Pick<Source, 'id'>[] = loadRegistries().sources): Target[] {
  if (!Array.isArray(input) || input.length !== 2) fail('targets', 'expected two targets')
  const card = loadRegistries().channels.filter(channel => channel.onCard)
  const sourceIds = new Set(sources.map(source => source.id))
  const ids = new Set<string>()
  return input.map((value, index): Target => {
    const path = `targets[${index}]`
    const data = object(value, path, ['id', 'horizons', 'channels'])
    const id = text(data.id, `${path}.id`)
    if (id !== 'shackleton' && id !== 'jezero') fail(`${path}.id`, 'unknown target')
    if (ids.has(id)) fail(`${path}.id`, 'duplicate target id')
    ids.add(id)

    const horizon = object(data.horizons, `${path}.horizons`, ['center', 'site'])
    const sitePath = `${path}.horizons.site`
    const site = object(horizon.site, sitePath, ['value', 'status', 'citation'], ['reasons'])
    const status = site.status
    if (status !== 'default' && status !== 'verified') fail(`${sitePath}.status`, 'expected default or verified')
    const citation = nullableText(site.citation, `${sitePath}.citation`)
    if (citation === null && status !== 'default') fail(`${sitePath}.status`, 'uncited coordinates must remain default')

    const rawChannels = object(data.channels, `${path}.channels`, card.map(channel => channel.id))
    const channels: Record<string, TargetChannel> = {}
    for (const channel of card) {
      const rowPath = `${path}.channels.${channel.id}`
      const row = object(rawChannels[channel.id], rowPath, ['tolerance', 'unit', 'status', 'valueFile', 'sourceId'], ['reasons'])
      if (typeof row.tolerance !== 'number' || !Number.isFinite(row.tolerance) || row.tolerance <= 0) fail(`${rowPath}.tolerance`, 'expected a positive finite tolerance')
      const unit = text(row.unit, `${rowPath}.unit`)
      if (unit !== channel.unit) fail(`${rowPath}.unit`, 'does not match the channel registry')
      if (row.status !== 'default') fail(`${rowPath}.status`, 'D1 tolerance must be labelled default')
      const valueFile = nullableText(row.valueFile, `${rowPath}.valueFile`)
      const sourceId = nullableText(row.sourceId, `${rowPath}.sourceId`)
      if (valueFile !== null && (!valueFile.startsWith('app/public/data/') || !valueFile.endsWith('.json') || valueFile.includes('..') || valueFile.includes('\\'))) fail(`${rowPath}.valueFile`, 'expected a JSON path under app/public/data/')
      if (valueFile !== null && sourceId === null) fail(`${rowPath}.sourceId`, 'valueFile requires a registered sourceId')
      if (sourceId !== null && !sourceIds.has(sourceId)) fail(`${rowPath}.sourceId`, 'not found in shared/sources.json')
      channels[channel.id] = { tolerance: row.tolerance, unit, status: 'default', valueFile, sourceId, reasons: reasons(row, rowPath) }
    }
    return {
      id,
      horizons: { center: text(horizon.center, `${path}.horizons.center`), site: { value: text(site.value, `${sitePath}.value`), status, citation, reasons: reasons(site, sitePath) } },
      channels,
    }
  })
}

export function parseLimits(input: unknown): Limits {
  const data = object(input, 'limits', ['card', 'sunPanel'])
  function block(key: 'card' | 'sunPanel', count: number): Limit[] {
    const list = data[key]
    if (!Array.isArray(list) || list.length !== count) fail(`limits.${key}`, `expected ${count} limits`)
    return list.map((value, index) => {
      const path = `limits.${key}[${index}]`
      const row = object(value, path, ['title', 'text', 'source'])
      if (row.source !== 'docs/project-brief.md') fail(`${path}.source`, 'expected the team project brief')
      return { title: text(row.title, `${path}.title`), text: text(row.text, `${path}.text`), source: 'docs/project-brief.md' }
    })
  }
  return { card: block('card', 6), sunPanel: block('sunPanel', 3) }
}

export function loadTargetSettings() {
  return { targets: parseTargets(targetData), limits: parseLimits(limitData) }
}
