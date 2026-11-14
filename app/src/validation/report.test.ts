import { readFileSync } from 'node:fs'
import { expect, test } from 'vitest'
import definitions from '../../../shared/tests.json'
import siteData from '../../../shared/validation_sites.json'
import { bestMonthRank, evaluateChecks, parseValidationSites, renderValidation } from './report'

const registry = () => parseValidationSites(siteData)

test('U12: the generated document contains exactly the five brief checks and no invented ranks', async () => {
  const sites = registry()
  let rankingCalls = 0
  const results = await evaluateChecks(sites, definitions, async () => { rankingCalls++; throw new Error('Disabled tests must not rank') })
  expect(sites.sites).toHaveLength(4)
  expect(results).toHaveLength(5)
  expect(results.filter(row => row.test === 'mobility')).toHaveLength(3)
  expect(results.filter(row => row.test === 'navigation')).toHaveLength(1)
  expect(results.filter(row => row.test === 'science_tools')).toHaveLength(1)
  // The five target/test/expectation pairs in the team's "Proof it works" table.
  expect(results.map(row => [row.target, row.test, row.expected])).toEqual([
    ['shackleton', 'mobility', 'should rank high'],
    ['shackleton', 'navigation', 'should rank low'],
    ['shackleton', 'mobility', 'should rank high'],
    ['jezero', 'mobility', 'should rank high'],
    ['jezero', 'science_tools', 'should rank high'],
  ])
  expect(rankingCalls).toBe(0)
  for (const row of results) {
    expect(row.result).toBe('test not built')
    expect(row.bestMonth).toBeNull()
    expect(row.score).toBeNull()
    expect(row.rankPercentile).toBeNull()
    expect(row.reason).toBeTruthy()
  }
  const markdown = renderValidation(sites, results)
  const table = markdown.split('\n').filter(line => line.startsWith('| '))
  expect(table).toHaveLength(6) // Header plus five checks; separator starts |---.
  expect(markdown).toContain('All five checks report "test not built"')
  expect(markdown).toContain('access and cost, which the tool does not model')
  expect(readFileSync(new URL('../../../docs/validation.md', import.meta.url), 'utf8').replaceAll('\r\n', '\n')).toBe(markdown)
  console.info(`U12 check: ${sites.sites.length} sites; ${results.length} rows; ${rankingCalls} ranking calls; every disabled test has null month, score and rank with a reason.`)
})

test('the four coordinates have verified source pages and the team supplies every expected check', () => {
  const sites = registry()
  const brief = readFileSync(new URL('../../../docs/project-brief.md', import.meta.url), 'utf8')
  const facts = readFileSync(new URL('../../../docs/verified-facts.md', import.meta.url), 'utf8')
  for (const site of sites.sites) {
    expect(brief).toContain(site.name)
    expect(site.coordinates.status).toBe('verified')
    expect(facts).toContain(site.coordinates.source.url)
    expect(facts).toContain(String(site.coordinates.lat))
    expect(facts).toContain(String(site.coordinates.lon))
    expect(site.pointSelection.status).toBe('default')
  }
  expect(sites.passRule).toEqual({ topPercent: 10, status: 'default', source: 'docs/project-brief.md' })
  const malformed = structuredClone(siteData)
  delete (malformed.sites[0].coordinates as Partial<typeof malformed.sites[0]['coordinates']>).source
  expect(() => parseValidationSites(malformed)).toThrow()
  expect(() => parseValidationSites({ ...siteData, unknown: true })).toThrow()
})

test('rank counts strictly better land scores, keeps ties together and keeps missing cells in the denominator', () => {
  const simulated = { simulated: true, months: [
    { month: 1, scores: [0.5, 0.75, 0.5, null] },
    { month: 2, scores: [0.75, 1, 0.75, null] },
    { month: 3, scores: [0.75, 0.5, null, null] },
  ] }
  expect(bestMonthRank(simulated.months, 0)).toEqual({ bestMonth: 2, score: 0.75, rankPercentile: 50 })
  expect(bestMonthRank(simulated.months, 3)).toBeNull()
})

test('enabled checks use their own test, apply the fixed top-ten-percent rule, and never pass/fail the low expectation', async () => {
  const sites = registry()
  const simulated = { simulated: true, ranks: [10, 90, 10.01, 1, 100] }
  const enabled = definitions.map(definition => ({ ...definition, enabled: true }))
  const received: string[] = []
  const rows = await evaluateChecks(sites, enabled, async (_site, check) => {
    received.push(check.test)
    return { bestMonth: 1, score: 0.5, rankPercentile: simulated.ranks[received.length - 1] }
  })
  expect(received).toEqual(sites.sites.flatMap(site => site.checks.map(check => check.test)))
  expect(rows.map(row => row.result)).toEqual(['pass', 'reported', 'fail', 'pass', 'fail'])
  expect(rows[1].rankPercentile).toBe(90)
})

test('an enabled check without a land cell or score stays null with a reason', async () => {
  const simulated = { simulated: true, definitions: definitions.map(definition => ({ ...definition, enabled: true })) }
  const rows = await evaluateChecks(registry(), simulated.definitions, async () => null)
  for (const row of rows) {
    expect(row.result).toBe('no rank')
    expect(row.bestMonth).toBeNull()
    expect(row.score).toBeNull()
    expect(row.rankPercentile).toBeNull()
    expect(row.reason).toContain('No other cell or test was substituted')
  }
})
