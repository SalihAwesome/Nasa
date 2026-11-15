---
name: Tayf
description: A framed scientific workspace that ranks Earth field-test sites for Moon and Mars equipment.
colors:
  frame: "#eef2f5"
  background: "#ffffff"
  surface: "#ffffff"
  text: "#131416"
  muted: "#555b62"
  accent: "#1b6c80"
  primary: "#16181b"
typography:
  body:
    fontFamily: "IBM Plex Sans, Segoe UI, system-ui, sans-serif"
    fontSize: "0.9375rem"
    lineHeight: 1.55
  data:
    fontFamily: "IBM Plex Mono, Consolas, monospace"
rounded:
  control: "0.375rem"
  panel: "0.625rem"
  sheet: "1rem"
---

# Design system: Tayf

## Name and mark

Tayf means "spectrum" in Arabic and Turkish. The site-match score is drawn as a five-stop spectrum, from deep blue at 0% to yellow at 100%. The mark is a planet disc seen through those same five bands. `src/TayfMark.tsx` and `public/favicon.svg` draw it. The band colours match `--color-score-0` to `--color-score-1`.

## Direction

The app is a working tool for engineers and mission planners. There is no marketing screen between them and the tools. Product context is in `../PRODUCT.md`. Scientific requirements are in `../docs/mission-plan.md` and `../docs/project-brief.md`.

The layout follows the "framed sheet" app style from the `design-taste-frontend` skill (seed 1044715931). One tinted frame holds the sidebar and the top bar, with no rule between them. The work sits on a white sheet, inset 8px from the window's right and bottom edges, with a 1px edge, 16px corners and no shadow. The frame tint is a cool blue-grey taken from the sky. Colour goes on data. The chrome stays grey, and the one primary action per view is near-black.

The light theme is the default. A saved dark preference is applied in the HTML head before React paints. The dark theme uses true neutral greys, not navy. Globe and planet canvases keep a dark ground in both themes.

## Layout and navigation

Desktop uses a fixed 240px sidebar and a 56px sticky top bar on the frame. The sheet content has a 1560px maximum width and 36px side padding. The sidebar holds the mark, the five tools and their icons. The current tool sits on a neutral pill that slides between items. The top bar holds the breadcrumb, Ask Tayf and the theme switch.

At 1088px and below, the frame folds into a top bar and the sheet becomes the screen. A Menu button opens the navigation as a grid of 48px rows. Opening the menu focuses a navigation link. Escape closes it and restores focus to the trigger. Route changes move focus to the page heading. The skip link stays the first keyboard target.

The site finder groups target, equipment test and month in one form panel. The globe sits beside the ranked list, and the columns stack at 960px. Each ranked row shows the rank, the nearest mapped place, its distance, the coordinates, the score, the quantity coverage and a score track. The place name identifies the nearest mapped place only. It does not rename the grid cell or claim that the place has that score.

## Typography

IBM Plex Sans is self-hosted from `public/fonts`. IBM Plex Mono comes from `@fontsource/ibm-plex-mono` and is used for instrument readings only. Page titles are 26px (22px on phones), section titles 17px, body copy 15px, labels 14px and metadata 13px. Navigation stays at 16px. Figures in tables and readouts use tabular numerals.

## Tokens

`src/styles/tokens.css` is authoritative. "same" means the dark theme keeps the root value.

| Color token | Light (root) | Dark |
|---|---|---|
| `--color-frame` | #eef2f5 | #0a0b0c |
| `--color-background` | #ffffff | #111214 |
| `--color-surface` | #ffffff | #16181a |
| `--color-surface-subtle` | #f4f6f8 | #1c1e21 |
| `--color-active` | #e2e8ed | #24272b |
| `--color-text` | #131416 | #f1f3f4 |
| `--color-muted` | #555b62 | #a8aeb5 |
| `--color-border` | #e3e7eb | #25282c |
| `--color-control` | #c9cfd5 | #3a3e44 |
| `--color-accent` | #1b6c80 | #72c6d8 |
| `--color-accent-soft` | #e5f0f3 | #142a30 |
| `--color-sidebar` | #eef2f5 | #0a0b0c |
| `--color-primary` | #16181b | #f1f3f4 |
| `--color-on-primary` | #ffffff | #111214 |
| `--color-on-accent` | #ffffff | #0a1d22 |
| `--color-focus` | #1b6c80 | #8ed7e6 |
| `--color-map-ground` | #0d1013 | same |
| `--color-on-map` | #e6ebef | same |
| `--color-score-0` | #1b2a4a | same |
| `--color-score-025` | #1f5a78 | same |
| `--color-score-05` | #23897f | same |
| `--color-score-075` | #7dbb6f | same |
| `--color-score-1` | #f1df6a | same |
| `--color-no-score` | #7d838b | same |
| `--color-pod` | #17725a | #5fd3b0 |
| `--color-satellite` | #1f5fa6 | #7eb6f2 |
| `--color-mars` | #a5481c | #f2a27a |
| `--color-sun` | #9a6200 | #f5c451 |
| `--color-sun-outline` | #7a4700 | #f0ac3c |
| `--color-sky-glow` | #eef2f5 | #1a1d21 |
| `--color-temperature-plot` | #f4f6f8 | #0f1113 |
| `--color-temperature-text` | #232a31 | #e3e8ec |
| `--color-temperature-grid` | #8a949d | #3d444b |
| `--color-temperature-cold` | #126390 | #5bb8f0 |
| `--color-temperature-mild` | #147057 | #4fd6b2 |
| `--color-temperature-warm` | #a5481c | #f39a55 |
| `--color-estimate-text` | #1c4f78 | #a9d0f7 |
| `--color-estimate-background` | #e3eef8 | #172636 |
| `--color-measured-text` | #13533b | #95e6c8 |
| `--color-measured-background` | #ddf2e6 | #13291f |
| `--color-simulated-text` | #6e480e | #f6d58a |
| `--color-simulated-background` | #f9ecd3 | #2f2615 |

| Interface token | Value |
|---|---|
| `--font-body` | 'IBM Plex Sans', 'Segoe UI', system-ui, sans-serif |
| `--font-heading` | var(--font-body) |
| `--font-data` | 'IBM Plex Mono', Consolas, monospace |
| `--text-small` | 0.8125rem |
| `--text-label` | 0.875rem |
| `--text-navigation` | 1rem |
| `--text-body` | 0.9375rem |
| `--text-lead` | 1.0625rem |
| `--text-title` | 1.25rem |
| `--text-heading` | 1.625rem |
| `--weight-regular` | 400 |
| `--weight-medium` | 600 |
| `--line-body` | 1.55 |
| `--line-heading` | 1.2 |
| `--space-1` | 0.25rem |
| `--space-2` | 0.5rem |
| `--space-3` | 0.75rem |
| `--space-4` | 1rem |
| `--space-6` | 1.5rem |
| `--space-8` | 2rem |
| `--space-12` | 3rem |
| `--space-16` | 4rem |
| `--radius-small` | 0.375rem |
| `--radius-panel` | 0.625rem |
| `--radius-sheet` | 1rem |
| `--border-width` | 1px |
| `--focus-width` | 2px |
| `--control-min` | 2.75rem |
| `--content-max` | 96rem |
| `--reading-max` | 68ch |
| `--sidebar-width` | 15rem |
| `--topbar-height` | 3.5rem |
| `--sheet-inset` | 0.5rem |
| `--ease-out` | cubic-bezier(0.23, 1, 0.32, 1) |
| `--z-navigation` | 20 |
| `--z-skip-link` | 30 |
The estimate, measured and simulated pairs keep their literal labels. Grey score cells mean unavailable data, not a zero match. `--color-map-ground` stays dark in both themes. Never filter Google imagery or hide provider attribution.

## Components

`src/styles/components.css` gives every tool one control vocabulary: buttons, selects, text inputs and file inputs share a 1px control border, a 6px radius and a 150ms colour transition. A pressed toggle takes the neutral active fill and an ink edge. `.feature-primary`, `.sun-primary` and the live connect button are the near-black primary. Panels share one border, a 10px radius and no shadow. Tool-specific styles keep their own variants because the shared selectors stay at low specificity.

## Interaction and motion

Motion is feedback only. Buttons scale to 0.97 on press. The navigation pill moves with a short spring from the `motion` library, and the theme icon rotates between sun and moon in 200ms. Hover styles apply only on devices with a fine pointer. The mobile menu fades in with `@starting-style`. Reduced-motion preferences turn off every interface transition, and `MotionConfig reducedMotion="user"` does the same for the `motion` animations.

## Implementation and verification

`src/styles/shell.css` owns the frame. `src/styles/components.css` owns shared controls and panels. `src/map/map.css` owns the finder. Other feature styles use the same tokens. Lucide React supplies the interface icons, and its license is in `public/lucide-LICENSE.txt`.

Scoring functions, weights, thresholds, units, missing values, data files and sensor workflows are unchanged by the design.
