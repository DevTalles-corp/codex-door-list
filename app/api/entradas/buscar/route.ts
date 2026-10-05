import { createClient } from "@supabase/supabase-js";
import { NextResponse } from "next/server";
import type { TicketSearchResponse } from "@/lib/door-search-types";
import type { ApiErrorResponse } from "@/lib/types";

export const runtime = "nodejs";

const uuidPattern = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const emailPattern = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const noStore = { "Cache-Control": "private, no-store" };

function errorResponse(error: string, status: number) {
  const body: ApiErrorResponse = { error };
  return NextResponse.json(body, { status, headers: noStore });
}

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const eventId = searchParams.get("eventId") ?? "";
  const email = (searchParams.get("email") ?? "").trim().toLowerCase();
  if (!uuidPattern.test(eventId) || email.length > 254 || !emailPattern.test(email)) {
    return errorResponse("invalid_input", 400);
  }

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

  const { data, error } = await supabase.rpc("search_door_ticket", { p_event_id: eventId, p_email: email });
  if (error?.code === "42501") return errorResponse("forbidden", 403);
  if (error) return errorResponse("service_unavailable", 503);
  if (!data) return errorResponse("ticket_not_found", 404);
  const response = data as TicketSearchResponse;
  return NextResponse.json(response, { headers: noStore });
}
