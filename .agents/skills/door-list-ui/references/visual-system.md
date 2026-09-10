# Visual system

Use these values as the source of truth. Define them once in `app/globals.css`
and consume their semantic names. Existing legacy values outside the scale do not
authorize new arbitrary values; migrate only the UI already in scope.

## Color

| Token | Value | Use |
|---|---:|---|
| `--color-canvas` | `#f8fafc` | Page background and neutral table headers |
| `--color-surface` | `#ffffff` | Cards, forms, dialogs, and tables |
| `--color-text` | `#0f172a` | Primary text |
| `--color-text-inverse` | `#ffffff` | Text on dark controls and surfaces |
| `--color-text-subtle` | `#475569` | Secondary content |
| `--color-text-muted` | `#64748b` | Help text and metadata |
| `--color-border` | `#dbe3ee` | Container borders |
| `--color-border-strong` | `#cbd5e1` | Inputs and emphasized divisions |
| `--color-primary` | `#2563eb` | Links, selection, progress, and focus |
| `--color-primary-strong` | `#1e40af` | Primary text on light blue surfaces |
| `--color-primary-soft` | `#eff6ff` | Selected and informational surfaces |
| `--color-success` | `#166534` | Success text |
| `--color-success-soft` | `#f0fdf4` | Success surface |
| `--color-warning` | `#92400e` | Warning text |
| `--color-warning-soft` | `#fffbeb` | Warning surface |
| `--color-danger` | `#991b1b` | Error and destructive text |
| `--color-danger-soft` | `#fef2f2` | Error surface |
| `--color-disabled` | `#e2e8f0` | Disabled and skeleton surfaces |

Do not use color alone to communicate status. Pair it with text, an accessible
name, or both. Do not add hexadecimal, RGB, HSL, or named colors outside the
token declaration.

## Typography

Use `Arial, Helvetica, sans-serif` for interface text and
`ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace` only for ticket
codes or other machine-readable identifiers.

| Role | Size | Line height | Weight | Notes |
|---|---:|---:|---:|---|
| Page title | `clamp(2rem, 5vw, 3.25rem)` | `1.05` | `700` | One per page |
| Section title | `1.25rem` | `1.3` | `700` | `h2` |
| Card title | `1.05rem` | `1.4` | `700` | `h3` or card `h2` |
| Body | `1rem` | `1.6` | `400` | Default copy |
| Supporting | `0.875rem` | `1.5` | `400` | Description and metadata |
| Label | `0.875rem` | `1.4` | `600` | Form and field labels |
| Eyebrow | `0.75rem` | `1.3` | `800` | Uppercase; letter spacing `0.12em` |
| Table heading | `0.75rem` | `1.3` | `700` | Uppercase; letter spacing `0.04em` |

Do not create a new text role for one screen. Use sentence case in Spanish; do
not capitalize every word in headings or buttons.

## Spacing

| Token | Value |
|---|---:|
| `--space-1` | `0.25rem` |
| `--space-2` | `0.5rem` |
| `--space-3` | `0.75rem` |
| `--space-4` | `1rem` |
| `--space-5` | `1.5rem` |
| `--space-6` | `2rem` |
| `--space-7` | `3rem` |
| `--space-8` | `4rem` |

Use `--space-1` through `--space-3` inside compact controls, `--space-4` through
`--space-6` inside components, and `--space-6` through `--space-8` between page
sections. Do not add intermediate spacing values.

## Shape and depth

| Token | Value | Use |
|---|---:|---|
| `--radius-control` | `0.55rem` | Inputs and buttons |
| `--radius-small` | `0.75rem` | Alerts and compact containers |
| `--radius-panel` | `1rem` | Tables, forms, and state panels |
| `--radius-card` | `1.25rem` | Prominent cards |
| `--radius-pill` | `999px` | Badges only |
| `--shadow-card` | `0 18px 55px rgb(15 23 42 / 0.08)` | Prominent cards |
| `--shadow-focus` | `0 0 0 3px rgb(37 99 235 / 0.28)` | Focus-visible ring |

Default panels use a border without a shadow. Reserve `--shadow-card` for the
primary card or public-facing event and ticket cards. Do not stack shadows.

## Layout

- Standard content width: `70rem` (`1120px`).
- Reading or state width: `38.75rem` (`620px`).
- Page side gutter: `1rem`; use `2rem` when the viewport permits.
- Default mobile breakpoint: `43.75rem` (`700px`).
- Compact table breakpoint: `38.75rem` (`620px`).
- Never introduce a new breakpoint when one of these handles the layout.
- Prefer fluid grids with `minmax()` over fixed column counts.

## Controls

- Minimum interactive height: `2.75rem`.
- Primary button: `--color-text` surface with `--color-text-inverse` label.
- Secondary button: `--color-disabled` surface with `--color-text` label.
- Destructive text or action: `--color-danger`; do not make it the primary page
  action unless the page is specifically a destructive confirmation.
- Inputs use `--color-surface`, `--color-border-strong`, `--radius-control`, and
  `--space-3` vertical by `--space-3` horizontal padding.
- Every control must have a visible `:focus-visible` style using
  `--shadow-focus`.
- Disabled controls retain their label, use 50% opacity, and show a
  `not-allowed` cursor.

## Motion

Use motion only to clarify state changes. Default transitions are `150ms ease`
and may affect color, border color, opacity, and transform. Under
`prefers-reduced-motion: reduce`, remove non-essential animation and transitions.
