# Component structure

Follow repository placement rules first: routes live in `app/`, route-only UI
stays beside its route, and UI used by two or more routes lives in `components/`.

## Naming

- Use PascalCase English nouns for components: `PageHeader`, `EventCard`,
  `RegistrationTable`.
- Name variants by meaning, not appearance: `tone="danger"`, not `color="red"`.
- Name event callbacks `onRetry`, `onSubmit`, or `onSelect`; name internal handlers
  `handleRetry`, `handleSubmit`, or `handleSelect`.
- Do not create synonyms for established entities or UI patterns.

## Server and client boundaries

Pages, layouts, data formatting, and static presentation remain Server Components
unless a verified framework constraint requires otherwise. Create a client
component only for the subtree needing state, effects, event handlers, custom
client hooks, or browser APIs.

Do not add `"use client"` to a page merely because a nested control is
interactive. Pass serializable data from the server component into the smallest
client component. A client component must not import server-only modules.

## Page anatomy

Every application page follows this order:

1. `main` page shell;
2. page header;
3. optional page-level feedback;
4. primary content sections.

A page header contains, in order:

1. optional eyebrow or back navigation;
2. one `h1`;
3. optional supporting paragraph;
4. optional page action.

Use one `h1`. Give every major section an `h2`, either visible or visually
hidden. Associate sections with their headings through native nesting or
`aria-labelledby`.

## Section anatomy

Use this order:

1. heading row;
2. optional supporting copy or aggregate count;
3. content, data state, or form;
4. optional footer action.

Do not place unrelated actions in the heading row. A section count is supporting
information, not a heading.

## Card anatomy

Use this order:

1. optional status or date;
2. heading;
3. primary information;
4. supporting information;
5. actions or footer.

A card must be an `article` only when it represents a standalone item such as an
`Event` or `TicketType`. Use a `div` for a purely visual container. Do not make
the entire card clickable when it contains multiple actions.

## Form anatomy

Use this order:

1. heading and optional description;
2. page-level form error;
3. fields grouped by meaning;
4. field help or validation adjacent to its field;
5. primary submit action;
6. optional secondary cancel action.

Every field has a visible label. Required status must not be conveyed only by an
asterisk. Connect help and validation with `aria-describedby`. During submission,
keep the button width stable, disable conflicting actions, and change its label to
a specific Spanish progress phrase such as `Guardando evento…`.

## Table anatomy

Use a table only for data whose column relationships matter. The structure is:

1. section heading row outside the table wrapper;
2. horizontally scrollable bordered wrapper;
3. `table` with an accessible caption, visible or visually hidden;
4. one header row;
5. populated, loading, empty, or error body from `data-states.md`.

Column headings are short nouns. Put the primary entity in the first column with
its identifying detail beneath it. Keep row actions in the last column and give
icon-only actions an accessible name.

At narrow widths, first try horizontal scrolling and compact cell padding. Turn a
table into cards only when horizontal comparison is not essential; document that
choice in the implementation.

## Extraction rule

Keep a component local until a second real consumer needs the same visual and
behavioral contract. Then move the shared implementation to `components/` and
update both consumers in the same task when they are in scope.

Split a component when it represents a reusable pattern, owns an independent
interactive boundary, or isolates a distinct UI concern. Do not split solely to
reduce line count, and do not create passthrough wrappers with no semantic,
styling, or behavioral responsibility.

## Approved shared pattern names

Use these names when the pattern becomes shared:

- `PageShell`: standard width and page spacing.
- `PageHeader`: page eyebrow/back link, title, description, and action.
- `StatusBadge`: semantic status label.
- `DataState`: non-table loading, empty, or error panel.
- `FormAlert`: form-level success or error feedback.

Do not introduce `BlankState`, `Placeholder`, `NoData`, or `LoadingPanel` as
parallel names for the same `DataState` responsibility.
