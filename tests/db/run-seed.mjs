import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { createHash, randomBytes } from "node:crypto";
import { cp, mkdir, mkdtemp, readFile, readdir, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { createClient } from "@supabase/supabase-js";
import sharp from "sharp";

const workdir = await mkdtemp(path.join(tmpdir(), "door-list-seed-"));
const projectId = `door-list-seed-${randomBytes(4).toString("hex")}`;
const container = `supabase_db_${projectId}`;
await mkdir(path.join(workdir, "supabase"));
const config = (await readFile("supabase/config.toml", "utf8"))
  .replace('project_id = "door-list"', `project_id = "${projectId}"`)
  .replace(/\b543(\d{2})\b/g, "557$1");
await writeFile(path.join(workdir, "supabase/config.toml"), config);
for (const entry of ["migrations", "seed.sql", "seed-assets"])
  await cp(path.join("supabase", entry), path.join(workdir, "supabase", entry), { recursive: true });

async function run(command, args, input) {
  return new Promise((resolve, reject) => {
    const child = spawn(command, args, { stdio: ["pipe", "pipe", "pipe"] });
    let output = "";
    const timeout = setTimeout(() => { child.kill(); reject(new Error(`${command} timed out`)); }, 300_000);
    for (const stream of [child.stdout, child.stderr]) stream.on("data", (chunk) => { output += chunk; });
    child.on("error", (error) => { clearTimeout(timeout); reject(error); });
    child.on("close", (code) => {
      clearTimeout(timeout);
      if (code === 0) resolve(output);
      else reject(new Error(`${command} failed (${code}): ${output}`));
    });
    child.stdin.end(input);
  });
}
const cli = (args) => run("supabase", [...args, "--workdir", workdir]);
const sql = (input) => run("docker", ["exec", "-i", container, "psql", "-U", "postgres", "-d", "postgres", "-X", "-qAt", "-v", "ON_ERROR_STOP=1"], input);
const snapshot = `select jsonb_build_object(
  'owners', (select jsonb_agg(to_jsonb(u) order by id) from auth.users u),
  'events', (select jsonb_agg(to_jsonb(e) order by id) from public.events e),
  'ticketTypes', (select jsonb_agg(to_jsonb(t) order by id) from public.ticket_types t),
  'registrations', (select jsonb_agg(to_jsonb(r) order by id) from public.registrations r),
  'tickets', (select jsonb_agg(to_jsonb(t) order by id) from public.tickets t),
  'covers', (select jsonb_agg(to_jsonb(c) order by event_id) from public.event_covers c));`;

try {
  console.log(`Starting disposable seed project ${projectId} on ports 557xx.`);
  await cli(["start", "--exclude", "realtime,postgres-meta,studio,edge-runtime,logflare,vector,supavisor"]);
  console.log("Resetting the disposable database and uploading covers.");
  await cli(["db", "reset", "--local"]);
  await cli(["seed", "buckets", "--local"]);

  const before = await sql(snapshot);
  const seed = await readFile("supabase/seed.sql", "utf8");
  await sql(seed);
  await sql(seed);
  assert.equal(await sql(snapshot), before, "Repeated seed preserves all rows, codes, dates and cover revisions");
  await cli(["seed", "buckets", "--local"]);

  const { owners, events, ticketTypes, registrations, tickets, covers } = JSON.parse(before.trim());
  assert.equal(owners.length, 1);
  assert.equal(events.length, 7);
  assert.equal(ticketTypes.length, 14);
  assert.equal(registrations.length, 15);
  assert.equal(tickets.length, 15);
  assert.equal(covers.length, 7);
  assert.ok(events.every((event) => event.status === "published" && event.published_at));
  assert.equal((await sql(`select count(*) from public.events where event_date <= now() or registration_closes_at <= now();`)).trim(), "0");
  assert.ok(Number((await sql(`select count(*) from public.events where date_trunc('week', event_date at time zone 'America/La_Paz') = date_trunc('week', now() at time zone 'America/La_Paz');`)).trim()) >= 2);
  assert.equal((await sql(`select count(*) from public.events where event_date at time zone 'America/La_Paz' >= date_trunc('month', now() at time zone 'America/La_Paz') + interval '1 month';`)).trim(), "2");

  const status = await cli(["status", "-o", "env"]);
  const values = Object.fromEntries(status.split("\n").flatMap((line) => {
    const match = line.match(/^([A-Z_]+)="?([^"\n]+)"?$/);
    return match ? [[match[1], match[2]]] : [];
  }));
  assert.equal(values.API_URL, "http://127.0.0.1:55721");
  const client = createClient(values.API_URL, values.ANON_KEY, { auth: { persistSession: false } });
  const list = await client.rpc("get_public_event_list");
  assert.ifError(list.error);
  assert.equal(list.data.length, 7, "All seven events are anonymously visible");
  assert.ok(list.data.every((event) => event.cover));
  const soldOut = list.data.find((event) => event.title === "Sesión acústica íntima");
  assert.ok(soldOut, "The sold-out event remains publicly visible");
  assert.equal(soldOut.max_capacity, 5);
  assert.equal(soldOut.remaining_capacity, 0, "The entire event has no available capacity");
  assert.ok(list.data.filter((event) => event.id !== soldOut.id).every((event) => event.remaining_capacity > 0));
  const soldOutRegistration = await client.rpc("get_public_event_registration", { p_code: soldOut.public_code });
  assert.ifError(soldOutRegistration.error);
  assert.equal(soldOutRegistration.data.ticket_types.length, 2);
  assert.ok(soldOutRegistration.data.ticket_types.every((type) => type.remaining_capacity === 0));
  const jazz = list.data.find((event) => event.title === "Jazz en la ciudad");
  const registration = await client.rpc("get_public_event_registration", { p_code: jazz.public_code });
  assert.ifError(registration.error);
  assert.equal(registration.data.ticket_types.find((type) => type.name === "Primera fila").remaining_capacity, 0);
  assert.equal(registration.data.ticket_types.find((type) => type.name === "General").remaining_capacity, 59);

  const files = await readdir("supabase/seed-assets/event-covers/covers");
  assert.equal(files.length, 7);
  for (const cover of covers) {
    const response = await fetch(`${values.API_URL}/storage/v1/object/public/event-covers/${cover.object_path}`);
    assert.ok(response.ok, `Cover download failed: ${cover.object_path}`);
    assert.match(response.headers.get("content-type"), /^image\/png/);
    const data = Buffer.from(await response.arrayBuffer());
    assert.equal(data.length, cover.byte_size);
    assert.equal(createHash("sha256").update(data).digest("hex"), cover.content_hash);
    assert.deepEqual(data, await readFile(path.join("supabase/seed-assets/event-covers", cover.object_path)));
    const metadata = await sharp(data).metadata();
    assert.equal(metadata.width, cover.width);
    assert.equal(metadata.height, cover.height);
  }
  await sql(`
    insert into auth.users (id, email) values ('d0090000-0000-4000-8000-000000000001', 'unrelated@example.test');
    update public.events set status='draft' where title='Jazz en la ciudad';
    update public.events set title='Título editado por el organizador' where title='Taller de cocina boliviana';
    update public.event_covers set revision=revision+1,object_path=null,media_type=null,byte_size=null,
      width=null,height=null,content_hash=null,alt_text=null,position_x=0.5,position_y=0.5
      where event_id='d0020000-0000-4000-8000-000000000001';
  `);
  const edited = await sql(snapshot);
  await sql(seed);
  assert.equal(await sql(snapshot), edited, "Reapplication preserves organizer edits, cover removals and unrelated data");
  console.log("Passed: local reset, SQL/Storage idempotence, public events, dates, sold-out event/type, tickets and all seven PNG covers.");
} catch (error) {
  console.error(error.message);
  process.exitCode = 1;
} finally {
  await cli(["stop", "--no-backup"]).catch((error) => { console.error(error.message); process.exitCode = 1; });
}
