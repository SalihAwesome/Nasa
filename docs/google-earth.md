# Google satellite 3D Earth views

The user requested Google Earth imagery on 14 November 2026, replacing the default Earth imagery when a Google Maps key is configured. This is an explicit online exception to the original no-map-key architecture. Climate data, score calculations, missing-data handling, Moon and Mars imagery remain local.

The integration uses Google Maps JavaScript API satellite/hybrid maps and AdvancedMarkerElement for the default view. The optional `maps3d` view uses `Map3DElement` with `HYBRID` / `SATELLITE` modes. It is not an iframe of the Google Earth website. The API is loaded on demand from Google's documented endpoint with `v=beta`. Native Google attribution and map controls are preserved. The sole new package is the development-only `@types/google.maps` (3.66.10), to type the actual SDK constructors and events; it adds no runtime dependency.

## Local configuration

Set `VITE_GOOGLE_MAPS_API_KEY` in `app/.env.local`, which Git ignores. Restart Vite after changing it. The environment variable is a browser API key and is included in the online browser build by design. Use website and Maps JavaScript API restrictions for a production key. Never commit a real key or copy it into documentation, tests or screenshots.

An empty or absent key produces the existing fully local map build. With a configured key, Earth uses Google satellite/hybrid imagery by default in Site finder and Compare sites, with an optional 3D terrain view. Match colors switches to the full original score map, which remains usable if Google is unavailable. Google imagery streams over the internet; the scientific score files are still shipped locally. Do not label the configured Google build offline-capable.

Google offers a Maps Demo Key for eligible personal Google accounts, without billing details, for prototyping only. Production requires the applicable Google Maps Platform setup. Photorealistic building coverage varies by region; satellite imagery over 3D terrain is used where meshes are unavailable.

## Interaction and data boundaries

- Select an analog site, enter coordinates, or select Google's terrain to inspect a location. Explicit site/coordinate selection centers the camera with a local terrain view.
- Zoom, tilt into terrain, reset the view, or toggle Google's place labels. Controls can be used while Google streams sharper imagery.
- Selected coordinates use the existing `findPodCell` lookup; no nearby land cell substitutes for a missing cell. Ranked links and fidelity-card selections retain target, test and month.
- Match colors shows the complete score layer separately, avoiding an opaque climate overlay over the satellite imagery. The Earth satellite view does not claim to display the heatmap.
- Camera ranges, tilt and toolbar limits are visual defaults, not scientific observations or scoring parameters.
- Google download, authentication and map-initialization failures show an explicit recovery message. No automatic retry loop is used.

## Verification

The default Vitest configuration explicitly leaves the Maps key empty, keeping the original offline rendering fixtures independent of local developer credentials. Separate loader tests use a simulated SDK transport, not fabricated climate data. Actual Google rendering and interactions are checked against the configured online build in a browser.

To check the original offline build in PowerShell without changing `.env.local`:

```powershell
$env:VITE_GOOGLE_MAPS_API_KEY = ''
npm run build
npm run check:map
Remove-Item Env:VITE_GOOGLE_MAPS_API_KEY
npm run build
```

The last build restores the online configuration. `check:map` deliberately rejects remote URLs in an online Google build; that original check is unchanged.

Official sources read on 14 November 2026:
- https://developers.google.com/maps/documentation/javascript/3d/overview
- https://developers.google.com/maps/documentation/javascript/reference/3d-map
- https://developers.google.com/maps/documentation/javascript/reference/3d-map-draw
- https://developers.google.com/maps/documentation/javascript/demo-key

## Paused draft

The final satellite-default implementation compiles but is not yet browser-verified. Longer 3D checks exposed unresolved imagery and camera issues. See `docs/earth-map-checkpoint.md` for exact verification limits and remaining work.
