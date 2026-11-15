# Google satellite 3D Earth views

The user requested Google Earth imagery on 14 November 2026, replacing the default Earth imagery when a Google Maps key is configured. This is an explicit online exception to the original no-map-key architecture. Climate data, score calculations, missing-data handling, Moon and Mars imagery remain local.

The integration uses Google Maps JavaScript API satellite/hybrid maps and AdvancedMarkerElement for the default view. The optional `maps3d` view uses `Map3DElement` with `HYBRID` / `SATELLITE` modes. It is not an iframe of the Google Earth website. The API is loaded on demand from Google's documented endpoint with `v=beta`. Native Google attribution and map controls are preserved. The sole new package is the development-only `@types/google.maps` (3.66.10), to type the actual SDK constructors and events; it adds no runtime dependency.

## Local configuration

The public browser key in `app/google-maps.config.ts` was committed at the owner's explicit request on 15 November 2026. The key is visible in repository history and in browser builds. Restrict its permitted websites and Maps JavaScript API usage in Google Cloud.

The default build is offline and makes no request to another host, so U10's check applies to it. On 15 November 2026 the owner decided that Google imagery is opt-in. Set `VITE_GOOGLE_MAPS=on` in ignored `app/.env.local` or in the build environment to use the committed key. With the opt-in, `VITE_GOOGLE_MAPS_API_KEY` replaces the committed key. Without the opt-in, the build ignores both. Restart Vite after changing either value. Other private credentials remain in ignored environment files.

With the opt-in, Earth uses Google satellite/hybrid imagery by default in Site finder and Compare sites, with an optional 3D globe. Match colors switches to the full original score map, which remains usable if Google is unavailable. Google imagery streams over the internet; the scientific score files are still shipped locally. Do not label the configured Google build offline-capable.

Google offers a Maps Demo Key for eligible personal Google accounts, without billing details, for prototyping only. Production requires the applicable Google Maps Platform setup. Photorealistic building coverage varies by region; satellite imagery over 3D terrain is used where meshes are unavailable.

## Interaction and data boundaries

- Select an analog site, enter coordinates, or select Google's terrain to inspect a location. Explicit site/coordinate selection centers the camera with a local terrain view.
- Zoom, tilt into terrain, reset the view, or toggle Google's place labels. 3D camera controls wait for Google's steady-scene event; a loading failure offers a return to satellite imagery.
- Selected coordinates use the existing `findPodCell` lookup; no nearby land cell substitutes for a missing cell. Ranked links and fidelity-card selections retain target, test and month.
- Match colors shows the complete score layer separately, avoiding an opaque climate overlay over the satellite imagery. The Earth satellite view does not claim to display the heatmap.
- Camera ranges, tilt and toolbar limits are visual defaults, not scientific observations or scoring parameters.
- Google download, authentication and map-initialization failures show an explicit recovery message. No automatic retry loop is used.

## Verification

The default Vitest configuration explicitly leaves the Maps key empty, keeping the original offline rendering fixtures independent of local developer credentials. Separate loader tests use a simulated SDK transport, not fabricated climate data. Actual Google rendering and interactions are checked against the configured online build in a browser.

To check the offline default and then build the Google variant in PowerShell:

```powershell
npm run build
npm run check:map
$env:VITE_GOOGLE_MAPS = 'on'
npm run build
Remove-Item Env:VITE_GOOGLE_MAPS
```

CI runs `check:map` on the default offline build, then builds the opt-in Google variant. `check:map` rejects remote URLs, so it fails on the Google variant by design; that original check is unchanged.

Official sources read on 14 November 2026:
- https://developers.google.com/maps/documentation/javascript/3d/overview
- https://developers.google.com/maps/documentation/javascript/reference/3d-map
- https://developers.google.com/maps/documentation/javascript/reference/3d-map-draw
- https://developers.google.com/maps/documentation/javascript/demo-key

## Verified completion, 15 November 2026

Satellite tiles and detailed 3D terrain were verified in a real browser with the local key. Site focusing, zoom/reset, label toggles, mode changes, comparison, authentication-failure recovery and small-screen layouts pass. Camera updates now send a complete center/range/tilt/heading together; terrain targets use zero relative-to-ground altitude, while overview views use absolute altitude. This prevents interpreting a previous absolute terrain elevation as another height above ground. Duplicate selected-site pins and city-pin clutter are removed.

Run `npm run check:ui` in `app/` after a `VITE_GOOGLE_MAPS=on` build, or `npm run check:ui -- --offline` after a default build. Captures go to `app/.impeccable/review/`, with offline captures in its `offline/` subdirectory. The browser check uses Chrome or Edge on Windows or Chromium on Linux; set `CHROME_PATH` if it is installed elsewhere. See `docs/new-design-verification.md` for results and limits.
