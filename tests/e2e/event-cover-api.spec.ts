import { expect, test } from "@playwright/test";
import type { APIRequestContext } from "@playwright/test";
import { createClient } from "@supabase/supabase-js";
import { createHash } from "node:crypto";
import coverConfig from "../../lib/event-cover-config.json";
import { cleanupEventCovers } from "../../lib/event-cover-cleanup.mjs";
import { accessToken, adminClient, cleanupOrganizer } from "./constitutional-fixtures";
import { coverFixture, createCoverActors, generateCoverFixtures, maxCoverBytes, newCoverOperationId } from "./event-cover-fixtures";
import type { PrepareEventCoverResponse } from "../../lib/event-cover-types";

test.beforeAll(generateCoverFixtures);

test("Storage failures and lost commit responses preserve saved state and recover the same operation", async ({ request }) => {
  test.skip(process.env.E2E_COVER_FAULT_PROXY !== "1", "Requires the isolated cover runner's local fault proxy");
  const admin = adminClient(), actors = await createCoverActors(admin);
  const token = await accessToken(actors.owner.email, actors.owner.password), headers = { Authorization: `Bearer ${token}` };
  const base = `/api/eventos/${actors.event.id}/portada`;
  const fault = async (kind: string, mode = "fail") => expect((await request.post("http://127.0.0.1:3102/__fault", { data: { kind, mode } })).ok()).toBeTruthy();
  try {
    let saved = await (await request.get(base, { headers })).json();
    for (const [kind, mode] of [["download", "fail"], ["publish", "fail"], ["publish", "late"], ["commit", "fail"]]) {
      const prepared = await uploadCover(request, base, token, saved.revision, "minimum.png");
      const body = { operationId: prepared.operationId, expectedRevision: saved.revision };
      await fault(kind, mode); const started = Date.now();
      const failed = await request.post(`${base}/confirmar`, { headers, data: body, timeout: coverConfig.processingTimeoutMs + 10_000 });
      expect(failed.status()).toBe(503); expect(failed.headers()["cache-control"]).toBe("private, no-store");
      expect(await failed.json()).toEqual({ error: expect.any(String) });
      expect(await (await request.get(base, { headers })).json()).toEqual(saved);
      if (mode === "late") {
        expect(Date.now() - started).toBeGreaterThanOrEqual(coverConfig.storageRequestTimeoutMs - 500);
        expect(Date.now() - started).toBeLessThan(coverConfig.storageRequestTimeoutMs + 8_000);
        const { data: operation } = await admin.from("event_cover_operations").select("candidate_path").eq("operation_id", body.operationId).single();
        expect((await admin.storage.from("event-covers").info(operation!.candidate_path)).error).toBeNull();
        const { data: job } = await admin.from("event_cover_cleanup_jobs").select("transfer_uncertain").eq("object_path", operation!.candidate_path).single();
        expect(job?.transfer_uncertain).toBe(true);
      }
      if (kind === "commit") {
        // Failed commit request can still be in flight; expiry enables a fenced new attempt.
        await admin.from("event_cover_operations").update({ lease_until: new Date(0).toISOString() }).eq("operation_id", body.operationId);
      }
      const retry = await request.post(`${base}/confirmar`, { headers, data: body }); expect(retry.status()).toBe(200);
      saved = await retry.json();
    }
    const prepared = await uploadCover(request, base, token, saved.revision, "square.png");
    const body = { operationId: prepared.operationId, expectedRevision: saved.revision };
    await fault("commit", "lost");
    const lost = await request.post(`${base}/confirmar`, { headers, data: body }); expect([200, 503]).toContain(lost.status());
    const result = await (await request.get(`${base}/operaciones/${body.operationId}`, { headers })).json();
    expect(result.status).toBe("committed"); expect(result.result.revision).toBe(String(Number(saved.revision) + 1));
    const replay = await request.post(`${base}/confirmar`, { headers, data: body }); expect(await replay.json()).toEqual(result.result);
    saved = result.result;
    for (const method of ["patch", "delete"] as const) {
      const metadata = { operationId: newCoverOperationId(), expectedRevision: saved.revision, ...(method === "patch" ? { positionY: 0.25 } : {}) };
      await fault("metadata");
      expect((await request[method](base, { headers, data: metadata })).status()).toBe(503);
      expect(await (await request.get(base, { headers })).json()).toEqual(saved);
      const retry = await request[method](base, { headers, data: metadata }); expect(retry.status()).toBe(200); saved = await retry.json();
    }
  } finally {
    await fault("reset"); for (const actor of [actors.owner, actors.otherOwner, actors.doorOnly]) await cleanupOrganizer(admin, actor.id);
  }
});

async function uploadCover(request: APIRequestContext, base: string, token: string, revision: string, name: string) {
  const bytes = await coverFixture(name);
  const prepared = await request.post(`${base}/subidas`, { headers: { Authorization: `Bearer ${token}` }, data: { expectedRevision: revision, byteSize: bytes.length } });
  expect(prepared.status()).toBe(201);
  expect(prepared.headers()["cache-control"]).toBe("private, no-store");
  const data: PrepareEventCoverResponse = await prepared.json();
  expect(data.operationId).toMatch(/^[0-9a-f]{64}$/);
  expect(data.upload.path).toMatch(/^uploads\/[0-9a-f]{64}$/);
  const client = createClient(process.env.E2E_SUPABASE_URL!, process.env.E2E_SUPABASE_ANON_KEY!, { auth: { persistSession: false } });
  const result = await client.storage.from(data.upload.bucket).uploadToSignedUrl(data.upload.path, data.upload.token, bytes, { contentType: "application/octet-stream", upsert: false });
  expect(result.error).toBeNull();
  return data;
}

test("real private uploads validate actual bytes and preserve the saved cover on invalid input", async ({ request }) => {
  const admin = adminClient(); const actors = await createCoverActors(admin);
  const token = await accessToken(actors.owner.email, actors.owner.password);
  const headers = { Authorization: `Bearer ${token}` };
  const base = `/api/eventos/${actors.event.id}/portada`;
  try {
    const initial = await request.get(base, { headers });
    expect(initial.status()).toBe(200); expect(await initial.json()).toEqual({ eventId: actors.event.id, revision: "0", cover: null });
    let revision = "0";
    for (const name of ["minimum.jpeg", "minimum.png", "minimum.webp", "exact-5mib.png", "text-actl.png", "jpeg-named-png.png", "wide.png", "tall.png", ...Array.from({ length: 8 }, (_, i) => `exif-${i + 1}.jpeg`)]) {
      const prepared = await uploadCover(request, base, token, revision, name);
      const body = { operationId: prepared.operationId, expectedRevision: revision, altText: "  Descripción accesible  ", positionX: 0.25, positionY: 0.7 };
      const saved = await request.post(`${base}/confirmar`, { headers, data: body });
      expect(saved.status(), name).toBe(200);
      const state = await saved.json();
      expect(state.revision).toBe(String(BigInt(revision) + BigInt(1)));
      expect(state.cover).toMatchObject({ altText: "Descripción accesible", positionX: 0.25, positionY: 0.7 });
      expect(state.cover.url).toMatch(/\/storage\/v1\/object\/public\/event-covers\/covers\/[0-9a-f]{64}$/);
      const replay = await request.post(`${base}/confirmar`, { headers, data: body });
      expect(replay.status()).toBe(200); expect(await replay.json()).toEqual(state);
      const operation = await request.get(`${base}/operaciones/${prepared.operationId}`, { headers });
      expect(await operation.json()).toMatchObject({ status: "committed", result: state });
      const changed = await request.post(`${base}/confirmar`, { headers, data: { ...body, positionX: 0.5 } });
      expect(changed.status()).toBe(409);
      revision = state.revision;
    }
    const before = await (await request.get(base, { headers })).json();
    for (const name of ["narrow.png", "short.png", "damaged.png", "unsupported.gif", "unsupported.svg", "false-jpeg.jpeg", "animated-one.png", "animated.png", "animated-one.webp", "animated.webp"]) {
      const prepared = await uploadCover(request, base, token, revision, name);
      const response = await request.post(`${base}/confirmar`, { headers, data: { operationId: prepared.operationId, expectedRevision: revision } });
      expect(response.status(), name).toBe(422);
      expect(await response.json()).toEqual({ error: expect.any(String) });
      expect(await (await request.get(base, { headers })).json()).toEqual(before);
    }
    const oversized = await request.post(`${base}/subidas`, { headers, data: { expectedRevision: revision, byteSize: maxCoverBytes + 1 } });
    expect(oversized.status()).toBe(413);
    const empty = await request.post(`${base}/subidas`, { headers, data: { expectedRevision: revision, byteSize: 0 } });
    expect(empty.status()).toBe(400);
    const malicious = await request.post(`${base}/subidas`, { headers, data: { expectedRevision: revision, byteSize: 100, path: "covers/arbitrary" } });
    expect(malicious.status()).toBe(400);
  } finally {
    for (const actor of [actors.owner, actors.otherOwner, actors.doorOnly]) await cleanupOrganizer(admin, actor.id);
  }
});

test("only the owner can prepare and commit; a staging signature never grants editing", async ({ request }) => {
  const admin = adminClient(); const actors = await createCoverActors(admin);
  const base = `/api/eventos/${actors.event.id}/portada`;
  try {
    expect((await request.get(base)).status()).toBe(401);
    for (const actor of [actors.otherOwner, actors.doorOnly]) {
      const token = await accessToken(actor.email, actor.password);
      expect((await request.post(`${base}/subidas`, { headers: { Authorization: `Bearer ${token}` }, data: { expectedRevision: "0", byteSize: 100 } })).status()).toBe(403);
    }
    const token = await accessToken(actors.owner.email, actors.owner.password);
    const prepared = await uploadCover(request, base, token, "0", "minimum.png");
    await admin.from("events").update({ created_by: actors.otherOwner.id }).eq("id", actors.event.id);
    const response = await request.post(`${base}/confirmar`, { headers: { Authorization: `Bearer ${token}` }, data: { operationId: prepared.operationId, expectedRevision: "0" } });
    expect(response.status()).toBe(403);
    const { data } = await admin.from("event_covers").select("object_path,revision").eq("event_id", actors.event.id).single();
    expect(data).toMatchObject({ object_path: null, revision: 0 });
  } finally {
    for (const actor of [actors.owner, actors.otherOwner, actors.doorOnly]) await cleanupOrganizer(admin, actor.id);
  }
});

test("busy claims return 202, stale workers are fenced, and a missing upload is recoverable", async ({ request }) => {
  const admin = adminClient(); const actors = await createCoverActors(admin);
  const token = await accessToken(actors.owner.email, actors.owner.password);
  const headers = { Authorization: `Bearer ${token}` }; const base = `/api/eventos/${actors.event.id}/portada`;
  try {
    const prepared = await uploadCover(request, base, token, "0", "minimum.png");
    const fingerprint = createHash("sha256").update(JSON.stringify({ actorId: actors.owner.id, eventId: actors.event.id, kind: "upload", revision: "0", altText: null, positionX: 0.5, positionY: 0.5 })).digest("hex");
    const lease = "a".repeat(64); const candidate = `covers/${"b".repeat(64)}`;
    const claim = await admin.rpc("claim_event_cover_upload", { p_event_id: actors.event.id, p_actor_id: actors.owner.id, p_operation_id: prepared.operationId,
      p_expected_revision: "0", p_fingerprint: fingerprint, p_metadata: { altText: null, positionX: 0.5, positionY: 0.5 },
      p_lease_token: lease, p_candidate_path: candidate, p_config: coverConfig });
    expect(claim.error).toBeNull(); expect(claim.data.status).toBe("claimed");
    const fenced = await admin.rpc("finish_event_cover_upload", { p_event_id: actors.event.id, p_actor_id: actors.owner.id, p_operation_id: prepared.operationId,
      p_lease_token: "c".repeat(64), p_validated_metadata: {} });
    expect(fenced.error?.code).toBe("PT409"); expect(fenced.status).toBe(409);
    const busy = await request.post(`${base}/confirmar`, { headers, data: { operationId: prepared.operationId, expectedRevision: "0" } });
    expect(busy.status()).toBe(202); expect(busy.headers()["retry-after"]).toBe("2");
    const { data: job } = await admin.from("event_cover_cleanup_jobs").select("due_at").eq("object_path", candidate).single();
    expect(Date.parse(job!.due_at)).toBeGreaterThanOrEqual(Date.parse(claim.data.leaseUntil) + coverConfig.storageRequestTimeoutMs + coverConfig.cleanupTransferMarginMs);
    await admin.from("event_cover_operations").update({ lease_until: new Date(0).toISOString() }).eq("operation_id", prepared.operationId);
    const saved = await request.post(`${base}/confirmar`, { headers, data: { operationId: prepared.operationId, expectedRevision: "0" } });
    expect(saved.status()).toBe(200); expect((await saved.json()).revision).toBe("1");
    expect((await request.post(`${base}/subidas`, { headers, data: { expectedRevision: "0", byteSize: 100 } })).status()).toBe(409);
    const stale = await admin.rpc("finish_event_cover_upload", { p_event_id: actors.event.id, p_actor_id: actors.owner.id, p_operation_id: prepared.operationId,
      p_lease_token: lease, p_validated_metadata: {} });
    // A committed replay returns the durable result, without using stale bytes.
    expect(stale.error).toBeNull(); expect(stale.data.result.revision).toBe("1");
    const pending = await request.post(`${base}/subidas`, { headers, data: { expectedRevision: "1", byteSize: 100 } });
    const data = await pending.json();
    expect((await request.post(`${base}/confirmar`, { headers, data: { operationId: data.operationId, expectedRevision: "1" } })).status()).toBe(409);
    expect((await (await request.get(base, { headers })).json()).revision).toBe("1");
  } finally { for (const actor of [actors.owner, actors.otherOwner, actors.doorOnly]) await cleanupOrganizer(admin, actor.id); }
});

test("browser credentials cannot bypass validation, read staging, list covers or alter ledgers", async () => {
  const admin = adminClient(); const actors = await createCoverActors(admin);
  const token = await accessToken(actors.owner.email, actors.owner.password);
  const client = createClient(process.env.E2E_SUPABASE_URL!, process.env.E2E_SUPABASE_ANON_KEY!, { auth: { persistSession: false }, global: { headers: { Authorization: `Bearer ${token}` } } });
  try {
    const update = await client.from("event_covers").update({ revision: 100 }).eq("event_id", actors.event.id);
    expect(update.error?.code).toBe("42501");
    expect((await client.from("event_cover_operations").select("*")).error?.code).toBe("42501");
    expect((await client.from("event_cover_cleanup_jobs").select("*")).error?.code).toBe("42501");
    expect((await client.storage.from("event-cover-uploads").download(`uploads/${"c".repeat(64)}`)).error).toBeTruthy();
    expect((await client.storage.from("event-covers").upload(`covers/${"d".repeat(64)}`, await coverFixture("minimum.png"), { contentType: "image/png" })).error).toBeTruthy();
    const list = await client.storage.from("event-covers").list("covers");
    expect(list.data ?? []).toEqual([]);
  } finally { for (const actor of [actors.owner, actors.otherOwner, actors.doorOnly]) await cleanupOrganizer(admin, actor.id); }
});

test("cleanup removes obsolete bytes and staging, keeps the active cover and reconciles late uploads", async ({ request }) => {
  const admin = adminClient(); const actors = await createCoverActors(admin);
  const token = await accessToken(actors.owner.email, actors.owner.password);
  const headers = { Authorization: `Bearer ${token}` }; const base = `/api/eventos/${actors.event.id}/portada`;
  try {
    const first = await uploadCover(request, base, token, "0", "minimum.png");
    const a = await request.post(`${base}/confirmar`, { headers, data: { operationId: first.operationId, expectedRevision: "0" } });
    expect(a.ok()).toBeTruthy(); const firstCover = (await a.json()).cover;
    const second = await uploadCover(request, base, token, "1", "minimum.webp");
    const b = await request.post(`${base}/confirmar`, { headers, data: { operationId: second.operationId, expectedRevision: "1" } });
    expect(b.ok()).toBeTruthy(); const saved = await b.json();
    await admin.from("event_cover_operations").update({ upload_expires_at: new Date(0).toISOString() }).eq("operation_id", first.operationId);
    await admin.from("event_cover_cleanup_jobs").update({ due_at: new Date(0).toISOString(), next_attempt_at: new Date(0).toISOString() }).in("operation_id", [first.operationId, second.operationId]);
    const result = await cleanupEventCovers({ url: process.env.E2E_SUPABASE_URL, key: process.env.E2E_SUPABASE_SERVICE_ROLE_KEY });
    expect(result.failed).toBe(0); expect(result.deleted).toBeGreaterThanOrEqual(2);
    const removed = await request.get(firstCover.url);
    expect([400, 404]).toContain(removed.status());
    expect(String((await removed.json()).statusCode)).toBe("404");
    expect((await request.get(saved.cover.url)).ok()).toBeTruthy();
    expect(await (await request.get(base, { headers })).json()).toEqual(saved);
    const client = createClient(process.env.E2E_SUPABASE_URL!, process.env.E2E_SUPABASE_ANON_KEY!, { auth: { persistSession: false } });
    // Simulate a late transfer with a still-valid signature; reconciliation reopens the tombstone.
    expect((await client.storage.from(first.upload.bucket).uploadToSignedUrl(first.upload.path, first.upload.token, await coverFixture("minimum.png"), { contentType: "application/octet-stream" })).error).toBeNull();
    const retry = await cleanupEventCovers({ url: process.env.E2E_SUPABASE_URL, key: process.env.E2E_SUPABASE_SERVICE_ROLE_KEY });
    expect(retry.failed).toBe(0); expect(retry.deleted).toBeGreaterThanOrEqual(1);
    expect((await request.get(saved.cover.url)).ok()).toBeTruthy();
  } finally { for (const actor of [actors.owner, actors.otherOwner, actors.doorOnly]) await cleanupOrganizer(admin, actor.id); }
});

test("metadata/remove are authorized CAS commits with durable replay and unchanged business rows", async ({ request }) => {
  const admin = adminClient(); const actors = await createCoverActors(admin);
  const token = await accessToken(actors.owner.email, actors.owner.password);
  const headers = { Authorization: `Bearer ${token}` }; const base = `/api/eventos/${actors.event.id}/portada`;
  const snapshot = async () => {
    const result: Record<string, unknown> = {};
    for (const table of ["events", "ticket_types", "registrations", "registration_reservations", "tickets", "event_door_staff"]) {
      const rows = await admin.from(table).select("*"); expect(rows.error).toBeNull(); result[table] = rows.data;
    }
    return result;
  };
  try {
    const { data: types } = await admin.from("ticket_types").select("id").eq("event_id", actors.event.id);
    for (let index = 0; index < 2; index++) {
      const { data: registration, error } = await admin.from("registrations").insert({ event_id: actors.event.id, ticket_type_id: types![0].id,
        attendee_name: `Cover invariant ${index}`, attendee_email: `cover-invariant-${newCoverOperationId()}@example.test` }).select("id").single();
      expect(error).toBeNull();
      expect((await admin.from("tickets").insert({ registration_id: registration!.id, status: index ? "revoked" : "valid" })).error).toBeNull();
    }
    const reservation = await request.post("/api/registrations", { data: { eventId: actors.event.id, ticketTypeId: types![0].id, name: "Pending cover invariant", email: `cover-pending-${newCoverOperationId()}@example.test` } });
    expect(reservation.ok()).toBeTruthy();
    const availability = await admin.rpc("get_public_event_registration", { p_code: actors.event.publicCode });
    expect(availability.data.ticket_types[0].remaining_capacity).toBe(7);
    const before = await snapshot();
    const prepared = await uploadCover(request, base, token, "0", "portrait.png");
    const first = await request.post(`${base}/confirmar`, { headers, data: { operationId: prepared.operationId, expectedRevision: "0", altText: "A", positionX: 0.3, positionY: 0.7 } });
    expect(first.status()).toBe(200); await expect(snapshot()).resolves.toEqual(before);
    const replacement = await uploadCover(request, base, token, "1", "square.png");
    const replaced = await request.post(`${base}/confirmar`, { headers, data: { operationId: replacement.operationId, expectedRevision: "1" } });
    expect(replaced.status()).toBe(200); const a = await replaced.json();
    expect(a.cover).toMatchObject({ altText: null, positionX: 0.5, positionY: 0.5 }); await expect(snapshot()).resolves.toEqual(before);
    const patch = { operationId: newCoverOperationId(), expectedRevision: "2", altText: "  Updated alt  " };
    const response = await request.patch(base, { headers, data: patch }); expect(response.status()).toBe(200);
    const metadata = await response.json(); expect(metadata.revision).toBe("3");
    expect(metadata.cover).toEqual({ ...a.cover, altText: "Updated alt" });
    expect(await (await request.patch(base, { headers, data: patch })).json()).toEqual(metadata);
    expect((await request.patch(base, { headers, data: { ...patch, altText: "other payload" } })).status()).toBe(409);
    const cleared = await request.patch(base, { headers, data: { operationId: newCoverOperationId(), expectedRevision: "3", altText: "   ", positionX: 1, positionY: 0 } });
    expect(cleared.status()).toBe(200); const state = await cleared.json(); expect(state.cover).toMatchObject({ altText: null, positionX: 1, positionY: 0 });
    await expect(snapshot()).resolves.toEqual(before);
    expect((await request.patch(base, { headers, data: { operationId: newCoverOperationId(), expectedRevision: "4" } })).status()).toBe(400);
    const remove = { operationId: newCoverOperationId(), expectedRevision: "4" };
    const removed = await request.delete(base, { headers, data: remove }); expect(removed.status()).toBe(200);
    expect(await removed.json()).toEqual({ eventId: actors.event.id, revision: "5", cover: null });
    expect(await (await request.delete(base, { headers, data: remove })).json()).toEqual({ eventId: actors.event.id, revision: "5", cover: null });
    expect((await request.patch(base, { headers, data: { operationId: newCoverOperationId(), expectedRevision: "5", altText: "Absent cover" } })).status()).toBe(409);
    const noop = await request.delete(base, { headers, data: { operationId: newCoverOperationId(), expectedRevision: "5" } });
    expect(noop.status()).toBe(200); expect((await noop.json()).revision).toBe("5");
    expect((await request.delete(base, { headers, data: { operationId: newCoverOperationId(), expectedRevision: "0" } })).status()).toBe(409);
    expect(await snapshot()).toEqual(before);
    expect((await admin.rpc("get_public_event_registration", { p_code: actors.event.publicCode })).data.ticket_types[0].remaining_capacity).toBe(7);
  } finally { for (const actor of [actors.owner, actors.otherOwner, actors.doorOnly]) await cleanupOrganizer(admin, actor.id); }
});
