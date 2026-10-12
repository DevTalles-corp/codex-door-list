"use client";

import { useCallback, useEffect, useId, useRef, useState } from "react";
import EventCover from "@/components/event-cover";
import { maxEventCoverBytes, newClientCoverOperationId, normalizeCoverAlt } from "@/lib/event-cover";
import { supabase } from "@/lib/supabase/client";
import type { ConfirmEventCoverRequest, EventCoverEditorStatus, EventCoverOperationResult, EventCoverProcessingResponse, EventCoverState, PrepareEventCoverResponse } from "@/lib/event-cover-types";

class CoverRequestError extends Error {
  constructor(public status: number, message: string) { super(message); }
}

export default function EventCoverEditor({ eventId, title, accessToken, onBusyChange, disabled = false }: {
  eventId: string; title: string; accessToken: string; onBusyChange: (busy: boolean) => void; disabled?: boolean;
}) {
  const [saved, setSaved] = useState<EventCoverState | null>(null);
  const [loading, setLoading] = useState(true);
  const [status, setStatus] = useState<EventCoverEditorStatus>("idle");
  const [message, setMessage] = useState("");
  const [file, setFile] = useState<File | null>(null);
  const [preview, setPreview] = useState<string | null>(null);
  const [altText, setAltText] = useState("");
  const [positionX, setPositionX] = useState(50);
  const [positionY, setPositionY] = useState(50);
  const [previewDimensions, setPreviewDimensions] = useState<{ width: number; height: number } | null>(null);
  const pending = useRef<ConfirmEventCoverRequest | null>(null);
  const pendingMethod = useRef<"POST" | "PATCH" | "DELETE">("POST");
  const hydrated = useRef(false);
  const objectUrl = useRef<string | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);
  const errorRef = useRef<HTMLParagraphElement>(null);
  const id = useId(); const base = `/api/eventos/${eventId}/portada`;
  const busy = ["preparing", "uploading", "validating", "saving", "removing", "unknown"].includes(status);
  const changed = !!file || !!saved?.cover && (normalizeCoverAlt(altText) !== saved.cover.altText
    || positionX / 100 !== saved.cover.positionX || positionY / 100 !== saved.cover.positionY);

  const api = useCallback(async <T,>(url: string, method = "GET", body?: unknown): Promise<{ data: T; status: number }> => {
    const response = await fetch(url, { method, headers: { Authorization: `Bearer ${accessToken}`, "Content-Type": "application/json" },
      ...(body === undefined ? {} : { body: JSON.stringify(body) }), cache: "no-store", signal: AbortSignal.timeout(130_000) });
    if (!response.ok) {
      const data = await response.json().catch(() => null);
      throw new CoverRequestError(response.status, typeof data?.error === "string" ? data.error : "No pudimos guardar la portada. Intenta nuevamente.");
    }
    return { data: await response.json(), status: response.status };
  }, [accessToken]);

  const restore = useCallback((state: EventCoverState) => {
    if (objectUrl.current) URL.revokeObjectURL(objectUrl.current);
    objectUrl.current = null; setPreview(null); setPreviewDimensions(null); setFile(null); pending.current = null;
    if (fileRef.current) fileRef.current.value = "";
    setAltText(state.cover?.altText ?? ""); setPositionX((state.cover?.positionX ?? 0.5) * 100); setPositionY((state.cover?.positionY ?? 0.5) * 100);
  }, []);

  useEffect(() => {
    if (hydrated.current) return;
    let cancelled = false;
    void api<EventCoverState>(base).then(({ data }) => { if (!cancelled) { hydrated.current = true; setSaved(data); restore(data); setLoading(false); } })
      .catch((error) => { if (!cancelled) { setMessage(error instanceof CoverRequestError ? error.message : "No pudimos cargar la portada. Intenta nuevamente."); setStatus("failed"); setLoading(false); } });
    return () => { cancelled = true; };
  }, [api, base, restore]);
  useEffect(() => () => { if (objectUrl.current) URL.revokeObjectURL(objectUrl.current); onBusyChange(false); }, [onBusyChange]);
  useEffect(() => { if (["failed", "conflict"].includes(status)) errorRef.current?.focus(); }, [status, message]);

  function stage(next: EventCoverEditorStatus, text: string) { setStatus(next); setMessage(text); onBusyChange(["preparing", "uploading", "validating", "saving", "removing", "unknown"].includes(next)); }
  function draft() { pending.current = null; if (status !== "conflict") { setStatus("draft"); setMessage(""); } }
  function selectFile(next: File | undefined) {
    if (!next) return;
    if (next.size === 0 || next.size > maxEventCoverBytes) { stage("failed", next.size > maxEventCoverBytes ? "La portada supera el máximo de 5 MiB." : "El archivo está vacío. Elige otra imagen."); return; }
    if (objectUrl.current) URL.revokeObjectURL(objectUrl.current);
    const url = URL.createObjectURL(next); objectUrl.current = url;
    setFile(next); setPreview(url); setAltText(""); setPositionX(50); setPositionY(50); setPreviewDimensions(null); draft();
    const image = new window.Image(); image.src = url;
    image.onload = () => { if (objectUrl.current === url) setPreviewDimensions({ width: image.naturalWidth, height: image.naturalHeight }); };
  }

  async function acceptSuccess(state: EventCoverState) {
    const removed = pendingMethod.current === "DELETE";
    let current = state; let refreshed = true;
    try { current = (await api<EventCoverState>(base)).data; } catch { refreshed = false; }
    setSaved(current); restore(current);
    stage("success", `${removed ? "Portada retirada." : "Portada guardada."}${refreshed ? "" : " No pudimos recargar su estado actual; comprueba de nuevo."}`);
    if (removed) requestAnimationFrame(() => fileRef.current?.focus());
  }

  async function recover() {
    if (!pending.current) return;
    stage("unknown", "Estamos comprobando si se guardó la portada…");
    try {
      const { data } = await api<EventCoverOperationResult>(`${base}/operaciones/${pending.current.operationId}`);
      if (data.status === "committed" && data.result) {
        await acceptSuccess(data.result);
      } else if (["rejected", "expired", "conflict"].includes(data.status)) {
        stage(data.status === "conflict" ? "conflict" : "failed", data.error ?? "No se guardó la portada. Revisa la selección y vuelve a intentarlo.");
        if (data.status !== "conflict") pending.current = null;
      } else if (data.status === "pending") {
        stage("failed", "La operación no terminó. Puedes reintentar el guardado.");
      } else setMessage("La portada sigue en proceso. Comprueba de nuevo en unos segundos.");
    } catch { setMessage("No pudimos comprobar el resultado. Comprueba de nuevo antes de guardar otra portada."); }
  }

  async function save() {
    if (!saved || busy || disabled || !supabase || !changed) return;
    // A retry belongs to its original action; saving a draft must never repeat removal.
    if (pendingMethod.current === "DELETE") pending.current = null;
    try {
      if (!pending.current && file) {
        pendingMethod.current = "POST";
        stage("preparing", "Preparando subida…");
        const { data } = await api<PrepareEventCoverResponse>(`${base}/subidas`, "POST", { expectedRevision: saved.revision, byteSize: file.size });
        stage("uploading", "Subiendo portada…");
        // Browser FormData uses the Blob's MIME, independently of SDK contentType.
        const uploadBytes = new Blob([file], { type: "application/octet-stream" });
        const { error } = await supabase.storage.from(data.upload.bucket).uploadToSignedUrl(data.upload.path, data.upload.token, uploadBytes, { contentType: "application/octet-stream", upsert: false });
        if (error) throw new CoverRequestError(503, "No pudimos subir la imagen. Conservamos tus cambios para reintentar.");
        pending.current = { operationId: data.operationId, expectedRevision: saved.revision, altText: normalizeCoverAlt(altText), positionX: positionX / 100, positionY: positionY / 100 };
      }
      if (!pending.current) {
        pendingMethod.current = "PATCH";
        pending.current = { operationId: newClientCoverOperationId(), expectedRevision: saved.revision, altText: normalizeCoverAlt(altText), positionX: positionX / 100, positionY: positionY / 100 };
      }
      stage(pendingMethod.current === "POST" ? "validating" : "saving", pendingMethod.current === "POST" ? "Validando portada…" : "Guardando portada…");
      const result = await api<EventCoverState | EventCoverProcessingResponse>(pendingMethod.current === "POST" ? `${base}/confirmar` : base, pendingMethod.current, pending.current);
      if (result.status === 202) { await recover(); return; }
      await acceptSuccess(result.data as EventCoverState);
    } catch (error) {
      if ((!(error instanceof CoverRequestError) || error.status >= 500) && pending.current) { await recover(); return; }
      if (error instanceof CoverRequestError) {
        stage(error.status === 409 ? "conflict" : "failed", error.message);
        if ([413, 422].includes(error.status)) pending.current = null;
      } else stage("failed", "No pudimos iniciar la subida. Conservamos tus cambios para reintentar.");
    }
  }

  async function remove() {
    if (!saved?.cover || busy || disabled) return;
    if (!pending.current || pendingMethod.current !== "DELETE") {
      pendingMethod.current = "DELETE";
      pending.current = { operationId: newClientCoverOperationId(), expectedRevision: saved.revision };
    }
    stage("removing", "Quitando portada…");
    try { await acceptSuccess((await api<EventCoverState>(base, "DELETE", pending.current)).data); }
    catch (error) {
      if (!(error instanceof CoverRequestError) || error.status >= 500) await recover();
      else stage(error.status === 409 ? "conflict" : "failed", error.message);
    }
  }

  async function refreshSaved() {
    try {
      const { data } = await api<EventCoverState>(base); setSaved(data); pending.current = null;
      if (!hydrated.current) { hydrated.current = true; restore(data); }
      stage("draft", "Cargamos la portada actual. Conservamos tus cambios sin guardar; revisa antes de guardar.");
    } catch { stage("failed", "No pudimos cargar la portada actual. Intenta nuevamente."); }
  }

  const previewCover = preview ? { url: preview, width: previewDimensions?.width ?? 640, height: previewDimensions?.height ?? 360,
    altText: normalizeCoverAlt(altText) ?? `Portada de ${title}`, positionX: positionX / 100, positionY: positionY / 100 }
    : saved?.cover ? { ...saved.cover, altText: normalizeCoverAlt(altText) ?? `Portada de ${title}`, positionX: positionX / 100, positionY: positionY / 100 } : null;
  const dimensions = previewDimensions ?? saved?.cover;

  return <section className="event-cover-editor" aria-labelledby={`${id}-heading`} aria-busy={busy || loading}>
    <h2 id={`${id}-heading`}>Portada del evento</h2>
    <p className="field-help">Opcional. Se guarda por separado de los detalles del evento.</p>
    {loading ? <p role="status">Cargando portada…</p> : <>
      <EventCover title={title} cover={previewCover} sizes="(max-width: 700px) calc(100vw - 2rem), 540px" />
      <p className="field-help">{changed ? "Vista previa; cambios sin guardar" : "Portada guardada"}</p>
      {message && <p id={`${id}-message`} ref={errorRef} tabIndex={-1} role={["failed", "conflict"].includes(status) ? "alert" : "status"}
        className={["failed", "conflict"].includes(status) ? "alert alert-error" : "field-help"}>{message}</p>}
      {status === "unknown" && <button type="button" onClick={() => void recover()}>Comprobar de nuevo</button>}
      {status === "conflict" && <button type="button" onClick={() => void refreshSaved()}>Cargar portada actual</button>}
      {!saved && <button type="button" onClick={() => void refreshSaved()}>Intentar nuevamente</button>}
      <fieldset className="cover-fields" disabled={busy || disabled || !saved} aria-describedby={message ? `${id}-message` : undefined}>
        <legend className="visually-hidden">Archivo, alternativa y encuadre</legend>
        <label htmlFor={`${id}-file`}>Archivo de portada</label>
        <input ref={fileRef} id={`${id}-file`} type="file" accept="image/jpeg,image/png,image/webp" aria-describedby={`${id}-file-help`} onChange={(event) => selectFile(event.target.files?.[0])} />
        <p id={`${id}-file-help`} className="field-help">JPEG, PNG o WebP sin animación. Máximo 5 MiB; al menos 640 × 360 px. El guardado verifica el archivo.</p>
        <label htmlFor={`${id}-alt`}>Texto alternativo</label>
        <textarea id={`${id}-alt`} value={altText} aria-describedby={`${id}-alt-help`} onChange={(event) => { setAltText(event.target.value); draft(); }} />
        <p id={`${id}-alt-help`} className="field-help">Opcional. Si lo dejas vacío: «Portada de {title}».</p>
        <label htmlFor={`${id}-x`}>Posición horizontal <span aria-hidden="true">{positionX}%</span></label>
        <input id={`${id}-x`} type="range" min="0" max="100" step="1" value={positionX} aria-valuetext={`${positionX}%`} aria-describedby={`${id}-crop-help`} onChange={(event) => { setPositionX(Number(event.target.value)); draft(); }} />
        <label htmlFor={`${id}-y`}>Posición vertical <span aria-hidden="true">{positionY}%</span></label>
        <input id={`${id}-y`} type="range" min="0" max="100" step="1" value={positionY} aria-valuetext={`${positionY}%`} aria-describedby={`${id}-crop-help`} onChange={(event) => { setPositionY(Number(event.target.value)); draft(); }} />
        <p id={`${id}-crop-help`} className="field-help">El encuadre es opcional. Horizontal alinea izquierda/derecha; vertical alinea arriba/abajo.
          {dimensions && (dimensions.width / dimensions.height > 16 / 9 ? " Esta imagen solo recorta horizontalmente; el eje vertical no cambia la vista." : dimensions.width / dimensions.height < 16 / 9 ? " Esta imagen solo recorta verticalmente; el eje horizontal no cambia la vista." : " Esta imagen no necesita recorte; los ejes no cambian la vista.")}</p>
        <button type="button" className="secondary" onClick={() => { setPositionX(50); setPositionY(50); draft(); }}>Centrar encuadre</button>
        <div className="form-actions">
          <button type="button" disabled={!changed || status === "conflict"} onClick={() => void save()}>{busy ? message : "Guardar portada"}</button>
          <button type="button" className="secondary" disabled={!changed} onClick={() => { if (saved) restore(saved); stage("idle", "Cambios descartados."); }}>Descartar cambios</button>
          {saved?.cover && <button type="button" className="secondary danger" disabled={status === "conflict"} onClick={() => void remove()}>Quitar portada</button>}
        </div>
      </fieldset>
    </>}
  </section>;
}
