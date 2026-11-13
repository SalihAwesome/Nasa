# Proving Ground design system

U28 provides the app shell, route placeholders and reusable tokens. It does not
implement the map, card calculations, Sun plots, field curves or pod connection.
View names and purposes come from `docs/mission-plan.md`; hash routes and scope
come from U28 in `docs/software-plan.md`.

## Use scene and direction

This is an operating interface for a student team inspecting evidence, including
outdoors beside a sensor pod. Use a light paper background, dark green ink, a
restrained serif heading and plain sans-serif controls. There is no marketing
hero, decorative photography or animation. The empty panels explicitly say that
their functionality is not available yet. The footer is a label key, not evidence
that any data has been loaded.

These are presentation choices, not scientific values, scores, thresholds or
measured data. No scientific DEFAULT from the plan is consumed by this unit.
Future screens must use these tokens rather than introduce their own colors or
font sizes. Keep the token table and CSS in sync.

## Color tokens

| Token | Value | Role |
|---|---|---|
| `--color-background` | #f5f4ee | Page ground |
| `--color-surface` | #ffffff | Content surface |
| `--color-text` | #203b36 | Primary text |
| `--color-muted` | #52645e | Secondary text, never lower opacity |
| `--color-border` | #cbd3cc | Decorative dividers |
| `--color-accent` | #176957 | Links and active navigation |
| `--color-accent-soft` | #e0ede6 | Active navigation background |
| `--color-focus` | #974524 | Keyboard focus |
| `--color-score-0` | #f0f5e5 | Score 0 |
| `--color-score-025` | #c4dfc2 | Score 0.25 |
| `--color-score-05` | #80baa1 | Score 0.5 |
| `--color-score-075` | #3d8b78 | Score 0.75 |
| `--color-score-1` | #155849 | Score 1 |
| `--color-no-score` | #777b78 | Missing score, separate from zero |
| `--color-pod` | #176957 | Pod curve |
| `--color-satellite` | #285f9c | Satellite curve |
| `--color-mars` | #a04423 | Mars curve |
| `--color-estimate-text` | #234d7a | Estimate label text |
| `--color-estimate-background` | #e4eef8 | Estimate label surface |
| `--color-measured-text` | #175642 | Measured label text |
| `--color-measured-background` | #e0eee4 | Measured label surface |
| `--color-simulated-text` | #744b13 | Simulated label text |
| `--color-simulated-background` | #fff0cc | Simulated label surface |

The score scale increases in darkness, with equally spaced stops from 0 to 1.
Later map units may interpolate the stops; missing scores must not use the zero
color. Always show a labelled legend and the reason for a missing score. Never
use color alone: curve legends must name their sources and distinguish line
styles. Pod, satellite and Mars retain their colors across all views. Chart
implementation belongs to later units; this shell contains no fabricated curves.

## Type and spacing

| Token | Value | Role |
|---|---|---|
| `--font-body` | 'Segoe UI', system-ui, sans-serif | Interface and prose |
| `--font-heading` | Georgia, 'Times New Roman', serif | View heading and wordmark |
| `--font-data` | Consolas, monospace | Future readings and code |
| `--text-small` | 0.8125rem | Tags and brand description |
| `--text-label` | 0.875rem | Supporting labels |
| `--text-body` | 1rem | Body text and navigation |
| `--text-lead` | 1.125rem | View purpose |
| `--text-title` | 1.5rem | Section heading and brand |
| `--text-heading` | 2.5rem | View heading |
| `--weight-regular` | 400 | Body and serif headings |
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
| `--content-max` | 75rem | Maximum content width |
| `--reading-max` | 65ch | Maximum prose measure |

Fonts are local fallbacks, so the shell does not need a font service or network
access. The single layout breakpoint at 40rem switches navigation to two columns;
it is a layout rule, not another type scale. Use visible focus rings and actual
links. Avoid animation in this foundation.

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
A future map unit supplies real site-card links. U28 does not invent a site id in
the interface. Route changes update the document title and focus the heading.

Use `.evidence-tag` with `.evidence-tag--estimate`, `.evidence-tag--measured` or
`.evidence-tag--simulated`. Keep the literal tag text visible. A label never
changes missing data into data. This unit's evidence key documents the styles.

## Verification

`npm test -- src/shell.test.tsx --reporter=verbose` renders each route with React,
checks that every token named here exists in the CSS, and calculates the text to
background contrast. The requirement is at least 4.5:1. Full validation also runs
`npm test`, `npm run build` and the pipeline's `python -m pytest`.
