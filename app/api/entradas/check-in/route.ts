import { createClient } from "@supabase/supabase-js";
import { NextResponse } from "next/server";
import type { ApiErrorResponse, CheckInRequest, CheckInRpcResult, CheckInSuccessResponse } from "@/lib/types";

export const runtime = "nodejs";

const uuidPattern = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const codePattern = /^[0-9a-f]{64}$/;

function errorResponse(error: string, status: number) {
  const body: ApiErrorResponse = { error };
  return NextResponse.json(body, { status, headers: { "Cache-Control": "private, no-store" } });
}

export async function POST(request: Request) {
  if (!request.headers.get("content-type")?.toLowerCase().includes("application/json")) {
    return errorResponse("invalid_input", 400);
  }

  let body: CheckInRequest;
  try {
    body = (await request.json()) as CheckInRequest;
  } catch {
    return errorResponse("invalid_input", 400);
  }

  const eventId = typeof body.eventId === "string" ? body.eventId : "";
  const ticketCode = typeof body.ticketCode === "string" ? body.ticketCode.trim().toLowerCase() : "";
  if (!uuidPattern.test(eventId)) return errorResponse("invalid_input", 400);
  if (!codePattern.test(ticketCode)) return errorResponse("ticket_not_found", 404);

  const accessToken = request.headers.get("authorization")?.match(/^Bearer\s+(.+)$/i)?.[1];
  if (!accessToken) return errorResponse("authentication_required", 401);

  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const supabaseKey = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY;
  if (!supabaseUrl || !supabaseKey) return errorResponse("service_unavailable", 503);

  const supabase = createClient(supabaseUrl, supabaseKey, {
    auth: { persistSession: false, autoRefreshToken: false },
    global: { headers: { Authorization: `Bearer ${accessToken}` } },
  });
  const { data: userData, error: userError } = await supabase.auth.getUser(accessToken);
  if (userError || !userData.user) return errorResponse("authentication_required", 401);

  const { data: event, error: eventError } = await supabase
    .from("events").select("id").eq("id", eventId).eq("created_by", userData.user.id).maybeSingle();
  if (eventError) return errorResponse("service_unavailable", 503);
  if (!event) return errorResponse("forbidden", 403);

  const { data, error } = await supabase.rpc("check_in_ticket", {
    p_event_id: eventId,
    p_code: ticketCode,
  });
  if (error) {
    console.error("Ticket check-in failed", error.message);
    return errorResponse("service_unavailable", 503);
  }
  const result = (data as CheckInRpcResult[] | null)?.[0];
  if (result?.status === "used") return errorResponse("ticket_used", 409);
  if (result?.status !== "valid" || !result.attendee_name || !result.ticket_type_name) {
    return errorResponse("ticket_not_found", 404);
  }
  const response: CheckInSuccessResponse = {
    status: "valid",
    attendeeName: result.attendee_name,
    ticketTypeName: result.ticket_type_name,
  };
  return NextResponse.json(response, { headers: { "Cache-Control": "private, no-store" } });
}
