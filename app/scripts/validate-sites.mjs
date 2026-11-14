import { readFile, writeFile } from 'node:fs/promises'
import { fileURLToPath } from 'node:url'
import { resolve, relative, isAbsolute } from 'node:path'
import { createServer } from 'vite'

const root = fileURLToPath(new URL('../../', import.meta.url))
const app = resolve(root, 'app')
const publicRoot = resolve(app, 'public')
const output = resolve(root, 'docs/validation.md')
const checkOnly = process.argv.includes('--check')
if (process.argv.slice(2).some(arg => arg !== '--check')) throw new Error('Usage: node app/scripts/validate-sites.mjs [--check]')
const json = async path => JSON.parse(await readFile(resolve(root, path), 'utf8'))
const originalFetch = globalThis.fetch

// Existing browser loaders read only the committed local pipeline outputs.
// This adapter never contacts a host and is restored before the script exits.
globalThis.fetch = async input => {
  const path = String(input)
  if (!/^(?:\.\/|\/)data\//.test(path) || path.includes('?') || path.includes('#')) throw new Error(`Unexpected validation data path: ${path}`)
  const file = resolve(publicRoot, path.replace(/^\.?\//, ''))
  const inside = relative(publicRoot, file)
  if (inside.startsWith('..') || isAbsolute(inside)) throw new Error('Validation data path escapes app/public')
  try { return new Response(new Uint8Array(await readFile(file))) }
  catch (error) {
    if (error.code === 'ENOENT') return new Response(null, { status: 404 })
    throw error
  }
}

let server
try {
  server = await createServer({ root: app, configFile: false, appType: 'custom', logLevel: 'error',
    server: { middlewareMode: true, watch: null, hmr: false },
  })
  const { parseValidationSites, evaluateChecks, rankSite, renderValidation } = await server.ssrLoadModule('/src/validation/report.ts')
  const registry = parseValidationSites(await json('shared/validation_sites.json'))
  const definitions = await json('shared/tests.json')
  let map
  const results = await evaluateChecks(registry, definitions, async (site, check) => {
    // Disabled tests never load the grids or invoke a scorer.
    map ??= await (await server.ssrLoadModule('/src/map/data.ts')).loadMapData()
    return rankSite(site, check, map, definitions.find(definition => definition.id === check.test))
  })
  const markdown = renderValidation(registry, results)
  if (checkOnly) {
    const saved = (await readFile(output, 'utf8')).replaceAll('\r\n', '\n')
    if (saved !== markdown) throw new Error('docs/validation.md is stale; run node app/scripts/validate-sites.mjs')
  } else await writeFile(output, markdown, 'utf8')
  process.stdout.write(markdown)
  console.log(`U12 check: ${registry.sites.length} sites; ${results.length} rows; ${results.filter(row => row.result === 'test not built').length} tests not built; docs/validation.md ${checkOnly ? 'matches generated output' : 'written'}.`)
} finally {
  globalThis.fetch = originalFetch
  await server?.close()
}
