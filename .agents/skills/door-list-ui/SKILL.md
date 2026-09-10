---
name: door-list-ui
description: Apply and maintain the Door List visual system when creating, modifying, refactoring, or reviewing user-facing UI in this repository, including pages, layouts, forms, cards, tables, and loading, empty, error, or success states. Do not invoke for database, API, email, authentication, or business-logic-only changes that do not alter rendered UI.
---

# Door List UI

Maintain one predictable visual language and component structure across every
user-facing Door List screen.

Follow the repository `AGENTS.md`. This skill adds UI-specific constraints and
does not replace repository conventions or expand the task's scope.

## Read the relevant references

- Always read [references/visual-system.md](references/visual-system.md) before
  adding or changing visual styles.
- Read [references/component-structure.md](references/component-structure.md)
  when creating, moving, splitting, or reusing components.
- Read [references/data-states.md](references/data-states.md) whenever a screen,
  collection, table, or form depends on asynchronous data.
- Read [references/canonical-examples.md](references/canonical-examples.md) when
  creating a page, table, or form, or when the correct pattern is unclear.

## Invariants

- Use semantic design tokens. In changed UI code, do not introduce raw colors,
  shadows, radii, font sizes, or spacing values outside the token declaration.
- Use only the typography roles and spacing scale defined in the visual system.
- Preserve the page, section, card, form, and table anatomy from the references.
- Define loading, empty, error, and populated states for every asynchronous
  collection. Define submitting, success, and error states for mutations.
- Write interface copy in Spanish. Write code, component names, props, and types
  in English.
- Use `Event`, `TicketType`, `Ticket`, and `Registration` only with the meanings
  established by the repository.
- Use Server Components by default. Add `"use client"` only when the component
  needs state, effects, event handlers, custom client hooks, or browser APIs.
- Keep the client boundary at the smallest practical interactive subtree.
- Keep a component beside its route while it has one consumer. Move it to
  `components/` when a second route uses the same behavior and visual structure.
- Reuse an existing canonical pattern before introducing a new variant.
- Do not migrate unrelated legacy UI merely because this skill was invoked.

## Framework check

Before writing or changing Next.js framework code, inspect the installed Next.js
version and consult the matching official Next.js documentation. Do not rely on
remembered APIs. In particular, verify current App Router conventions before
adding route files, loading boundaries, metadata, caching, or data fetching.

## Workflow

1. Inspect the target route and neighboring screens for existing patterns.
2. Classify the work as a page, section, card, form, table, or data state.
3. Select the matching canonical recipe and use its exact tokens and anatomy.
4. Keep static rendering and data access on the server when possible; isolate
   browser interactivity in a client component.
5. Implement every applicable state before considering the UI complete.
6. Verify keyboard behavior, focus visibility, accessible names, narrow-screen
   behavior, and reduced-motion behavior.
7. Run the repository lint and the narrowest relevant tests or build checks.

## Acceptance checklist

- No arbitrary visual values were added in changed UI code.
- The heading hierarchy and page anatomy match a canonical recipe.
- Loading preserves the approximate final layout and exposes an accessible status.
- Empty states explain what is absent and offer at most one relevant next action.
- Errors use product-owned Spanish copy and never expose provider messages.
- Tables remain understandable and operable on narrow screens.
- Interactive controls cover hover, focus-visible, active, and disabled states.
- Client boundaries are limited to the interactive subtree.
- A new shared component has at least two real consumers.

If a requested design conflicts with this system, follow the user's explicit
request for that task and keep the exception local. Do not silently redefine the
system for the rest of the repository.
