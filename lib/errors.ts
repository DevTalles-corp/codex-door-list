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

export function organizerErrorMessage(
  operation: OrganizerOperation,
  error?: { code?: string } | null,
) {
  if (error?.code === "23514") {
    return operation === "saveEvent"
      ? "El aforo del evento no puede ser menor que las entradas ya asignadas."
      : "La capacidad asignada no puede superar el aforo del evento.";
  }

  return messages[operation];
}
