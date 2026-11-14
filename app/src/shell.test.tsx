import { readFileSync } from 'node:fs'
import { renderToStaticMarkup } from 'react-dom/server'
import { afterEach, expect, test, vi } from 'vitest'
import App from './App'

// Route names come from docs/software-plan.md, U28; headings from mission-plan.md.
afterEach(() => vi.unstubAllGlobals())

test.each([
  ['#/map', 'Find Earth sites to test Moon and Mars equipment', 'Loading the Earth test site map'],
  ['#/card/site', 'How this site matches the mission target', 'Not available yet'],
  ['#/sun', 'Compare sunlight on Earth, the Moon, and Mars', 'Choose a Moon or Mars target and an Earth location'],
  ['#/truth', 'Check estimates against field measurements', 'Load a sensor recording'],
  ['#/live', 'Watch the Qatar sensor pod', 'Latest sensor readings'],
])('renders %s with its heading', (hash, heading, sectionHeading) => {
  vi.stubGlobal('window', { location: { hash } })
  const html = renderToStaticMarkup(<App />)
  expect(html).toMatch(new RegExp(`<h1[^>]*>${heading}</h1>`))
  expect(html).toMatch(new RegExp(`<h2[^>]*>${sectionHeading}</h2>`))
})

test('starts at the site finder when the URL has no hash', () => {
  vi.stubGlobal('window', { location: { hash: '' } })
  const html = renderToStaticMarkup(<App />)
  expect(html).toMatch(/<h1[^>]*>Find Earth sites to test Moon and Mars equipment<\/h1>/)
  expect(html).toContain('find places on Earth to test equipment before sending it to the Moon or Mars')
})

test('unknown routes explain how to return to the site finder', () => {
  vi.stubGlobal('window', { location: { hash: '#/unknown' } })
  const html = renderToStaticMarkup(<App />)
  expect(html).toContain('Page not found')
  expect(html).toContain('href="#/map"')
})

const readDesign = () => readFileSync(new URL('../DESIGN.md', import.meta.url), 'utf8')
const readTokens = () => readFileSync(new URL('./styles/tokens.css', import.meta.url), 'utf8')

test('tokens.css defines every token documented in DESIGN.md', () => {
  const names = [...readDesign().matchAll(/`(--[a-z0-9-]+)`/g)].map(match => match[1])
  expect(names.length).toBeGreaterThan(0)
  const css = readTokens()
  for (const name of names) expect(css).toMatch(new RegExp(`${name}\\s*:`))
})

function luminance(hex: string) {
  const channels = [0, 2, 4].map(offset => {
    const channel = Number.parseInt(hex.slice(offset, offset + 2), 16) / 255
    return channel <= 0.04045 ? channel / 12.92 : ((channel + 0.055) / 1.055) ** 2.4
  })
  return (channels[0] ?? 0) * 0.2126 + (channels[1] ?? 0) * 0.7152 + (channels[2] ?? 0) * 0.0722
}

test('text on background has at least 4.5:1 contrast', () => {
  const css = readTokens()
  const color = (token: string) => {
    const hex = css.match(new RegExp(`${token}:\\s*#([a-fA-F0-9]{6})\\s*;`))?.[1]
    expect(hex, `${token} must be an explicit six-digit hex color`).toBeDefined()
    return luminance(hex ?? '')
  }
  const text = color('--color-text'), background = color('--color-background')
  const contrast = (Math.max(text, background) + 0.05) / (Math.min(text, background) + 0.05)
  console.info(`U28 text/background contrast: ${contrast.toFixed(2)}:1`)
  expect(contrast).toBeGreaterThanOrEqual(4.5)
})
