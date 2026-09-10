import { createClient } from "@supabase/supabase-js";
import { NextResponse } from "next/server";
import { getDateKeysBetween, toLaPazDateKey } from "@/lib/dates";
import type {
  ApiErrorResponse,
  DailyRegistrationCount,
  DailyRegistrationsResponse,
} from "@/lib/types";

export const runtime = "nodejs";

const uuidPattern = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

type EventPublicationRow = {
  published_at: string | null;
};

type RegistrationDateRow = {
  created_at: string;
};

function errorResponse(error: string, status: 400 | 401 | 404 | 500 | 503) {
  const body: ApiErrorResponse = { error };
  return NextResponse.json(body, {
    status,
    headers: { "Cache-Control": "private, no-store" },
  });
}

function successResponse(body: DailyRegistrationsResponse) {
  return NextResponse.json(body, {
    headers: { "Cache-Control": "private, no-store" },
  });
}

export async function GET(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id: eventId } = await params;
  if (!uuidPattern.test(eventId)) {
    return errorResponse("invalid_event_id", 400);
  }

  const authorization = request.headers.get("authorization");
  const accessToken = authorization?.match(/^Bearer\s+(.+)$/i)?.[1];
  if (!accessToken) {
    return errorResponse("authentication_required", 401);
  }

  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const supabaseKey = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY;
  if (!supabaseUrl || !supabaseKey) {
    console.error("Daily registrations API is missing Supabase configuration");
    return errorResponse("service_unavailable", 503);
  }

  const supabase = createClient(supabaseUrl, supabaseKey, {
    auth: { persistSession: false, autoRefreshToken: false },
    global: { headers: { Authorization: `Bearer ${accessToken}` } },
  });
  const { data: userData, error: userError } = await supabase.auth.getUser(accessToken);
  if (userError || !userData.user) {
    return errorResponse("authentication_required", 401);
  }

  const { data: eventData, error: eventError } = await supabase
    .from("events")
    .select("published_at")
    .eq("id", eventId)
    .eq("created_by", userData.user.id)
    .maybeSingle();

  if (eventError) {
    console.error("Could not load event publication date", eventError.message);
    return errorResponse("could_not_load_event", 500);
  }
  if (!eventData) {
    return errorResponse("event_not_found", 404);
  }

  const { published_at: publishedAt } = eventData as EventPublicationRow;
  if (!publishedAt) {
    const body: DailyRegistrationsResponse = {
      publishedAt: null,
      registrationsByDay: [],
    };
    return successResponse(body);
  }

  const { data: registrationsData, error: registrationsError } = await supabase
    .from("registrations")
    .select("created_at")
    .eq("event_id", eventId)
    .gte("created_at", publishedAt)
    .order("created_at", { ascending: true });

  if (registrationsError) {
    console.error("Could not load daily registrations", registrationsError.message);
    return errorResponse("could_not_load_registrations", 500);
  }

  const counts = (registrationsData as RegistrationDateRow[]).reduce<Record<string, number>>(
    (dailyCounts, registration) => {
      const date = toLaPazDateKey(registration.created_at);
      dailyCounts[date] = (dailyCounts[date] ?? 0) + 1;
      return dailyCounts;
    },
    {},
  );
  const today = toLaPazDateKey(new Date());
  const publicationDate = toLaPazDateKey(publishedAt);
  const registrationsByDay: DailyRegistrationCount[] = getDateKeysBetween(
    publicationDate,
    today,
  ).map((date) => ({ date, count: counts[date] ?? 0 }));
  const body: DailyRegistrationsResponse = { publishedAt, registrationsByDay };

  return successResponse(body);
}
