"use client";

import { useCallback, useEffect, useState } from "react";
import { QRCodeSVG } from "qrcode.react";
import { supabase } from "../../lib/supabase";

type TicketStatus = "valid" | "used" | "revoked";

type TicketData = {
  code: string;
  status: TicketStatus;
  issued_at: string;
  attendee: {
    name: string;
    email: string;
  };
  event: {
    title: string;
    event_date: string;
    venue: string;
  };
  ticket_type: {
    name: string;
  };
};

const statusLabels: Record<TicketStatus, string> = {
  valid: "Válida",
  used: "Utilizada",
  revoked: "Revocada",
};

function formatEventDate(value: string) {
  return new Intl.DateTimeFormat("es-BO", {
    dateStyle: "full",
    timeStyle: "short",
    timeZone: "America/La_Paz",
  }).format(new Date(value));
}

export default function PublicTicket({ code }: { code: string }) {
  const [ticket, setTicket] = useState<TicketData | null>(null);
  const [loading, setLoading] = useState(true);
  const [notFound, setNotFound] = useState(false);
  const [loadError, setLoadError] = useState(false);

  const loadTicket = useCallback(async () => {
    setLoading(true);
    setLoadError(false);
    setNotFound(false);

    if (!supabase) {
      setLoadError(true);
      setLoading(false);
      return;
    }

    if (!/^[0-9a-f]{64}$/.test(code)) {
      setNotFound(true);
      setLoading(false);
      return;
    }

    const { data, error } = await supabase.rpc("get_public_ticket", {
      p_code: code,
    });

    if (error) {
      setLoadError(true);
      setLoading(false);
      return;
    }

    if (!data) {
      setNotFound(true);
      setLoading(false);
      return;
    }

    setTicket(data as TicketData);
    setLoading(false);
  }, [code]);

  useEffect(() => {
    void Promise.resolve().then(() => loadTicket());
  }, [loadTicket]);

  if (loading) {
    return (
      <main className="ticket-shell ticket-state" aria-busy="true">
        <p className="eyebrow">Door List</p>
        <h1>Cargando entrada…</h1>
        <p>Estamos verificando el código.</p>
      </main>
    );
  }

  if (notFound || !ticket) {
    return (
      <main className="ticket-shell ticket-state">
        <p className="eyebrow">Door List</p>
        <h1>Entrada no encontrada</h1>
        <p className="public-alert error" role="alert">
          {loadError
            ? "No pudimos consultar la entrada en este momento."
            : "El enlace no corresponde a una entrada disponible."}
        </p>
        {loadError && (
          <button type="button" onClick={() => void loadTicket()}>
            Intentar nuevamente
          </button>
        )}
      </main>
    );
  }

  return (
    <main className="ticket-shell">
      <section className="ticket-card" aria-labelledby="ticket-event-title">
        <div className="ticket-heading">
          <div>
            <p className="eyebrow">Entrada digital</p>
            <h1 id="ticket-event-title">{ticket.event.title}</h1>
          </div>
          <span className={`ticket-status ${ticket.status}`}>
            {statusLabels[ticket.status]}
          </span>
        </div>

        <div className="ticket-body">
          <dl className="ticket-details">
            <div><dt>Asistente</dt><dd>{ticket.attendee.name}</dd></div>
            <div><dt>Email</dt><dd>{ticket.attendee.email}</dd></div>
            <div><dt>Tipo de entrada</dt><dd>{ticket.ticket_type.name}</dd></div>
            <div><dt>Fecha</dt><dd>{formatEventDate(ticket.event.event_date)}</dd></div>
            <div><dt>Lugar</dt><dd>{ticket.event.venue}</dd></div>
          </dl>

          <div className="ticket-qr">
            <QRCodeSVG
              value={ticket.code}
              size={220}
              level="H"
              marginSize={2}
              title={`Código QR de la entrada para ${ticket.attendee.name}`}
            />
            <p className="ticket-code">{ticket.code}</p>
          </div>
        </div>

        {ticket.status !== "valid" && (
          <p className={`ticket-warning ${ticket.status}`} role="status">
            {ticket.status === "used"
              ? "Esta entrada ya fue utilizada."
              : "Esta entrada fue revocada y ya no es válida para ingresar."}
          </p>
        )}
      </section>
    </main>
  );
}
