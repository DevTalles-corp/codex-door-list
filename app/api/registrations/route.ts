import { createClient } from "@supabase/supabase-js";
import { NextResponse } from "next/server";
import { sendRegistrationEmail } from "@/lib/registration-email";
import type {
  RegistrationErrorCode,
  RegistrationErrorResponse,
  RegistrationRequest,
  RegistrationRpcResult,
  RegistrationSuccessResponse,
  RegistrationTicket,
} from "@/lib/types";

export const runtime = "nodejs";

const uuidPattern = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

function errorResponse(error: RegistrationErrorCode, status: 400 | 404 | 409 | 500 | 503) {
  const body: RegistrationErrorResponse = { error };
  return NextResponse.json(body, { status });
}

function invalidRequest() {
  return errorResponse("invalid_input", 400);
}

export async function POST(request: Request) {
  if (!request.headers.get("content-type")?.toLowerCase().includes("application/json")) {
    return invalidRequest();
  }

  let body: RegistrationRequest;
  try {
    body = (await request.json()) as RegistrationRequest;
  } catch {
    return invalidRequest();
  }

  const eventId = typeof body.eventId === "string" ? body.eventId : "";
  const ticketTypeId = typeof body.ticketTypeId === "string" ? body.ticketTypeId : "";
  const name = typeof body.name === "string" ? body.name.trim() : "";
  const email = typeof body.email === "string" ? body.email.trim().toLowerCase() : "";

  if (
    !uuidPattern.test(eventId) ||
    !uuidPattern.test(ticketTypeId) ||
    name.length < 1 ||
    name.length > 120 ||
    email.length < 3 ||
    email.length > 254
  ) {
    return invalidRequest();
  }

  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const supabaseKey = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY;

  if (!supabaseUrl || !supabaseKey) {
    console.error("Registration API is missing Supabase configuration");
    return errorResponse("service_unavailable", 503);
  }

  const supabase = createClient(supabaseUrl, supabaseKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
  const { data, error } = await supabase.rpc("register_for_event", {
    p_event_id: eventId,
    p_ticket_type_id: ticketTypeId,
    p_name: name,
    p_email: email,
  });

  if (error) {
    console.error("Registration RPC failed", error.message);
    return errorResponse("server_error", 500);
  }

  const result = (data as RegistrationRpcResult[] | null)?.[0];
  if (result?.status === "invalid_input") {
    return errorResponse("invalid_input", 400);
  }
  if (result?.status === "event_unavailable") {
    return errorResponse("event_unavailable", 404);
  }
  if (result?.status === "ticket_unavailable") {
    return errorResponse("ticket_unavailable", 409);
  }
  if (result?.status === "duplicate_registration") {
    return errorResponse("duplicate_registration", 409);
  }
  if (result?.status !== "success" || !result.registration_id || !result.ticket_code) {
    console.error("Registration RPC returned an unexpected result", result?.status);
    return errorResponse("server_error", 500);
  }

  const { data: ticketData, error: ticketError } = await supabase.rpc("get_public_ticket", {
    p_code: result.ticket_code,
  });

  let emailSent = false;
  if (ticketError || !ticketData) {
    console.error("Could not load the new ticket for email", ticketError?.message);
  } else {
    try {
      const ticketUrl = new URL(`/entradas/${result.ticket_code}`, request.url).toString();
      await sendRegistrationEmail({
        registrationId: result.registration_id,
        ticket: ticketData as RegistrationTicket,
        ticketUrl,
      });
      emailSent = true;
    } catch (emailError) {
      console.error(
        "Could not send registration email",
        emailError instanceof Error ? emailError.message : emailError,
      );
    }
  }

  const responseBody: RegistrationSuccessResponse = {
    registrationId: result.registration_id,
    ticketCode: result.ticket_code,
    emailSent,
  };
  return NextResponse.json(responseBody, { status: 201 });
}
