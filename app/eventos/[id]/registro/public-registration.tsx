"use client";

import Link from "next/link";
import { FormEvent, useCallback, useEffect, useMemo, useRef, useState } from "react";
import { formatEventDate } from "@/lib/dates";
import { supabase } from "@/lib/supabase/client";
import type {
  RegistrationData,
  RegistrationErrorCode,
  RegistrationErrorResponse,
  RegistrationSuccessResponse,
} from "@/lib/types";

type Confirmation = {
  eventTitle: string;
  ticketName: string;
  name: string;
  email: string;
  ticketCode: string;
  emailSent: boolean;
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
  return typeof response.registrationId === "string"
    && typeof response.ticketCode === "string"
    && typeof response.emailSent === "boolean";
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
      ticketName: ticket.name,
      name: trimmedName,
      email: normalizedEmail,
      ticketCode: result.ticketCode,
      emailSent: result.emailSent,
    });
    setSubmitting(false);
  }

  if (loading) {
    return (
      <main className="page-shell public-page" aria-busy="true">
        <p className="visually-hidden" role="status">Cargando evento…</p>
        <header className="public-event-header" aria-hidden="true">
          <span className="skeleton skeleton-compact" />
          <span className="skeleton skeleton-title" />
          <span className="skeleton skeleton-secondary" />
          <span className="skeleton skeleton-primary" />
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
      <main className="page-shell state-page">
        <div className="data-state">
          <p className="eyebrow">Door List</p>
          <h1>Registro no disponible</h1>
          <p className="alert alert-error" role="alert" tabIndex={-1} ref={noticeRef}>
            {notice || unavailableMessage()}
          </p>
          {!unavailable && (
            <button className="button button-primary" type="button" onClick={() => void loadEvent()}>
              Intentar nuevamente
            </button>
          )}
        </div>
      </main>
    );
  }

  if (confirmation) {
    return (
      <main className="page-shell state-page">
        <div className="confirmation-card">
          <p className="eyebrow">Door List</p>
          <div className="success-mark" aria-hidden="true">✓</div>
          <h1>¡Registro confirmado!</h1>
          <p>Tu lugar para <strong>{confirmation.eventTitle}</strong> está reservado.</p>
          <p className={`alert ${confirmation.emailSent ? "alert-success" : "alert-warning"}`} role="status">
            {confirmation.emailSent
              ? `Enviamos la entrada con el QR a ${confirmation.email}.`
              : "Tu entrada fue creada, pero no pudimos enviarla por email. Puedes abrirla desde el enlace de abajo."}
          </p>
          <dl className="confirmation-details">
            <div><dt>Entrada</dt><dd>{confirmation.ticketName}</dd></div>
            <div><dt>Nombre</dt><dd>{confirmation.name}</dd></div>
            <div><dt>Email</dt><dd>{confirmation.email}</dd></div>
          </dl>
          <Link className="button button-primary" href={`/entradas/${confirmation.ticketCode}`}>
            Ver mi entrada y código QR
          </Link>
        </div>
      </main>
    );
  }

  return (
    <main className="page-shell public-page">
      <header className="public-event-header">
        <p className="eyebrow">Registro público</p>
        <h1 id="event-title">{data.event.title}</h1>
        <p className="event-meta">
          {formatEventDate(data.event.event_date)}<br />
          {data.event.venue}
        </p>
        {data.event.description && <p className="event-description">{data.event.description}</p>}
      </header>

      <section className="registration-card" aria-labelledby="registration-title">
        <h2 id="registration-title">Reserva tu entrada</h2>
        <p className="field-help">Todos los campos son obligatorios.</p>

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
                disabled={submitting}
                required
              />
            </label>

            <button
              className="button button-primary submit-registration"
              type="submit"
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
