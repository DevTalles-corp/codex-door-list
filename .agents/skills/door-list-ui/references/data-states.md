# Data states

Every asynchronous region has an explicit state model. Do not infer state from a
falsy payload alone.

## Collections and tables

Model these states independently:

- `loading`: initial request has not completed;
- `error`: request failed and no usable data is available;
- `empty`: request succeeded with zero items;
- `populated`: request succeeded with one or more items;
- `refreshing`: usable data remains visible while a new request runs.

Evaluate them in that order, except `refreshing`, which decorates `populated`.
Never render an empty state before the initial request completes.

## Initial table loading

- Preserve the final table wrapper, caption, header, and approximate height.
- Add `aria-busy="true"` to the table region.
- Add a `role="status"` message with the specific Spanish label, such as
  `Cargando asistentes…`. It may be visually hidden.
- Render exactly five skeleton rows unless the final table is known to contain
  fewer rows per page.
- Match the number and relative width of skeleton cells to the final columns.
- Mark decorative skeleton content `aria-hidden="true"`.
- Do not show an isolated spinner or animated ellipsis.

Skeleton animation must respect `prefers-reduced-motion`. Use
`--color-disabled` as its base and a subtle opacity change; do not add gradients
with new colors.

## Background refresh

- Keep existing rows visible.
- Mark the region `aria-busy="true"`.
- Disable only controls that conflict with the refresh.
- Do not replace populated content with skeletons.
- Announce completion only when the update materially changes visible data.

## Empty table

Keep the table header visible. Render one body row containing one cell whose
`colSpan` equals the number of columns. The cell contains:

1. a short title;
2. one explanatory sentence;
3. zero or one relevant action.

For the registration table, use exactly:

- Title: `Todavía no hay asistentes registrados`
- Description: `Las personas aparecerán aquí cuando completen su registro.`

If the current user can directly resolve the empty state, the single action may
do so. Otherwise omit the action. Do not use decorative illustrations.

## Table error

Keep the heading and table container. Replace the table body with one spanning
cell containing:

- `role="alert"` on the error message;
- a product-owned Spanish message;
- one `Intentar nuevamente` button only when retrying can succeed.

Default registration copy:
`No pudimos cargar los asistentes. Intenta nuevamente.`

Never display raw Supabase, HTTP, or JavaScript error messages.

## Non-table empty state

Use a bordered `DataState` panel with centered content and a maximum readable
width. Use this order:

1. `h2` describing what is absent;
2. one sentence explaining what happens next;
3. optional single action.

Canonical Event collection copy:

- Title: `Aún no tienes eventos`
- Description: `Cuando crees uno, aparecerá aquí.`

Canonical public listing copy:

- Title: `No hay eventos disponibles`
- Description: `Vuelve pronto para conocer nuevas fechas.`

## Route loading

When server data suspends during navigation, prefer a route-level `loading.tsx`
or a focused Suspense fallback. The loading UI should reproduce the page shell
and primary content geometry. `loading.tsx` remains a Server Component unless it
has a concrete client requirement.

Do not add both a route skeleton and an unrelated full-page client loading state
for the same initial request. Client-side loading remains appropriate for
client-only data or user-triggered refreshes.

## Mutations

Model `idle`, `submitting`, `success`, and `error` independently.

During submission:

- disable the submitting control and conflicting actions;
- keep entered values visible;
- keep the button width stable;
- use a specific progress label: `Guardando evento…`, `Registrando…`, or
  `Enviando…`;
- expose status with `aria-busy` or a nearby `role="status"`.

On success, state what happened: `Evento guardado.` or `Registro completado.` On
error, preserve recoverable input and focus the error summary when doing so helps
keyboard and screen-reader users.

## Accessibility

- Loading status: `role="status"` or an appropriate live region.
- Errors requiring attention: `role="alert"`.
- Empty content: no live role; it is a successful result.
- Do not repeatedly announce skeleton rows.
- Retry buttons use `type="button"` unless they intentionally submit a form.
- Focus must not move merely because background data refreshed.