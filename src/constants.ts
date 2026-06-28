/**
 * Game constants and tier-filter helpers.
 *
 * SUBREGIONS is re-exported from the single source of truth in
 * src/data/schools_data.ts so callers import from one place.
 *
 * getSchoolsForTier / countSchoolsForTier port the identically-named
 * functions from parts/init.js.  Logic is reproduced exactly; the only
 * changes are TypeScript types, explicit return types, and a thrown Error
 * (fail-loud) when the requested tier name is not found.
 */

import type { NCAASchool } from "./types";
import { NCAA_SCHOOLS, DIFFICULTY_TIERS } from "./data_loader";

// Re-export SUBREGIONS so consumers can `import { SUBREGIONS } from "./constants"`
// without knowing the internal data path.
export { SUBREGIONS } from "./data/schools_data";

// ---------------------------------------------------------------------------
// Tier-filter helpers
// ---------------------------------------------------------------------------

/**
 * Return the subset of NCAA_SCHOOLS that belong to the named difficulty tier.
 *
 * Tier type mapping (mirrors parts/init.js exactly):
 *   "conference"  - include schools whose conference is in tier.values
 *   "subdivision" - include schools whose subdivision is in tier.values
 *   "all"         - include every school (copy of full array)
 *
 * @param tierName - The `name` field of a DifficultyTier entry.
 * @returns Filtered array of NCAASchool objects.
 * @throws Error if tierName does not match any entry in DIFFICULTY_TIERS.
 */
export function getSchoolsForTier(tierName: string): NCAASchool[] {
  for (const tier of DIFFICULTY_TIERS) {
    if (tier.name !== tierName) {
      continue;
    }
    // "all" tier - return every school
    if (tier.type === "all") {
      return NCAA_SCHOOLS.slice();
    }
    // "conference" tier - match school.conference against tier.values
    if (tier.type === "conference") {
      return NCAA_SCHOOLS.filter((school) => tier.values.includes(school.conference));
    }
    // "subdivision" tier - match school.subdivision against tier.values
    if (tier.type === "subdivision") {
      return NCAA_SCHOOLS.filter((school) => tier.values.includes(school.subdivision));
    }
  }
  // Tier name not found - fail loud rather than silently returning an empty list
  throw new Error(`getSchoolsForTier: unknown tier name "${tierName}"`);
}

/**
 * Return the count of schools that belong to the named difficulty tier.
 *
 * @param tierName - The `name` field of a DifficultyTier entry.
 * @returns Number of matching NCAASchool entries.
 * @throws Error (via getSchoolsForTier) if tierName is not found.
 */
export function countSchoolsForTier(tierName: string): number {
  return getSchoolsForTier(tierName).length;
}
