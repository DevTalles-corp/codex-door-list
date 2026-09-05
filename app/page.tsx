"use client";

import Link from "next/link";
import { useCallback, useEffect, useState } from "react";
import { formatEventDate, registrationIsOpen } from "@/lib/dates";
import { supabase } from "@/lib/supabase/client";
import type { EventListing } from "@/lib/types";

export default function Home() {
  const [events, setEvents] = useState<EventListing[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  const loadEvents = useCallback(async () => {
    setLoading(true);
    setError("");

    if (!supabase) {
      setError("Los eventos no están configurados en este momento.");
      setLoading(false);
      return;
    }

    const { data, error: queryError } = await supabase
      .from("events")
      .select("id,title,description,event_date,venue,status")
      .eq("status", "published")
      .order("event_date");

    if (queryError) {
      setError("No pudimos cargar los eventos. Intenta nuevamente.");
      setLoading(false);
      return;
    }

    setEvents((data as EventListing[]).filter(registrationIsOpen));
    setLoading(false);
  }, []);

  useEffect(() => {
    void Promise.resolve().then(loadEvents);
  }, [loadEvents]);

  return (
    <main className="landing-shell">
      <header className="landing-header">
        <p className="eyebrow">Door List</p>
        <h1>Próximos eventos</h1>
        <p>Encuentra un evento y reserva tu entrada.</p>
      </header>

      {loading ? (
        <section className="landing-state" aria-busy="true">
          <h2>Cargando eventos…</h2>
          <p>Estamos buscando los próximos eventos disponibles.</p>
        </section>
      ) : error ? (
        <section className="landing-state">
          <p className="public-alert error" role="alert">{error}</p>
          {supabase && <button type="button" onClick={() => void loadEvents()}>Intentar nuevamente</button>}
        </section>
      ) : events.length === 0 ? (
        <section className="landing-state">
          <h2>No hay eventos disponibles</h2>
          <p>Vuelve pronto para conocer nuevas fechas.</p>
        </section>
      ) : (
        <section className="event-list" aria-label="Eventos disponibles">
          {events.map((event) => (
            <article className="event-card" key={event.id}>
              <p className="event-card-date">{formatEventDate(event.event_date)}</p>
              <h2>{event.title}</h2>
              <p className="event-card-venue">{event.venue}</p>
              {event.description && <p className="event-card-description">{event.description}</p>}
              <Link className="event-card-link" href={`/eventos/${event.id}/registro`}>
                Reservar entrada
              </Link>
            </article>
          ))}
        </section>
      )}
    </main>
  );
}
