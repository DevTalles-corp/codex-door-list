import assert from "node:assert/strict";
import { createEventCoverEnvironment } from "./local-event-cover-environment.mjs";
import { verifyEventCoverConcurrency } from "./event-cover-concurrency.mjs";
import { verifyEventCoverCleanup } from "./event-cover-cleanup.mjs";
import { generateCoverFixtures } from "../e2e/generate-cover-fixtures.mjs";

const environment = await createEventCoverEnvironment();
const setupOnly = process.argv.includes("--setup-only");
const dbOnly = process.argv.includes("--db-only");
const redStory = process.argv.includes("--red-story");
const redConcurrency = process.argv.includes("--red-concurrency");
const snapshot = `select jsonb_build_object(
  'events', (select jsonb_agg(to_jsonb(e) order by id) from public.events e),
  'ticketTypes', (select jsonb_agg(to_jsonb(t) order by id) from public.ticket_types t),
  'registrations', (select jsonb_agg(to_jsonb(r) order by id) from public.registrations r),
  'tickets', (select jsonb_agg(to_jsonb(t) order by id) from public.tickets t));`;
try {
  await environment.start();
  const env = await environment.browserEnv();
    env.E2E_COVER_FAULT_PROXY = "1";
    if (process.argv.includes("--no-screenshots")) env.E2E_COVER_SKIP_CAPTURES = "1";
  assert.match(env.E2E_SUPABASE_URL, /^http:\/\/(127\.0\.0\.1|localhost):55621$/);
  if (setupOnly) {
    console.log("Isolated cover environment ready with Storage enabled and historical fixture.");
  } else {
    const before = await environment.sql(snapshot);
    await environment.apply();
    assert.equal(await environment.sql(snapshot), before, "Cover upgrade preserves all business rows");
    assert.equal((await environment.sql("select revision::text from public.event_covers where event_id='72000000-0000-4000-8000-000000000001' and object_path is null;")).trim(), "0");
    if (redConcurrency) await verifyEventCoverConcurrency(environment);
    else {
      if (!redStory) await environment.testDb();
      if (!redStory) {
        await verifyEventCoverConcurrency(environment);
        await generateCoverFixtures();
        await verifyEventCoverCleanup(environment, env);
      }
      if (!dbOnly) await environment.run("npm", ["run", "test:e2e", "--", "event-cover-api.spec.ts", "event-covers.spec.ts", "event-cover-layout.spec.ts", "registration-to-check-in.spec.ts", "capacity-limits.spec.ts", "constitutional-corrections.spec.ts", ...process.argv.slice(2).filter((arg) => !arg.startsWith("--red-story") && arg !== "--no-screenshots")], { visible: true, env });
    }
  }
} catch (error) { console.error(error.message); process.exitCode = 1; }
finally { await environment.stop().catch((error) => { console.error(error.message); process.exitCode = 1; }); }
