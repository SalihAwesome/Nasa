import { afterEach, beforeEach, expect, test, vi } from 'vitest'

// Simulated SDK transport only. No scientific data is fabricated by these tests.
beforeEach(() => {
  vi.resetModules()
  vi.useFakeTimers()
  vi.stubEnv('VITE_GOOGLE_MAPS_API_KEY', 'simulated-test-key')
  vi.stubGlobal('google', undefined)
  vi.stubGlobal('window', { setTimeout, clearTimeout, dispatchEvent: vi.fn() })
})
afterEach(() => {
  vi.useRealTimers()
  vi.unstubAllEnvs()
  vi.unstubAllGlobals()
})

function transport() {
  const script = { src: '', async: false, onerror: () => {} }
  const append = vi.fn()
  vi.stubGlobal('document', { createElement: () => script, head: { append } })
  return { script, append }
}

test('concurrent Earth views share one SDK request and a typed library', async () => {
  const { script, append } = transport()
  const { loadGoogleEarth } = await import('./googleMaps')
  const first = loadGoogleEarth(), second = loadGoogleEarth()
  expect(first).toBe(second)
  expect(append).toHaveBeenCalledTimes(1)
  expect(new URL(script.src).hostname).toBe('maps.googleapis.com')
  const library = { simulated: true }
  const importLibrary = vi.fn().mockResolvedValue(library)
  vi.stubGlobal('google', { maps: { importLibrary } })
  window.provingGroundGoogleReady?.()
  await expect(first).resolves.toBe(library)
  expect(importLibrary).toHaveBeenCalledWith('maps3d')
  expect(vi.getTimerCount()).toBe(0)
})

test('a missing key is an explicit failure without starting a script request', async () => {
  vi.stubEnv('VITE_GOOGLE_MAPS_API_KEY', '')
  const { append } = transport()
  const { loadGoogleEarth } = await import('./googleMaps')
  await expect(loadGoogleEarth()).rejects.toThrow('not configured')
  expect(append).not.toHaveBeenCalled()
})

test('script download failure rejects and clears its deadline', async () => {
  const { script } = transport()
  const { loadGoogleEarth } = await import('./googleMaps')
  const result = loadGoogleEarth()
  const check = expect(result).rejects.toThrow('could not be downloaded')
  script.onerror()
  await check
  expect(vi.getTimerCount()).toBe(0)
})

test('an authentication failure notifies mounted maps and rejects initialization', async () => {
  transport()
  const { loadGoogleEarth } = await import('./googleMaps')
  const result = loadGoogleEarth()
  const check = expect(result).rejects.toThrow('could not authorize')
  window.gm_authFailure?.()
  await check
  expect(window.dispatchEvent).toHaveBeenCalledWith(expect.objectContaining({ type: 'google-maps-auth-failure' }))
  expect(vi.getTimerCount()).toBe(0)
})
