import { readFileSync } from 'node:fs'
import { expect, test } from 'vitest'
import { loadRegistries, RegistryError } from './registries'
import { loadTargetSettings, parseTargets, parseLimits } from './targets'

const rawTargets = () => JSON.parse(readFileSync(new URL('../../../shared/targets.json', import.meta.url), 'utf8'))
const rawLimits = () => JSON.parse(readFileSync(new URL('../../../shared/limits.json', import.meta.url), 'utf8'))

test('loads two targets with the verified Horizons recipes and uncited default coordinates', () => {
  const { targets } = loadTargetSettings()
  expect(targets.map(t => [t.id, t.horizons.center, t.horizons.site.value])).toEqual([
    ['shackleton', 'coord@301', '222.69,-89.45,0'],
    ['jezero', 'coord@499', '-77.45,18.44,0'],
  ])
  for (const target of targets) {
    expect(target.horizons.site.status).toBe('default')
    expect(target.horizons.site.citation).toBeNull()
    expect(target.horizons.site.reasons.citation.length).toBeGreaterThan(0)
  }
})

test('records D1 default tolerances for exactly the six card channels', () => {
  const { targets } = loadTargetSettings()
  const card = loadRegistries().channels.filter(c => c.onCard)
  for (const target of targets) {
    expect(Object.keys(target.channels)).toEqual(card.map(c => c.id))
    expect(card.map(c => target.channels[c.id].tolerance)).toEqual([10, 0.1, 2, 10, 20, 50])
    for (const channel of card) {
      expect(target.channels[channel.id].unit).toBe(channel.unit)
      expect(target.channels[channel.id].status).toBe('default')
    }
  }
})

test('preserves all six missing Shackleton values with the specified reason', () => {
  const target = loadTargetSettings().targets.find(t => t.id === 'shackleton')!
  for (const channel of Object.values(target.channels)) {
    expect(channel.valueFile).toBeNull()
    expect(channel.reasons.valueFile).toBe('No sourced value in the repo.')
    expect(channel.sourceId).toBeNull()
    expect(channel.reasons.sourceId.length).toBeGreaterThan(0)
  }
})

test('Jezero points only to the U07 output and registered MEDA source', () => {
  const target = loadTargetSettings().targets.find(t => t.id === 'jezero')!
  for (const channel of Object.values(target.channels)) {
    expect(channel.valueFile).toBe('app/public/data/mars/jezero-card.json')
    expect(channel.sourceId).toBe('meda')
    expect(Object.hasOwn(channel, 'value')).toBe(false)
  }
})

test.each([0, -1, NaN, Infinity])('rejects invalid tolerance %s', tolerance => {
  const data = rawTargets()
  data[0].channels.ground_temp.tolerance = tolerance
  expect(() => parseTargets(data)).toThrow(RegistryError)
})

test('rejects an absent sourceId when valueFile is present', () => {
  const data = rawTargets()
  delete data[1].channels.ground_temp.sourceId
  expect(() => parseTargets(data)).toThrow(/sourceId/)
})

test('rejects an unknown sourceId when valueFile is present', () => {
  const data = rawTargets()
  data[1].channels.ground_temp.sourceId = 'unregistered'
  expect(() => parseTargets(data)).toThrow(/sourceId/)
})

test('a reason for a null source does not make a sourced valueFile valid', () => {
  const data = rawTargets()
  data[1].channels.ground_temp.sourceId = null
  data[1].channels.ground_temp.reasons = { sourceId: 'Simulated missing source for this parser check' }
  expect(() => parseTargets(data)).toThrow(/sourceId/)
})

test('rejects missing or blank reasons for null target fields', () => {
  for (const reason of [undefined, ' ']) {
    const data = rawTargets()
    data[0].channels.ground_temp.reasons.valueFile = reason
    expect(() => parseTargets(data)).toThrow(/reason/)
  }
})

test('requires a reason for the missing citation of each coordinate set', () => {
  for (const index of [0, 1]) {
    const data = rawTargets()
    delete data[index].horizons.site.reasons.citation
    expect(() => parseTargets(data)).toThrow(/citation/)
  }
})

test('rejects unknown fields, missing card channels, duplicate target ids, and wrong units', () => {
  const unknown = rawTargets()
  unknown[0].channels.ground_temp.unexpected = true
  expect(() => parseTargets(unknown)).toThrow(/unknown field/)
  const missing = rawTargets()
  delete missing[0].channels.pressure
  expect(() => parseTargets(missing)).toThrow(/pressure/)
  const duplicate = rawTargets()
  duplicate[1].id = duplicate[0].id
  expect(() => parseTargets(duplicate)).toThrow(/duplicate/)
  const unit = rawTargets()
  unit[0].channels.ground_temp.unit = 'wrong'
  expect(() => parseTargets(unit)).toThrow(/unit/)
})

test('loads six card limits and three Sun limits copied verbatim from the brief', () => {
  const { limits } = loadTargetSettings()
  const brief = readFileSync(new URL('../../../docs/project-brief.md', import.meta.url), 'utf8')
  const cardSection = brief.split('## Where Earth fails')[1].split('## How it scores with judges')[0]
  const card = cardSection.split(/\r?\n/).filter(line => line.startsWith('- **')).map(line => {
    const match = /^- \*\*(.*?)\.\*\* (.*)$/.exec(line)!
    return { title: match[1], text: match[2] }
  })
  const sunSection = brief.split('**Limits to print beside the panel**')[1].split('## Proof it works')[0]
  const sun = sunSection.split(/\r?\n/).filter(line => line.startsWith('- ')).map(line => line.slice(2))
  expect(limits.card).toHaveLength(6)
  expect(limits.sunPanel).toHaveLength(3)
  expect(limits.card.map(({ title, text }) => ({ title, text }))).toEqual(card)
  expect(limits.sunPanel.map(item => item.text)).toEqual(sun)
  expect([...limits.card, ...limits.sunPanel].every(l => l.source === 'docs/project-brief.md')).toBe(true)
})

test('rejects an empty limit and an incomplete limits block', () => {
  const blank = rawLimits()
  blank.card[0].text = ' '
  expect(() => parseLimits(blank)).toThrow(RegistryError)
  const missing = rawLimits()
  missing.sunPanel.pop()
  expect(() => parseLimits(missing)).toThrow(RegistryError)
})
