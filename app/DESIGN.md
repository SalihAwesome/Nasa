# Proving Ground design system

This local redesign follows the team's NASA Eyes reference and preserves the
existing evidence, calculations and routes. It is a review preview, not a
published release.

## Use scene and direction

A dark exploration workspace for the team comparing Earth and planetary test
conditions on a laptop or phone. Near-black canvas, slate panels, bright neutral
text, teal actions and a warm yellow Sun. The sky comparison is the main visual
experience, with synchronized rotation, bounded zoom, playback and a full-screen
mode. Elevation charts remain available. Sources stay in expandable disclosures.

The current implementation uses system sans-serif type for compact, readable
controls and headings. No new packages or external assets are required. The
gradient in the sky viewport gives the geometry depth and is not scientific data.

These are presentation choices, not scientific values, scores or thresholds.
Use the shared tokens below across all routes. Keep evidence labels visible and
never replace missing values with decorative data.

## Color tokens

| Token | Value | Role |
|---|---|---|
| `--color-background` | #080c12 | Page ground |
| `--color-surface` | #111923 | Content surface |
| `--color-text` | #edf3fa | Primary text |
| `--color-muted` | #a9b9cb | Secondary text, never lower opacity |
| `--color-border` | #344354 | Decorative dividers |
| `--color-accent` | #66e0c2 | Links and active navigation |
| `--color-accent-soft` | #163730 | Active navigation background |
| `--color-focus` | #ffcf52 | Keyboard focus |
| `--color-score-0` | #172e35 | Score 0 |
| `--color-score-025` | #24504e | Score 0.25 |
| `--color-score-05` | #357d70 | Score 0.5 |
| `--color-score-075` | #53b69a | Score 0.75 |
| `--color-score-1` | #83f1c7 | Score 1 |
| `--color-no-score` | #6f7886 | Missing score, separate from zero |
| `--color-pod` | #66e0c2 | Pod curve |
| `--color-satellite` | #77bbff | Satellite curve |
| `--color-mars` | #ffaa7c | Mars curve |
| `--color-sun` | #ffcf52 | Current Sun marker and glow |
| `--color-sun-outline` | #ffbb45 | Sun marker edge |
| `--color-sky-glow` | #162a3b | Center of the sky viewport gradient |
| `--color-temperature-plot` | #0c1520 | Ground temperature plot background |
| `--color-temperature-text` | #e0f1fa | Plot labels and series keys |
| `--color-temperature-grid` | #355669 | Plot grid |
| `--color-temperature-cold` | #44baff | Cold curve segments |
| `--color-temperature-mild` | #40e5bd | Mild curve segments |
| `--color-temperature-warm` | #ff9c49 | Warm curve segments |
| `--color-estimate-text` | #acd4ff | Estimate label text |
| `--color-estimate-background` | #18334e | Estimate label surface |
| `--color-measured-text` | #96efd2 | Measured label text |
| `--color-measured-background` | #153c31 | Measured label surface |
| `--color-simulated-text` | #ffdc8a | Simulated label text |
| `--color-simulated-background` | #46361c | Simulated label surface |

The score scale increases in brightness, with equally spaced stops from 0 to 1.
Later map units may interpolate the stops; missing scores must not use the zero
color. Always show a labelled legend and the reason for a missing score. Never
use color alone: curve legends must name their sources and distinguish line
styles. Pod, satellite and Mars retain their colors across all views. Sun and field charts use the existing pipeline data or explicitly labelled simulations.

## Type and spacing

| Token | Value | Role |
|---|---|---|
| `--font-body` | 'Segoe UI', system-ui, sans-serif | Interface and prose |
| `--font-heading` | 'Segoe UI', system-ui, sans-serif | View heading and wordmark |
| `--font-data` | Consolas, monospace | Readings and code |
| `--text-small` | 0.8125rem | Tags and brand description |
| `--text-label` | 0.875rem | Supporting labels |
| `--text-body` | 1rem | Body text and navigation |
| `--text-lead` | 1.125rem | View purpose |
| `--text-title` | 1.5rem | Section heading and brand |
| `--text-heading` | 2.5rem | View heading |
| `--weight-regular` | 400 | Body text |
| `--weight-medium` | 600 | Controls and section headings |
| `--line-body` | 1.6 | Reading rhythm |
| `--line-heading` | 1.15 | Heading rhythm |
| `--space-1` | 0.25rem | Smallest spacing |
| `--space-2` | 0.5rem | Related inline elements |
| `--space-3` | 0.75rem | Compact control padding |
| `--space-4` | 1rem | Default spacing |
| `--space-6` | 1.5rem | Groups |
| `--space-8` | 2rem | Large groups |
| `--space-12` | 3rem | Sections |
| `--space-16` | 4rem | Reserved major separation |
| `--radius-small` | 0.25rem | Controls and tags |
| `--radius-panel` | 0.75rem | Content panel |
| `--border-width` | 1px | Dividers |
| `--focus-width` | 3px | Focus ring |
| `--control-min` | 2.75rem | Minimum control height |
| `--content-max` | 96rem | Maximum content width |
| `--reading-max` | 65ch | Maximum prose measure |

Fonts are local fallbacks, so the shell does not need a font service or network
access. Navigation uses a compact desktop row and two mobile columns. Sun comparisons
stack below 52rem. Use visible focus rings and actual links. Motion follows user
input; reduced motion uses sample stepping instead of continuous playback.

## Routes and integration

The hash is the source of truth. Direct links, reloads and browser back/forward
work without a routing package or server rewrites. The empty hash opens the site
finder. Unrecognised routes show an explicit recovery link.

| Route | Heading |
|---|---|
| `#/map` | Site finder |
| `#/card/...` | Fidelity card |
| `#/sun` | Sun panel |
| `#/truth` | Ground truth |
| `#/live` | Live panel |

The card is a detail view of the site finder and keeps its navigation item active.
The map supplies links to scored land-cell cards. Route changes update the document title and focus the heading.
Site finder shows the score layer on a rotatable orthographic Earth. Drag or
use the arrow keys to rotate; pinch or use the zoom controls for a closer view.
Natural Earth country names and verified analog site names orient the viewer.
Country labels are geographic context. A named site opens its existing land
cell card when the corresponding grid cell is available.

Use `.evidence-tag` with `.evidence-tag--estimate`, `.evidence-tag--measured` or
`.evidence-tag--simulated`. Keep the literal tag text visible. A label never
changes missing data into data. This unit's evidence key documents the styles.

## Verification

`npm test -- src/shell.test.tsx --reporter=verbose` renders each route with React,
checks that every token named here exists in the CSS, and calculates the text to
background contrast. The requirement is at least 4.5:1. Full validation also runs
`npm test`, `npm run build` and the pipeline's `python -m pytest`.
