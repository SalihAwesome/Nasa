/// <reference types="google.maps" />

declare global {
  interface Window {
    provingGroundGoogleReady?: () => void
    gm_authFailure?: () => void
  }
}

let sdk: Promise<void> | undefined
let library: Promise<google.maps.Maps3DLibrary> | undefined

/** One SDK request is shared by all mounted Earth views. No key is stored in source. */
function loadGoogleSdk() {
  sdk ??= new Promise<void>((resolve, reject) => {
    if (typeof google !== 'undefined') { resolve(); return }
    const key = import.meta.env.VITE_GOOGLE_MAPS_API_KEY?.trim()
    if (!key) { reject(new Error('Google Maps key is not configured.')); return }
    const script = document.createElement('script')
    const timeout = window.setTimeout(() => reject(new Error('Google Maps did not respond.')), 30000)
    window.provingGroundGoogleReady = () => { window.clearTimeout(timeout); resolve() }
    window.gm_authFailure = () => {
      window.clearTimeout(timeout)
      window.dispatchEvent(new Event('google-maps-auth-failure'))
      reject(new Error('Google Maps could not authorize this website.'))
    }
    const url = new URL('https://maps.googleapis.com/maps/api/js')
    url.search = new URLSearchParams({ key, v: 'beta', loading: 'async', callback: 'provingGroundGoogleReady' }).toString()
    script.src = url.href
    script.async = true
    script.onerror = () => { window.clearTimeout(timeout); reject(new Error('Google Maps could not be downloaded.')) }
    document.head.append(script)
  })
  return sdk
}

export function loadGoogleEarth() {
  library ??= loadGoogleSdk().then(() => google.maps.importLibrary('maps3d'))
  return library
}

export function loadGoogleSatellite() {
  return loadGoogleSdk().then(async () => {
    const [maps, markers] = await Promise.all([google.maps.importLibrary('maps'), google.maps.importLibrary('marker')])
    return { Map: maps.Map, AdvancedMarkerElement: markers.AdvancedMarkerElement }
  })
}
