import { spawn } from "node:child_process";
import { mkdtemp, mkdir, readFile, readdir, copyFile, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { randomBytes } from "node:crypto";
import { verifyReservationConcurrency } from "./constitutional-concurrency.mjs";

const root = process.cwd();
const workdir = await mkdtemp(path.join(tmpdir(), "door-list-verification-"));
const projectId = `door-list-check-${randomBytes(4).toString("hex")}`;
const migrationDir = path.join(workdir, "supabase/migrations");
await mkdir(migrationDir, { recursive: true });
let config = await readFile("supabase/config.toml", "utf8");
config = config.replace('project_id = "door-list"', `project_id = "${projectId}"`)
  .replaceAll("543", "554").replace(/\[db.seed\]\nenabled = true/, "[db.seed]\nenabled = false")
  // Constitutional fixtures do not include the development Storage assets.
  .replace(/\n\[storage\.buckets\.event-covers\][\s\S]*?(?=\n\[|$)/, "\n");
await writeFile(path.join(workdir, "supabase/config.toml"), config);
const migrations = (await readdir("supabase/migrations")).filter((name) => name.endsWith(".sql")).sort();
for (const name of migrations.filter((name) => name < "20261005000000")) {
  await copyFile(path.join("supabase/migrations", name), path.join(migrationDir, name));
}
const fixture = "20261005090000_constitutional_legacy_fixture.sql";
await copyFile(path.join("tests/db/fixtures/constitutional-project/supabase/migrations", fixture), path.join(migrationDir, fixture));

function run(command, args, { env = process.env, visible = false, input } = {}) {
  return new Promise((resolve, reject) => {
    const child = spawn(command, args, { cwd: root, env, stdio: ["pipe", "pipe", "pipe"] });
    let output = "";
    for (const stream of [child.stdout, child.stderr]) stream.on("data", (chunk) => {
      output += chunk;
      if (visible) process.stdout.write(chunk);
    });
    child.on("error", reject);
    child.on("close", async (code) => {
      if (code === 0) resolve(output);
      else {
        await writeFile(path.join(workdir, "last-command.log"), output, { mode: 0o600 });
        const error = new Error(`${command} failed (${code}). Private log: ${workdir}/last-command.log`);
        error.output = output;
        reject(error);
      }
    });
    child.stdin.end(input);
  });
}
const cli = (args, options) => run("supabase", [...args, "--workdir", workdir], options);
const sql = (statement) => run("docker", ["exec", "-i", `supabase_db_${projectId}`, "psql", "-U", "postgres", "-d", "postgres", "-X", "-At", "-v", "ON_ERROR_STOP=1"], { input: statement });

let started = false;
try {
  console.log(`Starting isolated verification project ${projectId}.`);
  started = true;
  await cli(["start", "--exclude", "realtime,storage-api,imgproxy,postgres-meta,studio,edge-runtime,logflare,vector,supavisor"]);
  // Compare historical identities and issuance dates; new audit metadata is intentionally added.
  const identityQuery = "select jsonb_agg(jsonb_build_object('id',t.id,'code',t.code,'status',t.status,'registrationId',t.registration_id,'issuedAt',t.created_at) order by t.id) from public.tickets t;";
  const registrationQuery = "select jsonb_agg(to_jsonb(r) order by r.id) from public.registrations r;";
  const typeQuery = "select jsonb_agg(to_jsonb(t) order by t.id) from public.ticket_types t;";
  const before = await sql(identityQuery);
  const registrationsBefore = await sql(registrationQuery);
  const typesBefore = await sql(typeQuery);
  for (const name of migrations.filter((name) => name >= "20261005000000")) {
    await copyFile(path.join("supabase/migrations", name), path.join(migrationDir, name));
  }
  console.log("Applying corrections to the legacy fixture.");
  await cli(["migration", "up", "--local"]);
  if (before !== await sql(identityQuery)) throw new Error("Upgrade changed historical ticket identities or issuance.");
  if (registrationsBefore !== await sql(registrationQuery)) throw new Error("Upgrade changed historical Registrations.");
  if (typesBefore !== await sql(typeQuery)) throw new Error("Upgrade changed historical TicketTypes.");
  await mkdir(path.join(workdir, "supabase/tests"));
  await copyFile("supabase/tests/constitutional_corrections.test.sql", path.join(workdir, "supabase/tests/constitutional_corrections.test.sql"));
  console.log("Running database acceptance tests.");
  await cli(["test", "db", "--local"], { visible: true });
  await verifyReservationConcurrency(`supabase_db_${projectId}`, sql);
  const status = await cli(["status", "-o", "env"]);
  const values = Object.fromEntries(status.split("\n").flatMap((line) => {
    const match = line.match(/^([A-Z_]+)="?([^"\n]+)"?$/);
    return match ? [[match[1], match[2]]] : [];
  }));
  if (!/^http:\/\/(127\.0\.0\.1|localhost):55421$/.test(values.API_URL ?? "")) throw new Error("Verification requires the isolated local API.");
  console.log("Running browser and HTTP acceptance tests with simulated email.");
  await run("npm", ["run", "test:e2e", "--", "constitutional-corrections.spec.ts", "registration-to-check-in.spec.ts"], {
    visible: true,
    env: { ...process.env, E2E_SUPABASE_URL: values.API_URL, E2E_SUPABASE_ANON_KEY: values.ANON_KEY, E2E_SUPABASE_SERVICE_ROLE_KEY: values.SERVICE_ROLE_KEY },
  });
  console.log("Isolated upgrade, database and browser verification passed.");
} catch (error) {
  console.error(error.message);
  process.exitCode = 1;
} finally {
  if (started) {
    console.log("Stopping only the isolated verification project.");
    await cli(["stop", "--no-backup"]).catch((error) => { console.error(error.message); process.exitCode = 1; });
  }
}
