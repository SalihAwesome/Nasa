import { readFileSync } from 'node:fs'
import { renderToStaticMarkup } from 'react-dom/server'
import { expect, test } from 'vitest'
import { SunComparison } from './SunPanel'
import { initialCamera, rotateCamera, zoomCamera } from './SunViews'
import { loadSunData } from './sunData'

test('sky zoom stays bounded and rotating preserves the chosen zoom', () => {
  expect(zoomCamera(initialCamera, 100).zoom).toBe(1.8)
  expect(zoomCamera(initialCamera, -100).zoom).toBe(.7)
  const zoomed = zoomCamera(initialCamera, .2)
  expect(rotateCamera(zoomed, 15, 10).zoom).toBe(1.2)
  expect(initialCamera.zoom).toBe(1)
})

test('comparison opens with interactive skies and keeps chart, zoom and fullscreen controls available', async () => {
  const data = await loadSunData(async url => new Response(new Uint8Array(readFileSync(
    new URL('../../public/data/sun/' + url.split('/').at(-1), import.meta.url),
  ))))
  const html = renderToStaticMarkup(<SunComparison data={data} selection={{ target: 'shackleton', lat: -85, month: 3 }} />)
  expect(html.match(/class="sun-plot sun-sky"/g)).toHaveLength(2)
  for (const label of ['Elevation chart', 'Zoom in', 'Zoom out', 'Reset view', 'Full screen', 'Play both']) {
    expect(html).toContain(label)
  }
})
