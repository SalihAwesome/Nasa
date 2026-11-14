import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { renderToStaticMarkup } from 'react-dom/server'
import { afterEach, expect, test, vi } from 'vitest'
import { loadMapData } from './data'
import { MapView } from './SiteFinder'
import { loadRegistries } from '../data/registries'
import meda from '../../public/data/mars/jezero-card.json'

afterEach(() => vi.unstubAllGlobals())

test('loads all shipped months locally, reads U07 values, keeps its gaps missing, and renders every test', async () => {
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
  for (const channel of loadRegistries().channels.filter(channel => channel.onCard)) {
    const id = channel.id as keyof typeof meda.channels
    expect(data.targetNumbers.jezero[id].value).toBe(meda.channels[id].value)
    if (meda.channels[id].value === null) expect(data.targetNumbers.jezero[id].reason).toBe(meda.channels[id].reason)
    expect(data.targetNumbers.shackleton[id].value).toBeNull()
    expect(data.targetNumbers.shackleton[id].reason).toBeTruthy()
  }
  const html = renderToStaticMarkup(<MapView data={data} />)
  expect(html).toContain('<canvas')
  expect(html).toContain('Interactive Earth globe')
  expect(html).toContain('Atacama Desert, Chile')
  expect(data.countries.find(country => country.name === 'Chile')).toBeDefined()
  expect(html).toContain('type="range"')
  expect(html).toContain('20 highest-scoring Earth areas')
  expect(html).toContain('No score') // Legend retains the missing-data color.
  expect(html).toContain(meda.channels.uv.reason)
  expect(html.match(/<option[^>]* disabled=""/g)).toHaveLength(4)
  for (const label of ['Power', 'Mobility', 'Communications', 'Navigation', 'Science tools']) expect(html).toContain(label)
  expect(html.match(/href="#\/card\/cell\//g)).toHaveLength(20)
})

test('a missing U07 response leaves every Mars channel null with a reason', async () => {
  vi.stubGlobal('fetch', async (input: string) => input.endsWith('/mars/jezero-card.json')
    ? new Response(null, { status: 404 })
    : new Response(new Uint8Array(readFileSync(new URL(`../../public/${input.slice(2)}`, import.meta.url)))))
  const data = await loadMapData()
  for (const channel of loadRegistries().channels.filter(channel => channel.onCard)) {
    expect(data.targetNumbers.jezero[channel.id].value).toBeNull()
    expect(data.targetNumbers.jezero[channel.id].reason).toBeTruthy()
  }
  expect(data.targetNumbers.jezero.ground_temp.reason).toContain('U07 output is not available')
})
