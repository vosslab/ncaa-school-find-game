/**
 * Data parity gate (WP-data-parity).
 *
 * Imports the generated TypeScript data modules and compares them deep-equal
 * to the committed baseline JSON fixtures in baseline/. The baseline was
 * captured from the legacy parts/ JS sources before any migration; these
 * tests prove the regenerated TypeScript data equals the pre-migration state.
 *
 * This is a deliberate golden-fixture equality check: the baseline IS the
 * migration contract. When school or map data legitimately changes, regenerate
 * the baseline in the same patch so the fixture stays a live contract.
 *
 * Run: node --import tsx --test tests/test_data_parity.mjs
 */

import { test } from "node:test";
import { deepStrictEqual } from "node:assert/strict";
import { readFileSync } from "node:fs";

import { NCAA_SCHOOLS, DIFFICULTY_TIERS, SUBREGIONS } from "../src/data/schools_data.ts";
import { US_STATE_PATHS } from "../src/data/map_paths_data.ts";

// Resolve baseline paths relative to this file (ESM: no __dirname available).
const baselineDir = new URL("../baseline/", import.meta.url);

/**
 * Load and parse a baseline JSON fixture by filename.
 *
 * @param {string} filename - JSON filename inside baseline/
 * @returns {unknown} Parsed JSON value
 */
function loadBaseline(filename) {
  return JSON.parse(readFileSync(new URL(filename, baselineDir), "utf-8"));
}

test("NCAA_SCHOOLS matches baseline/schools.json", () => {
  const baseline = loadBaseline("schools.json");
  deepStrictEqual(NCAA_SCHOOLS, baseline);
});

test("DIFFICULTY_TIERS matches baseline/tiers.json", () => {
  const baseline = loadBaseline("tiers.json");
  deepStrictEqual(DIFFICULTY_TIERS, baseline);
});

test("SUBREGIONS matches baseline/subregions.json", () => {
  const baseline = loadBaseline("subregions.json");
  deepStrictEqual(SUBREGIONS, baseline);
});

test("US_STATE_PATHS matches baseline/state_paths.json", () => {
  const baseline = loadBaseline("state_paths.json");
  deepStrictEqual(US_STATE_PATHS, baseline);
});
