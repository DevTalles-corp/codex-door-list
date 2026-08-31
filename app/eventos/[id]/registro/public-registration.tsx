"use client";

import { FormEvent, useCallback, useEffect, useMemo, useRef, useState } from "react";
import { supabase } from "../../../lib/supabase";

type PublicEvent = {
  id: string;
  title: string;
  description: string | null;
  event_date: string;
  venue: string;
};

type TicketType = {
  id: string;
  name: string;
  max_capacity: number;
  remaining_capacity: number;
};

type RegistrationData = {
  event: PublicEvent;
  ticket_types: TicketType[];
};

type RegistrationStatus =
  | "success"
  | "event_unavailable"
  | "ticket_unavailable"
  | "duplicate_registration"
  | "invalid_input";

type RegistrationResult = {
  status: RegistrationStatus;
  registration_id: string | null;
};

type Confirmation = {
  eventTitle: string;
  ticketName: string;
  name: string;
  email: string;
};

function formatEventDate(value: string) {
  return new Intl.DateTimeFormat("es-BO", {
    dateStyle: "full",
    timeStyle: "short",
    timeZone: "America/La_Paz",
  }).format(new Date(value));
}

function unavailableMessage() {
  return "Este evento no está disponible para registro.";
}

export default function PublicRegistration({ eventId }: { eventId: string }) {
  const [data, setData] = useState<RegistrationData | null>(null);
  const [loading, setLoading] = useState(true);
  const [unavailable, setUnavailable] = useState(false);
  const [selectedTicket, setSelectedTicket] = useState("");
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [notice, setNotice] = useState("");
  const [confirmation, setConfirmation] = useState<Confirmation | null>(null);
  const noticeRef = useRef<HTMLParagraphElement>(null);

  const loadEvent = useCallback(async (showLoading = true) => {
    if (showLoading) setLoading(true);
    setUnavailable(false);

    if (!supabase) {
      setNotice("El registro no está configurado en este momento.");
      setLoading(false);
      return null;
    }

    const { data: response, error } = await supabase.rpc(
      "get_public_event_registration",
      { p_event_id: eventId },
    );

    if (error) {
      setNotice("No pudimos cargar el evento. Intenta nuevamente.");
      setLoading(false);
      return null;
    }

    if (!response) {
      setData(null);
      setUnavailable(true);
      setNotice(unavailableMessage());
      setLoading(false);
      return null;
    }

    const nextData = response as RegistrationData;
    setData(nextData);
    setNotice("");
    setLoading(false);
    return nextData;
  }, [eventId]);

  useEffect(() => {
    void Promise.resolve().then(() => loadEvent());
  }, [loadEvent]);

  useEffect(() => {
    if (notice) noticeRef.current?.focus();
  }, [notice]);

  const availableTickets = useMemo(
    () => data?.ticket_types.filter((ticket) => ticket.remaining_capacity > 0) ?? [],
    [data],
  );

  async function submitRegistration(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!supabase || !data || submitting) return;

    const trimmedName = name.trim();
    const normalizedEmail = email.trim().toLowerCase();
    const ticket = data.ticket_types.find((item) => item.id === selectedTicket);

    if (!ticket || ticket.remaining_capacity < 1) {
      setNotice("Selecciona un tipo de entrada que tenga cupo.");
      return;
    }

    setSubmitting(true);
    setNotice("");

    const { data: response, error } = await supabase.rpc("register_for_event", {
      p_event_id: data.event.id,
      p_ticket_type_id: ticket.id,
      p_name: trimmedName,
      p_email: normalizedEmail,
    });

    if (error) {
      setNotice("No pudimos completar tu registro. Intenta nuevamente.");
      setSubmitting(false);
      return;
    }

    const result = (response as RegistrationResult[] | null)?.[0];

    if (result?.status === "success") {
      setConfirmation({
        eventTitle: data.event.title,
        ticketName: ticket.name,
        name: trimmedName,
        email: normalizedEmail,
      });
      setSubmitting(false);
      return;
    }

    if (result?.status === "event_unavailable") {
      setData(null);
      setUnavailable(true);
      setNotice(unavailableMessage());
    } else if (result?.status === "ticket_unavailable") {
      setSelectedTicket("");
      const refreshed = await loadEvent(false);
      if (refreshed) {
        setNotice("Esa entrada acaba de agotarse. Elige otra opción disponible.");
      }
    } else if (result?.status === "duplicate_registration") {
      setNotice("Este email ya está registrado para el evento.");
    } else if (result?.status === "invalid_input") {
      setNotice("Revisa tu nombre, email y tipo de entrada antes de continuar.");
    } else {
      setNotice("No pudimos completar tu registro. Intenta nuevamente.");
    }

    setSubmitting(false);
  }

  if (loading) {
    return (
      <main className="public-shell public-state" aria-busy="true">
        <p className="eyebrow">Door List</p>
        <h1>Cargando evento…</h1>
        <p>Estamos verificando la disponibilidad.</p>
      </main>
    );
  }

  if (unavailable || !data) {
    return (
      <main className="public-shell public-state">
        <p className="eyebrow">Door List</p>
        <h1>Registro no disponible</h1>
        <p className="public-alert error" role="alert" tabIndex={-1} ref={noticeRef}>
          {notice || unavailableMessage()}
        </p>
        {!unavailable && (
          <button type="button" onClick={() => void loadEvent()}>
            Intentar nuevamente
          </button>
        )}
      </main>
    );
  }

  if (confirmation) {
    return (
      <main className="public-shell public-state">
        <p className="eyebrow">Door List</p>
        <div className="success-mark" aria-hidden="true">✓</div>
        <h1>¡Registro confirmado!</h1>
        <p>Tu lugar para <strong>{confirmation.eventTitle}</strong> está reservado.</p>
        <dl className="confirmation-details">
          <div><dt>Entrada</dt><dd>{confirmation.ticketName}</dd></div>
          <div><dt>Nombre</dt><dd>{confirmation.name}</dd></div>
          <div><dt>Email</dt><dd>{confirmation.email}</dd></div>
        </dl>
      </main>
    );
  }

  return (
    <main className="public-shell">
      <section className="event-summary" aria-labelledby="event-title">
        <p className="eyebrow">Registro público</p>
        <h1 id="event-title">{data.event.title}</h1>
        <p className="event-meta">
          {formatEventDate(data.event.event_date)}<br />
          {data.event.venue}
        </p>
        {data.event.description && <p className="event-description">{data.event.description}</p>}
      </section>

      <section className="registration-card" aria-labelledby="registration-title">
        <h2 id="registration-title">Reserva tu entrada</h2>
        <p className="help">Todos los campos son obligatorios.</p>

        {notice && (
          <p className="public-alert error" role="alert" tabIndex={-1} ref={noticeRef}>
            {notice}
          </p>
        )}

        {data.ticket_types.length === 0 ? (
          <p className="public-alert" role="status">
            Este evento todavía no tiene tipos de entrada disponibles.
          </p>
        ) : (
          <form onSubmit={submitRegistration} aria-busy={submitting}>
            <fieldset className="ticket-options" disabled={submitting}>
              <legend>Tipo de entrada</legend>
              {data.ticket_types.map((ticket) => {
                const soldOut = ticket.remaining_capacity < 1;
                return (
                  <label className={`ticket-option${soldOut ? " sold-out" : ""}`} key={ticket.id}>
                    <input
                      type="radio"
                      name="ticket-type"
                      value={ticket.id}
                      checked={selectedTicket === ticket.id}
                      onChange={(event) => setSelectedTicket(event.target.value)}
                      disabled={soldOut || submitting}
                      required
                    />
                    <span>
                      <strong>{ticket.name}</strong>
                      <small>{soldOut ? "Agotada" : `${ticket.remaining_capacity} cupos disponibles`}</small>
                    </span>
                  </label>
                );
              })}
            </fieldset>

            <label>
              Nombre
              <input
                value={name}
                onChange={(event) => setName(event.target.value)}
                maxLength={120}
                autoComplete="name"
                disabled={submitting}
                required
              />
            </label>

            <label>
              Email
              <input
                type="email"
                value={email}
                onChange={(event) => setEmail(event.target.value)}
                maxLength={254}
                autoComplete="email"
                disabled={submitting}
                required
              />
            </label>

            <button
              className="submit-registration"
              disabled={submitting || availableTickets.length === 0}
            >
              {submitting ? "Registrando…" : "Confirmar registro"}
            </button>
          </form>
        )}
      </section>
    </main>
  );
}
