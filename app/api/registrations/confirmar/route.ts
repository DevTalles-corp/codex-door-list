import { createHash } from "node:crypto";
import { NextResponse } from "next/server";
import { loadRegistrationTicket, sendRegistrationEmail } from "@/lib/registration-email";
import { createAdminClient } from "@/lib/supabase/admin";

export const runtime = "nodejs";
const respondError = (error: string, status: number) => NextResponse.json({ error }, { status, headers: { "Cache-Control": "no-store" } });

export async function POST(request: Request) {
  if (!request.headers.get("content-type")?.toLowerCase().includes("application/json")) return respondError("invalid_input", 400);
  let token: unknown;
  try { token = (await request.json() as { token?: unknown }).token; }
  catch { return respondError("invalid_input", 400); }
  if (typeof token !== "string" || !/^[0-9a-f]{64}$/.test(token)) return respondError("invalid_token", 400);
  const admin = createAdminClient();
  if (!admin) return respondError("service_unavailable", 503);
  const tokenHash = createHash("sha256").update(token).digest("hex");
  const { data, error } = await admin.rpc("confirm_reservation", { p_token_hash: tokenHash });
  if (error) return respondError("server_error", 500);
  const result = (data as { status: string; registration_id: string | null; ticket_code: string | null }[] | null)?.[0];
  if (result?.status !== "success" || !result.registration_id || !result.ticket_code) {
    return respondError(result?.status === "expired" ? "reservation_expired" : "invalid_token", 409);
  }
  let emailSent = false;
  try {
    const ticket = await loadRegistrationTicket(admin, result.registration_id, result.ticket_code);
    await sendRegistrationEmail({
      registrationId: result.registration_id,
      ticket,
      ticketUrl: new URL(`/entradas/${result.ticket_code}`, request.url).toString(),
    });
    emailSent = true;
  } catch (sendError) {
    console.error("Could not send confirmed ticket", sendError);
  }
  return NextResponse.json({ registrationId: result.registration_id, ticketCode: result.ticket_code, emailSent }, { headers: { "Cache-Control": "no-store" } });
}
