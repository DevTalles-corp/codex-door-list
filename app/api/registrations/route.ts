import { createHash, randomBytes } from "node:crypto";
import { NextResponse } from "next/server";
import { sendReservationEmail } from "@/lib/reservation-email";
import { createAdminClient } from "@/lib/supabase/admin";
import type { RegistrationRequest, RegistrationRpcResult } from "@/lib/types";

export const runtime = "nodejs";

const uuidPattern = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const emailPattern = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const respondError = (error: string, status: number) => NextResponse.json({ error }, { status, headers: { "Cache-Control": "no-store" } });

export async function POST(request: Request) {
  if (!request.headers.get("content-type")?.toLowerCase().includes("application/json")) return respondError("invalid_input", 400);
  let body: RegistrationRequest;
  try { body = await request.json() as RegistrationRequest; }
  catch { return respondError("invalid_input", 400); }
  if (!body || typeof body !== "object" || Array.isArray(body)) return respondError("invalid_input", 400);
  const eventId = typeof body.eventId === "string" ? body.eventId : "";
  const ticketTypeId = typeof body.ticketTypeId === "string" ? body.ticketTypeId : "";
  const name = typeof body.name === "string" ? body.name.trim() : "";
  const email = typeof body.email === "string" ? body.email.trim().toLowerCase() : "";
  if (!uuidPattern.test(eventId) || !uuidPattern.test(ticketTypeId) || name.length < 1 || name.length > 120
    || email.length < 3 || email.length > 254 || !emailPattern.test(email)) return respondError("invalid_input", 400);
  const admin = createAdminClient();
  if (!admin) return respondError("service_unavailable", 503);
  const token = randomBytes(32).toString("hex");
  const tokenHash = createHash("sha256").update(token).digest("hex");
  const { data, error } = await admin.rpc("reserve_for_event", {
    p_event_id: eventId, p_ticket_type_id: ticketTypeId, p_name: name,
    p_email: email, p_token_hash: tokenHash,
  });
  if (error) return respondError("server_error", 500);
  const result = (data as RegistrationRpcResult[] | null)?.[0];
  if (result?.status !== "pending" || !result.reservation_id || !result.expires_at) {
    const status = result?.status === "invalid_input" ? 400 : result?.status === "event_unavailable" ? 404
      : result?.status === "ticket_unavailable" || result?.status === "duplicate_registration" ? 409 : 500;
    return respondError(status === 500 ? "server_error" : result!.status, status);
  }
  const { data: eventData, error: eventError } = await admin.from("events")
    .select("title").eq("id", eventId).single();
  if (eventError || !eventData) {
    await admin.rpc("cancel_reservation", { p_reservation_id: result.reservation_id });
    return respondError("service_unavailable", 503);
  }
  try {
    const confirmUrl = new URL(`/eventos/confirmar?token=${token}`, request.url).toString();
    await sendReservationEmail({ reservationId: result.reservation_id, email, eventTitle: eventData.title, confirmUrl });
  } catch {
    await admin.rpc("cancel_reservation", { p_reservation_id: result.reservation_id });
    return respondError("service_unavailable", 503);
  }
  return NextResponse.json({ status: "pending", expiresAt: result.expires_at }, { status: 202, headers: { "Cache-Control": "no-store" } });
}
