import { defineConfig } from "@playwright/test";

/**
 * Playwright config for Proofkeeper's example/seed specs.
 *
 * The local runner (PlaywrightRunner) shells out to this. Traces are on so the
 * runner can attach a replayable trace per result — the evidence a reviewer
 * reads in a pull request instead of running the suite locally.
 */
export default defineConfig({
  testDir: "./examples",
  testMatch: ["**/*.spec.ts"],
  use: {
    baseURL: process.env.PROOFKEEPER_BASE_URL,
    trace: "on",
  },
  reporter: [["list"]],
});
