import type { SupabaseClient } from "@supabase/supabase-js";
import type { AuditRegistration } from "@/lib/types";

export async function getAuditRegistrations(client: SupabaseClient, eventId: string): Promise<AuditRegistration[]> {
  const registrations: { id: string; attendee_name: string; attendee_email: string; ticket_type_id: string; created_at: string }[] = [];
  for (let offset = 0; ; offset += 500) {
    const { data, error } = await client.from("registrations")
      .select("id,attendee_name,attendee_email,ticket_type_id,created_at")
      .eq("event_id", eventId).order("id").range(offset, offset + 499);
    if (error) throw error;
    registrations.push(...data);
    if (data.length < 500) break;
  }
  const names = new Map<string, string>();
  for (let offset = 0; ; offset += 500) {
    const { data, error } = await client.from("ticket_types")
      .select("id,name").eq("event_id", eventId).order("id").range(offset, offset + 499);
    if (error) throw error;
    for (const row of data) names.set(row.id, row.name);
    if (data.length < 500) break;
  }
  const tickets = new Map<string, AuditRegistration["ticket"]>();
  for (let offset = 0; offset < registrations.length; offset += 100) {
    const { data, error } = await client.from("tickets")
      .select("registration_id,code,status,created_at,checked_in_at,revoked_at")
      .in("registration_id", registrations.slice(offset, offset + 100).map((row) => row.id));
    if (error) throw error;
    for (const row of data) tickets.set(row.registration_id, {
      code: row.code, status: row.status, issuedAt: row.created_at,
      checkedInAt: row.checked_in_at, revokedAt: row.revoked_at,
    });
  }
  return registrations.flatMap((row) => {
    const ticket = tickets.get(row.id);
    const name = names.get(row.ticket_type_id);
    return ticket && name ? [{ id: row.id, attendeeName: row.attendee_name,
      attendeeEmail: row.attendee_email, registeredAt: row.created_at,
      ticketType: { id: row.ticket_type_id, name }, ticket }] : [];
  });
}
