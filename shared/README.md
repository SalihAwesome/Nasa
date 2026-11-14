# shared

Files in this folder are read by both the app and the pipeline. They hold the registries and every tolerance, weight, and threshold. `docs/software-plan.md` says which unit writes each file.

## U02 registries

Use `loadRegistries()` from `app/src/data/registries.ts` or `load_registries()`
from `pipeline/registries.py`. Each loader returns the four parsed registries
and raises `RegistryError` with a field path for malformed data. The separate
`parseChannels`, `parseSources`, `parsePodSite`, and `parsePodSettings` functions
(snake_case in Python) accept untrusted input without coercing its values.

- `channels.json` is an array of the seven rows in U02. The card reduction names
  encode DEFAULT D16: `range` means highest minus lowest, `daylight_mean` means
  mean in daylight, and `daily_mean` means mean over 24 hours. This unit records
  those choices; it does not implement reductions. Each row's `status: default`
  identifies the plan's chosen label and reduction, and the air row's choice of
  `ATS_LOCAL_TEMP1`. POWER and MEDA mappings come from `docs/verified-facts.md`.
  The humidity unit is the card/pod unit; the MEDA label's missing humidity unit
  is still unresolved and must be preserved by U07.
- A missing field stays `null`; its explanation is in `reasons.<fieldName>` on
  the same entry. Loaders reject missing, blank, unknown, or stale reason keys.
- `sources.json` records the verified URLs and their recorded access date,
  2026-11-12. Natural Earth's two products have separate entries so both exact
  verified URLs are retained. `files` patterns are repository-relative paths
  under `app/public/data/`. A derived file may match multiple sources. The pod
  and computed entries have no external URL or completed collection/generation
  date, so those fields remain `null` with reasons. No simulated file is claimed
  as collected field data.
- `pod_site.json` uses DEFAULT D10, not a field location. Its `reason` explains
  the pending team input. Exclusions use UTC `{ "start": "...", "end": "..." }`
  intervals with start before end. Explicitly missing coordinates or start times
  remain `null` with individual reasons; the loaders never substitute defaults.
- `pod_settings.json` holds DEFAULT D7 (`sunEventLux`, `reflectivityMinLux`) and
  D19 (`reflFactorFallback`, `taOffsetFallbackC`). Each setting includes `value`,
  `unit`, and `status: default`. These are fallbacks, not measured calibration.

U02 has no HUMAN TASK line. The actual field location, log start, calibration,
hardware work, and field collection remain for the team and their later units.

## U06 target settings and limits

`loadTargetSettings()` in `app/src/data/targets.ts` reads `targets.json` and
`limits.json`; `parseTargets` and `parseLimits` accept untrusted input and raise
`RegistryError` with the field path when it is malformed.

Each target records `horizons.center` and `horizons.site.value`. The site's
`status` applies to the physical coordinates, whose `citation` remains null
with a reason until the team supplies it. The successful Horizons recipe is
recorded in `docs/verified-facts.md`; that does not supply a site citation.

Each card channel's `status: default` applies to its D1 tolerance. `valueFile`
and `sourceId` identify scientific data, not the tolerance's provenance. All
six Shackleton references remain null with reasons. Jezero references the U07
output and the registered MEDA source; this loader validates the reference
without requiring that later output to exist or inventing its contents.

The six `card` limits and three `sunPanel` limits retain the brief's exact text,
including its Markdown citation. Tests compare them against the source document.
The Sun titles are short verbatim phrases from the corresponding team text.
