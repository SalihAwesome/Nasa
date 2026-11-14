import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { renderToStaticMarkup } from 'react-dom/server'
import { afterEach, expect, test, vi } from 'vitest'
import { loadMapData } from './data'
import { MapView } from './SiteFinder'

afterEach(() => vi.unstubAllGlobals())

test('loads all shipped months locally, keeps missing Mars values missing, and renders every test', async () => {
  const calls: string[] = []
  vi.stubGlobal('fetch', async (input: string) => {
    calls.push(input)
    expect(input).toMatch(/^\.\/data\//)
    try {
      const file = new URL(`../../public/${input.slice(2)}`, import.meta.url)
      return new Response(readFileSync(fileURLToPath(file)))
    } catch {
      // Simulated missing-file transport; no fabricated scientific payload.
      return new Response(null, { status: 404 })
    }
  })
  const data = await loadMapData()
  expect(data.months).toHaveLength(12)
  expect(calls.filter(path => /month-\d\d.bin$/.test(path))).toHaveLength(12)
  expect(Object.values(data.targetNumbers.jezero).every(number => number.value === null && number.reason)).toBe(true)
  expect(Object.values(data.targetNumbers.shackleton).every(number => number.value === null && number.reason)).toBe(true)
  const html = renderToStaticMarkup(<MapView data={data} />)
  expect(html).toContain('<canvas')
  expect(html).toContain('type="range"')
  expect(html).toContain('Top 20 cells')
  expect(html).toContain('No score')
  expect(html).toContain('U07 output is not available')
  expect(html.match(/<option[^>]* disabled=""/g)).toHaveLength(4)
  for (const label of ['Power', 'Mobility', 'Communications', 'Navigation', 'Science tools']) expect(html).toContain(label)
  expect(html).not.toMatch(/href="#\/card\/cell\//)
})
