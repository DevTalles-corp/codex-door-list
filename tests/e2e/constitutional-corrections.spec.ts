import { createHash, randomUUID } from "node:crypto";
import { createClient } from "@supabase/supabase-js";
import { expect, test } from "@playwright/test";
import { adminClient, accessToken, cleanupOrganizer, createAccount, createEvent, emailsFor } from "./constitutional-fixtures";
import { fromZonedDateTimeLocal, getZonedDateTimeCandidates, toEventDateKey } from "../../lib/dates";
import { decodeCapacityDetails } from "../../lib/errors";

test("event date conversion handles event zones and daylight saving transitions", () => {
  expect(toEventDateKey("2026-10-06T02:00:00Z", "America/La_Paz")).toBe("2026-10-05");
  expect(toEventDateKey("2026-10-06T02:00:00Z", "Europe/Madrid")).toBe("2026-10-06");
  expect(fromZonedDateTimeLocal("2026-10-05T20:00", "America/La_Paz")).toBe("2026-10-06T00:00:00.000Z");
  expect(getZonedDateTimeCandidates("2026-03-08T02:30", "America/New_York")).toEqual([]);
  expect(getZonedDateTimeCandidates("2026-11-01T01:30", "America/New_York")).toEqual(["2026-11-01T05:30:00.000Z", "2026-11-01T06:30:00.000Z"]);
  expect(fromZonedDateTimeLocal("2026-11-01T01:30", "America/New_York")).toBeNull();
  expect(fromZonedDateTimeLocal("2026-11-01T01:30", "America/New_York", "2026-11-01T06:30:00.000Z")).toBe("2026-11-01T06:30:00.000Z");
  expect(fromZonedDateTimeLocal("2026-02-30T01:00", "UTC")).toBeNull();
  expect(decodeCapacityDetails('{"kind":"capacityViolation","version":2,"violations":[]}')).toBeNull();
});

test("pending reservations expire, preserve capacity, and cannot bypass email verification", async ({ request }) => {
  const admin = adminClient(); const owner = await createAccount(admin, "reservation-owner");
  try {
    const event = await createEvent(admin, owner.id, 2);
    const email = `attendee-${randomUUID()}@example.test`;
    const reserve = (target: string) => request.post("/api/registrations", { data: { eventId: event.id, ticketTypeId: event.ticketTypeId, name: "Test attendee", email: target } });
    const invalid = await request.post("/api/registrations", { data: null });
    expect(invalid.status()).toBe(400); expect(Object.keys(await invalid.json())).toEqual(["error"]);
    const response = await reserve(email);
    expect(response.status()).toBe(202);
    const body = await response.json(); expect(Object.keys(body).sort()).toEqual(["expiresAt", "status"]);
    expect(Date.parse(body.expiresAt) - Date.now()).toBeGreaterThan(590_000);
    expect(Date.parse(body.expiresAt) - Date.now()).toBeLessThanOrEqual(600_000);
    const [message] = await emailsFor(request, email);
    const token = message.text.match(/token=([0-9a-f]{64})/)![1];
    const { data: reservation } = await admin.from("registration_reservations").select("token_hash,status").eq("attendee_email", email).single();
    expect(reservation!.token_hash).toBe(createHash("sha256").update(token).digest("hex"));
    const anon = createClient(process.env.E2E_SUPABASE_URL!, process.env.E2E_SUPABASE_ANON_KEY!, { auth: { persistSession: false } });
    const bypass = await anon.rpc("confirm_reservation", { p_token_hash: reservation!.token_hash });
    expect(bypass.error?.code).toBe("42501");
    const confirm = await request.post("/api/registrations/confirmar", { data: { token } });
    expect(confirm.status()).toBe(200); expect((await confirm.json()).ticketCode).toMatch(/^[0-9a-f]{64}$/);
    const replay = await request.post("/api/registrations/confirmar", { data: { token } });
    expect(replay.status()).toBe(409); expect(Object.keys(await replay.json())).toEqual(["error"]);
    expect((await reserve(email.toUpperCase())).status()).toBe(409);
    const pendingEmail = `pending-${randomUUID()}@example.test`;
    expect((await reserve(pendingEmail)).status()).toBe(202);
    expect((await reserve(`third-${randomUUID()}@example.test`)).status()).toBe(409);
    const { error: reductionError } = await admin.from("ticket_types").update({ max_capacity: 1 }).eq("id", event.ticketTypeId);
    expect(reductionError?.code).toBe("23514");
    expect(decodeCapacityDetails(reductionError?.details)?.violations[0].minimumCapacity).toBe(2);
    const pendingToken = (await emailsFor(request, pendingEmail))[0].text.match(/token=([0-9a-f]{64})/)![1];
    await admin.from("registration_reservations").update({ expires_at: new Date(Date.now() - 1000).toISOString() }).eq("attendee_email", pendingEmail);
    const expired = await request.post("/api/registrations/confirmar", { data: { token: pendingToken } });
    expect(expired.status()).toBe(409); expect((await expired.json()).error).toBe("reservation_expired");
    expect((await reserve(pendingEmail)).status()).toBe(202);
    await admin.from("registration_reservations").update({ expires_at: new Date(Date.now() - 1000).toISOString() }).eq("attendee_email", pendingEmail);
    const failedEmail = `email-failure-${randomUUID()}@example.test`;
    expect((await reserve(failedEmail)).status()).toBe(503);
    const { data: cancelled } = await admin.from("registration_reservations").select("status").eq("attendee_email", failedEmail).single();
    expect(cancelled!.status).toBe("cancelled");
    expect((await reserve(`after-failure-${randomUUID()}@example.test`)).status()).toBe(202);
  } finally { await cleanupOrganizer(admin, owner.id); }
});

test("door staff access is per event and audit preserves revoked tickets", async ({ page, request }, testInfo) => {
  const admin = adminClient(); const owner = await createAccount(admin, "access-owner");
  const staff = await createAccount(admin, "door-staff"); const unverified = await createAccount(admin, "unverified", false);
  try {
    const event = await createEvent(admin, owner.id); const otherEvent = await createEvent(admin, owner.id);
    const attendeeEmail = `audit-attendee-${randomUUID()}@example.test`;
    expect((await request.post("/api/registrations", { data: { eventId: event.id, ticketTypeId: event.ticketTypeId, name: "Audit attendee", email: attendeeEmail } })).status()).toBe(202);
    const token = (await emailsFor(request, attendeeEmail))[0].text.match(/token=([0-9a-f]{64})/)![1];
    const confirmation = await request.post("/api/registrations/confirmar", { data: { token } });
    const confirmed = await confirmation.json(); expect(confirmation.status()).toBe(200);
    const staffToken = await accessToken(staff.email, staff.password); const ownerToken = await accessToken(owner.email, owner.password);
    const headers = { Authorization: `Bearer ${staffToken}` };
    const search = () => request.get(`/api/entradas/buscar?eventId=${event.id}&email=${encodeURIComponent(attendeeEmail)}`, { headers });
    expect((await search()).status()).toBe(403);
    await page.goto("/organizador"); await page.getByLabel("Email", { exact: true }).fill(owner.email); await page.getByLabel("Contraseña").fill(owner.password); await page.getByRole("button", { name: "Ingresar" }).click();
    const card = page.locator("article").filter({ has: page.getByRole("heading", { name: event.title, exact: true }) });
    await card.getByLabel("Email de colaborador").focus();
    await page.keyboard.press("Tab");
    await expect(card.getByRole("button", { name: "Dar acceso de puerta" })).toBeFocused();
    await card.getByLabel("Email de colaborador").fill(unverified.email); await card.getByRole("button", { name: "Dar acceso de puerta" }).click();
    await expect(card.getByRole("alert")).toContainText("crear y verificar su cuenta");
    await card.getByLabel("Email de colaborador").fill(staff.email); await card.getByRole("button", { name: "Dar acceso de puerta" }).click();
    await expect(card.getByRole("status")).toContainText("asignado");
    expect((await search()).status()).toBe(200);
    expect((await request.get(`/api/entradas/buscar?eventId=${otherEvent.id}&email=${encodeURIComponent(attendeeEmail)}`, { headers })).status()).toBe(403);
    expect((await request.get(`/api/eventos/${event.id}/auditoria`, { headers })).status()).toBe(403);
    expect((await request.get(`/api/eventos/${event.id}/asistentes`, { headers })).status()).toBe(403);
    const staffClient = createClient(process.env.E2E_SUPABASE_URL!, process.env.E2E_SUPABASE_ANON_KEY!, { auth: { persistSession: false }, global: { headers } });
    const forbiddenEdit = await staffClient.from("events").update({ title: "Staff edit" }).eq("id", event.id).select("id");
    expect(forbiddenEdit.data).toEqual([]);
    const checkIn = await request.post("/api/entradas/check-in", { headers, data: { eventId: event.id, ticketCode: confirmed.ticketCode } });
    expect(checkIn.status()).toBe(200);
    const publicTicket = await admin.rpc("get_public_ticket", { p_code: confirmed.ticketCode });
    expect(publicTicket.data.attendee).toBeUndefined();
    await page.goto(`/entradas/${confirmed.ticketCode}`); await expect(page.getByText("Audit attendee", { exact: true })).toHaveCount(0); await expect(page.getByText(attendeeEmail, { exact: true })).toHaveCount(0);
    await page.screenshot({ path: testInfo.outputPath("ticket-desktop.png"), fullPage: true });
    await page.setViewportSize({ width: 390, height: 844 }); await page.screenshot({ path: testInfo.outputPath("ticket-mobile.png"), fullPage: true });
    await admin.from("tickets").update({ status: "revoked" }).eq("registration_id", confirmed.registrationId);
    expect((await search()).status()).toBe(404);
    const ownerHeaders = { Authorization: `Bearer ${ownerToken}` };
    const operative = await request.get(`/api/eventos/${event.id}/asistentes`, { headers: ownerHeaders });
    expect(operative.status()).toBe(200); expect(await operative.text()).not.toContain(attendeeEmail);
    const audit = await request.get(`/api/eventos/${event.id}/auditoria`, { headers: ownerHeaders });
    expect(audit.status()).toBe(200); const csv = await audit.text(); expect(csv).toContain(attendeeEmail); expect(csv).toContain("Revocada"); expect(csv).toContain("fecha de revocación");
    await page.goto("/organizador"); await card.getByRole("button", { name: "Retirar acceso" }).click(); await expect(card.getByRole("status")).toContainText("retirado");
    expect((await search()).status()).toBe(403);
    const lostAccess = await request.post("/api/entradas/check-in", { headers, data: { eventId: event.id, ticketCode: confirmed.ticketCode } });
    expect(lostAccess.status()).toBe(403);
    await page.setViewportSize({ width: 1280, height: 900 }); await page.screenshot({ path: testInfo.outputPath("organizer-desktop.png"), fullPage: true });
    await page.setViewportSize({ width: 390, height: 844 }); await page.screenshot({ path: testInfo.outputPath("organizer-mobile.png"), fullPage: true });
  } finally {
    await cleanupOrganizer(admin, owner.id); await cleanupOrganizer(admin, staff.id); await cleanupOrganizer(admin, unverified.id);
  }
});
