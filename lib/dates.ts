import type { Event } from "@/lib/types";

const LA_PAZ_TIME_ZONE = "America/La_Paz";

function laPazDate(value: string | Date) {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: LA_PAZ_TIME_ZONE,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(new Date(value));
}

export function toLaPazDateKey(value: string | Date) {
  return laPazDate(value);
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

export function formatEventDate(value: string) {
  return new Intl.DateTimeFormat("es-BO", {
    dateStyle: "full",
    timeStyle: "short",
    timeZone: LA_PAZ_TIME_ZONE,
  }).format(new Date(value));
}

export function formatOrganizerEventDate(value: string) {
  return new Date(value).toLocaleString("es-BO", {
    timeZone: LA_PAZ_TIME_ZONE,
  });
}

export function registrationIsOpen(event: Pick<Event, "event_date" | "status">) {
  return event.status === "published" && laPazDate(event.event_date) >= laPazDate(new Date());
}

export function toDateTimeLocal(value: string) {
  const date = new Date(value);
  const localDate = new Date(date.getTime() - date.getTimezoneOffset() * 60_000);
  return localDate.toISOString().slice(0, 16);
}
