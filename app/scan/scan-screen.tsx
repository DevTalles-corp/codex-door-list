"use client";

import Link from "next/link";
import { FormEvent, useCallback, useEffect, useRef, useState } from "react";
import QrScanner from "qr-scanner";
import { useOrganizerSession } from "@/components/organizer-auth";
import { toLaPazDateKey } from "@/lib/dates";
import { getOrganizerEvents } from "@/lib/organizer-dashboard";
import { supabase } from "@/lib/supabase/client";
import type { CheckInSuccessResponse, OrganizerEventSummary } from "@/lib/types";

type Result =
  | { status: "valid"; attendeeName: string; ticketTypeName: string }
  | { status: "used" | "not_found" | "error" };
type CameraState = "idle" | "starting" | "scanning" | "unavailable";

function TicketScanner({ eventId }: { eventId: string }) {
  const session = useOrganizerSession();
  const videoRef = useRef<HTMLVideoElement>(null);
  const scannerRef = useRef<QrScanner | null>(null);
  const busyRef = useRef(false);
  const [cameraState, setCameraState] = useState<CameraState>("idle");
  const [result, setResult] = useState<Result | null>(null);
  const [validating, setValidating] = useState(false);
  const [manualOpen, setManualOpen] = useState(false);
  const [manualCode, setManualCode] = useState("");

  const stopCamera = useCallback(() => {
    scannerRef.current?.stop();
    scannerRef.current?.destroy();
    scannerRef.current = null;
    setCameraState("idle");
  }, []);

  useEffect(() => () => {
    scannerRef.current?.stop();
    scannerRef.current?.destroy();
    scannerRef.current = null;
  }, []);

  const validateCode = useCallback(async (code: string) => {
    if (busyRef.current) return;
    busyRef.current = true;
    scannerRef.current?.stop();
    scannerRef.current?.destroy();
    scannerRef.current = null;
    setCameraState("idle");
    setValidating(true);
    setResult(null);
    try {
      const response = await fetch("/api/entradas/check-in", {
        method: "POST",
        cache: "no-store",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${session.access_token}`,
        },
        body: JSON.stringify({ eventId, ticketCode: code }),
      });
      if (!response.ok) {
        setResult({ status: response.status === 409 ? "used" : response.status === 404 ? "not_found" : "error" });
        return;
      }
      const data = (await response.json()) as CheckInSuccessResponse;
      setResult({ status: "valid", attendeeName: data.attendeeName, ticketTypeName: data.ticketTypeName });
      setManualCode("");
    } catch {
      setResult({ status: "error" });
    } finally {
      busyRef.current = false;
      setValidating(false);
    }
  }, [eventId, session.access_token]);

  async function startCamera() {
    if (cameraState === "starting" || validating) return;
    stopCamera();
    setResult(null);
    setManualOpen(false);
    setCameraState("starting");
    await new Promise<void>((resolve) => requestAnimationFrame(() => resolve()));
    if (!videoRef.current) return;
    const scanner = new QrScanner(videoRef.current, (scan) => {
      void validateCode(scan.data);
    }, {
      preferredCamera: "environment",
      returnDetailedScanResult: true,
      maxScansPerSecond: 12,
    });
    scannerRef.current = scanner;
    try {
      await scanner.start();
      if (scannerRef.current === scanner) setCameraState("scanning");
    } catch {
      if (scannerRef.current === scanner) {
        scanner.destroy();
        scannerRef.current = null;
        setCameraState("unavailable");
      }
    }
  }

  function handleManualSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    void validateCode(manualCode.trim());
  }

  const resultTitle = result?.status === "valid" ? "Entrada válida"
    : result?.status === "used" ? "Entrada usada"
      : result?.status === "not_found" ? "No encontrada" : "No se pudo validar";

  return (
    <section className="scan-workspace" aria-labelledby="scan-camera-heading">
      <div className="section-heading"><h2 id="scan-camera-heading">Lector de entradas</h2></div>
      <div className={`scan-viewfinder${result || validating ? " scan-viewfinder-collapsed" : ""}`} aria-hidden={Boolean(result || validating)}>
        <video ref={videoRef} muted playsInline aria-label="Vista de la cámara para leer el QR" />
        <div className="scan-aim" aria-hidden="true" />
        <p className="scan-viewfinder-label">{cameraState === "scanning" ? "Apunta al código QR" : "La cámara está apagada"}</p>
      </div>
      {cameraState === "unavailable" ? (
        <p className="alert alert-warning" role="alert">No pudimos abrir la cámara. Revisa el permiso o ingresa el código de respaldo.</p>
      ) : null}
      {validating ? <div className="scan-result scan-result-pending" role="status" aria-busy="true"><h2>Validando entrada…</h2></div> : null}
      {result ? (
        <div className={`scan-result scan-result-${result.status}`} role={result.status === "error" ? "alert" : "status"}>
          <h2>{resultTitle}</h2>
          {result.status === "valid" ? <p><strong>{result.attendeeName}</strong><span>{result.ticketTypeName} · Ingreso registrado</span></p> : null}
          {result.status === "used" ? <p>Esta entrada ya registró un ingreso.</p> : null}
          {result.status === "not_found" ? <p>Comprueba el código y el evento seleccionado.</p> : null}
          {result.status === "error" ? <p>No pudimos comprobar la entrada. Intenta nuevamente.</p> : null}
        </div>
      ) : null}
      <div className="scan-actions">
        {cameraState === "scanning" ? (
          <button className="button button-primary scan-main-action" type="button" onClick={stopCamera}>Detener cámara</button>
        ) : (
          <button className="button button-primary scan-main-action" type="button" onClick={() => void startCamera()} disabled={cameraState === "starting" || validating}>
            {cameraState === "starting" ? "Abriendo cámara…" : result ? "Escanear otra entrada" : "Abrir cámara"}
          </button>
        )}
        <button className="button button-secondary scan-secondary-action" type="button" disabled={validating} onClick={() => { stopCamera(); setManualOpen((open) => !open); }}>
          {manualOpen ? "Cerrar ingreso manual" : "Ingresar código manualmente"}
        </button>
      </div>
      {manualOpen ? (
        <form className="scan-manual-form" onSubmit={handleManualSubmit} aria-busy={validating}>
          <label htmlFor="ticket-code">Código de respaldo</label>
          <input id="ticket-code" className="scan-code-input" value={manualCode} onChange={(event) => setManualCode(event.target.value)} autoCapitalize="none" autoCorrect="off" autoComplete="off" spellCheck={false} inputMode="text" placeholder="Pega o escribe el código" required />
          <button className="button button-primary" type="submit" disabled={validating}>{validating ? "Validando…" : "Validar entrada"}</button>
        </form>
      ) : null}
    </section>
  );
}

export default function ScanScreen({ initialEventId }: { initialEventId: string }) {
  const session = useOrganizerSession();
  const [events, setEvents] = useState<OrganizerEventSummary[]>([]);
  const [eventId, setEventId] = useState(initialEventId);
  const [loadState, setLoadState] = useState<"loading" | "error" | "ready">("loading");

  const loadEvents = useCallback(async () => {
    if (!supabase) return;
    setLoadState("loading");
    try {
      const data = await getOrganizerEvents(supabase, session.user.id);
      const today = toLaPazDateKey(new Date());
      const currentEvents = data.filter((event) => event.status === "published" && toLaPazDateKey(event.eventDate) === today);
      setEvents(currentEvents);
      setEventId((current) => currentEvents.some((item) => item.id === current) ? current : currentEvents[0]?.id ?? "");
      setLoadState("ready");
    } catch {
      setLoadState("error");
    }
  }, [session.user.id]);

  useEffect(() => { void Promise.resolve().then(loadEvents); }, [loadEvents]);

  return (
    <main className="page-shell scan-page">
      <header className="page-header scan-header">
        <div><Link className="back-link" href="/dashboard">← Panel del organizador</Link><h1>Control de acceso</h1><p className="page-description">Valida una entrada por vez en la puerta.</p></div>
      </header>
      {loadState === "loading" ? <div className="data-state" role="status" aria-busy="true"><span className="skeleton skeleton-title" aria-hidden="true" /><p>Cargando eventos…</p></div> : null}
      {loadState === "error" ? <div className="data-state"><p className="alert alert-error" role="alert">No pudimos cargar tus eventos.</p><button className="button button-primary" type="button" onClick={() => void loadEvents()}>Intentar nuevamente</button></div> : null}
      {loadState === "ready" && events.length === 0 ? <div className="data-state"><h2>No hay eventos para hoy</h2><p>El lector estará disponible el día de un evento publicado.</p><Link className="button button-secondary" href="/dashboard">Ir al panel</Link></div> : null}
      {loadState === "ready" && events.length > 0 ? (
        <>
          <div className="scan-event-select"><label htmlFor="scan-event">Evento</label><select id="scan-event" value={eventId} onChange={(event) => setEventId(event.target.value)}>{events.map((event) => <option key={event.id} value={event.id}>{event.title}</option>)}</select></div>
          <TicketScanner key={eventId} eventId={eventId} />
        </>
      ) : null}
    </main>
  );
}

