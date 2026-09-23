"use client";

import Link from "next/link";
import { useCallback, useEffect, useState } from "react";
import { formatEventDate } from "@/lib/dates";
import { getOrganizerEvents } from "@/lib/organizer-dashboard";
import { supabase } from "@/lib/supabase/client";
import type { OrganizerEventSummary } from "@/lib/types";
import { useOrganizerSession } from "@/components/organizer-auth";

export default function DashboardEvents() {
  const session = useOrganizerSession();
  const [events, setEvents] = useState<OrganizerEventSummary[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  const loadEvents = useCallback(async () => {
    if (!supabase) return;
    setLoading(true);
    setError("");
    try {
      setEvents(await getOrganizerEvents(supabase, session.user.id));
    } catch {
      setError("No pudimos cargar tus eventos. Intenta nuevamente.");
    } finally {
      setLoading(false);
    }
  }, [session.user.id]);

  useEffect(() => {
    void Promise.resolve().then(loadEvents);
  }, [loadEvents]);

  async function signOut() {
    await supabase?.auth.signOut();
  }

  return (
    <main className="page-shell dashboard-page">
      <header className="page-header">
        <div>
          <p className="eyebrow">Door List</p>
          <h1>Mis eventos</h1>
          <p className="page-description">Consulta el aforo y las personas registradas en cada evento.</p>
        </div>
        <button className="button button-secondary" type="button" onClick={signOut}>Cerrar sesión</button>
      </header>

      <section aria-labelledby="events-heading">
        <h2 className="visually-hidden" id="events-heading">Eventos del organizador</h2>

      {loading ? (
        <div className="event-grid" aria-busy="true">
          <p className="visually-hidden" role="status">Cargando eventos…</p>
          {Array.from({ length: 3 }, (_, index) => (
            <div className="event-card event-card-skeleton" aria-hidden="true" key={index}>
              <span className="skeleton skeleton-compact" />
              <span className="skeleton skeleton-title" />
              <span className="skeleton skeleton-secondary" />
              <span className="skeleton skeleton-primary" />
            </div>
          ))}
        </div>
      ) : error ? (
        <div className="data-state">
          <p className="alert alert-error" role="alert">{error}</p>
          <button className="button button-primary" type="button" onClick={() => void loadEvents()}>Intentar nuevamente</button>
        </div>
      ) : events.length === 0 ? (
        <div className="data-state">
          <h2>Aún no tienes eventos</h2>
          <p>Cuando crees uno, aparecerá aquí.</p>
        </div>
      ) : (
        <div className="event-grid">
          {events.map((event) => (
            <article className="event-card" key={event.id}>
              <div>
                <span className={`status-badge status-${event.status}`}>{event.status === "published" ? "Publicado" : "Borrador"}</span>
                <h2>{event.title}</h2>
                <p className="event-card-date">{formatEventDate(event.eventDate)}</p>
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
