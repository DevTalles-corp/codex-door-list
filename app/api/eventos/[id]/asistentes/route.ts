import { createClient } from "@supabase/supabase-js";
import { NextResponse } from "next/server";
import { buildAttendeesCsv } from "@/lib/export/attendees-csv";
import { getOrganizerEventDashboard } from "@/lib/organizer-dashboard";
import type { ApiErrorResponse } from "@/lib/types";

export const runtime = "nodejs";

const uuidPattern = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

function errorResponse(error: string, status: 400 | 401 | 403 | 500 | 503) {
  const body: ApiErrorResponse = { error };
  return NextResponse.json(body, {
    status,
    headers: { "Cache-Control": "private, no-store" },
  });
}

export async function GET(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id: eventId } = await params;
  if (!uuidPattern.test(eventId)) return errorResponse("invalid_event_id", 400);

  const authorization = request.headers.get("authorization");
  const accessToken = authorization?.match(/^Bearer\s+(.+)$/i)?.[1];
  if (!accessToken) return errorResponse("authentication_required", 401);

  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const supabaseKey = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY;
  if (!supabaseUrl || !supabaseKey) {
    console.error("Attendees export API is missing Supabase configuration");
    return errorResponse("service_unavailable", 503);
  }

  const supabase = createClient(supabaseUrl, supabaseKey, {
    auth: { persistSession: false, autoRefreshToken: false },
    global: { headers: { Authorization: `Bearer ${accessToken}` } },
  });
  const { data: userData, error: userError } = await supabase.auth.getUser(accessToken);
  if (userError || !userData.user) return errorResponse("authentication_required", 401);

  try {
    const dashboard = await getOrganizerEventDashboard(supabase, userData.user.id, eventId);
    if (!dashboard) return errorResponse("forbidden", 403);

    const { content, fileName } = buildAttendeesCsv(
      dashboard.event.title,
      dashboard.registrations,
    );
    return new NextResponse(content, {
      headers: {
        "Cache-Control": "private, no-store",
        "Content-Disposition": `attachment; filename="${fileName}"`,
        "Content-Type": "text/csv; charset=utf-8",
      },
    });
  } catch (error) {
    console.error(
      "Could not export attendees",
      error instanceof Error ? error.message : error,
    );
    return errorResponse("could_not_export_attendees", 500);
  }
}
