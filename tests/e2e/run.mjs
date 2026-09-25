import { execFileSync, spawnSync } from "node:child_process";

function localSupabaseEnvironment() {
  const output = execFileSync("supabase", ["status", "-o", "env"], {
    encoding: "utf8",
    stdio: ["ignore", "pipe", "pipe"],
  });
  const values = Object.fromEntries(
    output.split("\n").flatMap((line) => {
      const match = line.match(/^([A-Z_]+)="?([^"\n]+)"?$/);
      return match ? [[match[1], match[2]]] : [];
    }),
  );
  return {
    E2E_SUPABASE_URL: values.API_URL,
    E2E_SUPABASE_ANON_KEY: values.ANON_KEY,
    E2E_SUPABASE_SERVICE_ROLE_KEY: values.SERVICE_ROLE_KEY,
  };
}

let environment = { ...process.env };
if (!environment.E2E_SUPABASE_URL || !environment.E2E_SUPABASE_ANON_KEY || !environment.E2E_SUPABASE_SERVICE_ROLE_KEY) {
  try {
    environment = { ...environment, ...localSupabaseEnvironment() };
  } catch {
    console.error("Start local Supabase with `supabase start`, or set all E2E_SUPABASE_* variables.");
    process.exit(1);
  }
}

if (!/^http:\/\/(127\.0\.0\.1|localhost):\d+$/.test(environment.E2E_SUPABASE_URL ?? "") ||
  !environment.E2E_SUPABASE_ANON_KEY || !environment.E2E_SUPABASE_SERVICE_ROLE_KEY) {
  console.error("End-to-end tests require a local Supabase URL, anon key, and service role key.");
  process.exit(1);
}

const result = spawnSync("node", ["node_modules/@playwright/test/cli.js", "test", ...process.argv.slice(2)], {
  env: environment,
  stdio: "inherit",
});
process.exit(result.status ?? 1);
