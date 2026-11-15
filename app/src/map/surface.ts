import type { Cell } from './model'
import type { GlobeView } from './globe'

const rad = Math.PI / 180
export const surfaceRadius = (width: number, height: number, zoom: number) => Math.min(width, height) * .455 * zoom

export function globePoint(view: GlobeView, width: number, height: number, x: number, y: number): Cell | null {
  const radius = surfaceRadius(width, height, view.zoom)
  const east = (x - width / 2) / radius
  const north = (height / 2 - y) / radius
  const distance = east * east + north * north
  if (distance > 1) return null
  const depth = Math.sqrt(1 - distance)
  const phi = view.lat * rad, lambda = view.lon * rad
  const along = depth * Math.cos(phi) - north * Math.sin(phi)
  const z = depth * Math.sin(phi) + north * Math.cos(phi)
  const lon = Math.atan2(along * Math.sin(lambda) + east * Math.cos(lambda), along * Math.cos(lambda) - east * Math.sin(lambda)) / rad
  return { lat: Math.asin(Math.max(-1, Math.min(1, z))) / rad, lon }
}

const vertex = 'attribute vec2 a_position; void main() { gl_Position = vec4(a_position, 0.0, 1.0); }'
const fragment = [
  'precision highp float;',
  'uniform vec2 u_resolution; uniform vec2 u_camera; uniform float u_radius; uniform sampler2D u_surface;',
  'const float PI = 3.141592653589793;',
  'void main() {',
  'vec2 p = (gl_FragCoord.xy - u_resolution * 0.5) / u_radius;',
  'float rr = dot(p, p);',
  'if (rr > 1.0) { gl_FragColor = vec4(0.0); return; }',
  'float depth = sqrt(max(0.0, 1.0 - rr));',
  'float cp = cos(u_camera.y), sp = sin(u_camera.y);',
  'float cl = cos(u_camera.x), sl = sin(u_camera.x);',
  'float along = depth * cp - p.y * sp;',
  'vec3 world = vec3(along * cl - p.x * sl, along * sl + p.x * cl, depth * sp + p.y * cp);',
  'vec2 uv = vec2(atan(world.y, world.x) / (2.0 * PI) + 0.5, 0.5 - asin(clamp(world.z, -1.0, 1.0)) / PI);',
  'vec3 color = texture2D(u_surface, uv).rgb;',
  'float light = 0.75 + 0.25 * max(0.0, dot(vec3(p, depth), normalize(vec3(-0.3, 0.45, 1.0))));',
  'gl_FragColor = vec4(color * light, 1.0);',
  '}',
].join('\n')

// Rendering is demand-driven. GPU resources are released when a globe unmounts.
export function createSurface(canvas: HTMLCanvasElement, url: string, onReady: () => void, onError: () => void) {
  const gl = canvas.getContext('webgl', { alpha: true, antialias: false, premultipliedAlpha: false })
  if (!gl) { onError(); return null }
  const shaders: WebGLShader[] = []
  function shader(kind: number, source: string) {
    const item = gl?.createShader(kind)
    if (!item || !gl) throw new Error('Surface shader unavailable.')
    shaders.push(item)
    gl.shaderSource(item, source)
    gl.compileShader(item)
    if (!gl.getShaderParameter(item, gl.COMPILE_STATUS)) throw new Error('Surface shader could not compile.')
    return item
  }
  const program = gl.createProgram()
  const buffer = gl.createBuffer(), texture = gl.createTexture()
  if (!program || !buffer || !texture) { onError(); return null }
  try {
    gl.attachShader(program, shader(gl.VERTEX_SHADER, vertex))
    gl.attachShader(program, shader(gl.FRAGMENT_SHADER, fragment))
    gl.linkProgram(program)
    if (!gl.getProgramParameter(program, gl.LINK_STATUS)) throw new Error('Surface shader could not link.')
  } catch {
    shaders.forEach(item => gl.deleteShader(item))
    gl.deleteProgram(program); gl.deleteBuffer(buffer); gl.deleteTexture(texture)
    onError()
    return null
  }
  gl.useProgram(program)
  gl.bindBuffer(gl.ARRAY_BUFFER, buffer)
  gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1,-1, 1,-1, -1,1, -1,1, 1,-1, 1,1]), gl.STATIC_DRAW)
  const position = gl.getAttribLocation(program, 'a_position')
  gl.enableVertexAttribArray(position)
  gl.vertexAttribPointer(position, 2, gl.FLOAT, false, 0, 0)
  gl.bindTexture(gl.TEXTURE_2D, texture)
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR)
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR)
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE)
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE)
  const resolution = gl.getUniformLocation(program, 'u_resolution')
  const camera = gl.getUniformLocation(program, 'u_camera')
  const radius = gl.getUniformLocation(program, 'u_radius')
  let ready = false, disposed = false
  const image = new Image()
  image.onload = () => {
    if (disposed) return
    const max = gl.getParameter(gl.MAX_TEXTURE_SIZE)
    let source: TexImageSource = image
    if (image.width > max || image.height > max) {
      const smaller = document.createElement('canvas')
      const scale = Math.min(max / image.width, max / image.height)
      smaller.width = Math.round(image.width * scale)
      smaller.height = Math.round(image.height * scale)
      const ctx = smaller.getContext('2d')
      if (!ctx) { onError(); return }
      ctx.drawImage(image, 0, 0, smaller.width, smaller.height)
      source = smaller
    }
    gl.bindTexture(gl.TEXTURE_2D, texture)
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGB, gl.RGB, gl.UNSIGNED_BYTE, source)
    ready = true
    onReady()
  }
  image.onerror = () => { if (!disposed) onError() }
  image.src = url

  return {
    draw(view: GlobeView, width: number, height: number) {
      if (!ready || disposed || !width || !height || gl.isContextLost()) return false
      const dpr = Math.min(window.devicePixelRatio || 1, 2)
      const w = Math.round(width * dpr), h = Math.round(height * dpr)
      if (canvas.width !== w || canvas.height !== h) { canvas.width = w; canvas.height = h }
      gl.viewport(0, 0, w, h)
      gl.useProgram(program)
      gl.uniform2f(resolution, w, h)
      gl.uniform2f(camera, view.lon * rad, view.lat * rad)
      gl.uniform1f(radius, surfaceRadius(width, height, view.zoom) * dpr)
      gl.drawArrays(gl.TRIANGLES, 0, 6)
      return true
    },
    dispose() {
      disposed = true
      image.onload = null
      image.onerror = null
      gl.deleteTexture(texture)
      gl.deleteBuffer(buffer)
      gl.deleteProgram(program)
      shaders.forEach(item => gl.deleteShader(item))
    },
  }
}
