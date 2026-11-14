import { readFileSync, readdirSync } from 'node:fs'
import { resolve, join, extname } from 'node:path'
import { test } from 'node:test'
import assert from 'node:assert/strict'

const dist = resolve(import.meta.dirname, '../app/dist')
const sources = JSON.parse(readFileSync(resolve(dist, '../../shared/sources.json'), 'utf8'))
const provenance = new Set(sources.map(source => source.url).filter(Boolean))
// U11 renders citations copied from the team's brief. Like registry URLs,
// these strings are provenance, not background requests.
const limits = JSON.parse(readFileSync(resolve(dist, '../../shared/limits.json'), 'utf8'))
for (const row of Object.values(limits).flat()) {
  for (const match of row.text.matchAll(/\[[^\]]+\]\((https:\/\/[^\s)]+)\)/g)) provenance.add(match[1])
}
function files(directory) {
  return readdirSync(directory, { withFileTypes: true }).flatMap(entry =>
    entry.isDirectory() ? files(join(directory, entry.name)) : [join(directory, entry.name)])
}

function checkCode(text, file) {
    // Source URLs are inert provenance in the registry, not network requests.
    for (const match of text.matchAll(/https?:\/\/[^\s"'<>`\\)]+/g)) {
      assert.ok(provenance.has(match[0]) || match[0].startsWith('https://react.dev/errors/') ||
        match[0].startsWith('http://www.w3.org/'), `${file}: unexpected remote URL ${match[0]}`)
    }
    assert.doesNotMatch(text, /(?:src|href)\s*=\s*["'](?:https?:)?\/\//i)
    assert.doesNotMatch(text, /(?:fetch|importScripts|WebSocket|EventSource)\s*\(\s*["'`](?:https?:|wss?:|\/\/)/i)
    assert.doesNotMatch(text, /(?:@import\s+|url\(\s*)["']?(?:https?:)?\/\//i)
    assert.doesNotMatch(text, /(?:import\s*\(|\bfrom\s*)["'`](?:https?:)?\/\//i)
}

test('U10 built HTML, JavaScript and CSS contain no requests to another host', () => {
  const code = files(dist).filter(file => ['.html', '.js', '.css'].includes(extname(file)))
  assert.ok(code.some(file => file.endsWith('index.html')))
  for (const file of code) checkCode(readFileSync(file, 'utf8'), file)
  console.log(`U10 offline build check: ${code.length} built code files; no cross-host requests`)
})

test('a cited URL still fails the offline check when used as a remote request', () => {
  for (const url of provenance) {
    assert.doesNotThrow(() => checkCode(JSON.stringify(url), 'inert provenance'))
    assert.throws(() => checkCode(`fetch(${JSON.stringify(url)})`, 'simulated request'))
    assert.throws(() => checkCode(`<script src="${url}"></script>`, 'simulated request'))
    assert.throws(() => checkCode(`@import "${url}"`, 'simulated request'))
  }
})
