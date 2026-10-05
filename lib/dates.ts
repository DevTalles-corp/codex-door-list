import type { Event } from "@/lib/types";

export function validTimeZone(value: string) {
  try { new Intl.DateTimeFormat("en", { timeZone: value }); return true; }
  catch { return false; }
}

export function normalizeInstant(value: unknown): string | null {
  if (typeof value !== "string" || !/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}(:\d{2}(\.\d{1,6})?)?(Z|[+-]\d{2}:\d{2})$/.test(value)) return null;
  const calendarDate = new Date(`${value.slice(0, 10)}T00:00:00Z`);
  if (!Number.isFinite(calendarDate.getTime()) || calendarDate.toISOString().slice(0, 10) !== value.slice(0, 10)) return null;
  const hour = Number(value.slice(11, 13));
  const minute = Number(value.slice(14, 16));
  const second = value[16] === ":" ? Number(value.slice(17, 19)) : 0;
  const parsed = new Date(value);
  return hour < 24 && minute < 60 && second < 60 && Number.isFinite(parsed.getTime()) ? parsed.toISOString() : null;
}

export function toEventDateKey(value: string | Date, timeZone: string) {
  return new Intl.DateTimeFormat("en-CA", { timeZone, year: "numeric", month: "2-digit", day: "2-digit" }).format(new Date(value));
}

function zonedParts(value: Date, timeZone: string) {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone, year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit", hourCycle: "h23",
  }).formatToParts(value);
  const map = Object.fromEntries(parts.map((part) => [part.type, part.value]));
  return `${map.year}-${map.month}-${map.day}T${map.hour}:${map.minute}`;
}

export function toZonedDateTimeLocal(value: string, timeZone: string) {
  return zonedParts(new Date(value), timeZone);
}

export function getZonedDateTimeCandidates(value: string, timeZone: string) {
  if (!validTimeZone(timeZone) || !/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/.test(value)) return [];
  const base = Date.parse(`${value}:00Z`);
  if (!Number.isFinite(base)) return [];
  const matches: string[] = [];
  for (let quarterHour = -56; quarterHour <= 56; quarterHour += 1) {
    const candidate = new Date(base + quarterHour * 15 * 60_000);
    if (zonedParts(candidate, timeZone) === value) matches.push(candidate.toISOString());
  }
  return matches;
}

export function fromZonedDateTimeLocal(value: string, timeZone: string, selectedInstant = "") {
  const matches = getZonedDateTimeCandidates(value, timeZone);
  if (selectedInstant && matches.includes(selectedInstant)) return selectedInstant;
  return matches.length === 1 ? matches[0] : null;
}

export function formatCandidateOffset(localValue: string, instant: string) {
  const minutes = (Date.parse(`${localValue}:00Z`) - Date.parse(instant)) / 60_000;
  const absolute = Math.abs(minutes);
  return `UTC${minutes < 0 ? "−" : "+"}${String(Math.floor(absolute / 60)).padStart(2, "0")}:${String(absolute % 60).padStart(2, "0")}`;
}

export function getDateKeysBetween(start: string, end: string) {
  const dates: string[] = [];
  const cursor = new Date(`${start}T12:00:00Z`);
  const finalDate = new Date(`${end}T12:00:00Z`);

  while (cursor <= finalDate) {
    dates.push(cursor.toISOString().slice(0, 10));
    cursor.setUTCDate(cursor.getUTCDate() + 1);
  }

  return dates;
}

export function formatDailyRegistrationDate(value: string) {
  return new Intl.DateTimeFormat("es-BO", {
    day: "numeric",
    month: "short",
    timeZone: "UTC",
  }).format(new Date(`${value}T12:00:00Z`));
}

export function formatEventDate(value: string, timeZone: string) {
  return new Intl.DateTimeFormat("es-BO", {
    dateStyle: "full",
    timeStyle: "short",
    timeZone,
  }).format(new Date(value));
}

export function formatEventAgendaDate(value: string, timeZone: string) {
  return new Intl.DateTimeFormat("es-BO", {
    day: "numeric",
    month: "short",
    weekday: "short",
    timeZone,
  }).format(new Date(value));
}

export function getEventDateGroup(value: string, timeZone: string) {
  const eventDate = toEventDateKey(value, timeZone);
  const today = toEventDateKey(new Date(), timeZone);
  const dayDifference = Math.round(
    (new Date(`${eventDate}T12:00:00Z`).getTime() - new Date(`${today}T12:00:00Z`).getTime()) /
      86_400_000,
  );

  if (dayDifference < 7) {
    return "Esta semana";
  }

  if (dayDifference < 31) {
    return "Este mes";
  }

  return "Más adelante";
}

export function formatOrganizerEventDate(value: string, timeZone: string) {
  return new Date(value).toLocaleString("es-BO", {
    timeZone,
  });
}

export function registrationIsOpen(event: Pick<Event, "registration_closes_at" | "status">) {
  return event.status === "published" && new Date(event.registration_closes_at).getTime() > Date.now();
}
