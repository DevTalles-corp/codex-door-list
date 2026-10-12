import assert from "node:assert/strict";
import { test } from "node:test";
import { createClient } from "@supabase/supabase-js";
import { verifyE2ESchema } from "../e2e/schema-preflight.mjs";

function database(respond) {
  const requests = [];
  const client = createClient("http://127.0.0.1:54321", "private-test-key", {
    auth: { persistSession: false, autoRefreshToken: false },
    global: {
      fetch: async (input, init) => {
        const url = new URL(String(input));
        requests.push({ url, method: init.method });
        return respond(url);
      },
    },
  });
  return { client, requests };
}

test("schema check succeeds on an empty database and only makes zero-row GET requests", async () => {
  const { client, requests } = database(() => Response.json([]));
  await verifyE2ESchema(client);
  assert.ok(requests.some(({ url }) => url.pathname.endsWith("/events") && url.searchParams.get("select").includes("entry_closes_at")));
  assert.ok(requests.some(({ url }) => url.pathname.endsWith("/event_covers")));
  for (const { url, method } of requests) {
    assert.equal(method, "GET");
    assert.equal(url.searchParams.get("limit"), "0");
  }
});

test("missing calendar columns and cover tables produce one actionable error without credentials", async () => {
  const { client } = database((url) => {
    if (url.pathname.endsWith("/events")) {
      return Response.json({ code: "42703", message: "column events.time_zone does not exist private-test-key" }, { status: 400 });
    }
    if (url.pathname.endsWith("/event_covers")) {
      return Response.json({ code: "PGRST205", message: "missing table" }, { status: 404 });
    }
    return Response.json([]);
  });
  await assert.rejects(verifyE2ESchema(client), (error) => {
    assert.match(error.message, /events: 42703/);
    assert.match(error.message, /event_covers: PGRST205/);
    assert.match(error.message, /supabase migration up --local/);
    assert.match(error.message, /No tests were started/);
    assert.doesNotMatch(error.message, /private-test-key/);
    return true;
  });
});

test("invalid credentials stop the preflight with a credentials diagnostic", async () => {
  const { client } = database(() => Response.json({ message: "Invalid API key" }, { status: 401 }));
  await assert.rejects(verifyE2ESchema(client), /Check the E2E_SUPABASE_\* credentials/);
});
