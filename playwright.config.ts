/// <reference types="node" />

/**
 * Playwright configuration for the NCAA School Find Game.
 *
 * Serves dist/ over HTTP (port 4321) using Python's built-in http.server so
 * that ES module scripts are not blocked by the file:// CORS restriction
 * that Chromium enforces on type="module" scripts from null origins.
 *
 * Run:
 *   npx playwright test tests/playwright/smoke.spec.ts
 */

import { defineConfig, devices } from "@playwright/test";

export default defineConfig({
  testDir: "./tests/playwright",
  // Allow tests more time since the full Major Conferences round (68 schools)
  // takes a few seconds of programmatic clicking
  timeout: 60000,
  use: {
    baseURL: "http://localhost:4321",
    // Headless by default (docs/PLAYWRIGHT_USAGE.md rule: never pass headless: false)
    headless: true,
  },
  projects: [
    {
      name: "chromium",
      use: { ...devices["Desktop Chrome"] },
    },
  ],
  // Start a static HTTP server serving the built dist/ directory before tests run
  webServer: {
    command: "python3 -m http.server 4321 --directory dist",
    url: "http://localhost:4321",
    // Reuse an already-running server in development; always start fresh in CI
    reuseExistingServer: !process.env["CI"],
  },
});
