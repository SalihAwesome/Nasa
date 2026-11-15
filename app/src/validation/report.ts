import type { TestDefinition } from '../map/model'
import type { MapData } from '../map/data'

export type ValidationCheck = {
  target: 'shackleton' | 'jezero'; test: string; expected: 'should rank high' | 'should rank low'
}
export type ValidationSite = {
  id: string; name: string; use: string; useSource: string
  coordinates: {
    lat: number; lon: number; status: 'verified'
    source: { title: string; url: string; accessed: string; location: string }
  }
  pointSelection: { status: 'default'; reason: string }
  checks: ValidationCheck[]
}
export type ValidationSites = {
  source: 'docs/project-brief.md'
  passRule: { topPercent: number; status: 'default'; source: 'docs/project-brief.md' }
  ranking: { status: 'default'; bestMonth: string; percentile: string }
  sites: ValidationSite[]
}
type Ranking = { bestMonth: number; score: number; rankPercentile: number }
type Result = {
  site: string; target: ValidationCheck['target']; test: string; expected: ValidationCheck['expected']
  bestMonth: number | null; score: number | null; rankPercentile: number | null
  result: 'test not built' | 'no rank' | 'pass' | 'fail' | 'reported'; reason: string | null
}

function fail(message: string): never { throw new Error(`Validation sites: ${message}`) }
function object(input: unknown, keys: string[]): Record<string, unknown> {
  if (!input || typeof input !== 'object' || Array.isArray(input)) fail('expected an object')
  const row = input as Record<string, unknown>
  if (Object.keys(row).some(key => !keys.includes(key)) || keys.some(key => !Object.hasOwn(row, key))) fail(`expected fields ${keys.join(', ')}`)
  return row
}
function text(input: unknown): string {
  if (typeof input !== 'string' || !input.trim()) fail('expected nonempty text')
  return input
}
function number(input: unknown, min: number, max: number): number {
  if (typeof input !== 'number' || !Number.isFinite(input) || input < min || input > max) fail('invalid finite number')
  return input
}
function url(input: unknown): string {
  const value = text(input)
  let parsed: URL
  try { parsed = new URL(value) } catch { return fail('invalid source URL') }
  if (parsed.protocol !== 'https:') fail('source URL must use HTTPS')
  return value
}
function teamSource(input: unknown): 'docs/project-brief.md' {
  if (input !== 'docs/project-brief.md') fail('expected the team brief as source')
  return input
}
function defaultStatus(input: unknown): 'default' {
  if (input !== 'default') fail('chosen rule must be labelled default')
  return input
}

export function parseValidationSites(input: unknown): ValidationSites {
  const root = object(input, ['source', 'passRule', 'ranking', 'sites'])
  const pass = object(root.passRule, ['topPercent', 'status', 'source'])
  const ranking = object(root.ranking, ['status', 'bestMonth', 'percentile'])
  if (!Array.isArray(root.sites) || !root.sites.length) fail('expected sites')
  const ids = new Set<string>()
  const sites = root.sites.map((input): ValidationSite => {
    const row = object(input, ['id', 'name', 'use', 'useSource', 'coordinates', 'pointSelection', 'checks'])
    const id = text(row.id)
    if (ids.has(id)) fail('duplicate site id')
    ids.add(id)
    const coordinates = object(row.coordinates, ['lat', 'lon', 'status', 'source'])
    if (coordinates.status !== 'verified') fail('site coordinates must be verified')
    const source = object(coordinates.source, ['title', 'url', 'accessed', 'location'])
    const accessed = text(source.accessed)
    if (!/^\d{4}-\d{2}-\d{2}$/.test(accessed) || !Number.isFinite(Date.parse(accessed))) fail('invalid access date')
    const selection = object(row.pointSelection, ['status', 'reason'])
    if (!Array.isArray(row.checks) || !row.checks.length) fail('expected checks')
    const checks = row.checks.map((input): ValidationCheck => {
      const check = object(input, ['target', 'test', 'expected'])
      if (check.target !== 'jezero' && check.target !== 'shackleton') fail('unknown target')
      if (check.expected !== 'should rank high' && check.expected !== 'should rank low') fail('unknown expected result')
      return { target: check.target, test: text(check.test), expected: check.expected }
    })
    return {
      id, name: text(row.name), use: text(row.use), useSource: url(row.useSource), checks,
      coordinates: { lat: number(coordinates.lat, -90, 90), lon: number(coordinates.lon, -180, 180), status: 'verified',
        source: { title: text(source.title), url: url(source.url), accessed, location: text(source.location) } },
      pointSelection: { status: defaultStatus(selection.status), reason: text(selection.reason) },
    }
  })
  return {
    source: teamSource(root.source),
    passRule: { topPercent: number(pass.topPercent, 0, 100), status: defaultStatus(pass.status), source: teamSource(pass.source) },
    ranking: { status: defaultStatus(ranking.status), bestMonth: text(ranking.bestMonth), percentile: text(ranking.percentile) }, sites,
  }
}

/** Reporting conventions are labelled default in shared/validation_sites.json. */
export function bestMonthRank(months: { month: number; scores: (number | null)[] }[], siteIndex: number): Ranking | null {
  let best: Ranking | null = null
  for (const month of [...months].sort((a, b) => a.month - b.month)) {
    const value = month.scores[siteIndex]
    if (value == null) continue
    if (best === null || value > best.score) {
      const better = month.scores.filter(score => score !== null && score > value).length
      best = { bestMonth: month.month, score: value, rankPercentile: 100 * (better + 1) / month.scores.length }
    }
  }
  return best
}

export async function rankSite(site: ValidationSite, check: ValidationCheck, data: MapData, definition: TestDefinition): Promise<Ranking | null> {
  const [{ computeScores }, { findPodCell }] = await Promise.all([import('../map/model'), import('../card/cardData')])
  // Reuse U11's implementation of D18; no nearest-land substitution.
  let index: number
  try { index = findPodCell(data, site.coordinates) } catch { return null }
  const target = data.targets.find(target => target.id === check.target) ?? fail('target settings are absent')
  return bestMonthRank(data.months.map(month => ({ month: month.month,
    scores: computeScores(month, target, data.targetNumbers[check.target], definition).map(row => row.score),
  })), index)
}

export async function evaluateChecks(
  registry: ValidationSites,
  definitions: readonly Pick<TestDefinition, 'id' | 'enabled' | 'partial' | 'reason'>[],
  rank: (site: ValidationSite, check: ValidationCheck) => Promise<Ranking | null>,
): Promise<Result[]> {
  const results: Result[] = []
  for (const site of registry.sites) for (const check of site.checks) {
    const definition = definitions.find(definition => definition.id === check.test) ?? fail(`unknown test ${check.test}`)
    const base = { site: site.id, ...check }
    if (!definition.enabled) {
      results.push({ ...base, bestMonth: null, score: null, rankPercentile: null, result: 'test not built', reason: text(definition.reason) })
      continue
    }
    const ranking = await rank(site, check)
    if (!ranking) {
      results.push({ ...base, bestMonth: null, score: null, rankPercentile: null, result: 'no rank', reason: 'The D18 grid center is not a shipped land cell, or this test has no site score in any month. No other cell or test was substituted.' })
      continue
    }
    const result = definition.partial || check.expected === 'should rank low' ? 'reported'
      : ranking.rankPercentile <= registry.passRule.topPercent ? 'pass' : 'fail'
    results.push({ ...base, ...ranking, result, reason: definition.partial ? text(definition.reason) : check.expected === 'should rank low' ? 'The brief sets no pass/fail rule for should rank low.' : null })
  }
  return results
}

export function renderValidation(registry: ValidationSites, results: Result[]): string {
  const escape = (value: string) => value.replaceAll('|', '\\|').replaceAll('\n', ' ')
  const targets = { shackleton: 'Moon Base (Shackleton Connecting Ridge)', jezero: 'Jezero' }
  const tests: Record<string, string> = { mobility: 'mobility', navigation: 'navigation', science_tools: 'science tools', power: 'power', communications: 'communications' }
  const allDisabled = results.length === 5 && results.every(row => row.result === 'test not built')
  const lines = [
    '# Validation on the four NASA sites', '',
    ...(allDisabled ? ['All five checks report "test not built": three need mobility, one needs navigation, and one needs science tools.',
      'U31 confirmed dryness only and did not enable mobility. Navigation and science tools are also disabled in `shared/tests.json`.', ''] : []),
    'Partial comparisons report available-data percentiles without a pass/fail verdict for the complete test.', '',
    'Generated by `node app/scripts/validate-sites.mjs` from `shared/validation_sites.json`, `shared/tests.json` and the existing map scorer. Expected results and site uses come from `docs/project-brief.md`, "Proof it works".', '',
    `Pass rule: a site expected to rank high must be in the top ${registry.passRule.topPercent}% of all land cells. This is a team-chosen rule (${registry.passRule.status}), fixed before running the check. For "should rank low", report the percentile without a pass or fail.`, '',
    '| Site | Target | Test | Expected | Best month | Score | Rank percentile (top %) | Result | Reason |',
    '|---|---|---|---|---|---|---|---|---|',
    ...results.map(row => {
      const site = registry.sites.find(site => site.id === row.site)!
      return `| ${[site.name, targets[row.target], tests[row.test] ?? row.test, row.expected, row.bestMonth === null ? 'null' : String(row.bestMonth), row.score === null ? 'null' : row.score.toFixed(6), row.rankPercentile === null ? 'null' : row.rankPercentile.toFixed(6), row.result, row.reason ?? ''].map(escape).join(' | ')} |`
    }), '',
    'Real sites are also chosen for access and cost, which the tool does not model. A miss may reflect that, and we say so. Source: `docs/project-brief.md`.', '',
    `Month selection (${registry.ranking.status}): ${registry.ranking.bestMonth}`,
    `Rank convention (${registry.ranking.status}): ${registry.ranking.percentile}`,
    'Point selection follows DEFAULT D18 in `docs/software-plan.md`: nearest grid center in each coordinate, higher center on a tie. A missing land cell or score stays missing with a reason. Disabled tests have null month, score and rank and never borrow a power ranking.', '',
    'Coordinate sources and scope:', '',
    ...registry.sites.map(site => `- **${site.name}**: ${site.coordinates.lat}, ${site.coordinates.lon} (verified). [${site.coordinates.source.title}](${site.coordinates.source.url}), accessed ${site.coordinates.source.accessed}. ${site.coordinates.source.location} Point selection (${site.pointSelection.status}): ${site.pointSelection.reason} Use: ${site.use}. [Team brief's source](${site.useSource}).`), '',
    'U12 reports the five checks; it does not establish Mission 1 completion. That still requires the real-log measured rows in the mission plan.', '',
  ]
  return lines.join('\n')
}
