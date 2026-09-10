# Canonical examples

These examples fix structure, state order, copy, and accessibility. Adapt entity
fields to the task, but do not invent alternative anatomy or visual values.

## Event collection page

Keep the route as a Server Component when it can load data on the server. The
data-access function below is illustrative; use the repository's actual server
client and centralized types.

```tsx
import Link from "next/link";

export default async function EventsPage() {
  // Use the repository's server-side Supabase client and centralized types.
  const events = await loadOrganizerEventsForCurrentUser();

  return (
    <main className="page-shell">
      <header className="page-header">
        <div>
          <p className="eyebrow">Door List</p>
          <h1>Mis eventos</h1>
          <p className="page-description">
            Consulta el aforo y las personas registradas en cada evento.
          </p>
        </div>
        <Link className="button button-primary" href="/eventos/nuevo">
          Crear evento
        </Link>
      </header>

      <section aria-labelledby="events-heading">
        <h2 className="visually-hidden" id="events-heading">
          Eventos del organizador
        </h2>

        {events.length === 0 ? (
          <div className="data-state">
            <h2>Aún no tienes eventos</h2>
            <p>Cuando crees uno, aparecerá aquí.</p>
            <Link className="button button-primary" href="/eventos/nuevo">
              Crear evento
            </Link>
          </div>
        ) : (
          <div className="event-grid">
            {events.map((event) => (
              <article className="event-card" key={event.id}>
                <div>
                  <span className="status-badge">{event.statusLabel}</span>
                  <h2>{event.title}</h2>
                  <p className="event-card-date">{event.formattedDate}</p>
                  <p className="event-card-venue">{event.venue}</p>
                </div>
                <footer className="event-card-footer">
                  <span>Aforo: {event.maxCapacity}</span>
                  <Link href={`/dashboard/${event.id}`}>Ver detalle</Link>
                </footer>
              </article>
            ))}
          </div>
        )}
      </section>
    </main>
  );
}
```

Do not add `"use client"` to this page merely for the link. If one card later
needs a menu or local interaction, isolate that interaction in a client component.

## Registration table: populated

```tsx
<section className="data-section" aria-labelledby="registrations-heading">
  <div className="section-heading">
    <h2 id="registrations-heading">Asistentes registrados</h2>
    <span>{registrations.length} personas</span>
  </div>

  <div className="table-wrap">
    <table className="data-table">
      <caption className="visually-hidden">
        Personas registradas y su tipo de entrada
      </caption>
      <thead>
        <tr>
          <th scope="col">Asistente</th>
          <th scope="col">Tipo de entrada</th>
          <th scope="col">Registro</th>
        </tr>
      </thead>
      <tbody>
        {registrations.map((registration) => (
          <tr key={registration.id}>
            <td>
              <strong>{registration.attendeeName}</strong>
              <span>{registration.attendeeEmail}</span>
            </td>
            <td><span className="status-badge">{registration.ticketType.name}</span></td>
            <td>{registration.formattedRegisteredAt}</td>
          </tr>
        ))}
      </tbody>
    </table>
  </div>
</section>
```

## Registration table: initial loading

Use the same columns and exactly five rows:

```tsx
<div className="table-wrap" aria-busy="true">
  <p className="visually-hidden" role="status">Cargando asistentes…</p>
  <table className="data-table">
    <caption className="visually-hidden">
      Personas registradas y su tipo de entrada
    </caption>
    <thead>
      <tr>
        <th scope="col">Asistente</th>
        <th scope="col">Tipo de entrada</th>
        <th scope="col">Registro</th>
      </tr>
    </thead>
    <tbody aria-hidden="true">
      {Array.from({ length: 5 }, (_, index) => (
        <tr key={index}>
          <td><span className="skeleton skeleton-primary" /></td>
          <td><span className="skeleton skeleton-compact" /></td>
          <td><span className="skeleton skeleton-secondary" /></td>
        </tr>
      ))}
    </tbody>
  </table>
</div>
```

## Registration table: empty

```tsx
<tbody>
  <tr>
    <td colSpan={3}>
      <div className="table-state">
        <strong>Todavía no hay asistentes registrados</strong>
        <p>Las personas aparecerán aquí cuando completen su registro.</p>
      </div>
    </td>
  </tr>
</tbody>
```

The empty result is successful. Do not give it `role="alert"` or `role="status"`.

## Registration table: recoverable error

The retry handler requires a Client Component. Keep only this data region on the
client when the rest of the page can remain on the server.

```tsx
<tbody>
  <tr>
    <td colSpan={3}>
      <div className="table-state">
        <p className="alert alert-error" role="alert">
          No pudimos cargar los asistentes. Intenta nuevamente.
        </p>
        <button type="button" onClick={onRetry}>
          Intentar nuevamente
        </button>
      </div>
    </td>
  </tr>
</tbody>
```

## Form mutation

```tsx
<form aria-busy={isSubmitting} onSubmit={handleSubmit}>
  <h2>Nuevo evento</h2>

  {error ? (
    <p className="alert alert-error" role="alert" tabIndex={-1} ref={errorRef}>
      {error}
    </p>
  ) : null}

  <label>
    Nombre
    <input name="title" required aria-describedby="title-help" />
    <span className="field-help" id="title-help">
      Usa el nombre que verán las personas invitadas.
    </span>
  </label>

  <div className="form-actions">
    <button disabled={isSubmitting} type="submit">
      {isSubmitting ? "Guardando evento…" : "Crear evento"}
    </button>
    <button disabled={isSubmitting} type="button" className="button-secondary">
      Cancelar
    </button>
  </div>
</form>
```

This form is a Client Component because it owns state and an event handler. Its
surrounding page does not need to be one.

## Route loading

For server-rendered dashboard data, place a lightweight fallback beside the
route as `app/dashboard/loading.tsx`:

```tsx
export default function Loading() {
  return (
    <main className="page-shell" aria-busy="true">
      <p className="visually-hidden" role="status">Cargando eventos…</p>
      <header className="page-header" aria-hidden="true">
        <div>
          <span className="skeleton skeleton-compact" />
          <span className="skeleton skeleton-title" />
          <span className="skeleton skeleton-secondary" />
        </div>
      </header>
      <div className="event-grid" aria-hidden="true">
        {Array.from({ length: 3 }, (_, index) => (
          <div className="event-card" key={index}>
            <span className="skeleton skeleton-title" />
            <span className="skeleton skeleton-secondary" />
          </div>
        ))}
      </div>
    </main>
  );
}
```

Do not add `"use client"` to `loading.tsx` for static skeleton markup.

## Responsive behavior

- Page headers stack below `43.75rem` when the action cannot remain beside the
  title without wrapping.
- Event cards use a fluid grid with a minimum card width of `18.75rem` (`300px`).
- Tables remain tables inside an `overflow-x: auto` wrapper; below `38.75rem`,
  reduce cell padding from `--space-4` to `--space-3`.
- Actions retain a minimum height of `2.75rem`; do not shrink touch targets to
  make a desktop layout fit.

## Common failures

- Do not add a new shade because a nearby token looks slightly different.
- Do not show empty copy while `loading` is true.
- Do not remove the table header during loading, empty, or error states.
- Do not expose `error.message` from Supabase in the interface.
- Do not create a shared component for one speculative future consumer.
- Do not mark a full route as a Client Component for one retry button or menu.
