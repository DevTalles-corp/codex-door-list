import type { CapacityErrorDetails, CapacityViolation } from "@/lib/types";

type OrganizerOperation =
  | "signIn"
  | "loadEvents"
  | "loadTicketTypes"
  | "saveEvent"
  | "removeEvent"
  | "saveTicketType"
  | "removeTicketType";

const messages: Record<OrganizerOperation, string> = {
  signIn: "No pudimos iniciar sesión. Revisa tu email y contraseña.",
  loadEvents: "No pudimos cargar tus eventos. Intenta nuevamente.",
  loadTicketTypes: "No pudimos cargar los tipos de entrada. Intenta nuevamente.",
  saveEvent: "No pudimos guardar el evento. Revisa los datos e intenta nuevamente.",
  removeEvent: "No pudimos eliminar el evento. Intenta nuevamente.",
  saveTicketType: "No pudimos guardar el tipo de entrada. Revisa los datos e intenta nuevamente.",
  removeTicketType: "No pudimos eliminar el tipo de entrada. Intenta nuevamente.",
};

export function decodeCapacityDetails(details: unknown): CapacityErrorDetails | null {
  if (typeof details !== "string") return null;
  try {
    const value = JSON.parse(details);
    if (!value || value.kind !== "capacityViolation" || value.version !== 1
      || !Array.isArray(value.violations) || value.violations.length === 0) return null;
    for (const violation of value.violations) {
      if (!violation || !["event", "ticketType"].includes(violation.scope)
        || !["registrationConsumption", "assignedCapacity"].includes(violation.reason)
        || !Number.isSafeInteger(violation.requestedCapacity) || violation.requestedCapacity < 1
        || !Number.isSafeInteger(violation.minimumCapacity) || violation.minimumCapacity < 0
        || violation.requestedCapacity >= violation.minimumCapacity) return null;
      if (violation.scope === "ticketType" && (violation.reason !== "registrationConsumption"
        || typeof violation.ticketTypeId !== "string" || !/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(violation.ticketTypeId)
        || typeof violation.ticketTypeName !== "string" || !violation.ticketTypeName.trim())) return null;
    }
    return value as CapacityErrorDetails;
  } catch { return null; }
}

export function formatCapacityViolation(violation: CapacityViolation) {
  if (violation.reason === "assignedCapacity") return `El aforo debe cubrir los ${violation.minimumCapacity} cupos asignados a tipos de entrada.`;
  const scope = violation.scope === "ticketType" ? `El cupo de «${violation.ticketTypeName}»` : "El aforo del evento";
  return `${scope} no puede ser ${violation.requestedCapacity}: el mínimo es ${violation.minimumCapacity}, contando registros confirmados y reservas vigentes. Las entradas revocadas también cuentan.`;
}

export function organizerErrorMessage(
  operation: OrganizerOperation,
  error?: { code?: string; details?: string } | null,
) {
  if (error?.code === "23514") {
    const details = decodeCapacityDetails(error.details);
    if (details) return details.violations.map(formatCapacityViolation).join(" ");
    try {
      const value = JSON.parse(error.details ?? "null");
      if (value?.kind === "publicationRequiresTicketType" && value.version === 1) {
        return "Un evento publicado debe tener al menos un tipo de entrada con cupo. Añade un tipo antes de publicar o vuelve a borrador antes de quitar el último.";
      }
    } catch { /* Unknown provider details use the product fallback. */ }
  }
  if (error?.code === "23503") {
    try {
      const value = JSON.parse(error.details ?? "null");
      if (value?.kind === "issuedTicketAudit" && value.version === 1) return "Este evento o tipo tiene entradas emitidas y debe conservarse para auditoría.";
    } catch { /* Unknown provider details use the product fallback. */ }
  }
  if (error?.code && ["55P03", "40P01", "40001"].includes(error.code)) return "Otro cambio está en curso. Intenta guardar nuevamente.";
  return messages[operation];
}
