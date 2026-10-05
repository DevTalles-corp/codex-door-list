import { randomUUID } from "node:crypto";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import type { APIRequestContext } from "@playwright/test";

export type CapturedEmail = { to: string[]; subject: string; html: string; text: string;
  attachments?: { filename: string; content: string | { type: "Buffer"; data: number[] } }[] };

export function adminClient() {
  return createClient(process.env.E2E_SUPABASE_URL!, process.env.E2E_SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { persistSession: false, autoRefreshToken: false } });
}

export async function createAccount(admin: SupabaseClient, prefix: string, verified = true) {
  const email = `${prefix}-${randomUUID()}@example.test`;
  const password = `DoorList-${randomUUID()}`;
  const { data, error } = await admin.auth.admin.createUser({ email, password, email_confirm: verified });
  if (error || !data.user) throw new Error("Could not create local fixture account");
  return { id: data.user.id, email, password };
}

export async function accessToken(email: string, password: string) {
  const client = createClient(process.env.E2E_SUPABASE_URL!, process.env.E2E_SUPABASE_ANON_KEY!,
    { auth: { persistSession: false, autoRefreshToken: false } });
  const { data, error } = await client.auth.signInWithPassword({ email, password });
  if (error || !data.session) throw new Error("Could not sign in to local fixture account");
  return data.session.access_token;
}

export async function createEvent(admin: SupabaseClient, ownerId: string, capacity = 2, timeZone = "America/La_Paz") {
  const now = Date.now();
  const { data: event, error } = await admin.from("events").insert({ created_by: ownerId,
    title: `Test ${randomUUID()}`, venue: "Test venue", event_date: new Date(now).toISOString(), max_capacity: capacity,
    time_zone: timeZone, registration_closes_at: new Date(now + 3600_000).toISOString(),
    entry_opens_at: new Date(now - 3600_000).toISOString(), entry_closes_at: new Date(now + 7200_000).toISOString() })
    .select("id,title,public_code").single();
  if (error || !event) throw new Error(`Could not create fixture Event: ${error?.code}`);
  const { data: type, error: typeError } = await admin.from("ticket_types")
    .insert({ event_id: event.id, name: "General", max_capacity: capacity }).select("id").single();
  if (typeError || !type) throw new Error("Could not create fixture TicketType");
  const { error: publishError } = await admin.from("events").update({ status: "published" }).eq("id", event.id);
  if (publishError) throw new Error("Could not publish fixture Event");
  return { id: event.id as string, publicCode: event.public_code as string, title: event.title as string, ticketTypeId: type.id as string };
}

export async function emailsFor(request: APIRequestContext, email: string): Promise<CapturedEmail[]> {
  const response = await request.get(`http://127.0.0.1:3101/messages?to=${encodeURIComponent(email)}`);
  if (!response.ok()) throw new Error("Could not read simulated email");
  return response.json();
}

export async function cleanupOrganizer(admin: SupabaseClient, userId: string) {
  const { data: events, error } = await admin.from("events").select("id").eq("created_by", userId);
  if (error) throw error;
  for (const event of events) {
    const { data: registrations, error: registrationError } = await admin.from("registrations").select("id").eq("event_id", event.id);
    if (registrationError) throw registrationError;
    if (registrations.length) {
      const { error: ticketError } = await admin.from("tickets").delete().in("registration_id", registrations.map((row) => row.id));
      if (ticketError) throw ticketError;
    }
    const { error: deleteError } = await admin.from("events").delete().eq("id", event.id);
    if (deleteError) throw deleteError;
  }
  const { error: userError } = await admin.auth.admin.deleteUser(userId);
  if (userError) throw userError;
}
