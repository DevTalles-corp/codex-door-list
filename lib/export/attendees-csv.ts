import { formatOrganizerEventDate, toEventDateKey } from "@/lib/dates";
import type { OrganizerRegistration, TicketStatus } from "@/lib/types";

const attendeesHeaders = [
  "nombre",
  "email",
  "tipo de entrada",
  "código de ticket",
  "fecha de compra",
  "estado del ticket",
];

const ticketStatusLabels: Record<Exclude<TicketStatus, "revoked">, string> = {
  valid: "Válida",
  used: "Utilizada",
};

export function escapeCsvField(value: string) {
  const safeValue = /^[=+\-@\t\r]/.test(value) ? `'${value}` : value;
  return /[",\r\n]/.test(safeValue) ? `"${safeValue.replaceAll('"', '""')}"` : safeValue;
}

function slugifyEventTitle(title: string) {
  const slug = title
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");

  return slug || "evento";
}

export function getAttendeesCsvFileName(eventTitle: string, timeZone: string, date = new Date()) {
  return `asistentes-${slugifyEventTitle(eventTitle)}-${toEventDateKey(date, timeZone)}.csv`;
}

export function buildAttendeesCsv(
  eventTitle: string,
  registrations: OrganizerRegistration[],
  timeZone: string,
  date = new Date(),
) {
  const rows = registrations.map((registration) => [
    registration.attendeeName,
    registration.attendeeEmail,
    registration.ticketType.name,
    registration.ticket.code,
    formatOrganizerEventDate(registration.registeredAt, timeZone),
    ticketStatusLabels[registration.ticket.status],
  ]);
  const content = `\uFEFF${[attendeesHeaders, ...rows]
    .map((row) => row.map(escapeCsvField).join(","))
    .join("\r\n")}\r\n`;

  return { content, fileName: getAttendeesCsvFileName(eventTitle, timeZone, date) };
}
