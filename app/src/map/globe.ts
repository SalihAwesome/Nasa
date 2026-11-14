import { geoGraticule10, geoOrthographic, geoPath } from 'd3-geo'
import type { GeoPermissibleObjects } from 'd3-geo'
import type { Cell, CellScore } from './model'
import type { Place } from './places'

export type GlobeView = { lon: number; lat: number; zoom: number }
export type FieldSite = Cell & { id: string; name: string; index: number | null }
type LabelBox = { left: number; right: number; top: number; bottom: number }
type Marker = LabelBox & { site: FieldSite }
export type GlobeFrame = { x: Float32Array; y: Float32Array; markers: Marker[] }

export const homeView: GlobeView = { lon: -36, lat: 24, zoom: 1 }
export const maxZoom = 40
const radians = Math.PI / 180
const sphere: GeoPermissibleObjects = { type: 'Sphere' }
const graticule = geoGraticule10()
const stops = ['0', '025', '05', '075', '1']

export function moveGlobe(view: GlobeView, lon: number, lat: number, zoom = view.zoom): GlobeView {
  return {
    lon: ((lon + 180) % 360 + 360) % 360 - 180,
    lat: Math.max(-90, Math.min(90, lat)),
    zoom: Math.max(1, Math.min(maxZoom, zoom)),
  }
}

export function globeRadius(width: number, height: number) {
  return Math.min(width, height) * 0.455
}

// Earth-centered unit vectors. Camera rotations reuse them without per-cell trig.
export function globeVectors(cells: readonly Cell[]) {
  const vectors = new Float64Array(cells.length * 3)
  cells.forEach(({ lon, lat }, index) => {
    const phi = lat * radians, lambda = lon * radians
    const horizontal = Math.cos(phi)
    vectors[index * 3] = horizontal * Math.cos(lambda)
    vectors[index * 3 + 1] = horizontal * Math.sin(lambda)
    vectors[index * 3 + 2] = Math.sin(phi)
  })
  return vectors
}

export function scorePalette(styles: CSSStyleDeclaration) {
  const rgb = stops.map(stop => {
    const hex = styles.getPropertyValue('--color-score-' + stop).trim()
    return [1, 3, 5].map(offset => Number.parseInt(hex.slice(offset, offset + 2), 16))
  })
  const missing = styles.getPropertyValue('--color-no-score').trim()
  const colors = new Uint8ClampedArray(257 * 4)
  for (let index = 0; index < 256; index++) {
    const position = index / 255 * (rgb.length - 1)
    const low = Math.min(Math.floor(position), rgb.length - 2), share = position - low
    rgb[low].forEach((value, channel) => { colors[index * 4 + channel] = value + (rgb[low + 1][channel] - value) * share })
    colors[index * 4 + 3] = 255
  }
  colors.set([1, 3, 5].map(offset => Number.parseInt(missing.slice(offset, offset + 2), 16)), 256 * 4)
  colors[256 * 4 + 3] = 255
  return new Uint32Array(colors.buffer)
}

export function createScoreRaster() {
  const canvas = document.createElement('canvas')
  const context = canvas.getContext('2d')
  if (!context) throw new Error('Score layer requires a 2D canvas.')
  let image: ImageData | undefined
  let pixels = new Uint32Array(0)
  return {
    canvas,
    begin(width: number, height: number) {
      if (!image || image.width !== width || image.height !== height) {
        canvas.width = width
        canvas.height = height
        image = context.createImageData(width, height)
        pixels = new Uint32Array(image.data.buffer)
      } else pixels.fill(0)
      return pixels
    },
    upload() { if (image) context.putImageData(image, 0, 0) },
  }
}

export function globeColors(scores: readonly CellScore[]) {
  return Int16Array.from(scores, entry => entry.score === null ? -1 : Math.round(entry.score * 255))
}

const overlaps = (a: LabelBox, b: LabelBox) =>
  a.left < b.right && a.right > b.left && a.top < b.bottom && a.bottom > b.top

export function drawGlobe({
  ctx, width, height, view, vectors, scores, palette, land, countries, sites, cities, pin, frame, raster,
}: {
  ctx: CanvasRenderingContext2D; width: number; height: number; view: GlobeView
  vectors: Float64Array; scores: Int16Array; palette: ReturnType<typeof scorePalette>
  land: GeoPermissibleObjects; countries: readonly Place[]; sites: readonly FieldSite[]; frame: GlobeFrame
  cities: readonly Place[]; pin: (Cell & { name: string }) | null
  raster: ReturnType<typeof createScoreRaster>
}) {
  const cx = width / 2, cy = height / 2, radius = globeRadius(width, height) * view.zoom
  const projection = geoOrthographic().rotate([-view.lon, -view.lat]).translate([cx, cy]).scale(radius)
  const path = geoPath(projection, ctx)
  const lambda = view.lon * radians, phi = view.lat * radians
  const co = Math.cos(lambda), si = Math.sin(lambda), cp = Math.cos(phi), sp = Math.sin(phi)
  const visible = ({ lon, lat }: Cell, minFacing: number) => {
    const latitude = lat * radians
    return Math.cos((lon - view.lon) * radians) * Math.cos(latitude) * cp + Math.sin(latitude) * sp > minFacing
  }

  ctx.clearRect(0, 0, width, height)
  ctx.save()
  ctx.beginPath()
  path(sphere)
  ctx.clip()

  const ocean = ctx.createRadialGradient(cx - radius * 0.26, cy - radius * 0.27, radius * 0.08, cx, cy, radius * 1.05)
  ocean.addColorStop(0, '#1a344b')
  ocean.addColorStop(0.73, '#102539')
  ocean.addColorStop(1, '#09141f')
  ctx.fillStyle = ocean
  ctx.fillRect(0, 0, width, height)

  ctx.beginPath()
  path(land)
  ctx.fillStyle = '#142631'
  ctx.fill()

  ctx.beginPath()
  path(graticule)
  ctx.strokeStyle = 'rgba(155, 195, 222, 0.13)'
  ctx.lineWidth = 0.65
  ctx.stroke()

  const step = Math.max(1, radius * 0.0108)
  // Rasterize the score cells at display resolution in one buffer. At high
  // DPR the text and coast still use the canvas backing resolution.
  const rasterWidth = Math.ceil(width), rasterHeight = Math.ceil(height)
  const pixels = raster.begin(rasterWidth, rasterHeight)
  for (let index = 0, offset = 0; offset < vectors.length; index++, offset += 3) {
    const x = vectors[offset], y = vectors[offset + 1], z = vectors[offset + 2]
    const along = co * x + si * y
    const depth = cp * along + sp * z
    if (depth <= 0) { frame.x[index] = NaN; continue }
    const px = cx + radius * (co * y - si * x)
    const py = cy - radius * (cp * z - sp * along)
    if (px < 0 || px > width || py < 0 || py > height) { frame.x[index] = NaN; continue }
    frame.x[index] = px
    frame.y[index] = py
    const color = scores[index]
    const pixel = palette[color < 0 ? 256 : color]
    const half = Math.max(1, step * (0.55 + 0.45 * depth)) / 2
    const left = Math.max(0, Math.round(px - half)), right = Math.min(rasterWidth, Math.round(px + half))
    const top = Math.max(0, Math.round(py - half)), bottom = Math.min(rasterHeight, Math.round(py + half))
    for (let row = top * rasterWidth; row < bottom * rasterWidth; row += rasterWidth) {
      pixels.fill(pixel, row + left, row + right)
    }
  }
  raster.upload()
  ctx.drawImage(raster.canvas, 0, 0, width, height)

  ctx.beginPath()
  path(land)
  ctx.strokeStyle = 'rgba(180, 216, 225, 0.43)'
  ctx.lineWidth = 0.75
  ctx.stroke()
  ctx.restore()

  ctx.beginPath()
  path(sphere)
  ctx.strokeStyle = 'rgba(142, 197, 230, 0.63)'
  ctx.lineWidth = 1.25
  ctx.stroke()

  const labels: LabelBox[] = []
  function place(text: string, x: number, y: number, marker: boolean) {
    const padding = 5, textWidth = ctx.measureText(text).width
    const offsets = marker ? [[9, 0], [-9 - textWidth, 0], [9, -18], [9, 18]] : [[-textWidth / 2, 0]]
    for (const [dx, dy] of offsets) {
      const left = x + dx, middle = y + dy
      const box = { left: left - padding, right: left + textWidth + padding, top: middle - 8, bottom: middle + 8 }
      if (box.left < 5 || box.right > width - 5 || box.top < 5 || box.bottom > height - 5 || labels.some(other => overlaps(box, other))) continue
      labels.push(box)
      ctx.strokeText(text, left, middle)
      ctx.fillText(text, left, middle)
      return box
    }
    return null
  }

  ctx.textBaseline = 'middle'
  ctx.lineJoin = 'round'
  ctx.strokeStyle = 'rgba(8, 17, 25, 0.94)'
  ctx.lineWidth = 3
  ctx.font = "600 12px 'Segoe UI', system-ui, sans-serif"
  ctx.fillStyle = '#ffe19c'
  frame.markers = []
  for (const site of sites) {
    if (!visible(site, 0.09)) continue
    const point = projection([site.lon, site.lat])
    if (!point) continue
    const [px, py] = point
    if (px < 0 || px > width || py < 0 || py > height) continue
    ctx.beginPath()
    ctx.arc(px, py, 3.5, 0, Math.PI * 2)
    ctx.stroke()
    ctx.fill()
    const box = place(site.name.split(',')[0], px, py, true)
    frame.markers.push({ site, left: px - 7, right: px + 7, top: py - 7, bottom: py + 7 })
    if (box) frame.markers.push({ ...box, site })
  }

  ctx.font = "600 11px 'Segoe UI', system-ui, sans-serif"
  ctx.fillStyle = '#e5f1fa'
  const labelLimit = Math.floor(Math.min(29, width / 23 + (view.zoom - 1) * 4))
  const maxRank = view.zoom < 1.45 ? 2 : view.zoom < 2.3 ? 4 : 7
  if (pin && visible(pin, 0)) {
    const point = projection([pin.lon, pin.lat])
    if (point) {
      const [x, y] = point
      ctx.fillStyle = '#ffe19c'
      ctx.beginPath()
      ctx.arc(x, y, 4, 0, Math.PI * 2)
      ctx.stroke()
      ctx.fill()
      place(pin.name, x, y, true)
    }
  }
  let count = 0
  if (view.zoom >= 3) {
    const zoomRank = view.zoom < 6 ? 3 : view.zoom < 14 ? 6 : 12
    for (const city of cities) {
      if (count >= Math.floor(labelLimit * .8) || city.rank > zoomRank) break
      if (!visible(city, 0.55)) continue
      const point = projection([city.lon, city.lat])
      if (!point || !place(city.name, point[0] + ctx.measureText(city.name).width / 2 + 5, point[1], false)) continue
      ctx.beginPath()
      ctx.arc(point[0], point[1], 2, 0, Math.PI * 2)
      ctx.fill()
      count++
    }
  }
  for (const country of countries) {
    if (count >= labelLimit) break
    if (country.rank > maxRank || !visible(country, 0.37)) continue
    const point = projection([country.lon, country.lat])
    if (point && place(country.name, point[0], point[1], false)) count++
  }
}

export function hitGlobe(frame: GlobeFrame, x: number, y: number, tolerance: number) {
  const marker = frame.markers.find(box => x >= box.left && x <= box.right && y >= box.top && y <= box.bottom)
  if (marker) return marker.site.index
  let index: number | null = null, best = tolerance ** 2
  for (let i = 0; i < frame.x.length; i++) {
    const dx = frame.x[i] - x
    if (!(Math.abs(dx) < tolerance)) continue
    const distance = dx ** 2 + (frame.y[i] - y) ** 2
    if (distance < best) { index = i; best = distance }
  }
  return index
}
