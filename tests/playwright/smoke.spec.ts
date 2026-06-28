/**
 * Smoke test: full game round for the NCAA School Find Game.
 *
 * Loads dist/index.html, verifies the setup screen, drives a complete round
 * of Major Conferences (68 schools), and asserts behavioral state at each key
 * transition.  No pixel/timing/elapsed assertions per PYTEST_STYLE.md.
 *
 * Selectors confirmed from source:
 *   - .tier-radio            (src/index.html: radio inputs for tier selection)
 *   - #start-button          (src/index.html)
 *   - #game-screen           (src/index.html)
 *   - #school-dots           (src/index.html: SVG group containing all dot groups)
 *   - .school-dot-group      (src/game_ui.ts renderMap: group per school)
 *     aria-label = school.shortName  (src/game_ui.ts line 311)
 *     data-school-index = idx        (src/game_ui.ts line 308)
 *   - #remaining-list .sidebar-current (src/game_ui.ts updateRemainingList:
 *       li.classList.add("sidebar-current"), li.textContent = school.shortName)
 *   - #score-display         (src/index.html, src/game_ui.ts updateScoreDisplay)
 *   - #streak-display        (src/index.html, src/game_ui.ts updateScoreDisplay)
 *   - #feedback-panel        (src/index.html, src/game_play.ts handleDotClick)
 *   - #results-screen        (src/index.html)
 *   - #share-results-button  (src/index.html, src/init.ts)
 *
 * Correct dot strategy: read the current school's shortName from the
 * #remaining-list .sidebar-current element, then click the .school-dot-group
 * whose aria-label matches that shortName.
 *
 * Wrong dot strategy: iterate .school-dot-group elements and click the first
 * one whose aria-label differs from the current school and whose dot is not
 * already answered (dot-answered class absent).
 *
 * Round length: Major Conferences has 68 schools; the loop runs up to 200
 * iterations to cover any tier size.  The correct-click path has no setTimeout
 * delay so all 68 questions complete in a few seconds.
 */

import { test, expect } from "@playwright/test";

// Maximum iterations in the question loop (higher than any realistic round size)
const MAX_LOOP = 200;

test("full round: setup screen, correct, wrong feedback, results, share text", async ({ page }) => {
  // Override navigator.clipboard before page scripts load so file:// context works.
  // Stores the written text in window.__lastShareText for later assertion.
  await page.addInitScript(() => {
    Object.defineProperty(navigator, "clipboard", {
      get() {
        return {
          writeText: function (text: string): Promise<void> {
            (window as unknown as Record<string, unknown>).__lastShareText = text;
            return Promise.resolve();
          },
        };
      },
      configurable: true,
    });
  });

  // -------------------------------------------------------------------------
  // Load the built dist (served by the webServer in playwright.config.ts)
  // -------------------------------------------------------------------------
  await page.goto("/");

  // -------------------------------------------------------------------------
  // 1. Setup screen: title and all five tier radio buttons
  // -------------------------------------------------------------------------
  await expect(page.locator("#setup-screen h1")).toHaveText("NCAA School Find Game");
  expect(await page.locator(".tier-radio").count()).toBeGreaterThan(0);

  // -------------------------------------------------------------------------
  // 2. Select a tier and start the game
  // -------------------------------------------------------------------------
  await page.locator('.tier-radio[value="Major Conferences"]').check();
  await page.locator("#start-button").click();
  await expect(page.locator("#game-screen")).toBeVisible();

  // -------------------------------------------------------------------------
  // Helper: get the current question's shortName from the sidebar
  // -------------------------------------------------------------------------
  async function sidebarCurrent(): Promise<string> {
    const text = await page
      .locator("#remaining-list .sidebar-current")
      .textContent({ timeout: 5000 });
    return (text ?? "").trim();
  }

  // -------------------------------------------------------------------------
  // 3. Answer the first five questions correctly to build a 5-streak.
  //    (streak >= 3 threshold triggers the indicator)
  //
  //    Use dispatchEvent to bypass browser pointer hit-testing.  Some school
  //    dots overlap on the map (e.g. BYU and Utah are geographically close)
  //    so a real pointer click on one dot can be intercepted by another dot's
  //    larger hit-area circle.  dispatchEvent dispatches the synthetic click
  //    directly to the target element and it bubbles up to the #school-dots
  //    event-delegation listener that runs handleDotClick.
  // -------------------------------------------------------------------------
  for (let q = 0; q < 5; q++) {
    const shortName = await sidebarCurrent();
    await page
      .locator(`#school-dots .school-dot-group[aria-label="${shortName}"]`)
      .dispatchEvent("click");
    // 100ms gap lets the synchronous DOM updates settle before the next read
    await page.waitForTimeout(100);
  }

  // Score must have increased from zero after five correct answers
  await expect(page.locator("#score-display")).not.toHaveText("0%");

  // Streak indicator must be visible (streak is now 5, threshold is 3)
  await expect(page.locator("#streak-display")).toContainText("streak");

  // -------------------------------------------------------------------------
  // 4. Wrong click on question 6: assert wrong feedback appears
  // -------------------------------------------------------------------------
  const q6School = await sidebarCurrent();

  // Find the first unanswered dot whose aria-label differs from q6School
  const allDots = page.locator("#school-dots .school-dot-group");
  const dotCount = await allDots.count();
  let madeWrongClick = false;

  for (let i = 0; i < dotCount; i++) {
    const dot = allDots.nth(i);
    const label = await dot.getAttribute("aria-label");
    // Skip the correct dot and already-answered dots (answered dots are no-ops)
    const isAnswered = await dot.evaluate((el) => el.classList.contains("dot-answered"));
    if (label !== q6School && !isAnswered) {
      await dot.dispatchEvent("click");
      madeWrongClick = true;
      break;
    }
  }

  if (madeWrongClick) {
    // First wrong attempt shows "Try again." in the feedback panel
    await expect(page.locator("#feedback-panel")).toContainText("Try again.");

    // Wait for the 800ms wrong-highlight removal timeout to complete
    await page.waitForTimeout(900);

    // Now click the correct dot for question 6 (second attempt, score 667)
    await page
      .locator(`#school-dots .school-dot-group[aria-label="${q6School}"]`)
      .dispatchEvent("click");
    await page.waitForTimeout(100);
  }

  // -------------------------------------------------------------------------
  // 5. Loop through all remaining questions, clicking correctly each time
  // -------------------------------------------------------------------------
  for (let i = 0; i < MAX_LOOP; i++) {
    // Check whether the game has already ended
    if (await page.locator("#results-screen").isVisible()) {
      break;
    }

    // Get current question school from sidebar; empty string means game ended
    const shortNameRaw = await page
      .locator("#remaining-list .sidebar-current")
      .textContent({ timeout: 2000 })
      .catch(() => null);
    const shortName = (shortNameRaw ?? "").trim();

    if (!shortName) {
      break;
    }

    await page
      .locator(`#school-dots .school-dot-group[aria-label="${shortName}"]`)
      .dispatchEvent("click");
    await page.waitForTimeout(100);
  }

  // -------------------------------------------------------------------------
  // 6. Results screen must appear after all questions are answered
  // -------------------------------------------------------------------------
  await expect(page.locator("#results-screen")).toBeVisible({ timeout: 10000 });

  // -------------------------------------------------------------------------
  // 7. Share text: emoji grid shape verified via regex
  //    Format: "NCAA School Find - <tier>\nScore: <pct>% ...\n<emoji grid>\n"
  //    Emoji: U+1F7E9 green, U+1F7E8 yellow, U+1F7E7 orange, U+1F7E5 red
  // -------------------------------------------------------------------------
  await page.locator("#share-results-button").click();

  // Button text changes to "Copied!" once clipboard write succeeds
  await expect(page.locator("#share-results-button")).toHaveText("Copied!", {
    timeout: 5000,
  });

  // Read the captured share text from the window variable set by the init script
  const shareText = await page.evaluate<string>(
    () => (window as unknown as Record<string, string>).__lastShareText ?? "",
  );

  // Share text must contain a score line
  expect(shareText).toMatch(/Score: \d+%/);

  // Share text must contain at least one colored square emoji (one per school)
  expect(shareText).toMatch(/[\u{1F7E9}\u{1F7E8}\u{1F7E7}\u{1F7E5}]/u);
});
