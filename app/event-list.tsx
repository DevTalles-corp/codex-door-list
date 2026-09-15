"use client";

import Link from "next/link";
import { useCallback, useEffect, useState } from "react";
import { formatEventAgendaDate, formatEventDate, getEventDateGroup, registrationIsOpen } from "@/lib/dates";
import { supabase } from "@/lib/supabase/client";
import type { EventListing } from "@/lib/types";

type EventGroup = {
  label: string;
  events: EventListing[];
};

function groupEvents(events: EventListing[]) {
  return events.reduce<EventGroup[]>((groups, event) => {
    const label = getEventDateGroup(event.event_date);
    const group = groups.at(-1);

    if (group?.label === label) {
      group.events.push(event);
      return groups;
    }

    groups.push({ label, events: [event] });
    return groups;
  }, []);
}

function AgendaEvent({ event, featured = false }: { event: EventListing; featured?: boolean }) {
  const hasAvailability = event.remaining_capacity > 0;
  const availabilityLabel = hasAvailability
    ? event.remaining_capacity === 1
      ? "1 cupo disponible"
      : `${event.remaining_capacity} cupos disponibles`
    : "Entradas agotadas";

  return (
    <article className={`agenda-event${featured ? " agenda-event-featured" : ""}`}>
      <time className="agenda-event-date" dateTime={event.event_date}>
        {formatEventAgendaDate(event.event_date)}
      </time>
      <div className="agenda-event-details">
        <h3>{event.title}</h3>
        <p className="agenda-event-venue">{event.venue}</p>
        {event.description && <p className="agenda-event-description">{event.description}</p>}
        <p className="agenda-event-time">{formatEventDate(event.event_date)}</p>
      </div>
      <footer className="agenda-event-actions">
        <p className={hasAvailability ? "agenda-event-availability" : "agenda-event-sold-out"}>
          {availabilityLabel}
        </p>
        {hasAvailability ? (
          <Link
            aria-label={`Reservar entrada para ${event.title}`}
            className="button button-primary agenda-event-action"
            href={`/eventos/${event.id}/registro`}
          >
            Reservar entrada
          </Link>
        ) : (
          <span className="agenda-event-unavailable">No disponible</span>
        )}
      </footer>
    </article>
  );
}

function EventListSkeleton() {
  return (
    <section className="event-list-state" aria-busy="true" aria-labelledby="events-heading">
      <p className="visually-hidden" role="status">Cargando próximos eventos…</p>
      <h2 className="visually-hidden" id="events-heading">Eventos disponibles</h2>
      <div className="event-agenda" aria-hidden="true">
        {Array.from({ length: 3 }, (_, index) => (
          <div className="agenda-event agenda-event-skeleton" key={index}>
            <span className="skeleton skeleton-compact" />
            <div className="agenda-event-skeleton-details">
              <span className="skeleton skeleton-title" />
              <span className="skeleton skeleton-secondary" />
              <span className="skeleton skeleton-primary" />
            </div>
            <span className="skeleton skeleton-field" />
          </div>
        ))}
      </div>
    </section>
  );
}

export default function EventList() {
  const [events, setEvents] = useState<EventListing[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<"configuration" | "request" | null>(null);

  const loadEvents = useCallback(async () => {
    setLoading(true);
    setError(null);

    if (!supabase) {
      setError("configuration");
      setLoading(false);
      return;
    }

    const { data, error: queryError } = await supabase.rpc("get_public_event_list");

    if (queryError) {
      setError("request");
      setLoading(false);
      return;
    }

    setEvents((data as EventListing[]).filter(registrationIsOpen));
    setLoading(false);
  }, []);

  useEffect(() => {
    void Promise.resolve().then(loadEvents);
  }, [loadEvents]);

  if (loading) {
    return <EventListSkeleton />;
  }

  if (error) {
    const retryable = error === "request";

    return (
      <section className="landing-state" aria-labelledby="events-heading">
        <h2 id="events-heading">No pudimos mostrar los eventos</h2>
        <p className="public-alert error" role="alert">
          {retryable
            ? "No pudimos cargar los eventos. Intenta nuevamente."
            : "La lista de eventos no está disponible en este momento. Vuelve más tarde."}
        </p>
        {retryable && <button type="button" onClick={() => void loadEvents()}>Intentar nuevamente</button>}
      </section>
    );
  }

  if (events.length === 0) {
    return (
      <section className="landing-state" aria-labelledby="events-heading">
        <h2 id="events-heading">No hay eventos disponibles</h2>
        <p>Vuelve pronto para conocer nuevas fechas.</p>
      </section>
    );
  }

  return (
    <section className="event-list-state" aria-labelledby="events-heading">
      <h2 className="visually-hidden" id="events-heading">Eventos disponibles</h2>
      {groupEvents(events).map((group, groupIndex) => (
        <section className="event-group" aria-labelledby={`group-${group.label}`} key={group.label}>
          <h2 id={`group-${group.label}`}>{group.label}</h2>
          <ol className="event-agenda">
            {group.events.map((event, eventIndex) => (
              <li key={event.id}>
                <AgendaEvent event={event} featured={groupIndex === 0 && eventIndex === 0} />
              </li>
            ))}
          </ol>
        </section>
      ))}
    </section>
  );
}
