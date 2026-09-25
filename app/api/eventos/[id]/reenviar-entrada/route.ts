import { randomUUID } from "node:crypto";
import { createClient } from "@supabase/supabase-js";
import { NextResponse } from "next/server";
import { getOrganizerEventDashboard } from "@/lib/organizer-dashboard";
import { sendRegistrationEmail } from "@/lib/registration-email";
import type { ResendTicketRequest, ResendTicketSuccessResponse } from "@/lib/resend-ticket-types";
import type {
  ApiErrorResponse,
  RegistrationTicket,
} from "@/lib/types";

export const runtime = "nodejs";

const uuidPattern = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

function errorResponse(error: string, status: 400 | 401 | 404 | 500 | 502 | 503) {
  const body: ApiErrorResponse = { error };
  return NextResponse.json(body, {
    status,
    headers: { "Cache-Control": "private, no-store" },
  });
}

export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id: eventId } = await params;
  if (!uuidPattern.test(eventId) || !request.headers.get("content-type")?.toLowerCase().includes("application/json")) {
    return errorResponse("invalid_input", 400);
  }

  let body: ResendTicketRequest;
  try {
    body = (await request.json()) as ResendTicketRequest;
  } catch {
    return errorResponse("invalid_input", 400);
  }
  const registrationId = typeof body?.registrationId === "string" ? body.registrationId : "";
  if (!uuidPattern.test(registrationId)) return errorResponse("invalid_input", 400);

  const accessToken = request.headers.get("authorization")?.match(/^Bearer\s+(.+)$/i)?.[1];
  if (!accessToken) return errorResponse("authentication_required", 401);

  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const supabaseKey = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY;
  if (!supabaseUrl || !supabaseKey || !process.env.RESEND_API_KEY || !process.env.RESEND_FROM_EMAIL) {
    console.error("Ticket resend API is missing configuration");
    return errorResponse("service_unavailable", 503);
  }

  const supabase = createClient(supabaseUrl, supabaseKey, {
    auth: { persistSession: false, autoRefreshToken: false },
    global: { headers: { Authorization: `Bearer ${accessToken}` } },
  });
  const { data: userData, error: userError } = await supabase.auth.getUser(accessToken);
  if (userError || !userData.user) return errorResponse("authentication_required", 401);

  let dashboard;
  try {
    dashboard = await getOrganizerEventDashboard(supabase, userData.user.id, eventId);
  } catch (error) {
    console.error("Could not load ticket for resend", error);
    return errorResponse("could_not_load_ticket", 500);
  }
  if (!dashboard) return errorResponse("event_not_found", 404);

  const registration = dashboard.registrations.find((item) => item.id === registrationId);
  if (!registration) return errorResponse("ticket_not_found", 404);

  const ticket: RegistrationTicket = {
    code: registration.ticket.code,
    attendee: { name: registration.attendeeName, email: registration.attendeeEmail },
    event: {
      title: dashboard.event.title,
      event_date: dashboard.event.eventDate,
      venue: dashboard.event.venue,
    },
    ticket_type: { name: registration.ticketType.name },
  };

  try {
    await sendRegistrationEmail({
      registrationId,
      ticket,
      ticketUrl: new URL(`/entradas/${registration.ticket.code}`, request.url).toString(),
      idempotencyKey: `ticket-resend/${registrationId}/${randomUUID()}`,
    });
  } catch (error) {
    console.error("Could not resend ticket", error);
    return errorResponse("could_not_send_ticket", 502);
  }

  const response: ResendTicketSuccessResponse = { emailSent: true };
  return NextResponse.json(response, { headers: { "Cache-Control": "private, no-store" } });
}
