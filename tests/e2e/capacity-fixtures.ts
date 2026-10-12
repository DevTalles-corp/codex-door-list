import { randomUUID } from "node:crypto";
import type { SupabaseClient } from "@supabase/supabase-js";
import { fixtureError } from "./fixture-errors";
export { adminClient, accessToken, cleanupOrganizer, createAccount } from "./constitutional-fixtures";

export async function capacityEvent(admin: SupabaseClient, ownerId: string, capacity: number, types: { name: string; capacity: number; count: number }[]) {
  const now = Date.now();
  const { data: event, error } = await admin.from("events").insert({ created_by: ownerId, title: `Capacity ${randomUUID()}`, venue: "Test", max_capacity: capacity,
    event_date: new Date(now).toISOString(), time_zone: "UTC", registration_closes_at: new Date(now + 3600_000).toISOString(),
    entry_opens_at: new Date(now - 3600_000).toISOString(), entry_closes_at: new Date(now + 3600_000).toISOString() }).select("id,title").single();
  if (error || !event) throw fixtureError("Could not create capacity fixture Event", error);
  const result: { id: string; name: string }[] = [];
  for (const type of types) {
    const { data: row, error: typeError } = await admin.from("ticket_types").insert({ event_id: event.id, name: type.name, max_capacity: type.capacity }).select("id,name").single();
    if (typeError || !row) throw fixtureError("Could not create capacity fixture TicketType", typeError);
    result.push(row);
    for (let index = 0; index < type.count; index++) {
      const { data: registration, error: registrationError } = await admin.from("registrations").insert({ event_id: event.id, ticket_type_id: row.id,
        attendee_name: `Attendee ${index}`, attendee_email: `capacity-${randomUUID()}@example.test` }).select("id").single();
      if (registrationError || !registration) throw fixtureError("Could not create capacity fixture Registration", registrationError);
      const { error: ticketError } = await admin.from("tickets").insert({ registration_id: registration.id, status: ["valid", "used", "revoked"][index % 3] });
      if (ticketError) throw fixtureError("Could not create capacity fixture Ticket", ticketError);
    }
  }
  const { error: publishError } = await admin.from("events").update({ status: "published" }).eq("id", event.id);
  if (publishError) throw fixtureError("Could not publish capacity fixture", publishError);
  return { ...event, types: result };
}
