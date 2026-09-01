import { createClient } from "@supabase/supabase-js";
import { NextResponse } from "next/server";
import { sendRegistrationEmail } from "@/app/lib/registration-email";

export const runtime = "nodejs";

type RegistrationRequest = {
  eventId?: unknown;
  ticketTypeId?: unknown;
  name?: unknown;
  email?: unknown;
};

type RegistrationResult = {
  status: string;
  registration_id: string | null;
  ticket_code: string | null;
};

type RegistrationTicket = {
  code: string;
  attendee: { name: string; email: string };
  event: { title: string; event_date: string; venue: string };
  ticket_type: { name: string };
};

const uuidPattern = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

function invalidRequest() {
  return NextResponse.json({ status: "invalid_input" }, { status: 400 });
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
    return NextResponse.json({ status: "server_error" }, { status: 503 });
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
    return NextResponse.json({ status: "server_error" }, { status: 500 });
  }

  const result = (data as RegistrationResult[] | null)?.[0];
  if (result?.status !== "success" || !result.registration_id || !result.ticket_code) {
    return NextResponse.json({ status: result?.status ?? "server_error" });
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

  return NextResponse.json({
    status: "success",
    registration_id: result.registration_id,
    ticket_code: result.ticket_code,
    email_sent: emailSent,
  });
}
