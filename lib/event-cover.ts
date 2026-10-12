import type { EventCover, EventCoverProjection, EventCoverRow, EventCoverState, OrganizerEventCover } from "./event-cover-types";

export const maxEventCoverBytes = 5_242_880;
export const eventCoverPathPattern = /^covers\/[0-9a-f]{64}$/;

export function newClientCoverOperationId() {
  return Array.from(crypto.getRandomValues(new Uint8Array(32)), (byte) => byte.toString(16).padStart(2, "0")).join("");
}

export function normalizeCoverAlt(value: string | null | undefined): string | null {
  return value?.trim() || null;
}

export function normalizeCoverPosition(value: unknown, fallback = 0.5): number {
  if (value === undefined) return fallback;
  if (typeof value !== "number" || !Number.isFinite(value) || value < 0 || value > 1)
    throw new Error("invalid_cover_position");
  return value;
}

export function eventCoverUrl(objectPath: string): string {
  if (!eventCoverPathPattern.test(objectPath)) throw new Error("invalid_cover_path");
  const base = new URL(process.env.NEXT_PUBLIC_SUPABASE_URL!);
  if (!["https:", "http:"].includes(base.protocol) || base.username || base.password || base.search || base.hash)
    throw new Error("invalid_cover_host");
  return new URL(`/storage/v1/object/public/event-covers/${objectPath}`, base).href;
}

export function publicEventCover(cover: EventCoverProjection | null | undefined, currentEventTitle: string): EventCover | null {
  if (!cover) return null;
  return { url: eventCoverUrl(cover.objectPath), width: cover.width, height: cover.height,
    altText: normalizeCoverAlt(cover.altText) ?? `Portada de ${currentEventTitle}`,
    positionX: normalizeCoverPosition(cover.positionX), positionY: normalizeCoverPosition(cover.positionY) };
}

export function organizerEventCover(cover: EventCoverProjection | null): OrganizerEventCover | null {
  if (!cover) return null;
  return { url: eventCoverUrl(cover.objectPath), width: cover.width, height: cover.height,
    altText: normalizeCoverAlt(cover.altText), positionX: cover.positionX, positionY: cover.positionY };
}

export function eventCoverState(row: EventCoverRow): EventCoverState {
  return { eventId: row.event_id, revision: row.revision, cover: row.object_path ? organizerEventCover({
    objectPath: row.object_path, width: row.width!, height: row.height!, altText: row.alt_text,
    positionX: row.position_x, positionY: row.position_y,
  }) : null };
}
