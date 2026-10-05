import { normalizeInstant, validTimeZone } from "@/lib/dates";
import { organizerErrorMessage } from "@/lib/errors";
import type { EventConfigurationRequest } from "@/lib/types";

export const uuidPattern = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const isObject = (value: unknown): value is Record<string, unknown> => !!value && typeof value === "object" && !Array.isArray(value);
const eventFields = new Set(["title", "description", "eventDate", "venue", "status", "maxCapacity", "timeZone", "registrationClosesAt", "entryOpensAt", "entryClosesAt"]);
const instantFields = new Set(["eventDate", "registrationClosesAt", "entryOpensAt", "entryClosesAt"]);

export function parseEventConfiguration(value: unknown): EventConfigurationRequest | null {
  if (!isObject(value) || Object.keys(value).some((key) => !["event", "ticketType"].includes(key)) || !Object.keys(value).length) return null;
  const result: Record<string, Record<string, unknown>> = {};
  for (const [section, patch] of Object.entries(value)) {
    if (!isObject(patch) || !Object.keys(patch).length) return null;
    if (section === "ticketType" && (typeof patch.id !== "string" || !uuidPattern.test(patch.id) || Object.keys(patch).length < 2)) return null;
    const normalized: Record<string, unknown> = {};
    for (const [key, field] of Object.entries(patch)) {
      if (!(section === "event" ? eventFields.has(key) : ["id", "name", "maxCapacity"].includes(key))) return null;
      if (key === "maxCapacity") {
        if (typeof field !== "number" || !Number.isInteger(field) || field < 1 || field > 2147483647) return null;
      } else if (key === "description") {
        if (field !== null && typeof field !== "string") return null;
      } else {
        if (typeof field !== "string" || !field.trim()) return null;
        if (key === "status" && !["draft", "published"].includes(field)) return null;
        if (key === "timeZone" && !validTimeZone(field)) return null;
        if (instantFields.has(key)) {
          const instant = normalizeInstant(field);
          if (!instant) return null;
          normalized[key] = instant; continue;
        }
      }
      normalized[key] = field;
    }
    result[section] = normalized;
  }
  if (result.event?.entryOpensAt && result.event?.entryClosesAt
    && Date.parse(String(result.event.entryOpensAt)) >= Date.parse(String(result.event.entryClosesAt))) return null;
  return result as EventConfigurationRequest;
}

export function configurationError(error: { code?: string; details?: string } | null) {
  const code = error?.code;
  const status = code === "42501" ? 403 : code === "P0002" ? 404
    : code && ["22023", "22P02", "22007", "22008", "22003", "23502"].includes(code) ? 400
    : code && ["23514", "23505", "23503"].includes(code) ? 409
    : code && ["55P03", "40P01", "40001"].includes(code) ? 503 : 500;
  const message = status === 403 ? "No tienes permiso para editar este evento." : status === 404 ? "No encontramos el evento o tipo de entrada."
    : status === 400 ? "Revisa los datos de configuración." : code === "23505" ? "Ya existe un tipo de entrada con ese nombre en el evento."
    : organizerErrorMessage("saveEvent", error);
  return { status, error: message };
}
