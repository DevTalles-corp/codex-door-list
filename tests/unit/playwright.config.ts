import path from "node:path";
import { defineConfig } from "@playwright/test";

export default defineConfig({
  testDir: ".",
  testMatch: "*.spec.ts",
  outputDir: "../../test-results/unit",
  tsconfig: path.join(__dirname, "tsconfig.json"),
  workers: 1,
  reporter: "list",
});
