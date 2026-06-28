/**
 * best_score.spec.ts
 *
 * Playwright behavioral test: proves the TypeScript game reads the SAME
 * localStorage key the legacy parts/game_state.js wrote, so returning players
 * keep their best score after the migration.
 *
 * Key format (from src/game_state.ts getBestScoreKey, preserved from legacy):
 *   "ncaa-best-" + tierName.replace(/\s+/g, "-").toLowerCase()
 *   For tier "Major Conferences" -> "ncaa-best-major-conferences"
 *
 * Value shape (from src/game_state.ts saveBestScore / loadBestScore):
 *   Integer percentage (0-100) stored as a string, e.g. "100".
 *
 * Strategy:
 *   1. Seed localStorage["ncaa-best-major-conferences"] = "100" before page load.
 *   2. Play a perfect round (click correct dot for each school -> 1000 pts each).
 *   3. saveBestScore: pct(100) > existingPct(100) is false -> isNewBest = false.
 *   4. loadBestScore: returns 100 (the seeded legacy value, unchanged).
 *   5. #results-best-score reads "Best: 100%".
 *
 * Converse: if the new code used a DIFFERENT key, existingPct would be 0,
 * 100 > 0 is true, isNewBest = true, and the text would be "New Best! 100%".
 * The assertion "Best: 100%" (not "New Best!") is the behavioral gate.
 *
 * Determinism: the sidebar element with class "sidebar-current" always identifies
 * the active school's array index, which maps directly to data-school-index on
 * the SVG dot group. No guessing or hardcoded coordinates are needed.
 */

import { test, expect } from "@playwright/test";

// APP_URL is "/" because playwright.config.ts sets baseURL: "http://localhost:4321",
// which serves dist/ via Python http.server.  HTTP is required because Chromium blocks
// ES module scripts loaded from file:// (null origin) due to CORS policy.
const APP_URL = "/";

// localStorage key for tier "Major Conferences".
// Derived from getBestScoreKey() in src/game_state.ts:
//   "ncaa-best-" + "Major Conferences".replace(/\s+/g, "-").toLowerCase()
//   = "ncaa-best-major-conferences"
const LS_KEY = "ncaa-best-major-conferences";

// Seed 100% as the previous best (the format saveBestScore writes: integer pct as string).
// Round score will also be 100% (perfect play), so 100 > 100 is false -> not a new best.
// This means the display reads "Best: 100%" rather than "New Best! 100%", proving the
// seeded legacy key was read rather than a fresh save from this round.
const SEEDED_VALUE = "100";

// Safety cap above the largest possible tier size (All Division I has ~361 schools).
const MAX_QUESTIONS = 400;

test("results screen shows seeded legacy localStorage best score for returning players", async ({
  page,
}) => {
  // Seed localStorage BEFORE the page loads any scripts.
  // addInitScript runs in the browser context before main.js executes, so
  // localStorage is pre-populated when saveBestScore / loadBestScore run.
  await page.addInitScript(
    ({ key, value }: { key: string; value: string }) => {
      window.localStorage.setItem(key, value);
    },
    { key: LS_KEY, value: SEEDED_VALUE },
  );

  // Navigate to the built app.
  await page.goto(APP_URL);

  // Wait for the setup screen to be ready.
  await page.waitForSelector("#start-button");

  // "Major Conferences" is the first radio option and is pre-checked by default.
  // No need to click the radio; just start the game.
  await page.click("#start-button");

  // Wait for the first question to be ready: the sidebar marks the active school
  // with class "sidebar-current" after showNextQuestion() initializes the first round.
  await page.waitForSelector("#remaining-list li.sidebar-current");

  // Play through all questions by clicking the correct dot each time.
  // For each question:
  //   - sidebar-current li has data-school-index matching the correct SVG dot group.
  //   - Clicking the correct dot on the first attempt scores 1000 pts and auto-advances
  //     synchronously (no setTimeout delay; only all-3-wrong has a 2s delay).
  //   - After the last question the results screen appears immediately.
  for (let i = 0; i < MAX_QUESTIONS; i++) {
    // Check if the results screen appeared (happens after the last correct click).
    if (await page.locator("#results-screen").isVisible()) {
      break;
    }

    // Find the current question school index from the highlighted sidebar item.
    const currentLi = page.locator("#remaining-list li.sidebar-current");
    const schoolIndex = await currentLi.getAttribute("data-school-index");

    if (schoolIndex === null) {
      // sidebar-current may have just disappeared because results screen appeared.
      if (await page.locator("#results-screen").isVisible()) {
        break;
      }
      throw new Error(`Question ${String(i)}: sidebar-current element has no data-school-index`);
    }

    // Dispatch click directly on the SVG dot group to bypass hit-area overlap.
    // Schools that are geographically close have overlapping hit-area circles;
    // Playwright's standard click() fails when another element intercepts the pointer.
    // dispatchEvent fires the event directly on the element and bubbles it up to
    // #school-dots where handleDotClick is registered.  event.target.closest()
    // in the handler finds the correct school-dot-group from there.
    const dot = page.locator(`.school-dot-group[data-school-index="${schoolIndex}"]`);
    await dot.dispatchEvent("click");
  }

  // Results screen must be visible to proceed with the assertion.
  await expect(page.locator("#results-screen")).toBeVisible({ timeout: 5000 });

  // Assert the previous-best display on the results screen.
  //
  // With seeded "100" and a perfect round (also 100%):
  //   saveBestScore: 100 > 100 is false -> isNewBest = false
  //   loadBestScore: returns 100 (the seeded legacy value)
  //   #results-best-score text: "Best: 100%"
  //
  // If the code used a DIFFERENT key, existingPct would be 0, 100 > 0 is true,
  // isNewBest would be true, and the text would be "New Best! 100%" -- failing here.
  await expect(page.locator("#results-best-score")).toHaveText("Best: 100%");
});
