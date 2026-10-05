import { formatOrganizerEventDate } from "@/lib/dates";
import { escapeCsvField, getAttendeesCsvFileName } from "@/lib/export/attendees-csv";
import type { AuditRegistration, TicketStatus } from "@/lib/types";

const statuses: Record<TicketStatus, string> = { valid: "Válida", used: "Utilizada", revoked: "Revocada" };

export function buildAuditCsv(eventTitle: string, registrations: AuditRegistration[], timeZone: string) {
  const format = (value: string | null) => value ? formatOrganizerEventDate(value, timeZone) : "";
  const rows = registrations.map((row) => [row.attendeeName, row.attendeeEmail, row.ticketType.name,
    row.ticket.code, statuses[row.ticket.status], format(row.registeredAt), format(row.ticket.issuedAt),
    format(row.ticket.checkedInAt), format(row.ticket.revokedAt), timeZone]);
  const headers = ["nombre", "email", "tipo de entrada", "código de ticket", "estado del ticket",
    "fecha de registro", "fecha de emisión", "fecha de ingreso", "fecha de revocación", "zona horaria"];
  return {
    content: `\uFEFF${[headers, ...rows].map((row) => row.map(escapeCsvField).join(",")).join("\r\n")}\r\n`,
    fileName: getAttendeesCsvFileName(eventTitle, timeZone).replace(/^asistentes-/, "auditoria-"),
  };
}
