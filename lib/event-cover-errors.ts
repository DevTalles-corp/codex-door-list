import "server-only";

export class EventCoverError extends Error {
  constructor(public status: number, message: string) { super(message); }
}
export const coverConflict = () => new EventCoverError(409, "La portada cambió en otra sesión. Carga su estado actual antes de guardar.");
export const coverUnavailable = () => new EventCoverError(503, "No pudimos completar la operación. Intenta nuevamente.");
