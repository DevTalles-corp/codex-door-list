import { spawn } from "node:child_process";
import { mkdtemp, mkdir, readFile, readdir, copyFile, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { randomBytes } from "node:crypto";

export async function createEventCoverEnvironment() {
  const workdir = await mkdtemp(path.join(tmpdir(), "door-list-event-covers-"));
  const projectId = `door-list-event-covers-${randomBytes(4).toString("hex")}`;
  const container = `supabase_db_${projectId}`;
  const migrationDir = path.join(workdir, "supabase/migrations");
  await mkdir(migrationDir, { recursive: true });
  const config = (await readFile("supabase/config.toml", "utf8"))
    .replace('project_id = "door-list"', `project_id = "${projectId}"`)
    .replace(/\b543(\d{2})\b/g, "556$1").replace(/\[db.seed\]\nenabled = true/, "[db.seed]\nenabled = false")
    // Upgrade tests provision their own buckets and do not copy demo assets.
    .replace(/\n\[storage\.buckets\.event-covers\][\s\S]*?(?=\n\[|$)/, "\n");
  await writeFile(path.join(workdir, "supabase/config.toml"), config);
  const files = (await readdir("supabase/migrations")).filter((file) => file.endsWith(".sql")).sort();
  for (const file of files.filter((file) => file < "20261008120000"))
    await copyFile(path.join("supabase/migrations", file), path.join(migrationDir, file));
  await copyFile("tests/db/fixtures/event-covers/20261008110000_event_cover_upgrade_fixture.sql", path.join(migrationDir, "20261008110000_event_cover_upgrade_fixture.sql"));
  async function run(command, args, { input, visible = false, env = process.env } = {}) {
    return new Promise((resolve, reject) => {
      const commandEnv = { ...env }; delete commandEnv.NO_COLOR;
      const child = spawn(command, args, { env: commandEnv, stdio: ["pipe", "pipe", "pipe"] });
      let output = "";
      const timeout = setTimeout(() => { child.kill(); reject(new Error(`${command} timed out`)); }, 300_000);
      for (const stream of [child.stdout, child.stderr]) stream.on("data", (chunk) => {
        const safe = chunk.toString().replace(/Bearer\s+\S+/gi, "Bearer [redacted]").replace(/([?&]token=)[^&\s]+/gi, "$1[redacted]");
        output += safe; if (visible) process.stdout.write(safe);
      });
      child.on("error", (error) => { clearTimeout(timeout); reject(error); });
      child.on("close", async (code) => {
        clearTimeout(timeout);
        if (code === 0) resolve(output);
        else {
          await writeFile(path.join(workdir, "last-command.log"), output, { mode: 0o600 });
          const error = new Error(`${command} failed (${code}). Private log: ${workdir}/last-command.log`);
          error.output = output; reject(error);
        }
      });
      child.stdin.end(input);
    });
  }
  const cli = (args, options) => run("supabase", [...args, "--workdir", workdir], options);
  const sql = (statement) => run("docker", ["exec", "-i", container, "psql", "-U", "postgres", "-d", "postgres", "-X", "-qAt", "-v", "ON_ERROR_STOP=1"], { input: `\\set VERBOSITY verbose\n${statement}` });
  let started = false;
  return {
    workdir, container, run, sql,
    async start() { started = true; console.log(`Starting isolated event cover project ${projectId}.`); await cli(["start", "--exclude", "realtime,postgres-meta,studio,edge-runtime,logflare,vector,supavisor"]); },
    async apply() {
      for (const file of files.filter((file) => file >= "20261008120000")) await copyFile(path.join("supabase/migrations", file), path.join(migrationDir, file));
      await cli(["migration", "up", "--local"]);
    },
    async testDb() {
      await mkdir(path.join(workdir, "supabase/tests"), { recursive: true });
      for (const file of (await readdir("supabase/tests")).filter((file) => file === "event_covers.test.sql")) await copyFile(path.join("supabase/tests", file), path.join(workdir, "supabase/tests", file));
      await cli(["test", "db", "--local"], { visible: true });
    },
    async browserEnv() {
      const status = await cli(["status", "-o", "env"]);
      const values = Object.fromEntries(status.split("\n").flatMap((line) => { const match = line.match(/^([A-Z_]+)="?([^"\n]+)"?$/); return match ? [[match[1], match[2]]] : []; }));
      if (!/^http:\/\/(127\.0\.0\.1|localhost):55621$/.test(values.API_URL ?? "")) throw new Error("Only the isolated local API is allowed");
      return { ...process.env, E2E_SUPABASE_URL: values.API_URL, E2E_SUPABASE_ANON_KEY: values.ANON_KEY, E2E_SUPABASE_SERVICE_ROLE_KEY: values.SERVICE_ROLE_KEY };
    },
    session(name) { return createSqlSession(container, name); },
    async waitForLock(name) {
      const deadline = Date.now() + 10_000;
      while (Date.now() < deadline) {
        if ((await sql(`select count(*) from pg_stat_activity where application_name='${name}' and wait_event_type='Lock';`)).trim() === "1") return;
        await new Promise((resolve) => setTimeout(resolve, 50));
      }
      throw new Error(`No observed lock wait for ${name}`);
    },
    async stop() { if (started) { console.log("Stopping only the isolated event cover project."); await cli(["stop", "--no-backup"]); } },
  };
}

function createSqlSession(container, name) {
  if (!/^[a-z0-9_]+$/.test(name)) throw new Error("Invalid session name");
  const child = spawn("docker", ["exec", "-i", container, "psql", "-U", "postgres", "-d", "postgres", "-X", "-qAt", "-v", "ON_ERROR_STOP=1"]);
  let pending, buffer = "", stderr = "", serial = 0;
  child.stderr.on("data", (chunk) => { stderr += chunk; });
  child.stdout.on("data", (chunk) => {
    buffer += chunk;
    if (pending && buffer.includes(pending.marker)) {
      const output = buffer.slice(0, buffer.indexOf(pending.marker)).trim();
      buffer = buffer.slice(buffer.indexOf(pending.marker) + pending.marker.length).trimStart();
      clearTimeout(pending.timeout); pending.resolve(output); pending = null;
    }
  });
  child.on("error", (error) => { if (pending) { clearTimeout(pending.timeout); pending.reject(error); pending = null; } });
  child.on("close", (code) => {
    if (pending) { clearTimeout(pending.timeout); const error = new Error(`SQL session ${name} exited (${code})`); error.output = stderr; pending.reject(error); pending = null; }
  });
  return {
    query(statement) {
      if (pending) throw new Error("Statement already in flight");
      return new Promise((resolve, reject) => {
        const marker = `__${name}_${++serial}__`;
        pending = { marker, resolve, reject, timeout: setTimeout(() => { child.kill(); reject(new Error(`SQL session ${name} timeout`)); }, 15_000) };
        child.stdin.write(`\\set VERBOSITY verbose\nset application_name='${name}';\n${statement}\n\\echo ${marker}\n`);
      });
    },
    close() { if (!child.killed && child.exitCode === null) child.stdin.end("rollback;\n\\q\n"); },
  };
}
