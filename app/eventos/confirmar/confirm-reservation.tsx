"use client";

import Link from "next/link";
import { useState } from "react";
import type { ConfirmationResponse } from "@/lib/types";

export default function ConfirmReservation({ token }: { token: string }) {
  const [state, setState] = useState<"idle" | "submitting" | "success" | "error">("idle");
  const [error, setError] = useState("");
  const [result, setResult] = useState<ConfirmationResponse | null>(null);

  async function confirm() {
    if (state === "submitting") return;
    setState("submitting"); setError("");
    try {
      const response = await fetch("/api/registrations/confirmar", {
        method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ token }),
      });
      if (!response.ok) {
        setError(response.status === 409 ? "El enlace ya se usó o venció. Inicia una nueva reserva." : "No pudimos confirmar tu reserva. Intenta nuevamente.");
        setState("error"); return;
      }
      const data = await response.json() as ConfirmationResponse;
      setResult(data); setState("success");
    } catch {
      setError("No pudimos confirmar tu reserva. Intenta nuevamente."); setState("error");
    }
  }

  return <main className="page-shell state-page"><section className="confirmation-card" aria-labelledby="confirmation-title">
    <p className="eyebrow">Door List</p>
    <h1 id="confirmation-title">Confirma tu reserva</h1>
    {result ? <>
      <p className="alert alert-success" role="status">Tu entrada está confirmada.{result.emailSent ? " También la enviamos a tu email." : " Puedes abrirla aquí."}</p>
      <Link className="button button-primary" href={`/entradas/${result.ticketCode}`}>Ver mi entrada</Link>
    </> : <>
      <p>Confirma tu email para emitir la entrada reservada.</p>
      {error || !/^[0-9a-f]{64}$/.test(token) ? <p className="alert alert-error" role="alert">{error || "El enlace de confirmación no es válido. Abre el enlace del email o inicia una nueva reserva."}</p> : null}
      <button className="button button-primary" type="button" onClick={() => void confirm()} disabled={state === "submitting" || !/^[0-9a-f]{64}$/.test(token)}>
        {state === "submitting" ? "Confirmando…" : "Confirmar reserva"}
      </button>
    </>}
  </section></main>;
}
