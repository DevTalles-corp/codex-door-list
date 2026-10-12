import assert from "node:assert/strict";
import { randomBytes } from "node:crypto";
import { readFile } from "node:fs/promises";
import { createClient } from "@supabase/supabase-js";
import { cleanupEventCovers } from "../../lib/event-cover-cleanup.mjs";
import { eventCoverConfig } from "../../lib/event-cover-config.mjs";

export async function verifyEventCoverCleanup(environment, env) {
  const url = env.E2E_SUPABASE_URL, key = env.E2E_SUPABASE_SERVICE_ROLE_KEY;
  assert.match(url, /^http:\/\/(127\.0\.0\.1|localhost):55621$/);
  const admin = createClient(url, key, { auth: { persistSession: false } });
  const bytes = await readFile("tests/e2e/fixtures/event-covers/minimum.png");
  const objectPath = `covers/${randomBytes(32).toString("hex")}`;
  await environment.sql(`select public.enqueue_event_cover_cleanup(null,'event-covers','${objectPath}',clock_timestamp()-interval '1 microsecond');
    update public.event_cover_cleanup_jobs set transfer_uncertain=true where object_path='${objectPath}';`);
  const uncertain = await cleanupEventCovers({ url, key });
  assert.equal(uncertain.deferred, 1, "An absent object after transfer timeout is still uncertain");
  assert.equal((await environment.sql(`select state||':'||transfer_uncertain from public.event_cover_cleanup_jobs where object_path='${objectPath}';`)).trim(), "pending:true");
  assert.equal((await admin.storage.from("event-covers").upload(objectPath, bytes, { contentType: "image/png", upsert: false })).error, null);
  await environment.sql(`update public.event_cover_cleanup_jobs set next_attempt_at=clock_timestamp()-interval '1 microsecond' where object_path='${objectPath}';`);
  const originalFetch = globalThis.fetch;
  globalThis.fetch = (input, init) => {
    if (String(input).includes("/storage/v1/object/event-covers") && init?.method === "DELETE")
      return Promise.resolve(new Response('{"error":"temporary"}', { status: 503, headers: { "Content-Type": "application/json" } }));
    return originalFetch(input, init);
  };
  try {
    const failed = await cleanupEventCovers({ url, key }); assert.ok(failed.failed >= 1);
    assert.equal((await environment.sql(`select state||':'||transfer_uncertain from public.event_cover_cleanup_jobs where object_path='${objectPath}';`)).trim(), "pending:true", "Temporary removal error does not erase transfer uncertainty");
    assert.equal((await environment.sql(`select next_attempt_at>clock_timestamp() from public.event_cover_cleanup_jobs where object_path='${objectPath}';`)).trim(), "t", "Retry is deferred with backoff");
  } finally { globalThis.fetch = originalFetch; }
  await environment.sql(`update public.event_cover_cleanup_jobs set next_attempt_at=clock_timestamp()-interval '1 microsecond' where object_path='${objectPath}';`);
  const recovered = await cleanupEventCovers({ url, key }); assert.ok(recovered.deleted >= 1);
  assert.equal((await environment.sql(`select state||':'||transfer_uncertain from public.event_cover_cleanup_jobs where object_path='${objectPath}';`)).trim(), "done:false");
  const fencedPath = `covers/${randomBytes(32).toString("hex")}`, oldToken = randomBytes(32).toString("hex"), newToken = randomBytes(32).toString("hex");
  const config = JSON.stringify(eventCoverConfig);
  await environment.sql(`select public.enqueue_event_cover_cleanup(null,'event-covers','${fencedPath}',clock_timestamp()-interval '1 microsecond');`);
  const oldClaim = JSON.parse(await environment.sql(`select public.claim_event_cover_cleanup('${oldToken}','${config}');`));
  assert.equal(oldClaim.objectPath, fencedPath);
  await environment.sql(`update public.event_cover_cleanup_jobs set lease_until=clock_timestamp()-interval '1 microsecond' where id=${oldClaim.id};`);
  const newClaim = JSON.parse(await environment.sql(`select public.claim_event_cover_cleanup('${newToken}','${config}');`));
  assert.equal(newClaim.id, oldClaim.id);
  assert.equal((await environment.sql(`select public.complete_event_cover_cleanup(${oldClaim.id},'${oldToken}',null);`)).trim(), "f", "Old worker cannot complete a reclaimed job");
  assert.equal((await environment.sql(`select public.complete_event_cover_cleanup(${newClaim.id},'${newToken}',null);`)).trim(), "t");
  const actor = await admin.auth.admin.createUser({ email: `cover-retention-${randomBytes(8).toString("hex")}@example.test`, password: randomBytes(24).toString("hex"), email_confirm: true });
  assert.equal(actor.error, null); const actorId = actor.data.user.id;
  const actorEvent = (await environment.sql(`insert into public.events(created_by,title,venue,event_date,max_capacity,time_zone,registration_closes_at,entry_opens_at,entry_closes_at)
    select '${actorId}','Actor retirement cover',venue,event_date,max_capacity,time_zone,registration_closes_at,entry_opens_at,entry_closes_at from public.events where id='72000000-0000-4000-8000-000000000001' returning id;`)).trim();
  const actorPath = `covers/${randomBytes(32).toString("hex")}`, actorOperation = randomBytes(32).toString("hex");
  await environment.sql(`update public.event_covers set object_path='${actorPath}',media_type='image/png',byte_size=1000,width=640,height=360,content_hash=repeat('a',64) where event_id='${actorEvent}';
    select public.mutate_event_cover('${actorEvent}','${actorId}','${actorOperation}','metadata',0,repeat('b',64),'{"positionY":0.25}');`);
  const deletion = await admin.auth.admin.deleteUser(actorId);
  if (deletion.error) {
    const log = await environment.run("docker", ["logs", "--tail", "80", environment.container]);
    console.error(log.split("\n").filter((line) => /ERROR:|CONTEXT:/.test(line)).join("\n"));
  }
  assert.equal(deletion.error, null);
  assert.equal((await environment.sql(`select event_id is null and actor_id is null and state='committed' and result_snapshot is not null from public.event_cover_operations where operation_id='${actorOperation}';`)).trim(), "t", "Actor deletion preserves committed result tombstone");
  assert.equal((await environment.sql(`select count(*)>0 from public.event_cover_cleanup_jobs where object_path='${actorPath}';`)).trim(), "t", "Actor deletion preserves cleanup jobs");
  // Event/actor deletion cannot erase cleanup or the durable operation tombstone.
  assert.equal((await environment.sql("select count(*)>0 from public.event_cover_operations where event_id is null;")).trim(), "t");
  await environment.sql("update public.event_cover_operations set updated_at=clock_timestamp()-interval '25 hours' where event_id is null;");
  await cleanupEventCovers({ url, key });
  assert.equal((await environment.sql("select count(*)>0 from public.event_cover_operations where event_id is null and updated_at<clock_timestamp()-interval '24 hours';")).trim(), "t", "Results/paths retained beyond 24h while late transfers remain possible");
  console.log("Cover cleanup: transfer uncertainty, actual late publication, removal failure/backoff/retry, deletion tombstones and retention passed.");
}
