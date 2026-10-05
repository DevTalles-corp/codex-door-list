import { spawn } from "node:child_process";
import assert from "node:assert/strict";

export async function verifyReservationConcurrency(container, sql) {
  const eventId = "10000000-0000-4000-8000-000000000020";
  const typeId = "20000000-0000-4000-8000-000000000020";
  await sql(`insert into public.events(id,created_by,title,event_date,venue,max_capacity,time_zone,registration_closes_at,entry_opens_at,entry_closes_at)
    values('${eventId}','00000000-0000-4000-8000-000000000001','Concurrency',now(),'Test',1,'UTC',now()+interval '1 hour',now()-interval '1 hour',now()+interval '1 hour');
    insert into public.ticket_types(id,event_id,name,max_capacity) values('${typeId}','${eventId}','General',1);
    update public.events set status='published' where id='${eventId}';`);
  function session(name) {
    const child = spawn("docker", ["exec", "-i", container, "psql", "-U", "postgres", "-d", "postgres", "-X", "-At", "-v", "ON_ERROR_STOP=1"], { env: process.env });
    let pending, buffer = "", stderr = "", serial = 0;
    child.stderr.on("data", (data) => { stderr += data; });
    child.stdout.on("data", (data) => {
      buffer += data;
      if (pending && buffer.includes(pending.marker)) {
        const result = buffer.slice(0, buffer.indexOf(pending.marker)).trim();
        buffer = buffer.slice(buffer.indexOf(pending.marker) + pending.marker.length).trimStart();
        clearTimeout(pending.timeout); pending.resolve(result); pending = null;
      }
    });
    child.on("close", (code) => {
      if (pending) { clearTimeout(pending.timeout); pending.reject(new Error(`SQL session ${name} exited (${code}): ${stderr}`)); pending = null; }
    });
    return {
      query(statement) {
        if (pending) throw new Error("SQL session already has an in-flight statement");
        return new Promise((resolve, reject) => {
          const marker = `__complete_${name}_${++serial}__`;
          pending = { resolve, reject, marker, timeout: setTimeout(() => { child.kill(); reject(new Error(`SQL session ${name} timed out`)); }, 15000) };
          child.stdin.write(`${statement}\n\\echo ${marker}\n`);
        });
      },
      close() { child.stdin.end("rollback;\n\\q\n"); },
    };
  }
  async function waitForLock(name) {
    const deadline = Date.now() + 10000;
    while (Date.now() < deadline) {
      const result = await sql(`select count(*) from pg_stat_activity where application_name='${name}' and wait_event_type='Lock';`);
      if (result.trim() === "1") return;
      await new Promise((resolve) => setTimeout(resolve, 100));
    }
    throw new Error(`No observed lock wait for ${name}`);
  }
  const a = session("reservation_a"), b = session("reservation_b");
  try {
    await a.query("set application_name='reservation_a';");
    await b.query("set application_name='reservation_b';");
    await a.query("begin;");
    assert.equal(await a.query(`select status from public.reserve_for_event('${eventId}','${typeId}','A','race-a@example.test',repeat('a',64));`), "pending");
    const second = b.query(`select status from public.reserve_for_event('${eventId}','${typeId}','B','race-b@example.test',repeat('b',64));`);
    await waitForLock("reservation_b");
    await a.query("commit;");
    assert.equal(await second, "ticket_unavailable");
    assert.equal((await sql(`select public.capacity_consumption('${eventId}');`)).trim(), "1");
    console.log("Concurrent last-seat reservations: one pending, one unavailable; consumption 1/1.");

    await a.query("begin;");
    assert.equal(await a.query("select status from public.confirm_reservation(repeat('a',64));"), "success");
    const duplicate = b.query("select status from public.confirm_reservation(repeat('a',64));");
    await waitForLock("reservation_b");
    await a.query("commit;");
    assert.equal(await duplicate, "invalid_token");
    assert.equal((await sql(`select count(*) from public.tickets t join public.registrations r on r.id=t.registration_id where r.event_id='${eventId}';`)).trim(), "1");
    console.log("Concurrent confirmation: one success, one consumed token; exactly one Ticket.");
    await sql(`update public.events set entry_closes_at=clock_timestamp()+interval '1 second' where id='${eventId}';`);
    await a.query("begin;");
    await a.query(`select t.id from public.tickets t join public.registrations r on r.id=t.registration_id where r.event_id='${eventId}' for update of t;`);
    await b.query("set request.jwt.claim.sub='00000000-0000-4000-8000-000000000001';");
    const lateEntry = b.query(`select status from public.check_in_ticket('${eventId}',(select t.code from public.tickets t join public.registrations r on r.id=t.registration_id where r.event_id='${eventId}'));`);
    await waitForLock("reservation_b");
    const closingDeadline = Date.now() + 5000;
    while ((await sql(`select clock_timestamp() >= entry_closes_at from public.events where id='${eventId}';`)).trim() !== "t") {
      if (Date.now() > closingDeadline) throw new Error("Entry window did not close");
      await new Promise((resolve) => setTimeout(resolve, 50));
    }
    await a.query("commit;");
    assert.equal(await lateEntry, "not_found");
    console.log("Check-in waiting on a Ticket lock rejects entry after the explicit closing.");
  } finally { a.close(); b.close(); }
  for (const isolation of ["repeatable read", "serializable"]) {
    const isUnsupportedIsolation = (error) => /0A000:.*READ COMMITTED required/.test(error.output ?? "");
    await assert.rejects(sql(`\\set VERBOSITY verbose\nbegin isolation level ${isolation}; select * from public.reserve_for_event('${eventId}','${typeId}','Unsupported','isolation@example.test',repeat('e',64));`), isUnsupportedIsolation);
    await assert.rejects(sql(`\\set VERBOSITY verbose\nbegin isolation level ${isolation}; select * from public.confirm_reservation(repeat('e',64));`), isUnsupportedIsolation);
  }
  console.log("Reservation and confirmation reject unsupported transaction isolation.");
}
