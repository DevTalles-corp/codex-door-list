"use client";

import { FormEvent, useCallback, useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { formatEventDate, formatEventTimeZone } from "@/lib/dates";
import { supabase } from "@/lib/supabase/client";
import EventCover from "@/components/event-cover";
import { publicEventCover } from "@/lib/event-cover";
import type {
  RegistrationData,
  RegistrationErrorCode,
  RegistrationErrorResponse,
  RegistrationSuccessResponse,
} from "@/lib/types";

type Confirmation = {
  eventTitle: string;
  email: string;
  expiresAt: string;
};

function unavailableMessage() {
  return "Este evento no está disponible para registro.";
}

function registrationErrorCode(value: unknown): RegistrationErrorCode | null {
  if (!value || typeof value !== "object" || !("error" in value)) return null;
  const { error } = value as RegistrationErrorResponse;
  return error === "event_unavailable"
    || error === "ticket_unavailable"
    || error === "duplicate_registration"
    || error === "invalid_input"
    || error === "server_error"
    || error === "service_unavailable"
    ? error
    : null;
}

function isRegistrationSuccess(value: unknown): value is RegistrationSuccessResponse {
  if (!value || typeof value !== "object") return false;
  const response = value as RegistrationSuccessResponse;
  return response.status === "pending" && typeof response.expiresAt === "string";
}

export default function PublicRegistration({ eventCode }: { eventCode: string }) {
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
  const confirmationHeadingRef = useRef<HTMLHeadingElement>(null);

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
      { p_code: eventCode },
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
  }, [eventCode]);

  useEffect(() => {
    void Promise.resolve().then(() => loadEvent());
  }, [loadEvent]);

  useEffect(() => {
    if (notice) noticeRef.current?.focus();
  }, [notice]);

  useEffect(() => {
    if (confirmation) confirmationHeadingRef.current?.focus();
  }, [confirmation]);

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

    let result: RegistrationSuccessResponse;
    try {
      const response = await fetch("/api/registrations", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          eventId: data.event.id,
          ticketTypeId: ticket.id,
          name: trimmedName,
          email: normalizedEmail,
        }),
      });

      if (!response.ok) {
        let errorCode: RegistrationErrorCode | null = null;
        try {
          errorCode = registrationErrorCode(await response.json());
        } catch {
          errorCode = null;
        }

        if (errorCode === "event_unavailable") {
          setData(null);
          setUnavailable(true);
          setNotice(unavailableMessage());
        } else if (errorCode === "ticket_unavailable") {
          setSelectedTicket("");
          const refreshed = await loadEvent(false);
          if (refreshed) {
            setNotice("Esa entrada acaba de agotarse. Elige otra opción disponible.");
          }
        } else if (errorCode === "duplicate_registration") {
          setNotice("Este email ya está registrado para el evento.");
        } else if (errorCode === "invalid_input") {
          setNotice("Revisa tu nombre, email y tipo de entrada antes de continuar.");
        } else {
          setNotice("No pudimos completar tu registro. Intenta nuevamente.");
        }

        setSubmitting(false);
        return;
      }

      const responseBody: unknown = await response.json();
      if (!isRegistrationSuccess(responseBody)) throw new Error("Invalid registration response");
      result = responseBody;
    } catch {
      setNotice("No pudimos completar tu registro. Intenta nuevamente.");
      setSubmitting(false);
      return;
    }

    setConfirmation({
      eventTitle: data.event.title,
      email: normalizedEmail,
      expiresAt: result.expiresAt,
    });
    setSubmitting(false);
  }

  if (loading) {
    return (
      <main className="page-shell public-page" aria-busy="true">
        <p className="visually-hidden" role="status">Cargando evento…</p>
        <Link className="back-link public-navigation" href="/">Ver otros eventos</Link>
        <header className="public-event-header" aria-hidden="true">
          <div className="public-event-summary">
            <span className="skeleton skeleton-title" />
            <span className="skeleton skeleton-secondary" />
            <span className="skeleton skeleton-primary" />
          </div>
          <span className="skeleton skeleton-field registration-shortcut" />
          <div className="event-cover skeleton" />
        </header>
        <div className="registration-card" aria-hidden="true">
          <span className="skeleton skeleton-section-title" />
          <span className="skeleton skeleton-secondary" />
          <span className="skeleton skeleton-field" />
          <span className="skeleton skeleton-field" />
          <span className="skeleton skeleton-field" />
        </div>
      </main>
    );
  }

  if (unavailable || !data) {
    return (
      <main className="page-shell state-page public-registration-state">
        <div className="data-state">
          <h1>Registro no disponible</h1>
          <p className="alert alert-error" role="alert" tabIndex={-1} ref={noticeRef}>
            {notice || unavailableMessage()}
          </p>
          {!unavailable && (
            <button className="button button-primary" type="button" onClick={() => void loadEvent()}>
              Intentar nuevamente
            </button>
          )}
          <Link className="back-link public-navigation" href="/">Ver otros eventos</Link>
        </div>
      </main>
    );
  }

  if (confirmation) {
    return (
      <main className="page-shell state-page public-registration-state">
        <div className="confirmation-card">
          <div className="success-mark" aria-hidden="true">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <path d="m5 12 4 4L19 6" />
            </svg>
          </div>
          <h1 className="registration-heading" tabIndex={-1} ref={confirmationHeadingRef}>Revisa tu email</h1>
          <p>Reservamos un lugar para <strong>{confirmation.eventTitle}</strong> durante 10 minutos.</p>
          <p className="alert alert-success" role="status">Enviamos un enlace a <strong>{confirmation.email}</strong>. Ábrelo antes de {formatEventDate(confirmation.expiresAt, data.event.time_zone)} · {formatEventTimeZone(confirmation.expiresAt, data.event.time_zone)} para confirmar tu reserva y recibir la entrada.</p>
          <Link className="back-link public-navigation" href="/">Ver otros eventos</Link>
        </div>
      </main>
    );
  }

  const hasLongDescription = Boolean(data.event.description && (
    data.event.description.length > 280 || data.event.description.split("\n").length > 4
  ));

  return (
    <main className="page-shell public-page">
      <Link className="back-link public-navigation" href="/">Ver otros eventos</Link>
      <header className="public-event-header">
        <div className="public-event-summary">
          <h1 id="event-title">{data.event.title}</h1>
          <p className="event-meta">
            <time dateTime={data.event.event_date}>
              {formatEventDate(data.event.event_date, data.event.time_zone)} · {formatEventTimeZone(data.event.event_date, data.event.time_zone)}
            </time>
            <span>{data.event.venue}</span>
          </p>
        </div>
        {availableTickets.length > 0 && (
          <a className="button button-primary registration-shortcut" href="#registration-title">
            Reservar entrada
          </a>
        )}
        <EventCover title={data.event.title} cover={publicEventCover(data.event.cover, data.event.title)} sizes="(max-width: 700px) min(calc(100vw - 2rem), 480px), (max-width: 1056px) calc((100vw - 6rem) / 2), 480px" loading="eager" />
        {data.event.description && (hasLongDescription ? (
          <details className="event-description-details">
            <summary>Detalles del evento</summary>
            <p className="event-description">{data.event.description}</p>
          </details>
        ) : <p className="event-description">{data.event.description}</p>)}
      </header>

      <section className="registration-card" aria-labelledby="registration-title">
        <div className="registration-intro">
          <h2 className="registration-heading" id="registration-title" tabIndex={-1}>Reserva tu entrada</h2>
          {availableTickets.length > 0 && <p className="field-help">Todos los campos son obligatorios.</p>}
        </div>

        {notice && (
          <p className="alert alert-error" role="alert" tabIndex={-1} ref={noticeRef}>
            {notice}
          </p>
        )}

        {data.ticket_types.length === 0 ? (
          <div className="inline-state">
            <strong>No hay entradas disponibles</strong>
            <p>Este evento todavía no tiene tipos de entrada para reservar.</p>
          </div>
        ) : availableTickets.length === 0 ? (
          <div className="inline-state">
            <h3>Entradas agotadas</h3>
            <p>Ya no quedan cupos disponibles para este evento.</p>
            <Link className="back-link public-navigation" href="/">Ver otros eventos</Link>
          </div>
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

            <label htmlFor="attendee-name">
              Nombre completo
              <input
                id="attendee-name"
                name="name"
                value={name}
                onChange={(event) => setName(event.target.value)}
                maxLength={120}
                autoComplete="name"
                disabled={submitting}
                required
              />
            </label>

            <label htmlFor="attendee-email">
              Email
              <input
                id="attendee-email"
                name="email"
                type="email"
                value={email}
                onChange={(event) => setEmail(event.target.value)}
                maxLength={254}
                autoComplete="email"
                autoCapitalize="none"
                spellCheck={false}
                aria-describedby="confirmation-help"
                disabled={submitting}
                required
              />
            </label>

            <p className="field-help registration-confirmation-help" id="confirmation-help">
              Recibirás un enlace por email. Tendrás 10 minutos para confirmar tu reserva.
            </p>

            <button
              className="button button-primary submit-registration"
              type="submit"
              disabled={submitting || availableTickets.length === 0}
            >
              {submitting ? "Reservando…" : "Enviar enlace de confirmación"}
            </button>
          </form>
        )}
      </section>
    </main>
  );
}
