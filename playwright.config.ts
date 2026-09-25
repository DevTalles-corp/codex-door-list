import { defineConfig, devices } from "@playwright/test";

const port = 3100;

export default defineConfig({
  testDir: "./tests/e2e",
  fullyParallel: false,
  workers: 1,
  timeout: 120_000,
  expect: { timeout: 10_000 },
  reporter: process.env.CI ? "github" : "list",
  use: {
    ...devices["Desktop Chrome"],
    baseURL: `http://127.0.0.1:${port}`,
    timezoneId: "America/La_Paz",
    trace: "retain-on-failure",
  },
  webServer: [
    {
      command: "node tests/e2e/resend-server.mjs",
      url: "http://127.0.0.1:3101/health",
      reuseExistingServer: false,
      timeout: 10_000,
    },
    {
      command: `npm run dev -- --hostname 127.0.0.1 --port ${port}`,
      url: `http://127.0.0.1:${port}/organizador`,
      reuseExistingServer: false,
      timeout: 120_000,
      env: {
        NEXT_PUBLIC_SUPABASE_URL: process.env.E2E_SUPABASE_URL ?? "",
        NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY: process.env.E2E_SUPABASE_ANON_KEY ?? "",
        RESEND_API_KEY: "e2e-resend-key",
        RESEND_FROM_EMAIL: "Door List <tickets@example.test>",
        RESEND_BASE_URL: "http://127.0.0.1:3101",
      },
    },
  ],
});
