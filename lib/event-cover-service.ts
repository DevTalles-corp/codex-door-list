import "server-only";
import { createHash, randomBytes } from "node:crypto";
import type { SupabaseClient } from "@supabase/supabase-js";
import { getRequestSupabase } from "./supabase/server";
import { createAdminClient } from "./supabase/admin";
import { eventCoverConfig } from "./event-cover-config.mjs";
import { maxEventCoverBytes, normalizeCoverAlt, normalizeCoverPosition, organizerEventCover } from "./event-cover";
import { validateEventCover } from "./event-cover-validation";
import { EventCoverError, coverConflict, coverUnavailable } from "./event-cover-errors";
import type { EventCoverClaim, EventCoverMetadata, EventCoverOperationKind, PersistedEventCoverState } from "./event-cover-types";

export const newEventCoverId = () => randomBytes(32).toString("hex");
export { EventCoverError, coverConflict, coverUnavailable };
const invalid = () => new EventCoverError(400, "Revisa los datos de la portada.");

export function parseCoverRevision(value: unknown): string {
  if (typeof value !== "string" || !/^\d+$/.test(value) || value.length > 19) throw invalid();
  const revision = BigInt(value);
  if (revision > BigInt("9223372036854775807")) throw invalid();
  return revision.toString();
}

export function parseCoverOperationId(value: unknown): string {
  if (typeof value !== "string" || !/^[0-9a-f]{64}$/.test(value)) throw invalid();
  return value;
}

export async function coverRequestBody(request: Request, allowedKeys: string[]): Promise<Record<string, unknown>> {
  let body: unknown;
  try { body = await request.json(); } catch { throw invalid(); }
  if (!body || typeof body !== "object" || Array.isArray(body) || Object.keys(body).some((key) => !allowedKeys.includes(key))) throw invalid();
  return body as Record<string, unknown>;
}

export function parseCoverMetadata(body: Record<string, unknown>, defaults = false): EventCoverMetadata {
  const metadata: EventCoverMetadata = {};
  if ("altText" in body || defaults) {
    if (body.altText !== undefined && body.altText !== null && typeof body.altText !== "string") throw invalid();
    metadata.altText = normalizeCoverAlt(body.altText as string | null | undefined);
  }
  for (const key of ["positionX", "positionY"] as const) {
    if (key in body || defaults) {
      try { metadata[key] = normalizeCoverPosition(body[key]); } catch { throw invalid(); }
    }
  }
  return metadata;
}

export function coverFingerprint(actorId: string, eventId: string, kind: EventCoverOperationKind, revision: string, metadata: EventCoverMetadata) {
  return createHash("sha256").update(JSON.stringify({ actorId, eventId, kind, revision,
    ...("altText" in metadata ? { altText: metadata.altText } : {}),
    ...("positionX" in metadata ? { positionX: metadata.positionX } : {}),
    ...("positionY" in metadata ? { positionY: metadata.positionY } : {}),
  })).digest("hex");
}

export async function authorizeEventCover(request: Request, eventId: string) {
  if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(eventId)) throw invalid();
  const auth = await getRequestSupabase(request);
  if (!auth.user || !auth.client) throw new EventCoverError(auth.status ?? 503, auth.status === 401
    ? "Inicia sesión para editar la portada." : "La portada no está disponible en este momento.");
  const { data, error } = await auth.client.from("events").select("id,created_by").eq("id", eventId).maybeSingle();
  if (error) throw coverUnavailable();
  if (!data) throw new EventCoverError(404, "No encontramos este evento.");
  if (data.created_by !== auth.user.id) throw new EventCoverError(403, "No tienes permiso para editar este evento.");
  const admin = createAdminClient();
  if (!admin) throw coverUnavailable();
  return { admin, actorId: auth.user.id, eventId };
}

export async function coverRpc(admin: SupabaseClient, name: string, params: Record<string, unknown>, deadline?: number) {
  const timeout = Math.min(eventCoverConfig.storageRequestTimeoutMs, deadline === undefined ? Infinity : deadline - Date.now());
  if (timeout <= 0) throw coverUnavailable();
  const { data, error } = await admin.rpc(name, params).abortSignal(AbortSignal.timeout(timeout));
  if (error) {
    if (error.code === "42501") throw new EventCoverError(403, "No tienes permiso para editar este evento.");
    if (error.code === "P0002") throw new EventCoverError(404, "No encontramos la portada o su operación.");
    if (error.code === "PT409" || error.code === "40001" || error.code === "23505") throw coverConflict();
    if (error.code === "22023") throw invalid();
    throw coverUnavailable();
  }
  return data;
}

export function coverJson(data: unknown, status = 200, headers: Record<string, string> = {}) {
  return Response.json(data, { status, headers: { "Cache-Control": "private, no-store", ...headers } });
}

export async function handleCoverRequest(action: () => Promise<Response>) {
  try { return await action(); }
  catch (error) { return coverJson({ error: error instanceof EventCoverError ? error.message : "No pudimos completar la operación de portada." }, error instanceof EventCoverError ? error.status : 500); }
}

export { eventCoverConfig };

function presentCoverState(state: PersistedEventCoverState) {
  return { ...state, cover: organizerEventCover(state.cover) };
}

function operationFailure(status: string): never {
  if (status === "rejected") throw new EventCoverError(422, "La imagen no es válida. Elige otro archivo.");
  if (status === "expired") throw new EventCoverError(409, "La subida venció. Selecciona la imagen y vuelve a subirla.");
  throw coverConflict();
}

async function bounded<T>(work: PromiseLike<T>, milliseconds: number): Promise<T> {
  if (milliseconds <= 0) throw coverUnavailable();
  let timer: ReturnType<typeof setTimeout> | undefined;
  try {
    return await Promise.race([Promise.resolve(work), new Promise<never>((_, reject) => { timer = setTimeout(() => reject(coverUnavailable()), milliseconds); })]);
  } finally { clearTimeout(timer); }
}

function storageHeaders() {
  return { Authorization: `Bearer ${process.env.SUPABASE_SERVICE_ROLE_KEY!}`, apikey: process.env.SUPABASE_SERVICE_ROLE_KEY! };
}

async function storageRequest(path: string, init: RequestInit, deadline: number) {
  const timeout = Math.min(eventCoverConfig.storageRequestTimeoutMs, deadline - Date.now());
  if (timeout <= 0) throw coverUnavailable();
  try {
    return await fetch(new URL(`/storage/v1/${path}`, process.env.NEXT_PUBLIC_SUPABASE_URL!), {
      ...init, headers: { ...storageHeaders(), ...init.headers }, cache: "no-store", signal: AbortSignal.timeout(timeout),
    });
  } catch { throw coverUnavailable(); }
}

async function downloadCover(path: string, deadline: number) {
  if (!/^uploads\/[0-9a-f]{64}$/.test(path)) throw coverUnavailable();
  const response = await storageRequest(`object/authenticated/event-cover-uploads/${path}`, { method: "GET" }, deadline);
  if (response.status === 404 || response.status === 400) {
    await response.body?.cancel();
    throw new EventCoverError(409, "No encontramos el archivo de la subida. Selecciona la imagen y vuelve a subirla.");
  }
  if (!response.ok || !response.body) { await response.body?.cancel(); throw coverUnavailable(); }
  const declared = Number(response.headers.get("content-length"));
  if (declared > maxEventCoverBytes) { await response.body.cancel(); throw new EventCoverError(413, "La portada supera el máximo de 5 MiB."); }
  const reader = response.body.getReader(); const chunks: Buffer[] = []; let size = 0;
  try {
    while (true) {
      if (Date.now() >= deadline) throw coverUnavailable();
      const part = await reader.read();
      if (part.done) break;
      size += part.value.byteLength;
      if (size > maxEventCoverBytes) throw new EventCoverError(413, "La portada supera el máximo de 5 MiB.");
      chunks.push(Buffer.from(part.value));
    }
  } catch (error) {
    await reader.cancel().catch(() => {});
    throw error instanceof EventCoverError ? error : coverUnavailable();
  } finally { reader.releaseLock(); }
  return Buffer.concat(chunks, size);
}

export async function getCurrentEventCover(request: Request, eventId: string) {
  const { admin, actorId } = await authorizeEventCover(request, eventId);
  const state = await coverRpc(admin, "get_event_cover_state", { p_event_id: eventId, p_actor_id: actorId });
  return coverJson(presentCoverState(state));
}

export async function prepareEventCover(request: Request, eventId: string) {
  const { admin, actorId } = await authorizeEventCover(request, eventId);
  const body = await coverRequestBody(request, ["expectedRevision", "byteSize"]);
  const expectedRevision = parseCoverRevision(body.expectedRevision);
  if (typeof body.byteSize !== "number" || !Number.isSafeInteger(body.byteSize) || body.byteSize < 1) throw invalid();
  if (body.byteSize > maxEventCoverBytes) throw new EventCoverError(413, "La portada supera el máximo de 5 MiB.");
  const operationId = newEventCoverId(); const path = `uploads/${newEventCoverId()}`;
  await coverRpc(admin, "prepare_event_cover_upload", { p_event_id: eventId, p_actor_id: actorId, p_operation_id: operationId,
    p_expected_revision: expectedRevision, p_staging_path: path, p_config: eventCoverConfig });
  const { data, error } = await bounded(admin.storage.from("event-cover-uploads").createSignedUploadUrl(path, { upsert: false }), eventCoverConfig.storageRequestTimeoutMs);
  if (error || !data) throw coverUnavailable();
  let expiresAt: string;
  try {
    const claims = JSON.parse(Buffer.from(data.token.split(".")[1], "base64url").toString());
    if (!Number.isSafeInteger(claims.exp)) throw new Error("invalid signed expiry");
    expiresAt = new Date(claims.exp * 1000).toISOString();
  } catch { throw coverUnavailable(); }
  await coverRpc(admin, "record_event_cover_upload_expiry", { p_event_id: eventId, p_actor_id: actorId, p_operation_id: operationId,
    p_expires_at: expiresAt, p_config: eventCoverConfig });
  return coverJson({ operationId, expectedRevision, upload: { bucket: "event-cover-uploads", path, token: data.token, expiresAt } }, 201);
}

export async function confirmEventCover(request: Request, eventId: string) {
  const { admin, actorId } = await authorizeEventCover(request, eventId);
  const body = await coverRequestBody(request, ["operationId", "expectedRevision", "altText", "positionX", "positionY"]);
  const operationId = parseCoverOperationId(body.operationId); const expectedRevision = parseCoverRevision(body.expectedRevision);
  const metadata = parseCoverMetadata(body, true); const leaseToken = newEventCoverId();
  const claim: EventCoverClaim = await coverRpc(admin, "claim_event_cover_upload", {
    p_event_id: eventId, p_actor_id: actorId, p_operation_id: operationId, p_expected_revision: expectedRevision,
    p_fingerprint: coverFingerprint(actorId, eventId, "upload", expectedRevision, metadata), p_metadata: metadata,
    p_lease_token: leaseToken, p_candidate_path: `covers/${newEventCoverId()}`, p_config: eventCoverConfig,
  });
  if (claim.status === "committed" && claim.result) return coverJson(presentCoverState(claim.result));
  if (claim.status === "processing" || claim.status === "prepared") return coverJson({ operationId, status: "processing" }, 202, { "Retry-After": "2" });
  if (claim.status !== "claimed") operationFailure(claim.status);
  const deadline = Date.parse(claim.deadlineAt!); let enteredCommit = false;
  try {
    const bytes = await downloadCover(claim.stagingPath!, deadline);
    const validated = await validateEventCover(bytes, deadline);
    await coverRpc(admin, "mark_event_cover_transfer", { p_event_id: eventId, p_actor_id: actorId, p_operation_id: operationId, p_lease_token: leaseToken, p_finished: false }, deadline);
    const response = await storageRequest(`object/event-covers/${claim.candidatePath!}`, {
      method: "POST", headers: { "Content-Type": validated.mediaType, "x-upsert": "false", "Cache-Control": "max-age=31536000" },
      body: new Uint8Array(bytes),
    }, deadline);
    await response.body?.cancel();
    if (!response.ok) throw coverUnavailable();
    if (Date.now() >= deadline) throw coverUnavailable();
    await coverRpc(admin, "mark_event_cover_transfer", { p_event_id: eventId, p_actor_id: actorId, p_operation_id: operationId, p_lease_token: leaseToken, p_finished: true }, deadline);
    enteredCommit = true;
    const result: EventCoverClaim = await bounded(coverRpc(admin, "finish_event_cover_upload", {
      p_event_id: eventId, p_actor_id: actorId, p_operation_id: operationId, p_lease_token: leaseToken, p_validated_metadata: validated,
    }, deadline), deadline - Date.now());
    if (result.status !== "committed" || !result.result) operationFailure(result.status);
    return coverJson(presentCoverState(result.result));
  } catch (error) {
    // A timeout after entering commit is uncertain. Never compensate or delete the candidate.
    if (!enteredCommit) await coverRpc(admin, "fail_event_cover_upload", {
      p_event_id: eventId, p_actor_id: actorId, p_operation_id: operationId, p_lease_token: leaseToken,
      p_state: error instanceof EventCoverError && [413, 422].includes(error.status) ? "rejected" : "pending",
    }).catch(() => {});
    throw error;
  }
}

export async function getEventCoverOperation(request: Request, eventId: string, operationId: string) {
  const { admin, actorId } = await authorizeEventCover(request, eventId);
  parseCoverOperationId(operationId);
  const result = await coverRpc(admin, "get_event_cover_operation", { p_event_id: eventId, p_actor_id: actorId, p_operation_id: operationId });
  if (result.result) result.result = presentCoverState(result.result);
  if (["rejected", "expired", "conflict"].includes(result.status)) {
    try { operationFailure(result.status); } catch (error) { result.error = (error as EventCoverError).message; }
  }
  return coverJson(result);
}

export async function mutateEventCover(request: Request, eventId: string, kind: "metadata" | "remove") {
  const { admin, actorId } = await authorizeEventCover(request, eventId);
  const body = await coverRequestBody(request, kind === "metadata" ? ["operationId", "expectedRevision", "altText", "positionX", "positionY"] : ["operationId", "expectedRevision"]);
  const operationId = parseCoverOperationId(body.operationId); const revision = parseCoverRevision(body.expectedRevision);
  const metadata = kind === "metadata" ? parseCoverMetadata(body) : {};
  if (kind === "metadata" && Object.keys(metadata).length === 0) throw invalid();
  const result: EventCoverClaim = await coverRpc(admin, "mutate_event_cover", { p_event_id: eventId, p_actor_id: actorId, p_operation_id: operationId,
    p_kind: kind, p_expected_revision: revision, p_fingerprint: coverFingerprint(actorId, eventId, kind, revision, metadata), p_metadata: metadata });
  if (result.status !== "committed" || !result.result) operationFailure(result.status);
  return coverJson(presentCoverState(result.result));
}
