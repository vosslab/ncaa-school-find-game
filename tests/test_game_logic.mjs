/**
 * Pure-function logic tests for game state and constants modules.
 *
 * Tests haversineDistance, missPartialCredit, shuffleArray from src/game_state.ts
 * and getSchoolsForTier from src/constants.ts using node:test + node:assert/strict.
 *
 * All inputs are inline and self-contained.  No network calls.  Sub-second.
 *
 * Run: node --import tsx --test tests/test_game_logic.mjs
 */

import { test } from "node:test";
import { strictEqual, ok } from "node:assert/strict";

import { haversineDistance, missPartialCredit, shuffleArray } from "../src/game_state.ts";
import { getSchoolsForTier } from "../src/constants.ts";

// ---------------------------------------------------------------------------
// haversineDistance
// ---------------------------------------------------------------------------

test("haversineDistance: same point returns 0", () => {
  // Identical coordinates produce zero great-circle distance.
  const d = haversineDistance(35.6087, -77.3665, 35.6087, -77.3665);
  strictEqual(d, 0);
});

test("haversineDistance: Auburn to Alabama within 2 miles of 128", () => {
  // Auburn (32.6024 N, 85.487 W) to Alabama/Tuscaloosa (33.2098 N, 87.5692 W).
  // Hand-computed with R=3959 mi:
  //   dLat = 0.6074 deg, dLon = 2.0822 deg
  //   a = sin^2(dLat/2) + cos(lat1)*cos(lat2)*sin^2(dLon/2)
  //     = 0.000028 + 0.844*0.837*0.000330 = 0.000261
  //   c = 2*asin(sqrt(a)) = 0.03234 rad
  //   d = 3959 * 0.03234 = 128.1 miles
  // Expected ~128 miles, tolerance 2 miles.
  const d = haversineDistance(32.6024, -85.487, 33.2098, -87.5692);
  const expected = 128;
  ok(Math.abs(d - expected) < 2, `Expected ~${expected} miles, got ${d.toFixed(2)}`);
});

// ---------------------------------------------------------------------------
// missPartialCredit -- boundary mapping from src/game_state.ts docstring
// ---------------------------------------------------------------------------

test("missPartialCredit(0): returns 200 (closest possible wrong guess)", () => {
  // Source: Math.round(200 * (1 - 0/200)) = Math.round(200) = 200
  strictEqual(missPartialCredit(0), 200);
});

test("missPartialCredit(100): returns 100 (midpoint)", () => {
  // Source: Math.round(200 * (1 - 100/200)) = Math.round(100) = 100
  strictEqual(missPartialCredit(100), 100);
});

test("missPartialCredit(200): returns 0 (exactly at boundary)", () => {
  // Source: >= 200 guard fires, returns 0 before formula.
  strictEqual(missPartialCredit(200), 0);
});

test("missPartialCredit(300): returns 0 (beyond boundary)", () => {
  // Source: >= 200 guard fires, returns 0.
  strictEqual(missPartialCredit(300), 0);
});

// ---------------------------------------------------------------------------
// getSchoolsForTier -- behavioral properties, not exact counts
// ---------------------------------------------------------------------------

test("getSchoolsForTier: Major Conferences schools are a subset of FBS schools", () => {
  // Major Conferences tier includes only SEC, Big Ten, Big 12, ACC --
  // all of which are FBS-subdivision conferences.
  // Property: every shortName in Major Conferences also appears in FBS.
  const majorNames = new Set(getSchoolsForTier("Major Conferences").map((s) => s.shortName));
  const fbsNames = new Set(getSchoolsForTier("FBS").map((s) => s.shortName));
  for (const name of majorNames) {
    ok(fbsNames.has(name), `${name} is in Major Conferences but not FBS`);
  }
});

test("getSchoolsForTier: Alabama is in Major Conferences", () => {
  // Alabama is a confirmed SEC school (conference: "SEC") in schools_data.ts.
  // SEC is listed in the Major Conferences tier values.
  const names = getSchoolsForTier("Major Conferences").map((s) => s.shortName);
  ok(names.includes("Alabama"), "Alabama not found in Major Conferences tier");
});

test("getSchoolsForTier: throws on unknown tier name", () => {
  // getSchoolsForTier fails loudly for unknown tiers (no silent empty list).
  let threw = false;
  try {
    getSchoolsForTier("__nonexistent_tier__");
  } catch (_e) {
    threw = true;
  }
  ok(threw, "Expected getSchoolsForTier to throw for an unknown tier name");
});

// ---------------------------------------------------------------------------
// shuffleArray -- same multiset (order-independent equality)
// ---------------------------------------------------------------------------

test("shuffleArray: returns same multiset as input", () => {
  // Property: sorting input and output both produce identical sequences,
  // so no elements are added, removed, or duplicated by the shuffle.
  const input = [3, 1, 4, 1, 5, 9, 2, 6, 5, 3];
  const copy = input.slice();
  shuffleArray(copy);
  // Compare sorted versions to confirm same multiset.
  const sortedInput = input.slice().sort((a, b) => a - b);
  const sortedOutput = copy.slice().sort((a, b) => a - b);
  strictEqual(JSON.stringify(sortedOutput), JSON.stringify(sortedInput));
});
