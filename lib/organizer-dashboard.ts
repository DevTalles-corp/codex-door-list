import type { SupabaseClient } from "@supabase/supabase-js";
import type {
  OrganizerEventDashboard,
  OrganizerEventSummary,
  OrganizerRegistration,
  OrganizerTicketTypeMetrics,
} from "@/lib/types";

type EventRow = {
  id: string;
  title: string;
  description: string | null;
  event_date: string;
  venue: string;
  max_capacity: number;
  status: OrganizerEventSummary["status"];
};

type TicketTypeRow = {
  id: string;
  name: string;
  max_capacity: number | null;
};

type RegistrationRow = {
  id: string;
  attendee_name: string;
  attendee_email: string;
  ticket_type_id: string;
  created_at: string;
};

type TicketRow = {
  registration_id: string;
  code: string;
  status: "valid" | "used" | "revoked";
};

type ActiveTicketRow = Omit<TicketRow, "status"> & {
  status: "valid" | "used";
};

function isActiveTicket(ticket: TicketRow): ticket is ActiveTicketRow {
  return ticket.status === "valid" || ticket.status === "used";
}

function mapEvent(row: EventRow): OrganizerEventSummary {
  return {
    id: row.id,
    title: row.title,
    description: row.description,
    eventDate: row.event_date,
    venue: row.venue,
    maxCapacity: row.max_capacity,
    status: row.status,
  };
}

export async function getOrganizerEvents(
  supabase: SupabaseClient,
  userId: string,
): Promise<OrganizerEventSummary[]> {
  const { data, error } = await supabase
    .from("events")
    .select("id,title,description,event_date,venue,max_capacity,status")
    .eq("created_by", userId)
    .order("event_date", { ascending: true });

  if (error) throw error;
  return (data as EventRow[]).map(mapEvent);
}

export async function getOrganizerEventDashboard(
  supabase: SupabaseClient,
  userId: string,
  eventId: string,
): Promise<OrganizerEventDashboard | null> {
  const { data: eventData, error: eventError } = await supabase
    .from("events")
    .select("id,title,description,event_date,venue,max_capacity,status")
    .eq("id", eventId)
    .eq("created_by", userId)
    .maybeSingle();

  if (eventError) throw eventError;
  if (!eventData) return null;

  const [ticketTypesResult, registrationsResult] = await Promise.all([
    supabase
      .from("ticket_types")
      .select("id,name,max_capacity")
      .eq("event_id", eventId)
      .order("created_at", { ascending: true }),
    supabase
      .from("registrations")
      .select("id,attendee_name,attendee_email,ticket_type_id,created_at")
      .eq("event_id", eventId)
      .order("created_at", { ascending: false }),
  ]);

  if (ticketTypesResult.error) throw ticketTypesResult.error;
  if (registrationsResult.error) throw registrationsResult.error;

  const ticketTypeRows = ticketTypesResult.data as TicketTypeRow[];
  const registrationRows = registrationsResult.data as RegistrationRow[];
  const registrationIds = registrationRows.map((registration) => registration.id);
  const ticketRows: TicketRow[] = registrationIds.length === 0
    ? []
    : await supabase
      .from("tickets")
      .select("registration_id,code,status")
      .in("registration_id", registrationIds)
      .then(({ data, error }) => {
        if (error) throw error;
        return data as TicketRow[];
      });
  const activeTicketsByRegistrationId = new Map(
    ticketRows
      .filter(isActiveTicket)
      .map((ticket) => [ticket.registration_id, ticket]),
  );
  const activeRegistrations = registrationRows.filter((registration) =>
    activeTicketsByRegistrationId.has(registration.id),
  );
  const registrationCounts = activeRegistrations.reduce<Record<string, number>>((counts, registration) => {
    counts[registration.ticket_type_id] = (counts[registration.ticket_type_id] ?? 0) + 1;
    return counts;
  }, {});
  const ticketTypes: OrganizerTicketTypeMetrics[] = ticketTypeRows.map((ticketType) => ({
    id: ticketType.id,
    name: ticketType.name,
    maxCapacity: ticketType.max_capacity,
    registrationCount: registrationCounts[ticketType.id] ?? 0,
  }));
  const ticketTypesById = new Map(ticketTypes.map((ticketType) => [ticketType.id, ticketType]));
  const registrations: OrganizerRegistration[] = activeRegistrations.flatMap((registration) => {
    const ticketType = ticketTypesById.get(registration.ticket_type_id);
    const ticket = activeTicketsByRegistrationId.get(registration.id);
    if (!ticketType || !ticket) return [];
    return [{
      id: registration.id,
      attendeeName: registration.attendee_name,
      attendeeEmail: registration.attendee_email,
      registeredAt: registration.created_at,
      ticketType: { id: ticketType.id, name: ticketType.name },
      ticket: { code: ticket.code, status: ticket.status },
    }];
  });

  return {
    event: mapEvent(eventData as EventRow),
    ticketTypes,
    registrations,
  };
}
