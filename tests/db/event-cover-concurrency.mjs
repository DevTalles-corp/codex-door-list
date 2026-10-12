import assert from "node:assert/strict";
import { randomBytes } from "node:crypto";
import { eventCoverConfig } from "../../lib/event-cover-config.mjs";

const id = () => randomBytes(32).toString("hex");
const literal = (value) => `'${String(value).replaceAll("'", "''")}'`;
const config = literal(JSON.stringify(eventCoverConfig));
const owner = "71000000-0000-4000-8000-000000000001";
const validated = literal(JSON.stringify({ mediaType: "image/png", byteSize: 1000, width: 640, height: 360, contentHash: "e".repeat(64) }));

export async function verifyEventCoverConcurrency(environment) {
  assert.equal((await environment.sql("select to_regprocedure('public.mutate_event_cover(uuid,uuid,text,text,bigint,text,jsonb)') is not null;")).trim(), "t", "Maintenance CAS must exist before race verification");
  const event = (await environment.sql(`insert into public.events(created_by,title,venue,event_date,max_capacity,time_zone,registration_closes_at,entry_opens_at,entry_closes_at)
    select created_by,'Cover concurrency',venue,event_date,max_capacity,time_zone,registration_closes_at,entry_opens_at,entry_closes_at from public.events where id='72000000-0000-4000-8000-000000000001' returning id;`)).trim();
  const a = environment.session("cover_winner"); const b = environment.session("cover_contender");
  async function prepare(revision) {
    const operationId = id(), lease = id(), candidate = `covers/${id()}`;
    await environment.sql(`select public.prepare_event_cover_upload('${event}','${owner}','${operationId}',${revision},'uploads/${id()}',${config});
      select public.claim_event_cover_upload('${event}','${owner}','${operationId}',${revision},'${id()}','{"altText":null,"positionX":0.5,"positionY":0.5}','${lease}','${candidate}',${config});`);
    return { operationId, lease, candidate };
  }
  const finish = (operation) => `select public.finish_event_cover_upload('${event}','${owner}','${operation.operationId}','${operation.lease}',${validated});`;
  const mutate = (revision, kind, metadata = {}) => `select public.mutate_event_cover('${event}','${owner}','${id()}','${kind}',${revision},'${id()}',${literal(JSON.stringify(metadata))});`;
  async function race(first, second, expectedRevision) {
    await a.query("begin;");
    const winner = JSON.parse(await a.query(first)); assert.equal(winner.status, "committed");
    const pending = b.query(second); await environment.waitForLock("cover_contender");
    await a.query("commit;");
    const loser = JSON.parse(await pending); assert.equal(loser.status, "conflict");
    assert.equal((await environment.sql(`select revision::text from public.event_covers where event_id='${event}';`)).trim(), String(expectedRevision));
    return winner;
  }
  try {
    const left = await prepare(0), right = await prepare(0);
    const winner = await race(finish(left), finish(right), 1);
    const replay = JSON.parse(await environment.sql(finish(left)));
    assert.deepEqual(replay, winner, "Double finalization preserves immutable original result");
    const replacement = await prepare(1);
    await race(finish(replacement), mutate(1, "remove"), 2);
    const replacement2 = await prepare(2);
    await race(mutate(2, "metadata", { positionX: 0.1 }), finish(replacement2), 3);
    const stale = await prepare(3);
    const oldDue = (await environment.sql(`select due_at::text from public.event_cover_cleanup_jobs where object_path='${stale.candidate}';`)).trim();
    await environment.sql(`update public.event_cover_operations set lease_until=clock_timestamp()-interval '1 microsecond' where operation_id='${stale.operationId}';`);
    const newLease = id(), newCandidate = `covers/${id()}`;
    // Use the already-frozen fingerprint, not a new request.
    const fingerprint = (await environment.sql(`select request_fingerprint from public.event_cover_operations where operation_id='${stale.operationId}';`)).trim();
    await environment.sql(`select public.claim_event_cover_upload('${event}','${owner}','${stale.operationId}',3,'${fingerprint}','{"altText":null,"positionX":0.5,"positionY":0.5}','${newLease}','${newCandidate}',${config});`);
    await assert.rejects(environment.sql(finish(stale)), (error) => /PT409:.*cover_lease_lost/.test(error.output ?? ""));
    assert.equal((await environment.sql(`select due_at::text from public.event_cover_cleanup_jobs where object_path='${stale.candidate}';`)).trim(), oldDue, "Old candidate keeps original safe transfer deadline");
    assert.equal(JSON.parse(await environment.sql(finish({ ...stale, lease: newLease }))).result.revision, "4");
    const timed = await prepare(4);
    await environment.sql(`update public.event_cover_operations set processing_deadline_at=clock_timestamp()-interval '1 microsecond' where operation_id='${timed.operationId}';`);
    await assert.rejects(environment.sql(finish(timed)), (error) => /PT409:.*cover_lease_lost/.test(error.output ?? ""));
    assert.equal((await environment.sql(`select revision::text from public.event_covers where event_id='${event}';`)).trim(), "4");
    console.log("Cover concurrency: independent-session CAS, observable lock barriers, immutable replay and stale/deadline fencing passed.");
  } finally {
    await a.query("rollback;").catch(() => {}); a.close(); b.close();
    await environment.sql(`delete from public.events where id='${event}';`);
  }
}
