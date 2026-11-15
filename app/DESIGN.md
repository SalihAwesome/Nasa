---
name: Proving Ground
description: A readable Earth and planetary field-test workspace.
colors:
  background: "#101822"
  surface: "#182430"
  text: "#edf3fa"
  muted: "#b8c6d4"
  border: "#374957"
  accent: "#8cdbed"
  accent-soft: "#203646"
  focus: "#ffcf52"
  score-0: "#172e35"
  score-025: "#24504e"
  score-05: "#357d70"
  score-075: "#53b69a"
  score-1: "#83f1c7"
  no-score: "#6f7886"
  pod: "#66e0c2"
  satellite: "#77bbff"
  mars: "#ffaa7c"
  sun: "#ffcf52"
  sun-outline: "#ffbb45"
  sky-glow: "#162a3b"
  temperature-plot: "#0c1520"
  temperature-text: "#e0f1fa"
  temperature-grid: "#355669"
  temperature-cold: "#44baff"
  temperature-mild: "#40e5bd"
  temperature-warm: "#ff9c49"
  estimate-text: "#acd4ff"
  estimate-background: "#18334e"
  measured-text: "#96efd2"
  measured-background: "#153c31"
  simulated-text: "#ffdc8a"
  simulated-background: "#46361c"
  light-background: "#eef2f5"
  light-surface: "#ffffff"
  light-text: "#172c3c"
  light-muted: "#4e6272"
  light-border: "#bdcbd6"
  light-accent: "#14627a"
  light-accent-soft: "#dcecf2"
  light-focus: "#17654c"
  light-pod: "#17654c"
  light-satellite: "#175f9a"
  light-mars: "#984522"
  light-sun: "#986100"
  light-sun-outline: "#784500"
  light-sky-glow: "#e7edf1"
  light-temperature-plot: "#f0f4f5"
  light-temperature-text: "#253747"
  light-temperature-grid: "#81929e"
  light-temperature-cold: "#126390"
  light-temperature-mild: "#147057"
  light-temperature-warm: "#a5481c"
  light-estimate-text: "#1c5074"
  light-estimate-background: "#e1eef8"
  light-measured-text: "#14543c"
  light-measured-background: "#e1f1e6"
  light-simulated-text: "#6e480e"
  light-simulated-background: "#f8ebd2"
typography:
  headline:
    fontFamily: "'IBM Plex Sans', 'Segoe UI', system-ui, sans-serif"
    fontSize: "clamp(1.8rem, 2.6vw, 2.2rem)"
    fontWeight: 700
    lineHeight: 1.15
    letterSpacing: "-.03em"
  title:
    fontFamily: "'IBM Plex Sans', 'Segoe UI', system-ui, sans-serif"
    fontSize: "clamp(1.15rem, 1.6vw, 1.4rem)"
    fontWeight: 700
    lineHeight: 1.15
  body:
    fontFamily: "'IBM Plex Sans', 'Segoe UI', system-ui, sans-serif"
    fontSize: "1.0625rem"
    fontWeight: 400
    lineHeight: 1.6
  label:
    fontFamily: "'IBM Plex Sans', 'Segoe UI', system-ui, sans-serif"
    fontSize: "1rem"
    fontWeight: 500
  metadata:
    fontFamily: "'IBM Plex Sans', 'Segoe UI', system-ui, sans-serif"
    fontSize: "0.9375rem"
    fontWeight: 400
  data:
    fontFamily: "Consolas, monospace"
    fontSize: "1rem"
rounded:
  "small": "0.25rem"
  "panel": "1rem"
spacing:
  "1": "0.25rem"
  "2": "0.5rem"
  "3": "0.75rem"
  "4": "1rem"
  "6": "1.5rem"
  "8": "2rem"
  "12": "3rem"
  "16": "4rem"
components:
  button-primary:
    backgroundColor: "{colors.accent}"
    textColor: "{colors.background}"
    rounded: "{rounded.small}"
    padding: "0.5rem 0.75rem"
  button-primary-light:
    backgroundColor: "{colors.light-accent}"
    textColor: "{colors.light-surface}"
    rounded: "{rounded.small}"
    padding: "0.5rem 0.75rem"
  button-secondary:
    backgroundColor: "{colors.surface}"
    textColor: "{colors.text}"
    rounded: "{rounded.small}"
    padding: "0.5rem 0.75rem"
  input:
    backgroundColor: "{colors.surface}"
    textColor: "{colors.text}"
    rounded: "{rounded.small}"
    padding: "0.5rem 0.75rem"
  nav-active:
    backgroundColor: "{colors.accent-soft}"
    textColor: "{colors.text}"
    height: "64px"
    padding: "0.75rem"
  evidence-measured:
    backgroundColor: "{colors.measured-background}"
    textColor: "{colors.measured-text}"
    rounded: "{rounded.small}"
    padding: "0.25rem 0.5rem"
  panel:
    backgroundColor: "{colors.surface}"
    textColor: "{colors.text}"
    rounded: "{rounded.panel}"
    padding: "1.5rem"
---

# Design System: Proving Ground

## Overview

**Creative North Star: "The Proving Ground"**

Proving Ground is a working application for comparing Earth field-test conditions with Moon and Mars targets. The NASA Eyes reference informs the exploration canvas: dark blue ground, readable slate surfaces, bright neutral type and restrained teal actions. The light theme uses cool white surfaces with the same information hierarchy.

The interface gives the map, comparison controls and scientific evidence room to be read on a laptop or phone. Presentation choices do not change source data, scoring weights, thresholds or missing-data semantics. Product context lives in `../docs/project-brief.md` and `../docs/mission-plan.md`; measured facts live in `../docs/verified-facts.md`. This document records the implemented system, not a paused design draft.

**Key Characteristics:**
- Separate identity/actions row and five tool tabs.
- Local IBM Plex Sans, clear hierarchy and generous control targets.
- Explicit score coverage, evidence labels and missing-data reasons.
- Real Google imagery when configured; local scientific views remain available.

## Colors

Teal identifies actions and active states; blue-slate neutrals separate the workspace from its panels. The following table preserves the exact CSS token names and both theme values from `src/styles/tokens.css`. A dash means the light theme inherits the root value.

### Primary

The accent and accent-soft pair marks links, selected map modes and active navigation. Focus has a separate high-contrast color. Use the theme-specific values rather than reducing text opacity.

### Neutral

Background, surface, text, muted and border form the page hierarchy. Muted text remains readable supporting copy. The map viewport can contain a gradient for depth; that gradient is presentation, not a measurement.

### Scientific and evidence roles

The score scale increases in brightness at five equally spaced stops from 0 to 1. Missing scores use their own neutral color, distinct from zero. Pod, satellite and Mars curves keep their source identities in every view, with theme-specific contrast adjustments. Sun, temperature and evidence colors retain their existing meanings.

| CSS token | Dark / root | Light override | Role |
|---|---|---|---|
| `--color-background` | #101822 | #eef2f5 | Page ground |
| `--color-surface` | #182430 | #ffffff | Content surface |
| `--color-text` | #edf3fa | #172c3c | Primary text |
| `--color-muted` | #b8c6d4 | #4e6272 | Supporting text |
| `--color-border` | #374957 | #bdcbd6 | Dividers |
| `--color-accent` | #8cdbed | #14627a | Links and selected controls |
| `--color-accent-soft` | #203646 | #dcecf2 | Selected surface |
| `--color-focus` | #ffcf52 | #17654c | Keyboard focus |
| `--color-score-0` | #172e35 | — | Score 0 |
| `--color-score-025` | #24504e | — | Score 0.25 |
| `--color-score-05` | #357d70 | — | Score 0.5 |
| `--color-score-075` | #53b69a | — | Score 0.75 |
| `--color-score-1` | #83f1c7 | — | Score 1 |
| `--color-no-score` | #6f7886 | — | Missing score, distinct from zero |
| `--color-pod` | #66e0c2 | #17654c | Pod curve |
| `--color-satellite` | #77bbff | #175f9a | Satellite curve |
| `--color-mars` | #ffaa7c | #984522 | Mars curve |
| `--color-sun` | #ffcf52 | #986100 | Sun marker and glow |
| `--color-sun-outline` | #ffbb45 | #784500 | Sun marker edge |
| `--color-sky-glow` | #162a3b | #e7edf1 | Local sky gradient center |
| `--color-temperature-plot` | #0c1520 | #f0f4f5 | Temperature plot background |
| `--color-temperature-text` | #e0f1fa | #253747 | Temperature labels |
| `--color-temperature-grid` | #355669 | #81929e | Temperature grid |
| `--color-temperature-cold` | #44baff | #126390 | Cold curve segments |
| `--color-temperature-mild` | #40e5bd | #147057 | Mild curve segments |
| `--color-temperature-warm` | #ff9c49 | #a5481c | Warm curve segments |
| `--color-estimate-text` | #acd4ff | #1c5074 | Estimate label text |
| `--color-estimate-background` | #18334e | #e1eef8 | Estimate label surface |
| `--color-measured-text` | #96efd2 | #14543c | Measured label text |
| `--color-measured-background` | #153c31 | #e1f1e6 | Measured label surface |
| `--color-simulated-text` | #ffdc8a | #6e480e | Simulated label text |
| `--color-simulated-background` | #46361c | #f8ebd2 | Simulated label surface |

**The Evidence Rule.** Keep literal Estimate, Measured and Simulated labels visible. A label never changes missing data into data. Show a labelled score legend and the reason a score is missing; curve keys name their sources and distinguish line styles.

## Typography

IBM Plex Sans is self-hosted at `public/fonts/ibm-plex-sans.ttf` with a local `@font-face`, variable weights 100–700 and `font-display: swap`. No font service is required. Segoe UI and system sans-serif are fallbacks; Consolas supplies readings and code.

The operating hierarchy uses 17px body copy, 16px navigation and field labels, and 15px metadata at the default 16px root. Page headings use the implemented responsive clamp in the frontmatter, with 700 weight. Section headings use the smaller responsive title clamp; subheadings use `clamp(1.06rem, 1.5vw, 1.2rem)` at 600 weight and 1.25 line height. These component styles override the larger base heading token where applied.

| CSS token | Value | Role |
|---|---|---|
| `--font-body` | 'IBM Plex Sans', 'Segoe UI', system-ui, sans-serif | Interface and prose |
| `--font-heading` | var(--font-body) | Base heading family |
| `--font-data` | Consolas, monospace | Readings and code |
| `--text-small` | 0.9375rem | Metadata and evidence tags (15px) |
| `--text-label` | 1rem | Navigation and supporting labels (16px) |
| `--text-body` | 1.0625rem | Body copy (17px) |
| `--text-lead` | 1.125rem | Lead and chart labels |
| `--text-title` | 1.5rem | Base section/brand size |
| `--text-heading` | 2.5rem | Base heading size; page heading clamp overrides it |
| `--weight-regular` | 400 | Body weight |
| `--weight-medium` | 600 | Controls and subheadings |
| `--line-body` | 1.6 | Reading rhythm |
| `--line-heading` | 1.15 | Heading rhythm |

**The Reading Rule.** Preserve the distinction between body copy, navigation labels and metadata. Keep numeric comparisons aligned with tabular figures and retain visible units.

## Layout

The centered shell has a maximum width of 96rem, with 2rem horizontal padding and 1rem padding at widths up to 40rem. The header puts brand, assistant and theme controls above five equally sized tool tabs. Desktop tabs are at least 64px high and use an active underline. At 68rem and below an accessible Menu disclosure replaces the tab row; its open layout has two columns, then one column at 40rem. Menu links are at least 56px high, and Escape closes the menu and returns focus to its trigger.

The finder uses a flexible map column beside a 23–26rem ranked-results column. It stacks at 68rem. At 40rem its three-field controls stack and panels reduce padding from 1.5rem to 1rem. Comparison globes use two equal columns and stack at 55rem; comparison selectors stack at 47rem. Sun comparisons stack at 52rem. Tables retain a horizontal scrolling container when their columns need more width.

| CSS token | Value | Role |
|---|---|---|
| `--space-1` | 0.25rem | Smallest spacing |
| `--space-2` | 0.5rem | Related inline elements |
| `--space-3` | 0.75rem | Compact control padding |
| `--space-4` | 1rem | Default spacing |
| `--space-6` | 1.5rem | Groups |
| `--space-8` | 2rem | Large groups |
| `--space-12` | 3rem | Sections |
| `--space-16` | 4rem | Major separation |
| `--control-min` | 2.75rem | Minimum control height (44px) |
| `--content-max` | 96rem | Maximum shell width |
| `--reading-max` | 65ch | Default prose measure |

Default prose is limited to 65ch; the view description can extend to 85ch. Use the existing spacing rhythm to group related controls before adding a new container.

## Elevation & Depth

The workspace uses tonal surfaces and fine borders rather than a shadow vocabulary. Local globes and sky viewports supply visual depth inside their own canvas. Earth’s local texture shader has a display-only midtone lift and blue-ocean floor in finder and comparison views, with a brighter blue fallback if the texture is unavailable. Moon and Mars retain their original surface treatment. Google tiles keep their native imagery and attribution; no CSS filter or local Earth shader is applied to them.

For users who allow motion, the main view enters over 420ms with `cubic-bezier(.16,1,.3,1)` from 6px below and 0.65 opacity. Button states transition over 160ms with a 1px pressed movement. Reduced-motion preferences suppress these entry/press effects; Sun playback uses sample stepping instead of continuous playback. Camera defaults are presentation settings, not scientific parameters.

## Shapes

Small-radius controls sit within gently rounded content panels. Preserve explicit field borders and a separate visible keyboard ring.

| CSS token | Value | Role |
|---|---|---|
| `--radius-small` | 0.25rem | Controls and evidence tags |
| `--radius-panel` | 1rem | Content panels |
| `--border-width` | 1px | Dividers |
| `--focus-width` | 3px | Keyboard ring |

Desktop tabs have 8px top corners, becoming 8px on all corners in the compact menu. Ranked row links use a 6px radius. These are component values, not additional global tokens. The focus ring has a 0.25rem offset.

## Components

### Buttons and fields

Controls use the small radius, surface background, text color and a visible border. The shared minimum height is 44px, typically with 0.5rem by 0.75rem padding. Primary actions use the accent background; their text uses the page background in dark mode and the white surface in light mode. Secondary actions retain the surface fill and change border color on hover. Disabled states reduce opacity and remove the pointer cursor. All interactive elements retain the shared focus-visible ring.

### Navigation and routing

The five tools are Find test sites, Sunlight, Field measurements, Sensor pod and Compare sites. The assistant is a separate header action; the theme control remains beside it. Current-page state uses both a surface treatment and, on desktop, an underline. Keep actual links and `aria-current` semantics.

The hash remains the route source of truth: `#/map`, `#/card/...`, `#/sun`, `#/truth`, `#/live`, `#/compare` and `#/ask`. Empty hashes open the finder; unknown routes provide a recovery link. Fidelity cards keep the finder navigation active. Route changes update the document title and focus the heading. Direct links, reloads and browser back/forward work without server rewrites.

### Panels and evidence tags

Panels use the surface fill, fine border and panel radius. Finder panels use 1.5rem padding; general feature panels use `clamp(1rem, 3vw, 2rem)`. Comparison pickers share these surfaces and use responsive labelled selectors. Evidence tags use small-radius corners, 0.25rem by 0.5rem padding, metadata size and 600 weight. Keep each tag’s literal evidence text.

### Ranked results

Keep all 20 original cell links and their scores, presented as five rows per page. Each link shows rank, hemisphere coordinates, percentage and available-quantity coverage. Show quantities missing from every result once below the rows; show any row-specific missing quantities beside that row. Full missing-data reasons, defaults and limitations remain available in the details disclosure. Pagination has visible boundary-disabled states. A percentage is a match index, not a probability of mission success.

### Earth imagery and score map

With a configured Google Maps browser key, real Google satellite/hybrid tiles are the default Earth view. Satellite, 3D globe and Match colors sit in one mode-control row. Selected state uses `aria-pressed`, accent text and an accent border on the accent-soft surface. At 40rem the finder keeps all three choices in equal columns with 15px labels. Match colors opens the complete local score layer separately; satellite imagery does not claim to show the heatmap.

The optional 3D view waits for `gmp-steadychange` with `isSteady: true` before enabling camera controls. Focus, zoom and reset send complete center/range/tilt/heading camera commands together. Close terrain targets use zero relative-to-ground altitude; ranges above 1,000,000 use absolute altitude for overview. Saved/selected markers avoid duplicate pins and city-pin clutter. A failed 3D view offers Return to satellite; satellite, download and authentication failures have explicit recovery messages. Google attribution remains visible.

Without a key the original local globe and score layer render. The local globe supports drag, pinch, arrow-key rotation, bounded zoom and reset. Country labels provide geographic context, while available named-site cells open their fidelity cards. Earth comparison imagery follows the active Google/local provider; Moon and Mars stay local, and source labels reflect the provider. Synchronized sky rotation, bounded zoom, playback, fullscreen and elevation charts remain available in the Sun view.

A real key belongs only in ignored local configuration; the committed example is empty. Google imagery requires internet access and is neither cached nor redistributed by the application. See `../docs/google-earth.md` for setup and implementation behavior, and `../docs/new-design-verification.md` for completed browser verification and known local-data/backend limits.

## Do's and Don'ts

### Do:
- **Do** use the actual CSS tokens in both themes and preserve visible focus states.
- **Do** keep score, coverage, evidence labels, units and missing-data reasons readable together.
- **Do** retain all ranked cell links, map modes, source attribution and explicit recovery states.
- **Do** verify changes against the actual application at desktop and narrow widths.

### Don't:
- **Don't** change scientific values, score weights or missing-data semantics for presentation.
- **Don't** use the zero-score color for missing scores or color alone to name a curve.
- **Don't** filter Google imagery, obscure its attribution or present satellite tiles as the score layer.
- **Don't** commit a real browser key or require a font service for interface type.

`npm test -- src/shell.test.tsx --reporter=verbose` checks that every CSS token documented here exists and verifies base text/background contrast of at least 4.5:1. Full implementation checks and the completed browser-width matrix are recorded in `../docs/new-design-verification.md`; this documentation merge does not substitute for those checks.
