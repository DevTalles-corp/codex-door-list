"use client";

import EventCoverEditor from "./event-cover-editor";
import { FormEvent, useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { Session } from "@supabase/supabase-js";
import { formatCandidateOffset, formatOrganizerEventDate, fromZonedDateTimeLocal, getZonedDateTimeCandidates, registrationIsOpen, toZonedDateTimeLocal } from "@/lib/dates";
import { organizerErrorMessage } from "@/lib/errors";
import { supabase } from "@/lib/supabase/client";
import type { Event, EventStatus, EventConfigurationRequest, EventConfigurationResponse, TicketType } from "@/lib/types";

const emptyEvent = { title: "", description: "", eventDate: "", venue: "", maxCapacity: "", status: "draft" as EventStatus,
  timeZone: "America/La_Paz", registrationClosesAt: "", entryOpensAt: "", entryClosesAt: "" };
const dateFields = { eventDate: "Fecha y hora", registrationClosesAt: "Cierre del registro", entryOpensAt: "Inicio de ingreso", entryClosesAt: "Fin de ingreso" };
type DateFieldKey = keyof typeof dateFields;
const emptyDateInstants: Record<DateFieldKey, string> = { eventDate: "", registrationClosesAt: "", entryOpensAt: "", entryClosesAt: "" };
const dateColumns: Record<DateFieldKey, "event_date" | "registration_closes_at" | "entry_opens_at" | "entry_closes_at"> = {
  eventDate: "event_date", registrationClosesAt: "registration_closes_at", entryOpensAt: "entry_opens_at", entryClosesAt: "entry_closes_at",
};

function EventDateField({ field, value, timeZone, selectedInstant, onChange }: {
  field: DateFieldKey; value: string; timeZone: string; selectedInstant: string;
  onChange: (value: string, selectedInstant: string) => void;
}) {
  const candidates = getZonedDateTimeCandidates(value, timeZone);
  return <div className="event-date-field">
    <label htmlFor={field}>{dateFields[field]}<input id={field} type="datetime-local" value={value}
      onChange={(event) => onChange(event.target.value, "")} required /></label>
    {candidates.length > 1 ? <label htmlFor={`${field}-offset`}>Offset de {dateFields[field].toLowerCase()}
      <select id={`${field}-offset`} value={candidates.includes(selectedInstant) ? selectedInstant : ""}
        onChange={(event) => onChange(value, event.target.value)} required>
        <option value="">Elige la hora UTC</option>
        {candidates.map((instant) => <option key={instant} value={instant}>{formatCandidateOffset(value, instant)}</option>)}
      </select>
    </label> : null}
  </div>;
}

function DoorStaffEditor({ eventId }: { eventId: string }) {
  const [staff, setStaff] = useState<string[]>([]);
  const [email, setEmail] = useState("");
  const [state, setState] = useState<"loading" | "ready" | "submitting" | "error">("loading");
  const [notice, setNotice] = useState<{ text: string; error: boolean } | null>(null);
  const load = useCallback(async () => {
    if (!supabase) return;
    const { data, error } = await supabase.rpc("list_door_staff", { p_event_id: eventId });
    if (error) { setState("error"); return; }
    setStaff((data as { email: string }[]).map((row) => row.email)); setState("ready");
  }, [eventId]);
  useEffect(() => { void Promise.resolve().then(load); }, [load]);
  async function changeStaff(targetEmail: string, assign: boolean) {
    if (!supabase || state === "submitting") return;
    setState("submitting"); setNotice(null);
    const { data, error } = await supabase.rpc("manage_door_staff", { p_event_id: eventId, p_email: targetEmail, p_assign: assign });
    if (error) setNotice({ text: "No pudimos cambiar el acceso de puerta.", error: true });
    else if (data === "account_unavailable") setNotice({ text: "Esa persona debe crear y verificar su cuenta antes de recibir acceso.", error: true });
    else { setEmail(""); setNotice({ text: assign ? "Acceso de puerta asignado." : "Acceso de puerta retirado.", error: false }); await load(); return; }
    setState("ready");
  }
  return <section className="door-staff-editor" aria-labelledby={`staff-${eventId}`}>
    <h4 id={`staff-${eventId}`}>Personal de puerta</h4>
    {state === "loading" ? <p role="status">Cargando accesos…</p> : null}
    {state === "error" ? <p className="alert alert-error" role="alert">No pudimos cargar los accesos de puerta. <button type="button" onClick={() => void load()}>Intentar nuevamente</button></p> : null}
    {staff.length ? <ul>{staff.map((item) => <li key={item}>{item} <button type="button" disabled={state === "submitting"} onClick={() => void changeStaff(item, false)}>Retirar acceso</button></li>)}</ul> : state === "ready" ? <p>No hay colaboradores asignados.</p> : null}
    <form onSubmit={(event) => { event.preventDefault(); void changeStaff(email, true); }} aria-busy={state === "submitting"}>
      <label>Email de colaborador<input type="email" value={email} onChange={(event) => setEmail(event.target.value)} required disabled={state === "submitting"} /></label>
      <button type="submit" disabled={state === "submitting"}>{state === "submitting" ? "Asignando…" : "Dar acceso de puerta"}</button>
    </form>
    {notice ? <p className={`alert ${notice.error ? "alert-error" : "alert-success"}`} role={notice.error ? "alert" : "status"}>{notice.text}</p> : null}
  </section>;
}

export default function Organizer() {
  const [session, setSession] = useState<Session | null>(null);
  const [loading, setLoading] = useState(() => Boolean(supabase));
  const [email, setEmail] = useState(""); const [password, setPassword] = useState("");
  const [notice, setNotice] = useState<{ text: string; error: boolean } | null>(null);
  const noticeRef = useRef<HTMLParagraphElement>(null);
  useEffect(() => { if (notice?.error) noticeRef.current?.focus(); }, [notice]);
  const [events, setEvents] = useState<Event[]>([]); const [ticketTypes, setTicketTypes] = useState<TicketType[]>([]);
  const [eventForm, setEventForm] = useState(emptyEvent);
  const [editingEvent, setEditingEvent] = useState<Event | null>(null);
  const [dateInstants, setDateInstants] = useState(emptyDateInstants);
  const [dateTouched, setDateTouched] = useState<Partial<Record<DateFieldKey, boolean>>>({});
  const [eventCapacityTouched, setEventCapacityTouched] = useState(false);
  const [ticketTypeEventId, setTicketTypeEventId] = useState("");
  const [ticketTypeName, setTicketTypeName] = useState(""); const [ticketTypeCapacity, setTicketTypeCapacity] = useState("");
  const [editingTicketType, setEditingTicketType] = useState<TicketType | null>(null);
  const [typeCapacityTouched, setTypeCapacityTouched] = useState(false);
  const [savingEvent, setSavingEvent] = useState(false); const [savingType, setSavingType] = useState(false);
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [coverBusy, setCoverBusy] = useState(false);
  const busy = savingEvent || savingType || Boolean(deletingId) || coverBusy;
  const showError = (text: string) => setNotice({ text, error: true });
  const groupedTicketTypes = useMemo(() => ticketTypes.reduce<Record<string, TicketType[]>>((all, type) => {
    (all[type.event_id] ??= []).push(type); return all;
  }, {}), [ticketTypes]);

  const loadOrganizerData = useCallback(async () => {
    if (!supabase || !session) return;
    const eventsResult = await supabase.from("events")
      .select("id,title,description,event_date,venue,max_capacity,status,published_at,time_zone,registration_closes_at,entry_opens_at,entry_closes_at,public_code")
      .eq("created_by", session.user.id).order("event_date");
    if (eventsResult.error) { setNotice({ text: organizerErrorMessage("loadEvents"), error: true }); return; }
    const ids = eventsResult.data.map((item) => item.id);
    const typesResult = ids.length ? await supabase.from("ticket_types").select("id,event_id,name,max_capacity").in("event_id", ids).order("created_at") : { data: [], error: null };
    if (typesResult.error) { setNotice({ text: organizerErrorMessage("loadTicketTypes"), error: true }); return; }
    setEvents(eventsResult.data as Event[]); setTicketTypes(typesResult.data as TicketType[]);
  }, [session]);
  useEffect(() => {
    if (!supabase) return;
    void supabase.auth.getSession().then(({ data }) => { setSession(data.session); setLoading(false); });
    const { data } = supabase.auth.onAuthStateChange((_event, next) => { setSession(next); if (!next) { setEvents([]); setTicketTypes([]); } });
    return () => data.subscription.unsubscribe();
  }, []);
  useEffect(() => { if (session) void Promise.resolve().then(loadOrganizerData); }, [loadOrganizerData, session]);

  async function signIn(event: FormEvent) {
    event.preventDefault(); if (!supabase) return;
    const { error } = await supabase.auth.signInWithPassword({ email, password });
    if (error) showError(organizerErrorMessage("signIn"));
  }
  function resetEvent() { setEventForm(emptyEvent); setEditingEvent(null); setDateInstants(emptyDateInstants); setDateTouched({}); setEventCapacityTouched(false); }
  function resetType() { setTicketTypeName(""); setTicketTypeCapacity(""); setEditingTicketType(null); setTypeCapacityTouched(false); }
  function changeDate(field: DateFieldKey, value: string, selectedInstant: string) {
    setDateTouched((current) => ({ ...current, [field]: true }));
    setDateInstants((current) => ({ ...current, [field]: selectedInstant }));
    setEventForm((current) => {
      if (field !== "eventDate" || editingEvent || !value) return { ...current, [field]: value };
      const day = value.slice(0, 10);
      const next = new Date(`${day}T12:00:00Z`); next.setUTCDate(next.getUTCDate() + 1);
      const tomorrow = next.toISOString().slice(0, 10);
      return { ...current, eventDate: value,
        registrationClosesAt: current.registrationClosesAt || `${tomorrow}T00:00`,
        entryOpensAt: current.entryOpensAt || `${day}T00:00`, entryClosesAt: current.entryClosesAt || `${tomorrow}T00:00` };
    });
  }
  function changeTimeZone(nextZone: string) {
    const nextForm = { ...eventForm, timeZone: nextZone }; const nextInstants = { ...dateInstants };
    for (const field of Object.keys(dateFields) as DateFieldKey[]) {
      const instant = editingEvent && !dateTouched[field] ? editingEvent[dateColumns[field]] : fromZonedDateTimeLocal(eventForm[field], eventForm.timeZone, dateInstants[field]);
      if (instant) { nextForm[field] = toZonedDateTimeLocal(instant, nextZone); nextInstants[field] = new Date(instant).toISOString(); }
    }
    setEventForm(nextForm); setDateInstants(nextInstants);
  }
  function editEvent(item: Event) {
    setEditingEvent(item); setEventCapacityTouched(false); setDateTouched({});
    setEventForm({ title: item.title, description: item.description ?? "", eventDate: toZonedDateTimeLocal(item.event_date, item.time_zone),
      venue: item.venue, maxCapacity: String(item.max_capacity), status: item.status, timeZone: item.time_zone,
      registrationClosesAt: toZonedDateTimeLocal(item.registration_closes_at, item.time_zone),
      entryOpensAt: toZonedDateTimeLocal(item.entry_opens_at, item.time_zone), entryClosesAt: toZonedDateTimeLocal(item.entry_closes_at, item.time_zone) });
    setDateInstants({ eventDate: new Date(item.event_date).toISOString(), registrationClosesAt: new Date(item.registration_closes_at).toISOString(),
      entryOpensAt: new Date(item.entry_opens_at).toISOString(), entryClosesAt: new Date(item.entry_closes_at).toISOString() });
    window.scrollTo({ top: 0, behavior: window.matchMedia("(prefers-reduced-motion: reduce)").matches ? "auto" : "smooth" });
  }
  async function saveEvent(event: FormEvent) {
    event.preventDefault(); if (!supabase || !session || busy) return;
    setNotice(null);
    const dates = Object.fromEntries((Object.keys(dateFields) as DateFieldKey[]).map((field) => [field,
      editingEvent && !dateTouched[field] ? editingEvent[dateColumns[field]] : fromZonedDateTimeLocal(eventForm[field], eventForm.timeZone, dateInstants[field])])) as Record<DateFieldKey, string | null>;
    if (Object.values(dates).some((value) => !value) || Date.parse(dates.entryOpensAt!) >= Date.parse(dates.entryClosesAt!)) { showError("Revisa las horas. Si una hora se repite, elige su offset UTC; si no existe, elige otra hora."); return; }
    setSavingEvent(true);
    try {
      if (editingEvent) {
        const patch: NonNullable<EventConfigurationRequest["event"]> = { title: eventForm.title, description: eventForm.description || null,
          venue: eventForm.venue, status: eventForm.status, timeZone: eventForm.timeZone,
          ...(eventCapacityTouched ? { maxCapacity: Number(eventForm.maxCapacity) } : {}) };
        // Omit untouched instants, preserving historical seconds and microseconds.
        for (const field of Object.keys(dateFields) as DateFieldKey[]) if (dateTouched[field]) patch[field] = dates[field]!;
        const error = await saveConfiguration(editingEvent.id, { event: patch });
        if (error) { showError(error); return; }
      } else {
        const { error } = await supabase.from("events").insert({ title: eventForm.title, description: eventForm.description || null,
          event_date: dates.eventDate, venue: eventForm.venue, status: "draft", time_zone: eventForm.timeZone,
          registration_closes_at: dates.registrationClosesAt, entry_opens_at: dates.entryOpensAt, entry_closes_at: dates.entryClosesAt,
          max_capacity: Number(eventForm.maxCapacity), created_by: session.user.id });
        if (error) { showError(organizerErrorMessage("saveEvent", error)); return; }
      }
      resetEvent(); setNotice({ text: "Evento guardado.", error: false }); void loadOrganizerData();
    } catch { showError(organizerErrorMessage("saveEvent")); }
    finally { setSavingEvent(false); }
  }
  function editTicketType(item: TicketType) {
    setEditingTicketType(item); setTicketTypeEventId(item.event_id); setTicketTypeName(item.name); setTicketTypeCapacity(String(item.max_capacity)); setTypeCapacityTouched(false);
    window.scrollTo({ top: 0, behavior: window.matchMedia("(prefers-reduced-motion: reduce)").matches ? "auto" : "smooth" });
  }
  async function saveTicketType(event: FormEvent) {
    event.preventDefault(); if (!supabase || !session || !ticketTypeEventId || busy) return;
    setSavingType(true); setNotice(null);
    try {
      if (editingTicketType && editingTicketType.event_id === ticketTypeEventId) {
        const error = await saveConfiguration(ticketTypeEventId, { ticketType: { id: editingTicketType.id, name: ticketTypeName,
          ...(typeCapacityTouched ? { maxCapacity: Number(ticketTypeCapacity) } : {}) } });
        if (error) { showError(error); return; }
      } else {
        const payload = { name: ticketTypeName, event_id: ticketTypeEventId,
          ...(!editingTicketType || typeCapacityTouched ? { max_capacity: Number(ticketTypeCapacity) } : {}) };
        const { error } = editingTicketType ? await supabase.from("ticket_types").update(payload).eq("id", editingTicketType.id) : await supabase.from("ticket_types").insert(payload);
        if (error) { showError(organizerErrorMessage("saveTicketType", error)); return; }
      }
      resetType(); setNotice({ text: "Tipo de entrada guardado.", error: false }); void loadOrganizerData();
    } catch { showError(organizerErrorMessage("saveTicketType")); }
    finally { setSavingType(false); }
  }

  async function saveConfiguration(eventId: string, payload: EventConfigurationRequest) {
    const response = await fetch(`/api/eventos/${eventId}/configuracion`, {
      method: "PATCH", headers: { "Content-Type": "application/json", Authorization: `Bearer ${session!.access_token}` }, body: JSON.stringify(payload),
    });
    if (!response.ok) {
      const data: unknown = await response.json().catch(() => null);
      return data && typeof data === "object" && "error" in data && typeof data.error === "string"
        ? data.error : "No pudimos guardar la configuración. Intenta nuevamente.";
    }
    const data = await response.json() as EventConfigurationResponse;
    if (data.eventId !== eventId || data.ticketTypeId !== (payload.ticketType?.id ?? null)) throw new Error("Unexpected configuration response");
    return null;
  }
  async function remove(id: string, kind: "event" | "ticketType") {
    if (!supabase || busy || !confirm(kind === "event" ? "¿Eliminar este evento y sus tipos de entrada?" : "¿Eliminar este tipo de entrada?")) return;
    setDeletingId(id);
    const { error } = await supabase.from(kind === "event" ? "events" : "ticket_types").delete().eq("id", id);
    setDeletingId(null);
    if (error) { showError(organizerErrorMessage(kind === "event" ? "removeEvent" : "removeTicketType", error)); return; }
    setNotice({ text: kind === "event" ? "Evento eliminado." : "Tipo de entrada eliminado.", error: false }); void loadOrganizerData();
  }

  if (!supabase) return <main className="shell"><h1>Panel no disponible</h1><p>El panel no está configurado en este momento.</p></main>;
  if (loading) return <main className="shell" aria-busy="true"><p role="status">Cargando panel…</p></main>;
  if (!session) return <main className="shell auth"><p className="eyebrow">Door List</p><h1>Panel del organizador</h1><p>Inicia sesión para administrar eventos y entradas.</p><form onSubmit={signIn}><label>Email<input type="email" value={email} onChange={(event) => setEmail(event.target.value)} required /></label><label>Contraseña<input type="password" value={password} onChange={(event) => setPassword(event.target.value)} required /></label><button>Ingresar</button></form>{notice ? <p className="alert alert-error" role="alert">{notice.text}</p> : null}</main>;
  return <main className="shell">
    <header><div><p className="eyebrow">Door List</p><h1>Panel del organizador</h1></div><button className="secondary" type="button" onClick={() => void supabase?.auth.signOut()}>Cerrar sesión</button></header>
    {notice ? <p ref={noticeRef} tabIndex={-1} className={`alert ${notice.error ? "alert-error" : "alert-success"}`} role={notice.error ? "alert" : "status"}>{notice.text}</p> : null}
    <section className="editor">
      <div className="event-configuration-editor">
      <form onSubmit={saveEvent} aria-busy={savingEvent}>
        <h2>{editingEvent ? "Editar evento" : "Nuevo evento"}</h2>
        <fieldset className="fields" disabled={busy}><legend className="visually-hidden">Detalles del evento</legend>
          <label>Nombre<input value={eventForm.title} onChange={(event) => setEventForm({ ...eventForm, title: event.target.value })} required /></label>
          <label>Zona horaria<select value={eventForm.timeZone} onChange={(event) => changeTimeZone(event.target.value)}>{["UTC", ...Intl.supportedValuesOf("timeZone")].map((zone) => <option key={zone} value={zone}>{zone}</option>)}</select></label>
          {(Object.keys(dateFields) as DateFieldKey[]).map((field) => <EventDateField key={field} field={field} value={eventForm[field]}
            timeZone={eventForm.timeZone} selectedInstant={dateInstants[field]} onChange={(value, instant) => changeDate(field, value, instant)} />)}
          <label>Lugar<input value={eventForm.venue} onChange={(event) => setEventForm({ ...eventForm, venue: event.target.value })} required /></label>
          <label>Aforo total<input type="number" min="1" max="2147483647" value={eventForm.maxCapacity} onChange={(event) => { setEventCapacityTouched(true); setEventForm({ ...eventForm, maxCapacity: event.target.value }); }} required /></label>
          <label>Estado<select value={eventForm.status} onChange={(event) => setEventForm({ ...eventForm, status: event.target.value as EventStatus })} disabled={!editingEvent}><option value="draft">Borrador</option><option value="published">Publicado</option></select></label>
          <label className="wide">Descripción<textarea value={eventForm.description} onChange={(event) => setEventForm({ ...eventForm, description: event.target.value })} /></label>
        </fieldset>
        <p className="help">Las horas se interpretan en la zona del evento. Añade un tipo de entrada antes de publicar.</p>
        <button disabled={busy}>{savingEvent ? "Guardando evento…" : editingEvent ? "Guardar cambios" : "Crear evento"}</button>
        {editingEvent ? <button type="button" className="secondary" disabled={busy} onClick={resetEvent}>Cancelar</button> : null}
      </form>
      {editingEvent ? <EventCoverEditor key={editingEvent.id} eventId={editingEvent.id} title={editingEvent.title}
        accessToken={session.access_token} onBusyChange={setCoverBusy} disabled={savingEvent || savingType || Boolean(deletingId)} />
        : <p className="help">Puedes añadir una portada después de crear el evento.</p>}
      </div>
      <form onSubmit={saveTicketType} aria-busy={savingType}>
        <h2>{editingTicketType ? "Editar tipo de entrada" : "Nuevo tipo de entrada"}</h2>
        <fieldset className="fields" disabled={busy}><legend className="visually-hidden">Detalles del tipo de entrada</legend>
          <label className="wide">Evento<select value={ticketTypeEventId} onChange={(event) => setTicketTypeEventId(event.target.value)} required><option value="">Selecciona un evento</option>{events.map((item) => <option key={item.id} value={item.id}>{item.title}</option>)}</select></label>
          <label>Nombre<input value={ticketTypeName} onChange={(event) => setTicketTypeName(event.target.value)} placeholder="General, VIP…" required /></label>
          <label>Capacidad<input type="number" min="1" max="2147483647" value={ticketTypeCapacity} onChange={(event) => { setTypeCapacityTouched(true); setTicketTypeCapacity(event.target.value); }} required /></label>
        </fieldset>
        <button disabled={busy || !events.length}>{savingType ? "Guardando tipo de entrada…" : editingTicketType ? "Guardar cambios" : "Agregar entrada"}</button>
        {editingTicketType ? <button type="button" className="secondary" disabled={busy} onClick={resetType}>Cancelar</button> : null}
        <p className="help">La suma de capacidades no puede superar el aforo del evento.</p>
      </form>
    </section>
    <section><h2>Mis eventos</h2>{events.length === 0 ? <p>Aún no creaste eventos.</p> : <div className="cards">{events.map((item) => {
      const types = groupedTicketTypes[item.id] ?? [];
      const assignedCapacity = types.reduce((sum, type) => sum + type.max_capacity, 0);
      return <article key={item.id}><div className="card-title"><div><span className={`badge ${item.status}`}>{item.status === "published" ? "Publicado" : "Borrador"}</span><h3>{item.title}</h3></div><div>
        {registrationIsOpen(item) ? <a className="link" href={`/eventos/${item.public_code}/registro`} target="_blank" rel="noreferrer">Abrir registro</a> : null}
        <button className="link" type="button" disabled={busy} onClick={() => editEvent(item)}>Editar</button>
        <button className="link danger" type="button" disabled={busy} onClick={() => void remove(item.id, "event")}>{deletingId === item.id ? "Eliminando…" : "Eliminar"}</button>
      </div></div>
        <p>{formatOrganizerEventDate(item.event_date, item.time_zone)} · {item.time_zone} · {item.venue}</p>
        {item.description ? <p>{item.description}</p> : null}<p className="capacity">{assignedCapacity} / {item.max_capacity} entradas asignadas</p>
        {item.status === "draft" && types.length === 0 ? <p className="help">Añade un tipo de entrada con cupo para publicar este evento.</p> : null}
        <ul>{types.map((type) => <li key={type.id}><span>{type.name} <small>({type.max_capacity})</small></span><span><button className="link" type="button" disabled={busy} onClick={() => editTicketType(type)}>Editar</button><button className="link danger" type="button" disabled={busy} onClick={() => void remove(type.id, "ticketType")}>{deletingId === type.id ? "Eliminando…" : "Eliminar"}</button></span></li>)}</ul>
        <DoorStaffEditor eventId={item.id} />
      </article>;
    })}</div>}</section>
  </main>;
}
