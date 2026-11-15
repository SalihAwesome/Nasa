---
name: Proving Ground
description: A clear mission-planning workspace for comparing Earth, Moon and Mars conditions.
colors:
  background: "#f4f7f7"
  surface: "#ffffff"
  text: "#1c3237"
  accent: "#176653"
typography:
  body:
    fontFamily: "IBM Plex Sans, Segoe UI, system-ui, sans-serif"
    fontSize: "0.9375rem"
    lineHeight: 1.6
rounded:
  control: "0.5rem"
  panel: "0.75rem"
---

# Design system: Proving Ground

## Direction

A mission planner uses a laptop in a bright project room to compare potential field sites; a colleague opens the same tools on a phone outdoors. Light surfaces keep controls and evidence readable in those settings. The existing teal identity carries actions and selection, while the scientific globe keeps its own dark canvas. A saved dark-theme preference is respected.

The reference is Croptions' planning flow: clear inputs, geography, then an inspectable result. This is the working application. There is no marketing screen between the planner and the tools. Product context is in `../PRODUCT.md`; scientific requirements remain in `../docs/mission-plan.md` and `../docs/project-brief.md`.

## Layout and navigation

Desktop uses a fixed 244px sidebar, a 76px workspace toolbar, and a content area with 36px gutters. Five tools remain available through their original hash routes. The assistant and theme control live in the toolbar. At 1088px and below, the sidebar becomes a compact brand header and a Menu disclosure. Opening the menu focuses a navigation link; Escape closes it and restores focus to the trigger. Route changes focus the page heading. The skip link remains the first keyboard target.

The finder groups target, equipment test and month in one form surface. A large map sits beside ranked results; the columns stack at 960px. The form stacks at 640px. Every ranked grid cell keeps its original link, percentage and quantity coverage. Five results appear per page. A place name identifies the nearest mapped place, with its distance shown explicitly; it does not rename the grid cell or imply that the named place has that score. Coordinates identify the actual result. Score tracks repeat the existing numeric index visually.

Panels use a fine border, a 12px corner radius and no drop shadow. The map, ranked list and control group each have a distinct job. Source notes, missing-value explanations, evidence labels and the distinction between a match index and a probability remain available. Globe keyboard help uses a native disclosure. Google source attribution is unchanged.

## Typography

Keep the self-hosted variable IBM Plex Sans, with Segoe UI and system sans-serif as fallbacks. No font service is needed. Body copy is 15px, field and result labels 14px, metadata 13px, navigation 16px, section titles 18px and page titles 32px (28px on phones). Use weight and spacing for hierarchy. Use the existing monospace family for instrument readings. Headings balance; prose wraps prettily. No decorative display type is used in controls.

## Tokens

`src/styles/tokens.css` is authoritative. The score palette and scientific series colors retain their source identities. A dash means the light theme inherits the root value.

| Color token | Dark / root | Light |
|---|---|---|
| `--color-background` | #101c20 | #f4f7f7 |
| `--color-surface` | #18282d | #ffffff |
| `--color-text` | #edf4f3 | #1c3237 |
| `--color-muted` | #b2c4c5 | #53696e |
| `--color-border` | #35494e | #d9e3e4 |
| `--color-accent` | #87dcc6 | #176653 |
| `--color-accent-soft` | #203e3b | #e4f1eb |
| `--color-sidebar` | #142328 | #ffffff |
| `--color-surface-subtle` | #1c3035 | #f0f5f4 |
| `--color-map-ground` | #0c1b24 | — |
| `--color-on-map` | #d9e7ed | — |
| `--color-on-accent` | #102b24 | #ffffff |
| `--color-focus` | #ffcf52 | #17654c |
| `--color-score-0` | #172e35 | — |
| `--color-score-025` | #24504e | — |
| `--color-score-05` | #357d70 | — |
| `--color-score-075` | #53b69a | — |
| `--color-score-1` | #83f1c7 | — |
| `--color-no-score` | #6f7886 | — |
| `--color-pod` | #66e0c2 | #17654c |
| `--color-satellite` | #77bbff | #175f9a |
| `--color-mars` | #ffaa7c | #984522 |
| `--color-sun` | #ffcf52 | #986100 |
| `--color-sun-outline` | #ffbb45 | #784500 |
| `--color-sky-glow` | #162a3b | #e7edf1 |
| `--color-temperature-plot` | #0c1520 | #f0f4f5 |
| `--color-temperature-text` | #e0f1fa | #253747 |
| `--color-temperature-grid` | #355669 | #81929e |
| `--color-temperature-cold` | #44baff | #126390 |
| `--color-temperature-mild` | #40e5bd | #147057 |
| `--color-temperature-warm` | #ff9c49 | #a5481c |
| `--color-estimate-text` | #acd4ff | #1c5074 |
| `--color-estimate-background` | #18334e | #e1eef8 |
| `--color-measured-text` | #96efd2 | #14543c |
| `--color-measured-background` | #153c31 | #e1f1e6 |
| `--color-simulated-text` | #ffdc8a | #6e480e |
| `--color-simulated-background` | #46361c | #f8ebd2 |

The estimate, measured and simulated pairs retain literal labels. Grey score cells mean unavailable data, not a zero match. `--color-on-accent` supplies primary-button and brand-mark text independently of the page background. `--color-map-ground` stays dark in both themes. Never filter Google imagery or obscure provider attribution.

| Interface token | Value |
|---|---|
| `--font-body` | 'IBM Plex Sans', 'Segoe UI', system-ui, sans-serif |
| `--font-heading` | var(--font-body) |
| `--font-data` | Consolas, monospace |
| `--text-small` | 0.8125rem |
| `--text-label` | 0.875rem |
| `--text-navigation` | 1rem |
| `--text-body` | 0.9375rem |
| `--text-lead` | 1.125rem |
| `--text-title` | 1.5rem |
| `--text-heading` | 2rem |
| `--weight-regular` | 400 |
| `--weight-medium` | 600 |
| `--line-body` | 1.6 |
| `--line-heading` | 1.15 |
| `--space-1` | 0.25rem |
| `--space-2` | 0.5rem |
| `--space-3` | 0.75rem |
| `--space-4` | 1rem |
| `--space-6` | 1.5rem |
| `--space-8` | 2rem |
| `--space-12` | 3rem |
| `--space-16` | 4rem |
| `--radius-small` | 0.5rem |
| `--radius-panel` | 0.75rem |
| `--border-width` | 1px |
| `--focus-width` | 3px |
| `--control-min` | 2.75rem |
| `--content-max` | 96rem |
| `--reading-max` | 65ch |
| `--sidebar-width` | 15.25rem |
| `--z-navigation` | 20 |
| `--z-skip-link` | 30 |

## Interaction and motion

Native selects, range inputs, buttons, links and details provide familiar keyboard behavior. Keep 44px minimum targets, visible focus rings, disabled pagination boundaries and recoverable loading/error states. The saved theme is applied in the HTML head before React paints.

State transitions last 180ms. Hover movement is limited to small directional arrows. There is no page-entry choreography or continuous decorative animation. Reduced-motion preferences disable interface animations and transitions; the existing scientific playback controls retain their own reduced-motion behavior.

## Implementation and verification

`src/styles/shell.css` owns the application shell and shared primitives; `src/map/map.css` owns finder layout; existing feature styles use the same tokens. Lucide React supplies consistent interface icons and the orbit favicon. Its installed license is included in `public/lucide-LICENSE.txt`.

The offline globe remains the default. The existing opt-in Google build, local source files, scoring functions, weights, thresholds, units, missing values and sensor workflows are unchanged. Hardware connections and remote Google services are outside this visual change's smoke check.

Design sources: installed Impeccable v3.9.1 (product register), Taste's `design-taste-frontend` guidance, and the Croptions reference supplied by the owner. Taste's full-screen marketing templates and extensive finish-gate suite are not used for this working scientific interface; the owner requested only small necessary checks. No reference-site assets or copy are redistributed.
