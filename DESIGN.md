---
name: Vanguard AV web app
description: Proposed dark workspace design system, grounded in the Vanguard AV public website.
colors:
  # Core brand palette from the public homepage.
  primary: "#1c7304"
  brand-highlight: "#2ea309"
  canvas: "#08080a"
  surface: "#111411"
  surface-raised: "#161a16"
  text: "#e2ebe0"
  on-primary: "#ffffff"
  # Supporting workspace colors.
  surface-hover: "#202820"
  surface-selected: "#203521"
  border-subtle: "#243024"
  border-control: "#708070"
  text-muted: "#a1afa0"
  primary-hover: "#237f08"
  primary-pressed: "#175e05"
  accent-text: "#8cdb78"
  positive: "#72d6af"
  positive-bg: "#153127"
  caution: "#f2c66b"
  caution-bg: "#382b14"
  danger: "#ff9d9d"
  danger-bg: "#3b2023"
  info: "#92baf6"
  info-bg: "#1c2c46"
typography:
  page-title:
    fontFamily: "Outfit, ui-sans-serif, system-ui, sans-serif"
    fontSize: "1.75rem"
    fontWeight: 700
    lineHeight: "2.125rem"
    letterSpacing: "-0.02em"
  page-title-wide:
    fontFamily: "Outfit, ui-sans-serif, system-ui, sans-serif"
    fontSize: "2rem"
    fontWeight: 700
    lineHeight: "2.5rem"
    letterSpacing: "-0.02em"
  section-title:
    fontFamily: "Outfit, ui-sans-serif, system-ui, sans-serif"
    fontSize: "1.5rem"
    fontWeight: 600
    lineHeight: "2rem"
  panel-title:
    fontFamily: "Outfit, ui-sans-serif, system-ui, sans-serif"
    fontSize: "1.125rem"
    fontWeight: 600
    lineHeight: "1.5rem"
  body:
    fontFamily: "Outfit, ui-sans-serif, system-ui, sans-serif"
    fontSize: "1rem"
    fontWeight: 400
    lineHeight: "1.5rem"
  compact:
    fontFamily: "Outfit, ui-sans-serif, system-ui, sans-serif"
    fontSize: "0.875rem"
    fontWeight: 400
    lineHeight: "1.25rem"
  label:
    fontFamily: "Outfit, ui-sans-serif, system-ui, sans-serif"
    fontSize: "0.875rem"
    fontWeight: 600
    lineHeight: "1.25rem"
  metadata:
    fontFamily: "Outfit, ui-sans-serif, system-ui, sans-serif"
    fontSize: "0.75rem"
    fontWeight: 500
    lineHeight: "1rem"
  code:
    fontFamily: "JetBrains Mono, ui-monospace, monospace"
    fontSize: "0.8125rem"
    fontWeight: 400
    lineHeight: "1.25rem"
rounded:
  control-small: "8px"
  control: "12px"
  panel: "12px"
  overlay: "16px"
  pill: "999px"
spacing:
  space-1: "0.25rem"
  space-2: "0.5rem"
  space-3: "0.75rem"
  space-4: "1rem"
  space-5: "1.25rem"
  space-6: "1.5rem"
  space-8: "2rem"
  space-10: "2.5rem"
  space-12: "3rem"
  space-16: "4rem"
components:
  button-primary:
    backgroundColor: "{colors.primary}"
    textColor: "{colors.on-primary}"
    typography: "{typography.label}"
    rounded: "{rounded.control}"
    padding: "0.625rem 1rem"
    height: "2.75rem"
  button-primary-hover:
    backgroundColor: "{colors.primary-hover}"
  button-primary-pressed:
    backgroundColor: "{colors.primary-pressed}"
  button-secondary:
    backgroundColor: "{colors.surface}"
    textColor: "{colors.text}"
    typography: "{typography.label}"
    rounded: "{rounded.control}"
    padding: "0.625rem 1rem"
    height: "2.75rem"
  field:
    backgroundColor: "{colors.canvas}"
    textColor: "{colors.text}"
    typography: "{typography.body}"
    rounded: "{rounded.control}"
    padding: "0.5rem 0.75rem"
    height: "2.75rem"
  panel:
    backgroundColor: "{colors.surface}"
    textColor: "{colors.text}"
    rounded: "{rounded.panel}"
    padding: "1rem"
  badge-review:
    backgroundColor: "{colors.caution-bg}"
    textColor: "{colors.caution}"
    typography: "{typography.metadata}"
    rounded: "{rounded.pill}"
    padding: "0.25rem 0.5rem"
  navigation-current:
    backgroundColor: "{colors.surface-selected}"
    textColor: "{colors.text}"
    typography: "{typography.label}"
    rounded: "{rounded.control-small}"
    padding: "0.5rem 0.75rem"
    height: "2.75rem"
---

# Vanguard AV design system

## Overview

This is the design reference for the Vanguard AV scanning workspace (`/features` and `/features/{url,email,sms,office,pdf,exe}`). The workspace uses a dedicated self-contained shell (`WorkspaceShell`: persistent `15rem` grouped left rail on desktop, compact `56px` sticky mobile header with an accessible `radix-ui` `Dialog` drawer and `<noscript><details>` fallback, and quiet Home/Contact footer links), an above-the-fold single-item `ImmediateTriageWorkbench` with bounded non-decompressing content-signature verification and transient single-consume in-memory handoff, and a domain-grouped `FeatureHubDirectory` — keeping the public marketing homepage (`/`) untouched. The `.impeccable/design.json` sidecar previews representative components; neither file applies styles to the running app.

The workspace inherits the Vanguard helmet and wordmark, green-black surfaces, and Outfit typography. It uses quiet panels and a clear reading order so people can find the scan action, understand a verdict, and see what to do next.

### Public website reference

The [public marketing site](https://www.vanguard-av.net/) is a separate implementation. The [production stylesheet](https://www.vanguard-av.net/assets/root-W6D8ZvvC.css) and the existing audit at `docs/website/DESIGN.md` describe its shipped design. The audit has the full token table, computed layouts, theme overrides, transitions, and links to the section and asset inventories. The comparison below records the main differences.

| Area | Observed public website | Proposed web app |
| --- | --- | --- |
| Brand | Dark green-black palette, green CTA, helmet and knight imagery | Shared brand baseline; quieter treatment around forms and findings |
| Typography | Outfit for body and controls, Gargoyles for decorative section titles, JetBrains Mono declared for code | Outfit for app headings too; JetBrains Mono for technical evidence |
| Width | Centered container with a base `clamp(300px, 92vw, 1100px)` cap and breakpoint overrides; effective caps include 750px at 768px, 1100px at 1440px, and 1500px from 1600px | Three content caps inside the workspace; independent from the marketing grid |
| Shape and depth | 8px, 12px, and 20px shared radii; thin borders, green glows, blur, and image overlays | 8–16px control and overlay radii; solid surfaces and visible control boundaries |
| Themes and motion | Dark default, CSS light overrides without a visible theme switch, animated section reveals and card tracks | Dark baseline for the first release; short state feedback and reduced-motion fallbacks |

## Colors

### Core brand palette

Use the public homepage hero as the visual reference. Carry its green action fill, brighter green headline highlight, dark green-black surfaces, and light text into Vanguard brand work. The headline highlight uses the middle color of the site's animated green accent. The honeycomb and glow use layered variations of the palette. [Homepage](https://www.vanguard-av.net/) · [Deployed stylesheet](https://www.vanguard-av.net/assets/root-W6D8ZvvC.css) · [Hero styles](https://www.vanguard-av.net/assets/home-CNdp6dFv.js)

| Token | Brand role |
| --- | --- |
| `primary` | Vanguard green for the principal action, as seen on Get Vanguard. |
| `brand-highlight` | Brighter green for display highlights and brand artwork, as seen on “Frontier.” |
| `canvas` | Charcoal base. |
| `surface` / `surface-raised` | Dark green surface steps for panels and floating surfaces. |
| `text` / `on-primary` | Green-tinted off-white for main text, and pure white for primary button labels and hero display text. |

### Workspace supporting colors

| Token | Use |
| --- | --- |
| `surface-hover` / `surface-selected` | Hover on neutral interactive surfaces / persistent current or selected state. Also show selection through text, an icon, or an indicator. |
| `border-subtle` / `border-control` | Decorative separators and passive panel outlines / visible boundaries for inputs, outlined actions, and toggles. |
| `text-muted` | Helper text, secondary labels, metadata, and placeholders. Give each input a visible label. |
| `primary-hover` / `primary-pressed` | Workspace interaction shades for the brand action fill. Both use `on-primary` for their labels. |
| `accent-text` | Inline links, focus rings, and selection indicators on dark surfaces. Underline inline links within prose. |

Use status tones only with a visible label and, where helpful, a distinct icon. Keep **verdict**, **scan progress**, and **coverage** separate. A completed scan can return a risky verdict or partial coverage.

| Tone | Token pair | Example |
| --- | --- | --- |
| Neutral | `text-muted` on `surface-raised` | Not run, unavailable, no outcome yet |
| Informational | `info` on `info-bg` | Queued or scanning |
| Positive | `positive` on `positive-bg` | “No threats detected” when supported for the checks that ran |
| Caution | `caution` on `caution-bg` | “Needs review” or a separately labelled partial-coverage notice |
| Danger | `danger` on `danger-bg` | “Threat detected” or a separately labelled execution or validation error |

**The action and verdict rule.** The primary green fill identifies the main action. A scan outcome has its own text and tone, even when the outcome is favorable.

The default palette is dark. A future light theme needs its own complete set of surfaces, foregrounds, and state pairs; the public site's light overrides are reference material. Meet [WCAG 2.2 AA](https://www.w3.org/TR/WCAG22/) contrast: at least 4.5:1 for normal text, 3:1 for large text, and 3:1 for visual information required to identify controls and states against adjacent colors. Recheck final rendered states and overlays when building screens.

## Typography

Use Outfit for headings, content, and UI. Keep Gargoyles with the marketing identity and existing brand artwork. Use JetBrains Mono for filenames when precision matters, hashes, snippets, and technical values. The approved UI language can change; use sentence case and allow translated labels to wrap.

| Role | Size / line height at a 16px root | Weight | Use |
| --- | --- | --- | --- |
| `page-title` / `page-title-wide` | 28/34px; 32/40px from 640px | 700 | One visible page title |
| `section-title` / `panel-title` | 24/32px and 18/24px | 600 | Section headings and card titles |
| `body` | 16/24px | 400 | Explanations, result text, and input values |
| `compact` / `label` | 14/20px | 400 / 600 | Table cells and supporting copy / controls and field labels |
| `metadata` | 12/16px | 500 | Short tags, timestamps, and supplementary labels |
| `code` | 13/20px | 400 | Technical excerpts and exact values |

Keep the root at the browser default and size text in `rem`. Limit prose to about `65ch`. Use tabular numerals when comparing counts or scores in columns. Wrap long names and URLs where practical; preserve the exact value for copy and give code blocks their own scrolling region when whitespace matters.

## Layout

Choose a content cap by the amount of information on the screen. Caps apply **after** the main area's gutters and exclude the navigation rail. Keep content fluid below its cap and center it in the main region.

| Container | Max inline size | Use |
| --- | --- | --- |
| Reading / form | `45rem` (720px) | A single scan form, simple settings, or long explanations |
| Work area | `64rem` (1024px) | Scanner overview and most result screens |
| Wide work area | `90rem` (1440px) | Activity tables or result layouts with a useful secondary column |

| Viewport | Inline gutters | Layout |
| --- | --- | --- |
| Below 640px | `1rem` (16px) | Single column. Compact header with at least a 56px minimum block size; navigation is reachable from a labelled menu. Stack action groups when they do not fit. |
| 640–1023px | `1.5rem` (24px) | Compact navigation remains. A card grid can use two columns where cards keep about 280px of usable width. |
| 1024–1279px | `2rem` (32px) | A `15rem` (240px) rail can carry persistent navigation. Main content keeps its own cap; allow its grid tracks to shrink. |
| 1280px and above | `2rem` (32px) | A wide result page can add a `17.5rem` (280px) secondary column with a `1.5rem` (24px) gap when the primary track still has at least 560px. Stack supporting details below the main result otherwise. |

For example, with a 240px rail and 32px gutters, a 1440px viewport leaves 1136px of usable main width. A work area caps at 1024px within it; a wide work area uses the available 1136px.

Use a 4px spacing rhythm. Use 4–8px for icon gaps and related details, 8px between a label and its control, 16px between fields or cards, 24px between groups, and 32–48px between sections. Panels use 16px internal padding below 640px and 24px above. Align headings, panel edges, and action groups to their container. Keep primary tasks visible across viewport sizes and input methods. Verify reflow at a 320px CSS viewport and check text enlargement at 200%; contain horizontal scrolling inside intrinsically wide tables or evidence blocks.

## Elevation & Depth

The workspace uses solid surface changes and borders for depth. Cards, form panels, table rows, and navigation sit flat. Reserve `0 8px 24px rgb(0 0 0 / 35%)` for floating menus and popovers, and `0 16px 48px rgb(0 0 0 / 50%)` with a `rgb(0 0 0 / 65%)` scrim for modal dialogs.

Use 120ms ease-out for hover and press color feedback and 180ms ease-out for opening a menu or dialog. With `prefers-reduced-motion: reduce`, remove nonessential transitions, transforms, and animated scrolling. Use a static status label in place of a spinner when motion is reduced. No task or result should depend on animation to become visible.

## Shapes

| Element | Treatment |
| --- | --- |
| Navigation and compact icon controls | 8px radius; keep hit targets at least 44×44px. |
| Standard controls and work panels | 12px radius. Use 1px control strokes or quiet panel strokes according to their role. |
| Menus and dialogs | 16px radius. Use a 1px `border-control` stroke where the edge needs to be discernible. |
| Status badge | Pill radius; text and icon stay legible even where the fill is subtle. |
| Keyboard focus | 2px `accent-text` outline with a 2px offset. Keep it clear of clipping and sticky UI. Where a control sits on an accent surface, choose a contrasting ring and verify it against both adjacent colors. |
| Icons and logo | Use one consistent outline icon family, with 16px glyphs in dense UI and 20px glyphs in main controls. Pair unfamiliar icons with labels. Keep the helmet and wordmark proportions from the source artwork. |

## Components

Component heights in the token block are **minimums**, so text can wrap and controls can grow. All interactive patterns need keyboard focus, a pointer or touch equivalent, and readable labels.

| Component | Specification |
| --- | --- |
| Buttons and links | Put one filled primary action in a task cluster. Secondary uses `surface`, `text`, and a 1px `border-control` stroke; hover uses `surface-hover` and press uses `surface-selected`. Tertiary uses text on the surrounding surface. Prefer a labelled button for actions and a link for navigation. Disabled buttons use a neutral surface and muted text; when eligibility is unclear, explain what enables the action nearby. |
| Text fields and selects | Keep a visible label, optional help, and an inline error associated with the field. Use a 1px `border-control` stroke, `accent-text` stroke plus shared ring on focus, and `danger` stroke plus error text for invalid values. Preserve user input after validation failures. Read-only values remain readable and copyable. A multiline field starts at 112px and grows or resizes vertically. |
| File picker | Pair a labelled choose-file control with any drop area. Give accepted types and limits up front; display the selected filename, remove or replace actions, and specific validation errors. Drag-over is an enhancement; keyboard and touch can use the file control. |
| Cards and findings | Use a quiet 1px border and the panel spacing. Order a finding as title and verdict, explanation, evidence, and next step. Use an explicit link or button for details; avoid wrapping nested controls inside a clickable card. |
| Status and feedback | Badges label a single state; banners add an explanation and an action where helpful. Use a stable loading layout and a visible status message. Announce asynchronous changes without stealing focus. Show incomplete coverage and unavailable results explicitly. Empty and error states explain the cause when known and give a useful next step. |
| Navigation and filters | Indicate the current page with `aria-current` and a visible selected treatment. Keep filter selection distinct from hover. Support keyboard opening and closing of compact navigation, Escape to close, and focus return to its trigger. |
| Tables and lists | Use 12–16px cell padding and row dividers. Align numbers on the end edge; expose both the sort control and sort direction. On narrow screens prioritize essential columns or use a labelled scroll region. Keep selection and per-row actions usable by keyboard. |
| Menus, dialogs, and notices | Keep menu items in a visible focus order and return focus to the trigger when dismissed. Use a dialog for a choice that needs dedicated attention. Cap it at `32rem` (512px) for simple actions or `48rem` (768px) for complex content. Keep at least 16px between the dialog and viewport edges, and allow the body to scroll when height is limited. A modal needs a title, reachable dismiss action, contained focus, and focus restoration. Keep critical errors in context instead of showing them only in a transient notice. |

## Do's and Don'ts

- **Do** use the shared palette, radius, and spacing roles before adding a new token. If implementation proves a new role is needed, update the app tokens, this document, and the preview together.
- **Do** pair scan outcomes with a visible label, scope of coverage, and a next step when appropriate.
- **Do** check default, hover, focus, pressed, disabled, loading, empty, error, and partial-result states for any component that supports them. Check keyboard, touch, zoom, and reduced motion on the first real workflow.
- **Don't** use the public site's decorative headlines, glossy effects, or moving card tracks in the workspace's routine controls and result views.
- **Don't** use color alone for selection, errors, or verdicts, or show a favorable verdict merely because processing completed.
