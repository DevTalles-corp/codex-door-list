"use client";

import Link from "next/link";
import { useCallback, useEffect, useState } from "react";
import { QRCodeSVG } from "qrcode.react";
import { formatEventDate } from "@/lib/dates";
import { supabase } from "@/lib/supabase/client";
import type { Ticket, TicketStatus } from "@/lib/types";
import TicketLoading from "./ticket-loading";

const statusLabels: Record<TicketStatus, string> = {
  valid: "Válida",
  used: "Utilizada",
  revoked: "Revocada",
};

type CopyStatus = "idle" | "copied" | "error";

function formatBackupCode(code: string) {
  return code.match(/.{1,4}/g)?.join(" ") ?? code;
}

export default function PublicTicket({ code }: { code: string }) {
  const [ticket, setTicket] = useState<Ticket | null>(null);
  const [loading, setLoading] = useState(true);
  const [notFound, setNotFound] = useState(false);
  const [loadError, setLoadError] = useState(false);
  const [copyStatus, setCopyStatus] = useState<CopyStatus>("idle");

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

    setTicket(data as Ticket);
    setLoading(false);
  }, [code]);

  useEffect(() => {
    void Promise.resolve().then(() => loadTicket());
  }, [loadTicket]);

  const handleCopyCode = async () => {
    if (!ticket) {
      return;
    }

    try {
      await navigator.clipboard.writeText(ticket.code);
      setCopyStatus("copied");
    } catch {
      setCopyStatus("error");
    }
  };

  if (loading) {
    return <TicketLoading />;
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
        <Link className="button button-secondary" href="/">
          Volver a eventos
        </Link>
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
            {ticket.status === "valid" && (
              <svg
                aria-hidden="true"
                fill="none"
                viewBox="0 0 24 24"
              >
                <path
                  d="m5 12 4 4L19 6"
                  stroke="currentColor"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth="2"
                />
              </svg>
            )}
            {statusLabels[ticket.status]}
          </span>
        </div>

        <div className="ticket-body">
          <div className="ticket-qr">
            <QRCodeSVG
              value={ticket.code}
              size={220}
              level="H"
              marginSize={2}
              title={`Código QR de la entrada para ${ticket.attendee.name}`}
            />
            <p className="ticket-instruction">
              Presenta este código QR al ingresar.
            </p>
          </div>

          <div className="ticket-details">
            <section aria-labelledby="ticket-attendee-heading">
              <h2 id="ticket-attendee-heading">Tu entrada</h2>
              <dl>
                <div><dt>Asistente</dt><dd>{ticket.attendee.name}</dd></div>
                <div><dt>Tipo de entrada</dt><dd>{ticket.ticket_type.name}</dd></div>
              </dl>
            </section>

            <section aria-labelledby="ticket-event-heading">
              <h2 id="ticket-event-heading">Evento</h2>
              <dl>
                <div><dt>Fecha</dt><dd>{formatEventDate(ticket.event.event_date)}</dd></div>
                <div><dt>Lugar</dt><dd>{ticket.event.venue}</dd></div>
              </dl>
            </section>
          </div>
        </div>

        {ticket.status !== "valid" && (
          <p className={`ticket-warning ${ticket.status}`} role="status">
            {ticket.status === "used"
              ? "Esta entrada ya fue utilizada."
              : "Esta entrada fue revocada y ya no es válida para ingresar."}
          </p>
        )}

        <details className="ticket-backup">
          <summary>Ver datos de respaldo</summary>
          <div className="ticket-backup-content">
            <dl>
              <div><dt>Email</dt><dd>{ticket.attendee.email}</dd></div>
            </dl>
            <div>
              <p className="ticket-backup-label">Código de respaldo</p>
              <code className="ticket-code">
                {formatBackupCode(ticket.code)}
              </code>
            </div>
            <button
              className="button-secondary"
              type="button"
              onClick={() => void handleCopyCode()}
            >
              {copyStatus === "copied" ? "Código copiado" : "Copiar código"}
            </button>
            {copyStatus === "copied" && (
              <p className="ticket-copy-feedback" role="status">
                Código copiado.
              </p>
            )}
            {copyStatus === "error" && (
              <p className="ticket-copy-feedback error" role="alert">
                No pudimos copiar el código. Selecciónalo e inténtalo nuevamente.
              </p>
            )}
          </div>
        </details>

        <div className="ticket-actions">
          <button
            className="button-secondary"
            type="button"
            onClick={() => window.print()}
          >
            Imprimir o guardar
          </button>
        </div>
      </section>
    </main>
  );
}
